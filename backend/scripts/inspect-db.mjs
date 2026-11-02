import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required to run this script');
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString });
  try {
    console.log('Connecting to Supabase...');
    const client = await pool.connect();
    console.log('Connected!');

    // 1. Check verified workers with accounts
    const usersRes = await client.query(`
      SELECT a.id, a.phone, a.email, a.status as account_status, u.full_name, wp.id as profile_id, wp.status as worker_status
      FROM auth_service.accounts a
      JOIN user_trust_service.users u ON a.id = u.id
      JOIN user_trust_service.worker_profiles wp ON wp.user_id = u.id
      WHERE wp.status = 'verified'
      LIMIT 10;
    `);
    console.log('\n--- VERIFIED WORKERS WITH ACCOUNTS ---');
    console.table(usersRes.rows);

    // 2. Check catalog services
    const servicesRes = await client.query(`
      SELECT id, name, category_id, is_active
      FROM catalog_service.services
      LIMIT 10;
    `);
    console.log('\n--- SERVICES ---');
    console.table(servicesRes.rows);

    // 3. Check service requests
    const requestsRes = await client.query(`
      SELECT id, request_code, customer_user_id, status, created_at
      FROM order_service.service_requests
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log('\n--- RECENT SERVICE REQUESTS ---');
    console.table(requestsRes.rows);

    // 4. Check orders
    const ordersRes = await client.query(`
      SELECT id, order_code, customer_user_id, worker_user_id, status, agreed_price, created_at
      FROM order_service.orders
      ORDER BY created_at DESC
      LIMIT 5;
    `);
    console.log('\n--- RECENT ORDERS ---');
    console.table(ordersRes.rows);

    client.release();
  } catch (err) {
    console.error('Database query error:', err);
  } finally {
    await pool.end();
  }
}

main();
