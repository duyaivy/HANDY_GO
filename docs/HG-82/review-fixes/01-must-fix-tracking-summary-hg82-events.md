# Lỗi #01: 3 event Tracking mới làm hỏng `order.status` và `currentPhase` trong Tracking Summary

- **Mức độ:** `Must fix` (Chặn merge)
- **Trục review:** `Correctness`
- **Service ảnh hưởng:** `backend/apps/tracking-service`
- **PR / Commit gốc:** PR #97 (`a4ae22c320a7fdfa70f519ea742598c05323f665`)

---

## 1. Tóm tắt lỗi & Tác động

PR #97 đăng ký thêm 3 RabbitMQ event mới trong `TrackingEventsConsumer`:
- `order.dispute.decision.recorded`
- `order.dispute.resolved`
- `order.warranty.completed`

Tuy nhiên, `TrackingEventsService` và `SummaryService` chưa được cập nhật để hiểu schema payload và ngữ nghĩa trạng thái của 3 event này. Vì cả 3 đều mang `entityType = order` và luôn là **event cuối cùng** trong chuỗi outbox của luồng HG-82, API `GET /api/v1/tracking/requests/:id/summary` bị trả sai `order.status` và `currentPhase` cho **100% đơn hàng đi qua luồng khiếu nại / bảo hành HG-82**:

| Kịch bản HG-82 | Event cuối cùng | `order.status` thực tế (SAI) | `currentPhase` thực tế (SAI) | Giá trị đúng mong đợi |
| :--- | :--- | :--- | :--- | :--- |
| Admin chọn `refund` (đang chờ Payment) | `order.dispute.decision.recorded` | `'dispute.decision.recorded'` | `'ORDER_CREATED'` | `'disputed'` / `'DISPUTED'` |
| Admin chọn `dismiss` hoặc `refund` hoàn tất | `order.dispute.resolved` | `'dispute.resolved'` | `'ORDER_CREATED'` | `'completed'` / `'COMPLETED'` |
| Admin chọn `rework` | `order.dispute.resolved` | `'dispute.resolved'` | `'ORDER_CREATED'` | `'in_progress'` / `'ORDER_IN_PROGRESS'` |
| Khách xác nhận xong bảo hành | `order.warranty.completed` | `'warranty.completed'` | `'ORDER_CREATED'` | `'completed'` / `'COMPLETED'` (và cập nhật `completedAt`) |

---

## 2. Vị trí mã nguồn liên quan

1. `backend/apps/tracking-service/src/events/tracking-events.consumer.ts` (dòng 286–299):
   ```ts
   @EventPattern(EVENT_PATTERNS.ORDER_DISPUTE_DECISION_RECORDED)
   async handleDisputeDecision(@Payload() data: EventEnvelope, @Ctx() context: any): Promise<void> {
     await this.processEvent(data, context, EVENT_PATTERNS.ORDER_DISPUTE_DECISION_RECORDED);
   }

   @EventPattern(EVENT_PATTERNS.ORDER_DISPUTE_RESOLVED)
   async handleDisputeResolved(@Payload() data: EventEnvelope, @Ctx() context: any): Promise<void> {
     await this.processEvent(data, context, EVENT_PATTERNS.ORDER_DISPUTE_RESOLVED);
   }

   @EventPattern(EVENT_PATTERNS.ORDER_WARRANTY_COMPLETED)
   async handleWarrantyCompleted(@Payload() data: EventEnvelope, @Ctx() context: any): Promise<void> {
     await this.processEvent(data, context, EVENT_PATTERNS.ORDER_WARRANTY_COMPLETED);
   }
   ```

2. `backend/apps/tracking-service/src/events/tracking-events.service.ts` (dòng 178–197 và 616–652):
   ```ts
   const rawActorId =
     data.actorUserId ||
     rawPayload.actorUserId ||
     rawPayload.workerId ||
     rawPayload.customerId ||
     rawPayload.userId;

   const toStatus =
     rawPayload.toStatus ||
     rawPayload.newStatus ||
     rawPayload.nextStatus ||
     rawPayload.status ||
     null;

   const reason =
     rawPayload.reason || rawPayload.message || data.reason || null;
   ```
   Và trong `sanitizeMetadata` (dòng 616–652), `safeKeys` không có `resolvedStatus`, `action`, `resolutionId`, `adminUserId`.

3. `backend/apps/tracking-service/src/summary/summary.service.ts` (dòng 243–318 và 443–481):
   ```ts
   const latestOrderEvent = [...events]
     .reverse()
     .find((e) => e.entityType === TrackingEntityType.order);
   // ...
   const orderCompleted = [...events]
     .reverse()
     .find((e) => e.eventType === 'order.completed');
   // ...
   if (latestOrderEvent.eventType === 'order.cancelled') {
     orderStatus = 'cancelled';
   } else if (latestOrderEvent.eventType === 'order.completed') {
     orderStatus = 'completed';
   } else if (
     latestOrderEvent.eventType === 'order.disputed' ||
     targetStatus === 'disputed'
   ) {
     orderStatus = 'disputed';
   } // ...
   } else {
     orderStatus = latestOrderEvent.eventType.replace('order.', ''); // <-- RƠI VÀO ĐÂY
   }
   ```
   Sau đó `computeCurrentPhase` (dòng 443–481) không khớp chuỗi `'dispute.resolved'` / `'warranty.completed'` / `'dispute.decision.recorded'` nên rơi xuống dòng 479–481:
   ```ts
   if (order?.orderId) {
     return 'ORDER_CREATED';
   }
   ```

---

## 3. Phân tích nguyên nhân gốc & Kịch bản tái hiện

### Nguyên nhân gốc
1. `order-service` phát `order.dispute.resolved` **sau** `order.status.changed` (`orders.service.ts:1374-1375`, `payment-events.consumer.ts:87-93`), dùng tên trường `resolvedStatus` thay vì `toStatus`/`nextStatus`.
2. `TrackingEventsService.recordDomainEvent` không trích xuất `rawPayload.resolvedStatus` vào `toStatus` và `sanitizeMetadata` cũng xóa mất `resolvedStatus`, `action`, `resolutionId`.
3. `order.dispute.decision.recorded` và `order.warranty.completed` không có trường trạng thái nào trong payload, và `SummaryService` không có nhánh xử lý riêng cho 3 `eventType` này.
4. `SummaryService` còn bỏ sót `order.warranty.completed` khi tính `orderCompleted` (mốc `completedAt`).

### Kịch bản tái hiện
1. Tạo đơn → hoàn thành (`order.completed`) → khách mở khiếu nại (`order.disputed`).
2. Admin gọi `POST /api/v1/admin/orders/:id/resolve-dispute` với `action: "dismiss"` (hoặc `"rework"`, hoặc `"refund"`).
3. `tracking-service` nhận `order.status.changed` rồi nhận `order.dispute.resolved`.
4. Gọi `GET /api/v1/tracking/requests/:serviceRequestId/summary`.
5. Kết quả trả về sai: `order.status = "dispute.resolved"`, `currentPhase = "ORDER_CREATED"`.

---

## 4. Hướng dẫn sửa chi tiết từng bước

### Bước 1: Cập nhật `TrackingEventsService`
File: `backend/apps/tracking-service/src/events/tracking-events.service.ts`

1. Ở `recordDomainEvent` (dòng 178–198), bổ sung đọc các trường của HG-82:
   ```ts
   const rawActorId =
     data.actorUserId ||
     rawPayload.actorUserId ||
     rawPayload.adminUserId ||
     rawPayload.workerId ||
     rawPayload.customerId ||
     rawPayload.userId;

   const toStatus =
     rawPayload.toStatus ||
     rawPayload.newStatus ||
     rawPayload.nextStatus ||
     rawPayload.resolvedStatus ||
     rawPayload.status ||
     null;

   const reason =
     rawPayload.reason ||
     rawPayload.resolutionNote ||
     rawPayload.message ||
     data.reason ||
     null;
   ```
2. Ở `sanitizeMetadata` (dòng 616–652), bổ sung vào `safeKeys`:
   ```ts
   'action',
   'resolutionId',
   'resolvedStatus',
   'decidedAt',
   'paymentStatus',
   'refundAmountVnd',
   ```

### Bước 2: Cập nhật `SummaryService.getSummary`
File: `backend/apps/tracking-service/src/summary/summary.service.ts`

1. Cập nhật `orderCompleted` (dòng 268–270) để nhận cả `order.warranty.completed`:
   ```ts
   const orderCompleted = [...events]
     .reverse()
     .find(
       (e) =>
         e.eventType === 'order.completed' ||
         e.eventType === 'order.warranty.completed',
     );
   ```
2. Cập nhật logic trích `targetStatus` và xác định `orderStatus` (dòng 283–318):
   ```ts
   const targetStatus =
     latestOrderEvent.toStatus ||
     meta?.nextStatus ||
     meta?.toStatus ||
     meta?.newStatus ||
     meta?.resolvedStatus ||
     meta?.status;

   if (latestOrderEvent.eventType === 'order.cancelled') {
     orderStatus = 'cancelled';
   } else if (
     latestOrderEvent.eventType === 'order.completed' ||
     latestOrderEvent.eventType === 'order.warranty.completed'
   ) {
     orderStatus = 'completed';
   } else if (
     latestOrderEvent.eventType === 'order.disputed' ||
     latestOrderEvent.eventType === 'order.dispute.decision.recorded' ||
     targetStatus === 'disputed'
   ) {
     orderStatus = 'disputed';
   } else if (latestOrderEvent.eventType === 'order.dispute.resolved') {
     if (targetStatus) {
       orderStatus = targetStatus;
     } else if (meta?.action === 'rework') {
       orderStatus = 'in_progress';
     } else {
       const prevStatusEvent = [...events]
         .reverse()
         .find(
           (e) =>
             e.entityType === TrackingEntityType.order &&
             e.eventType === 'order.status.changed' &&
             Boolean(e.toStatus || (e.metadata as any)?.nextStatus),
         );
       orderStatus =
         prevStatusEvent?.toStatus ||
         (prevStatusEvent?.metadata as any)?.nextStatus ||
         'completed';
     }
   } else if (
     // ... giữ nguyên nhánh rework_requested hiện có
   ```
3. Kiểm tra lại phần `assignedWorkerId` (dòng 250–256): payload của `order.dispute.*` dùng `workerUserId` (đã có `anyOrderMeta?.workerUserId`), nên đảm bảo `workerUserId` và `customerUserId` cũng không bị `sanitizeMetadata` loại nếu chỉ có các event này (nếu cần có thể bổ sung `'workerUserId'`, `'customerUserId'` vào `safeKeys`).

---

## 5. Test case cần bổ sung & Lệnh kiểm chứng

Bổ sung vào:
- `backend/apps/tracking-service/src/events/tracking-events.service.spec.ts` (hoặc tạo mới nếu chưa có)
- `backend/apps/tracking-service/src/summary/summary.service.spec.ts`

Các case bắt buộc:
1. `recordDomainEvent` nhận `order.dispute.resolved` có `resolvedStatus: 'in_progress'`, `adminUserId`, `resolutionNote` → lưu đúng `toStatus = 'in_progress'`, `actorUserId`, `reason`, và giữ `resolvedStatus`, `action`, `resolutionId` trong `metadata`.
2. `getSummary` với event cuối là `order.dispute.decision.recorded` → `order.status === 'disputed'`, `currentPhase === 'DISPUTED'`.
3. `getSummary` với event cuối là `order.dispute.resolved` (`dismiss` / `refund`) → `order.status === 'completed'`, `currentPhase === 'COMPLETED'`.
4. `getSummary` với event cuối là `order.dispute.resolved` (`rework`) → `order.status === 'in_progress'`, `currentPhase === 'ORDER_IN_PROGRESS'`.
5. `getSummary` với event cuối là `order.warranty.completed` → `order.status === 'completed'`, `currentPhase === 'COMPLETED'`, `order.completedAt` cập nhật theo mốc mới.
6. Backward-compatibility: `order.dispute.resolved` cũ trong DB không có `toStatus`/`resolvedStatus` vẫn fallback về `order.status.changed` liền trước.

Lệnh chạy kiểm chứng:
```powershell
cd backend
pnpm exec vitest run apps/tracking-service
```

---

## 6. Definition of Done

- [x] `TrackingEventsService` lưu đúng `toStatus`, `actorUserId`, `reason` và metadata cho 3 event HG-82.
- [x] `SummaryService.getSummary` trả đúng `order.status`, `completedAt`, và `currentPhase` cho tất cả 4 kịch bản (`decision.recorded`, `resolved` dismiss/refund, `resolved` rework, `warranty.completed`).
- [x] Toàn bộ test của `tracking-service` pass.
