# PR #62 — P2 — Không tìm được hồ sơ thợ của đơn đã tạo

**Review:** [Comment gốc](https://github.com/duyaivy/HANDY_GO/pull/62#discussion_r4505627799)
**Nhánh:** `bugfix/HG-63-ui_mobile_app-followup` → `main`
**Commit được review:** `1052bca2a767495168b2f51ec6f7a174c5058468`
**Trạng thái khi ghi nhận (09/11/2026):** Thread chưa resolve; hướng xử lý dưới đây chưa được triển khai.

**Vị trí:** [`use-customer-orders.ts`](../../mobile/src/features/orders/hooks/use-customer-orders.ts), phần `workerProfileQuery` từ dòng 253.
**Hiện trạng:** Hook lấy `order.worker` nếu có, rồi thử `selectedBidId`, sau đó tìm thợ trong bids/recommendations của `getCandidates(serviceRequestId)`. Với đơn tạo từ Matching không có `selectedBidId`, request có thể đã chuyển sang `converted_to_order` và danh sách recommendations rỗng. Khi ấy đơn vẫn có `workerUserId` nhưng màn hình thiếu tên/ảnh/điểm uy tín của thợ.

**Hướng xử lý:**

1. Xác minh Order API có snapshot worker đáng tin cậy không. Nếu có, dùng snapshot đó trước.
2. Khi snapshot thiếu, lấy hồ sơ trực tiếp theo `order.workerUserId` qua endpoint User-Trust/API Gateway phù hợp. Nếu chưa có endpoint dành cho mobile, bổ sung contract tối thiểu ở backend rồi gọi từ `OrdersApi`; kiểm tra quyền xem hồ sơ của thợ thuộc đơn.
3. Giữ `selectedBidId` và candidates làm fallback, không dựa vào candidates như nguồn duy nhất. Chỉ hiển thị các trường thật sự có dữ liệu; không tạo avatar, rating hay số điện thoại giả.

**Tiêu chí nghiệm thu:** Đơn chọn từ Matching có `selectedBidId` rỗng, `matching.recommendations: []` và `workerUserId` hợp lệ vẫn hiện đúng hồ sơ thợ. Kiểm tra thêm đường bid và trường hợp endpoint hồ sơ lỗi hoặc thiếu một số trường.
