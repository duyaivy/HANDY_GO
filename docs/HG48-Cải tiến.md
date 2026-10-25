# BÁO CÁO CHI TIẾT CẢI TIẾN & TỐI ƯU HÓA BIDDING SERVICE (HG-48)

Tài liệu này tổng hợp toàn bộ các nội dung refactor, nâng cấp và cải tiến kiến trúc cho **Bidding Service** theo tài liệu review `PR28_Bidding_Service_Review.md`, bao gồm:
- **Phần 1: Khắc phục 13 Findings cốt lõi (F01 – F13)**
- **Phần 2: Triển khai 8 Cải tiến bổ sung (Mục 6 - Additional Enhancements)**
- **Phần 3: Kết quả kiểm thử toàn diện (Test Suite)**

---

## PHẦN 1: KHẮC PHỤC 13 FINDINGS CỐT LÕI (F01 – F13)

| Mã | Hạng mục | Vấn đề ban đầu | Giải pháp kỹ thuật đã triển khai | Trạng thái |
|---|---|---|---|---|
| **F01** | `BiddingEventsConsumer` | Thiếu idempotency khi tiêu thụ `order.created`, `service_request.cancelled`, `service_request.published` | Tạo bảng `consumed_events` và sử dụng `Transactional Idempotency` (check & insert trong cùng Prisma transaction với aggregate). Bỏ qua an toàn nếu event trùng lặp. | ✅ Hoàn thành |
| **F02** | `WorkerProfileEnricherService` | Tự động sinh Mock data ảo khi gọi User-Trust Service bị lỗi, vi phạm tính trung thực của dữ liệu | Loại bỏ hoàn toàn mock profile ảo. Khi User-Trust lỗi, áp dụng fallback an toàn: `isVerified=false`, `ratingCount=0`, `ratingAverage=null`, kèm In-Memory TTL Cache (60s). | ✅ Hoàn thành |
| **F03** | `RoundsService` | Thiếu xử lý chuyển trạng thái sang `no_bid` khi hết hạn mà không có thợ nào báo giá | Bổ sung logic tự động phân loại trong `expireRoundById`: nếu `bidCount === 0` → chuyển sang `no_bid`; nếu `bidCount > 0` → chuyển sang `closed`. | ✅ Hoàn thành |
| **F04** | `RoundsController` | Đường dẫn `GET /requests/:id/bidding-status` trả về DTO thiếu các trường quan trọng | Đồng bộ response DTO chuẩn: bổ sung `serviceRequestId`, `roundId`, `status`, `opensAt`, `closesAt`, `remainingSeconds`, `bidCount`, `activeBidsCount`. | ✅ Hoàn thành |
| **F05** | `BidsService` | Race Condition khi thợ revise bid đồng thời (Optimistic Locking chưa atomic) | Thay thế bằng câu lệnh Atomic Compare-And-Swap: `UPDATE bids SET ... WHERE id = :id AND version = :currentVersion`. Nếu affectedRows = 0 ném `ConflictException (409)`. | ✅ Hoàn thành |
| **F06** | `BidsService` | Thợ có thể sửa giá liên tục vô hạn (Spam Revision) | Giới hạn tối đa `MAX_BID_REVISIONS = 5` lần/báo giá và bắt buộc khoảng thời gian chờ (cooldown 2 phút giữa 2 lần sửa liên tiếp). Lưu lịch sử vào bảng `bid_revisions`. | ✅ Hoàn thành |
| **F07** | `BiddingOutboxRepository` | Outbox Polling quét toàn bộ bảng không phân trang | Thêm `take: batchSize`, lọc `status: 'pending'`, `retryCount < maxRetries`, sắp xếp `createdAt: ASC`. | ✅ Hoàn thành |
| **F08** | `BiddingOutboxRepository` | Không có giới hạn số lần retry, event lỗi gây nghẽn vòng lặp vĩnh viễn | Bổ sung `maxRetries = 5`. Nếu vượt quá số lần retry, tự động chuyển `status: 'failed'` và đẩy vào Dead Letter Queue (DLQ) kèm log cảnh báo. | ✅ Hoàn thành |
| **F09** | `BidsService` | Thiếu xác thực JWT / Claims giữa các Microservices | Bổ sung middleware kiểm tra `x-internal-secret` từ Trusted Gateway thông qua `assertTrustedGateway()`. | ✅ Hoàn thành |
| **F10** | `BidsController` | Thiếu Swagger Annotations & API Docs chi tiết | Bổ sung đầy đủ `@ApiTags`, `@ApiOperation`, `@ApiParam`, `@ApiHeader`, `@ApiResponse` cho 100% các endpoint của Bidding Service. | ✅ Hoàn thành |
| **F11** | `RoundsService` | Thiếu cơ chế tự động quét phiên quá hạn (Cron / Scheduler) | Xây dựng `RoundExpirationSchedulerService` chạy định kỳ mỗi 30 giây, tìm các phiên `status: open` có `closesAt < now()` và phát RabbitMQ event `bidding.round.expire_check`. | ✅ Hoàn thành |
| **F12** | Database & Migration | Thiếu index tối ưu cho các truy vấn polling và tra cứu lịch sử | Bổ sung index `(status, closes_at)` trên `bidding_rounds`, index `(worker_id, submitted_at)` và `(service_request_id, status)` trên `bids`. | ✅ Hoàn thành |
| **F13** | Unit & Integration Test | Độ phủ kiểm thử thấp, chưa có test tải và tranh chấp đồng thời | Viết mới 20+ unit test suite và integration spec (bao gồm real-db concurrency và reliability RabbitMQ). | ✅ Hoàn thành |

---

## PHẦN 2: TRIỂN KHAI 8 CẢI TIẾN BỔ SUNG (ADDITIONAL ENHANCEMENTS)

### 1. Outbox nhiều replica: Lease/Claim & Envelope chuẩn
- **Hiện trạng:** `findPendingEvents` chỉ `SELECT`, khi chạy nhiều replica có thể cùng fetch và publish trùng lặp event.
- **Giải pháp:**
  - Bổ sung cơ chế **Lease/Claim**: Cập nhật thời hạn giữ khóa `lockedUntil: now + 15s` ngay khi fetch pending events.
  - Chuẩn hóa **Envelope** sự kiện khi publish:
    ```json
    {
      "eventId": "uuid",
      "eventType": "bidding.round.opened",
      "aggregateType": "bidding_round",
      "aggregateId": "round-uuid",
      "timestamp": "ISO-8601",
      "version": 1,
      "payload": { ... }
    }
    ```
  - Consumer downstream (`consumed_events`) dựa vào `eventId` ổn định để deduplicate triệt để.

### 2. Payload Events: Bổ sung snapshot trạng thái đầy đủ
- **Hiện trạng:** Event `bid.revised` trước đây không kèm `validUntil` mới, gây thiếu đồng bộ trạng thái ở Gateway/Projection.
- **Giải pháp:**
  - Bổ sung đầy đủ snapshot vào payload `bid.revised`:
    - `bidId`, `serviceRequestId`, `workerId`, `roundId`
    - `previousAmount`, `newAmount`
    - `previousMessage`, `newMessage`
    - `validUntil: newValidUntil ? newValidUntil.toISOString() : null`
    - `version: newVersion`

### 3. Validate Tiền tệ: Giới hạn trần Decimal(12,2) & Số thập phân
- **Hiện trạng:** DTO chỉ có `@Min(1000)` nhưng không có `@Max` theo cấu trúc DB `Decimal(12, 2)`, giá quá lớn dẫn đến lỗi 500 Unhandled Exception từ Database.
- **Giải pháp:**
  - Cập nhật cả `SubmitBidDto` và `ReviseBidDto`:
    - `@Min(1000, { message: 'Mức giá báo tối thiểu là 1,000 VND' })`
    - `@Max(9999999999, { message: 'Mức giá báo không được vượt quá 9,999,999,999 VND' })`
    - `@IsNumber({ maxDecimalPlaces: 2 }, { message: 'Số tiền tối đa 2 chữ số thập phân' })`

### 4. Profile Fallback & In-Memory Cache Eviction
- **Hiện trạng:** Gán `averageRating = 5.0` khi thợ chưa có review gây ngộ nhận cho khách hàng. Map cache có nguy cơ memory leak vô hạn khi số lượng thợ tăng cao.
- **Giải pháp:**
  - Quy ước hiển thị: Thợ mới hoặc chưa có đánh giá sẽ trả về `ratingAverage: null`, `ratingCount: 0`, `isVerified: false` trung thực.
  - Cơ chế **Cache Eviction**: Định kỳ dọn dẹp các key hết hạn TTL (60s) hoặc khi kích thước cache vượt ngưỡng `cache.size > 200`, chủ động xóa các entry quá hạn.

### 5. Khoảng cách (Haversine & Distance Estimation)
- **Hiện trạng:** Có helper tính Haversine nhưng luồng enrich chưa có tọa độ hai đầu nên `distanceKm` thực tế là `null`.
- **Giải pháp:**
  - Giữ trường `distanceKm: null` một cách minh bạch khi chưa có tọa độ GPS thời gian thực của thợ.
  - Tránh giả lập khoảng cách ảo, document rõ ràng điều kiện tính toán khi tích hợp Tracking/Location Service.

### 6. Quản lý phiên trong tương lai (`opensAt > now`)
- **Hiện trạng:** `openRound` luôn gán `status = 'open'` bất kể `opensAt` ở tương lai, và `submitBid` không chặn `now < round.opensAt`.
- **Giải pháp:**
  - Khi mở phiên (`openRound`):
    - Nếu `opensAt > now` → gán trạng thái ban đầu là `'pending'`.
    - Nếu `opensAt <= now` → gán trạng thái `'open'`.
  - Trong `BidsService.submitBid`:
    - Kiểm tra `if (now < round.opensAt)` → lập tức ném lỗi `BadRequestException('Phiên báo giá chưa đến thời gian mở (opensAt)')`.

### 7. Gateway Route Scoping: Phân tách Bidding và Order CRUD Request
- **Hiện trạng:** Cấu hình tiền tố `/api/v1/requests` tại Gateway dẫn toàn bộ namespace về Bidding Service, làm gãy các route CRUD Service Request của Order Service.
- **Giải pháp:**
  - Thêm thuộc tính `customMatch?: (pathname: string) => boolean` vào `ServiceRouteConfig`.
  - Cấu hình Gateway:
    - `bidding-service`: Tiền tố `['/api/v1/bids']` kết hợp `customMatch`:
      `p === '/api/v1/bids' || p.startsWith('/api/v1/bids/') || /^\/api\/v1\/requests\/[^/?#]+\/(bids|bidding-status)(\/.*)?(\?.*)?$/.test(p)`
    - `order-service`: Tiền tố `['/api/v1/orders', '/api/v1/requests']`.
  - Kết quả: Các route `/api/v1/requests/:id/bids` và `/api/v1/requests/:id/bidding-status` đi về Bidding; các route tạo/sửa/xem yêu cầu chung đi về Order Service hoàn hảo.

### 8. Anti-Sniping Protection & Giới hạn gia hạn (Extension Cap)
- **Hiện trạng:** Khi có báo giá trong 30 giây cuối, hệ thống gia hạn 2 phút nhưng không giới hạn số lần gia hạn, có thể bị bot spam kéo dài phiên vô tận.
- **Giải pháp:**
  - Thiết lập hằng số giới hạn: `MAX_ANTI_SNIPING_EXTENSIONS = 3` (tổng thời gian gia hạn tối đa 6 phút).
  - Trước khi cập nhật `closesAt`, đếm số lần phiên đã được gia hạn qua sự kiện `bidding.round.extended`.
  - Nếu đã đủ 3 lần: ghi log cảnh báo và giữ nguyên `closesAt`, bảo vệ tính công bằng và kết thúc phiên đúng hạn.
  - Toàn bộ thao tác kiểm tra và cập nhật được thực thi bên trong Prisma Interactive Transaction (`tx`).
  - Ghi nhận trong tài liệu: Anti-sniping là tính năng fair-play mở rộng, phát hành event để Order Service nhận biết và đồng bộ deadline.

---

## PHẦN 3: KẾT QUẢ KIỂM THỬ (TEST SUITE)

```bash
pnpm run test
```

- **Tổng số Test Files:** `74 / 74 passed (100%)`
- **Tổng số Tests:** `429 passed | 16 skipped`
- **Thời gian chạy:** ~44 giây
- **Các dịch vụ kiểm thử:**
  - `bidding-service` (bids, rounds, scheduler, events consumer, outbox repository, profile enricher)
  - `api-gateway` (proxy routing scope, gateway auth, kyc routing)
  - `user-trust-service` (kyc worker, user profile, trust score)
  - `auth-service` (login lockout, rate limit, otp, session)
  - `wallet-service` (ledger, transaction, balance)
  - `catalog-service`, `order-service`, `matching-service`, `payment-service`, `notification-service`
