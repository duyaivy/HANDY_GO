# Lỗi #08: Refactor `resolveCompletedDispute` (110 dòng) và thay thế magic numbers bằng hằng số đặt tên

- **Mức độ:** `Should fix` (Không chặn merge)
- **Trục review:** `Readability`
- **Service ảnh hưởng:** `backend/apps/order-service`
- **PR / Commit gốc:** PR #97 (`a4ae22c320a7fdfa70f519ea742598c05323f665`)

---

## 1. Tóm tắt lỗi & Tác động

1. **Hàm quá dài, nhiều trách nhiệm:** `OrdersService.resolveCompletedDispute` (`orders.service.ts:1279-1388`) dài ~110 dòng và gộp liền 6 trách nhiệm vào một hàm:
   - Kiểm tra role Admin
   - Validate DTO / idempotencyKey / resolutionNote / refundAmountVnd
   - Tạo `requestHash` và xử lý idempotency replay
   - Gọi HTTP preflight tới `PaymentRefundClient`
   - Thực thi Prisma transaction (lock row, kiểm tra trùng, tạo resolution, CAS update order, tạo status history, tạo 2–3 outbox event)
   - Bắt lỗi `P2002` để replay lại
   Ngoài ra nhiều biểu thức bị nén trên 1 dòng dài (dòng 1351–1378), khó đọc và dễ bỏ sót lỗi khi bảo trì (như Lỗi #02 vừa gặp).
2. **Magic numbers chưa đặt tên:**
   - `7 * 24 * 60 * 60 * 1000` (`orders.service.ts:1147`)
   - `150` và `5` (`orders.service.ts:1293`, lặp lại ở `resolve-dispute.dto.ts:29, 43`)
   - `100` (`payment-events.consumer.ts:62` — độ dài cắt chuỗi `failureCode`)

---

## 2. Vị trí mã nguồn liên quan

1. `backend/apps/order-service/src/common/constants/order.constants.ts` (dòng 3–13)
2. `backend/apps/order-service/src/orders/orders.service.ts`:
   - Dòng 1147: `const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;`
   - Dòng 1279–1388: `resolveCompletedDispute(...)`
3. `backend/apps/order-service/src/consumers/payment-events.consumer.ts`:
   - Dòng 62: `body.failureCode.slice(0, 100)`

---

## 3. Hướng dẫn sửa chi tiết từng bước

### Bước 1: Định nghĩa hằng số nghiệp vụ trong `order.constants.ts`
File: `backend/apps/order-service/src/common/constants/order.constants.ts`

```ts
// HG-82 Complaint & Dispute Resolution Rules
COMPLAINT_WINDOW_DAYS: 7,
COMPLAINT_WINDOW_MS: 7 * 24 * 60 * 60 * 1000,
MIN_RESOLUTION_NOTE_LENGTH: 5,
MAX_RESOLUTION_NOTE_LENGTH: 2000,
MAX_IDEMPOTENCY_KEY_LENGTH: 150,
MAX_DISPUTE_EVIDENCE_URLS: 10,
MAX_EVIDENCE_URL_LENGTH: 2048,
MAX_FAILURE_CODE_LENGTH: 100,
```

Sử dụng lại các hằng số này tại:
- `orders.service.ts:1147` (`ORDER_CONSTANTS.COMPLAINT_WINDOW_MS`)
- `orders.service.ts:1293` (`ORDER_CONSTANTS.MAX_IDEMPOTENCY_KEY_LENGTH`, `ORDER_CONSTANTS.MIN_RESOLUTION_NOTE_LENGTH`, `ORDER_CONSTANTS.MAX_RESOLUTION_NOTE_LENGTH`)
- `payment-events.consumer.ts:62` (`ORDER_CONSTANTS.MAX_FAILURE_CODE_LENGTH`)

### Bước 2: Tách `resolveCompletedDispute` thành các private helper ngắn gọn
File: `backend/apps/order-service/src/orders/orders.service.ts`

Tách thành 4 bước dễ đọc, mỗi helper làm đúng 1 việc:
1. `private validateCompletedDisputeInput(dto: ResolveDisputeDto, roles: string[]): { action: Hg82ResolutionAction; key: string; note: string }`
   - Kiểm tra role Admin, action thuộc `['dismiss', 'rework', 'refund']`, độ dài `key` & `note`, validate `refundAmountVnd`.
2. `private async findIdempotentDisputeResolution(orderId: string, key: string, hash: string, tx?: Prisma.TransactionClient)`
   - Dùng chung cho cả check ngoài transaction, trong transaction, và trong khối `catch (P2002)` — loại bỏ hoàn toàn code trùng lặp giữa dòng 1300–1308 và 1335–1342.
3. `private async preflightRefundEligibility(orderId: string, requestedAmount?: string): Promise<{ paymentId: string; refundAmount: bigint }>`
   - Gọi `this.paymentRefundClient.byOrder(orderId)`, kiểm tra trạng thái payment và `refundableAmountVnd`.
4. `private async commitCompletedDisputeTx(tx: Prisma.TransactionClient, params: ...)`
   - Lock order, kiểm tra/supersede resolution hiện có (kết hợp Lỗi #02), cập nhật order, ghi history & outbox event với định dạng nhiều dòng rõ ràng.

Khi đó, thân hàm `resolveCompletedDispute` chỉ còn ~25–30 dòng đọc từ trên xuống dưới như một quy trình nghiệp vụ rõ ràng.

---

## 4. Test case cần bổ sung & Lệnh kiểm chứng

Đây là refactor giữ nguyên hành vi (behaviour-preserving), chạy lại toàn bộ bộ test hiện có sau khi tách hàm để đảm bảo không regression:

```powershell
cd backend
pnpm exec vitest run apps/order-service
```

---

## 5. Definition of Done

- [x] Toàn bộ magic numbers của HG-82 được gom về `ORDER_CONSTANTS`.
- [x] `resolveCompletedDispute` được tách thành các helper rõ trách nhiệm, loại bỏ code lặp replay idempotency.
- [x] Không thay đổi hành vi ngoài ý muốn; toàn bộ test `order-service` pass.
