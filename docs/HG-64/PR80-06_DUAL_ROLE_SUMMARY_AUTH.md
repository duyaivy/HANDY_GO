# PR80-06 — Tài khoản hai vai trò có thể xem summary Order không thuộc mình (Security/P1 có điều kiện)

## Điều kiện và tác động

`backend/apps/tracking-service/src/summary/summary.service.ts` cho worker từng tham gia báo giá xem summary của request, sau đó dùng `user.isCustomer` như thể là **chủ request** khi quyết định lộ Order và Payment. Nếu một tài khoản có cả vai trò `Customer` và `Worker`, worker báo giá cho khách khác có thể vượt rào che thông tin Order/Payment. Review chưa xác nhận môi trường hiện tại cho phép tài khoản hai vai trò; biểu thức cấp quyền vẫn sai về mặt ownership.

## Hướng sửa đã chọn

1. Tính `isOwner = Boolean(user.isCustomer && flow.customerId === user.userId)` một lần sau khi tải flow. Dùng giá trị đó cho cả cổng xem summary ban đầu và cổng xem dữ liệu Order/Payment. Điều kiện tham gia của worker vẫn cần kiểm tra qua event như hiện tại.
2. Đổi `isAuthorizedForOrderAndPayment` thành `user.isAdmin || isOwner || (user.isWorker && isAssignedWorker)`. Worker tham gia nhưng không được gán vẫn được xem phần request/bidding đã cho phép, nhưng không nhận `order` và `payment` trong response.
3. `buildSummaryCacheKey` hiện đã phân biệt `cust:${userId}` và `wrk:${userId}`, nhưng tài khoản hai vai trò dùng nhánh `cust`. Đổi prefix thành `tracking:summary-auth2:` để bỏ qua các response từng được tạo dưới quy tắc cấp quyền cũ; giữ phần `serviceRequestId`, phạm vi user và `eventSequence` trong key. Cấu trúc này vẫn khớp mẫu xóa cache `tracking:*:${serviceRequestId}:*` của Tracking Service. Cache lookup phải diễn ra sau kiểm tra quyền như hiện tại.
4. Không dựa vào việc giao diện chỉ cho chọn một vai trò. Server luôn xác thực `flow.customerId === user.userId` trước khi coi caller là chủ request.

## Kiểm thử và tiêu chí đạt

- Bổ sung test trong `backend/apps/tracking-service/src/summary/summary.service.spec.ts`: user có cả `Customer` và `Worker`, là worker báo giá nhưng không phải chủ/worker được gán → summary không chứa Order/Payment.
- Chủ request hai vai trò vẫn xem được Order/Payment của mình; worker được gán vẫn xem được phần được phép; user không tham gia nhận 403.
- Chạy lại cùng test với Redis cache bật để xác nhận đọc xen kẽ giữa ba user không rò dữ liệu. Chạy Tracking tests và backend typecheck.
