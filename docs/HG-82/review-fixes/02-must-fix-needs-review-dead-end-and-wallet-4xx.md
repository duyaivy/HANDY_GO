# Lỗi #02: Trạng thái `needs_review` gây kẹt đơn vĩnh viễn ở `disputed` & Wallet trả 4xx làm treo `refund_pending`

- **Mức độ:** `Must fix` (Chặn merge)
- **Trục review:** `Correctness`
- **Service ảnh hưởng:** `backend/apps/order-service`, `backend/apps/payment-service`
- **PR / Commit gốc:** PR #97 (`a4ae22c320a7fdfa70f519ea742598c05323f665`)

---

## 1. Tóm tắt lỗi & Tác động

Luồng hoàn tiền bất đồng bộ (Order → Payment → Wallet → Order) hiện có **2 điểm kẹt vĩnh viễn (dead-end)**:

1. **Dead-end tại `needs_review`:** Khi Payment từ chối tạo bản ghi `Refund` do race condition (`REFUND_AMOUNT_EXCEEDS_REFUNDABLE`, `PAYMENT_NOT_REFUNDABLE`, `APPROVER_IS_CUSTOMER`), Order chuyển `OrderDisputeResolution.state = 'needs_review'` và giữ `order.status = 'disputed'`. Tuy nhiên, ràng buộc duy nhất `@@unique([orderId, disputedAt])` + guard dòng 1343–1345 chặn Admin đưa ra bất kỳ phán quyết thay thế nào (`dismiss`, `rework`, hoặc `refund` mức tiền hợp lệ hơn) bằng `409 DISPUTE_ALREADY_DECIDED`. Phía Payment cũng không có bản ghi `Refund` để retry → **đơn bị kẹt ở `disputed` mãi mãi, không thể thoát bằng API**.
2. **Treo vô hạn ở `refund_pending` khi Wallet từ chối 4xx:** Khi Payment đã tạo `Refund` nhưng `WalletClient.refundCredit` trả về `{ outcome: 'rejected', status: 4xx }` (lỗi nghiệp vụ/dữ liệu không thể tự phục hồi bằng retry), `RefundsService.execute` chỉ `return` im lặng mà không cập nhật failure rõ ràng và không phát `payment.dispute.refund.needs_review` về Order → **Order treo ở `refund_pending` vĩnh viễn**.

---

## 2. Vị trí mã nguồn liên quan

1. `backend/apps/order-service/prisma/schema.prisma` (dòng 192–217):
   ```prisma
   model OrderDisputeResolution {
     ...
     state String @db.VarChar(30)
     ...
     @@unique([orderId, disputedAt])
   }
   ```

2. `backend/apps/order-service/src/orders/orders.service.ts` (dòng 1343–1345):
   ```ts
   if (order.disputedAt && await tx.orderDisputeResolution.findUnique({ where: { orderId_disputedAt: { orderId, disputedAt: order.disputedAt } } })) {
     throw new ConflictException({ code: ORDER_ERROR_CODES.DISPUTE_ALREADY_DECIDED, message: ORDER_ERROR_MESSAGES.DISPUTE_ALREADY_DECIDED });
   }
   ```

3. `backend/apps/payment-service/src/order-events/dispute-refund.service.ts` (dòng 48–59):
   ```ts
   const needsReview = async (failureCode: string) => this.outbox.enqueue(tx, {
     aggregateType: 'payment', aggregateId: paymentId,
     eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW,
     payload: { resolutionId, orderId, paymentId, failureCode },
   });
   if (adminUserId === payment.customerUserId) { await needsReview('APPROVER_IS_CUSTOMER'); return; }
   if (!['succeeded', 'partially_refunded'].includes(payment.status)) { await needsReview('PAYMENT_NOT_REFUNDABLE'); return; }
   ...
   if (amount > payment.amount - (reserved._sum.amountVnd ?? 0n)) { await needsReview('REFUND_AMOUNT_EXCEEDS_REFUNDABLE'); return; }
   ```

4. `backend/apps/payment-service/src/refunds/refunds.service.ts` (dòng 251–263) & `wallet.client.ts` (dòng 100–106):
   ```ts
   if (result.outcome === 'missing') {
     const credit = await this.wallet.refundCredit(payment.customerUserId, { ... });
     if (credit.outcome !== 'ok') return; // <-- Nuốt cả 'rejected' (HTTP 4xx) mà không báo Order
     result = await this.wallet.getOperation(operationId);
   }
   ```

---

## 3. Phân tích nguyên nhân gốc & Kịch bản tái hiện

### Kịch bản A (`needs_review` dead-end)
1. Đơn `completed` có `refundableAmountVnd = 200_000`.
2. Admin bấm `refund 200_000`; preflight qua, nhưng đồng thời có một refund khác chiếm `100_000` ở Payment.
3. Payment tiêu thụ `order.dispute.decision.recorded`, thấy `200_000 > 100_000` → không tạo `Refund`, phát `payment.dispute.refund.needs_review` (`REFUND_AMOUNT_EXCEEDS_REFUNDABLE`).
4. Order cập nhật `OrderDisputeResolution.state = 'needs_review'`, giữ `order.status = 'disputed'`.
5. Admin gọi lại `POST /api/v1/admin/orders/:id/resolve-dispute` với `refundAmountVnd: "100000"` (hoặc `action: "dismiss"`/`"rework"`) kèm `idempotencyKey` mới → bị chặn `409 DISPUTE_ALREADY_DECIDED`.

### Kịch bản B (Wallet 4xx treo `refund_pending`)
1. Payment đã tạo `Refund` ở trạng thái `needs_review` (gắn `disputeResolutionId`).
2. `RefundsService.execute` gọi `wallet.refundCredit(...)` và nhận HTTP 400/404/422 (`outcome: 'rejected'`).
3. Hàm `return` im lặng ở dòng 260; `failureReason` vẫn là `'Awaiting funded Wallet refund confirmation'`; không có event nào báo về `order-service`.

---

## 4. Hướng dẫn sửa chi tiết từng bước

### Phần A: Cho phép thay thế phán quyết khi bản ghi hiện tại đang ở `needs_review` (`order-service`)

1. **Migration & Prisma Schema** (`backend/apps/order-service/prisma/schema.prisma`):
   - `state` hiện là `String @db.VarChar(30)` (không phải enum DB), hỗ trợ giá trị mới `'superseded'`.
   - Thay `@@unique([orderId, disputedAt])` bằng `@@index([orderId, disputedAt])` trong `schema.prisma`.
   - Tạo migration SQL thay unique constraint cũ bằng **partial unique index**:
     ```sql
     ALTER TABLE order_service.order_dispute_resolutions
       DROP CONSTRAINT IF EXISTS order_dispute_resolutions_order_id_disputed_at_key;

     DROP INDEX IF EXISTS order_service.order_dispute_resolutions_order_id_disputed_at_key;

     CREATE UNIQUE INDEX order_dispute_resolutions_active_unique
       ON order_service.order_dispute_resolutions (order_id, disputed_at)
       WHERE state <> 'superseded';
     ```
   - Chạy `prisma generate` cho `order-service`.

2. **Cập nhật `OrdersService.resolveCompletedDispute`** (`backend/apps/order-service/src/orders/orders.service.ts`):
   - Thay `findUnique({ where: { orderId_disputedAt: ... } })` (dòng 1343) bằng truy vấn bản ghi active:
     ```ts
     const activeResolution = order.disputedAt
       ? await tx.orderDisputeResolution.findFirst({
           where: {
             orderId,
             disputedAt: order.disputedAt,
             state: { not: 'superseded' },
           },
         })
       : null;

     if (activeResolution) {
       if (activeResolution.state !== 'needs_review') {
         throw new ConflictException({
           code: ORDER_ERROR_CODES.DISPUTE_ALREADY_DECIDED,
           message: ORDER_ERROR_MESSAGES.DISPUTE_ALREADY_DECIDED,
         });
       }
       // Đánh dấu bản ghi cũ là superseded trước khi tạo phán quyết thay thế
       await tx.orderDisputeResolution.update({
         where: { id: activeResolution.id },
         data: { state: 'superseded' },
       });
     }
     ```
   - Lưu ý: kiểm tra `adminFindDisputes` (`orders.service.ts` chỗ ghép `orderDisputeResolution` cho từng đơn) để lọc `state: { not: 'superseded' }` (hoặc lấy bản ghi mới nhất theo `decidedAt desc`), tránh hiển thị bản ghi đã bị `superseded`.
   - Kiểm tra `PaymentEventsConsumer.processDisputeRefund`: nếu event trễ của bản ghi đã `superseded` đến, điều kiện `!['refund_pending', 'needs_review'].includes(resolution.state)` sẽ tự bỏ qua an toàn (nhưng nhớ ghi log cảnh báo theo Lỗi #05).

### Phần B: Báo `needs_review` về Order khi Wallet trả `rejected` 4xx (`payment-service`)

File: `backend/apps/payment-service/src/refunds/refunds.service.ts` (dòng 251–263)

1. Phân biệt rõ `credit.outcome === 'unknown'` (lỗi mạng/5xx — giữ để reconciliation retry) với `credit.outcome === 'rejected'` (4xx từ chối nghiệp vụ):
   ```ts
   if (result.outcome === 'missing') {
     const credit = await this.wallet.refundCredit(payment.customerUserId, {
       paymentId: payment.id,
       refundId: id,
       amount: row.amountVnd.toString(),
       method: payment.method,
       grossAmount: payment.amount.toString(),
     });
     if (credit.outcome === 'rejected') {
       const failureCode = `WALLET_REJECTED_${credit.status ?? 400}`;
       await this.database.client.$transaction(async (tx) => {
         await tx.refund.updateMany({
           where: { id, status: { in: ['needs_review', 'processing'] } },
           data: {
             status: 'needs_review',
             failureReason: `${failureCode}: ${credit.message}`.slice(0, 255),
             updatedAt: new Date(),
           },
         });
         if (row.disputeResolutionId) {
           await this.outbox.enqueue(tx, {
             aggregateType: 'payment',
             aggregateId: payment.id,
             eventType: EVENT_PATTERNS.PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW,
             payload: {
               resolutionId: row.disputeResolutionId,
               orderId: payment.orderId,
               paymentId: payment.id,
               failureCode,
             },
           });
         }
       });
       return;
     }
     if (credit.outcome !== 'ok') return;
     result = await this.wallet.getOperation(operationId);
   }
   ```
   *(Kiểm tra xem `RefundsService` đã inject `PaymentOutboxService` chưa — hiện `RefundsService` đã có outbox để phát `PAYMENT_DISPUTE_REFUND_COMPLETED`, dùng lại cùng instance đó.)*
2. Đảm bảo không tự động retry vô hạn vào một `Refund` đã bị Wallet `rejected` khi reconciliation chạy (hoặc đánh dấu cờ/trạng thái phân biệt để tránh spam event `needs_review` lặp lại mỗi chu kỳ reconcile).

---

## 5. Test case cần bổ sung & Lệnh kiểm chứng

1. `order-service` (`hg82-resolution.spec.ts`):
   - Khi resolution hiện tại ở `needs_review`, Admin gọi `resolveCompletedDispute` với `idempotencyKey` mới (`dismiss`, `rework`, hoặc `refund` mức tiền hợp lệ) → bản ghi cũ đổi sang `superseded`, tạo bản ghi mới thành công.
   - Khi resolution hiện tại ở `refund_pending` hoặc `completed`, gọi với `idempotencyKey` mới vẫn bị `409 DISPUTE_ALREADY_DECIDED`.
   - `adminFindDisputes` chỉ trả về bản ghi active (không trả bản ghi `superseded`).
2. `payment-service` (`dispute-refund.spec.ts` / `refunds.service.spec.ts`):
   - Khi `wallet.refundCredit` trả `{ outcome: 'rejected', status: 422, message: 'Insufficient reserve' }` cho một dispute refund → cập nhật `failureReason` và enqueue `payment.dispute.refund.needs_review`.
   - Khi `wallet.refundCredit` trả `{ outcome: 'unknown', message: 'timeout' }` → KHÔNG phát `needs_review`, giữ nguyên để retry.

Lệnh kiểm chứng:
```powershell
cd backend
pnpm exec vitest run apps/order-service/src/orders/hg82-resolution.spec.ts apps/payment-service
```

---

## 6. Definition of Done

- [x] Có migration SQL tạo partial unique index `WHERE state <> 'superseded'` cho `order_dispute_resolutions`.
- [x] Admin có thể thay thế quyết định khi bản ghi đang ở `needs_review`, không còn kẹt đơn ở `disputed`.
- [x] `adminFindDisputes` trả đúng quyết định active mới nhất, bỏ qua bản ghi `superseded`.
- [x] `RefundsService.execute` xử lý rõ `credit.outcome === 'rejected'` (4xx) và thông báo `needs_review` về Order Service.
- [x] Unit test cho cả 2 service pass 100%.
