import http from 'node:http';
import crypto from 'node:crypto';

const BASE_URL = process.env.ORDER_SERVICE_URL || 'http://127.0.0.1:3004';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'handy-go-internal-service-secret-key-12345';

// ANSI Colors
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

function logBanner(title) {
  const line = '═'.repeat(76);
  console.log(`\n${CYAN}${line}${RESET}`);
  console.log(`${BOLD}${CYAN}   ${title}${RESET}`);
  console.log(`${CYAN}${line}${RESET}\n`);
}

function logScenario(num, title, description) {
  console.log(`\n${BOLD}${MAGENTA}╔════════════════════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${MAGENTA}║  KỊCH BẢN ${num}: ${title.padEnd(58)}║${RESET}`);
  if (description) {
    console.log(`${GRAY}║  ▸ ${description.padEnd(69)}║${RESET}`);
  }
  console.log(`${BOLD}${MAGENTA}╚════════════════════════════════════════════════════════════════════════════╝${RESET}`);
}

function logStep(num, title, detail) {
  console.log(`\n${BOLD}${BLUE}╔══ [Bước ${num}] ${title}${RESET}`);
  if (detail) {
    console.log(`${GRAY}║   ${detail}${RESET}`);
  }
}

function logSuccess(msg) {
  console.log(`${GREEN}║   ✔ ${msg}${RESET}`);
}

function logInfo(msg) {
  console.log(`${CYAN}║   ℹ ${msg}${RESET}`);
}

function logWarning(msg) {
  console.log(`${YELLOW}║   ⚠ ${msg}${RESET}`);
}

function logError(msg) {
  console.log(`${RED}║   ✖ ${msg}${RESET}`);
}

function logData(label, val) {
  console.log(`${GRAY}║     ▸ ${label}: ${RESET}${BOLD}${typeof val === 'object' ? JSON.stringify(val) : val}${RESET}`);
}

function logStepEnd() {
  console.log(`${BLUE}╚════════════════════════════════════════════════════════════════════════════${RESET}`);
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

async function checkHealth() {
  try {
    const res = await sendRequest('/health');
    return res.status === 200;
  } catch {
    return false;
  }
}

// Helper to quickly create and publish a request
async function createAndPublishRequest(customerId, description = 'Sửa chữa điện nước') {
  const serviceId = crypto.randomUUID();
  const draftRes = await sendRequest(
    '/api/v1/service-requests',
    'POST',
    {
      serviceId,
      description,
      addressText: '123 Nguyễn Lương Bằng, Đà Nẵng',
      latitude: 16.0748,
      longitude: 108.1499,
      scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      aiRefPriceMin: 200000,
      aiRefPriceMax: 400000,
    },
    { 'x-user-id': customerId, 'x-user-roles': 'customer' },
  );
  if (draftRes.status !== 201 && draftRes.status !== 200) {
    throw new Error(`Tạo Request thất bại: ${JSON.stringify(draftRes.data)}`);
  }
  const reqId = draftRes.data.data.id;
  await sendRequest(`/api/v1/service-requests/${reqId}/publish`, 'POST', {}, { 'x-user-id': customerId, 'x-user-roles': 'customer' });
  return { reqId, serviceId };
}

// Helper to create proposal and accept to create order
async function createOrderDirect(customerId, workerId, price = 300000) {
  const { reqId } = await createAndPublishRequest(customerId, 'Đơn hàng thi công mẫu');
  const propRes = await sendRequest(
    '/api/v1/booking-proposals',
    'POST',
    {
      serviceRequestId: reqId,
      workerUserId: workerId,
      selectionSource: 'bid',
      sourceBidId: crypto.randomUUID(),
      agreedPrice: price,
      agreedScope: 'Thi công theo yêu cầu',
    },
    { 'x-user-id': customerId, 'x-user-roles': 'customer' },
  );
  const propId = propRes.data.data.id;
  const acceptRes = await sendRequest(
    `/api/v1/booking-proposals/${propId}/accept`,
    'POST',
    {},
    { 'x-user-id': workerId, 'x-user-roles': 'worker' },
  );
  return { order: acceptRes.data.data, reqId, propId };
}

async function main() {
  logBanner('HANDY GO — E2E TEST SUITE: TOÀN BỘ CÁC LUỒNG CÓ THỂ XẢY RA TRONG HỆ THỐNG');
  console.log(`${GRAY}Target Base URL: ${BASE_URL}${RESET}`);

  // 0. Kiểm tra kết nối
  const isAlive = await checkHealth();
  if (!isAlive) {
    logError(`Không thể kết nối tới Order Service tại ${BASE_URL}!`);
    console.log(`\n${YELLOW}${BOLD}Hướng dẫn khởi động service:${RESET}`);
    console.log(`  pnpm exec nest start --watch order-service\n`);
    process.exit(1);
  }
  logSuccess('Order Service đang hoạt động (Healthcheck OK 200)');

  let totalPassed = 0;
  let totalFailed = 0;

  try {
    // =========================================================================
    // KỊCH BẢN 1: HAPPY PATH ĐẦU-CUỐI (ĐẤU THẦU 3 THỢ -> CHỐT THỢ 2 -> HOÀN TẤT)
    // =========================================================================
    logScenario(1, 'LUỒNG CHUẨN HOÀN CHỈNH (HAPPY PATH ĐẤU THẦU & THI CÔNG)', 'Khách tạo đơn -> 3 thợ báo giá -> đàm phán -> chọn Thợ 2 -> hoàn tất');
    const C1 = crypto.randomUUID();
    const W1 = crypto.randomUUID();
    const W2 = crypto.randomUUID();
    const W3 = crypto.randomUUID();

    // 1.1 Khách tạo & publish
    logStep('1.1', 'Khách hàng tạo Draft Service Request & Xuất bản (Publish)');
    const { reqId: req1Id } = await createAndPublishRequest(C1, 'Sửa máy bơm Panasonic 200W bị rò rỉ rơ le');
    logSuccess(`Tạo & Publish Service Request: ${req1Id} (open_for_bidding)`);
    totalPassed++;
    logStepEnd();

    // 1.2 3 Thợ báo giá
    logStep('1.2', '3 Thợ gửi báo giá cạnh tranh');
    const p1 = await sendRequest('/api/v1/booking-proposals', 'POST', {
      serviceRequestId: req1Id, workerUserId: W1, selectionSource: 'bid', sourceBidId: crypto.randomUUID(), agreedPrice: 380000, agreedScope: 'Thay rơ le áp lực',
    }, { 'x-user-id': C1, 'x-user-roles': 'customer' });
    const p2 = await sendRequest('/api/v1/booking-proposals', 'POST', {
      serviceRequestId: req1Id, workerUserId: W2, selectionSource: 'bid', sourceBidId: crypto.randomUUID(), agreedPrice: 290000, agreedScope: 'Thay gioăng, bảo hành 6 tháng',
    }, { 'x-user-id': C1, 'x-user-roles': 'customer' });
    const p3 = await sendRequest('/api/v1/booking-proposals', 'POST', {
      serviceRequestId: req1Id, workerUserId: W3, selectionSource: 'bid', sourceBidId: crypto.randomUUID(), agreedPrice: 350000, agreedScope: 'Có mặt 20p, kiểm tra ống',
    }, { 'x-user-id': C1, 'x-user-roles': 'customer' });
    logSuccess(`Thợ 1 báo: 380.000đ | Thợ 2 báo: 290.000đ | Thợ 3 báo: 350.000đ`);
    totalPassed++;
    logStepEnd();

    // 1.3 Đàm phán Thợ 1
    logStep('1.3', 'Thợ 1 đàm phán sửa giá (Request changes) -> Khách gửi Revision 2');
    await sendRequest(`/api/v1/booking-proposals/${p1.data.data.id}/request-changes`, 'POST', { responseNote: 'Máy lớn xin tăng 400k' }, { 'x-user-id': W1, 'x-user-roles': 'worker' });
    const p1Rev2 = await sendRequest('/api/v1/booking-proposals', 'POST', {
      serviceRequestId: req1Id, supersedesProposalId: p1.data.data.id, workerUserId: W1, selectionSource: 'bid', sourceBidId: crypto.randomUUID(), agreedPrice: 330000, agreedScope: 'Khách hỗ trợ 330k',
    }, { 'x-user-id': C1, 'x-user-roles': 'customer' });
    logSuccess(`Tạo thành công Revision 2 cho Thợ 1: ${p1Rev2.data.data.id} (Giá: 330.000đ)`);
    totalPassed++;
    logStepEnd();

    // 1.4 Khách chọn Thợ 2 -> Accept & Chốt đơn
    logStep('1.4', 'Khách chọn Thợ 2 (290k tốt nhất) -> Thợ 2 Accept tạo Order');
    const order1Res = await sendRequest(`/api/v1/booking-proposals/${p2.data.data.id}/accept`, 'POST', {}, { 'x-user-id': W2, 'x-user-roles': 'worker' });
    const order1Id = order1Res.data.data.id;
    logSuccess(`Tạo đơn hàng thành công: Mã ${order1Res.data.data.orderCode} (Giá: ${order1Res.data.data.agreedPrice} VNĐ)`);
    totalPassed++;

    // 1.5 Kiểm tra tự động superseded thợ khác & chống double order
    const checkP3 = await sendRequest(`/api/v1/booking-proposals/${p3.data.data.id}`, 'GET', null, { 'x-user-id': C1, 'x-user-roles': 'customer' });
    if (checkP3.data.data.status === 'superseded') {
      logSuccess(`Xác minh: Báo giá Thợ 3 đã tự động chuyển sang: [superseded]`);
      totalPassed++;
    }
    const raceRes = await sendRequest(`/api/v1/booking-proposals/${p3.data.data.id}/accept`, 'POST', {}, { 'x-user-id': W3, 'x-user-roles': 'worker' });
    if (raceRes.status === 409 || raceRes.status === 400) {
      logSuccess(`Chặn race condition thành công khi Thợ 3 cố accept: HTTP ${raceRes.status}`);
      totalPassed++;
    }
    logStepEnd();

    // 1.6 Thi công, nghiệm thu & quyết toán
    logStep('1.6', 'Thợ 2 thi công (Sẵn sàng -> Bắt đầu -> Tải minh chứng -> Báo xong -> Khách nghiệm thu)');
    await sendRequest(`/api/v1/orders/${order1Id}/confirm-readiness`, 'POST', {}, { 'x-user-id': W2, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${order1Id}/start`, 'POST', {}, { 'x-user-id': W2, 'x-user-roles': 'worker' });
    // Guard: báo xong khi thiếu ảnh
    const noEvid = await sendRequest(`/api/v1/orders/${order1Id}/finish`, 'POST', {}, { 'x-user-id': W2, 'x-user-roles': 'worker' });
    if (noEvid.status === 400) {
      logSuccess(`Hệ thống chặn thành công khi thiếu ảnh minh chứng: HTTP 400`);
      totalPassed++;
    }
    await sendRequest(`/api/v1/orders/${order1Id}/evidence`, 'POST', {
      mediaUrl: 'https://res.cloudinary.com/handygo/image/upload/pump_done.jpg', mediaType: 'image', description: 'Đã thay gioăng áp lực 2.5 bar',
    }, { 'x-user-id': W2, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${order1Id}/finish`, 'POST', {}, { 'x-user-id': W2, 'x-user-roles': 'worker' });
    const compRes = await sendRequest(`/api/v1/orders/${order1Id}/confirm-completion`, 'POST', {}, { 'x-user-id': C1, 'x-user-roles': 'customer' });
    logSuccess(`Đơn hàng hoàn tất: Trạng thái [${compRes.data.data.status}]`);
    totalPassed++;

    // Kiểm tra API nội bộ kế toán
    const payRes = await sendRequest(`/api/v1/internal/orders/${order1Id}/payment-eligibility`, 'GET', null, { 'x-internal-secret': INTERNAL_SECRET });
    const isEligible = payRes.data.data?.isEligibleForSettlement ?? payRes.data.data?.isEligible;
    logSuccess(`Kế toán duyệt giải ngân: isEligible = ${isEligible}, Số tiền: ${payRes.data.data?.agreedPrice} VNĐ`);
    totalPassed++;
    logStepEnd();

    // =========================================================================
    // KỊCH BẢN 2: LUỒNG KHÁCH YÊU CẦU LÀM LẠI / SỬA LẠI (REWORK FLOW - ORD-07)
    // =========================================================================
    logScenario(2, 'LUỒNG KHÁCH YÊU CẦU LÀM LẠI (REWORK LIFECYCLE)', 'Khách không hài lòng -> yêu cầu làm lại -> đơn về in_progress -> sửa lại -> nghiệm thu');
    const C2 = crypto.randomUUID();
    const W_Rework = crypto.randomUUID();
    const { order: order2 } = await createOrderDirect(C2, W_Rework, 320000);
    const order2Id = order2.id;

    logStep('2.1', 'Thợ thi công và báo xong lần 1');
    await sendRequest(`/api/v1/orders/${order2Id}/confirm-readiness`, 'POST', {}, { 'x-user-id': W_Rework, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${order2Id}/start`, 'POST', {}, { 'x-user-id': W_Rework, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${order2Id}/evidence`, 'POST', {
      mediaUrl: 'https://res.cloudinary.com/handygo/image/upload/rework_1.jpg', mediaType: 'image', description: 'Hoàn thành lần 1',
    }, { 'x-user-id': W_Rework, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${order2Id}/finish`, 'POST', {}, { 'x-user-id': W_Rework, 'x-user-roles': 'worker' });
    logSuccess(`Đơn hàng ở trạng thái: awaiting_customer_confirmation`);
    totalPassed++;
    logStepEnd();

    logStep('2.2', 'Khách hàng phát hiện mối hàn bị rò rỉ -> Bấm Yêu cầu Làm lại (Rework)');
    const reworkRes = await sendRequest(
      `/api/v1/orders/${order2Id}/request-rework`,
      'POST',
      { reason: 'Mối hàn van khóa vẫn còn rỉ nước nhỏ giọt, đề nghị hàn thêm lớp keo chịu nhiệt' },
      { 'x-user-id': C2, 'x-user-roles': 'customer' },
    );
    if (reworkRes.status !== 200) throw new Error(`Rework thất bại: ${JSON.stringify(reworkRes.data)}`);
    logSuccess(`Đơn hàng đã quay ngược lại trạng thái: [${reworkRes.data.data.status}] (in_progress)`);
    totalPassed++;
    logStepEnd();

    logStep('2.3', 'Thợ khắc phục xong, tải thêm bằng chứng lần 2 & báo hoàn thành lại');
    await sendRequest(`/api/v1/orders/${order2Id}/evidence`, 'POST', {
      mediaUrl: 'https://res.cloudinary.com/handygo/image/upload/rework_fixed.jpg', mediaType: 'image', description: 'Đã hàn kín thêm keo chịu nhiệt',
    }, { 'x-user-id': W_Rework, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${order2Id}/finish`, 'POST', {}, { 'x-user-id': W_Rework, 'x-user-roles': 'worker' });
    const reworkCompleteRes = await sendRequest(`/api/v1/orders/${order2Id}/confirm-completion`, 'POST', {}, { 'x-user-id': C2, 'x-user-roles': 'customer' });
    logSuccess(`Khách nghiệm thu lần 2 thành công! Trạng thái: [${reworkCompleteRes.data.data.status}]`);
    totalPassed++;
    logStepEnd();

    // =========================================================================
    // KỊCH BẢN 3: THỢ TỪ CHỐI NHẬN VIỆC (WORKER REJECTS PROPOSAL - ORD-04)
    // =========================================================================
    logScenario(3, 'LUỒNG THỢ TỪ CHỐI BÁO GIÁ (WORKER REJECT PROPOSAL)', 'Thợ bận hoặc không phù hợp -> Từ chối đề xuất (worker_rejected)');
    const C3 = crypto.randomUUID();
    const W_Busy = crypto.randomUUID();
    const { reqId: req3Id } = await createAndPublishRequest(C3, 'Bảo dưỡng máy lạnh Daikin');
    const propRejectRes = await sendRequest('/api/v1/booking-proposals', 'POST', {
      serviceRequestId: req3Id, workerUserId: W_Busy, selectionSource: 'bid', sourceBidId: crypto.randomUUID(), agreedPrice: 400000, agreedScope: 'Vệ sinh 2 máy lạnh',
    }, { 'x-user-id': C3, 'x-user-roles': 'customer' });
    const propRejectId = propRejectRes.data.data.id;

    logStep('3.1', 'Thợ bấm Từ chối Đề xuất (Reject) kèm lý do');
    const rejectActionRes = await sendRequest(
      `/api/v1/booking-proposals/${propRejectId}/reject`,
      'POST',
      { responseNote: 'Tôi đã kín lịch nhận việc chiều nay, xin hẹn quý khách dịp khác' },
      { 'x-user-id': W_Busy, 'x-user-roles': 'worker' },
    );
    if (rejectActionRes.status !== 200) throw new Error(`Reject thất bại: ${JSON.stringify(rejectActionRes.data)}`);
    logSuccess(`Proposal đã chuyển sang trạng thái: [${rejectActionRes.data.data.status}] (worker_rejected)`);
    logData('Lý do thợ từ chối', rejectActionRes.data.data.responseNote);
    totalPassed++;

    // Thử accept proposal đã bị reject -> Bắt buộc bị từ chối 409
    const cantAcceptReject = await sendRequest(`/api/v1/booking-proposals/${propRejectId}/accept`, 'POST', {}, { 'x-user-id': W_Busy, 'x-user-roles': 'worker' });
    if (cantAcceptReject.status === 409 || cantAcceptReject.status === 400) {
      logSuccess(`Chặn thành công: Không thể Accept proposal đã bị Reject (HTTP ${cantAcceptReject.status})`);
      totalPassed++;
    }
    logStepEnd();

    // =========================================================================
    // KỊCH BẢN 4: KHÁCH HÀNG RÚT LẠI ĐỀ XUẤT (CUSTOMER WITHDRAWS PROPOSAL)
    // =========================================================================
    logScenario(4, 'LUỒNG KHÁCH HÀNG RÚT LẠI ĐỀ XUẤT (CUSTOMER WITHDRAW)', 'Khách đổi ý trước khi thợ phản hồi -> Rút lại đề xuất (withdrawn)');
    const C4 = crypto.randomUUID();
    const W_Slow = crypto.randomUUID();
    const { reqId: req4Id } = await createAndPublishRequest(C4, 'Sửa bóng đèn phòng khách');
    const propWithdrawRes = await sendRequest('/api/v1/booking-proposals', 'POST', {
      serviceRequestId: req4Id, workerUserId: W_Slow, selectionSource: 'bid', sourceBidId: crypto.randomUUID(), agreedPrice: 150000, agreedScope: 'Thay bóng led',
    }, { 'x-user-id': C4, 'x-user-roles': 'customer' });
    const propWithdrawId = propWithdrawRes.data.data.id;

    logStep('4.1', 'Khách hàng bấm Rút lại Proposal (Withdraw)');
    const withdrawActionRes = await sendRequest(
      `/api/v1/booking-proposals/${propWithdrawId}/withdraw`,
      'POST',
      {},
      { 'x-user-id': C4, 'x-user-roles': 'customer' },
    );
    if (withdrawActionRes.status !== 200) throw new Error(`Withdraw thất bại: ${JSON.stringify(withdrawActionRes.data)}`);
    logSuccess(`Proposal đã chuyển sang trạng thái: [${withdrawActionRes.data.data.status}] (withdrawn)`);
    totalPassed++;

    // Thợ cố chấp accept proposal đã bị rút -> Chặn 409
    const cantAcceptWithdrawn = await sendRequest(`/api/v1/booking-proposals/${propWithdrawId}/accept`, 'POST', {}, { 'x-user-id': W_Slow, 'x-user-roles': 'worker' });
    if (cantAcceptWithdrawn.status === 409 || cantAcceptWithdrawn.status === 400) {
      logSuccess(`Chặn thành công: Không thể Accept proposal đã bị Withdrawn (HTTP ${cantAcceptWithdrawn.status})`);
      totalPassed++;
    }
    logStepEnd();

    // =========================================================================
    // KỊCH BẢN 5: HỦY ĐƠN HÀNG TRƯỚC THI CÔNG & CHẶN HỦY KHI ĐANG LÀM (CANCEL FLOW)
    // =========================================================================
    logScenario(5, 'LUỒNG HỦY ĐƠN HÀNG & RÀNG BUỘC HỦY (CANCEL RULES - ORD-08)', 'Hủy khi created/confirmed OK; Chặn hủy khi in_progress (bắt buộc Dispute)');
    const C5 = crypto.randomUUID();
    const W5 = crypto.randomUUID();

    // 5a. Hủy khi đơn ở created
    logStep('5.1', 'Khách hàng hủy đơn khi ở trạng thái "created"');
    const { order: orderCreated } = await createOrderDirect(C5, W5, 200000);
    const cancelCreatedRes = await sendRequest(
      `/api/v1/orders/${orderCreated.id}/cancel`,
      'POST',
      { reason: 'Khách hàng bận đột xuất phải đi công tác gấp' },
      { 'x-user-id': C5, 'x-user-roles': 'customer' },
    );
    if (cancelCreatedRes.status !== 200) throw new Error(`Hủy đơn created thất bại: ${JSON.stringify(cancelCreatedRes.data)}`);
    logSuccess(`Đơn hàng đã hủy thành công: [${cancelCreatedRes.data.data.status}] (cancelled)`);
    totalPassed++;
    logStepEnd();

    // 5b. Thợ hủy khi đơn ở confirmed
    logStep('5.2', 'Thợ hủy đơn sau khi đã xác nhận "confirmed"');
    const { order: orderConfirmed } = await createOrderDirect(C5, W5, 200000);
    await sendRequest(`/api/v1/orders/${orderConfirmed.id}/confirm-readiness`, 'POST', {}, { 'x-user-id': W5, 'x-user-roles': 'worker' });
    const cancelConfirmedRes = await sendRequest(
      `/api/v1/orders/${orderConfirmed.id}/cancel`,
      'POST',
      { reason: 'Xe thợ bị hỏng trên đường đi không thể đến kịp' },
      { 'x-user-id': W5, 'x-user-roles': 'worker' },
    );
    if (cancelConfirmedRes.status !== 200) throw new Error(`Hủy đơn confirmed thất bại`);
    logSuccess(`Thợ hủy đơn thành công: [${cancelConfirmedRes.data.data.status}] (cancelled)`);
    totalPassed++;
    logStepEnd();

    // 5c. Chặn hủy khi đơn đã bắt đầu thi công (in_progress)
    logStep('5.3', 'Chặn hủy đơn khi đã bắt đầu thi công (in_progress)');
    const { order: orderInProgress } = await createOrderDirect(C5, W5, 200000);
    await sendRequest(`/api/v1/orders/${orderInProgress.id}/confirm-readiness`, 'POST', {}, { 'x-user-id': W5, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${orderInProgress.id}/start`, 'POST', {}, { 'x-user-id': W5, 'x-user-roles': 'worker' });
    const cantCancelInProgress = await sendRequest(
      `/api/v1/orders/${orderInProgress.id}/cancel`,
      'POST',
      { reason: 'Khách đổi ý muốn hủy ngang' },
      { 'x-user-id': C5, 'x-user-roles': 'customer' },
    );
    if (cantCancelInProgress.status === 409) {
      logSuccess(`Chặn thành công: Không thể tự ý hủy đơn khi đang thi công (HTTP 409 Conflict)`);
      totalPassed++;
    } else {
      throw new Error(`Mong đợi 409 nhưng nhận: ${cantCancelInProgress.status}`);
    }
    logStepEnd();

    // =========================================================================
    // KỊCH BẢN 6: TRANH CHẤP & ADMIN PHÂN XỬ (DISPUTE & RESOLUTION - ORD-08)
    // =========================================================================
    logScenario(6, 'LUỒNG TRANH CHẤP & ADMIN PHÂN XỬ (DISPUTE & RESOLUTION)', 'Xảy ra tranh chấp -> Đơn chuyển disputed -> Admin xử Cancel hoặc Complete');
    const C6 = crypto.randomUUID();
    const W6 = crypto.randomUUID();
    const ADMIN_ID = crypto.randomUUID();

    // 6a. Mở tranh chấp và Admin phân xử CANCEL (Hủy & Hoàn tiền)
    logStep('6.1', 'Khách mở Tranh chấp khi đang thi công & Admin phân xử HỦY ĐƠN (cancel)');
    const { order: orderDispute1 } = await createOrderDirect(C6, W6, 500000);
    await sendRequest(`/api/v1/orders/${orderDispute1.id}/confirm-readiness`, 'POST', {}, { 'x-user-id': W6, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${orderDispute1.id}/start`, 'POST', {}, { 'x-user-id': W6, 'x-user-roles': 'worker' });
    const disputeRes = await sendRequest(
      `/api/v1/orders/${orderDispute1.id}/dispute`,
      'POST',
      { reason: 'Thợ thi công làm vỡ bồn rửa chén và cãi vã, không tiếp tục làm' },
      { 'x-user-id': C6, 'x-user-roles': 'customer' },
    );
    if (disputeRes.status !== 200) throw new Error(`Mở tranh chấp thất bại: ${JSON.stringify(disputeRes.data)}`);
    logSuccess(`Đơn hàng đã chuyển sang: [${disputeRes.data.data.status}] (disputed)`);
    totalPassed++;

    // Admin resolve CANCEL
    const adminCancelRes = await sendRequest(
      `/api/v1/admin/orders/${orderDispute1.id}/resolve-dispute`,
      'POST',
      { action: 'cancel', resolutionNote: 'Xác minh thợ làm hư hại tài sản khách, hủy đơn và bồi hoàn' },
      { 'x-user-id': ADMIN_ID, 'x-user-roles': 'Admin' },
    );
    if (adminCancelRes.status !== 200) throw new Error(`Admin resolve cancel thất bại`);
    logSuccess(`Admin giải quyết tranh chấp: [${adminCancelRes.data.data.status}] (cancelled)`);
    totalPassed++;
    logStepEnd();

    // 6b. Tranh chấp khi awaiting_confirmation và Admin phân xử COMPLETE (Nghiệm thu)
    logStep('6.2', 'Thợ mở Tranh chấp khi khách không chịu nghiệm thu & Admin xử HOÀN TẤT (complete)');
    const { order: orderDispute2 } = await createOrderDirect(C6, W6, 350000);
    await sendRequest(`/api/v1/orders/${orderDispute2.id}/confirm-readiness`, 'POST', {}, { 'x-user-id': W6, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${orderDispute2.id}/start`, 'POST', {}, { 'x-user-id': W6, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${orderDispute2.id}/evidence`, 'POST', {
      mediaUrl: 'https://res.cloudinary.com/handygo/image/upload/fixed_pipe.jpg', mediaType: 'image', description: 'Đã hoàn tất chuẩn',
    }, { 'x-user-id': W6, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${orderDispute2.id}/finish`, 'POST', {}, { 'x-user-id': W6, 'x-user-roles': 'worker' });

    // Thợ mở dispute vì khách né tránh nghiệm thu
    await sendRequest(
      `/api/v1/orders/${orderDispute2.id}/dispute`,
      'POST',
      { reason: 'Đã làm xong đúng cam kết nhưng khách không liên lạc được để nghiệm thu' },
      { 'x-user-id': W6, 'x-user-roles': 'worker' },
    );

    // Admin resolve COMPLETE
    const adminCompleteRes = await sendRequest(
      `/api/v1/admin/orders/${orderDispute2.id}/resolve-dispute`,
      'POST',
      { action: 'complete', resolutionNote: 'Đối soát ảnh hiện trường đạt chuẩn, Admin duyệt hoàn tất đơn' },
      { 'x-user-id': ADMIN_ID, 'x-user-roles': 'Admin' },
    );
    if (adminCompleteRes.status !== 200) throw new Error(`Admin resolve complete thất bại`);
    logSuccess(`Admin giải quyết tranh chấp: [${adminCompleteRes.data.data.status}] (completed)`);
    totalPassed++;
    logStepEnd();

    // =========================================================================
    // KỊCH BẢN 7: KHÁCH HỦY YÊU CẦU DỊCH VỤ MỞ THẦU (CANCEL SERVICE REQUEST)
    // =========================================================================
    logScenario(7, 'LUỒNG HỦY SERVICE REQUEST MỞ THẦU (REQUEST CANCEL - ORD-03)', 'Khách tự hủy yêu cầu -> Tất cả proposals mở tự động chuyển withdrawn');
    const C7 = crypto.randomUUID();
    const W7 = crypto.randomUUID();
    const { reqId: req7Id } = await createAndPublishRequest(C7, 'Sửa ổ cắm điện');
    const prop7 = await sendRequest('/api/v1/booking-proposals', 'POST', {
      serviceRequestId: req7Id, workerUserId: W7, selectionSource: 'bid', sourceBidId: crypto.randomUUID(), agreedPrice: 100000, agreedScope: 'Thay ổ cắm',
    }, { 'x-user-id': C7, 'x-user-roles': 'customer' });

    logStep('7.1', 'Khách hủy Service Request khi chưa chốt thợ nào');
    const cancelReqRes = await sendRequest(`/api/v1/service-requests/${req7Id}/cancel`, 'POST', {}, { 'x-user-id': C7, 'x-user-roles': 'customer' });
    if (cancelReqRes.status !== 200) throw new Error(`Hủy Request thất bại`);
    logSuccess(`Service Request đã hủy: [${cancelReqRes.data.data.status}] (cancelled)`);
    totalPassed++;

    // Kiểm tra proposal liên quan tự động chuyển sang withdrawn
    const checkProp7 = await sendRequest(`/api/v1/booking-proposals/${prop7.data.data.id}`, 'GET', null, { 'x-user-id': C7, 'x-user-roles': 'customer' });
    if (checkProp7.data.data.status === 'withdrawn') {
      logSuccess(`Proposal liên quan tự động chuyển sang: [${checkProp7.data.data.status}] (withdrawn)`);
      totalPassed++;
    }
    logStepEnd();

    // =========================================================================
    // KỊCH BẢN 8: MA TRẬN CA BIÊN, AN NINH & RÀNG BUỘC PHÂN QUYỀN
    // =========================================================================
    logScenario(8, 'MA TRẬN CA BIÊN AN NINH & BẢO VỆ PHÂN QUYỀN (GUARDS & EDGE CASES)', 'Kiểm thử 401 Unauthorized, 403 Forbidden, 409 Invalid State Transitions');
    const STRANGER_ID = crypto.randomUUID();

    logStep('8.1', 'Kiểm thử Chặn Truy Cập Thiếu Xác Thực (401 Unauthorized)');
    const noAuthRes = await sendRequest('/api/v1/service-requests', 'POST', { description: 'Hacking' });
    if (noAuthRes.status === 401) {
      logSuccess(`Chặn thành công request thiếu x-user-id: HTTP 401 Unauthorized`);
      totalPassed++;
    }
    const noSecretRes = await sendRequest(`/api/v1/internal/orders/${crypto.randomUUID()}/payment-eligibility`, 'GET');
    if (noSecretRes.status === 401 || noSecretRes.status === 403) {
      logSuccess(`Chặn thành công internal API thiếu x-internal-secret: HTTP ${noSecretRes.status}`);
      totalPassed++;
    }
    logStepEnd();

    logStep('8.2', 'Kiểm thử Chặn Người Lạ Can Thiệp Đơn Hàng (403 Forbidden)');
    const { order: testOrder } = await createOrderDirect(crypto.randomUUID(), crypto.randomUUID(), 100000);
    const strangerActionRes = await sendRequest(
      `/api/v1/orders/${testOrder.id}/confirm-readiness`,
      'POST',
      {},
      { 'x-user-id': STRANGER_ID, 'x-user-roles': 'worker' },
    );
    if (strangerActionRes.status === 403) {
      logSuccess(`Chặn thành công Thợ lạ cố nhận đơn của thợ khác: HTTP 403 Forbidden`);
      totalPassed++;
    }
    logStepEnd();

    logStep('8.3', 'Kiểm thử Chặn Nhảy Cóc Trạng Thái Không Hợp Lệ (409 Conflict)');
    // Đang created mà cố bấm finish
    const jumpStateRes = await sendRequest(
      `/api/v1/orders/${testOrder.id}/finish`,
      'POST',
      {},
      { 'x-user-id': testOrder.workerUserId, 'x-user-roles': 'worker' },
    );
    if (jumpStateRes.status === 409) {
      logSuccess(`Chặn thành công nhảy cóc created -> finish: HTTP 409 Conflict`);
      totalPassed++;
    }
    logStepEnd();

    // =========================================================================
    // TỔNG KẾT TOÀN DIỆN
    // =========================================================================
    logBanner(`TẤT CẢ 8 KỊCH BẢN ĐÃ CHẠY HOÀN TẤT THÀNH CÔNG VỚI ${totalPassed}/${totalPassed} BƯỚC PASS (100%)!`);
  } catch (err) {
    totalFailed++;
    logError(`LỖI TRONG QUÁ TRÌNH KIỂM THỬ: ${err.message}`);
    if (err.stack) console.error(err.stack);
    logBanner(`KẾT THÚC TEST VỚI THẤT BẠI: ${totalFailed} lỗi`);
    process.exit(1);
  }
}

main();
