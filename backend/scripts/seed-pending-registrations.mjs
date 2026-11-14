import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required in .env');
  process.exit(1);
}

const SAMPLE_WORKERS = [
  {
    fullName: 'Lê Văn Hoàng',
    phone: '+84905111222',
    rawPhone: '0905111222',
    email: 'levanhoang.tho@handygo.vn',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    address: '120 Nguyễn Văn Linh, Quận Hải Châu, Đà Nẵng',
    latitude: 16.0612,
    longitude: 108.2175,
    radiusKm: 15,
    serviceKeyword: 'lạnh',
  },
  {
    fullName: 'Nguyễn Đình Phúc',
    phone: '+84905333444',
    rawPhone: '0905333444',
    email: 'nguyendinhphuc.tho@handygo.vn',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
    address: '45 Điện Biên Phủ, Quận Thanh Khê, Đà Nẵng',
    latitude: 16.0688,
    longitude: 108.1994,
    radiusKm: 12,
    serviceKeyword: 'điện',
  },
  {
    fullName: 'Phạm Minh Tuấn',
    phone: '+84905555666',
    rawPhone: '0905555666',
    email: 'phamminhtuan.tho@handygo.vn',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
    address: '88 Lê Duẩn, Quận Hải Châu, Đà Nẵng',
    latitude: 16.0718,
    longitude: 108.2198,
    radiusKm: 20,
    serviceKeyword: 'sửa',
  },
];

async function seedWorkerRegistrations() {
  const pool = new Pool({ connectionString });
  let client;

  try {
    client = await pool.connect();
    console.log('🚀 Đang kiểm tra danh mục và dịch vụ trong catalog_service...');
    const catRes = await client.query(`SELECT id, name FROM catalog_service.categories LIMIT 5;`);
    const svcRes = await client.query(`SELECT id, category_id, name FROM catalog_service.services WHERE is_active = true LIMIT 10;`);

    const availableServices = svcRes.rows;
    const availableCategories = catRes.rows;

    if (!availableCategories || availableCategories.length === 0) {
      throw new Error(
        'Catalog chưa có danh mục nào (categories empty). Vui lòng seed catalog_service trước khi chạy script.',
      );
    }

    if (!availableServices || availableServices.length === 0) {
      throw new Error(
        'Catalog chưa có dịch vụ nào đang hoạt động (services empty). Vui lòng seed catalog_service trước khi chạy script.',
      );
    }

    console.log(`Tìm thấy ${availableCategories.length} danh mục và ${availableServices.length} dịch vụ.`);

    await client.query('BEGIN');

    const createdRegistrations = [];

    for (let i = 0; i < SAMPLE_WORKERS.length; i++) {
      const w = SAMPLE_WORKERS[i];
      const userId = crypto.randomUUID();
      const workerProfileId = crypto.randomUUID();
      const registrationId = crypto.randomUUID();

      // 1. Tạo User trong user_trust_service.users
      await client.query(`
        INSERT INTO user_trust_service.users (id, full_name, avatar_url, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
      `, [userId, w.fullName, w.avatarUrl]);

      // 2. Tạo WorkerProfile trong user_trust_service.worker_profiles (ở trạng thái draft)
      await client.query(`
        INSERT INTO user_trust_service.worker_profiles (
          id, user_id, status, average_rating, rating_count, completed_order_count, order_count_total, created_at, updated_at
        )
        VALUES ($1, $2, 'draft', 5.0, 0, 0, 0, NOW(), NOW())
        ON CONFLICT (user_id) DO NOTHING;
      `, [workerProfileId, userId]);

      // Lấy danh mục và dịch vụ phù hợp từ catalog thực tế
      let matchedServices = availableServices.filter(s => s.name.toLowerCase().includes(w.serviceKeyword.toLowerCase()));
      if (matchedServices.length === 0) {
        const startIdx = (i * 2) % availableServices.length;
        matchedServices = availableServices.slice(startIdx, startIdx + 2);
      }
      if (matchedServices.length === 0) {
        matchedServices = [availableServices[0]];
      }

      const categoryIds = [...new Set(matchedServices.map(s => s.category_id).filter(Boolean))];
      if (categoryIds.length === 0) {
        categoryIds.push(availableCategories[0].id);
      }

      const servicesPayload = matchedServices.map((s, idx) => ({
        serviceId: s.id,
        serviceName: s.name,
        title: `Kỹ thuật viên: ${s.name}`,
        description: `Có đầy đủ chứng chỉ và dụng cụ chuyên dụng sửa ${s.name}`,
        experienceYears: 3 + idx * 2,
      }));

      const serviceAreaPayload = {
        address: w.address,
        latitude: w.latitude,
        longitude: w.longitude,
        radiusKm: w.radiusKm,
      };

      const evidenceFilesPayload = [
        {
          fileUrl: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800',
          fileType: 'image',
          title: 'Chứng chỉ hành nghề kỹ thuật',
        },
        {
          fileUrl: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=800',
          fileType: 'image',
          title: 'Hình ảnh thực tế thi công sửa chữa',
        },
      ];

      // 3. Tạo WorkerServiceRegistration ở trạng thái pending với version = 1
      await client.query(`
        INSERT INTO user_trust_service.worker_service_registrations (
          id, worker_profile_id, category_ids, services, service_area, evidence_files, idempotency_key, status, version, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', 1, NOW(), NOW());
      `, [
        registrationId,
        workerProfileId,
        JSON.stringify(categoryIds),
        JSON.stringify(servicesPayload),
        JSON.stringify(serviceAreaPayload),
        JSON.stringify(evidenceFilesPayload),
        crypto.randomUUID(),
      ]);

      createdRegistrations.push({
        registrationId,
        workerName: w.fullName,
        phone: w.rawPhone,
        address: w.address,
        serviceNames: servicesPayload.map(s => s.serviceName).join(', '),
      });
    }

    await client.query('COMMIT');

    console.log('\n================================================================');
    console.log('✅ ĐÃ TẠO THÀNH CÔNG 3 ĐƠN ĐĂNG KÝ DỊCH VỤ MẪU (STATUS: PENDING)');
    console.log('================================================================');
    createdRegistrations.forEach((reg, index) => {
      console.log(`\n📌 ĐƠN #${index + 1}:`);
      console.log(`   - Mã đơn (Registration ID) : ${reg.registrationId}`);
      console.log(`   - Tên thợ                  : ${reg.workerName}`);
      console.log(`   - Điện thoại liên hệ       : ${reg.phone}`);
      console.log(`   - Khu vực đăng ký          : ${reg.address}`);
      console.log(`   - Dịch vụ đăng ký          : ${reg.serviceNames}`);
      console.log(`   - Trạng thái               : PENDING (Chờ Admin duyệt)`);
    });
    console.log('\n================================================================');
  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        // ignore rollback error
      }
    }
    console.error('❌ Lỗi khi tạo dữ liệu:', err);
    process.exitCode = 1;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

seedWorkerRegistrations();
