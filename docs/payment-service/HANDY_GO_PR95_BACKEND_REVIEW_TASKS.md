# HANDY_GO — Backend review tasks cho PR #95

**Ngày kiểm tra:** 21/11/2026  
**PR:** https://github.com/duyaivy/HANDY_GO/pull/95  
**Tiêu đề:** `feat(payment): add admin system-wide refunds listing endpoint`  
**HEAD được kiểm tra:** `9b6b902f1b74757e9864c25c1b70a56cb93dd7d7`  
**Phạm vi:** **Chỉ PR #95 / Backend Payment Service**; không bao gồm task từ PR #93 hoặc Mobile.  
**Phương pháp:** Review patch và nội dung code ở HEAD PR #95; không chạy test cục bộ.

## Kết luận nhanh

**2 góp ý từ vòng review trước vẫn chưa được xử lý tại HEAD nêu trên.** Đây là các vấn đề mức **P3 / không phải merge blocker**. GitHub Actions của commit đã báo **CI Gate PASS**; tuy nhiên CI PASS không có nghĩa các edge case dưới đây đã được test.

| ID | Hạng mục | Mức độ | Trạng thái | Merge blocker? |
| --- | --- | --- | --- | --- |
| BE-PR95-01 | Chuẩn hóa validation của `status` khi chỉ có dấu phẩy / khoảng trắng | P3 | Chưa xử lý; cần chốt API contract | Không |
| BE-PR95-02 | Bổ sung integration test cho filtering, paging, `paymentId` của Admin refunds | P3 | Chưa đủ coverage | Không |

---

## BE-PR95-01 — [P3] Status filter rỗng bị hiểu thành không lọc

**File:**
- [`backend/apps/payment-service/src/refunds/dto/refunds.dto.ts`](https://github.com/duyaivy/HANDY_GO/blob/9b6b902f1b74757e9864c25c1b70a56cb93dd7d7/backend/apps/payment-service/src/refunds/dto/refunds.dto.ts)
- [`backend/apps/payment-service/src/payment-query/dto/payment-query.dto.ts`](https://github.com/duyaivy/HANDY_GO/blob/9b6b902f1b74757e9864c25c1b70a56cb93dd7d7/backend/apps/payment-service/src/payment-query/dto/payment-query.dto.ts)
- Service tương ứng: `refunds.service.ts#listAll()` và `payment-query.service.ts#list()`.

### Hiện trạng đã kiểm tra

Hai DTO đều chuẩn hóa status theo kiểu:

```ts
return value
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
```

Vì vậy, khi client gọi:

```http
GET /api/v1/payments/admin/refunds?status=,,,
GET /api/v1/payments/admin/records?status=,,,
```

`status` trở thành `[]`. `@IsArray()` vẫn chấp nhận `[]`; `@IsIn(..., { each: true })` không bác bỏ một mảng rỗng. Service dùng điều kiện `query.status.length > 0`, nên **bỏ bộ lọc trạng thái** và trả về danh sách không lọc.

**Đánh giá:** Đây là lỗ hổng về semantics/validation, **không phải lỗ hổng phân quyền**. Nếu contract cố ý coi danh sách status rỗng như không lọc thì cách xử lý hiện tại là chấp nhận được, nhưng cần mô tả rõ. Nếu client gửi bộ lọc không hợp lệ, hành vi trả `200` với toàn bộ dữ liệu có thể gây hiểu nhầm.

### Việc cần làm

- [ ] Chốt contract: status bị bỏ hẳn (`undefined`) nghĩa là không lọc; status được cung cấp nhưng không có giá trị hợp lệ sẽ trả `400 Bad Request` **hoặc** được xử lý như không lọc (nếu cố ý).
- [ ] Nếu chọn strict validation, thêm `@ArrayNotEmpty()` sau transform; cân nhắc phân biệt `status=` với việc không gửi `status`.
- [ ] Giữ hỗ trợ 3 dạng đang công bố: `?status=pending`, `?status=pending,processing`, `?status=pending&status=processing`.
- [ ] Duy trì `@IsIn(..., { each: true })` để từ chối giá trị lạ.
- [ ] Cập nhật mô tả Swagger và test API cho hành vi đã chọn.

### Acceptance criteria

- [ ] Không gửi `status` vẫn liệt kê không lọc.
- [ ] Gửi `status=pending,processing` lọc đúng hai trạng thái.
- [ ] Gửi `status=pending&status=processing` tương đương dạng dấu phẩy.
- [ ] Gửi `status=unknown` trả `400`.
- [ ] Gửi `status=,,,` có kết quả đúng theo contract đã chốt (ưu tiên `400` nếu muốn strict validation).
- [ ] Kết quả thống nhất trên `/admin/refunds` và `/admin/records`, đồng thời không làm hỏng `/payments/me`.

---

## BE-PR95-02 — [P3] Integration test của Admin refunds chưa kiểm chứng đầy đủ bộ lọc và phân trang

**File:**
- [`backend/apps/payment-service/test/integration/admin-refunds.int-spec.ts`](https://github.com/duyaivy/HANDY_GO/blob/9b6b902f1b74757e9864c25c1b70a56cb93dd7d7/backend/apps/payment-service/test/integration/admin-refunds.int-spec.ts)
- Logic cần cover: [`backend/apps/payment-service/src/refunds/refunds.service.ts`](https://github.com/duyaivy/HANDY_GO/blob/9b6b902f1b74757e9864c25c1b70a56cb93dd7d7/backend/apps/payment-service/src/refunds/refunds.service.ts), method `listAll()`.

### Hiện trạng đã kiểm tra

PR đã thêm test gọi:

```ts
const allRefunds = await authorized(
  'get',
  '/admin/refunds?status=needs_review,pending',
  P.refundReadAll,
).expect(200);

expect(allRefunds.body.data.items.some(
  (item: { id: string }) => item.id === refund.id,
)).toBe(true);
expect(allRefunds.body.data.items[0]).toHaveProperty('orderId');
```

Test này xác minh một refund có xuất hiện và có `orderId`, nhưng **không chứng minh đầy đủ** rằng các refund sai trạng thái/sai payment bị loại, hoặc `total`, `totalPages`, `page`, `limit` thực sự chính xác. Chưa có test riêng trong phần diff mới cho `paymentId` và pagination của route mới.

### Việc cần làm

- [ ] Tạo dữ liệu kiểm thử gồm nhiều payment và nhiều refund có status khác nhau (dùng database test cô lập).
- [ ] Test status một giá trị, nhiều giá trị theo dấu phẩy, nhiều giá trị bằng query lặp.
- [ ] Test `paymentId` chỉ trả refund thuộc payment chỉ định.
- [ ] Test **kết hợp** `paymentId` và `status` để bảo đảm Prisma `where` dùng điều kiện AND.
- [ ] Test phân trang `page=1&limit=1`, `page=2&limit=1`, `total`, `totalPages`; không trùng hoặc bỏ sót bản ghi khi dữ liệu tĩnh.
- [ ] Test thứ tự deterministic `createdAt desc`, `id desc` (kể cả khi `createdAt` trùng nhau).
- [ ] Test `paymentId` không phải UUID, `page=0`, `limit=101`, `status=unknown` trả `400`.
- [ ] Test dữ liệu `orderId`, `customerUserId`, `workerUserId` ánh xạ đúng Payment tương ứng, không chỉ kiểm tra field tồn tại.
- [ ] Giữ test 401 (không JWT), 403 (sai role/thiếu `refund:read:all`) đã có.

### Acceptance criteria

- [ ] `GET /api/v1/payments/admin/refunds` trả đúng `{ items, total, page, limit, totalPages }`.
- [ ] Bộ lọc `status` và `paymentId` loại chính xác bản ghi không phù hợp.
- [ ] Kết quả ổn định khi phân trang; các trường liên quan payment đúng dữ liệu seed.
- [ ] Mỗi trường hợp âm tính trả status code phù hợp, không thành lỗi 500.
- [ ] Backend CI và integration test PASS sau khi sửa.

---

## Những điểm đã ổn — không mở task mới

- Route tĩnh `GET /payments/admin/refunds` đã đứng trước `GET /payments/:id/refunds` trong `RefundsController`; hotfix **route shadowing** hiện diện ở HEAD.
- Route Admin có kiểm tra `refund:read:all` thông qua `requireAdminPermission()` và controller dùng JWT guard.
- `listAll()` có order theo `createdAt desc, id desc` và sử dụng Prisma `findMany()` + `count()` trong transaction.
- CI PR #95 (Backend CI và CI Gate) được ghi nhận **PASS** ở HEAD nêu trên.

## Quyết định merge

**Có thể merge PR #95** nếu nhóm chấp nhận 2 góp ý P3 này là backlog. Không có lỗi blocker đã được xác minh trong phạm vi review trên. Nếu muốn API contract chặt chẽ và coverage tốt hơn trước merge, xử lý hai mục trên rồi chạy lại CI.

### Tiêu đề issue đề xuất

- `[BE][P3][PR95] Decide and validate empty multi-status filters consistently`
- `[BE][P3][PR95] Expand Admin refunds integration tests for filters and pagination`
