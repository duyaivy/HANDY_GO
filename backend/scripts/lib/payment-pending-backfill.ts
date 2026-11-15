import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export interface ReviewedPayment {
  paymentId: string;
  downstreamState: 'awaiting_payment';
  evidence: string;
  checkedAt: string;
}

export interface BackfillOptions {
  apply?: boolean;
  runId?: string;
  actorId?: string;
  reason?: string;
  cutoff: Date;
  batchSize?: number;
  after?: string;
  paymentIds?: string[];
  reviewed?: ReviewedPayment[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function inspect(client: PoolClient, paymentId: string, lock: boolean) {
  const result = await client.query(
    `SELECT * FROM payment_service.payments WHERE id = $1::uuid ${lock ? 'FOR UPDATE' : ''}`,
    [paymentId],
  );
  const payment = result.rows[0];
  if (!payment || !payment.order_completed_at)
    return { outcome: 'no_longer_completed' };
  // Published, retrying and failed events all count. Replay an existing event
  // through the audited operations endpoint instead of creating a new identity.
  const events = await client.query(
    `SELECT id, status, event_type FROM payment_service.outbox_events
     WHERE aggregate_type = 'payment' AND aggregate_id = $1::uuid
       AND event_type IN ('payment.pending', 'payment.succeeded', 'payment.refunded', 'payment.cancelled')
     ORDER BY created_at, id`,
    [paymentId],
  );
  const pending = events.rows.find(
    (row) => row.event_type === 'payment.pending',
  );
  if (pending)
    return {
      outcome: 'existing_event',
      eventId: pending.id,
      eventStatus: pending.status,
    };
  const settlement = await client.query(
    `SELECT 1 FROM payment_service.payment_settlements WHERE payment_id = $1::uuid AND status = 'settled'`,
    [paymentId],
  );
  if (
    (!['pending', 'failed'].includes(payment.status) &&
      payment.status !== 'processing') ||
    payment.paid_at ||
    settlement.rowCount ||
    events.rowCount
  ) {
    return {
      outcome: 'terminal_requires_review',
      paymentStatus: payment.status,
    };
  }
  const attempts = await client.query(
    `SELECT 1 FROM payment_service.payment_attempts WHERE payment_id = $1::uuid AND status IN ('pending', 'processing', 'succeeded')`,
    [paymentId],
  );
  if (payment.status === 'processing' || attempts.rowCount) {
    return {
      outcome: 'processing_requires_review',
      paymentStatus: payment.status,
    };
  }
  return { outcome: 'candidate', paymentStatus: payment.status, payment };
}

/** A single resumable batch. Apply rechecks every candidate under its Payment lock. */
export async function backfillPaymentPending(
  pool: Pool,
  options: BackfillOptions,
) {
  const runId = options.runId ?? randomUUID();
  const batchSize = options.batchSize ?? 100;
  if (
    !UUID.test(runId) ||
    !Number.isFinite(options.cutoff.getTime()) ||
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 1000 ||
    (options.after && !UUID.test(options.after)) ||
    options.paymentIds?.some((id) => !UUID.test(id))
  ) {
    throw new Error(
      'Invalid run ID, cutoff, cursor, payment ID or batch size (1..1000)',
    );
  }
  const reviewed = new Map<string, ReviewedPayment>();
  for (const row of options.reviewed ?? []) {
    if (
      !UUID.test(row.paymentId) ||
      row.downstreamState !== 'awaiting_payment' ||
      !row.evidence?.trim() ||
      !Number.isFinite(Date.parse(row.checkedAt)) ||
      Date.parse(row.checkedAt) > Date.now() ||
      reviewed.has(row.paymentId.toLowerCase())
    ) {
      throw new Error(
        'Reviewed manifest requires unique payment IDs and dated downstream evidence',
      );
    }
    reviewed.set(row.paymentId.toLowerCase(), {
      ...row,
      paymentId: row.paymentId.toLowerCase(),
    });
  }
  if (
    options.apply &&
    (!options.actorId ||
      !UUID.test(options.actorId) ||
      !options.reason?.trim() ||
      !reviewed.size)
  ) {
    throw new Error(
      'Apply requires actor UUID, reason and a reviewed downstream manifest',
    );
  }
  const ids = options.apply
    ? [...reviewed.keys()]
    : (options.paymentIds ?? null);
  const selected = await pool.query<{ id: string }>(
    `SELECT id FROM payment_service.payments
     WHERE order_completed_at IS NOT NULL AND order_completed_at <= $1 AND created_at <= $1
       AND ($2::uuid IS NULL OR id > $2::uuid)
       AND ($3::uuid[] IS NULL OR id = ANY($3::uuid[])) ORDER BY id LIMIT $4`,
    [options.cutoff, options.after ?? null, ids, batchSize],
  );
  const results: Array<Record<string, unknown>> = [];
  for (const { id } of selected.rows) {
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query(options.apply ? 'BEGIN' : 'BEGIN READ ONLY');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '15s'");
      const state = await inspect(client, id, !!options.apply);
      const { payment, ...details } = state;
      if (state.outcome !== 'candidate' || !options.apply) {
        await client.query('COMMIT');
        results.push({ paymentId: id, ...details });
        continue;
      }
      const eventId = randomUUID();
      // Same v1 payload as paymentPendingEvent; contract equality is covered by
      // the integration suite. This CLI has no Nest/alias/bootstrap dependency.
      const payload = {
        source: 'payment-service',
        paymentId: id,
        orderId: payment.order_id,
        payerId: payment.customer_user_id,
        customerUserId: payment.customer_user_id,
        workerUserId: payment.worker_user_id,
        amount: String(payment.amount),
        currency: 'VND',
        method: payment.method,
      };
      await client.query(
        `INSERT INTO payment_service.outbox_events
         (id, aggregate_type, aggregate_id, event_type, event_version, payload)
         VALUES ($1::uuid, 'payment', $2::uuid, 'payment.pending', 1, $3::jsonb)`,
        [eventId, id, JSON.stringify(payload)],
      );
      await client.query(
        `INSERT INTO payment_service.admin_audit_logs
         (id, actor_user_id, action, entity_type, entity_id, before_state, after_state, reason)
         VALUES ($1::uuid, $2::uuid, 'payment.pending.backfill', 'payment', $3, $4::jsonb, $5::jsonb, $6)`,
        [
          randomUUID(),
          options.actorId,
          id,
          JSON.stringify({
            runId,
            status: payment.status,
            orderCompletedAt: payment.order_completed_at,
            review: reviewed.get(id),
          }),
          JSON.stringify({ runId, eventId }),
          options.reason,
        ],
      );
      await client.query('COMMIT');
      results.push({ paymentId: id, outcome: 'backfilled', eventId });
    } catch (error) {
      await client?.query('ROLLBACK').catch(() => undefined);
      // Never serialize connection strings or arbitrary DB error details.
      results.push({
        paymentId: id,
        outcome: 'failed',
        code: (error as { code?: string }).code ?? 'UNKNOWN',
      });
    } finally {
      client?.release();
    }
  }
  const counts: Record<string, number> = {};
  for (const result of results)
    counts[String(result.outcome)] = (counts[String(result.outcome)] ?? 0) + 1;
  const found = new Set(selected.rows.map((row) => row.id));
  return {
    runId,
    mode: options.apply ? 'apply' : 'dry-run',
    cutoff: options.cutoff.toISOString(),
    scanned: results.length,
    counts,
    results,
    // Supply the same cutoff/manifest on the next batch. Rows before the cursor
    // are already accounted for; failed rows can be retried in a fresh run.
    nextCursor: selected.rows.at(-1)?.id ?? options.after ?? null,
    hasMore: selected.rows.length === batchSize,
    notSelected: ids?.filter((id) => !found.has(id)) ?? [],
  };
}
