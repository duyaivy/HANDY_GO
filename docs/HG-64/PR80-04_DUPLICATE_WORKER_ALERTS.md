# PR80-04 — Hai event cho một chuyển trạng thái gây thông báo trùng (P2)

## Lỗi và tác động

Order Service phát `order.disputed` cùng `order.status.changed → disputed` cho một lần mở tranh chấp; khi hoàn tất cũng có `order.completed` cùng event đổi trạng thái. Callback SSE ở `worker-job-detail-screen.tsx` hiện Alert nếu gặp một trong hai, nên thợ có thể nhận hai Alert cho cùng hành động.

## Hướng sửa đã chọn

1. Dùng **event chuyên biệt** `order.disputed` và `order.completed` làm nguồn duy nhất để bật Alert. `order.status.changed` chỉ yêu cầu refetch Order và Tracking summary, không bật Alert tranh chấp/hoàn tất.
2. Trong callback, xác nhận `event.entityId === jobId` trước khi xử lý. Dùng `useRef(new Set<string>())` lưu `event.eventId` đã thông báo trong vòng đời màn hình; bỏ qua event chuyên biệt có cùng ID khi SSE phát lại sau reconnect. Xóa Set khi `jobId` đổi/remount; không dùng Set để chặn các lần tranh chấp khác của cùng Order.
3. Tách cập nhật trạng thái khỏi Alert: các event đều làm mới Order như PR80-02; Alert chỉ là phản hồi một lần cho event chuyên biệt. Không giữ `localStatus` chỉ để tránh trùng Alert.

## Kiểm thử và tiêu chí đạt

- Trong `worker-job-detail-screen.test.tsx`, phát tuần tự `order.disputed` và `order.status.changed → disputed`; chỉ một Alert tranh chấp, Order được refetch.
- Phát `order.completed` và `order.status.changed → completed`; chỉ một Alert hoàn tất.
- Phát lại cùng `eventId` sau reconnect không hiện Alert lần hai; event chuyên biệt mới với ID khác vẫn hiện. Chạy suite worker và typecheck.
