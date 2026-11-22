# Lỗi #03: Legacy `resolveDispute` phá vỡ invariant bảo hành sau khi Admin chọn `rework`

- **Mức độ:** `Must fix` (Chặn merge)
- **Trục review:** `Correctness`
- **Service ảnh hưởng:** `backend/apps/order-service`
- **PR / Commit gốc:** PR #97 (`a4ae22c320a7fdfa70f519ea742598c05323f665`)

---

## 1. Tóm tắt lỗi & Tác động

Sau khi đơn hoàn tất (`completed`, đã thanh toán) và Admin phán quyết `rework`:
- `order.firstCompletedAt` được giữ nguyên (khác `null`).
- `order.status` quay về `'in_progress'`.

Nếu trong lúc thợ đang làm bảo hành (`in_progress` hoặc `awaiting_customer_confirmation`) lại phát sinh tranh chấp mới:
- `order.disputePreviousStatus` là `'in_progress'` hoặc `'awaiting_customer_confirmation'` (không phải `'completed'`).
- Do đó Admin không thể dùng `resolveCompletedDispute` mà phải dùng luồng legacy `resolveDispute`.

Tại `resolveDispute` hiện có **2 lỗi vi phạm bất biến (invariant) HG-82**:
1. **Nhánh `action: 'complete'` (dòng 1490):** Dù dòng 1483 đã biết đơn có thể có `firstCompletedAt`, dòng 1490 vẫn luôn phát `EVENT_ORDER_COMPLETED` thay vì `EVENT_ORDER_WARRANTY_COMPLETED` → phát sai sự kiện hoàn thành gốc sang Notification Service và Tracking Service (trái với `confirmCompletion` tại dòng 701).
2. **Nhánh `action: 'cancel'` (dòng 1440–1465):** Cho phép hủy thẳng một đơn **đã từng hoàn tất & đã thanh toán** (`firstCompletedAt !== null`) sang `'cancelled'` mà không đi qua luồng hoàn tiền, trái với bất biến cốt lõi của HG-82 (`completed` đã thanh toán không được chuyển sang `cancelled`).

---

## 2. Vị trí mã nguồn liên quan

1. `backend/apps/order-service/src/orders/orders.service.ts` (dòng 1440–1492):
   ```ts
   } else if (dto.action === 'cancel') {
     nextStatus = 'cancelled';
     orderUpdateData.status = nextStatus;
     orderUpdateData.cancelledAt = now;
     orderUpdateData.cancelReason = dto.resolutionNote;
     // Không kiểm tra order.firstCompletedAt !== null!
     ...
   } else if (dto.action === 'complete') {
     nextStatus = 'completed';
     orderUpdateData.status = nextStatus;
     orderUpdateData.completedAt = now;
     if (!order.firstCompletedAt) orderUpdateData.firstCompletedAt = now;

     // Exactly 1 transactional order.completed event for Payment settlement
     await this.outboxRepo.createEvent(
       {
         aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
         aggregateId: orderId,
         eventType: ORDER_CONSTANTS.EVENT_ORDER_COMPLETED, // <-- SAI khi order.firstCompletedAt != null
         eventVersion: 1,
         payload: { ... },
       },
       tx,
     );
   ```

2. Đối chiếu cách làm đúng trong `confirmCompletion` tại `backend/apps/order-service/src/orders/orders.service.ts` (dòng 695–710):
   - Khi `order.firstCompletedAt !== null`, `confirmCompletion` phát `ORDER_CONSTANTS.EVENT_ORDER_WARRANTY_COMPLETED` thay vì `EVENT_ORDER_COMPLETED`.

---

## 3. Phân tích nguyên nhân gốc & Kịch bản tái hiện

### Kịch bản 1 (Sai event khi `complete` đơn bảo hành)
1. Đơn hoàn thành lần đầu → `firstCompletedAt = T1`, `status = 'completed'`, Payment đã settled.
2. Khách khiếu nại → Admin chọn `rework` → `status = 'in_progress'`, `firstCompletedAt = T1`.
3. Trong lúc làm lại, khách hoặc thợ mở tranh chấp → `status = 'disputed'`, `disputePreviousStatus = 'in_progress'`.
4. Admin gọi `resolveDispute` với `action: 'complete'`.
5. Kết quả sai: Outbox phát `order.completed` (lần 2) thay vì `order.warranty.completed`.

### Kịch bản 2 (Hủy nhầm đơn đã thanh toán)
1. Cùng bước 1–3 ở trên.
2. Admin gọi `resolveDispute` với `action: 'cancel'`.
3. Kết quả sai: Đơn đã thanh toán bị chuyển sang `status = 'cancelled'`, phát `order.cancelled` mà không có quy trình hoàn tiền.

---

## 4. Hướng dẫn sửa chi tiết từng bước

File: `backend/apps/order-service/src/orders/orders.service.ts`

1. **Chặn `action: 'cancel'` trên đơn đã hoàn tất trước đó (dòng 1440):**
   ```ts
   } else if (dto.action === 'cancel') {
     if (order.firstCompletedAt) {
       throw new BadRequestException({
         code: ORDER_ERROR_CODES.LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION,
         message:
           'Cannot cancel a warranty order that was already completed and settled. Complete or resolve via refund flow instead.',
       });
     }
     nextStatus = 'cancelled';
     ...
   ```

2. **Phân biệt `EVENT_ORDER_WARRANTY_COMPLETED` và `EVENT_ORDER_COMPLETED` ở nhánh `complete` (dòng 1479–1505):**
   ```ts
   } else if (dto.action === 'complete') {
     const isWarrantyCompletion = Boolean(order.firstCompletedAt);
     nextStatus = 'completed';
     orderUpdateData.status = nextStatus;
     orderUpdateData.completedAt = now;
     if (!order.firstCompletedAt) {
       orderUpdateData.firstCompletedAt = now;
     }

     await this.outboxRepo.createEvent(
       {
         aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
         aggregateId: orderId,
         eventType: isWarrantyCompletion
           ? ORDER_CONSTANTS.EVENT_ORDER_WARRANTY_COMPLETED
           : ORDER_CONSTANTS.EVENT_ORDER_COMPLETED,
         eventVersion: 1,
         payload: {
           orderId,
           orderCode: order.orderCode,
           customerUserId: order.customerUserId,
           customerId: order.customerUserId,
           workerUserId: order.workerUserId,
           workerId: order.workerUserId,
           serviceId: order.serviceId,
           agreedPrice: order.agreedPrice.toString(),
           completedAt: now.toISOString(),
           ...(isWarrantyCompletion
             ? { firstCompletedAt: order.firstCompletedAt!.toISOString() }
             : {}),
         },
       },
       tx,
     );
   ```

3. **Kiểm tra xem có cần cho phép Admin hoàn tiền ở đơn bảo hành đang tranh chấp không:**
   - Nếu sau này cần hỗ trợ `refund` trực tiếp cho đơn bảo hành đang `disputed` (`firstCompletedAt != null` và `disputePreviousStatus !== 'completed'`), hãy xác nhận thêm với PO; trong phạm vi fix lỗi này, ít nhất phải chặn `cancel` để không phá hỏng bất biến tài chính và phát đúng `order.warranty.completed` khi `complete`.

---

## 5. Test case cần bổ sung & Lệnh kiểm chứng

Bổ sung vào `backend/apps/order-service/src/orders/orders.service.spec.ts` (hoặc `hg82-resolution.spec.ts`):
1. `resolveDispute` với `action: 'complete'` trên đơn có `firstCompletedAt !== null` và `disputePreviousStatus === 'in_progress'` → cập nhật `status = 'completed'`, giữ nguyên `firstCompletedAt`, phát `ORDER_CONSTANTS.EVENT_ORDER_WARRANTY_COMPLETED` (KHÔNG phát `EVENT_ORDER_COMPLETED`).
2. `resolveDispute` với `action: 'complete'` trên đơn thường (`firstCompletedAt === null`) → gán `firstCompletedAt`, phát `EVENT_ORDER_COMPLETED`.
3. `resolveDispute` với `action: 'cancel'` trên đơn có `firstCompletedAt !== null` → ném `BadRequestException` với mã `LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION`, không cập nhật DB, không ghi outbox.

Lệnh kiểm chứng:
```powershell
cd backend
pnpm exec vitest run apps/order-service/src/orders/orders.service.spec.ts apps/order-service/src/orders/hg82-resolution.spec.ts
```

---

## 6. Definition of Done

- [x] `resolveDispute` chặn `action: 'cancel'` khi `order.firstCompletedAt !== null`.
- [x] `resolveDispute` phát `order.warranty.completed` (không phát `order.completed`) khi `action: 'complete'` trên đơn đã có `firstCompletedAt`.
- [x] Đủ 3 unit test mới và toàn bộ test suite `order-service` pass.
