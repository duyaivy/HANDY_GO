# Lỗi #05: `PaymentEventsConsumer` âm thầm nuốt & ACK các event kết quả hoàn tiền bị lệch dữ liệu

- **Mức độ:** `Must fix` (Chặn merge)
- **Trục review:** `Correctness`
- **Service ảnh hưởng:** `backend/apps/order-service`
- **PR / Commit gốc:** PR #97 (`a4ae22c320a7fdfa70f519ea742598c05323f665`)

---

## 1. Tóm tắt lỗi & Tác động

Trong `PaymentEventsConsumer.processDisputeRefund`, khi nhận event `payment.dispute.refund.completed` hoặc `payment.dispute.refund.needs_review`:
1. Consumer gọi `consumedEventRepo.recordEventIfNew(eventId, eventType, tx)` **trước** khi kiểm tra xem `resolution`/`order` có tồn tại và dữ liệu có khớp không.
2. Nếu bất kỳ điều kiện guard nào ở dòng 58–59 hoặc 66–68 thất bại (không tìm thấy `resolution`, lệch `paymentId`, lệch `refundAmountVnd`, sai `order.status`, sai `paymentStatus`, `refundId` không phải UUID...), hàm chỉ `return` im lặng:
   - Giao dịch vẫn **commit** `eventId` vào `consumed_events` (không thể replay về sau).
   - Message RabbitMQ vẫn được **ACK** (dòng 95).
   - **Không ghi bất kỳ dòng log cảnh báo (`warn`/`error`) nào.**
3. Ở dòng 46–49, điều kiện `typeof eventId !== 'string'` vẫn để lọt chuỗi rỗng `""` (hoặc toàn khoảng trắng), và khi NACK cũng không ghi log.

**Tác động:** Nếu có lệch dữ liệu tiền tệ giữa Payment và Order (hoặc event giao đến sớm hơn commit đọc được), sự cố biến mất hoàn toàn không có dấu vết trong log/DLQ, còn đơn bị treo mãi ở `refund_pending`.

---

## 2. Vị trí mã nguồn liên quan

File: `backend/apps/order-service/src/consumers/payment-events.consumer.ts` (dòng 40–69):
```ts
private async processDisputeRefund(kind: 'completed' | 'needs_review', raw: unknown, context?: any): Promise<void> {
  const envelope = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const body = (envelope.data ?? envelope.payload ?? envelope) as Record<string, unknown>;
  const eventId = envelope.eventId ?? envelope.id;
  const resolutionId = body?.resolutionId;
  const orderId = body?.orderId;
  if (typeof eventId !== 'string' || !isUUID(String(resolutionId)) || !isUUID(String(orderId))) {
    this.nackMessage(context, false);
    return;
  }
  const eventType = kind === 'completed'
    ? ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_COMPLETED
    : ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_NEEDS_REVIEW;
  try {
    await this.prisma.$transaction(async (tx) => {
      const isNew = await this.consumedEventRepo.recordEventIfNew(eventId, eventType, tx);
      if (!isNew) return;
      await tx.$queryRaw`SELECT id FROM order_service.orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const resolution = await tx.orderDisputeResolution.findUnique({ where: { id: resolutionId as string } });
      const order = await tx.order.findUnique({ where: { id: orderId as string } });
      if (!resolution || !order || resolution.orderId !== orderId || resolution.action !== 'refund' ||
          resolution.paymentId !== body.paymentId || !['refund_pending', 'needs_review'].includes(resolution.state)) return;
      if (kind === 'needs_review') {
        ...
        return;
      }
      if (order.status !== 'disputed' || !isUUID(String(body.refundId)) ||
          !['partially_refunded', 'refunded'].includes(String(body.paymentStatus)) ||
          body.refundAmountVnd !== resolution.refundAmountVnd?.toString()) return;
```

---

## 3. Phân tích nguyên nhân gốc & Kịch bản tái hiện

1. **Envelope hỏng:** Event có `eventId: ""` → vượt qua `typeof eventId !== 'string'`, ghi key rỗng `""` vào `consumed_events`, làm các event thiếu `eventId` sau đó bị coi là trùng lặp.
2. **Lệch dữ liệu đối soát:** Payment gửi `refundAmountVnd: "150000"` nhưng Order lưu `refundAmountVnd: 150000n` bị lệch (ví dụ sai kiểu số `150000` thay vì chuỗi `"150000"`, hoặc lệch `paymentId`) → rơi vào dòng 68 `return` im lặng, ghi `consumed_events`, ACK message, không log.
3. **Resolution chưa tồn tại / sai state:** Bản ghi `resolution` bị `superseded` hoặc không tìm thấy → bỏ qua không log, không phân biệt được giữa duplicate hợp lệ với lỗi đối soát thật sự.

---

## 4. Hướng dẫn sửa chi tiết từng bước

File: `backend/apps/order-service/src/consumers/payment-events.consumer.ts`

1. **Siết validate envelope & ghi log trước khi NACK (dòng 46–49):**
   ```ts
   const normalizedEventId = typeof eventId === 'string' ? eventId.trim() : '';
   if (!normalizedEventId || !isUUID(String(resolutionId)) || !isUUID(String(orderId))) {
     this.logger.warn(
       `Rejected malformed dispute refund event (${kind}): eventId=${String(eventId)}, resolutionId=${String(resolutionId)}, orderId=${String(orderId)}`,
     );
     this.nackMessage(context, false);
     return;
   }
   ```

2. **Tách rõ các guard và ghi `this.logger.warn` có đầy đủ ngữ cảnh trước mọi nhánh bỏ qua:**
   - Kiểm tra sự tồn tại của `resolution` và `order` **trước** khi quyết định nuốt event, hoặc nếu chưa tồn tại thì log rõ ràng (lưu ý: nếu dùng `tx`, đặt `recordEventIfNew` sau khi xác nhận `resolution && order` tồn tại, hoặc ném lỗi retryable nếu nghi ngờ out-of-order — tối thiểu không âm thầm tiêu thụ một event khi không tìm thấy `resolution`).
   - Gợi ý cấu trúc sạch trong transaction:
     ```ts
     await tx.$queryRaw`SELECT id FROM order_service.orders WHERE id = ${orderId}::uuid FOR UPDATE`;
     const resolution = await tx.orderDisputeResolution.findUnique({ where: { id: resolutionId as string } });
     const order = await tx.order.findUnique({ where: { id: orderId as string } });

     if (!resolution || !order) {
       this.logger.warn(
         `Ignoring ${eventType} (eventId=${normalizedEventId}): missing resolution=${Boolean(resolution)} or order=${Boolean(order)} (resolutionId=${String(resolutionId)}, orderId=${String(orderId)})`,
       );
       return;
     }

     const isNew = await this.consumedEventRepo.recordEventIfNew(normalizedEventId, eventType, tx);
     if (!isNew) return;

     if (
       resolution.orderId !== orderId ||
       resolution.action !== 'refund' ||
       resolution.paymentId !== body.paymentId ||
       !['refund_pending', 'needs_review'].includes(resolution.state)
     ) {
       this.logger.warn(
         `Ignored ${eventType} (eventId=${normalizedEventId}): resolution mismatch or non-pending state ` +
           `(resolutionId=${resolution.id}, orderId=${orderId}, expectedPaymentId=${resolution.paymentId}, actualPaymentId=${String(body.paymentId)}, state=${resolution.state}, action=${resolution.action})`,
       );
       return;
     }
     ```
   - Và cho nhánh `kind === 'completed'` (dòng 66–68):
     ```ts
     const expectedAmount = resolution.refundAmountVnd?.toString();
     if (
       order.status !== 'disputed' ||
       !isUUID(String(body.refundId)) ||
       !['partially_refunded', 'refunded'].includes(String(body.paymentStatus)) ||
       body.refundAmountVnd !== expectedAmount
     ) {
       this.logger.warn(
         `Ignored ${eventType} (eventId=${normalizedEventId}): completion guard failed ` +
           `(resolutionId=${resolution.id}, orderId=${order.id}, orderStatus=${order.status}, refundId=${String(body.refundId)}, paymentStatus=${String(body.paymentStatus)}, expectedAmount=${String(expectedAmount)}, actualAmount=${String(body.refundAmountVnd)})`,
       );
       return;
     }
     ```

---

## 5. Test case cần bổ sung & Lệnh kiểm chứng

Bổ sung vào `backend/apps/order-service/src/consumers/payment-events.consumer.spec.ts` (hoặc `hg82-resolution.spec.ts`):
1. Event có `eventId: "   "` (chuỗi rỗng/khoảng trắng) → gọi `nackMessage(context, false)` và ghi `logger.warn`, không gọi DB.
2. Event không tìm thấy `resolution` → ghi `logger.warn` và **không** ghi `eventId` vào `consumed_events`.
3. Event lệch `paymentId` hoặc lệch `refundAmountVnd` hoặc `order.status !== 'disputed'` → ghi `logger.warn` với đúng `eventId`/`resolutionId`/`orderId` và không cập nhật `orders`.

Lệnh kiểm chứng:
```powershell
cd backend
pnpm exec vitest run apps/order-service/src/consumers apps/order-service/src/orders/hg82-resolution.spec.ts
```

---

## 6. Definition of Done

- [x] `eventId` rỗng hoặc toàn khoảng trắng bị từ chối và NACK có log cảnh báo.
- [x] Không ghi `consumed_events` vĩnh viễn khi thiếu `resolution`/`order`.
- [x] Mọi nhánh guard bỏ qua đều ghi `this.logger.warn` với đầy đủ ID và lý do lệch đối soát.
- [x] Toàn bộ test suite `order-service` pass.
