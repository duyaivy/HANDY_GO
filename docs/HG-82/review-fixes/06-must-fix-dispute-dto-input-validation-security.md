# Lỗi #06: Thiếu giới hạn kích thước đầu vào & `@IsUrl({})` mặc định cho phép scheme không an toàn

- **Mức độ:** `Must fix` (Chặn merge)
- **Trục review:** `Security`
- **Service ảnh hưởng:** `backend/apps/order-service`
- **PR / Commit gốc:** PR #97 (`a4ae22c320a7fdfa70f519ea742598c05323f665`)

---

## 1. Tóm tắt lỗi & Tác động

Các DTO đầu vào mới/cập nhật trong HG-82 có 3 lỗ hổng kiểm soát input:
1. **`DisputeOrderDto.evidenceUrls` dùng `@IsUrl({})` mặc định:** `class-validator` (dùng `validator.js`) mặc định chấp nhận `ftp://evil.com/a.jpg` và cả chuỗi không có protocol như `evil.com/a.jpg` (đã kiểm chứng trực tiếp bằng phiên bản `class-validator` của repo).
2. **Không giới hạn số lượng và độ dài `evidenceUrls`:** Thiếu `@ArrayMaxSize` và `@MaxLength`. Toàn bộ mảng được ghi vào cột `@db.Text` ở `order_evidences` (`orders.service.ts:1199`) và nhúng nguyên mảng vào outbox JSON (`orders.service.ts:1243`). Một payload lớn có thể gây phình DB hoặc làm outbox event vượt ngưỡng `MAX_REJECTED_ENVELOPE_BYTES` (64KB) / `MAX_EVENT_BYTES` (128KB) ở consumer phía sau.
3. **Thiếu giới hạn độ dài cho các trường chuỗi khác:**
   - `DisputeOrderDto.reason` thiếu `@MaxLength`.
   - `ResolveDisputeDto.resolutionNote` thiếu `@MaxLength`.
   - `ResolveDisputeDto.refundAmountVnd` dùng `/^[1-9][0-9]*$/` không giới hạn số chữ số (trái với `CreateRefundDto` ở `payment-service/src/refunds/dto/refunds.dto.ts:5` đang giới hạn `/^[1-9]\d{0,18}$/` để khớp `BigInt` signed 64-bit trong PostgreSQL — chuỗi > 19 chữ số sẽ gây lỗi DB `BIGINT out of range` / 500).

---

## 2. Vị trí mã nguồn liên quan

1. `backend/apps/order-service/src/orders/dto/dispute-order.dto.ts` (dòng 21–51):
   ```ts
   export class DisputeOrderDto {
     @IsNotEmpty({ message: 'Dispute reason is strictly required' })
     @IsString()
     @MinLength(5, {
       message: 'Dispute reason must be at least 5 characters long',
     })
     reason: string;

     @IsOptional()
     @IsEnum(DisputeCategory)
     category?: DisputeCategory;

     @IsOptional()
     @IsArray()
     @IsUrl({}, { each: true, message: 'Mỗi bằng chứng phải là một URL hợp lệ' })
     evidenceUrls?: string[];
   }
   ```

2. `backend/apps/order-service/src/orders/dto/resolve-dispute.dto.ts` (dòng 27–38):
   ```ts
   @IsNotEmpty({ message: 'Resolution note is strictly required' })
   @IsString()
   @MinLength(5, {
     message: 'Resolution note must be at least 5 characters long',
   })
   resolutionNote: string;

   @ApiPropertyOptional({ description: 'Exact whole VND amount as a decimal string; refund only' })
   @IsOptional()
   @IsString()
   @Matches(/^[1-9][0-9]*$/)
   refundAmountVnd?: string;
   ```

3. `backend/apps/order-service/src/orders/orders.service.ts` (dòng 1296):
   ```ts
   if (dto.refundAmountVnd !== undefined && !/^[1-9][0-9]*$/.test(dto.refundAmountVnd)) {
   ```

---

## 3. Phân tích nguyên nhân gốc & Kịch bản tái hiện

1. Gửi `POST /api/v1/orders/:id/dispute` với:
   ```json
   {
     "reason": "Thợ làm chưa đạt",
     "evidenceUrls": ["ftp://attacker.example/file.jpg", "evil.com/no-protocol.png"]
   }
   ```
   → Hiện tại vượt qua validation `200 OK` và được lưu thẳng vào DB + phát lên RabbitMQ.
2. Gửi `evidenceUrls` gồm 500 URL mỗi URL dài 2KB → tạo 500 dòng `order_evidences` và 1 message outbox ~1MB, gây hỏng consumer phía sau.
3. Gửi `POST /api/v1/admin/orders/:id/resolve-dispute` với `refundAmountVnd: "999999999999999999999999999999"` → vượt giới hạn `int8` PostgreSQL.

---

## 4. Hướng dẫn sửa chi tiết từng bước

### Bước 1: Siết validation trong `DisputeOrderDto`
File: `backend/apps/order-service/src/orders/dto/dispute-order.dto.ts`

```ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
```

Cập nhật các trường:
```ts
@IsNotEmpty({ message: 'Dispute reason is strictly required' })
@IsString()
@MinLength(5, {
  message: 'Dispute reason must be at least 5 characters long',
})
@MaxLength(2000, {
  message: 'Dispute reason must be at most 2000 characters long',
})
reason: string;
```
```ts
@IsOptional()
@IsArray()
@ArrayMaxSize(10, {
  message: 'Tối đa 10 bằng chứng cho mỗi lần khiếu nại',
})
@MaxLength(2048, {
  each: true,
  message: 'Mỗi URL bằng chứng không được vượt quá 2048 ký tự',
})
@IsUrl(
  { protocols: ['http', 'https'], require_protocol: true },
  { each: true, message: 'Mỗi bằng chứng phải là một URL hợp lệ' },
)
evidenceUrls?: string[];
```

### Bước 2: Siết validation trong `ResolveDisputeDto` & `OrdersService`
File: `backend/apps/order-service/src/orders/dto/resolve-dispute.dto.ts`

```ts
@IsNotEmpty({ message: 'Resolution note is strictly required' })
@IsString()
@MinLength(5, {
  message: 'Resolution note must be at least 5 characters long',
})
@MaxLength(2000, {
  message: 'Resolution note must be at most 2000 characters long',
})
resolutionNote: string;

@ApiPropertyOptional({ description: 'Exact whole VND amount as a decimal string; refund only' })
@IsOptional()
@IsString()
@Matches(/^[1-9]\d{0,18}$/)
refundAmountVnd?: string;
```

Đồng thời cập nhật regex kiểm tra phòng thủ ở `backend/apps/order-service/src/orders/orders.service.ts` (dòng 1296) và thêm check `note.length > 2000` (dòng 1293):
```ts
if (dto.refundAmountVnd !== undefined && !/^[1-9]\d{0,18}$/.test(dto.refundAmountVnd)) {
```

---

## 5. Test case cần bổ sung & Lệnh kiểm chứng

Bổ sung vào `backend/apps/order-service/src/orders/dto/dispute-order.dto.spec.ts` (hoặc file test DTO tương ứng) và `hg82-resolution.spec.ts`:
1. `DisputeOrderDto`:
   - `evidenceUrls: ['https://storage.handygo.vn/a.jpg']` → hợp lệ.
   - `evidenceUrls: ['ftp://evil.com/a.jpg']` → fail validation.
   - `evidenceUrls: ['evil.com/a.jpg']` (thiếu protocol) → fail validation.
   - `evidenceUrls: ['javascript:alert(1)']` → fail validation.
   - `evidenceUrls` có 11 phần tử → fail `ArrayMaxSize`.
   - 1 URL dài 2049 ký tự → fail `MaxLength`.
   - `reason` dài 2001 ký tự → fail `MaxLength`.
2. `ResolveDisputeDto`:
   - `resolutionNote` dài 2001 ký tự → fail `MaxLength`.
   - `refundAmountVnd: '10000000000000000000'` (20 chữ số) → fail `Matches`.
   - `refundAmountVnd: '50000'` → hợp lệ.

Lệnh kiểm chứng:
```powershell
cd backend
pnpm exec vitest run apps/order-service/src/orders
```

---

## 6. Definition of Done

- [x] `DisputeOrderDto.evidenceUrls` chỉ chấp nhận `http`/`https` có protocol rõ ràng, tối đa 10 phần tử, mỗi URL tối đa 2048 ký tự.
- [x] `DisputeOrderDto.reason` và `ResolveDisputeDto.resolutionNote` có `@MaxLength(2000)`.
- [x] `ResolveDisputeDto.refundAmountVnd` và guard trong `orders.service.ts` giới hạn `/^[1-9]\d{0,18}$/`.
- [x] Unit test validation pass 100%.
