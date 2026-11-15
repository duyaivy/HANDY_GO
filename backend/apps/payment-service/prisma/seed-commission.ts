import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { Client } from 'pg';

export function seedConfig(env: NodeJS.ProcessEnv) {
  const actor = env.COMMISSION_SEED_ACTOR_ID?.trim();
  const from = env.COMMISSION_SEED_EFFECTIVE_FROM?.trim();
  if (
    !actor ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      actor,
    )
  ) {
    throw new Error(
      'COMMISSION_SEED_ACTOR_ID must identify an authorized, existing Admin/system actor (UUID)',
    );
  }
  if (
    !from ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      from,
    ) ||
    !Number.isFinite(Date.parse(from))
  ) {
    throw new Error(
      'COMMISSION_SEED_EFFECTIVE_FROM must be an explicit ISO timestamp with timezone',
    );
  }
  // Date.parse normalizes impossible calendar dates; reject those before connecting.
  const day = from.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day)
    throw new Error('Invalid rollout date');
  const connectionString = env.DATABASE_URL_PAYMENT || env.DATABASE_URL;
  if (
    !connectionString ||
    !['postgres:', 'postgresql:'].includes(new URL(connectionString).protocol)
  ) {
    throw new Error('Payment database URL is required');
  }
  return { actor, effectiveFrom: new Date(from), connectionString };
}

/** Controlled deployment operation, never called by application startup. No cross-service DB access. */
export async function seedCommission(env: NodeJS.ProcessEnv = process.env) {
  const config = seedConfig(env);
  const client = new Client({ connectionString: config.connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('payment_service.commission_rules'))",
    );
    const existing = await client.query(
      `SELECT id, rate_percent::text, created_by_user_id, is_active
       FROM payment_service.commission_rules WHERE effective_from = $1`,
      [config.effectiveFrom],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (
        existing.rowCount !== 1 ||
        Number(row.rate_percent) !== 10 ||
        row.created_by_user_id !== config.actor.toLowerCase() ||
        !row.is_active
      ) {
        throw new Error(
          'Existing rule conflicts with seed configuration; no changes made',
        );
      }
      await client.query('COMMIT');
      return { id: row.id as string, created: false };
    }
    // Bootstrap only: do not amend/version any existing financial rule or fill historical gaps.
    const count = await client.query(
      'SELECT 1 FROM payment_service.commission_rules LIMIT 1',
    );
    if (count.rowCount)
      throw new Error(
        'Commission rules already exist; use the Admin versioning API',
      );
    const id = randomUUID();
    await client.query(
      `INSERT INTO payment_service.commission_rules (id, rate_percent, effective_from, created_by_user_id, description)
       VALUES ($1, 10.00, $2, $3, 'Controlled initial 10% commission seed')`,
      [id, config.effectiveFrom, config.actor],
    );
    await client.query(
      `INSERT INTO payment_service.admin_audit_logs (id, actor_user_id, action, entity_type, entity_id, after_state, reason)
       VALUES ($1, $2, 'commission_rule.seeded', 'commission_rule', $3, $4::jsonb, 'Approved controlled rollout seed')`,
      [
        randomUUID(),
        config.actor,
        id,
        JSON.stringify({
          ratePercent: '10.00',
          effectiveFrom: config.effectiveFrom,
          createdByUserId: config.actor,
        }),
      ],
    );
    await client.query('COMMIT');
    return { id, created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  seedCommission()
    .then((result) => console.log(JSON.stringify(result)))
    .catch(() => {
      // Do not expose driver errors/connection strings. Validate configuration separately if needed.
      console.error(
        'Commission seed refused or failed. Check explicit rollout/actor configuration, existing rules and database availability. No partial seed was committed.',
      );
      process.exitCode = 1;
    });
}
