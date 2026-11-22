# [HG-82] Chi Tiết Thay Đổi Task 1–4

Tài liệu này ghi nhận thay đổi kỹ thuật trên nhánh `feature/HG-82-order-dispute-7-days-admin-resolution`, bao gồm migrations, Prisma schema, API, event, logic service và kết quả kiểm tra local. Chi tiết Task 3 nằm tại mục 5; chi tiết kiểm thử Task 4 nằm tại mục 6.

---

## 1. Tổng Quan Các Commit

| Commit SHA | Thông điệp Commit | Task liên quan | Tóm tắt thay đổi |
| :--- | :--- | :--- | :--- |
| **`a7836ac`** | `feat(HG-82): support seven-day disputes on completed orders` | **Task 1** | Cho phép khách hàng mở khiếu nại trong 7 ngày sau khi hoàn tất đơn (`completed`); lưu metadata bằng chứng khiếu nại (`evidence_type`, `submitted_by_user_id`); migration DB; mở rộng Outbox event. |
| **`592aded`** | `feat(HG-82): add admin dispute queue` | **Task 2** | Xây dựng API `GET /admin/orders/disputes` cho Admin tra cứu danh sách khiếu nại; thêm migration tạo index DB `(status, disputed_at)`; DTO query & response; test proxy API Gateway. |
| **`7310df9`** | `feat(HG-82): resolve completed-order disputes across Order and Payment` | **Task 3** | Thêm phán quyết `dismiss`/`rework`/`refund`, migration Order/Payment, refund có idempotency qua Wallet, projection Admin, event Notification/Tracking và test. Xem mục 5 để biết từng thay đổi và giới hạn kiểm thử. |
| **`a1388415`** | `test(HG-82): verify dispute resolution flows and document QA results` | **Task 4** | Bổ sung unit/integration test cho queue, idempotency, hạn mức và Payment outcome; xác minh local qua PostgreSQL/RabbitMQ/Wallet test; cập nhật ma trận và kết quả tại mục 6. |
| **`3826c826`** | `fix(HG-82): preserve order status and phase in tracking summary for dispute and warranty events` | **Review Fix #01** | Cập nhật `TrackingEventsService` và `SummaryService` để trích xuất đúng `toStatus`, `actorUserId`, `reason`, giữ metadata HG-82 và tính đúng `order.status`, `order.completedAt`, `currentPhase` cho 3 event `order.dispute.decision.recorded`, `order.dispute.resolved`, `order.warranty.completed`. Chi tiết tại mục 7. |
| **`07523e7d`** | `fix(HG-82): allow superseding needs_review dispute decisions and handle wallet 4xx refund rejections` | **Review Fix #02** | Thêm migration partial unique index `WHERE state <> 'superseded'` cho `order_dispute_resolutions`; cho phép Admin thay thế quyết định khi ở `needs_review`; lọc bỏ bản ghi `superseded` trong `adminFindDisputes`; xử lý `wallet.refundCredit` trả 4xx (`outcome === 'rejected'`) bằng cách ghi `failureReason` và phát `payment.dispute.refund.needs_review` về Order. Chi tiết tại mục 8. |
| **`ef6edaca`** | `fix(HG-82): enforce warranty invariants in legacy resolveDispute after rework` | **Review Fix #03** | Bảo toàn bất biến bảo hành trong `OrdersService.resolveDispute` khi đơn đã có `firstCompletedAt`: chặn `action: 'cancel'` (`LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION`) và phát `order.warranty.completed` thay vì `order.completed` khi `action: 'complete'`. Chi tiết tại mục 9. |
| **`65c49fcf`** | `fix(HG-82): filter work evidence type in ORD-10 finish guard and addEvidence dedup` | **Review Fix #04** | Sửa `OrdersService.finish` đếm trực tiếp `orderEvidence` có `evidenceType: 'work'` và sửa `OrdersService.addEvidence` lọc `evidenceType: 'work'` khi dedup theo `mediaUrl`. Chi tiết tại mục 10. |
| **`2f1110f9`** | `fix(HG-82): prevent silent consumption and log guard mismatches in PaymentEventsConsumer` | **Review Fix #05** | Siết kiểm tra `eventId` rỗng/khoảng trắng trước khi NACK, kiểm tra sự tồn tại của `resolution` và `order` trước khi ghi `consumed_events`, và ghi `logger.warn` chi tiết cho mọi nhánh lệch đối soát trong `PaymentEventsConsumer.processDisputeRefund`. Chi tiết tại mục 11. |
| **`7b698974`** | `fix(HG-82): tighten dispute DTO input length, URL protocol, and refund amount bounds` | **Review Fix #06** | Bổ sung `@MaxLength(2000)` cho `reason` và `resolutionNote`; giới hạn `evidenceUrls` tối đa 10 phần tử, mỗi URL tối đa 2048 ký tự và bắt buộc protocol `http`/`https`; giới hạn `refundAmountVnd` theo regex `/^[1-9]\d{0,18}$/` ở DTO và `OrdersService`. Chi tiết tại mục 12. |
| **Review Fix #07** | `fix(HG-82): persist disputeCategory, fix resolveDispute status check order, and allow partially_refunded filter` | **Review Fix #07** | Thêm cột `orders.dispute_category` để lưu và trả về `disputeCategory` trong `OrderResponseDto` & `adminFindDisputes`; đảo thứ tự kiểm tra `order.status !== 'disputed'` trước `order.disputePreviousStatus === 'completed'` trong `resolveDispute`; bổ sung `'partially_refunded'` vào `QueryOrderDto.paymentState`. Chi tiết tại mục 13. |

---

## 2. Commit 1: `a7836ac` - Task 1: Khiếu Nại Đơn Hàng Trong Vòng 7 Ngày

### 2.1. Database Migration & Prisma Schema

#### File Migration mới:
`backend/apps/order-service/prisma/migrations/20261121000000_add_dispute_evidence_metadata/migration.sql`
```sql
ALTER TABLE "order_service"."order_evidences"
  ADD COLUMN "evidence_type" VARCHAR(30) NOT NULL DEFAULT 'work',
  ADD COLUMN "submitted_by_user_id" UUID;
```

#### Cập nhật Prisma Schema (`backend/apps/order-service/prisma/schema.prisma`):
Trong model `OrderEvidence`:
- **`evidenceType`**: `String @default("work") @map("evidence_type") @db.VarChar(30)` — Phân biệt bằng chứng thi công (`work`) và bằng chứng khiếu nại (`dispute`).
- **`submittedByUserId`**: `String? @map("submitted_by_user_id") @db.Uuid` — Lưu ID của người gửi bằng chứng (thợ hoặc khách).

---

### 2.2. Hằng Số & Mã Lỗi Mới (`order-errors.ts`)
File: `backend/apps/order-service/src/common/constants/order-errors.ts`

- **Mã lỗi HTTP 400 Bad Request mới:**
  - `COMPLAINT_WINDOW_EXPIRED`: `'COMPLAINT_WINDOW_EXPIRED'`
  - Thông báo: `'Đã quá thời hạn 7 ngày kể từ khi hoàn tất đơn hàng, không thể mở khiếu nại.'`
- **Mã lỗi HTTP 403 Forbidden mới:**
  - `DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION`: `'DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION'`
  - Thông báo: `'Chỉ khách hàng của đơn hàng mới có quyền mở khiếu nại sau khi đơn đã hoàn tất.'`

---

### 2.3. DTO & Validation Mới (`dispute-order.dto.ts`)
File: `backend/apps/order-service/src/orders/dto/dispute-order.dto.ts`

- **Enum mới `DisputeCategory`:**
  - `service_quality`: Chất lượng dịch vụ không đạt
  - `incomplete_work`: Công việc chưa hoàn thành
  - `property_damage`: Gây hư hỏng tài sản xung quanh
  - `price_fraud`: Gian lận giá / đòi tiền thêm
  - `attitude`: Thái độ phục vụ không tốt
  - `other`: Lý do khác
- **Mở rộng class `DisputeOrderDto`:**
  - `reason`: `string` (bắt buộc, trim, min 5 ký tự).
  - `category?`: `DisputeCategory` (tùy chọn).
  - `evidenceUrls?`: `string[]` (tùy chọn, mảng tối đa 10 phần tử, validate URL hợp lệ).

File test mới: `backend/apps/order-service/src/orders/dto/dispute-order.dto.spec.ts` kiểm tra toàn bộ validation của DTO.

---

### 2.4. Logic Nghiệp Vụ Tại Service (`orders.service.ts`)
File: `backend/apps/order-service/src/orders/orders.service.ts`

1. **Phương thức `dispute(orderId, userId, dto)`:**
   - **Đơn ở trạng thái `completed`:**
     - Kiểm tra quyền: `order.customerUserId === userId`. Nếu không phải khách hàng $\rightarrow$ throw `403 Forbidden` (`DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION`).
     - Kiểm tra thời hạn 7 ngày: `now.getTime() - order.completedAt.getTime() <= 7 * 24 * 60 * 60 * 1000`. Nếu quá 7 ngày $\rightarrow$ throw `400 Bad Request` (`COMPLAINT_WINDOW_EXPIRED`).
   - **Đơn ở trạng thái `in_progress` hoặc `awaiting_customer_confirmation`:**
     - Giữ nguyên quy tắc ORD-08: Cả khách hàng hoặc thợ đều được mở khiếu nại.
   - **Các trạng thái khác:**
     - Ném `409 Conflict` (`INVALID_STATE_TRANSITION`).
   - **Chống race condition:**
     - Update có điều kiện: `where: { id: orderId, status: order.status }`.
   - **Lưu bằng chứng khiếu nại (`evidenceUrls`):**
     - Deduplicate URLs bằng `new Set`.
     - Phân loại `mediaType`: Tự động nhận diện video (`.mp4`, `.mov`, `.webm`, v.v.) thành `'video'`, còn lại là `'image'`.
     - Lưu với `evidenceType: 'dispute'`, `submittedByUserId: userId`.
   - **Bảo vệ tính bất biến của bằng chứng khiếu nại (`deleteEvidence`):**
     - Sửa `deleteEvidence()` thêm điều kiện `where: { id: evidenceId, orderId, evidenceType: 'work' }`. Khách hoặc thợ **không thể xóa** bằng chứng thuộc loại `dispute`.

2. **Outbox Event Payload (`order.disputed`):**
   - Bổ sung các trường dữ liệu phong phú:
     - `reason`: `dto.reason`
     - `category`: `dto.category ?? null`
     - `evidences`: `evidenceUrls`
     - `disputePreviousStatus`: `order.status`
     - `completedAt`: `order.completedAt?.toISOString() ?? null`

---

### 2.5. Controller (`orders.controller.ts`)
File: `backend/apps/order-service/src/orders/orders.controller.ts`
- Cập nhật tài liệu Swagger `@ApiOperation`, `@ApiOkResponse`, `@ApiBadRequestResponse` (`COMPLAINT_WINDOW_EXPIRED`), `@ApiForbiddenResponse` (`DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION`).

---

## 3. Commit 2: `592aded` - Task 2: API Admin Quản Lý Tra Cứu Danh Sách Khiếu Nại

### 3.1. Database Migration & Prisma Schema

#### File Migration mới:
`backend/apps/order-service/prisma/migrations/20261121001000_add_dispute_queue_index/migration.sql`
```sql
CREATE INDEX "orders_status_disputed_at_idx"
  ON "order_service"."orders"("status", "disputed_at");
```

#### Cập nhật Prisma Schema (`backend/apps/order-service/prisma/schema.prisma`):
Trong model `Order`:
- Bổ sung `@@index([status, disputedAt])` giúp tối ưu hóa truy vấn lọc hàng đợi khiếu nại theo thời gian.

---

### 3.2. DTOs Mới

#### 1. `AdminQueryDisputesDto`
File: `backend/apps/order-service/src/orders/dto/admin-query-disputes.dto.ts`
- **Enum `DisputeSortBy`:**
  - `disputedAt`: Thời điểm khiếu nại (mặc định)
  - `completedAt`: Thời điểm hoàn thành trước đó
  - `createdAt`: Thời điểm tạo đơn
  - `agreedPrice`: Giá chốt đơn hàng
- **Enum `SortOrder`:**
  - `asc`, `desc` (mặc định `desc`)
- **Các trường bộ lọc:**
  - `page`: `number` (mặc định 1, min 1)
  - `limit`: `number` (mặc định 10, min 1, max 100)
  - `search`: `string` (tìm kiếm mã đơn hoặc lý do tranh chấp)
  - `previousStatus`: `OrderStatus` (lọc theo trạng thái trước khi tranh chấp: `completed`, `in_progress`, v.v.)
  - `disputedFrom`: `ISO date string` (lọc từ ngày)
  - `disputedTo`: `ISO date string` (lọc đến ngày)

#### 2. `AdminDisputeListResponseDto`
File: `backend/apps/order-service/src/orders/dto/admin-dispute-list-response.dto.ts`
- Định nghĩa cấu trúc hồ sơ khiếu nại trả về cho Admin:
  - `orderId`, `orderCode`, `status`, `disputePreviousStatus`
  - `customerUserId`, `workerUserId`
  - `customer: { id }`, `worker: { id }`
  - `serviceId`, `agreedPrice`, `currency: 'VND'`
  - `disputeReason`, `disputedAt`, `completedAt`, `createdAt`
  - `evidences`: Danh sách bằng chứng khiếu nại (`id`, `mediaUrl`, `mediaType`, `submittedByUserId`, `createdAt`)
  - `pagination`: `{ page, limit, total, totalPages }`

---

### 3.3. Controller Mới (`AdminOrdersController.findDisputes`)
File: `backend/apps/order-service/src/orders/admin-orders.controller.ts`

- **Endpoint:** `GET /admin/orders/disputes`
- **Guards bảo vệ:** `TrustedGatewayGuard`, `AdminGuard`
- **Xử lý:** Nhận `AdminQueryDisputesDto`, kiểm tra roles của `CurrentUser`, gọi `ordersService.adminFindDisputes(query, user.roles)`.

---

### 3.4. Logic Nghiệp Vụ Tại Service (`OrdersService.adminFindDisputes`)
File: `backend/apps/order-service/src/orders/orders.service.ts`

- **Bảo vệ vai trò:** Kiểm tra `roles.some(r => r.toLowerCase() === 'admin')`, nếu sai ném `403 Forbidden` (`FORBIDDEN_ROLE`).
- **Validate date range:** Kiểm tra `disputedFrom` và `disputedTo` hợp lệ; nếu `from > to` ném `400 BadRequestException('Invalid dispute date range')`.
- **Query Prisma:**
  - `where`: `status: 'disputed'`.
  - Bộ lọc kết hợp: `previousStatus`, khoảng ngày `disputedAt`, `search` không phân biệt hoa thường trên `orderCode` và `disputeReason`.
  - Chỉ include bằng chứng thuộc loại khiếu nại: `evidences: { where: { evidenceType: 'dispute' }, orderBy: { createdAt: 'desc' } }`.
  - Sắp xếp ổn định (Stable Sort): `orderBy: [sortFields[sortBy], { id: 'asc' }]` tránh hiện tượng xáo trộn trang khi 2 bản ghi trùng timestamp.

---

### 3.5. Kiểm Tra Tương Thích Tuyến API Gateway
File: `backend/apps/api-gateway/src/proxy/proxy.constants.spec.ts`
- Bổ sung test case đảm bảo route `/api/v1/admin/orders/disputes` được forward nguyên vẹn đến `order-service` mà không bị loại trừ hoặc rewrite sai.

---

## 4. Bảng Tra Cứu Nhanh Các Biến, Cột DB và Endpoint Mới

| Phân loại | Tên mới | Mô tả |
| :--- | :--- | :--- |
| **Cột DB mới** | `order_evidences.evidence_type` | `VARCHAR(30) DEFAULT 'work'`, nhận giá trị `'work'` hoặc `'dispute'` |
| **Cột DB mới** | `order_evidences.submitted_by_user_id`| `UUID`, ID của người upload bằng chứng |
| **Index DB mới** | `orders_status_disputed_at_idx` | Index composite trên `(status, disputed_at)` của bảng `orders` |
| **Error Code mới**| `COMPLAINT_WINDOW_EXPIRED` | Mã lỗi 400 khi mở khiếu nại sau 7 ngày kể từ `completedAt` |
| **Error Code mới**| `DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION` | Mã lỗi 403 khi người gọi không phải là khách hàng của đơn đã hoàn tất |
| **DTO Enum mới** | `DisputeCategory` | Phân loại lý do tranh chấp (`service_quality`, `incomplete_work`, ...) |
| **DTO Enum mới** | `DisputeSortBy` | Các tiêu chí sắp xếp hàng đợi (`disputedAt`, `completedAt`, ...) |
| **API Endpoint mới**| `GET /api/v1/admin/orders/disputes` | Endpoint truy vấn hàng đợi khiếu nại dành cho Admin |
| **Event Payload** | `order.disputed` | Bổ sung `category`, `evidences`, `disputePreviousStatus`, `completedAt` |

---

## 5. Commit 3: `7310df9` - Task 3: Admin Phán Quyết Khiếu Nại Sau Hoàn Thành

### 5.1. Dữ liệu và migration

- `order-service/prisma/migrations/20261121002000_admin_dispute_resolutions`: thêm `orders.first_completed_at`, backfill từ `completed_at` khi cột mới còn null; bổ sung enum `PaymentState.partially_refunded`; tạo `order_dispute_resolutions` với một quyết định cho mỗi `(order_id, disputed_at)`, unique `idempotency_key`, `request_hash`, actor Admin, action/note/state, tiền hoàn dạng `BIGINT`, ID Payment/Refund, snapshot hai mốc hoàn thành, mã lỗi và timestamp.
- `payment-service/prisma/migrations/20261121002000_dispute_refund_link`: thêm `refunds.dispute_resolution_id` nullable/unique để đối chiếu kết quả và chống tạo refund trùng khi retry.
- Chỉ tạo migration trong repo và validate schema; **chưa chạy migration trên DB deploy**. Dữ liệu có lịch sử làm lại cần được đối chiếu trước khi xem `first_completed_at` backfill là mốc nghiệm thu đầu tiên tuyệt đối.

### 5.2. API và logic Order

- Mở rộng `POST /api/v1/admin/orders/:id/resolve-dispute` cho `dismiss`, `rework`, `refund` khi `disputePreviousStatus = completed`; giữ ba action ORD-08 cho tranh chấp trước hoàn thành và chặn action cũ trên khiếu nại HG-82 bằng `LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION`.
- Request HG-82 dùng note, `idempotencyKey` và `refundAmountVnd` dạng chuỗi VND nguyên dương. Tạo `requestHash` để nhận lại cùng quyết định khi retry và trả `DISPUTE_ALREADY_DECIDED` khi key/payload khác hoặc đã có quyết định cho cùng lần khiếu nại. Update Order có điều kiện `status + version`, cùng transaction với hồ sơ phán quyết, history và outbox.
- `dismiss` giữ `completedAt`/Payment; `rework` lưu mốc cũ rồi reset chu kỳ hiện tại, giữ `firstCompletedAt`. Khách nghiệm thu sau bảo hành phát `order.warranty.completed`, không phát lại `order.completed` để tránh mở thanh toán lần hai.
- `refund` chặn Admin tự duyệt Payment của chính mình (`REFUND_SELF_APPROVAL_FORBIDDEN`) trước khi ghi quyết định; đọc `GET /api/v1/internal/payments/order/:orderId/refundable` qua shared internal secret, so số VND bằng `bigint`, từ chối Payment chưa thanh toán hoặc vượt số còn được hoàn. HTTP 202 trả `resolutionId`, `refund_pending`; Order vẫn `disputed` cho đến khi Payment xác nhận. Endpoint `GET /api/v1/admin/orders/dispute-resolutions/:resolutionId` cho Admin tra trạng thái cuối.
- API danh sách Task 2 ghép `OrderDisputeResolution` theo đúng `(orderId, disputedAt)` của trang hiện tại để thấy `refund_pending`/`needs_review`, không lấy nhầm quyết định từ chu kỳ cũ.

### 5.3. Payment, event và thông báo

- Consumer Payment nhận `order.dispute.decision.recorded` qua inbox idempotent. Dưới khóa Payment, kiểm tra Order/Payment/customer/worker, trạng thái đã thu và tổng refund đang đặt chỗ; tạo refund gắn `resolutionId`, `requestedByUserId = null`, `approvedByUserId = Admin` khác khách; ghi audit. Việc ghi sổ vẫn dùng `RefundsService.execute` và Wallet confirmation/reconciliation hiện có.
- Khi Wallet xác nhận, Payment phát `payment.refunded` hiện có và `payment.dispute.refund.completed` kèm `resolutionId`, `refundId`, số tiền, trạng thái Payment một phần/toàn phần. Trường hợp phán quyết không thể thực hiện do dữ liệu/khả năng hoàn tiền thay đổi hoặc Admin trùng khách, phát `payment.dispute.refund.needs_review` có mã lỗi an toàn; timeout Wallet đơn lẻ vẫn để Order `refund_pending`.
- Order consumer kiểm tra `resolutionId`, `paymentId`, `refundId`, số tiền, trạng thái và inbox event ID trước khi chuyển `disputed → completed`/`paymentState = partially_refunded|refunded`; event cần rà soát chỉ cập nhật resolution, giữ Order `disputed`.
- Notification/Tracking nhận event quyết định, kết quả và bảo hành. Notification bỏ thông báo `payment.refunded` riêng cho refund HG-82 có `resolutionId`, dùng `order.dispute.resolved` sau xác nhận để tránh thông báo hoàn tiền thành công hai lần.

### 5.4. Kiểm tra đã chạy và giới hạn

- `pnpm run prisma:generate:order`, `pnpm run prisma:generate:payment`: pass.
- `prisma validate` cho hai schema: pass.
- `pnpm run typecheck`: pass. `nest build order-service` và `nest build payment-service`: pass.
- `oxlint` trên Order, Payment, Notification events, Tracking events và common events: pass.
- `pnpm test`: 244 file pass, 2.082 test pass; 18 file và 167 test được suite đánh dấu skip. Các test HG-82 mới kiểm tra quyết định/chiếu trạng thái, idempotency, actor, hạn mức, event sau Wallet confirmation và chống thông báo trùng.
- Docker Desktop daemon không khả dụng trên máy lúc kiểm tra; vì vậy **chưa chạy migration local, RabbitMQ/Wallet/DB integration và chưa kiểm thử trên app/deploy**. Không suy kết quả unit test/mock thành xác nhận tiền đã thực sự hoàn.

---

## 6. Commit Task 4: `a1388415` - Kiểm Thử Và Xác Minh Chất Lượng Local

### 6.1. Test bổ sung

- `backend/apps/order-service/src/orders/orders.service.spec.ts`: kiểm tra danh sách Admin vẫn giữ đơn `disputed` khi resolution là `refund_pending` hoặc `needs_review`, hiển thị đúng số tiền và phân trang; không gắn resolution của lần khiếu nại cũ vào lần hiện tại.
- `backend/apps/order-service/src/orders/hg82-resolution.spec.ts`: kiểm tra số tiền hoàn mặc định bằng số còn được hoàn, chặn vượt hạn mức trước khi tạo quyết định/event, từ chối key khác cho cùng chu kỳ, chặn action cũ sau hoàn thành và role không phải Admin.
- `backend/apps/order-service/src/consumers/hg82-payment-events.spec.ts`: kiểm tra Payment xác nhận hoàn toàn phần thì Order nhận `paymentState = refunded`; event sai Payment hoặc thiếu refund ID không được kết thúc tranh chấp.
- `backend/apps/payment-service/src/order-events/dispute-refund.service.spec.ts`: replay cùng `resolutionId` không tạo refund thứ hai; Payment chuyển sang trạng thái không thể hoàn thì phát `needs_review` thay vì tạo refund.
- `backend/apps/payment-service/test/integration/funded-wallet-refunds.int-spec.ts`: dùng DB Order/Payment/Wallet test và Wallet HTTP thật; hai yêu cầu Admin đồng thời chỉ tạo một resolution, Payment inbox nhận event đúng một lần, Wallet ghi sổ rồi Order consumer kết thúc tranh chấp, replay không tạo refund thứ hai. Kiểm tra unique constraint `(orderId, disputedAt)` trên PostgreSQL.
- `backend/apps/payment-service/test/integration/cross-service-transport.int-spec.ts`: phát quyết định Order và kết quả Payment qua RabbitMQ thật, kiểm tra Order giữ `disputed` cho đến kết quả Wallet rồi chuyển `completed`/`refunded`; kiểm tra SQL backfill `first_completed_at` lặp lại, không ghi đè mốc đã có hoặc điền khi `completed_at` null.
- `backend/apps/payment-service/test/integration/payment-query.int-spec.ts`: nạp `ConfigModule` trong test harness để `PaymentInternalController` được khởi tạo; phục hồi sáu ca HTTP query đã fail trong lần chạy tích hợp đầu.
- Cập nhật `docs/HG-82/TASK-4-TESTING-AND-VERIFICATION.md`: sửa mốc biên chính xác 168 giờ, mã lỗi của người không phải khách, bổ sung đường dẫn các suite, lệnh chạy và kết quả thực tế. File Task 4 trước đó là tài liệu local chưa được tracking; commit Task 4 đưa vào repository.

### 6.2. Kết quả ngày 21/11/2026

- `pnpm test`: **PASS**, 245 file và 2.098 test; 18 file và 167 test được suite đánh dấu skip.
- `pnpm run typecheck`: **PASS**.
- `pnpm exec nest build` cho Order, Payment, Notification và Tracking: **PASS**.
- `pnpm exec oxlint` trên Order, Payment và module event Notification/Tracking/common: **PASS**.
- `pnpm exec prisma validate` cho schema Order và Payment: **PASS**.
- Các suite HG-82 chạy riêng sau bổ sung test: **PASS**. Log báo lỗi giả lập SMTP/Wallet/Firebase/Redis của các ca negative test trong suite chung không làm suite fail.
- Docker Desktop được khởi động local; `pnpm run prisma:generate:wallet` sửa Prisma client cũ trong `node_modules` lệch schema hiện tại. Migration Order, Payment, Wallet áp dụng **PASS** trên PostgreSQL test tạm.
- `pnpm run test:integration:payment`: **PASS**, 9 file và 76 test trên PostgreSQL/RabbitMQ/Wallet test local. Trong lần chạy đầu, client Wallet cũ gây lỗi cột `balance_before`; sau generate lại, `payment-query.int-spec.ts` còn thiếu `ConfigModule` trong harness và đã được sửa. Lần chạy cuối toàn bộ suite pass.

### 6.3. Giới hạn và phần còn phải nghiệm thu

- **Số migration HG-82 mới: 4 file SQL**, gồm 3 file Order (Task 1, 2, 3) và 1 file Payment (Task 3); Task 4 không thêm migration, Wallet không có migration HG-82 mới. Database Docker test ban đầu trống nên script đã áp dụng tổng cộng **19 migration** để dựng đủ ba schema: 7 Order, 6 Payment, 6 Wallet. Mười lăm migration còn lại là lịch sử có sẵn của repo; 19 không phải số migration cần chạy lại trên database cũ.
- Với database đã vận hành, `prisma migrate deploy` dựa vào lịch sử `_prisma_migrations` của từng schema và chỉ áp dụng migration còn thiếu. Nếu tất cả migration trước HG-82 đã được ghi nhận thì tối đa 4 file HG-82 còn chờ; nếu Task 1/2 đã áp dụng thì ít hơn. Cần kiểm tra trạng thái migration trên đúng database đích trước khi triển khai; schema đã có cột/bảng nhưng thiếu lịch sử migration phải được đối soát riêng.
- Backfill được kiểm tra bằng SQL cùng điều kiện migration trên PostgreSQL test sau khi migration đã áp dụng; chưa phục dựng dữ liệu lịch sử thực tế trước migration. Event sai thứ tự và `needs_review` được kiểm tra bằng unit test; notification/tracking HG-82 qua broker và timeline trên app/deploy chưa được xác minh.
- Chỉ dùng container/database test cô lập; không chạy migration hoặc thay đổi DB deploy, không xác nhận refund trên app/deploy, không push hay tạo PR. Container test được dọn sau lần chạy cuối.

---

## 7. Review Fix #01: Sửa `order.status` và `currentPhase` Trong Tracking Summary Cho 3 Event HG-82

### 7.1. Nguyên nhân & phạm vi sửa

Khi `tracking-service` nhận 3 event cuối luồng HG-82 (`order.dispute.decision.recorded`, `order.dispute.resolved`, `order.warranty.completed`), `TrackingEventsService` chưa trích xuất `resolvedStatus`, `adminUserId`, `resolutionNote` và `SummaryService` rơi vào nhánh mặc định `latestOrderEvent.eventType.replace('order.', '')`, làm `order.status` mang giá trị `'dispute.decision.recorded'` / `'dispute.resolved'` / `'warranty.completed'` và `currentPhase` bị lùi về `'ORDER_CREATED'`.

### 7.2. Thay đổi mã nguồn (`backend/apps/tracking-service`)

1. **`src/events/tracking-events.service.ts`:**
   - Trong `recordDomainEvent`:
     - Bổ sung `rawPayload.adminUserId` khi xác định `rawActorId`.
     - Bổ sung `rawPayload.resolvedStatus` khi xác định `toStatus`.
     - Bổ sung `rawPayload.resolutionNote` khi xác định `reason`.
   - Trong `sanitizeMetadata`:
     - Thêm `'workerUserId'`, `'customerUserId'`, `'action'`, `'resolutionId'`, `'resolvedStatus'`, `'decidedAt'`, `'paymentStatus'`, `'refundAmountVnd'` vào danh sách `safeKeys` để không làm mất ngữ cảnh phán quyết và quyền truy cập của thợ được giao đơn.

2. **`src/summary/summary.service.ts`:**
   - Cập nhật `orderCompleted` nhận cả `e.eventType === 'order.completed'` và `e.eventType === 'order.warranty.completed'` để `order.completedAt` phản ánh đúng mốc nghiệm thu bảo hành mới nhất.
   - Bổ sung `meta?.resolvedStatus` vào `targetStatus`.
   - Xử lý rõ các nhánh `latestOrderEvent.eventType`:
     - `'order.completed'` hoặc `'order.warranty.completed'` $\rightarrow$ `orderStatus = 'completed'`, `currentPhase = 'COMPLETED'`.
     - `'order.disputed'`, `'order.dispute.decision.recorded'` hoặc `targetStatus === 'disputed'` $\rightarrow$ `orderStatus = 'disputed'`, `currentPhase = 'DISPUTED'`.
     - `'order.dispute.resolved'` $\rightarrow$ ưu tiên `targetStatus`; nếu không có thì kiểm tra `meta?.action === 'rework'` (`'in_progress'`) hoặc fallback ngược về `order.status.changed` liền trước (backward-compatible với dữ liệu event cũ trong DB), mặc định `'completed'`.

### 7.3. Unit test bổ sung & kết quả kiểm chứng

- **`src/events/tracking-events.service.spec.ts`:**
  - Kiểm tra `recordDomainEvent` với `order.dispute.resolved` lưu đúng `toStatus = 'in_progress'`, `actorUserId = adminUserId`, `reason = resolutionNote` và giữ nguyên `resolutionId`, `action`, `resolvedStatus`, `decidedAt`, `paymentStatus`, `refundAmountVnd`, `customerUserId`, `workerUserId` trong `metadata`.
- **`src/summary/summary.service.spec.ts`:**
  - Kiểm tra 5 kịch bản:
    1. Event cuối là `order.dispute.decision.recorded` (chờ hoàn tiền) $\rightarrow$ `order.status = 'disputed'`, `currentPhase = 'DISPUTED'`.
    2. Event cuối là `order.dispute.resolved` (`dismiss` và `refund`) $\rightarrow$ `order.status = 'completed'`, `currentPhase = 'COMPLETED'`.
    3. Event cuối là `order.dispute.resolved` (`rework`) $\rightarrow$ `order.status = 'in_progress'`, `currentPhase = 'ORDER_IN_PROGRESS'`.
    4. Event cuối là `order.warranty.completed` $\rightarrow$ `order.status = 'completed'`, `currentPhase = 'COMPLETED'`, `order.completedAt` cập nhật theo mốc nghiệm thu bảo hành.
    5. Backward-compatibility: `order.dispute.resolved` cũ không có `toStatus`/`resolvedStatus` vẫn fallback chính xác về `order.status.changed` liền trước.
- **Kết quả chạy kiểm tra local:**
  - `pnpm exec vitest run apps/tracking-service`: **PASS** (9 test files passed, 4 skipped; 108 tests passed, 13 skipped).
  - `pnpm run typecheck`: **PASS**.
  - `pnpm exec oxlint apps/tracking-service`: **PASS** (0 warnings, 0 errors).
  - `pnpm exec nest build tracking-service`: **PASS**.

---

## 8. Review Fix #02: Giải Quyết Dead-End Tại `needs_review` Và Xử Lý Wallet Trả 4xx (`rejected`) Cho Hoàn Tiền Khiếu Nại

### 8.1. Nguyên nhân & phạm vi sửa

1. **Dead-end tại `needs_review` (`order-service`):** Khi Payment trả `payment.dispute.refund.needs_review`, bản ghi `OrderDisputeResolution` chuyển sang `state = 'needs_review'` và đơn hàng vẫn ở `status = 'disputed'`. Ràng buộc cứng `@@unique([orderId, disputedAt])` cùng kiểm tra trùng trong `OrdersService.resolveCompletedDispute` chặn Admin gửi phán quyết thay thế (`dismiss`, `rework`, hoặc `refund` mức tiền hợp lệ hơn) bằng lỗi `409 DISPUTE_ALREADY_DECIDED`.
2. **Treo `refund_pending` khi Wallet trả 4xx (`payment-service`):** Trong `RefundsService.execute`, khi `wallet.refundCredit` trả `{ outcome: 'rejected', status: 4xx }`, hàm thoát sớm mà không ghi mã lỗi từ chối và không phát `payment.dispute.refund.needs_review` về `order-service`, khiến đơn hàng treo ở `refund_pending`.

### 8.2. Thay đổi mã nguồn & Migration

1. **Database Migration & Prisma Schema (`backend/apps/order-service`):**
   - File migration mới: `prisma/migrations/20261122000000_active_dispute_resolution_unique/migration.sql`:
     - Xóa constraint/index unique cứng `order_dispute_resolutions_order_id_disputed_at_key`.
     - Tạo partial unique index `order_dispute_resolutions_active_unique` trên `(order_id, disputed_at) WHERE state <> 'superseded'`.
     - Tạo index tra cứu `order_dispute_resolutions_order_id_disputed_at_idx` trên `(order_id, disputed_at)`.
   - Cập nhật `prisma/schema.prisma`: đổi `@@unique([orderId, disputedAt])` thành `@@index([orderId, disputedAt])` trên model `OrderDisputeResolution`.
   - Cập nhật `backend/deploy/production/tests/test_database_incident.py`: bổ sung migration mới vào danh sách `later_migrations` của bài kiểm tra baseline onboarding.

2. **`backend/apps/order-service/src/orders/orders.service.ts`:**
   - Trong `resolveCompletedDispute`: truy vấn bản ghi active (`state: { not: 'superseded' }`) cho `(orderId, order.disputedAt)`. Nếu tồn tại bản ghi có `state !== 'needs_review'` thì giữ nguyên lỗi `409 DISPUTE_ALREADY_DECIDED`; nếu đang ở `state === 'needs_review'` thì cập nhật bản ghi cũ sang `state: 'superseded'` trong cùng transaction trước khi tạo bản ghi phán quyết mới.
   - Trong `adminFindDisputes`: lọc `state: { not: 'superseded' }` để chỉ ghép phán quyết active hiện hành cho từng đơn khiếu nại.

3. **`backend/apps/payment-service/src/refunds/refunds.service.ts`:**
   - Trong `execute`: khi `wallet.refundCredit` trả `credit.outcome === 'rejected'`, tạo mã `failureCode = WALLET_REJECTED_${credit.status ?? 400}`, cập nhật `Refund.failureReason` (`${failureCode}: ${credit.message}`, tối đa 255 ký tự) và nếu có `row.disputeResolutionId` thì enqueue `payment.dispute.refund.needs_review` vào outbox trong cùng transaction.
   - Chặn retry lặp vô hạn và chống spam event `needs_review` cho các bản ghi đã có `failureReason` bắt đầu bằng `WALLET_REJECTED_` trong `execute` (với dispute refund) và `resumeApproved`.

### 8.3. Unit test bổ sung & kết quả kiểm chứng

- **`backend/apps/order-service/src/orders/hg82-resolution.spec.ts` & `orders.service.spec.ts`:**
  - Kiểm tra khi resolution hiện tại ở `needs_review`, Admin gọi `resolveCompletedDispute` với `idempotencyKey` mới (`dismiss`, `rework`, hoặc `refund` số tiền hợp lệ) $\rightarrow$ bản ghi cũ chuyển sang `superseded`, bản ghi mới tạo thành công.
  - Kiểm tra khi resolution ở `refund_pending` hoặc `completed`, gọi với `idempotencyKey` mới vẫn bị chặn `409 DISPUTE_ALREADY_DECIDED`.
  - Kiểm tra `adminFindDisputes` bỏ qua bản ghi `superseded` và chỉ hiển thị bản ghi active.
- **`backend/apps/payment-service/src/refunds/hg82-refund-outcome.spec.ts`:**
  - Kiểm tra khi `wallet.refundCredit` trả `{ outcome: 'rejected', status: 422, message: 'Insufficient reserve' }` $\rightarrow$ cập nhật `failureReason = 'WALLET_REJECTED_422: Insufficient reserve'`, phát `payment.dispute.refund.needs_review` (`failureCode: 'WALLET_REJECTED_422'`), và không retry/spam ở lần gọi tiếp theo.
  - Kiểm tra khi `wallet.refundCredit` trả `{ outcome: 'unknown', message: 'timeout' }` $\rightarrow$ không phát `needs_review`, giữ nguyên để reconciliation retry.
- **Kết quả chạy kiểm tra local:**
  - `pnpm run prisma:generate:order` & `prisma validate`: **PASS**.
  - `pnpm exec vitest run apps/order-service apps/payment-service`: **PASS**.
  - `pnpm run typecheck`: **PASS**.
  - `pnpm exec oxlint apps/order-service apps/payment-service`: **PASS** (0 warnings, 0 errors).
  - `pnpm exec nest build order-service` & `pnpm exec nest build payment-service`: **PASS**.

---

## 9. Review Fix #03: Bảo Toàn Invariant Bảo Hành Trong Legacy `resolveDispute` Sau Khi Admin Chọn `rework`

### 9.1. Nguyên nhân & phạm vi sửa

Sau khi một đơn hàng đã hoàn tất lần đầu (`firstCompletedAt !== null`) và Admin phán quyết `rework` để đưa đơn về `in_progress`, nếu phát sinh tranh chấp mới trong quá trình bảo hành (`disputePreviousStatus` là `'in_progress'` hoặc `'awaiting_customer_confirmation'`), Admin xử lý qua luồng `OrdersService.resolveDispute` gặp 2 lỗ hổng vi phạm bất biến HG-82:
1. Nhánh `action: 'cancel'` cho phép hủy thẳng đơn bảo hành đã thanh toán sang `'cancelled'` mà không đi qua quy trình hoàn tiền.
2. Nhánh `action: 'complete'` luôn phát `order.completed` thay vì `order.warranty.completed`, làm phát lại sự kiện hoàn thành gốc lần thứ hai.

### 9.2. Thay đổi mã nguồn (`backend/apps/order-service`)

- **`src/orders/orders.service.ts` (phương thức `resolveDispute`):**
  - Ở nhánh `dto.action === 'cancel'`: kiểm tra `if (order.firstCompletedAt)`, nếu đơn đã từng hoàn tất thì ném `BadRequestException` với mã lỗi `ORDER_ERROR_CODES.LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION`, không cập nhật DB và không tạo outbox event.
  - Ở nhánh `dto.action === 'complete'`: kiểm tra `const isWarrantyCompletion = Boolean(order.firstCompletedAt)`. Nếu `isWarrantyCompletion === true` thì giữ nguyên `order.firstCompletedAt`, phát `ORDER_CONSTANTS.EVENT_ORDER_WARRANTY_COMPLETED` (kèm `firstCompletedAt` trong payload); nếu `false` thì gán `firstCompletedAt = now` và phát `ORDER_CONSTANTS.EVENT_ORDER_COMPLETED`.

### 9.3. Unit test bổ sung & kết quả kiểm chứng

- **`src/orders/hg82-resolution.spec.ts`:**
  1. `resolveDispute` với `action: 'complete'` trên đơn có `firstCompletedAt !== null` và `disputePreviousStatus === 'in_progress'` $\rightarrow$ chuyển `status = 'completed'`, giữ nguyên `firstCompletedAt`, phát `order.warranty.completed` (không phát `order.completed`).
  2. `resolveDispute` với `action: 'complete'` trên đơn thường (`firstCompletedAt === null`) $\rightarrow$ gán `firstCompletedAt`, phát `order.completed`.
  3. `resolveDispute` với `action: 'cancel'` trên đơn có `firstCompletedAt !== null` $\rightarrow$ ném `BadRequestException` (`LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION`), không ghi DB/outbox.
- **Kết quả chạy kiểm tra local:**
  - `pnpm exec vitest run apps/order-service/src/orders/orders.service.spec.ts apps/order-service/src/orders/hg82-resolution.spec.ts`: **PASS**.
  - `pnpm run typecheck`: **PASS**.
  - `pnpm exec oxlint apps/order-service`: **PASS** (0 warnings, 0 errors).
  - `pnpm exec nest build order-service`: **PASS**.

---

## 10. Review Fix #04: Lọc `evidenceType: 'work'` Trong Kiểm Tra Bằng Chứng Công Việc ORD-10 (`finish` & `addEvidence`)

### 10.1. Nguyên nhân & phạm vi sửa

Bảng `order_evidences` lưu chung bằng chứng thi công của thợ (`evidenceType = 'work'`) và bằng chứng khiếu nại (`evidenceType = 'dispute'`). Tuy nhiên:
1. `OrdersService.finish()` đếm tổng `orderEvidence` theo `orderId` (hoặc đọc `_count?.evidences`) mà không lọc `evidenceType: 'work'`, dẫn đến đơn có ảnh `dispute` nhưng 0 ảnh `work` vẫn vượt qua được kiểm tra ORD-10.
2. `OrdersService.addEvidence()` khi dedup theo `mediaUrl` chưa lọc `evidenceType: 'work'`, có thể trả về bản ghi `dispute` nếu trùng URL thay vì lưu bản ghi `work`.

### 10.2. Thay đổi mã nguồn (`backend/apps/order-service`)

- **`src/orders/orders.service.ts`:**
  - Trong `finish()`: bỏ nhánh đọc `(order as any)._count?.evidences` và truy vấn trực tiếp `await tx.orderEvidence.count({ where: { orderId, evidenceType: 'work' } })`.
  - Trong `addEvidence()`: bổ sung `evidenceType: 'work'` vào điều kiện `where` của `existingByUrl` (`tx.orderEvidence.findFirst({ where: { orderId, mediaUrl: dto.mediaUrl, evidenceType: 'work' } })`) và truyền tường minh `evidenceType: 'work'` khi tạo bản ghi mới (`tx.orderEvidence.create`).

### 10.3. Unit test bổ sung & kết quả kiểm chứng

- **`src/orders/orders.service.spec.ts`:**
  1. `finish()` khi đơn chỉ có bằng chứng `dispute` (`_count.evidences = 2` nhưng `tx.orderEvidence.count` với `evidenceType: 'work'` trả về `0`) $\rightarrow$ ném `BadRequestException` với mã `MISSING_EVIDENCE`, không cập nhật trạng thái đơn.
  2. `finish()` khi đơn có ít nhất 1 bằng chứng `evidenceType: 'work'` $\rightarrow$ chuyển sang `awaiting_customer_confirmation` thành công.
  3. `addEvidence()` truyền `evidenceType: 'work'` vào `tx.orderEvidence.findFirst` khi kiểm tra trùng `mediaUrl`.
- **Kết quả chạy kiểm tra local:**
  - `pnpm exec vitest run apps/order-service/src/orders/orders.service.spec.ts apps/order-service/src/orders/hg82-resolution.spec.ts`: **PASS**.
  - `pnpm run typecheck`: **PASS**.
  - `pnpm exec oxlint apps/order-service`: **PASS** (0 warnings, 0 errors).
  - `pnpm exec nest build order-service`: **PASS**.

---

## 11. Review Fix #05: Chống Nuốt Event Âm Thầm Và Ghi Log Cảnh Báo Đối Soát Trong `PaymentEventsConsumer`

### 11.1. Nguyên nhân & phạm vi sửa

Trong `PaymentEventsConsumer.processDisputeRefund`:
1. Kiểm tra `typeof eventId !== 'string'` chưa loại bỏ chuỗi rỗng hoặc toàn khoảng trắng (`"   "`), và khi NACK message hỏng chưa ghi log cảnh báo.
2. `consumedEventRepo.recordEventIfNew` được gọi trước khi kiểm tra sự tồn tại của `resolution` và `order`, làm event bị đánh dấu đã tiêu thụ vĩnh viễn ngay cả khi chưa tìm thấy `resolution`/`order`.
3. Các nhánh guard từ chối do lệch `paymentId`, `refundAmountVnd`, `order.status` hoặc `resolution.state` chỉ `return` im lặng mà không ghi `logger.warn`.

### 11.2. Thay đổi mã nguồn (`backend/apps/order-service`)

- **`src/consumers/payment-events.consumer.ts` (`processDisputeRefund`):**
  - Chuẩn hóa `const normalizedEventId = typeof eventId === 'string' ? eventId.trim() : ''`; nếu rỗng hoặc `resolutionId`/`orderId` không phải UUID thì ghi `this.logger.warn` kèm thông tin envelope trước khi `nackMessage(context, false)`.
  - Trong transaction, khóa `order` và đọc `resolution`, `order` trước: nếu thiếu `resolution` hoặc `order` thì ghi `this.logger.warn` và thoát mà **không** gọi `consumedEventRepo.recordEventIfNew`.
  - Sau khi `recordEventIfNew(normalizedEventId, eventType, tx)` xác nhận event mới, tách rõ 2 cụm guard (kiểm tra khớp `resolution` và kiểm tra điều kiện hoàn tất `completed`) và ghi `this.logger.warn` đầy đủ `eventId`, `resolutionId`, `orderId`, `expectedPaymentId`/`actualPaymentId`, `expectedAmount`/`actualAmount`, `orderStatus`, `state` trước khi `return`.

### 11.3. Unit test bổ sung & kết quả kiểm chứng

- **`src/consumers/hg82-payment-events.spec.ts`:**
  1. Event có `eventId: "   "` $\rightarrow$ ghi `logger.warn`, gọi `nack(msg, false, false)`, không mở transaction hay ghi `consumed_events`.
  2. Event không tìm thấy `resolution` $\rightarrow$ ghi `logger.warn` và không gọi `recordEventIfNew`.
  3. Event lệch `paymentId`, thiếu `refundId`, hoặc lệch `refundAmountVnd` $\rightarrow$ ghi `logger.warn` chứa đúng `eventId`, `resolutionId`, `orderId` và không cập nhật `orders`.
- **Kết quả chạy kiểm tra local:**
  - `pnpm exec vitest run apps/order-service/src/consumers apps/order-service/src/orders/hg82-resolution.spec.ts`: **PASS**.
  - `pnpm run typecheck`: **PASS**.
  - `pnpm exec oxlint apps/order-service`: **PASS** (0 warnings, 0 errors).
  - `pnpm exec nest build order-service`: **PASS**.

---

## 12. Review Fix #06: Siết Giới Hạn Độ Dài Input, Giao Thức URL Bằng Chứng Và Biên Số Chữ Số `refundAmountVnd`

### 12.1. Nguyên nhân & phạm vi sửa

1. `DisputeOrderDto.evidenceUrls` dùng `@IsUrl({})` mặc định của `class-validator`, cho phép `ftp://` hoặc URL thiếu protocol (`evil.com/a.jpg`), đồng thời thiếu `@ArrayMaxSize` và `@MaxLength` cho từng URL.
2. `DisputeOrderDto.reason` và `ResolveDisputeDto.resolutionNote` chưa có `@MaxLength(2000)`.
3. `ResolveDisputeDto.refundAmountVnd` và guard trong `OrdersService.resolveCompletedDispute` dùng `/^[1-9][0-9]*$/` không giới hạn số chữ số (chuỗi $\ge 20$ chữ số vượt kiểu `BIGINT` 64-bit của PostgreSQL).

### 12.2. Thay đổi mã nguồn (`backend/apps/order-service`)

1. **`src/orders/dto/dispute-order.dto.ts`:**
   - Thêm `@MaxLength(2000)` cho `reason`.
   - Thêm `@ArrayMaxSize(10)`, `@MaxLength(2048, { each: true })` và `@IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { each: true })` cho `evidenceUrls`.
2. **`src/orders/dto/resolve-dispute.dto.ts` & `src/orders/orders.service.ts`:**
   - Thêm `@MaxLength(2000)` cho `ResolveDisputeDto.resolutionNote` và kiểm tra `note.length > 2000` trong `OrdersService.resolveCompletedDispute`.
   - Đổi regex `refundAmountVnd` từ `/^[1-9][0-9]*$/` sang `/^[1-9]\d{0,18}$/` ở cả `ResolveDisputeDto` và `OrdersService.resolveCompletedDispute`.

### 12.3. Unit test bổ sung & kết quả kiểm chứng

- **`src/orders/dto/dispute-order.dto.spec.ts` & `src/orders/hg82-resolution.spec.ts`:**
  - Kiểm tra `DisputeOrderDto`: chấp nhận URL `https://storage.handygo.vn/a.jpg`; từ chối `ftp://evil.com/a.jpg`, `evil.com/a.jpg` (thiếu protocol), `javascript:alert(1)`, mảng 11 phần tử, URL dài > 2048 ký tự, và `reason` dài 2001 ký tự.
  - Kiểm tra `ResolveDisputeDto` & `OrdersService.resolveCompletedDispute`: chấp nhận `refundAmountVnd: '50000'`; từ chối `resolutionNote` dài 2001 ký tự và `refundAmountVnd` 20 chữ số (`'10000000000000000000'`).
- **Kết quả chạy kiểm tra local:**
  - `pnpm exec vitest run apps/order-service/src/orders`: **PASS**.
  - `pnpm run typecheck`: **PASS**.
  - `pnpm exec oxlint apps/order-service`: **PASS** (0 warnings, 0 errors).
  - `pnpm exec nest build order-service`: **PASS**.

---

## 13. Review Fix #07: Lưu Và Hiển Thị `disputeCategory`, Đảo Thứ Tự Guard `resolveDispute` Và Hỗ Trợ Bộ Lọc `paymentState = partially_refunded`

### 13.1. Nguyên nhân & phạm vi sửa

1. `DisputeOrderDto.category` chỉ được truyền vào outbox event `order.disputed` mà không lưu vào bảng `orders` hay trả ra API chi tiết đơn / danh sách khiếu nại Admin.
2. Trong `OrdersService.resolveDispute`, kiểm tra `order.disputePreviousStatus === 'completed'` đứng trước `order.status !== 'disputed'`, khiến lời gọi lặp lại trên đơn đã giải quyết xong trả `400 LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION` thay vì `409 INVALID_STATE_TRANSITION`.
3. `QueryOrderDto.paymentState` (và `OrderResponseDto.paymentState`) thiếu giá trị `'partially_refunded'`.

### 13.2. Thay đổi mã nguồn & Migration (`backend/apps/order-service`)

1. **Migration & Prisma Schema (Phương án A — Lưu & hiển thị `disputeCategory`):**
   - Tạo migration `prisma/migrations/20261122001000_add_order_dispute_category/migration.sql` thêm cột `dispute_category VARCHAR(50)` vào `order_service.orders`.
   - Cập nhật `prisma/schema.prisma` thêm `disputeCategory String? @map("dispute_category") @db.VarChar(50)` vào model `Order` và đăng ký migration vào `later_migrations` trong `backend/deploy/production/tests/test_database_incident.py`.
   - Lưu `disputeCategory: dto.category ?? null` trong `OrdersService.dispute` và trả `disputeCategory` trong `OrderResponseDto` (`formatOrderResponse`) cũng như `AdminDisputeItemDto` (`adminFindDisputes`).
2. **Thứ tự guard trong `OrdersService.resolveDispute`:**
   - Kiểm tra `if (order.status !== 'disputed')` (ném `409 INVALID_STATE_TRANSITION`) trước `if (order.disputePreviousStatus === 'completed')` (ném `400 LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION`).
3. **Hỗ trợ `'partially_refunded'` trong `QueryOrderDto`:**
   - Bổ sung `'partially_refunded'` vào `PAYMENT_STATE_VALUES` trong `src/orders/dto/query-order.dto.ts` và enum Swagger của `OrderResponseDto`.

### 13.3. Unit test bổ sung & kết quả kiểm chứng

- **`src/orders/orders.service.spec.ts`, `src/orders/hg82-resolution.spec.ts`, `src/orders/dto/dispute-order.dto.spec.ts`:**
  1. `dispute()` lưu `disputeCategory` vào DB và `adminFindDisputes()` trả đúng `disputeCategory`.
  2. `resolveDispute()` gọi trên đơn có `status: 'completed'` và `disputePreviousStatus: 'completed'` trả `409 INVALID_STATE_TRANSITION`.
  3. `QueryOrderDto` chấp nhận `paymentState: 'partially_refunded'`.
- **Kết quả chạy kiểm tra local:**
  - `pnpm run prisma:generate:order` & `prisma validate`: **PASS**.
  - `pnpm exec vitest run apps/order-service/src/orders`: **PASS**.
  - `pnpm run typecheck`: **PASS**.
  - `pnpm exec oxlint apps/order-service`: **PASS** (0 warnings, 0 errors).
  - `pnpm exec nest build order-service`: **PASS**.
