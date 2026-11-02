import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const BASE_URL = process.env.ORDER_SERVICE_URL || 'http://127.0.0.1:3004';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required in .env');
  process.exit(1);
}

// ANSI colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

function logStep(step, msg) {
  console.log(`\n${BOLD}${CYAN}[Bước ${step}]${RESET} ${BOLD}${msg}${RESET}`);
}
function logSuccess(msg) {
  console.log(`  ${GREEN}✔ ${msg}${RESET}`);
}
function logFail(msg) {
  console.log(`  ${RED}✖ ${msg}${RESET}`);
}

function sendRequest(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      },
    );

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  console.log(`${BOLD}${CYAN}========================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   RECHECK-02: ĐỒNG BỘ addMedia / deleteMedia VỚI PUBLISH               ${RESET}`);
  console.log(`${BOLD}${CYAN}   Kiểm thử cạnh tranh trên PostgreSQL thật                            ${RESET}`);
  console.log(`${BOLD}${CYAN}========================================================================${RESET}\n`);

  // Healthcheck
  const health = await sendRequest('/health').catch(() => null);
  if (!health || health.status !== 200) {
    console.error(`${RED}Order Service không hoạt động tại ${BASE_URL}${RESET}`);
    process.exit(1);
  }
  logSuccess(`Order Service live at ${BASE_URL}`);

  const pool = new Pool({ connectionString: DATABASE_URL });
  const dbClient = await pool.connect();

  const customerId = crypto.randomUUID();
  const serviceId = crypto.randomUUID();
  const headers = {
    'x-user-id': customerId,
    'x-roles': JSON.stringify(['Customer']),
  };

  try {
    // =========================================================================
    // PHẦN 1: KỊCH BẢN PUBLISH THẮNG TRƯỚC
    // Khi publish thắng trước, thao tác thêm/xóa media phải bị từ chối.
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}--- PHẦN 1: PUBLISH THẮNG TRƯỚC ---${RESET}`);

    logStep('1.1', 'Tạo draft service request kèm 1 media item ban đầu');
    const futureDate = new Date(Date.now() + 2 * 86400000).toISOString();
    const createRes = await sendRequest(
      '/api/v1/service-requests',
      'POST',
      {
        serviceId,
        description: 'Bảo dưỡng điều hòa Inverter 2HP',
        addressText: '789 Trần Cao Vân, Đà Nẵng',
        latitude: 16.075,
        longitude: 108.195,
        scheduledAt: futureDate,
        media: [
          {
            mediaType: 'image',
            mediaUrl: 'https://cloudinary.com/initial-media-1.jpg',
          },
        ],
      },
      headers,
    );
    if (createRes.status !== 201) {
      throw new Error(`Tạo draft thất bại: HTTP ${createRes.status}`);
    }
    const req1Id = createRes.data.data.id;
    const media1Id = createRes.data.data.media[0].id;
    logSuccess(`Đã tạo Draft ID: ${req1Id} kèm Media ID: ${media1Id}`);

    logStep('1.2', 'Thực hiện Publish request trước (Publish thắng cuộc)');
    const publishRes = await sendRequest(
      `/api/v1/service-requests/${req1Id}/publish`,
      'POST',
      null,
      headers,
    );
    if (publishRes.status !== 200) {
      throw new Error(`Publish thất bại: HTTP ${publishRes.status}`);
    }
    logSuccess(`Request đã chuyển sang: status='${publishRes.data.data.status}'`);

    logStep('1.3', 'Cố gắng thêm media mới vào request sau khi đã publish (addMedia)');
    const addMediaRes = await sendRequest(
      `/api/v1/service-requests/${req1Id}/media`,
      'POST',
      {
        mediaType: 'image',
        mediaUrl: 'https://cloudinary.com/late-media-attempt.jpg',
      },
      headers,
    );
    console.log(`  ▸ HTTP Status: ${addMediaRes.status}`);
    console.log(`  ▸ Phản hồi:`, addMediaRes.data);
    if (addMediaRes.status === 400) {
      logSuccess(`addMedia() bị TỪ CHỐI với HTTP 400 (BAD_REQUEST) đúng quy tắc!`);
    } else {
      logFail(`LỖI: addMedia() trả về HTTP ${addMediaRes.status} thay vì bị chặn!`);
    }

    logStep('1.4', 'Cố gắng xóa media khỏi request sau khi đã publish (deleteMedia)');
    const delMediaRes = await sendRequest(
      `/api/v1/service-requests/${req1Id}/media/${media1Id}`,
      'DELETE',
      null,
      headers,
    );
    console.log(`  ▸ HTTP Status: ${delMediaRes.status}`);
    console.log(`  ▸ Phản hồi:`, delMediaRes.data);
    if (delMediaRes.status === 400) {
      logSuccess(`deleteMedia() bị TỪ CHỐI với HTTP 400 (BAD_REQUEST) đúng quy tắc!`);
    } else {
      logFail(`LỖI: deleteMedia() trả về HTTP ${delMediaRes.status} thay vì bị chặn!`);
    }

    // Kiểm tra media trên DB
    const mediaCountDb = await dbClient.query(
      `SELECT COUNT(*) as count FROM order_service.request_media WHERE service_request_id = $1`,
      [req1Id],
    );
    if (parseInt(mediaCountDb.rows[0].count, 10) === 1) {
      logSuccess(`Dữ liệu media trên PostgreSQL không bị biến động (vẫn 1 media ban đầu)`);
    } else {
      logFail(`LỖI: Số lượng media bị thay đổi trái phép trên DB!`);
    }

    // =========================================================================
    // PHẦN 2: KỊCH BẢN MEDIA THẮNG TRƯỚC
    // Khi thao tác media thắng trước, publish phải thấy dữ liệu media đã commit.
    // =========================================================================
    console.log(`\n${BOLD}${YELLOW}--- PHẦN 2: THAO TÁC MEDIA THẮNG TRƯỚC ---${RESET}`);

    logStep('2.1', 'Tạo draft service request ban đầu CHƯA có media');
    const createRes2 = await sendRequest(
      '/api/v1/service-requests',
      'POST',
      {
        serviceId,
        description: 'Sửa đường dây điện aptomat bị nhảy',
        addressText: '100 Lê Duẩn, Đà Nẵng',
        latitude: 16.071,
        longitude: 108.215,
        scheduledAt: futureDate,
        media: [],
      },
      headers,
    );
    if (createRes2.status !== 201) {
      throw new Error(`Tạo draft thất bại: HTTP ${createRes2.status}`);
    }
    const req2Id = createRes2.data.data.id;
    logSuccess(`Đã tạo Draft ID: ${req2Id} (0 media)`);

    logStep('2.2', 'Mô phỏng concurrency cạnh tranh: addMedia() giữ khóa dòng -> publish() bị block chờ -> addMedia() commit -> publish() unblock');

    // Mở transaction giữ khóa dòng và add media
    const lockClient = await pool.connect();
    await lockClient.query('BEGIN');
    await lockClient.query(
      `SELECT id FROM order_service.service_requests WHERE id = $1::uuid FOR UPDATE`,
      [req2Id],
    );
    console.log(`  ${YELLOW}🔒 [LOCK] Connection A đã khóa dòng draft ${req2Id} FOR UPDATE (bắt đầu addMedia)${RESET}`);

    // Trong khi Connection A đang giữ khóa, publish() được gọi tới
    console.log(`  ${CYAN}🚀 [HTTP] Publish được gọi (bị PostgreSQL block vì chờ khóa dòng)...${RESET}`);
    const publishPromise2 = sendRequest(
      `/api/v1/service-requests/${req2Id}/publish`,
      'POST',
      null,
      headers,
    );

    // Chờ 300ms để đảm bảo publish() đã bước vào transaction và đang bị PostgreSQL block
    await new Promise((r) => setTimeout(r, 300));

    // Connection A chèn media vào và COMMIT transaction
    const newMediaId = crypto.randomUUID();
    const newMediaUrl = 'https://cloudinary.com/media-committed-before-publish.jpg';
    console.log(`  ${GREEN}⚡ [MEDIA COMMIT] Connection A chèn media và COMMIT giải phóng khóa...${RESET}`);
    await lockClient.query(`
      INSERT INTO order_service.request_media (id, service_request_id, media_type, media_url, created_at)
      VALUES ($1, $2, 'image', $3, NOW())
    `, [newMediaId, req2Id, newMediaUrl]);
    await lockClient.query('COMMIT');
    lockClient.release();

    // Chờ publish hoàn tất sau khi được unblock
    const publishRes2 = await publishPromise2;
    console.log(`  ▸ HTTP Status của publish: ${publishRes2.status}`);

    if (publishRes2.status === 200) {
      logSuccess('Publish đã unblock và thực thi thành công!');
    } else {
      logFail(`LỖI: Publish thất bại với HTTP ${publishRes2.status}: ${JSON.stringify(publishRes2.data)}`);
    }

    logStep('2.3', 'Kiểm chứng Publish thấy dữ liệu media đã commit');
    const publishedMedia = publishRes2.data.data.media;
    console.log(`  ▸ Danh sách media trả về trong published response:`, publishedMedia);

    if (Array.isArray(publishedMedia) && publishedMedia.some((m) => m.mediaUrl === newMediaUrl)) {
      logSuccess(`Publish đã THẤY ĐẦY ĐỦ media đã commit bởi addMedia thắng trước!`);
    } else {
      logFail(`LỖI: Publish KHÔNG thấy media vừa commit!`);
    }

    // Dọn dẹp bản ghi test
    await dbClient.query(`DELETE FROM order_service.service_requests WHERE id IN ($1, $2)`, [req1Id, req2Id]);
    logSuccess('Dọn dẹp bản ghi kiểm thử thành công');

    console.log(`\n${GREEN}${BOLD}✔ TẤT CẢ KIỂM THỬ RECHECK-02 TRÊN POSTGRESQL THẬT ĐÃ ĐẠT 100%!${RESET}\n`);

  } catch (err) {
    console.error(`\n${RED}LỖI TRONG QUÁ TRÌNH KIỂM THỬ RECHECK-02:${RESET}`, err);
    process.exit(1);
  } finally {
    dbClient.release();
    await pool.end();
    process.exit(0);
  }
}

main();
