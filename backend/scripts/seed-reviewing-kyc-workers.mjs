import pg from 'pg';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL is required in .env');
  process.exit(1);
}

const DEFAULT_PASSWORD = 'WorkerPassword123@';

const WORKER_ROLE_ID = '2f9964d7-df8f-4b48-978c-462912833e22'; // WORKER
const CUSTOMER_ROLE_ID = '69090c57-e23b-414e-84d9-1e54214498d7'; // CUSTOMER

const WORKERS_DATA = [
  {
    fullName: 'Hoàng Văn Tuấn',
    gender: 'Nam',
    phone: '+84912000001',
    rawPhone: '0912000001',
    email: 'worker.review.01@handygo.vn',
    dob: '15/05/1991',
    idNumber: '001201012341',
    address: 'Số 45 Lê Duẩn, Phường Hải Châu 1, Quận Hải Châu, Đà Nẵng',
    similarity: 0.9412,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 4,
    note: 'CCCD rõ nét, độ tương đồng khuôn mặt cao (0.94)'
  },
  {
    fullName: 'Lê Thị Mai',
    gender: 'Nữ',
    phone: '+84912000002',
    rawPhone: '0912000002',
    email: 'worker.review.02@handygo.vn',
    dob: '22/09/1993',
    idNumber: '038302005432',
    address: 'Số 12 Nguyễn Thị Minh Khai, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    similarity: 0.915,
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400',
    frontRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643310/handy-go/images/tf4qh9enu2ifdlxkv4hq.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643316/handy-go/images/ivi3fqsoxgegcxttop1t.jpg',
    experienceYears: 3,
    note: 'Hồ sơ đạt chuẩn, ảnh chân dung đối sánh khớp'
  },
  {
    fullName: 'Đặng Quốc Bảo',
    gender: 'Nam',
    phone: '+84912000003',
    rawPhone: '0912000003',
    email: 'worker.review.03@handygo.vn',
    dob: '10/12/1988',
    idNumber: '048200008765',
    address: 'Số 88 Hoàng Diệu, Phường Phước Ninh, Quận Hải Châu, Đà Nẵng',
    similarity: 0.887,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 6,
    note: 'Thợ lành nghề điện nước, thông tin giấy tờ đầy đủ'
  },
  {
    fullName: 'Vũ Đức Thịnh',
    gender: 'Nam',
    phone: '+84912000004',
    rawPhone: '0912000004',
    email: 'worker.review.04@handygo.vn',
    dob: '05/03/1995',
    idNumber: '079201019876',
    address: 'Số 204 CMT8, Phường 10, Quận 3, TP. Hồ Chí Minh',
    similarity: 0.462,
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 2,
    note: '[Thử nghiệm Từ chối] Điểm tương đồng thấp (0.46) do ảnh mờ, admin có thể test bấm từ chối'
  },
  {
    fullName: 'Phan Thanh Sơn',
    gender: 'Nam',
    phone: '+84912000005',
    rawPhone: '0912000005',
    email: 'worker.review.05@handygo.vn',
    dob: '18/07/1990',
    idNumber: '040203004321',
    address: 'Số 76 Cầu Giấy, Phường Quan Hoa, Quận Cầu Giấy, Hà Nội',
    similarity: 0.928,
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
    frontRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643310/handy-go/images/tf4qh9enu2ifdlxkv4hq.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643316/handy-go/images/ivi3fqsoxgegcxttop1t.jpg',
    experienceYears: 5,
    note: 'Chuyên gia điện lạnh, hồ sơ AI xác thực thành công'
  },
  {
    fullName: 'Bùi Thúy Hằng',
    gender: 'Nữ',
    phone: '+84912000006',
    rawPhone: '0912000006',
    email: 'worker.review.06@handygo.vn',
    dob: '30/11/1994',
    idNumber: '031301007654',
    address: 'Số 105 Lạch Tray, Quận Ngô Quyền, Hải Phòng',
    similarity: 0.8735,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 3,
    note: 'Dịch vụ dọn dẹp vệ sinh nhà ở'
  },
  {
    fullName: 'Nguyễn Hữu Đạt',
    gender: 'Nam',
    phone: '+84912000007',
    rawPhone: '0912000007',
    email: 'worker.review.07@handygo.vn',
    dob: '08/04/1987',
    idNumber: '001202008899',
    address: 'Số 52 Phan Chu Trinh, Quận Hoàn Kiếm, Hà Nội',
    similarity: 0.852,
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 7,
    note: 'Thợ sửa điện gia dụng kinh nghiệm cao'
  },
  {
    fullName: 'Trịnh Công Minh',
    gender: 'Nam',
    phone: '+84912000008',
    rawPhone: '0912000008',
    email: 'worker.review.08@handygo.vn',
    dob: '14/01/1996',
    idNumber: '049204001122',
    address: 'Số 19 Hùng Vương, Thành phố Huế, Thừa Thiên Huế',
    similarity: 0.589,
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 2,
    note: '[Thử nghiệm Nghi vấn] Điểm tương đồng 0.58, admin có thể yêu cầu kiểm tra lại'
  },
  {
    fullName: 'Đỗ Mỹ Linh',
    gender: 'Nữ',
    phone: '+84912000009',
    rawPhone: '0912000009',
    email: 'worker.review.09@handygo.vn',
    dob: '29/08/1992',
    idNumber: '025303003344',
    address: 'Số 28 Trần Hưng Đạo, Thành phố Nam Định',
    similarity: 0.965,
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400',
    frontRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643310/handy-go/images/tf4qh9enu2ifdlxkv4hq.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643316/handy-go/images/ivi3fqsoxgegcxttop1t.jpg',
    experienceYears: 4,
    note: 'Ảnh chụp chất lượng cao, đối sánh khuôn mặt đạt 96.5%'
  },
  {
    fullName: 'Mai Xuân Bách',
    gender: 'Nam',
    phone: '+84912000010',
    rawPhone: '0912000010',
    email: 'worker.review.10@handygo.vn',
    dob: '12/06/1989',
    idNumber: '060205006677',
    address: 'Số 33 Nguyễn Trãi, Phường 2, Thành phố Vũng Tàu',
    similarity: 0.899,
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 5,
    note: 'Hồ sơ thợ máy lắp đặt, thông tin hoàn chỉnh'
  }
];

function maskIdNumber(id) {
  if (!id || id.length < 6) return id;
  return id.slice(0, 6) + '*'.repeat(id.length - 6);
}

async function seedReviewingWorkers() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    console.log('🚀 Bắt đầu tạo 10 tài khoản thợ có trạng thái KYC reviewing...');
    await client.query('BEGIN');

    // 1. Password Hash
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // 2. Fetch active catalog services
    const servicesRes = await client.query(`
      SELECT id, name FROM catalog_service.services WHERE is_active = true LIMIT 10;
    `);
    const services = servicesRes.rows;
    if (services.length === 0) {
      console.warn('⚠️ Không tìm thấy dịch vụ nào đang active trong catalog_service.services!');
    }

    const createdWorkers = [];

    for (let i = 0; i < WORKERS_DATA.length; i++) {
      const data = WORKERS_DATA[i];
      const hoursAgo = (i + 1) * 2; // Create varying submission times in past 20 hours

      // Clean up previous test record if phone/email exists
      const existingAccount = await client.query(`
        SELECT id, user_id FROM auth_service.accounts
        WHERE email = $1 OR phone = $2;
      `, [data.email, data.phone]);

      let userId;
      let accountId;
      let workerProfileId;

      if (existingAccount.rows.length > 0) {
        accountId = existingAccount.rows[0].id;
        userId = existingAccount.rows[0].user_id;

        // Find existing workerProfileId
        const wpRes = await client.query(`
          SELECT id FROM user_trust_service.worker_profiles WHERE user_id = $1;
        `, [userId]);
        workerProfileId = wpRes.rows[0]?.id || crypto.randomUUID();

        // Delete existing kyc cases and jobs for this worker profile to re-seed cleanly
        await client.query(`
          DELETE FROM user_trust_service.kyc_cases WHERE worker_profile_id = $1;
        `, [workerProfileId]);
      } else {
        userId = crypto.randomUUID();
        accountId = crypto.randomUUID();
        workerProfileId = crypto.randomUUID();
      }

      // 3. User in user_trust_service.users
      await client.query(`
        INSERT INTO user_trust_service.users (id, full_name, avatar_url, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', NOW() - INTERVAL '${hoursAgo} hours', NOW() - INTERVAL '${hoursAgo} hours')
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          avatar_url = EXCLUDED.avatar_url,
          status = 'active',
          updated_at = NOW();
      `, [userId, data.fullName, data.avatarUrl]);

      // 4. CustomerProfile in user_trust_service.customer_profiles
      await client.query(`
        INSERT INTO user_trust_service.customer_profiles (id, user_id, bio, created_at, updated_at)
        VALUES ($1, $2, 'Hồ sơ khách hàng HandyGo', NOW() - INTERVAL '${hoursAgo} hours', NOW() - INTERVAL '${hoursAgo} hours')
        ON CONFLICT (user_id) DO NOTHING;
      `, [crypto.randomUUID(), userId]);

      // 5. Account in auth_service.accounts
      await client.query(`
        INSERT INTO auth_service.accounts (
          id, user_id, email, phone, password_hash, status, email_verified_at, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'active', NOW() - INTERVAL '${hoursAgo} hours', NOW() - INTERVAL '${hoursAgo} hours', NOW())
        ON CONFLICT (id) DO UPDATE SET
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          password_hash = EXCLUDED.password_hash,
          status = 'active',
          updated_at = NOW();
      `, [accountId, userId, data.email, data.phone, passwordHash]);

      // 6. Roles: Assign WORKER and CUSTOMER roles
      await client.query(`
        INSERT INTO auth_service.account_roles (account_id, role_id, assigned_at)
        VALUES ($1, $2, NOW() - INTERVAL '${hoursAgo} hours'), ($1, $3, NOW() - INTERVAL '${hoursAgo} hours')
        ON CONFLICT (account_id, role_id) DO NOTHING;
      `, [accountId, WORKER_ROLE_ID, CUSTOMER_ROLE_ID]);

      // 7. WorkerProfile in user_trust_service.worker_profiles
      // Status is 'under_review' because KYC is awaiting review
      await client.query(`
        INSERT INTO user_trust_service.worker_profiles (
          id, user_id, status, average_rating, rating_count, completed_order_count, order_count_total,
          created_at, updated_at
        )
        VALUES ($1, $2, 'under_review', 0, 0, 0, 0, NOW() - INTERVAL '${hoursAgo} hours', NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          status = 'under_review',
          updated_at = NOW();
      `, [workerProfileId, userId]);

      // 8. Worker service offerings (Assign 1-2 services)
      if (services.length > 0) {
        const assignedService = services[i % services.length];
        await client.query(`
          INSERT INTO user_trust_service.worker_service_offerings (
            id, worker_profile_id, service_id, title, description, experience_years, is_active, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, true, NOW() - INTERVAL '${hoursAgo} hours', NOW())
          ON CONFLICT (worker_profile_id, service_id) DO UPDATE SET
            is_active = true,
            experience_years = EXCLUDED.experience_years,
            updated_at = NOW();
        `, [
          crypto.randomUUID(),
          workerProfileId,
          assignedService.id,
          `Thợ chuyên: ${assignedService.name}`,
          `Kinh nghiệm ${data.experienceYears} năm thực hiện ${assignedService.name}.`,
          data.experienceYears
        ]);
      }

      // 9. Create KYC Case with status 'reviewing'
      const kycCaseId = crypto.randomUUID();
      const jobId = crypto.randomUUID();
      const maskedId = maskIdNumber(data.idNumber);

      const rawOcrData = {
        idNumber: data.idNumber,
        fullName: data.fullName.toUpperCase(),
        dateOfBirth: data.dob,
        gender: data.gender,
        nationality: 'Việt Nam',
        placeOfOrigin: 'Việt Nam',
        placeOfResidence: data.address,
        dateOfExpiry: '15/08/2035'
      };

      const aiResult = {
        ocr: {
          id: data.idNumber,
          name: data.fullName.toUpperCase(),
          dob: data.dob,
          gender: data.gender,
          address: data.address,
          expiry: '15/08/2035'
        },
        faceVerification: {
          isMatch: data.similarity >= 0.7,
          similarity: data.similarity,
          confidence: data.similarity >= 0.85 ? 'HIGH' : data.similarity >= 0.7 ? 'MEDIUM' : 'LOW'
        }
      };

      await client.query(`
        INSERT INTO user_trust_service.kyc_cases (
          id, worker_profile_id, id_document_type, id_number_masked,
          document_front_ref, document_back_ref, selfie_ref,
          status, version, active_job_id, ai_similarity_score,
          raw_ocr_data, ai_result, review_note,
          submitted_at, created_at, updated_at
        )
        VALUES (
          $1, $2, 'CCCD', $3,
          $4, $5, $6,
          'reviewing', 1, $7, $8,
          $9, $10, 'Đã hoàn tất phân tích AI. Đang chờ Quản trị viên xem xét và duyệt.',
          NOW() - INTERVAL '${hoursAgo} hours',
          NOW() - INTERVAL '${hoursAgo} hours',
          NOW() - INTERVAL '${hoursAgo - 1} hours'
        );
      `, [
        kycCaseId,
        workerProfileId,
        maskedId,
        data.frontRef,
        data.backRef,
        data.selfieRef,
        jobId,
        data.similarity,
        JSON.stringify(rawOcrData),
        JSON.stringify(aiResult)
      ]);

      // 10. Create AiAnalysisJob with status 'completed'
      await client.query(`
        INSERT INTO user_trust_service.ai_analysis_jobs (
          id, kyc_case_id, worker_profile_id, status, retry_count, max_retries,
          ai_result, started_at, completed_at, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, 'completed', 0, 3,
          $4,
          NOW() - INTERVAL '${hoursAgo} hours',
          NOW() - INTERVAL '${hoursAgo - 1} hours',
          NOW() - INTERVAL '${hoursAgo} hours',
          NOW() - INTERVAL '${hoursAgo - 1} hours'
        );
      `, [
        jobId,
        kycCaseId,
        workerProfileId,
        JSON.stringify(aiResult)
      ]);

      // 11. Create KycReviewHistory entries (submitted -> reviewing)
      await client.query(`
        INSERT INTO user_trust_service.kyc_review_histories (
          id, kyc_case_id, action, from_status, to_status, note, metadata, created_at
        )
        VALUES (
          $1, $2, 'submitted', 'draft', 'submitted',
          'Hồ sơ KYC được gửi bởi thợ và đưa vào hàng đợi AI xử lý',
          $3,
          NOW() - INTERVAL '${hoursAgo} hours'
        );
      `, [
        crypto.randomUUID(),
        kycCaseId,
        JSON.stringify({ idDocumentType: 'CCCD', jobId })
      ]);

      await client.query(`
        INSERT INTO user_trust_service.kyc_review_histories (
          id, kyc_case_id, action, from_status, to_status, note, metadata, created_at
        )
        VALUES (
          $1, $2, 'ai_analysis_completed', 'submitted', 'reviewing',
          $3,
          $4,
          NOW() - INTERVAL '${hoursAgo - 1} hours'
        );
      `, [
        crypto.randomUUID(),
        kycCaseId,
        `Hoàn tất phân tích OCR và đối sánh khuôn mặt (Độ tương đồng: ${data.similarity})`,
        JSON.stringify({
          jobId,
          isMatch: data.similarity >= 0.7,
          similarity: data.similarity
        })
      ]);

      createdWorkers.push({
        index: i + 1,
        fullName: data.fullName,
        phone: data.rawPhone,
        email: data.email,
        kycCaseId,
        workerProfileId,
        userId,
        similarity: data.similarity,
        note: data.note
      });
    }

    await client.query('COMMIT');

    console.log('\n============================================================');
    console.log('✅ ĐÃ TẠO THÀNH CÔNG 10 TÀI KHOẢN THỢ CÓ TRẠNG THÁI REVIEWING!');
    console.log('============================================================');
    console.log(`🔑 Mật khẩu mặc định cho tất cả tài khoản: ${DEFAULT_PASSWORD}`);
    console.log('------------------------------------------------------------');
    console.table(createdWorkers.map(w => ({
      'STT': w.index,
      'Họ và tên': w.fullName,
      'Số điện thoại': w.phone,
      'Email': w.email,
      'Độ khớp AI': `${(w.similarity * 100).toFixed(1)}%`,
      'Ghi chú test': w.note
    })));
    console.log('------------------------------------------------------------');
    console.log('💡 Gợi ý test cho Quản trị viên (Admin):');
    console.log('1. Gọi API: GET /api/v1/admin/kyc-cases?status=reviewing để xem danh sách 10 hồ sơ');
    console.log('2. Gọi API: GET /api/v1/admin/kyc-cases/:id để xem ảnh CCCD, selfie và kết quả OCR/AI');
    console.log('3. Test Phê duyệt (Approve):');
    console.log('   POST /api/v1/admin/kyc-cases/:id/review');
    console.log('   Body: { "decision": "approved", "note": "Hồ sơ hợp lệ, hình ảnh rõ ràng." }');
    console.log('4. Test Từ chối (Reject): Ví dụ với hồ sơ số 4 (Vũ Đức Thịnh) hoặc số 8 (Trịnh Công Minh)');
    console.log('   POST /api/v1/admin/kyc-cases/:id/review');
    console.log('   Body: { "decision": "rejected", "note": "Ảnh chụp khuôn mặt bị mờ, không trùng khớp với CCCD." }');
    console.log('============================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi khi ghi database:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seedReviewingWorkers();
