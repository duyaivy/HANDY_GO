# Lỗi #09: Bổ sung unit test cho 5 đường dẫn mới trọng yếu chưa có coverage

- **Mức độ:** `Should fix` (Không chặn merge — nhưng rất nên làm cùng các lỗi Must fix)
- **Trục review:** `Test coverage`
- **Service ảnh hưởng:** `backend/apps/order-service`, `backend/apps/tracking-service`
- **PR / Commit gốc:** PR #97 (`a4ae22c320a7fdfa70f519ea742598c05323f665`)

---

## 1. Tóm tắt lỗi & Tác động

Dù 182 unit test hiện có đều xanh, vẫn còn **5 đường dẫn code mới quan trọng hoàn toàn chưa có unit test**:

1. **`PaymentRefundClient.byOrder`** (`order-service`): 0 test. Toàn bộ các nhánh xử lý lỗi cấu hình/mạng/payload sai format đều chưa từng chạy trong test.
2. **`GET /api/v1/admin/orders/dispute-resolutions/:resolutionId`** (`AdminOrdersController.findDisputeResolution` & `OrdersService.adminFindDisputeResolution`): 0 test cho 200 / 403 / 404.
3. **Nhánh `confirmCompletion` phát `order.warranty.completed`** (`orders.service.ts:701`): chưa có test chứng minh khi `order.firstCompletedAt !== null` thì phát `order.warranty.completed` thay vì `order.completed`.
4. **3 handler mới ở `TrackingEventsConsumer`** (`tracking-events.consumer.ts:286-299`): 0 test cho `handleDisputeDecision`, `handleDisputeResolved`, `handleWarrantyCompleted`.
5. **`SummaryService.getSummary` với 3 event HG-82 mới** (`summary.service.ts`): 0 test — đây chính là lý do **Lỗi #01** làm hỏng 100% Tracking Summary lọt qua CI.

---

## 2. Vị trí mã nguồn liên quan

1. `backend/apps/order-service/src/orders/payment-refund.client.ts` (dòng 8–38)
2. `backend/apps/order-service/src/orders/admin-orders.controller.ts` (dòng 120–127) & `orders.service.ts` (`adminFindDisputeResolution`)
3. `backend/apps/order-service/src/orders/orders.service.ts` (dòng 690–720)
4. `backend/apps/tracking-service/src/events/tracking-events.consumer.ts` (dòng 286–299)
5. `backend/apps/tracking-service/src/summary/summary.service.ts` (dòng 243–318, 443–481)

---

## 3. Hướng dẫn bổ sung test chi tiết từng phần

### Phần 1: Tạo `backend/apps/order-service/src/orders/payment-refund.client.spec.ts`
Mock `global.fetch` bằng `vi.spyOn(global, 'fetch')` và kiểm thử đủ các nhánh:
- [x] Thiếu `internalServiceSecret` → ném `ServiceUnavailableException('Payment internal authentication is not configured')`.
- [x] `PAYMENT_SERVICE_URL` không hợp lệ hoặc sai protocol (`ftp://...`) → ném `ServiceUnavailableException('Payment URL is invalid')`.
- [x] `fetch` ném lỗi mạng / `AbortError` (timeout) → ném `ServiceUnavailableException('Payment is unreachable')`.
- [x] HTTP status khác `200` (vd `500`, `401`, `404`) → ném `ServiceUnavailableException('Payment refundability is unavailable')`.
- [x] Response JSON hỏng / thiếu `data` / `paymentId` không phải UUID / `refundableAmountVnd` âm hoặc không phải số nguyên (`"-1"`, `"100.5"`, `"01"`) → ném `ServiceUnavailableException('Payment response is invalid')`.
- [x] Happy path: trả về `{ paymentId, status: 'succeeded', refundableAmountVnd: 250000n }` và xác nhận header `'x-internal-secret'` được gửi đúng, không lặp `apiPrefix` khi base URL đã chứa `/api/v1`.

### Phần 2: Bổ sung test `findDisputeResolution` / `adminFindDisputeResolution`
Files:
- `backend/apps/order-service/src/orders/admin-orders.controller.spec.ts`
- `backend/apps/order-service/src/orders/hg82-resolution.spec.ts`

Các case cần có:
- [x] Role không phải Admin → ném `ForbiddenException` (`FORBIDDEN_ROLE`).
- [x] Không tìm thấy `resolutionId` → ném `NotFoundException`.
- [x] Tìm thấy → trả về đúng cấu trúc `{ resolutionId, orderId, action, state, refundAmountVnd, paymentId, refundId, failureCode, ... }` (kiểm tra `refundAmountVnd` convert sang string hoặc `null`).

### Phần 3: Bổ sung test warranty completion trong `orders.service.spec.ts`
File: `backend/apps/order-service/src/orders/orders.service.spec.ts`

Các case cần có:
- [x] `confirmCompletion` khi `order.firstCompletedAt === null`: gán `firstCompletedAt = now`, phát `ORDER_CONSTANTS.EVENT_ORDER_COMPLETED`.
- [x] `confirmCompletion` khi `order.firstCompletedAt !== null` (sau `rework`): giữ nguyên `firstCompletedAt`, cập nhật `completedAt = now`, phát `ORDER_CONSTANTS.EVENT_ORDER_WARRANTY_COMPLETED` (KHÔNG phát `EVENT_ORDER_COMPLETED`).

### Phần 4: Bổ sung test cho `TrackingEventsConsumer` & `SummaryService`
Files:
- `backend/apps/tracking-service/src/events/tracking-events.consumer.spec.ts`
- `backend/apps/tracking-service/src/summary/summary.service.spec.ts`

Các case cần có:
- [x] `handleDisputeDecision`, `handleDisputeResolved`, `handleWarrantyCompleted` ủy quyền đúng pattern tương ứng tới `processEvent`.
- [x] `SummaryService.getSummary` cho cả 4 trạng thái cuối:
  - `order.dispute.decision.recorded` → `order.status = 'disputed'`, `currentPhase = 'DISPUTED'`.
  - `order.dispute.resolved` (`resolvedStatus: 'completed'`) → `order.status = 'completed'`, `currentPhase = 'COMPLETED'`.
  - `order.dispute.resolved` (`resolvedStatus: 'in_progress'`) → `order.status = 'in_progress'`, `currentPhase = 'ORDER_IN_PROGRESS'`.
  - `order.warranty.completed` → `order.status = 'completed'`, `currentPhase = 'COMPLETED'`, `order.completedAt` là mốc của `order.warranty.completed`.

---

## 4. Lệnh kiểm chứng

```powershell
cd backend
pnpm exec vitest run apps/order-service apps/tracking-service apps/payment-service
```

---

## 5. Definition of Done

- [x] Có file `payment-refund.client.spec.ts` phủ toàn bộ các nhánh lỗi và happy path.
- [x] Có unit test cho `GET /admin/orders/dispute-resolutions/:resolutionId` (200/403/404).
- [x] Có unit test phân biệt `order.completed` vs `order.warranty.completed` trong `confirmCompletion`.
- [x] Có unit test cho 3 handler mới ở `TrackingEventsConsumer` và `SummaryService` (khóa chặt hồi quy cho Lỗi #01).
- [x] Toàn bộ test suite của `order-service`, `tracking-service`, `payment-service` pass.
