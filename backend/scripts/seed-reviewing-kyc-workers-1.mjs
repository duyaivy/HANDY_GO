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

const ALL_WORKERS = [
  // BATCH 1 (1 - 10)
  {
    index: 1,
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
    index: 2,
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
    index: 3,
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
    index: 4,
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
    index: 5,
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
    index: 6,
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
    index: 7,
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
    index: 8,
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
    index: 9,
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
    index: 10,
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
  },

  // BATCH 2 (11 - 20)
  {
    index: 11,
    fullName: 'Nguyễn Quang Huy',
    gender: 'Nam',
    phone: '+84912000011',
    rawPhone: '0912000011',
    email: 'worker.review.11@handygo.vn',
    dob: '14/02/1992',
    idNumber: '001203001122',
    address: 'Số 15 Quang Trung, Phường Thạch Thang, Quận Hải Châu, Đà Nẵng',
    similarity: 0.932,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 4,
    note: 'Giấy tờ mới cấp, ảnh chân dung sắc nét (Đối sánh 93.2%)'
  },
  {
    index: 12,
    fullName: 'Võ Thị Lan Anh',
    gender: 'Nữ',
    phone: '+84912000012',
    rawPhone: '0912000012',
    email: 'worker.review.12@handygo.vn',
    dob: '08/06/1995',
    idNumber: '048301002233',
    address: 'Số 68 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh',
    similarity: 0.918,
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400',
    frontRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643310/handy-go/images/tf4qh9enu2ifdlxkv4hq.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643316/handy-go/images/ivi3fqsoxgegcxttop1t.jpg',
    experienceYears: 3,
    note: 'Đầy đủ ảnh 2 mặt CCCD và ảnh selfie chuẩn'
  },
  {
    index: 13,
    fullName: 'Trần Đình Trọng',
    gender: 'Nam',
    phone: '+84912000013',
    rawPhone: '0912000013',
    email: 'worker.review.13@handygo.vn',
    dob: '25/11/1989',
    idNumber: '034200003344',
    address: 'Số 112 Điện Biên Phủ, Phường Chính Gián, Quận Thanh Khê, Đà Nẵng',
    similarity: 0.885,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 6,
    note: 'Thông tin OCR trùng khớp hoàn toàn hồ sơ đăng ký'
  },
  {
    index: 14,
    fullName: 'Lê Bá Hải',
    gender: 'Nam',
    phone: '+84912000014',
    rawPhone: '0912000014',
    email: 'worker.review.14@handygo.vn',
    dob: '19/04/1997',
    idNumber: '079202004455',
    address: 'Số 452 Lê Văn Sỹ, Phường 14, Quận 3, TP. Hồ Chí Minh',
    similarity: 0.441,
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 1,
    note: '[Thử nghiệm Từ chối] Điểm đối sánh thấp (44.1%), ảnh chụp bị lóa sáng'
  },
  {
    index: 15,
    fullName: 'Phạm Thu Trang',
    gender: 'Nữ',
    phone: '+84912000015',
    rawPhone: '0912000015',
    email: 'worker.review.15@handygo.vn',
    dob: '30/08/1993',
    idNumber: '036302005566',
    address: 'Số 95 Kim Mã, Phường Kim Mã, Quận Ba Đình, Hà Nội',
    similarity: 0.954,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
    frontRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643310/handy-go/images/tf4qh9enu2ifdlxkv4hq.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643316/handy-go/images/ivi3fqsoxgegcxttop1t.jpg',
    experienceYears: 4,
    note: 'Hồ sơ đạt độ tương đồng rất cao (95.4%), ảnh chụp chất lượng tốt'
  },
  {
    index: 16,
    fullName: 'Đinh Văn Nam',
    gender: 'Nam',
    phone: '+84912000016',
    rawPhone: '0912000016',
    email: 'worker.review.16@handygo.vn',
    dob: '12/10/1990',
    idNumber: '031201006677',
    address: 'Số 210 Trần Phú, Quận Ngô Quyền, Hải Phòng',
    similarity: 0.867,
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 5,
    note: 'Thợ sửa điện gia dụng kinh nghiệm 5 năm'
  },
  {
    index: 17,
    fullName: 'Dương Thị Thảo',
    gender: 'Nữ',
    phone: '+84912000017',
    rawPhone: '0912000017',
    email: 'worker.review.17@handygo.vn',
    dob: '05/01/1996',
    idNumber: '024300007788',
    address: 'Số 33 Đinh Tiên Hoàng, Phường Đa Kao, Quận 1, TP. Hồ Chí Minh',
    similarity: 0.523,
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 2,
    note: '[Thử nghiệm Nghi vấn] Điểm tương đồng 52.3%, góc chụp nghiêng cảnh báo AI'
  },
  {
    index: 18,
    fullName: 'Ngô Quốc Trung',
    gender: 'Nam',
    phone: '+84912000018',
    rawPhone: '0912000018',
    email: 'worker.review.18@handygo.vn',
    dob: '17/07/1986',
    idNumber: '042203008899',
    address: 'Số 74 Hùng Vương, Phường Phú Nhuận, Thành phố Huế',
    similarity: 0.902,
    avatarUrl: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=400',
    frontRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643310/handy-go/images/tf4qh9enu2ifdlxkv4hq.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/gno0igne/image/upload/v1792643316/handy-go/images/ivi3fqsoxgegcxttop1t.jpg',
    experienceYears: 8,
    note: 'Hồ sơ đầy đủ, đối sánh khuôn mặt chuẩn xác (90.2%)'
  },
  {
    index: 19,
    fullName: 'Lương Minh Triết',
    gender: 'Nam',
    phone: '+84912000019',
    rawPhone: '0912000019',
    email: 'worker.review.19@handygo.vn',
    dob: '23/03/1991',
    idNumber: '075204009900',
    address: 'Số 59 Cách Mạng Tháng 8, Phường An Hòa, Quận Ninh Kiều, Cần Thơ',
    similarity: 0.879,
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 5,
    note: 'Thợ sửa điện lạnh & vệ sinh nhà ở kinh nghiệm'
  },
  {
    index: 20,
    fullName: 'Chu Kim Oanh',
    gender: 'Nữ',
    phone: '+84912000020',
    rawPhone: '0912000020',
    email: 'worker.review.20@handygo.vn',
    dob: '11/09/1994',
    idNumber: '068305001234',
    address: 'Số 168 Hạ Long, Phường Bãi Cháy, Thành phố Hạ Long, Quảng Ninh',
    similarity: 0.946,
    avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400',
    frontRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-front.jpg',
    backRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-back.jpg',
    selfieRef: 'https://res.cloudinary.com/dcf78vkol/image/upload/v1/handy-go/kyc-selfie.jpg',
    experienceYears: 4,
    note: 'Giấy tờ còn hạn đến 2038, hồ sơ hợp lệ hoàn toàn (94.6%)'
  }
];

function maskIdNumber(id) {
  if (!id || id.length < 6) return id;
  return id.slice(0, 6) + '*'.repeat(id.length - 6);
}

// Can pass batch argument: node scripts/seed-reviewing-kyc-workers.mjs [1|2|all]
// Defaults to 2 (to seed/reseed accounts 11-20 without disturbing finished reviews on 1-10)
const batchArg = process.argv[2] || '2';
let selectedWorkers = [];
if (batchArg === '1') {
  selectedWorkers = ALL_WORKERS.slice(0, 10);
} else if (batchArg === 'all') {
  selectedWorkers = ALL_WORKERS;
} else {
  selectedWorkers = ALL_WORKERS.slice(10, 20); // Batch 2 (11 - 20)
}

async function seed() {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    console.log(`🚀 Bắt đầu seed ${selectedWorkers.length} tài khoản thợ (Batch: ${batchArg})...`);
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    const servicesRes = await client.query(`
      SELECT id, name FROM catalog_service.services WHERE is_active = true LIMIT 10;
    `);
    const services = servicesRes.rows;

    const createdWorkers = [];

    for (let i = 0; i < selectedWorkers.length; i++) {
      const data = selectedWorkers[i];
      const hoursAgo = (i + 1) * 2;

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

        const wpRes = await client.query(`
          SELECT id FROM user_trust_service.worker_profiles WHERE user_id = $1;
        `, [userId]);
        workerProfileId = wpRes.rows[0]?.id || crypto.randomUUID();

        await client.query(`
          DELETE FROM user_trust_service.kyc_cases WHERE worker_profile_id = $1;
        `, [workerProfileId]);
      } else {
        userId = crypto.randomUUID();
        accountId = crypto.randomUUID();
        workerProfileId = crypto.randomUUID();
      }

      await client.query(`
        INSERT INTO user_trust_service.users (id, full_name, avatar_url, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'active', NOW() - INTERVAL '${hoursAgo} hours', NOW() - INTERVAL '${hoursAgo} hours')
        ON CONFLICT (id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          avatar_url = EXCLUDED.avatar_url,
          status = 'active',
          updated_at = NOW();
      `, [userId, data.fullName, data.avatarUrl]);

      await client.query(`
        INSERT INTO user_trust_service.customer_profiles (id, user_id, bio, created_at, updated_at)
        VALUES ($1, $2, 'Hồ sơ khách hàng HandyGo', NOW() - INTERVAL '${hoursAgo} hours', NOW() - INTERVAL '${hoursAgo} hours')
        ON CONFLICT (user_id) DO NOTHING;
      `, [crypto.randomUUID(), userId]);

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

      await client.query(`
        INSERT INTO auth_service.account_roles (account_id, role_id, assigned_at)
        VALUES ($1, $2, NOW() - INTERVAL '${hoursAgo} hours'), ($1, $3, NOW() - INTERVAL '${hoursAgo} hours')
        ON CONFLICT (account_id, role_id) DO NOTHING;
      `, [accountId, WORKER_ROLE_ID, CUSTOMER_ROLE_ID]);

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
        dateOfExpiry: '15/08/2038'
      };

      const aiResult = {
        ocr: {
          id: data.idNumber,
          name: data.fullName.toUpperCase(),
          dob: data.dob,
          gender: data.gender,
          address: data.address,
          expiry: '15/08/2038'
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
        stt: data.index,
        fullName: data.fullName,
        phone: data.rawPhone,
        email: data.email,
        similarity: data.similarity,
        note: data.note
      });
    }

    await client.query('COMMIT');

    console.log('\n============================================================');
    console.log(`✅ ĐÃ TẠO THÀNH CÔNG ${createdWorkers.length} TÀI KHOẢN THỢ CÓ TRẠNG THÁI REVIEWING!`);
    console.log('============================================================');
    console.log(`🔑 Mật khẩu mặc định: ${DEFAULT_PASSWORD}`);
    console.log('------------------------------------------------------------');
    console.table(createdWorkers.map(w => ({
      'STT': w.stt,
      'Họ và tên': w.fullName,
      'Số điện thoại': w.phone,
      'Email': w.email,
      'Độ khớp AI': `${(w.similarity * 100).toFixed(1)}%`,
      'Ghi chú test': w.note
    })));
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

seed();
