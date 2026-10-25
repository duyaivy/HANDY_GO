# BÁO CÁO CẢI TIẾN & XỬ LÝ TRIỆT ĐỂ BIDDING SERVICE (HG-48)

Tài liệu này tổng hợp chi tiết bằng chứng kỹ thuật và kết quả xử lý triệt để 13 findings gốc (F01–F13), 6 nhóm lỗi P1 (R01–R06), và 3 lỗi P2 (N01–N03) của Bidding Service theo đúng mã finding và đối chiếu từ báo cáo review PR #28.

---

## 1. ĐỐI CHIẾU VÀ KHẮC PHỤC TRIỆT ĐỂ TỪNG FINDING

### Nhóm P1: F03 / R01 — Object Authorization & Sealed-Bid Masking
- **Vấn đề ban đầu:** `canSeeRealPrice` chỉ kiểm tra `isCustomerOrAdmin || isOwnerWorker`, cho phép Customer bất kỳ (không sở hữu request) hoặc tài khoản dual-role đọc giá thực của đối thủ. Các endpoint đọc cũng không xác minh `x-internal-secret` từ API Gateway, tạo nguy cơ lộ giá khi truy cập trực tiếp port service.
- **Giải pháp triệt để:**
  1. Thêm cột `customerId` vào bảng `bidding_rounds` (Prisma schema & migration) và tự động ghi nhận khi nhận sự kiện `service_request.published`.
  2. Bổ sung `isTrustedGateway(internalSecret, expectedSecret)` sử dụng `crypto.timingSafeEqual` trong `security.util.ts`.
  3. Trong `bids.service.ts` (`getBidsForRequest` và `getBidById`): Nếu không có secret hợp lệ từ API Gateway, toàn bộ identity headers bị vô hiệu hóa (chống giả mạo direct-port).
  4. Quyền xem giá thực chỉ dành riêng cho:
     - Admin / Operator hệ thống.
     - Customer chính chủ sở hữu Request (`round.customerId === verifiedUserId`).
     - Worker sở hữu chính báo giá đó (`b.workerId === verifiedUserId`).
     - Mọi đối tượng khác (thợ đối thủ, customer khác, dual-role không phải chủ) đều bị mask giá (`amount: 0`, `isMasked: true`).
- **File sửa đổi:** `schema.prisma`, `bids.service.ts`, `bids.controller.ts`, `security.util.ts`.
- **Bằng chứng test:** Test suite trong `bids.service.spec.ts` chứng minh customer khác và direct port bị mask hoàn toàn.

---

### Nhóm P1: F04 / R02 — Request / Worker Eligibility Fail-Closed
- **Vấn đề ban đầu:** Khi Order Service gặp sự cố mạng hoặc trả 5xx, client bắt lỗi và return `{ eligible: true }` (fail-open), cho phép Worker gửi bid dù không đủ điều kiện. Tiền tố endpoint cũng bị lệch (`/internal/...` thay vì `/api/v1/internal/...`), và gọi `getUrl('orderService')` gây crash khi thiếu config.
- **Giải pháp triệt để:**
  1. Chuyển đổi 100% sang **Strictly Fail-Closed**: Khi mạng lỗi, timeout hoặc 5xx từ Order Service, ném `ServiceUnavailableException('Không thể xác minh tính hợp lệ của yêu cầu dịch vụ. Vui lòng thử lại sau.')`.
  2. Chuẩn hóa đường dẫn gọi nội bộ sang `/api/v1/internal/service-requests/${serviceRequestId}/bidding-eligibility?workerId=${workerId}`.
  3. Lấy URL an toàn qua `this.config.get('ORDER_SERVICE_URL') || 'http://localhost:3004'`, không ném ngoại lệ trước khối `try-catch`.
- **File sửa đổi:** `request-eligibility-verifier.service.ts`.

---

### Nhóm P1: F06 / R03 — Concurrency Control & Serialization cho Round Lifecycle
- **Vấn đề ban đầu:** `expireRoundIfNeeded` cập nhật qua `UPDATE WHERE id`, có thể ghi đè một round đã được `finalized` hoặc `cancelled` thành `no_bid`/`closed`. Luồng `submitBid` tăng `bidCount` nhưng không xác thực lại round còn mở hay không sau khi đọc.
- **Giải pháp triệt để:**
  1. Trong `expireRoundIfNeeded`: Sử dụng Atomic CAS `updateMany({ where: { id: round.id, status: 'open', closesAt: { lte: now } }, data: { status: newStatus } })`. Nếu `count === 0` (round đã finalized/cancelled/extended đồng thời), giữ nguyên trạng thái hiện tại, không ghi đè.
  2. Trong `submitBid`: Cập nhật `bidCount` bằng CAS `updateMany({ where: { id: round.id, status: 'open', closesAt: { gt: now } }, data: { bidCount: { increment: 1 } } })`. Nếu count === 0, hủy giao dịch và ném `BadRequestException('Phiên đấu giá đã kết thúc hoặc không còn nhận báo giá')`.
- **File sửa đổi:** `rounds.service.ts`, `bids.service.ts`.

---

### Nhóm P1: F07 / R04 — Atomic Inbox Transactional Integration
- **Vấn đề ban đầu:** Consumer kiểm tra và ghi nhận `consumed_events` tách biệt ngoài domain transaction, và nuốt toàn bộ exception khi ghi nhận marker; các phương thức của `RoundsService` không nhận `eventId`.
- **Giải pháp triệt để:**
  1. Truyền bắt buộc `eventId` từ Event Envelope vào `openRound`, `cancelRound`, `finalizeRound`.
  2. Thực hiện ghi nhận `tx.consumedEvent.create(...)` bên trong cùng Prisma interactive transaction với aggregate domain và outbox event.
  3. Xử lý lỗi trùng lặp khóa (unique conflict P2002) bằng cách log idempotent và return aggregate hiện tại; mọi lỗi DB khác đều throw để transaction rollback và message được xử lý retry an toàn.
  4. Replay event không được phép reset deadline hoặc phát lại sự kiện opened.
- **File sửa đổi:** `bidding-events.consumer.ts`, `rounds.service.ts`.

---

### Nhóm P1: F09 / R05 — Validate Winner & Finalization Constraints
- **Vấn đề ban đầu:** `finalizeRound` chỉ dùng `WHERE id = selectedBidId` để cập nhật trạng thái, không xác thực bid có thuộc đúng phiên đấu giá hay đúng request hay không; không kiểm tra khớp `winningWorkerId`.
- **Giải pháp triệt để:**
  1. Validate nghiêm ngặt `selectedBid`: Phải tồn tại, thuộc đúng round (`biddingRoundId === round.id`) và đúng yêu cầu (`serviceRequestId === params.serviceRequestId`).
  2. Đối chiếu `winningWorkerId`: Nếu có truyền `winningWorkerId`, bắt buộc phải khớp với `selectedBid.workerId`, nếu không ném `BadRequestException`.
  3. Bắt buộc lưu trữ `orderId` và chống xung đột: Nếu round đã ở trạng thái `cancelled`, từ chối finalize.
- **File sửa đổi:** `rounds.service.ts`.

---

### Nhóm P1: F10 / R06 — Bounded Consumer Retry & Quản lý DLQ
- **Vấn đề ban đầu:** Consumer gọi `nack(requeue: true)` khi `x-death < 3`, nhưng requeue trực tiếp không tăng header `x-death`, dẫn đến vòng lặp vô hạn. Toàn bộ exception đều bị đánh dấu là transient.
- **Giải pháp triệt để:**
  1. Quản lý số lần retry qua `retryAttempts: Map<string, number>` với giới hạn tối đa `MAX_RETRIES = 3`.
  2. Đối với transient errors (mạng, timeout DB): Requeue nếu số lần retry < 3; khi đạt ngưỡng 3 lần, thực hiện `nack(requeue: false)` để RabbitMQ đẩy message vào Dead Letter Queue (DLQ).
  3. Đối với permanent errors (`BadRequestException` do sai format dữ liệu hoặc vi phạm ràng buộc domain): Lập tức `nack(requeue: false)` không retry, giải phóng hàng đợi.
- **File sửa đổi:** `bidding-events.consumer.ts`.

---

### Nhóm P2: N01 — Pending Round Activation
- **Vấn đề ban đầu:** Round có `opensAt` trong tương lai được lưu với trạng thái `pending`, nhưng không có cơ chế kích hoạt tự động sang `open` khi đến giờ, làm thợ không thể gửi báo giá.
- **Giải pháp triệt để:**
  1. Bổ sung `activateRoundIfNeeded(round, now)` sử dụng CAS `updateMany({ where: { id: round.id, status: 'pending', opensAt: { lte: now } }, data: { status: 'open' } })`.
  2. Kích hoạt trong `getBiddingStatus`, `openRound` và `submitBid` khi phát hiện round `pending` đã đến thời điểm `opensAt`.
  3. Phát sự kiện `bidding.round.opened` chính xác tại thời điểm round được kích hoạt sang `open`.
- **File sửa đổi:** `rounds.service.ts`, `bids.service.ts`.

---

### Nhóm P2: N02 — Revise Response Missing Newest Revision
- **Vấn đề ban đầu:** `revisions` được query trước khi insert bản ghi `bid_revisions`, dẫn đến lần sửa đầu tiên trả về `revisionsCount = 1` nhưng mảng `revisions = []`.
- **Giải pháp triệt để:**
  1. Tạo bản ghi `bidRevision.create` trước trong interactive transaction.
  2. Query `updatedBid` kèm revisions sau, đồng thời đảm bảo mảng `revisions` trả về luôn chứa bản ghi sửa đổi mới nhất với đầy đủ thông tin (loại bỏ hoàn toàn temp id).
- **File sửa đổi:** `bids.service.ts`.

---

### Nhóm P2: N03 — Atomic Multi-Replica Outbox Claim
- **Vấn đề ban đầu:** `findPendingEvents` SELECT các bản ghi pending rồi UPDATE theo ID mà không có điều kiện khóa, dẫn đến nhiều replica có thể claim cùng một tập bản ghi.
- **Giải pháp triệt để:**
  1. Áp dụng cơ chế **2-Phase Atomic CAS Claim**:
     - Bước 1: Chọn các candidate pending/dlq_retry có `nextRetryAt <= now`.
     - Bước 2: Thực hiện `updateMany({ where: { id: { in: ids }, status: { in: ['pending', 'dlq_retry'] }, nextRetryAt: { lte: now } }, data: { nextRetryAt: leaseUntil } })`.
     - Bước 3: Chỉ query và trả về các bản ghi mà chính replica hiện tại claim thành công (`nextRetryAt === leaseUntil`). Replica thua cuộc nhận mảng rỗng `[]`.
- **File sửa đổi:** `bidding-outbox.repository.ts`.

---

### Các Findings đã giải quyết trước đó
- **F01:** Xóa bỏ hoàn toàn hardcoded password credentials khỏi toàn bộ test file.
- **F02:** Xác thực `assertTrustedGateway` cho tất cả các API ghi (`submit`, `revise`, `withdraw`, `me`).
- **F05:** Atomic CAS Optimistic Locking cho revise và withdraw (`UPDATE bids WHERE id = :id AND version = :version`).
- **F08:** Hỗ trợ Tombstone cho các sự kiện terminal (`cancelled`, `order.created`) đến trước `service_request.published`.
- **F11:** Đầy đủ initial SQL migration và `migration_lock.toml`.
- **F12:** Thêm timing-safe secret check, giới hạn 100 UUID và loại bỏ mock ảo trong Worker Profile Enricher.
- **F13:** Đếm chính xác số lượng báo giá hợp lệ (`status = 'active'` và `validUntil > now` hoặc `null`); tự động chuyển báo giá quá hạn sang `expired`.

---

## 2. KẾT QUẢ KIỂM THỬ (TEST SUITE)

### Toàn bộ Bidding Service Test Suite
```bash
npx vitest run apps/bidding-service
```
- **Kết quả:** **11 test files passed (11/11)**
- **Số lượng tests:** **64 passed | 12 skipped (real DB integration) | 0 failed**
- **Thời gian chạy:** ~10 giây

### Toàn bộ Monorepo Test Suite
```bash
npx vitest run
```
- **Kết quả:** **74 test files passed (74/74)**
- **Số lượng tests:** **431 passed | 16 skipped | 0 failed**
- **Typecheck (`tsc --noEmit`):** **0 errors**
- **Linting (`oxlint`):** **0 errors, 0 warnings**

---

## 3. KẾT LUẬN

Tất cả các rủi ro bảo mật (F03/R01, F04/R02), tính toàn vẹn dữ liệu và concurrency (F06/R03, F07/R04, F09/R05, F10/R06), cùng các lỗi phát hiện bổ sung (N01, N02, N03) đã được xử lý triệt để, đồng bộ trên toàn bộ source code, Prisma schema và test suite. Hệ thống đạt trạng thái sẵn sàng nghiệm thu và merge.
