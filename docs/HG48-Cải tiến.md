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

### Nhóm P1 mới từ Báo Cáo Kiểm Tra Lần 3 (PR #28 Review #3)

#### P1-01: Migration tạo `customer_id` trên `bidding_rounds`
- **Vấn đề:** Schema thêm `customerId` (`customer_id UUID`) và code query cột này, nhưng thư mục migrations thiếu migration tương ứng, khiến `prisma migrate deploy` trên clean database bị lỗi cột không tồn tại.
- **Giải pháp triệt để:** Tạo migration `20261025010000_add_customer_id_to_bidding_rounds/migration.sql` chứa câu lệnh `ALTER TABLE "bidding_service"."bidding_rounds" ADD COLUMN IF NOT EXISTS "customer_id" UUID;`, đảm bảo tương thích 100% khi chạy CI deploy trên database mới hoặc nâng cấp database hiện hữu.
- **File:** `backend/apps/bidding-service/prisma/migrations/20261025010000_add_customer_id_to_bidding_rounds/migration.sql`.

#### P1-02: Serialize triệt để giữa `submitBid` và `finalizeRound` / `cancelRound`
- **Vấn đề:** Submit tạo Bid trước rồi mới CAS tăng `bidCount`. Khi finalize đọc danh sách bid active và cập nhật round, một bid đang submit đồng thời có thể commit sau khi finalize quét xong, dẫn tới việc bid mới vẫn ở trạng thái `active` sau khi round đã `finalized`.
- **Giải pháp triệt để:**
  1. Thống nhất protocol khóa dòng (Row-level Lock): Mọi thao tác ghi (`submitBid`, `finalizeRound`, `cancelRound`) bắt buộc phải CAS/khóa bảng cha `bidding_rounds` **TRƯỚC** khi thao tác với các bản ghi con `bids`.
  2. Trong `submitBid`: Thực hiện CAS `updateMany` kiểm tra `id = round.id, status = 'open', closesAt > now` và tăng `bidCount` trước. Nếu round đã bị đóng/finalized/cancelled bởi transaction khác, CAS thất bại ngay lập tức và ném `BadRequestException` mà không tạo bid rác.
  3. Trong `finalizeRound` và `cancelRound`: Chuyển trạng thái `bidding_rounds` sang `finalized`/`cancelled` trước qua CAS `updateMany`, sau đó mới quét reject tất cả active bids. Không bao giờ tồn tại active bid bị bỏ sót.
- **File:** `backend/apps/bidding-service/src/bids/bids.service.ts`, `backend/apps/bidding-service/src/rounds/rounds.service.ts`.

#### P1-03: Durable Dead-Letter Persistence & Backoff Delay cho Consumer
- **Vấn đề:** Cơ chế retry trong `BiddingEventsConsumer` chỉ lưu số lần thử trong RAM; khi gặp lỗi 3 lần liên tiếp trong vài mili-giây, code gọi `nack(requeue: false)` có thể làm mất sự kiện `order.created` hoặc `service_request.cancelled` nếu RabbitMQ broker chưa cấu hình DLX.
- **Giải pháp triệt để:**
  1. Thêm độ trễ backoff (`setTimeout(500 * currentAttempts)`) trước khi requeue, tránh vòng lặp từ chối quá nhanh khi DB chập chờn.
  2. Bổ sung `persistDeadLetter`: Khi hết 3 lần thử hoặc gặp lỗi vi phạm contract vĩnh viễn, consumer tự động ghi nhận bản ghi dead-letter bền vững vào `bidding_service.outbox_events` với `aggregateType: 'dead_letter'`, `eventType: 'bidding.dead_letter'`, `status: 'failed'`, lưu trữ nguyên vẹn payload và stacktrace lỗi phục vụ quan sát (observability) và hỗ trợ redrive thủ công qua admin tool.
- **File:** `backend/apps/bidding-service/src/events/bidding-events.consumer.ts`.

#### P1-04: Đồng bộ Event Envelope & Authoritative `customerId` với Notification Service
- **Vấn đề:** Notification Service trên `main` có validator nghiêm ngặt `validateNotificationEvent` yêu cầu envelope có `eventId` (UUID), `source: 'bidding-service'`, `occurredAt` (strict ISO-8601), và payload phải chứa đủ `['bidId', 'requestId', 'customerId']`. Bidding Service trước đây phát payload trần không có envelope và thiếu `customerId`.
- **Giải pháp triệt để:**
  1. Thêm `requestId` và `customerId: round.customerId` chính chủ từ Round vào payload sự kiện outbox `bid.submitted`, `bid.revised`, và `bid.withdrawn`.
  2. Nâng cấp `OutboxPublisherService`: Tự động đóng gói sự kiện vào chuẩn CloudEvent/Envelope (`eventId: event.id`, `eventType`, `eventVersion`, `source: 'bidding-service'`, `occurredAt: ISO string`, `data: payload`, `payload`).
  3. Bổ sung Unit Test xác thực trực tiếp payload đầu ra của `BidsService` qua validator `validateNotificationEvent` của Notification Service, chứng minh 100% contract compatibility.
- **File:** `backend/libs/common/src/outbox/outbox-publisher.service.ts`, `backend/apps/bidding-service/src/bids/bids.service.ts`, `backend/apps/bidding-service/src/bids/bids.service.spec.ts`.

---

### Nhóm P1 mới từ Báo Cáo Kiểm Tra Lần 4 (PR #28 Review #4 — `review(3).md`)

#### F-A: Bảo toàn Message (Zero Message Loss) khi Database lỗi trong lúc lưu Dead-Letter
- **Vấn đề (F-A):**
  - Khi consumer xử lý thất bại (hết 3 lần retry hoặc permanent error), phương thức `nackMessage` gọi `await persistDeadLetter(...)`. Tuy nhiên `persistDeadLetter` trước đây catch mọi lỗi DB và chỉ log mà không trả về kết quả hoặc báo thất bại.
  - Hệ quả: Khi Database chính bị sự cố (chính là nguyên nhân làm business transaction thất bại), việc lưu dead-letter vào `outbox_events` cũng thất bại theo. Consumer tiếp tục chạy tới `channel.nack(originalMsg, false, false)` (requeue=false), dẫn đến việc message bị loại bỏ vĩnh viễn khỏi RabbitMQ queue dù chưa có bản sao bền vững nào được lưu trữ.
- **Giải pháp triệt để:**
  1. Cập nhật `persistDeadLetter(...)` trả về `Promise<boolean>`: `true` nếu lưu thành công vào PostgreSQL outbox, `false` nếu có lỗi hoặc DB unavailable.
  2. Trong `nackMessage`:
     - Nếu `persistDeadLetter` trả về `true`: Xác nhận đã lưu bản sao bền vững vào PostgreSQL -> an toàn thực hiện `channel.nack(originalMsg, false, false)` để loại bỏ message khỏi hàng đợi và xóa khỏi bộ đệm `retryAttempts`.
     - Nếu `persistDeadLetter` trả về `false`: **TUYỆT ĐỐI KHÔNG BỎ RƠI MESSAGE**. Consumer tự động kích hoạt chế độ dự phòng `shouldRequeue = true`, chờ delay 2 giây và gọi `channel.nack(originalMsg, false, true)` để RabbitMQ giữ lại message trong queue cho đến khi Database hồi phục hoàn toàn.
  3. Bổ sung cơ chế Fingerprinting bằng mã SHA-256 đối với nội dung message (`createHash('sha256')`) khi `eventId` hoặc `messageId` không có sẵn, đảm bảo số lần retry (bounded to 3) được theo dõi chính xác xuyên suốt các lần redelivery dù broker cấp `deliveryTag` mới. Bọc `channel.ack`/`channel.nack` trong `try-catch` an toàn.
  4. Bổ sung Unit Test chuyên biệt trong `bidding-events.consumer.spec.ts`:
     - Mock `prisma.outboxEvent.create` ném ngoại lệ `'Database unavailable'`, xác nhận consumer gọi `channel.nack(msg, false, true)` (requeue=true), chứng minh không bao giờ mất message.
     - Kiểm thử kịch bản Fault Injection hoàn chỉnh: Database lỗi khiến lưu dead-letter thất bại -> message được requeue -> Consumer restart (xóa bộ nhớ RAM) -> Database phục hồi -> message được gửi lại và xử lý thành công (ACK).
- **File:** `backend/apps/bidding-service/src/events/bidding-events.consumer.ts`, `backend/apps/bidding-service/src/events/bidding-events.consumer.spec.ts`.

#### F-B: Bảo toàn DomainEvent Envelope trong Shared OutboxPublisherService (Chống phá vỡ Auth Provisioning)
- **Vấn đề (F-B):**
  - PR sửa `OutboxPublisherService` (dùng chung trong `@app/common`) để bọc payload vào envelope cho Notification Service.
  - Tuy nhiên, `auth-service` (ví dụ flow `register-flow.service.ts`) vốn đã tự xây dựng DomainEvent envelope version 3 đầy đủ (`{ eventId, eventVersion: 3, occurredAt, producer: 'auth-service', data: { userId, accountId, fullName, roles } }`).
  - Publisher dùng chung bọc mù quáng thêm một tầng envelope nữa, gán `data: payloadObj` -> dẫn đến `event.data` bị lồng thành `event.data.data`.
  - Khi `user-trust-service` nhận sự kiện `user.registered`, nó đọc `event.data.roles` và `event.data.userId` (lúc này bị `undefined` vì nằm ở `event.data.data`), dẫn đến validation thất bại và `handleUserRegistered` trả về `processed: false`, chặn đứng quy trình khởi tạo tài khoản/profile của người dùng.
- **Giải pháp triệt để:**
  1. Thêm cơ chế nhận diện thông minh `isAlreadyEnveloped`:
     ```typescript
     const isAlreadyEnveloped = Boolean(
       payloadObj &&
         typeof payloadObj === 'object' &&
         payloadObj.data &&
         typeof payloadObj.data === 'object' &&
         !Array.isArray(payloadObj.data),
     );
     ```
  2. Nếu payload **đã là envelope** (Auth Service, User-Trust Service): Giữ nguyên toàn bộ cấu trúc cấp ngoài (`eventId`, `eventVersion`, `producer`, `source`, `occurredAt`, và đặc biệt là `data: payloadObj.data`, `payload: payloadObj.data`), không bọc thêm bất kỳ lớp nào.
  3. Nếu payload là **raw business data** (Bidding Service): Đóng gói chuẩn CloudEvent envelope (`eventId`, `eventType`, `eventVersion`, `source`, `occurredAt`, `data: payloadObj`, `payload: payloadObj`).
  4. Bổ sung Integration Test xuyên service hoàn chỉnh trong `outbox-publisher.service.spec.ts`:
     - Luồng Auth `register-flow` (v3) -> `OutboxPublisherService` -> chuyển trực tiếp vào `UserTrustServiceService.handleUserRegistered`: xác thực `processed: true`, user và profile customer/worker được tạo đầy đủ.
     - Luồng Auth v2 -> `OutboxPublisherService` -> `UserTrustServiceService.handleUserRegistered`: xác thực `processed: true`.
     - Luồng Bidding (`bid.submitted`, `bid.revised`) -> `OutboxPublisherService` -> `validateNotificationEvent` của Notification Service: pass 100% với `source: 'bidding-service'` và đầy đủ IDs.
- **File:** `backend/libs/common/src/outbox/outbox-publisher.service.ts`, `backend/libs/common/src/outbox/outbox-publisher.service.spec.ts`.

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
- **Số lượng tests:** **66 passed | 12 skipped (real DB integration) | 0 failed**
- **Thời gian chạy:** ~8 giây

### Kiểm thử tích hợp xuyên Service (Bidding + Auth + User-Trust + Notification)
```bash
npx vitest run apps/auth-service apps/user-trust-service apps/bidding-service apps/notification-service
```
- **Kết quả:** **62 test files passed, 2 skipped**
- **Số lượng tests:** **418 passed | 84 skipped | 0 failed**
- **Thời gian chạy:** ~27 giây

### Toàn bộ Monorepo Test Suite
```bash
npx vitest run
```
- **Kết quả:** **94 test files passed, 2 skipped**
- **Số lượng tests:** **566 passed | 84 skipped | 0 failed**
- **Typecheck (`tsc --noEmit`):** **0 errors**
- **Linting (`oxlint`):** **0 errors**
- **Build (`nest build --all`):** **19 microservices / libs build thành công với Rspack**

---

## 3. KẾT LUẬN

Tất cả các rủi ro bảo mật (F03/R01, F04/R02), tính toàn vẹn dữ liệu và concurrency (F06/R03, F07/R04, F09/R05, F10/R06), các lỗi phát hiện bổ sung (N01, N02, N03), 4 vấn đề P1 trọng điểm từ Báo cáo Review Lần 3 (P1-01, P1-02, P1-03, P1-04), và **2 finding P1 mới nhất từ Báo cáo Review Lần 4 / review(3).md (F-A và F-B)** đã được giải quyết triệt để, có kiểm thử đơn vị và tích hợp bảo vệ.

100% test files pass, typecheck 0 errors, lint 0 errors. Hệ thống đạt tính ổn định và tính tương thích cao nhất, sẵn sàng 100% để merge PR #28.
