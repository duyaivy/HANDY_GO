# Lỗi #07: 3 lỗi nhất quán API & dữ liệu nhỏ (`category`, thứ tự check ở `resolveDispute`, `QueryOrderDto.paymentState`)

- **Mức độ:** `Should fix` (Không chặn merge)
- **Trục review:** `Correctness`
- **Service ảnh hưởng:** `backend/apps/order-service`
- **PR / Commit gốc:** PR #97 (`a4ae22c320a7fdfa70f519ea742598c05323f665`)

---

## 1. Tóm tắt lỗi & Tác động

Có 3 điểm thiếu nhất quán nhỏ nhưng dễ gây bất ngờ cho FE/Mobile và Admin:

1. **`DisputeOrderDto.category` bị thất lạc 100%:** Client gửi `category` khi mở khiếu nại, `orders.service.ts:1242` nhúng nó vào payload `order.disputed`, nhưng không lưu vào bảng `orders`, không trả ra ở `GET /api/v1/admin/orders/disputes`, `TrackingEventsService.sanitizeMetadata` lọc bỏ, và `notification-service` không tiêu thụ `order.disputed`. Kết quả là trường `category` hoàn toàn vô dụng.
2. **Thứ tự kiểm tra ngược ở `resolveDispute` (dòng 1406–1415):** Kiểm tra `order.disputePreviousStatus === 'completed'` nằm **trước** `order.status !== 'disputed'`. Do `disputePreviousStatus` vẫn giữ `'completed'` sau khi tranh chấp đã được giải quyết xong, nếu Admin gọi lại `resolveDispute` trên một đơn đã quay về `completed`/`in_progress`, API trả `400 LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION` thay vì `409 INVALID_STATE_TRANSITION`.
3. **`QueryOrderDto.paymentState` thiếu `'partially_refunded'`:** Prisma `PaymentState` đã bổ sung `'partially_refunded'` trong PR #97, nhưng `QueryOrderDto` (được kế thừa bởi `AdminQueryOrderDto`) vẫn giữ danh sách enum cũ `['unpaid', 'pending', 'paid', 'refunded', 'failed']`. Mọi request lọc `?paymentState=partially_refunded` trên `GET /api/v1/orders` hoặc `GET /api/v1/admin/orders` đều bị từ chối với HTTP `400 Bad Request`.

---

## 2. Vị trí mã nguồn liên quan

1. `backend/apps/order-service/src/orders/orders.service.ts` (dòng 1180–1187 và 1242):
   ```ts
   data: {
     status: 'disputed',
     disputePreviousStatus: order.status,
     disputedAt: now,
     disputeReason: dto.reason,
     version: { increment: 1 },
     // Không lưu dto.category
   }
   ```

2. `backend/apps/order-service/src/orders/orders.service.ts` (dòng 1406–1415):
   ```ts
   if (order.disputePreviousStatus === 'completed') {
     throw new BadRequestException({ code: ORDER_ERROR_CODES.LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION, message: ORDER_ERROR_MESSAGES.LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION });
   }

   if (order.status !== 'disputed') {
     throw new ConflictException({
       code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
       message: `Only orders in 'disputed' status can be resolved. Current status is '${order.status}'.`,
     });
   }
   ```

3. `backend/apps/order-service/src/orders/dto/query-order.dto.ts` (dòng 42–48):
   ```ts
   @ApiPropertyOptional({
     description: 'Filter by Payment State',
     enum: ['unpaid', 'pending', 'paid', 'refunded', 'failed'],
   })
   @IsOptional()
   @IsEnum(['unpaid', 'pending', 'paid', 'refunded', 'failed'])
   paymentState?: string;
   ```

---

## 3. Hướng dẫn sửa chi tiết từng bước

### Mục 7.1: Xử lý dứt điểm `DisputeOrderDto.category`
Chọn 1 trong 2 phương án (khuyến nghị Phương án A nếu FE/Mobile đã hiển thị danh mục khiếu nại):
- **Phương án A (Lưu & hiển thị):**
  1. Thêm cột nullable `disputeCategory String? @map("dispute_category") @db.VarChar(50)` vào model `Order` trong `backend/apps/order-service/prisma/schema.prisma` + tạo migration SQL.
  2. Lưu `disputeCategory: dto.category ?? null` khi mở tranh chấp (`orders.service.ts:1184`).
  3. Trả `disputeCategory` trong `OrderResponseDto` và `AdminDisputeItemDto` (`adminFindDisputes`).
- **Phương án B (Chưa dùng ở đợt này):**
  - Gỡ `category` khỏi `DisputeOrderDto` và payload `order.disputed` để tránh API nhận input nhưng âm thầm vứt bỏ.

### Mục 7.2: Đảo thứ tự guard ở `resolveDispute`
File: `backend/apps/order-service/src/orders/orders.service.ts` (dòng 1406–1415):
```ts
if (order.status !== 'disputed') {
  throw new ConflictException({
    code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
    message: `Only orders in 'disputed' status can be resolved. Current status is '${order.status}'.`,
  });
}

if (order.disputePreviousStatus === 'completed') {
  throw new BadRequestException({
    code: ORDER_ERROR_CODES.LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION,
    message: ORDER_ERROR_MESSAGES.LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION,
  });
}
```

### Mục 7.3: Bổ sung `'partially_refunded'` vào `QueryOrderDto.paymentState`
File: `backend/apps/order-service/src/orders/dto/query-order.dto.ts` (dòng 42–48):
```ts
const PAYMENT_STATE_VALUES = [
  'unpaid',
  'pending',
  'paid',
  'partially_refunded',
  'refunded',
  'failed',
] as const;

@ApiPropertyOptional({
  description: 'Filter by Payment State',
  enum: PAYMENT_STATE_VALUES,
})
@IsOptional()
@IsEnum(PAYMENT_STATE_VALUES)
paymentState?: string;
```

---

## 4. Test case cần bổ sung & Lệnh kiểm chứng

1. `resolveDispute` gọi trên đơn có `status: 'completed'` và `disputePreviousStatus: 'completed'` → trả `409 INVALID_STATE_TRANSITION` (không phải `400`).
2. `QueryOrderDto` chấp nhận `paymentState: 'partially_refunded'`.
3. (Nếu chọn Phương án A) `openDispute` lưu `disputeCategory` và `adminFindDisputes` trả về đúng `disputeCategory`.

Lệnh kiểm chứng:
```powershell
cd backend
pnpm exec vitest run apps/order-service/src/orders
```

---

## 5. Definition of Done

- [x] `DisputeOrderDto.category` được lưu & hiển thị đầy đủ (hoặc được gỡ bỏ có chủ đích).
- [x] `resolveDispute` kiểm tra `order.status !== 'disputed'` trước `order.disputePreviousStatus === 'completed'`.
- [x] `QueryOrderDto.paymentState` hỗ trợ `'partially_refunded'`.
- [x] Unit test liên quan pass.
