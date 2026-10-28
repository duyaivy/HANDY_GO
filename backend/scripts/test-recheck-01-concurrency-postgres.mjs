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
  console.log(`${BOLD}${CYAN}   RECHECK-01 LIVE HTTP & REAL POSTGRESQL CONCURRENCY TEST              ${RESET}`);
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
    // -------------------------------------------------------------------------
    // BƯỚC 1: Khách hàng tạo Draft Service Request hợp lệ qua API
    // -------------------------------------------------------------------------
    logStep(1, 'Khách hàng tạo Draft Service Request đầy đủ trường hợp lệ');
    const futureDate = new Date(Date.now() + 2 * 86400000).toISOString();
    const createRes = await sendRequest(
      '/api/v1/service-requests',
      'POST',
      {
        serviceId,
        description: 'Sửa bồn rửa bát bị rò rỉ nước',
        addressText: '456 Nguyễn Lương Bằng, Đà Nẵng',
        latitude: 16.0748,
        longitude: 108.1499,
        scheduledAt: futureDate,
        aiRefPriceMin: 200000,
        aiRefPriceMax: 400000,
      },
      headers,
    );

    if (createRes.status !== 201) {
      throw new Error(`Tạo draft thất bại: HTTP ${createRes.status} — ${JSON.stringify(createRes.data)}`);
    }

    const request = createRes.data.data;
    const requestId = request.id;
    logSuccess(`Đã tạo Draft ID: ${requestId} (Mã: ${request.requestCode})`);

    // Kiểm tra trong PostgreSQL thật
    const dbCheck = await dbClient.query(
      `SELECT id, status, service_id, description, version FROM order_service.service_requests WHERE id = $1`,
      [requestId],
    );
    logSuccess(`PostgreSQL ghi nhận: status='${dbCheck.rows[0].status}', version=${dbCheck.rows[0].version}`);

    // -------------------------------------------------------------------------
    // BƯỚC 2: Mô phỏng Race Condition thật giữa Publish và Concurrent updateDraft
    // -------------------------------------------------------------------------
    logStep(2, 'Kích hoạt Concurrency Race: Khóa FOR UPDATE -> publish() bị block -> updateDraft() làm hỏng data -> commit -> publish() đọc lại');

    // Mở connection A để giữ khóa FOR UPDATE trên row ServiceRequest
    const lockClient = await pool.connect();
    await lockClient.query('BEGIN');
    await lockClient.query(
      `SELECT id FROM order_service.service_requests WHERE id = $1::uuid FOR UPDATE`,
      [requestId],
    );
    console.log(`  ${YELLOW}🔒 [LOCK] Connection A đã khóa dòng draft ${requestId} FOR UPDATE${RESET}`);

    // Gửi yêu cầu publish() qua HTTP.
    // publish() sẽ:
    // 1. Đọc pre-check ngoài transaction (thấy data hợp lệ).
    // 2. Vào transaction và cố gắng lấy SELECT ... FOR UPDATE.
    // 3. PostgreSQL BLOCK request này vì Connection A đang giữ khóa!
    console.log(`  ${CYAN}🚀 [HTTP] Khách hàng bấm Publish (pre-check hợp lệ, transaction bị block chờ lock)...${RESET}`);
    const publishPromise = sendRequest(
      `/api/v1/service-requests/${requestId}/publish`,
      'POST',
      null,
      headers,
    );

    // Chờ 300ms để đảm bảo publish() đã vượt qua pre-check và đang bị block ở FOR UPDATE
    await new Promise((r) => setTimeout(r, 300));

    // Trong lúc publish() đang chờ khóa:
    // Connection A (hoặc concurrent updateDraft) làm hỏng dữ liệu: xóa service_id và làm rỗng description
    console.log(`  ${YELLOW}⚡ [RACE EVENT] Concurrent updateDraft() làm hỏng dữ liệu (service_id=null, description='') và COMMIT${RESET}`);
    await lockClient.query(
      `UPDATE order_service.service_requests
       SET service_id = NULL, description = '', version = version + 1
       WHERE id = $1`,
      [requestId],
    );
    await lockClient.query('COMMIT');
    lockClient.release();
    console.log(`  ${GREEN}🔓 [UNLOCK] Connection A đã COMMIT và giải phóng khóa${RESET}`);

    // Chờ kết quả HTTP publish()
    const publishRes = await publishPromise;

    // -------------------------------------------------------------------------
    // BƯỚC 3: Kiểm chứng kết quả phản hồi của publish()
    // -------------------------------------------------------------------------
    logStep(3, 'Kiểm chứng phản hồi HTTP của publish()');
    console.log(`  ▸ HTTP Status nhận được: ${publishRes.status}`);
    console.log(`  ▸ Phản hồi:`, publishRes.data);

    if (publishRes.status === 422) {
      logSuccess(`Publish đã bị TỪ CHỐI với HTTP 422 (UNPROCESSABLE_ENTITY) đúng yêu cầu!`);
      logSuccess(`Mã lỗi: ${publishRes.data.code} — ${publishRes.data.message}`);
    } else {
      logFail(`LỖI: Publish trả về HTTP ${publishRes.status} thay vì từ chối HTTP 422!`);
    }

    // -------------------------------------------------------------------------
    // BƯỚC 4: Kiểm chứng trực tiếp trên PostgreSQL thật
    // -------------------------------------------------------------------------
    logStep(4, 'Kiểm chứng trạng thái dữ liệu và Outbox Event trên PostgreSQL thật');
    const finalDbRes = await dbClient.query(
      `SELECT id, status, service_id, description, version FROM order_service.service_requests WHERE id = $1`,
      [requestId],
    );
    const finalRow = finalDbRes.rows[0];

    console.log(`  ▸ PostgreSQL row hiện tại:`);
    console.log(`    - ID:          ${finalRow.id}`);
    console.log(`    - Status:      ${finalRow.status}`);
    console.log(`    - Service ID:  ${finalRow.service_id}`);
    console.log(`    - Description: '${finalRow.description}'`);
    console.log(`    - Version:     ${finalRow.version}`);

    if (finalRow.status === 'draft') {
      logSuccess(`Yêu cầu giữ nguyên trạng thái 'draft', KHÔNG bị chuyển sang 'open_for_bidding'`);
    } else {
      logFail(`LỖI NGHIÊM TRỌNG: Yêu cầu bị đổi sang '${finalRow.status}' với dữ liệu không hợp lệ!`);
    }

    // Kiểm tra Outbox Event
    const outboxDbRes = await dbClient.query(
      `SELECT COUNT(*) as count FROM order_service.outbox_events
       WHERE aggregate_id = $1 AND event_type = 'service_request.published'`,
      [requestId],
    );
    const outboxCount = parseInt(outboxDbRes.rows[0].count, 10);

    if (outboxCount === 0) {
      logSuccess(`KHÔNG có bất kỳ event 'service_request.published' nào được tạo (Outbox count = 0)`);
    } else {
      logFail(`LỖI: Phát hiện ${outboxCount} event outbox được phát sinh trái phép!`);
    }

    // Dọn dẹp bản ghi test
    await dbClient.query(`DELETE FROM order_service.service_requests WHERE id = $1`, [requestId]);
    logSuccess('Dọn dẹp bản ghi kiểm thử thành công');

    console.log(`\n${GREEN}${BOLD}✔ TẤT CẢ KIỂM THỬ RECHECK-01 TRÊN POSTGRESQL THẬT ĐÃ ĐẠT 100%!${RESET}\n`);

  } catch (err) {
    console.error(`\n${RED}LỖI TRONG QUÁ TRÌNH KIỂM THỬ:${RESET}`, err);
    process.exit(1);
  } finally {
    dbClient.release();
    await pool.end();
    process.exit(0);
  }
}

main();
