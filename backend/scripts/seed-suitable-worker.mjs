import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required to run this script');
  process.exit(1);
}

export const WORKERS = [
  {
    userId: 'a7d8c9e0-1122-4344-8566-778899aabbcc',
    accountId: 'a7d8c9e0-1122-4344-8566-778899aabbcd',
    workerProfileId: 'a7d8c9e0-1122-4344-8566-778899aabbce',
    fullName: 'Trần Thanh Huy',
    phone: '0905123456',
    email: 'tranthanhhuy.tho@handygo.vn',
    avatarUrl: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=400',
    averageRating: 4.8,
    ratingCount: 128,
    completedOrderCount: 562,
    orderCountTotal: 580,
  },
  {
    userId: 'b8e9d0f1-2233-4455-9677-8899aabbccdd',
    accountId: 'b8e9d0f1-2233-4455-9677-8899aabbccde',
    workerProfileId: 'b8e9d0f1-2233-4455-9677-8899aabbccdf',
    fullName: 'Phạm Tuấn',
    phone: '0905123457',
    email: 'phamtuan.tho@handygo.vn',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    averageRating: 4.8,
    ratingCount: 95,
    completedOrderCount: 562,
    orderCountTotal: 585,
  },
  {
    userId: 'c9f0e1a2-3344-4566-a788-99aabbccddee',
    accountId: 'c9f0e1a2-3344-4566-a788-99aabbccdef0',
    workerProfileId: 'c9f0e1a2-3344-4566-a788-99aabbccdef1',
    fullName: 'Đỗ Gia Huy',
    phone: '0905123458',
    email: 'dogiahuy.tho@handygo.vn',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
    averageRating: 4.8,
    ratingCount: 110,
    completedOrderCount: 562,
    orderCountTotal: 580,
  },
];

async function seedAllWorkers() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    console.log('--- STARTING WORKER SEED FOR ALL 3 RADAR WORKERS ---');
    await client.query('BEGIN');

    // Ensure Role in auth_service.roles
    const roleRes = await client.query(`
      SELECT id FROM auth_service.roles WHERE code = 'Worker' LIMIT 1;
    `);
    let roleId = roleRes.rows[0]?.id;
    if (!roleId) {
      roleId = crypto.randomUUID();
      await client.query(`
        INSERT INTO auth_service.roles (id, code, name, created_at)
        VALUES ($1, 'Worker', 'Thợ đối tác HandyGo', NOW());
      `, [roleId]);
    }

    const services = await client.query(`
      SELECT id, name FROM catalog_service.services WHERE is_active = true;
    `);

    const emails = WORKERS.map((w) => w.email);
    await client.query(`
      DELETE FROM auth_service.account_roles WHERE account_id IN (
        SELECT id FROM auth_service.accounts WHERE email = ANY($1::text[])
      )
    `, [emails]);
    await client.query(`
      DELETE FROM auth_service.accounts WHERE email = ANY($1::text[])
    `, [emails]);

    for (const worker of WORKERS) {
      // 1. Ensure User in user_trust_service.users
      await client.query(`
        INSERT INTO user_trust_service.users (id, full_name, avatar_url, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          avatar_url = EXCLUDED.avatar_url,
          status = 'active',
          updated_at = NOW();
      `, [worker.userId, worker.fullName, worker.avatarUrl]);

      // 2. Ensure Account in auth_service.accounts
      await client.query(`
        INSERT INTO auth_service.accounts (id, user_id, email, phone, password_hash, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, '$2b$10$abcdefghijklmnopqrstuvwxyz123456', 'active', NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          status = 'active',
          updated_at = NOW();
      `, [worker.accountId, worker.userId, worker.email, worker.phone]);

      // 3. Ensure AccountRole
      await client.query(`
        INSERT INTO auth_service.account_roles (account_id, role_id, assigned_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (account_id, role_id) DO NOTHING;
      `, [worker.accountId, roleId]);

      // 4. Ensure WorkerProfile in user_trust_service.worker_profiles
      await client.query(`
        INSERT INTO user_trust_service.worker_profiles (
          id, user_id, status, average_rating, rating_count, completed_order_count, order_count_total,
          verified_at, approved_at, created_at, updated_at
        )
        VALUES ($1, $2, 'verified', $3, $4, $5, $6, NOW(), NOW(), NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          status = 'verified',
          average_rating = EXCLUDED.average_rating,
          rating_count = EXCLUDED.rating_count,
          completed_order_count = EXCLUDED.completed_order_count,
          order_count_total = EXCLUDED.order_count_total,
          verified_at = NOW(),
          approved_at = NOW(),
          updated_at = NOW();
      `, [
        worker.workerProfileId,
        worker.userId,
        worker.averageRating,
        worker.ratingCount,
        worker.completedOrderCount,
        worker.orderCountTotal,
      ]);

      // 5. Link to ALL services in catalog_service.services
      for (const service of services.rows) {
        const offeringId = crypto.randomUUID();
        await client.query(`
          INSERT INTO user_trust_service.worker_service_offerings (
            id, worker_profile_id, service_id, title, description, experience_years, is_active, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, 6, true, NOW(), NOW())
          ON CONFLICT (worker_profile_id, service_id) DO UPDATE SET
            is_active = true,
            experience_years = 6,
            title = EXCLUDED.title,
            updated_at = NOW();
        `, [
          offeringId,
          worker.workerProfileId,
          service.id,
          `Chuyên gia kỹ thuật: ${service.name}`,
          `Kinh nghiệm 6 năm sửa chữa, thi công nhanh, bảo hành chu đáo chuyên môn ${service.name}.`,
        ]);
      }

      console.log(`✔ Worker ${worker.fullName} (${worker.userId}) fully seeded and verified.`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 TẤT CẢ 3 THỢ TRÊN RADAR ĐÃ ĐƯỢC SEED THÀNH CÔNG VÀO HỆ THỐNG!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedAllWorkers();
