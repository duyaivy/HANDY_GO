# PR #62 — P1 — Evidence bị ghi trùng khi thử lại

**Review:** [Comment gốc](https://github.com/duyaivy/HANDY_GO/pull/62#discussion_r4505627794)
**Nhánh:** `bugfix/HG-63-ui_mobile_app-followup` → `main`
**Commit được review:** `1052bca2a767495168b2f51ec6f7a174c5058468`
**Trạng thái (09/11/2026):** Đã hoàn thành xử lý. Hướng xử lý idempotency (orderId, clientEvidenceId) và tách trạng thái persisted trên mobile đã được triển khai và kiểm thử thành công.

**Vị trí:** [`worker-job-complete-screen.tsx`](../../mobile/src/features/orders/worker/screens/worker-job-complete-screen.tsx) và [`orders.service.ts`](../../backend/apps/order-service/src/orders/orders.service.ts).
**Hiện trạng:** Màn hình coi ảnh đã tải lên CDN là `completed`, sau đó `uploadEvidence()` POST từng ảnh vào Order Service. Vòng lặp không ghi nhận riêng ảnh nào đã được Order Service lưu. `addEvidence()` ở backend tạo bản ghi mới bằng `orderEvidence.create()`.

**Tình huống lỗi:** Ảnh 1 và 2 được POST thành công, ảnh 3 thất bại; hoặc mọi ảnh được lưu nhưng `finishOrder()` thất bại. Khi người dùng bấm gửi lại, các ảnh đã lưu được POST thêm lần nữa. Nếu phản hồi của một POST bị mất sau khi backend đã commit, chỉ lưu trạng thái ở frontend cũng không đủ để biết lần POST đó đã thành công.

**Hướng xử lý:**

1. Tách hai trạng thái của mỗi ảnh: `remoteUrl`/đã tải lên CDN và `persisted`/đã được Order Service xác nhận, kèm ID evidence trả từ API nếu có. Trong cùng phiên, chỉ POST ảnh chưa `persisted`; nếu `finishOrder()` lỗi thì thử lại bước finish mà không POST lại ảnh đã xác nhận.
2. Để an toàn cả khi timeout, mất phản hồi hoặc khởi động lại app, gắn một khóa idempotency ổn định cho từng ảnh của từng đơn. Backend áp ràng buộc duy nhất, ví dụ `(orderId, clientEvidenceId)`, và trả lại bản ghi cũ khi nhận lại cùng khóa. Chốt tên trường và contract API trước khi triển khai; chỉ dedup bằng `mediaUrl` nếu backend bảo đảm URL có tính duy nhất phù hợp.
3. Giữ nguyên khóa khi retry cùng ảnh; ảnh mới phải có khóa mới. Không đánh dấu `persisted` trước khi nhận xác nhận từ API. Sau khi có idempotency ở backend, frontend có thể đồng bộ lại trạng thái ảnh khi mở lại màn hình.

**Tiêu chí nghiệm thu:**

- Lỗi ở ảnh thứ ba rồi gửi lại: mỗi ảnh chỉ có một bản ghi evidence trong DB.
- `finishOrder()` lỗi rồi gửi lại: không tạo thêm evidence; đơn chuyển trạng thái sau khi finish thành công.
- Backend đã commit nhưng client timeout/mất phản hồi: retry cùng khóa trả về cùng bản ghi, không tạo bản ghi mới.
- Ảnh mới được thêm sau lần gửi lỗi vẫn được lưu bình thường.
