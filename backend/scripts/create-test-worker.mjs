import pg from 'pg';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';


const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required in .env');
  process.exit(1);
}

const WORKER = {
  userId: 'a7d8c9e0-1122-4344-8566-778899aabbcc',
  accountId: 'a7d8c9e0-1122-4344-8566-778899aabbcd',
  workerProfileId: 'a7d8c9e0-1122-4344-8566-778899aabbce',
  fullName: 'Trần Thanh Huy',
  phone: '+84905123456',
  rawPhone: '0905123456',
  email: 'tranthanhhuy.tho@handygo.vn',
  password: 'Password123@',
  avatarUrl: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=400',
  averageRating: 4.9,
  ratingCount: 128,
  completedOrderCount: 562,
  orderCountTotal: 580,
};

async function setupWorker() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    console.log('🚀 Đang tạo tài khoản thợ full quyền...');
    await client.query('BEGIN');

    // 1. Password Hash
    const passwordHash = await bcrypt.hash(WORKER.password, 10);

    // 2. Standard Roles with correct names ('Worker' and 'Customer') and permissions
    const workerRoleId = '2f9964d7-df8f-4b48-978c-462912833e22'; // name: 'Worker', code: 'WORKER'
    const customerRoleId = '69090c57-e23b-414e-84d9-1e54214498d7'; // name: 'Customer', code: 'CUSTOMER'

    // 3. User in user_trust_service.users
    await client.query(`
      INSERT INTO user_trust_service.users (id, full_name, avatar_url, status, created_at, updated_at)
      VALUES ($1, $2, $3, 'active', NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        avatar_url = EXCLUDED.avatar_url,
        status = 'active',
        updated_at = NOW();
    `, [WORKER.userId, WORKER.fullName, WORKER.avatarUrl]);

    // 4. Clean up any existing account with same phone or email
    await client.query(`
      DELETE FROM auth_service.account_roles 
      WHERE account_id IN (
        SELECT id FROM auth_service.accounts 
        WHERE phone = $1 OR email = $2 OR user_id = $3
      );
    `, [WORKER.phone, WORKER.email, WORKER.userId]);

    await client.query(`
      DELETE FROM auth_service.accounts 
      WHERE phone = $1 OR email = $2 OR user_id = $3;
    `, [WORKER.phone, WORKER.email, WORKER.userId]);

    // 5. Account in auth_service.accounts
    await client.query(`
      INSERT INTO auth_service.accounts (
        id, user_id, email, phone, password_hash, status, email_verified_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW(), NOW());
    `, [WORKER.accountId, WORKER.userId, WORKER.email, WORKER.phone, passwordHash]);

    // 6. Assign both Worker and Customer roles
    await client.query(`
      INSERT INTO auth_service.account_roles (account_id, role_id, assigned_at)
      VALUES ($1, $2, NOW()), ($1, $3, NOW())
      ON CONFLICT (account_id, role_id) DO NOTHING;
    `, [WORKER.accountId, workerRoleId, customerRoleId]);

    // 7. CustomerProfile in user_trust_service.customer_profiles
    const customerProfileId = crypto.randomUUID();
    await client.query(`
      INSERT INTO user_trust_service.customer_profiles (id, user_id, bio, created_at, updated_at)
      VALUES ($1, $2, 'Khách hàng kiểm thử hệ thống HandyGo', NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING;
    `, [customerProfileId, WORKER.userId]);

    // 8. WorkerProfile in user_trust_service.worker_profiles
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
      WORKER.workerProfileId,
      WORKER.userId,
      WORKER.averageRating,
      WORKER.ratingCount,
      WORKER.completedOrderCount,
      WORKER.orderCountTotal,
    ]);

    // 8. Link to ALL active services in catalog
    const services = await client.query(`SELECT id, name FROM catalog_service.services WHERE is_active = true;`);
    for (const service of services.rows) {
      const offeringId = crypto.randomUUID();
      await client.query(`
        INSERT INTO user_trust_service.worker_service_offerings (
          id, worker_profile_id, service_id, title, description, experience_years, is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 5, true, NOW(), NOW())
        ON CONFLICT (worker_profile_id, service_id) DO UPDATE SET
          is_active = true,
          experience_years = 5,
          title = EXCLUDED.title,
          updated_at = NOW();
      `, [
        offeringId,
        WORKER.workerProfileId,
        service.id,
        `Chuyên gia kỹ thuật: ${service.name}`,
        `Kinh nghiệm 5 năm sửa chữa chuyên môn ${service.name}.`,
      ]);
    }

    await client.query('COMMIT');
    console.log('✅ TẠO TÀI KHOẢN THỢ THÀNH CÔNG!');
    console.log('--------------------------------------------------');
    console.log(`👤 Tên thợ      : ${WORKER.fullName}`);
    console.log(`📱 Số điện thoại: ${WORKER.rawPhone} (hoặc ${WORKER.phone})`);
    console.log(`🔑 Mật khẩu     : ${WORKER.password}`);
    console.log(`⭐ Trạng thái   : Active + Verified KYC (Full quyền)`);
    console.log(`🛠️ Dịch vụ      : Kích hoạt tất cả (${services.rowCount} dịch vụ)`);
    console.log(`🎯 Khớp Radar   : Có ID trùng khớp thợ số 1 trên Radar mobile!`);
    console.log('--------------------------------------------------');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

setupWorker();
