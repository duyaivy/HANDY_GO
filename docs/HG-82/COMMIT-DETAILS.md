# [HG-82] Chi Tiết Thay Đổi Task 1, Task 2 Và Task 3

Tài liệu này ghi nhận thay đổi kỹ thuật trên nhánh `feature/HG-82-order-dispute-7-days-admin-resolution`, bao gồm migrations, Prisma schema, API, event, logic service và kết quả kiểm tra local. Bảng dưới ghi SHA của hai commit đã có; mục 5 ghi chi tiết phần Task 3 của commit hiện tại.

---

## 1. Tổng Quan 2 Commit

| Commit SHA | Thông điệp Commit | Task liên quan | Tóm tắt thay đổi |
| :--- | :--- | :--- | :--- |
| **`a7836ac`** | `feat(HG-82): support seven-day disputes on completed orders` | **Task 1** | Cho phép khách hàng mở khiếu nại trong 7 ngày sau khi hoàn tất đơn (`completed`); lưu metadata bằng chứng khiếu nại (`evidence_type`, `submitted_by_user_id`); migration DB; mở rộng Outbox event. |
| **`592aded`** | `feat(HG-82): add admin dispute queue` | **Task 2** | Xây dựng API `GET /admin/orders/disputes` cho Admin tra cứu danh sách khiếu nại; thêm migration tạo index DB `(status, disputed_at)`; DTO query & response; test proxy API Gateway. |

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

## 5. Task 3: Admin Phán Quyết Khiếu Nại Sau Hoàn Thành

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
