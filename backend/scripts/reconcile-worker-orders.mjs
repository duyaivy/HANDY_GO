import pg from 'pg';
import { pathToFileURL } from 'node:url';

const { Pool } = pg;

/**
 * Bootstraps and reconciles `worker_order_contributions` and `worker_profiles`
 * counters from `order_service.orders`.
 *
 * Safe for:
 * 1. First-time bootstrap when `worker_profiles` already holds historical counts
 *    and `worker_order_contributions` is empty (recomputes from projection, never double-adds).
 * 2. Repeated runs (idempotent upsert + exact projection recompute).
 * 3. Concurrent execution alongside live RabbitMQ consumers (acquires row lock on
 *    `worker_profiles` first, matching consumer lock order).
 */
export async function reconcileWorkerOrders(client) {
  // 1. Ensure projection table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_trust_service.worker_order_contributions (
      order_id UUID NOT NULL,
      worker_user_id UUID NOT NULL,
      has_contributed_total BOOLEAN NOT NULL DEFAULT false,
      has_contributed_completed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ(6) NOT NULL,
      CONSTRAINT worker_order_contributions_pkey PRIMARY KEY (order_id)
    );
    CREATE INDEX IF NOT EXISTS worker_order_contributions_worker_user_id_idx
    ON user_trust_service.worker_order_contributions(worker_user_id);
  `);

  // 2. Load all worker profiles to reconcile one worker at a time under row lock
  const profilesRes = await client.query(`
    SELECT id, user_id
    FROM user_trust_service.worker_profiles
    ORDER BY created_at ASC;
  `);

  let syncedOrders = 0;
  let updatedWorkers = 0;
  const summary = [];

  for (const profileRow of profilesRes.rows) {
    await client.query('BEGIN');
    try {
      // Lock worker_profiles row first (same order as live consumers to prevent deadlocks)
      const lockedProfileRes = await client.query(
        `
        SELECT id, user_id, completed_order_count, order_count_total
        FROM user_trust_service.worker_profiles
        WHERE id = $1
        FOR UPDATE;
        `,
        [profileRow.id],
      );

      if (lockedProfileRes.rows.length === 0) {
        await client.query('ROLLBACK');
        continue;
      }

      const workerProfile = lockedProfileRes.rows[0];

      // Fetch all source orders for this worker from order_service.orders
      const ordersRes = await client.query(
        `
        SELECT id AS order_id, status, completed_at
        FROM order_service.orders
        WHERE worker_user_id = $1 OR worker_user_id = $2
        ORDER BY created_at ASC;
        `,
        [workerProfile.user_id, workerProfile.id],
      );

      for (const order of ordersRes.rows) {
        const isCompleted =
          order.status === 'completed' || order.completed_at !== null;

        await client.query(
          `
          INSERT INTO user_trust_service.worker_order_contributions (
            order_id, worker_user_id, has_contributed_total, has_contributed_completed, created_at, updated_at
          ) VALUES ($1, $2, true, $3, NOW(), NOW())
          ON CONFLICT (order_id) DO UPDATE SET
            has_contributed_total = true,
            has_contributed_completed = user_trust_service.worker_order_contributions.has_contributed_completed OR EXCLUDED.has_contributed_completed,
            updated_at = NOW();
          `,
          [order.order_id, workerProfile.user_id, isCompleted],
        );
        syncedOrders++;
      }

      // Recompute authoritative counters from the contribution projection
      const countsRes = await client.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE has_contributed_total)::int AS total_count,
          COUNT(*) FILTER (WHERE has_contributed_completed)::int AS completed_count
        FROM user_trust_service.worker_order_contributions
        WHERE worker_user_id = $1;
        `,
        [workerProfile.user_id],
      );

      const totalCount = Number(countsRes.rows[0]?.total_count ?? 0);
      const completedCount = Number(countsRes.rows[0]?.completed_count ?? 0);
      const targetCompleted = completedCount;
      const targetTotal = Math.max(totalCount, completedCount);

      const prevCompleted = Number(workerProfile.completed_order_count ?? 0);
      const prevTotal = Number(workerProfile.order_count_total ?? 0);

      if (prevCompleted !== targetCompleted || prevTotal !== targetTotal) {
        await client.query(
          `
          UPDATE user_trust_service.worker_profiles
          SET completed_order_count = $1,
              order_count_total = $2,
              updated_at = NOW()
          WHERE id = $3;
          `,
          [targetCompleted, targetTotal, workerProfile.id],
        );
        updatedWorkers++;
        summary.push({
          workerUserId: workerProfile.user_id,
          prevCompleted,
          prevTotal,
          targetCompleted,
          targetTotal,
        });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`Error reconciling worker ${profileRow.user_id}:`, err);
      throw err;
    }
  }

  return {
    workersChecked: profilesRes.rows.length,
    syncedOrders,
    updatedWorkers,
    summary,
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('Connecting to database...');
    const client = await pool.connect();
    try {
      const result = await reconcileWorkerOrders(client);
      console.log('--- Reconciliation Summary ---');
      console.log(`Workers checked: ${result.workersChecked}`);
      console.log(`Orders synced into projection: ${result.syncedOrders}`);
      console.log(`Workers updated: ${result.updatedWorkers}`);
      for (const item of result.summary) {
        console.log(
          `  Worker ${item.workerUserId}: completed ${item.prevCompleted}->${item.targetCompleted}, total ${item.prevTotal}->${item.targetTotal}`,
        );
      }
      console.log('Projection-based reconciliation completed successfully.');
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Reconciliation error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  main();
}
