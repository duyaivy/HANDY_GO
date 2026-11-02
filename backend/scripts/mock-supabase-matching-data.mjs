import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set!");
  process.exit(1);
}

const client = new Client({ connectionString: DATABASE_URL });

async function run() {
  await client.connect();
  console.log("Connected to Supabase PostgreSQL.");

  try {
    await client.query('BEGIN');

    // 1. Service Definition: Vệ sinh máy lạnh
    const serviceId = 'a26e3c78-f202-4ec0-a2f9-2462371d05a4';
    const repairServiceId = '34ec7df5-20db-401e-804a-6feee5b48184';

    // Verify service exists
    const serviceCheck = await client.query(
      'SELECT id, name FROM catalog_service.services WHERE id = $1',
      [serviceId]
    );
    console.log("Verified Service:", serviceCheck.rows[0]);

    // 2. Customer: 9b364a7f-b818-41a6-b0ef-59ff10af8598
    const customerUserId = '9b364a7f-b818-41a6-b0ef-59ff10af8598';
    await client.query(`
      UPDATE user_trust_service.users
      SET full_name = 'Nguyễn Văn An (Customer)', status = 'active'::user_trust_service.user_status, updated_at = NOW()
      WHERE id = $1
    `, [customerUserId]);

    // 3. Service Request in order_service & matching_service
    const testRequestId = 'a0000000-0000-4000-8000-000000000001';
    const requestCode = 'REQ-20261025-AIRCON';
    const requestLat = 16.060000;
    const requestLon = 108.210000;
    const description = 'Cần vệ sinh 2 máy lạnh Daikin Inverter và kiểm tra nạp gas tại nhà, máy bị chảy nước và có mùi hôi.';
    const addressText = '254 Nguyễn Văn Linh, Phường Thạc Gián, Quận Thanh Khê, Đà Nẵng';

    // Upsert into order_service.service_requests
    await client.query(`
      INSERT INTO order_service.service_requests (
        id, request_code, customer_user_id, service_id, description, address_text,
        latitude, longitude, status, matching_revision, version, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'open_for_bidding'::order_service."RequestStatus", 1, 1, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        customer_user_id = EXCLUDED.customer_user_id,
        service_id = EXCLUDED.service_id,
        description = EXCLUDED.description,
        address_text = EXCLUDED.address_text,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        status = 'open_for_bidding'::order_service."RequestStatus",
        matching_revision = 1,
        updated_at = NOW()
    `, [testRequestId, requestCode, customerUserId, serviceId, description, addressText, requestLat, requestLon]);

    // Upsert into matching_service.service_request_projections
    await client.query(`
      INSERT INTO matching_service.service_request_projections (
        id, request_code, customer_user_id, service_id, description, address_text,
        latitude, longitude, status, matching_revision, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'open_for_bidding', 1, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        customer_user_id = EXCLUDED.customer_user_id,
        service_id = EXCLUDED.service_id,
        description = EXCLUDED.description,
        address_text = EXCLUDED.address_text,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        status = 'open_for_bidding',
        matching_revision = 1,
        updated_at = NOW()
    `, [testRequestId, requestCode, customerUserId, serviceId, description, addressText, requestLat, requestLon]);

    console.log("Upserted ServiceRequest and ServiceRequestProjection:", testRequestId);

    // 4. Configure Workers
    const workersConfig = [
      {
        userId: '067399f4-197a-4d11-a32d-74f1efebd55a', // Test worker in .env
        profileId: '28259b83-34f1-4a5c-8026-5dd48512d082',
        fullName: 'Trần Minh Hoàng (Thợ Điện Lạnh Pro)',
        status: 'verified',
        rating: 4.92,
        ratingCount: 48,
        completedCount: 45,
        offeringTitle: 'Chuyên vệ sinh máy lạnh Inverter Daikin Panasonic, nạp gas R32',
        offeringDesc: 'Kinh nghiệm bảo dưỡng máy lạnh hơn 7 năm. Vệ sinh sạch sâu dàn nóng dàn lạnh, nạp gas chuẩn.',
        experienceYears: 7,
        centerLat: 16.061000,
        centerLon: 108.209000,
        radiusKm: 12.0,
        kycStatus: 'approved',
        note: 'Worker 1 - Top Candidate (0.15km, 4.92 rating, 7 yrs exp)'
      },
      {
        userId: '31efac5f-6c66-46b6-9aa9-13e7cf9a804c',
        profileId: '98b3b51d-0090-48d6-9996-23042eab4792',
        fullName: 'Nguyễn Văn Nghĩa',
        status: 'verified',
        rating: 4.85,
        ratingCount: 30,
        completedCount: 28,
        offeringTitle: 'Dịch vụ bảo trì và vệ sinh máy lạnh dân dụng, xử lý máy lạnh chảy nước',
        offeringDesc: 'Chuyên vệ sinh bảo trì định kỳ, tháo lắp điều hòa và xử lý mùi hôi.',
        experienceYears: 5,
        centerLat: 16.075000,
        centerLon: 108.215000,
        radiusKm: 10.0,
        kycStatus: 'approved',
        note: 'Worker 2 - High Rank (1.7km, 4.85 rating, 5 yrs exp)'
      },
      {
        userId: '4bb6e3d4-6b59-4ee7-b28a-a4f436234328',
        profileId: '8922fea1-f905-4c0b-949a-645d734b4ca4',
        fullName: 'Trần Quốc Bảo',
        status: 'verified',
        rating: 4.70,
        ratingCount: 18,
        completedCount: 16,
        offeringTitle: 'Vệ sinh máy lạnh, sửa chữa máy lạnh không lạnh, thay tụ và nạp gas',
        offeringDesc: 'Có mặt sau 30 phút, kiểm tra miễn phí áp suất gas và dòng điện.',
        experienceYears: 4,
        centerLat: 16.045000,
        centerLon: 108.210000,
        radiusKm: 8.0,
        kycStatus: 'approved',
        note: 'Worker 3 - Solid Rank (1.67km, 4.70 rating, 4 yrs exp)'
      },
      {
        userId: 'b67611dc-2ba4-417f-9972-4fdcb23c8e81',
        profileId: 'aaeb2f6e-567a-422a-8dd2-f05e6869be5e',
        fullName: 'Nguyễn Minh Anh',
        status: 'verified',
        rating: 4.90,
        ratingCount: 4,
        completedCount: 4,
        offeringTitle: 'Kỹ thuật viên điện lạnh - Vệ sinh và bảo dưỡng máy lạnh nhanh 24/7',
        offeringDesc: 'Dịch vụ uy tín, cẩn thận, dọn dẹp sạch sẽ sau khi thi công.',
        experienceYears: 3,
        centerLat: 16.080000,
        centerLon: 108.220000,
        radiusKm: 15.0,
        kycStatus: 'approved',
        note: 'Worker 4 - Cold-start high potential (2.45km, 4.90 rating, 4 reviews)'
      },
      {
        userId: '1377604f-84e3-46d7-bae2-0c1c862bd021',
        profileId: '754f46bb-e7ca-4a9a-86be-79851fdf77b2',
        fullName: 'Lê Thu Hà',
        status: 'verified',
        rating: 4.50,
        ratingCount: 12,
        completedCount: 10,
        offeringTitle: 'Nhận vệ sinh máy lạnh gia đình, bảo dưỡng máy giặt và tủ lạnh',
        offeringDesc: 'Làm việc tận tâm, vệ sinh sạch từng cánh quạt lồng sóc và máng nước.',
        experienceYears: 2,
        centerLat: 16.020000,
        centerLon: 108.190000,
        radiusKm: 10.0,
        kycStatus: 'approved',
        note: 'Worker 5 - Moderate distance (4.93km, 4.50 rating)'
      },
      {
        userId: '960ef1c9-e074-4bdb-8647-a8dc4d94a168',
        profileId: '37fa8a10-e3bf-4b05-9052-c37f80d9bdeb',
        fullName: 'Nguyễn Văn Bình',
        status: 'verified',
        rating: 4.60,
        ratingCount: 15,
        completedCount: 14,
        offeringTitle: 'Sửa chữa và vệ sinh máy lạnh cơ điện lạnh',
        offeringDesc: 'Trang thiết bị xịt áp lực hiện đại, bạt hứng nước chuyên nghiệp.',
        experienceYears: 5,
        centerLat: 15.980000,
        centerLon: 108.250000,
        radiusKm: 12.0,
        kycStatus: 'approved',
        note: 'Worker 6 - Border of distance (9.8km <= 12km radius)'
      },
      // Ineligible Gate Test 1: KYC Unapproved
      {
        userId: '254c73f3-0e6b-4cf0-86b7-341b6906c796',
        profileId: '8dba02f4-18e3-4176-96ef-627bffffc84c',
        fullName: 'Hoàng Đức Thịnh (KYC Chưa Duyệt)',
        status: 'draft',
        rating: 4.00,
        ratingCount: 5,
        completedCount: 5,
        offeringTitle: 'Vệ sinh máy lạnh giá rẻ',
        offeringDesc: 'Nhận làm buổi tối và cuối tuần.',
        experienceYears: 1,
        centerLat: 16.060000,
        centerLon: 108.210000,
        radiusKm: 10.0,
        kycStatus: 'submitted', // Not approved!
        note: 'Worker 7 - Ineligible (KYC submitted only)'
      },
      // Ineligible Gate Test 2: Outside Service Area (HCM vs Danang)
      {
        userId: 'd7d31baf-714d-40c3-b3ab-70926246f284',
        profileId: 'a04c0be0-25af-4583-bbb6-ba7191d7f14d',
        fullName: 'Đặng Quốc Huy (Ở TP. Hồ Chí Minh)',
        status: 'verified',
        rating: 4.95,
        ratingCount: 50,
        completedCount: 50,
        offeringTitle: 'Vệ sinh máy lạnh HCM',
        offeringDesc: 'Chuyên khu vực Quận 1, Quận 3.',
        experienceYears: 6,
        centerLat: 10.776900,
        centerLon: 106.700900, // HCM coordinates!
        radiusKm: 10.0,
        kycStatus: 'approved',
        note: 'Worker 8 - Ineligible (Distance ~600km, outside area)'
      }
    ];

    for (const w of workersConfig) {
      // 4.1 Update user
      await client.query(`
        UPDATE user_trust_service.users
        SET full_name = $1, status = 'active'::user_trust_service.user_status, updated_at = NOW()
        WHERE id = $2
      `, [w.fullName, w.userId]);

      // 4.2 Update worker profile
      await client.query(`
        UPDATE user_trust_service.worker_profiles
        SET status = $1::user_trust_service.worker_status,
            average_rating = $2,
            rating_count = $3,
            completed_order_count = $4,
            order_count_total = $4,
            verified_at = CASE WHEN $1 = 'verified' THEN NOW() ELSE NULL END,
            approved_at = CASE WHEN $1 = 'verified' THEN NOW() ELSE NULL END,
            updated_at = NOW()
        WHERE id = $5
      `, [w.status, w.rating, w.ratingCount, w.completedCount, w.profileId]);

      // 4.3 Clean & Insert WorkerServiceOffering
      await client.query(`
        DELETE FROM user_trust_service.worker_service_offerings
        WHERE worker_profile_id = $1 AND service_id = $2
      `, [w.profileId, serviceId]);

      await client.query(`
        INSERT INTO user_trust_service.worker_service_offerings (
          id, worker_profile_id, service_id, title, description,
          experience_years, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, true, NOW(), NOW()
        )
      `, [w.profileId, serviceId, w.offeringTitle, w.offeringDesc, w.experienceYears]);

      // Also add secondary service for multi-skill
      await client.query(`
        DELETE FROM user_trust_service.worker_service_offerings
        WHERE worker_profile_id = $1 AND service_id = $2
      `, [w.profileId, repairServiceId]);

      await client.query(`
        INSERT INTO user_trust_service.worker_service_offerings (
          id, worker_profile_id, service_id, title, description,
          experience_years, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, true, NOW(), NOW()
        )
      `, [w.profileId, repairServiceId, 'Sửa máy lạnh và khắc phục sự cố', 'Sửa máy lạnh', w.experienceYears]);

      // 4.4 Clean & Insert WorkerServiceArea
      await client.query(`
        DELETE FROM user_trust_service.worker_service_areas
        WHERE worker_profile_id = $1
      `, [w.profileId]);

      await client.query(`
        INSERT INTO user_trust_service.worker_service_areas (
          id, worker_profile_id, latitude, longitude, radius_km, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, true, NOW(), NOW()
        )
      `, [w.profileId, w.centerLat, w.centerLon, w.radiusKm]);

      // 4.5 Ensure KYC case matches
      const existingKyc = await client.query(`
        SELECT id FROM user_trust_service.kyc_cases
        WHERE worker_profile_id = $1
      `, [w.profileId]);

      if (existingKyc.rows.length > 0) {
        await client.query(`
          UPDATE user_trust_service.kyc_cases
          SET status = $1::user_trust_service.kyc_status,
              reviewed_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END,
              updated_at = NOW()
          WHERE worker_profile_id = $2
        `, [w.kycStatus, w.profileId]);
      } else {
        await client.query(`
          INSERT INTO user_trust_service.kyc_cases (
            id, worker_profile_id, id_document_type, document_front_ref, selfie_ref,
            status, version, submitted_at, reviewed_at, created_at, updated_at
          ) VALUES (
            gen_random_uuid(), $1, 'CCCD',
            'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
            'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
            $2::user_trust_service.kyc_status, 1, NOW(), CASE WHEN $2 = 'approved' THEN NOW() ELSE NULL END, NOW(), NOW()
          )
        `, [w.profileId, w.kycStatus]);
      }

      console.log(`Configured: ${w.note}`);
    }

    await client.query('COMMIT');
    console.log("Mock data transaction COMMITTED successfully!");
  } catch (error) {
    await client.query('ROLLBACK');
    console.error("Transaction rolled back due to error:", error);
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
