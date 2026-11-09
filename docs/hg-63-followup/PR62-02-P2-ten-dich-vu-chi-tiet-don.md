# PR #62 — P2 — Tên dịch vụ trên chi tiết đơn hàng bị fallback

**Review:** [Comment gốc](https://github.com/duyaivy/HANDY_GO/pull/62#discussion_r4505627798)
**Nhánh:** `bugfix/HG-63-ui_mobile_app-followup` → `main`
**Commit được review:** `1052bca2a767495168b2f51ec6f7a174c5058468`
**Trạng thái khi ghi nhận (09/11/2026):** Thread chưa resolve; hướng xử lý dưới đây chưa được triển khai.

**Vị trí:** [`customer-order-detail-screen.tsx`](../../mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx), dòng 144–147.
**Hiện trạng:** `resolvedServiceName` dùng `propServiceName`, `order.service.name` hoặc `order.serviceName` rồi rơi về `Dịch vụ tiện ích`. Route chi tiết đơn hàng chỉ truyền `orderId`; `OrderResponseDto` hiện có `serviceId` nhưng không cam kết trả hai tên dịch vụ trên. Vì vậy đơn thật có thể hiện tên chung dù đã có `serviceId`.

**Hướng xử lý:**

1. Ưu tiên tên hợp lệ từ Order API nếu backend trả về. Nếu không có, tra `order.serviceId` qua `KNOWN_SERVICES_BY_ID`/`resolveServiceName` đang dùng trong mobile; với dịch vụ không có trong bảng cố định, lấy tên từ Catalog theo `serviceId` nếu API hỗ trợ.
2. Chỉ dùng `propServiceName` khi nó thuộc đúng đơn đang mở; giữ fallback chung cho trường hợp không resolve được bất kỳ nguồn nào.
3. Tránh hiển thị giá trị rỗng hoặc nhãn chung từ một nguồn trước khi thử nguồn có `serviceId`.

**Tiêu chí nghiệm thu:** Order API chỉ trả `serviceId` mà không có `serviceName`/`service.name` vẫn hiện đúng tên; tên hợp lệ từ server được ưu tiên; trường hợp `serviceId` không nhận diện được hiển thị fallback an toàn.
