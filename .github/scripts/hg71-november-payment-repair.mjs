import { randomUUID } from 'node:crypto';

// Vietnam midnight: 01 November through 01 December 2026, end exclusive.
export const NOVEMBER_FROM = '2026-10-31T17:00:00.000Z';
export const DECEMBER_FROM = '2026-11-30T17:00:00.000Z';
const TARGET_ORDER = '6ea60c9d-3e44-43e9-b579-720a743dd9e9';
const RULE_ID = '6b854917-077a-4cbd-914e-3946efa12961';
const RATE = '10.00';

export async function repairNovember(client, options, env = process.env) {
  const { apply = false, actorId, operator, runId } = options;
  if (env.NODE_ENV !== 'development' || env.PAYOUT_MOCK_ENABLED !== 'true')
    throw new Error('This repair requires the explicitly enabled development sandbox');
  if (new URL(env.VNPAY_PAY_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html').hostname !== 'sandbox.vnpayment.vn')
    throw new Error('VNPAY must use its sandbox');
  if (!/^[0-9a-f-]{36}$/i.test(actorId || '') || !/^[A-Za-z0-9-]+$/.test(operator || '') || !/^\d+$/.test(runId || ''))
    throw new Error('Verified test account, workflow operator and run ID are required');
  const reason = `Owner approved 10% for November 2026 sandbox orders; requesting test account ${actorId}; GitHub operator ${operator}; run ${runId}`;
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('payment_service.commission_rules'))");
    const owner = await client.query(`
      SELECT customer_user_id::text AS customer_id FROM payment_service.payments WHERE order_id = $1::uuid
      UNION
      SELECT COALESCE(payload->'data', payload->'payload', payload)->>'customerUserId' AS customer_id
      FROM payment_service.failed_inbound_events
      WHERE COALESCE(payload->'data', payload->'payload', payload)->>'orderId' = $1::text`, [TARGET_ORDER]);
    if (!owner.rows.length || owner.rows.some(row => row.customer_id !== actorId))
      throw new Error('Requesting account does not match the affected test order');
    const overlapping = await client.query(`
      SELECT id, rate_percent::text, effective_from, effective_to
      FROM payment_service.commission_rules
      WHERE is_active AND effective_from < $2::timestamptz
        AND (effective_to IS NULL OR effective_to > $1::timestamptz)
      FOR UPDATE`, [NOVEMBER_FROM, DECEMBER_FROM]);
    let ruleId = RULE_ID;
    let created = false;
    if (overlapping.rows.length) {
      const rule = overlapping.rows[0];
      if (overlapping.rows.length !== 1 || Number(rule.rate_percent) !== 10
        || new Date(rule.effective_from).toISOString() !== NOVEMBER_FROM
        || !rule.effective_to || new Date(rule.effective_to).toISOString() !== DECEMBER_FROM)
        throw new Error('An existing financial rule overlaps the approved November interval');
      ruleId = rule.id;
    } else {
      const boundary = await client.query(`
        SELECT rate_percent::text FROM payment_service.commission_rules
        WHERE is_active AND effective_from = $1::timestamptz`, [DECEMBER_FROM]);
      if (boundary.rows.length !== 1 || Number(boundary.rows[0].rate_percent) !== 10)
        throw new Error('The reviewed December 10% rule changed; refusing a stale repair');
      await client.query(`
        INSERT INTO payment_service.commission_rules
          (id, rate_percent, effective_from, effective_to, created_by_user_id, description)
        VALUES ($1::uuid, $2::numeric, $3::timestamptz, $4::timestamptz, $5::uuid, $6)`,
      [ruleId, RATE, NOVEMBER_FROM, DECEMBER_FROM, actorId, reason]);
      await client.query(`
        INSERT INTO payment_service.admin_audit_logs
          (id, actor_user_id, action, entity_type, entity_id, after_state, reason)
        VALUES ($1::uuid, $2::uuid, 'commission_rule.sandbox_gap_repaired', 'commission_rule', $3, $4::jsonb, $5)`,
      [randomUUID(), actorId, ruleId, JSON.stringify({ ratePercent: RATE, effectiveFrom: NOVEMBER_FROM, effectiveTo: DECEMBER_FROM, operator, runId }), reason]);
      created = true;
    }
    // Preserve original event IDs and payloads. The normal inbox handlers create payments;
    // this operation never creates settlements or wallet postings.
    const replayed = await client.query(`
      WITH parsed AS (
        SELECT *, COALESCE(payload->'data', payload->'payload', payload) AS body
        FROM payment_service.failed_inbound_events
      ), november_orders AS (
        SELECT DISTINCT body->>'orderId' AS order_id FROM parsed
        WHERE event_type = 'order.created'
          AND (body->>'createdAt')::timestamptz >= $1::timestamptz
          AND (body->>'createdAt')::timestamptz < $2::timestamptz
      )
      UPDATE payment_service.failed_inbound_events f
      SET status = 'retrying', attempts = 0, next_retry_at = now(), updated_at = now()
      FROM parsed p JOIN november_orders n ON p.body->>'orderId' = n.order_id
      WHERE f.event_id = p.event_id AND p.status IN ('dead', 'retrying')
        AND p.event_type IN ('order.created', 'order.completed')
        AND p.last_error IN (
          'RetryableInboundError: No active commission rule is effective for the requested time',
          'RetryableInboundError: Payment for the completed order is not created yet')
        AND NOT EXISTS (SELECT 1 FROM payment_service.consumed_events c WHERE c.event_id = f.event_id)
      RETURNING f.event_id, f.event_type, p.status AS previous_status, n.order_id`, [NOVEMBER_FROM, DECEMBER_FROM]);
    for (const event of replayed.rows) {
      await client.query(`
        INSERT INTO payment_service.admin_audit_logs
          (id, actor_user_id, action, entity_type, entity_id, before_state, after_state, reason)
        VALUES ($1::uuid, $2::uuid, 'inbound.sandbox_replay_scheduled', 'inbound_event', $3, $4::jsonb, $5::jsonb, $6)`,
      [randomUUID(), actorId, event.event_id, JSON.stringify({ status: event.previous_status }), JSON.stringify({ status: 'retrying', orderId: event.order_id, operator, runId }), reason]);
    }
    await client.query(apply ? 'COMMIT' : 'ROLLBACK');
    return { applied: apply, ratePercent: RATE, effectiveFrom: NOVEMBER_FROM, effectiveTo: DECEMBER_FROM, ruleId, ruleCreated: created, replayScheduled: replayed.rows };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

if (process.env.HG71_REPAIR_RUN === '1') {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL_PAYMENT || process.env.DATABASE_URL, connectionTimeoutMillis: 10000, statement_timeout: 20000 });
  try {
    await client.connect();
    console.log(JSON.stringify(await repairNovember(client, {
      apply: process.env.HG71_REPAIR_APPLY === '1',
      actorId: process.env.HG71_REPAIR_ACTOR,
      operator: process.env.HG71_REPAIR_OPERATOR,
      runId: process.env.HG71_REPAIR_RUN_ID,
    })));
  } catch (error) {
    console.error('November sandbox repair failed:', error.code || error.name, error.position || '', error.routine || '', error.message?.startsWith('Requesting') || error.message?.startsWith('An existing') || error.message?.startsWith('The reviewed') ? error.message : 'transaction rolled back');
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
