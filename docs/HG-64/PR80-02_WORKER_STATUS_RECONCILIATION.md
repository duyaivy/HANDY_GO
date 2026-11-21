# PR80-02 — Trạng thái tạm làm màn hình thợ kẹt ở trạng thái cũ (P1)

## Lỗi và tác động

`worker-job-detail-screen.tsx` giữ `localStatus` sau SSE và sau nút xác nhận/bắt đầu; `currentStatus = localStatus || statusFromTracking || order?.status || 'created'`. Khi admin giải quyết `disputed → in_progress`, `localStatus='disputed'` vẫn thắng Order API mới. Tracking summary cũ cũng đang được ưu tiên hơn `order.status`. Nút hành động có thể sai đến khi rời và mở lại màn hình.

## Hướng sửa đã chọn

1. Trong `mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx`, dùng `order?.status` từ `useWorkerJobDetail` làm nguồn quyết định nút và banner nghiệp vụ. Khi Order API chưa có dữ liệu, hiển thị trạng thái tải và chưa cho thao tác; không lấy trạng thái Tracking thay cho Order vì projection có thể đến chậm. Tracking tiếp tục phục vụ timeline và chỉ báo kết nối.
2. Bỏ `localStatus` và phép tính `statusFromTracking` khỏi logic nút hành động. Khi nhận event Order có `entityId === jobId`, gọi `refetch()` Order; nếu `order.status.changed` đã báo trạng thái mới mà kết quả refetch vẫn cũ, thử lại một lần sau 2 giây. Hủy timer khi đổi đơn hoặc rời màn hình. Trong lúc chờ, giữ trạng thái Order đã tải và chỉ báo đang cập nhật. Không gán trạng thái từ SSE trực tiếp vào UI hành động.
3. Sau `confirmReadiness()` và `startOrder()` thành công, dùng Order đã được mutation ghi vào React Query cache trong `mobile/src/features/orders/hooks/use-worker-jobs.ts`. Nhánh `catch` của `handleConfirmReadiness` hiện vẫn báo thành công và đặt `confirmed`: đổi thành báo lỗi lấy từ exception, không cập nhật trạng thái. Chỉ hiện Alert thành công sau API thành công. Tách riêng xử lý mẫu `JOB-1020` khỏi luồng Order thật.
4. Lấy lý do làm lại từ mục cuối `order.statusHistory` khi đó là chuyển `awaiting_customer_confirmation → in_progress` và Order đang `in_progress`. Không giữ lý do trong state tạm; banner tự biến mất sau `completed`, `cancelled`, `disputed` hoặc một chuyển trạng thái khác.

## Kiểm thử và tiêu chí đạt

- Trong `worker-job-detail-screen.test.tsx`: phát event `disputed`, trả về Order `disputed`, sau đó phát event admin `disputed → in_progress` và cho `refetch` trả Order mới; không remount, banner tranh chấp biến mất và nút nộp bằng chứng xuất hiện.
- Test SSE/Tracking summary vẫn `disputed` nhưng Order API là `in_progress`: nút theo Order. Khi Order API chưa có dữ liệu, không hiện nút hành động. Test tiếp `cancelled` và `completed` xóa hành động thi công.
- Test mutation bị từ chối không hiển thị trạng thái thành công. Chạy typecheck, ESLint và suite màn hình thợ.
- Test Order API trả trạng thái cũ sau event: có đúng một lần refetch sau 2 giây; timer bị hủy khi màn hình đóng.
