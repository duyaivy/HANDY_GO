# PR80-03 — Admin giải quyết tranh chấp bị báo nhầm khách yêu cầu làm lại (P2)

## Lỗi và tác động

`worker-job-detail-screen.tsx` coi mọi `order.status.changed` có `toStatus='in_progress'` và có `reason` là rework. `orders.service.ts` phát chính event đó khi admin chọn `resume_previous_state`, kèm `resolutionNote` trong `reason`. Màn hình thợ quy hành động của admin cho khách.

## Hướng sửa đã chọn

1. Chỉ hiện Alert “Khách yêu cầu sửa lại” khi `eventType === 'order.rework_requested'`. Order Service đã phát event chuyên biệt này từ `requestRework`. `order.status.changed` chỉ kích hoạt refetch Order, kể cả khi có `reason`; không suy ra rework từ thay đổi trạng thái.
2. Đọc nội dung Alert từ `metadata.reworkReason` đã được Tracking Service giữ lại từ Order event; dùng chuỗi mặc định “Khách hàng yêu cầu chỉnh sửa lại công việc” khi trường này rỗng. Giữ bộ lọc `entityId === jobId` trước khi xử lý để event của đơn khác không tác động màn hình.
3. Với `disputed → in_progress`, chỉ refetch Order theo PR80-02; banner tranh chấp được gỡ theo Order mới, không hiển thị Alert rework.

## Kiểm thử và tiêu chí đạt

- Thêm test ở `worker-job-detail-screen.test.tsx`: event `disputed → in_progress` với `resolutionNote/reason` của admin không gọi Alert rework.
- Event `order.rework_requested` có `metadata.reworkReason` gọi Alert một lần với đúng lý do; event `order.status.changed` đi kèm không gọi thêm Alert.
- Event trạng thái của Order khác không thay đổi màn hình hiện tại. Chạy suite worker và typecheck.
