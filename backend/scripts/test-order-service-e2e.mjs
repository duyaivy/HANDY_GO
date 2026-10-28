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
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

function logStep(num, title) {
  console.log(`\n${BOLD}${CYAN}[Bước ${num}]${RESET} ${BOLD}${title}${RESET}`);
}

function logSuccess(msg) {
  console.log(`  ${GREEN}✔ ${msg}${RESET}`);
}

function logWarning(msg) {
  console.log(`  ${YELLOW}⚠ ${msg}${RESET}`);
}

function logError(msg) {
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

async function checkHealth() {
  try {
    const res = await sendRequest('/health');
    return res.status === 200;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}${CYAN}   HANDY GO — E2E LIVE TEST SUITE: ORDER SERVICE (HG-32)       ${RESET}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${GRAY}Target Base URL: ${BASE_URL}${RESET}`);

  // 0. Healthcheck
  const isAlive = await checkHealth();
  if (!isAlive) {
    logError(`Không thể kết nối tới Order Service tại ${BASE_URL}!`);
    console.log(`\n${YELLOW}${BOLD}Hướng dẫn khởi động service:${RESET}`);
    console.log(`  Mở terminal và chạy lệnh:`);
    console.log(`  ${BOLD}pnpm exec nest start --watch order-service${RESET}\n`);
    process.exit(1);
  }
  logSuccess('Order Service đang hoạt động (Healthcheck OK)');

  const CUSTOMER_ID = crypto.randomUUID();
  const WORKER_ID = crypto.randomUUID();
  const WORKER_2_ID = crypto.randomUUID();
  const ADMIN_ID = crypto.randomUUID();
  const SERVICE_ID = crypto.randomUUID();
  const SOURCE_BID_ID = crypto.randomUUID();

  console.log(`${GRAY}Actors giả lập:${RESET}`);
  console.log(`  - Customer: ${CUSTOMER_ID}`);
  console.log(`  - Worker 1: ${WORKER_ID}`);
  console.log(`  - Worker 2: ${WORKER_2_ID}`);
  console.log(`  - Admin:    ${ADMIN_ID}`);

  let testPassed = 0;
  let testFailed = 0;

  try {
    // -------------------------------------------------------------
    // Bước 1: Khách tạo nháp Yêu cầu Dịch vụ (ORD-02)
    // -------------------------------------------------------------
    logStep(1, 'Khách hàng tạo Draft Service Request kèm Media...');
    const draftRes = await sendRequest(
      '/api/v1/service-requests',
      'POST',
      {
        serviceId: SERVICE_ID,
        description: 'Sửa đường ống nước bị rò rỉ bồn rửa chén',
        addressText: '123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu, Đà Nẵng',
        latitude: 16.0748,
        longitude: 108.1499,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
        aiRefPriceMin: 200000,
        aiRefPriceMax: 350000,
        media: [
          {
            mediaUrl: 'https://res.cloudinary.com/handygo/image/upload/sample_pipe.webp',
            mediaType: 'image',
          },
        ],
      },
      {
        'x-user-id': CUSTOMER_ID,
        'x-user-roles': 'customer',
      },
    );

    if (draftRes.status !== 201 && draftRes.status !== 200) {
      throw new Error(`Tạo Draft thất bại: HTTP ${draftRes.status} - ${JSON.stringify(draftRes.data)}`);
    }
    const request = draftRes.data.data;
    const requestId = request.id;
    logSuccess(`Tạo thành công Request ID: ${requestId} (Mã: ${request.requestCode}, Trạng thái: ${request.status})`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 2: Khách xuất bản Request (ORD-03)
    // -------------------------------------------------------------
    logStep(2, 'Khách hàng Xuất bản Request (Publish)...');
    const pubRes = await sendRequest(
      `/api/v1/service-requests/${requestId}/publish`,
      'POST',
      {},
      {
        'x-user-id': CUSTOMER_ID,
        'x-user-roles': 'customer',
      },
    );

    if (pubRes.status !== 200) {
      throw new Error(`Publish thất bại: HTTP ${pubRes.status} - ${JSON.stringify(pubRes.data)}`);
    }
    const pubData = pubRes.data.data;
    if (pubData.status !== 'open_for_bidding') {
      throw new Error(`Trạng thái không phải open_for_bidding, nhận được: ${pubData.status}`);
    }
    logSuccess(`Request chuyển sang: ${pubData.status}`);
    logSuccess(`Hạn nhận báo giá (24h):   ${pubData.biddingClosesAt}`);
    logSuccess(`Hạn chọn thợ (24h+24h):    ${pubData.selectionExpiresAt}`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 3: Khách gửi Báo giá Đề xuất Revision 1 (ORD-04)
    // -------------------------------------------------------------
    logStep(3, 'Khách hàng gửi Booking Proposal cho Worker 1 (Revision 1)...');
    const prop1Res = await sendRequest(
      '/api/v1/booking-proposals',
      'POST',
      {
        serviceRequestId: requestId,
        workerUserId: WORKER_ID,
        selectionSource: 'bid',
        sourceBidId: SOURCE_BID_ID,
        agreedPrice: 250000,
        agreedScope: 'Thay thế cụm van khóa và nối ống ruột gà bồn rửa',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        'x-user-id': CUSTOMER_ID,
        'x-user-roles': 'customer',
      },
    );

    if (prop1Res.status !== 201) {
      throw new Error(`Tạo Proposal 1 thất bại: HTTP ${prop1Res.status} - ${JSON.stringify(prop1Res.data)}`);
    }
    const proposal1 = prop1Res.data.data;
    const proposal1Id = proposal1.id;
    logSuccess(`Tạo thành công Proposal 1: ${proposal1Id} (Revision: ${proposal1.revisionNo}, Giá: ${proposal1.agreedPrice})`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 4: Worker 1 Yêu cầu sửa điều khoản (ORD-05)
    // -------------------------------------------------------------
    logStep(4, 'Worker 1 Yêu cầu điều chỉnh điều khoản (Request Changes)...');
    const reqChangesRes = await sendRequest(
      `/api/v1/booking-proposals/${proposal1Id}/request-changes`,
      'POST',
      {
        responseNote: 'Đoạn ống âm tường bị nứt, xin tăng giá vật tư lên 300.000đ',
      },
      {
        'x-user-id': WORKER_ID,
        'x-user-roles': 'worker',
      },
    );

    if (reqChangesRes.status !== 200) {
      throw new Error(`Request changes thất bại: HTTP ${reqChangesRes.status} - ${JSON.stringify(reqChangesRes.data)}`);
    }
    logSuccess(`Proposal 1 chuyển sang trạng thái: ${reqChangesRes.data.data.status}`);
    logSuccess(`Ghi chú phản hồi: "${reqChangesRes.data.data.responseNote}"`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 5: Khách gửi Proposal Revision 2 (ORD-05)
    // -------------------------------------------------------------
    logStep(5, 'Khách hàng gửi Revision 2 theo giá mới...');
    const prop2Res = await sendRequest(
      '/api/v1/booking-proposals',
      'POST',
      {
        serviceRequestId: requestId,
        supersedesProposalId: proposal1Id,
        workerUserId: WORKER_ID,
        selectionSource: 'bid',
        sourceBidId: SOURCE_BID_ID,
        agreedPrice: 300000,
        agreedScope: 'Thay thế cụm van khóa và hàn lại đoạn ống nứt',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        'x-user-id': CUSTOMER_ID,
        'x-user-roles': 'customer',
      },
    );

    if (prop2Res.status !== 201) {
      throw new Error(`Tạo Revision 2 thất bại: HTTP ${prop2Res.status} - ${JSON.stringify(prop2Res.data)}`);
    }
    const proposal2 = prop2Res.data.data;
    const proposal2Id = proposal2.id;
    logSuccess(`Tạo thành công Revision 2: ${proposal2Id} (Revision: ${proposal2.revisionNo}, Giá: ${proposal2.agreedPrice})`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 6: Khách tạo thêm Proposal cho Worker 2 để kiểm tra Superseded
    // -------------------------------------------------------------
    logStep(6, 'Tạo Proposal phụ cho Worker 2 để kiểm thử tính năng Tự động Superseded...');
    const propWorker2Res = await sendRequest(
      '/api/v1/booking-proposals',
      'POST',
      {
        serviceRequestId: requestId,
        workerUserId: WORKER_2_ID,
        selectionSource: 'bid',
        sourceBidId: crypto.randomUUID(),
        agreedPrice: 320000,
        agreedScope: 'Báo giá phụ dự phòng',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      },
      {
        'x-user-id': CUSTOMER_ID,
        'x-user-roles': 'customer',
      },
    );
    const proposalWorker2Id = propWorker2Res.data.data.id;
    logSuccess(`Tạo Proposal phụ Worker 2: ${proposalWorker2Id}`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 7: Worker 1 Accept Proposal -> Chốt đơn nguyên tử (ORD-06)
    // -------------------------------------------------------------
    logStep(7, 'Worker 1 Chấp nhận đề xuất -> Kích hoạt Giao dịch Chốt đơn ACID (ORD-06)...');
    const acceptRes = await sendRequest(
      `/api/v1/booking-proposals/${proposal2Id}/accept`,
      'POST',
      {},
      {
        'x-user-id': WORKER_ID,
        'x-user-roles': 'worker',
      },
    );

    if (acceptRes.status !== 200 && acceptRes.status !== 201) {
      throw new Error(`Accept Proposal thất bại: HTTP ${acceptRes.status} - ${JSON.stringify(acceptRes.data)}`);
    }
    const order = acceptRes.data.data;
    const orderId = order.id;
    logSuccess(`TẠO ĐƠN HÀNG THÀNH CÔNG: Mã ${order.orderCode} (ID: ${orderId})`);
    logSuccess(`Trạng thái ban đầu: ${order.status}, Thanh toán: ${order.paymentState}`);
    logSuccess(`Giá chốt hợp đồng: ${order.agreedPrice} VNĐ`);
    testPassed++;

    // Kiểm tra proposal phụ của Worker 2 tự động chuyển sang superseded
    const checkProp2 = await sendRequest(`/api/v1/booking-proposals/${proposalWorker2Id}`, 'GET', null, {
      'x-user-id': CUSTOMER_ID,
      'x-user-roles': 'customer',
    });
    if (checkProp2.data.data.status === 'superseded') {
      logSuccess(`Xác minh: Proposal phụ của Worker 2 đã tự động chuyển sang 'superseded'`);
    } else {
      logWarning(`Proposal phụ có trạng thái: ${checkProp2.data.data.status}`);
    }

    // -------------------------------------------------------------
    // Bước 8: Kiểm thử Ca Biên: Chống Double Order (Race Condition Protection)
    // -------------------------------------------------------------
    logStep(8, 'Kiểm thử Chống Tạo Trùng Đơn Hàng (Double Order Protection)...');
    const doubleAcceptRes = await sendRequest(
      `/api/v1/booking-proposals/${proposalWorker2Id}/accept`,
      'POST',
      {},
      {
        'x-user-id': WORKER_2_ID,
        'x-user-roles': 'worker',
      },
    );
    if (doubleAcceptRes.status === 409 || doubleAcceptRes.status === 400) {
      logSuccess(`Hệ thống chặn thành công với HTTP ${doubleAcceptRes.status} (Mã lỗi: ${doubleAcceptRes.data?.code || 'CONFLICT'})`);
      testPassed++;
    } else {
      throw new Error(`Mong đợi chặn 409 Conflict nhưng nhận HTTP ${doubleAcceptRes.status}`);
    }

    // -------------------------------------------------------------
    // Bước 9: Worker 1 Xác nhận sẵn sàng (ORD-07)
    // -------------------------------------------------------------
    logStep(9, 'Worker 1 Xác nhận sẵn sàng thi công (Confirm Readiness)...');
    const confirmRes = await sendRequest(
      `/api/v1/orders/${orderId}/confirm-readiness`,
      'POST',
      {},
      {
        'x-user-id': WORKER_ID,
        'x-user-roles': 'worker',
      },
    );
    if (confirmRes.status !== 200) {
      throw new Error(`Confirm readiness thất bại: HTTP ${confirmRes.status}`);
    }
    logSuccess(`Đơn hàng chuyển sang: ${confirmRes.data.data.status}`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 10: Worker 1 Bắt đầu thi công (ORD-07)
    // -------------------------------------------------------------
    logStep(10, 'Worker 1 Bắt đầu thi công (Start)...');
    const startRes = await sendRequest(
      `/api/v1/orders/${orderId}/start`,
      'POST',
      {},
      {
        'x-user-id': WORKER_ID,
        'x-user-roles': 'worker',
      },
    );
    if (startRes.status !== 200) {
      throw new Error(`Start order thất bại: HTTP ${startRes.status}`);
    }
    logSuccess(`Đơn hàng chuyển sang: ${startRes.data.data.status}`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 11: Kiểm thử Ca Biên: Báo xong khi thiếu Evidence (ORD-10 Guard)
    // -------------------------------------------------------------
    logStep(11, 'Kiểm thử Chặn Báo Xong khi THIẾU MINH CHỨNG (Missing Evidence Guard)...');
    const finishFailRes = await sendRequest(
      `/api/v1/orders/${orderId}/finish`,
      'POST',
      {},
      {
        'x-user-id': WORKER_ID,
        'x-user-roles': 'worker',
      },
    );
    if (finishFailRes.status === 400) {
      logSuccess(`Hệ thống chặn thành công với HTTP 400 (Lý do: ${finishFailRes.data?.message || finishFailRes.data?.code})`);
      testPassed++;
    } else {
      throw new Error(`Mong đợi chặn HTTP 400 nhưng nhận ${finishFailRes.status}`);
    }

    // -------------------------------------------------------------
    // Bước 12: Worker 1 Nộp ảnh minh chứng hoàn thành (ORD-10)
    // -------------------------------------------------------------
    logStep(12, 'Worker 1 Đính kèm Evidence minh chứng hoàn thành...');
    const evidRes = await sendRequest(
      `/api/v1/orders/${orderId}/evidence`,
      'POST',
      {
        mediaUrl: 'https://res.cloudinary.com/handygo/image/upload/fixed_pipe.webp',
        mediaType: 'image',
        description: 'Ảnh hiện trường sau khi hàn gắn đường ống và mở thử van nước không còn rò rỉ',
      },
      {
        'x-user-id': WORKER_ID,
        'x-user-roles': 'worker',
      },
    );
    if (evidRes.status !== 201) {
      throw new Error(`Upload evidence thất bại: HTTP ${evidRes.status}`);
    }
    logSuccess(`Đã lưu Evidence ID: ${evidRes.data.data.id}`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 13: Worker 1 Báo hoàn thành hợp lệ (ORD-07)
    // -------------------------------------------------------------
    logStep(13, 'Worker 1 Báo hoàn thành công việc (Finish)...');
    const finishOkRes = await sendRequest(
      `/api/v1/orders/${orderId}/finish`,
      'POST',
      {},
      {
        'x-user-id': WORKER_ID,
        'x-user-roles': 'worker',
      },
    );
    if (finishOkRes.status !== 200) {
      throw new Error(`Finish thất bại: HTTP ${finishOkRes.status}`);
    }
    logSuccess(`Đơn hàng chuyển sang: ${finishOkRes.data.data.status}`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 14: Khách hàng Nghiệm thu Đơn hàng (ORD-07)
    // -------------------------------------------------------------
    logStep(14, 'Khách hàng Xác nhận Nghiệm thu & Hoàn tất (Confirm Completion)...');
    const completeRes = await sendRequest(
      `/api/v1/orders/${orderId}/confirm-completion`,
      'POST',
      {},
      {
        'x-user-id': CUSTOMER_ID,
        'x-user-roles': 'customer',
      },
    );
    if (completeRes.status !== 200) {
      throw new Error(`Complete order thất bại: HTTP ${completeRes.status}`);
    }
    logSuccess(`ĐƠN HÀNG ĐÃ HOÀN TẤT THÀNH CÔNG: Trạng thái: ${completeRes.data.data.status}`);
    logSuccess(`Thời gian hoàn thành: ${completeRes.data.data.completedAt}`);
    testPassed++;

    // -------------------------------------------------------------
    // Bước 15: Kiểm tra Lịch sử Dòng thời gian Trạng thái (ORD-08)
    // -------------------------------------------------------------
    logStep(15, 'Tra cứu Lịch sử Dòng thời gian trạng thái (Status History)...');
    const historyRes = await sendRequest(
      `/api/v1/orders/${orderId}/status-history`,
      'GET',
      null,
      {
        'x-user-id': CUSTOMER_ID,
        'x-user-roles': 'customer',
      },
    );
    if (historyRes.status !== 200) {
      throw new Error(`Get history thất bại: HTTP ${historyRes.status}`);
    }
    const historyList = historyRes.data.data;
    logSuccess(`Tổng số bước chuyển trạng thái đã ghi nhận: ${historyList.length}`);
    historyList.forEach((h, idx) => {
      console.log(`     [${idx + 1}] ${h.fromStatus || 'NULL'} -> ${h.toStatus} (${h.createdAt})`);
    });
    testPassed++;

    // -------------------------------------------------------------
    // Bước 16: Kiểm tra Internal API Quyết toán tiền (ORD-09)
    // -------------------------------------------------------------
    logStep(16, 'Kiểm tra Internal API /internal/orders/:id/payment-eligibility...');
    // Ca 16a: Không có secret -> 401 hoặc 403
    const noSecretRes = await sendRequest(`/api/v1/internal/orders/${orderId}/payment-eligibility`, 'GET');
    if (noSecretRes.status === 401 || noSecretRes.status === 403) {
      logSuccess(`Xác minh: Chặn thành công request thiếu x-internal-secret (HTTP ${noSecretRes.status})`);
    } else {
      logWarning(`Mong đợi 401/403 khi thiếu secret nhưng nhận: ${noSecretRes.status}`);
    }

    // Ca 16b: Có secret hợp lệ -> trả về string decimal chính xác
    const secretRes = await sendRequest(
      `/api/v1/internal/orders/${orderId}/payment-eligibility`,
      'GET',
      null,
      {
        'x-internal-secret': INTERNAL_SECRET,
      },
    );
    if (secretRes.status === 200) {
      const eligibility = secretRes.data.data || secretRes.data;
      if (typeof eligibility.agreedPrice !== 'string') {
        throw new Error(`agreedPrice PHẢI là chuỗi Decimal string, nhưng nhận kiểu: ${typeof eligibility.agreedPrice} - ${JSON.stringify(eligibility)}`);
      }
      logSuccess(`Quyết toán tiền hợp lệ: isEligible = ${eligibility.isEligible}`);
      logSuccess(`agreedPrice chuẩn kế toán: "${eligibility.agreedPrice}" (Type: string)`);
      testPassed++;
    } else {
      throw new Error(`Internal API trả về HTTP ${secretRes.status}`);
    }

    // -------------------------------------------------------------
    // Bước 17: Kiểm thử Toàn diện Luồng Tranh chấp & Admin Giải quyết (Dispute Lifecycle)
    // -------------------------------------------------------------
    logStep(17, 'Kiểm thử Luồng Khiếu nại Tranh chấp & Admin Giải quyết (Dispute Flow)...');
    // Tạo nhanh 1 Order mới để test dispute
    const reqD = await sendRequest(
      '/api/v1/service-requests',
      'POST',
      {
        serviceId: SERVICE_ID,
        description: 'Đơn thứ 2 dùng để kiểm thử Tranh chấp',
        addressText: '456 Điện Biên Phủ, Đà Nẵng',
        latitude: 16.06,
        longitude: 108.2,
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      },
      { 'x-user-id': CUSTOMER_ID, 'x-user-roles': 'customer' },
    );
    const reqDId = reqD.data.data.id;
    await sendRequest(`/api/v1/service-requests/${reqDId}/publish`, 'POST', {}, { 'x-user-id': CUSTOMER_ID, 'x-user-roles': 'customer' });
    const propD = await sendRequest(
      '/api/v1/booking-proposals',
      'POST',
      {
        serviceRequestId: reqDId,
        workerUserId: WORKER_ID,
        selectionSource: 'bid',
        sourceBidId: crypto.randomUUID(),
        agreedPrice: 500000,
        agreedScope: 'Bảo dưỡng điều hòa',
      },
      { 'x-user-id': CUSTOMER_ID, 'x-user-roles': 'customer' },
    );
    const orderDRes = await sendRequest(
      `/api/v1/booking-proposals/${propD.data.data.id}/accept`,
      'POST',
      {},
      { 'x-user-id': WORKER_ID, 'x-user-roles': 'worker' },
    );
    const orderDId = orderDRes.data.data.id;
    await sendRequest(`/api/v1/orders/${orderDId}/confirm-readiness`, 'POST', {}, { 'x-user-id': WORKER_ID, 'x-user-roles': 'worker' });
    await sendRequest(`/api/v1/orders/${orderDId}/start`, 'POST', {}, { 'x-user-id': WORKER_ID, 'x-user-roles': 'worker' });

    // Khách mở Tranh chấp
    const disputeRes = await sendRequest(
      `/api/v1/orders/${orderDId}/dispute`,
      'POST',
      {
        reason: 'Thợ làm gãy cánh quạt dàn lạnh và không đồng ý đền bù',
      },
      {
        'x-user-id': CUSTOMER_ID,
        'x-user-roles': 'customer',
      },
    );
    if (disputeRes.status !== 200) {
      throw new Error(`Mở tranh chấp thất bại: HTTP ${disputeRes.status}`);
    }
    logSuccess(`Đơn hàng chuyển sang: ${disputeRes.data.data.status} (disputePreviousStatus: ${disputeRes.data.data.disputePreviousStatus})`);

    // Admin can thiệp giải quyết
    const resolveRes = await sendRequest(
      `/api/v1/admin/orders/${orderDId}/resolve-dispute`,
      'POST',
      {
        action: 'complete',
        resolutionNote: 'Admin đã hòa giải và thợ đã thay mới cánh quạt, hoàn tất nghiệm thu',
      },
      {
        'x-user-id': ADMIN_ID,
        'x-user-roles': 'admin',
      },
    );
    if (resolveRes.status !== 200) {
      throw new Error(`Admin giải quyết tranh chấp thất bại: HTTP ${resolveRes.status}`);
    }
    logSuccess(`Admin giải quyết tranh chấp thành công: Trạng thái mới: ${resolveRes.data.data.status}`);
    testPassed++;

  } catch (err) {
    testFailed++;
    logError(`LỖI TRONG QUÁ TRÌNH KIỂM THỬ: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Tổng Kết
  // -------------------------------------------------------------
  console.log(`\n${BOLD}${CYAN}================================================================${RESET}`);
  console.log(`${BOLD}KẾT QUẢ KIỂM THỬ E2E ORDER SERVICE:${RESET}`);
  console.log(`  ${GREEN}✔ Số bước thành công:${RESET} ${testPassed}`);
  console.log(`  ${testFailed > 0 ? RED : GREEN}${testFailed > 0 ? '✖' : '✔'} Số bước thất bại:${RESET}   ${testFailed}`);
  console.log(`${BOLD}${CYAN}================================================================${RESET}\n`);

  if (testFailed === 0) {
    console.log(`${BOLD}${GREEN}🎉 CHÚC MỪNG! TOÀN BỘ LUỒNG E2E ĐÃ VƯỢT QUA KIỂM THỬ 100%!${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${BOLD}${RED}ĐÃ XẢY RA LỖI TRONG KỊCH BẢN E2E. VUI LÒNG KIỂM TRA LẠI LOG Ở TRÊN.${RESET}\n`);
    process.exit(1);
  }
}

main();
