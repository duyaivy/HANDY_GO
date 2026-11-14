# HG64-03 — Thống nhất contract sự kiện trạng thái Order

## Lỗi đã xác nhận

Trước khi sửa, `OrdersService` ghi đồng thời `order.status.changed` và một event chuyên biệt (`order.confirmed`, `order.started`, `order.finished`) cho cùng một lần chuyển trạng thái. Tracking chỉ nhận `order.status.changed`; ba event chuyên biệt không có handler. Việc này làm outbox và broker xử lý dữ liệu thừa, đồng thời tạo hai cách diễn giải cùng một thay đổi trạng thái.

Backend Tracking trả `AWAITING_CONFIRMATION` khi Order chuyển sang `awaiting_customer_confirmation`, nhưng mobile chưa nhận phase này. Vì vậy timeline có thể tiếp tục hiện “Chờ thợ bắt đầu công việc” dù thợ đã báo hoàn thành.

## Hướng giải quyết cụ thể

1. Dùng duy nhất `order.status.changed` cho ba chuyển trạng thái `created → confirmed`, `confirmed → in_progress`, `in_progress → awaiting_customer_confirmation`. Ghi event trong cùng transaction cập nhật Order.
2. Xóa ba lệnh ghi event chuyên biệt khỏi `OrdersService`, xóa ba hằng số tương ứng trong Order Service và hằng số `ORDER_STARTED` không còn dùng trong thư viện chung.
3. Giữ `previousStatus`, `nextStatus` và timestamp (`confirmedAt`, `startedAt`, `finishedAt`) trong payload. Tracking lưu trạng thái trước/sau cùng timestamp trong metadata. Notification tiếp tục nhận `order.status.changed`.
4. Trong Tracking Summary, lấy `finishedAt` từ lần chuyển trạng thái gần nhất sang `awaiting_customer_confirmation`; trả trường này trong `order` milestone.
5. Trong mobile, nhận phase `AWAITING_CONFIRMATION`, đánh dấu mốc “Thực hiện dịch vụ” hoàn thành tại `finishedAt`, đánh dấu “Nghiệm thu & Thanh toán” đang thực hiện. Màn hình chi tiết việc của thợ ánh xạ phase này về `awaiting_customer_confirmation`.
6. Cập nhật fixture và tài liệu dùng tên event cũ. Test mỗi lệnh confirm/start/finish chỉ ghi một event trạng thái với `previousStatus`/`nextStatus` chính xác; test contract Tracking và hiển thị mobile cho trạng thái chờ nghiệm thu.

## Tiêu chí nghiệm thu

- Mỗi lần confirm/start/finish ghi đúng một `order.status.changed` vào outbox, không ghi `order.confirmed`, `order.started`, `order.finished`.
- Tracking timeline có một bản ghi trạng thái cho mỗi lần chuyển; Summary phản ánh đúng `AWAITING_CONFIRMATION` và `finishedAt`.
- Mobile hiển thị công việc đã hoàn thành và chờ khách nghiệm thu, không còn hiện “Chờ thợ bắt đầu công việc”.
- Unit/contract test Order, Tracking, Notification và mobile vượt qua; typecheck backend và mobile vượt qua.

## Kết quả thực hiện

- [x] Rà soát consumer: Tracking và Notification đã dùng `order.status.changed`; không có runtime consumer cho ba pattern chuyên biệt.
- [x] Xóa event chuyên biệt và hằng số không dùng.
- [x] Đồng bộ payload, Tracking Summary, phase mobile và timeline.
- [x] Cập nhật test producer, Tracking, mobile và fixture cũ.
- [x] Xác nhận test backend (227 passed, 9 skipped), test mobile (23 passed), typecheck backend và mobile.

Việc xác minh trên môi trường triển khai vẫn cần chạy theo kịch bản tích hợp ở HG64-05 sau khi deploy.
