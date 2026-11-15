# Hướng dẫn Kỹ thuật Giai đoạn 1: Rà soát & Gia cố Backend Edge Cases

> **Mã công việc:** HG-64  
> **Giai đoạn:** 1/5  
> **Tên giai đoạn:** Rà soát & Gia cố Backend Edge Cases (Order Service, Tracking Service, API Gateway)  
> **Thời lượng ước tính:** 0.5 ngày  
> **Trạng thái:** ✅ Đã hoàn tất  

---

## 1. Mục tiêu giai đoạn

Đảm bảo **100% các nhánh chuyển đổi trạng thái** trong State Machine của Order Service (bao gồm cả các nhánh không mong muốn như yêu cầu làm lại `request-rework`, khiếu nại `dispute`, xử lý tranh chấp `resolve-dispute`) đều:
1. Ghi nhận sự kiện Outbox chuẩn xác vào cơ sở dữ liệu của Order Service.
2. Được phát ra RabbitMQ và được Tracking Service tiêu thụ, cập nhật cột mốc (*Milestone*) và giai đoạn (*Phase*) tương ứng.
3. API Gateway cấu hình đúng để chuyển tiếp luồng dữ liệu thời gian thực (SSE) mà không làm ngắt hoặc đệm (buffer) gói tin.

---

## 2. Các bước triển khai chi tiết

### Bước 1.1: Rà soát & Bổ sung Outbox Events cho Edge Cases trong Order Service

#### 📍 Vị trí tệp:
- [`backend/apps/order-service/src/orders/orders.service.ts`](../../backend/apps/order-service/src/orders/orders.service.ts)
- [`backend/apps/order-service/src/common/constants/order.constants.ts`](../../backend/apps/order-service/src/common/constants/order.constants.ts)

#### 📝 Nhiệm vụ cụ thể:
1. Mở [`order.constants.ts`](../../backend/apps/order-service/src/common/constants/order.constants.ts) và xác nhận đã có đủ các hằng số sự kiện:
   ```typescript
   export const ORDER_CONSTANTS = {
     // ...
     EVENT_ORDER_STATUS_CHANGED: 'order.status.changed',
     EVENT_ORDER_DISPUTED: 'order.disputed',
     EVENT_ORDER_REWORK_REQUESTED: 'order.rework_requested', // Thêm nếu chưa có
     // ...
   } as const;
   ```

2. Kiểm tra phương thức `requestRework` trong [`orders.service.ts`](../../backend/apps/order-service/src/orders/orders.service.ts):
   - Đảm bảo trong transaction `tx`, sau khi tạo `orderStatusHistory` với `toStatus: 'in_progress'` và ghi chú lý do khách yêu cầu sửa, cần gọi:
   ```typescript
   await this.emitOrderStatusChangedEvent(
     tx,
     order,
     'finished',
     'in_progress',
     {
       reason: dto.reason,
       reworkRequestedAt: new Date().toISOString(),
       notificationKind: 'rework_requested',
     },
   );
   ```

3. Kiểm tra phương thức `disputeOrder`:
   - Xác nhận sự kiện `order.status.changed` được phát kèm `previousStatus`, `nextStatus: 'disputed'`, `reason: dto.reason`.
   - Phát thêm sự kiện nghiệp vụ chuyên biệt `ORDER_CONSTANTS.EVENT_ORDER_DISPUTED` vào Outbox.

4. Kiểm tra phương thức `resolveDispute`:
   - Khi Admin giải quyết tranh chấp (chuyển về `in_progress`, `completed`, hoặc `cancelled`), xác nhận `emitOrderStatusChangedEvent` được gọi để Tracking Service lập tức ghi nhận phán quyết của Admin.

---

### Bước 1.2: Gia cố Phân loại Milestone & Phase trong Tracking Service

#### 📍 Vị trí tệp:
- [`backend/apps/tracking-service/src/summary/summary.service.ts`](../../backend/apps/tracking-service/src/summary/summary.service.ts)
- [`backend/apps/tracking-service/src/events/tracking-events.service.ts`](../../backend/apps/tracking-service/src/events/tracking-events.service.ts)

#### 📝 Nhiệm vụ cụ thể:
1. Mở [`summary.service.ts`](../../backend/apps/tracking-service/src/summary/summary.service.ts), rà soát hàm `calculatePhaseAndMilestones`:
   - Đảm bảo nhận diện trường hợp `targetStatus === 'disputed'`:
     ```typescript
     if (targetStatus === 'disputed') {
       currentPhase = 'DISPUTED';
     }
     ```
   - Đảm bảo trường hợp nhận sự kiện `rework_requested` hoặc quay lại `in_progress` từ `finished`:
     - Giữ Phase ở `ORDER_IN_PROGRESS`.
     - Milestone `order_finished` chuyển về trạng thái `in_progress` kèm mô tả lý do khách yêu cầu sửa lại.

2. Cập nhật whitelist trường metadata an toàn trong `sanitizeMetadata` tại [`tracking-events.service.ts`](../../backend/apps/tracking-service/src/events/tracking-events.service.ts):
   - Bổ sung `'reworkReason'`, `'disputeReason'`, `'resolution'` vào mảng `safeKeys` để các thông tin này hiển thị được lên Timeline mà không bị cắt bỏ.

---

### Bước 1.3: Xác minh Thiết lập API Gateway cho Luồng SSE

#### 📍 Vị trí tệp:
- [`backend/apps/api-gateway/src/proxy/proxy.constants.ts`](../../backend/apps/api-gateway/src/proxy/proxy.constants.ts)

#### 📝 Nhiệm vụ cụ thể:
1. Kiểm tra cấu hình upstream của `tracking-service` tại Gateway:
   ```typescript
   {
     upstreamName: 'tracking-service',
     envKey: 'TRACKING_SERVICE_URL',
     prefixes: ['/api/v1/tracking'],
   }
   ```
2. Xác minh cơ chế Proxy không đệm luồng dữ liệu (No Buffering):
   - Khi xử lý request có header `Accept: text/event-stream`, Gateway phải đảm bảo chuyển tiếp tức thì (`transfer-encoding: chunked`), không nén `gzip` và không gom chunk.
   - Các Header chuyển tiếp từ Gateway vào Tracking Service:
     - `x-internal-secret`
     - `x-user-id`
     - `x-user-roles`

---

## 3. Lệnh kiểm thử & Xác minh (Verification Commands)

Chạy bộ unit test của cả hai service để xác nhận các edge cases đã hoạt động hoàn hảo:

```bash
# 1. Chuyển vào thư mục backend
cd backend

# 2. Chạy kiểm thử Order Service
pnpm vitest run apps/order-service/src/orders/orders.service.spec.ts

# 3. Chạy kiểm thử Tracking Service Summary & Events
pnpm vitest run apps/tracking-service/src/summary/summary.service.spec.ts apps/tracking-service/src/events/tracking-events.service.spec.ts
```

---

## 4. Tiêu chuẩn hoàn thành Giai đoạn 1 (Sign-off Checklist)

- [x] Toàn bộ các luồng `requestRework`, `disputeOrder`, `resolveDispute` đều có outbox event phát ra.
- [x] `SummaryService` của Tracking Service tính toán đúng phase `DISPUTED` và cập nhật milestone khi có rework.
- [x] 100% test files của `order-service` và `tracking-service` chạy qua không có lỗi.
- [x] Sẵn sàng chuyển tiếp sang **Giai đoạn 2 (Xây dựng Client & SSE trên Mobile)**.
