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
      console.log('Querying order counts per worker from order_service.orders...');
      const orderCountsRes = await client.query(`
        SELECT 
          worker_user_id,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
          COUNT(*)::int AS total_count
        FROM order_service.orders
        WHERE worker_user_id IS NOT NULL
        GROUP BY worker_user_id;
      `);

      console.log(`Found ${orderCountsRes.rows.length} workers with orders.`);

      for (const row of orderCountsRes.rows) {
        const { worker_user_id, completed_count, total_count } = row;

        const profileRes = await client.query(`
          SELECT user_id, completed_order_count, order_count_total
          FROM user_trust_service.worker_profiles
          WHERE user_id = $1
        `, [worker_user_id]);

        if (profileRes.rows.length === 0) {
          console.warn(`Worker profile not found for user_id ${worker_user_id}`);
          continue;
        }

        const profile = profileRes.rows[0];
        const currentCompleted = profile.completed_order_count ?? 0;
        const currentTotal = profile.order_count_total ?? 0;

        const targetCompleted = Math.max(currentCompleted, completed_count);
        const targetTotal = Math.max(currentTotal, total_count);

        if (targetCompleted !== currentCompleted || targetTotal !== currentTotal) {
          console.log(`[Updating] Worker ${worker_user_id}:`);
          console.log(`  completed_order_count: ${currentCompleted} -> ${targetCompleted} (actual orders: ${completed_count})`);
          console.log(`  order_count_total: ${currentTotal} -> ${targetTotal} (actual orders: ${total_count})`);

          await client.query(`
            UPDATE user_trust_service.worker_profiles
            SET 
              completed_order_count = $1,
              order_count_total = $2,
              updated_at = NOW()
            WHERE user_id = $3
          `, [targetCompleted, targetTotal, worker_user_id]);
        } else {
          console.log(`[Synced] Worker ${worker_user_id}: completed=${currentCompleted}, total=${currentTotal}`);
        }
      }

      console.log('Reconciliation completed successfully.');
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
