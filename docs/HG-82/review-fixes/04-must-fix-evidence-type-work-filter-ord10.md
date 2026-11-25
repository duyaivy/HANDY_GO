# Lỗi #04: Bằng chứng khiếu nại (`evidenceType: 'dispute'`) vượt rào kiểm tra bằng chứng công việc ORD-10

- **Mức độ:** `Must fix` (Chặn merge)
- **Trục review:** `Correctness`
- **Service ảnh hưởng:** `backend/apps/order-service`
- **PR / Commit gốc:** PR #97 (`a4ae22c320a7fdfa70f519ea742598c05323f665`)

---

## 1. Tóm tắt lỗi & Tác động

PR #97 tái sử dụng bảng `order_evidences` để lưu ảnh/video khiếu nại của khách hàng với `evidenceType = 'dispute'` (trong khi ảnh hoàn thành công việc của thợ dùng `evidenceType = 'work'`).

`deleteEvidence` (dòng 1104) đã lọc đúng `evidenceType: 'work'`, nhưng 2 hàm khác chưa lọc theo `evidenceType: 'work'`:
1. **`finish()` (dòng 568–573):** Vẫn đếm tổng toàn bộ `orderEvidence` theo `orderId` (và còn ưu tiên đọc `(order as any)._count?.evidences` không lọc loại). Do đó nếu đơn có bằng chứng `dispute` của khách, thợ vẫn vượt qua guard `ORD-10` để gọi `finish()` dù có **0** bằng chứng công việc (`work`).
2. **`addEvidence()` (dòng 980–985):** Kiểm tra trùng `mediaUrl` theo `{ orderId, mediaUrl }` mà không lọc `evidenceType: 'work'`. Nếu thợ vô tình gửi lại URL trùng với một ảnh `dispute` trước đó, hàm trả về bản ghi `dispute` thay vì tạo bản ghi `work`.

---

## 2. Vị trí mã nguồn liên quan

1. `backend/apps/order-service/src/orders/orders.service.ts` — hàm `finish()` (dòng 567–580):
   ```ts
   // ORD-10 Guard: Verify at least one evidence image/video exists inside the locked transaction
   const evidenceCount =
     (order as any)._count?.evidences !== undefined
       ? (order as any)._count.evidences
       : await tx.orderEvidence.count({
           where: { orderId },
         });

   if (evidenceCount === 0) {
     throw new BadRequestException({
       code: ORDER_ERROR_CODES.MISSING_EVIDENCE,
       message: ORDER_ERROR_MESSAGES.MISSING_EVIDENCE,
     });
   }
   ```

2. `backend/apps/order-service/src/orders/orders.service.ts` — hàm `addEvidence()` (dòng 979–985):
   ```ts
   // 2. Dedup Guard: Check if identical mediaUrl was already attached to this order
   const existingByUrl = await tx.orderEvidence.findFirst({
     where: {
       orderId,
       mediaUrl: dto.mediaUrl,
     },
   });
   ```

3. Đối chiếu `deleteEvidence()` (dòng 1104) đã làm đúng:
   - Lọc `evidenceType: 'work'` khi tìm/xóa bằng chứng của thợ.

---

## 3. Phân tích nguyên nhân gốc & Kịch bản tái hiện

### Kịch bản 1 (Tranh chấp khi đang `in_progress`)
1. Đơn ở `in_progress`, thợ chưa upload ảnh nào (`work` count = 0).
2. Khách mở khiếu nại kèm `evidenceUrls: ['https://cdn.example.com/complaint.jpg']` → tạo 1 dòng `order_evidences` với `evidenceType = 'dispute'`.
3. Admin xử lý `resume_previous_state` → đơn quay về `in_progress`.
4. Thợ gọi `POST /api/v1/orders/:id/finish` mà không upload ảnh công việc nào.
5. `tx.orderEvidence.count({ where: { orderId } })` trả về `1` → **vượt qua ORD-10 thành công dù không có ảnh công việc**.

### Kịch bản 2 (Chu kỳ bảo hành `rework`)
1. Đơn hoàn thành với 1 ảnh `work`, sau đó khách khiếu nại kèm ảnh `dispute`.
2. Admin chọn `rework` → đơn quay về `in_progress`.
3. Thợ xóa ảnh `work` cũ (còn 0 ảnh `work`, vẫn còn 1 ảnh `dispute`), rồi gọi `finish()` → vẫn vượt qua ORD-10.

### Kịch bản 3 (`addEvidence` trùng URL)
1. Đơn có bản ghi `evidenceType = 'dispute'` với URL `U`.
2. Thợ gọi `addEvidence` với cùng `mediaUrl = U` → `existingByUrl` khớp bản ghi `dispute` và trả về nó, không tạo bản ghi `work`.

---

## 4. Hướng dẫn sửa chi tiết từng bước

File: `backend/apps/order-service/src/orders/orders.service.ts`

1. **Sửa `finish()` (dòng 567–574):**
   Bỏ đọc `(order as any)._count?.evidences` (vì `_count` không lọc `evidenceType: 'work'`) và đếm trực tiếp trong transaction:
   ```ts
   // ORD-10 Guard: Verify at least one work evidence image/video exists inside the locked transaction
   const evidenceCount = await tx.orderEvidence.count({
     where: {
       orderId,
       evidenceType: 'work',
     },
   });
   ```

2. **Sửa `addEvidence()` (dòng 979–986 và 1002–1011):**
   - Thêm `evidenceType: 'work'` vào `existingByUrl`:
     ```ts
     const existingByUrl = await tx.orderEvidence.findFirst({
       where: {
         orderId,
         mediaUrl: dto.mediaUrl,
         evidenceType: 'work',
       },
     });
     ```
   - Rà soát thêm `existingByClient` (ngay phía trên dòng 965): nên kiểm tra xem `clientEvidenceId` có bị ảnh hưởng không (ảnh `dispute` không gán `clientEvidenceId`, nhưng thêm `evidenceType: 'work'` hoặc giữ nguyên đều ổn; ở `create` dòng 1002 nên tường minh thêm `evidenceType: 'work'` để dễ đọc).

3. **Rà soát nhanh các chỗ khác dùng `orderEvidence` trong `orders.service.ts`:**
   - Đảm bảo mọi nơi đọc danh sách bằng chứng của thợ hoặc kiểm tra `ORD-10` đều phân biệt rõ `evidenceType: 'work'` vs `'dispute'`.

---

## 5. Test case cần bổ sung & Lệnh kiểm chứng

Bổ sung vào `backend/apps/order-service/src/orders/orders.service.spec.ts`:
1. `finish()` khi đơn chỉ có bằng chứng `evidenceType: 'dispute'` (0 bằng chứng `'work'`) → ném `BadRequestException` với `ORDER_ERROR_CODES.MISSING_EVIDENCE` (và kiểm tra `tx.orderEvidence.count` được gọi với `{ where: { orderId, evidenceType: 'work' } }`).
2. `finish()` khi đơn có ít nhất 1 bằng chứng `evidenceType: 'work'` → chuyển sang `awaiting_customer_confirmation` thành công.
3. `addEvidence()` kiểm tra `tx.orderEvidence.findFirst` truyền `evidenceType: 'work'` khi dedup theo `mediaUrl`.

*(Lưu ý: kiểm tra xem có unit test cũ nào trong `orders.service.spec.ts` đang mock `order._count.evidences` thay vì `tx.orderEvidence.count` không — nếu có, cập nhật mock đó để khớp truy vấn `count({ where: { orderId, evidenceType: 'work' } })`.)*

Lệnh kiểm chứng:
```powershell
cd backend
pnpm exec vitest run apps/order-service/src/orders/orders.service.spec.ts apps/order-service/src/orders/hg82-resolution.spec.ts
```

---

## 6. Definition of Done

- [x] `finish()` đếm chính xác `where: { orderId, evidenceType: 'work' }`.
- [x] `addEvidence()` lọc `evidenceType: 'work'` khi dedup theo `mediaUrl`.
- [x] Có unit test chứng minh bằng chứng `dispute` không vượt qua được ORD-10.
- [x] Toàn bộ test suite `order-service` pass.
