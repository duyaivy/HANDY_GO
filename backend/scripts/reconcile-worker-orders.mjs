import pg from 'pg';

const { Pool } = pg;

async function reconcile() {
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

      // 2. Query all orders from order_service.orders ordered chronologically
      console.log('Querying orders from order_service.orders...');
      const ordersRes = await client.query(`
        SELECT 
          id AS order_id,
          worker_user_id,
          status,
          completed_at,
          created_at
        FROM order_service.orders
        WHERE worker_user_id IS NOT NULL
        ORDER BY created_at ASC;
      `);

      console.log(`Found ${ordersRes.rows.length} total orders to reconcile.`);

      let newContributions = 0;
      let updatedContributions = 0;
      let alreadySynced = 0;
      const workerDeltas = new Map(); // workerUserId -> { deltaTotal: 0, deltaCompleted: 0 }

      for (const order of ordersRes.rows) {
        const { order_id, worker_user_id, status, completed_at } = order;
        const isCompleted = status === 'completed' || completed_at !== null;

        await client.query('BEGIN');

        try {
          // Check worker profile existence with row lock
          const profileCheck = await client.query(`
            SELECT id, user_id, completed_order_count, order_count_total
            FROM user_trust_service.worker_profiles
            WHERE user_id = $1 OR id = $1
            FOR UPDATE;
          `, [worker_user_id]);

          if (profileCheck.rows.length === 0) {
            // Worker profile might not be provisioned yet
            await client.query('ROLLBACK');
            continue;
          }

          const workerProfile = profileCheck.rows[0];

          // Check existing projection contribution with row lock
          const contribRes = await client.query(`
            SELECT order_id, worker_user_id, has_contributed_total, has_contributed_completed
            FROM user_trust_service.worker_order_contributions
            WHERE order_id = $1
            FOR UPDATE;
          `, [order_id]);

          let deltaTotal = 0;
          let deltaCompleted = 0;

          if (contribRes.rows.length === 0) {
            // First time this order is projected
            deltaTotal = 1;
            deltaCompleted = isCompleted ? 1 : 0;

            await client.query(`
              INSERT INTO user_trust_service.worker_order_contributions (
                order_id, worker_user_id, has_contributed_total, has_contributed_completed, created_at, updated_at
              ) VALUES ($1, $2, true, $3, NOW(), NOW());
            `, [order_id, workerProfile.user_id, isCompleted]);

            newContributions++;
          } else {
            const existing = contribRes.rows[0];
            if (isCompleted && !existing.has_contributed_completed) {
              deltaCompleted = 1;
              if (!existing.has_contributed_total) {
                deltaTotal = 1;
              }
              await client.query(`
                UPDATE user_trust_service.worker_order_contributions
                SET has_contributed_completed = true,
                    has_contributed_total = true,
                    updated_at = NOW()
                WHERE order_id = $1;
              `, [order_id]);
              updatedContributions++;
            } else if (!existing.has_contributed_total) {
              deltaTotal = 1;
              await client.query(`
                UPDATE user_trust_service.worker_order_contributions
                SET has_contributed_total = true,
                    updated_at = NOW()
                WHERE order_id = $1;
              `, [order_id]);
              updatedContributions++;
            } else {
              alreadySynced++;
            }
          }

          // Apply delta to worker profile atomically
          if (deltaTotal > 0 || deltaCompleted > 0) {
            await client.query(`
              UPDATE user_trust_service.worker_profiles
              SET 
                completed_order_count = completed_order_count + $1,
                order_count_total = GREATEST(order_count_total + $2, completed_order_count + $1),
                updated_at = NOW()
              WHERE id = $3;
            `, [deltaCompleted, deltaTotal, workerProfile.id]);

            const stats = workerDeltas.get(workerProfile.user_id) || { deltaTotal: 0, deltaCompleted: 0 };
            stats.deltaTotal += deltaTotal;
            stats.deltaCompleted += deltaCompleted;
            workerDeltas.set(workerProfile.user_id, stats);
          }

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`Error reconciling order ${order_id}:`, err);
        }
      }

      console.log('--- Reconciliation Summary ---');
      console.log(`New order contributions recorded: ${newContributions}`);
      console.log(`Updated order contributions: ${updatedContributions}`);
      console.log(`Already synchronized orders: ${alreadySynced}`);
      console.log(`Workers with updated counts: ${workerDeltas.size}`);
      for (const [wId, stats] of workerDeltas.entries()) {
        console.log(`  Worker ${wId}: +${stats.deltaCompleted} completed, +${stats.deltaTotal} total`);
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

reconcile();
