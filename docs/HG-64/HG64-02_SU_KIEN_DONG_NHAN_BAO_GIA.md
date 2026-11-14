# HG64-02 — Tracking chưa nhận mốc đóng nhận báo giá từ Order (P2)

**Trạng thái:** Đã triển khai và kiểm thử phần code ngày 10/11/2026. Test Compose đã được thêm; lần chạy với dịch vụ thật thuộc HG64-05 vì máy hiện không có Docker daemon.

**Bằng chứng.** `OrderDeadlineSchedulerService` phát `service_request.bidding_closed` khi đóng nhận báo giá (`backend/apps/order-service/src/service-requests/workers/order-deadline-scheduler.service.ts`, dòng 110–127). Pattern có trong `backend/libs/common/src/events/event-patterns.ts` (dòng 48), nhưng `TrackingEventsConsumer` không có `@EventPattern(SERVICE_REQUEST_BIDDING_CLOSED)` (`backend/apps/tracking-service/src/events/tracking-events.consumer.ts`). `SummaryService` chỉ đặt bidding milestone thành `closed` khi thấy `bidding.round.closed` (`summary.service.ts`, dòng 140–163). Hai sự kiện nói về hai trạng thái khác nhau, không nên mặc định một sự kiện luôn thay thế sự kiện kia.

**Ảnh hưởng.** Timeline không ghi nhận mốc Order Service đóng nhận báo giá; nếu không có `bidding.round.closed` tương ứng, summary có thể tiếp tục báo bidding đang mở. Báo cáo cũ tại `docs/HG-64/BAO_CAO_KIEM_TRA_TICH_HOP_TRACKING_ORDER.md` còn đánh dấu sự kiện này đã được Tracking nhận (khoảng dòng 101), trái với code.

**Hướng giải quyết đã chọn: ghi mốc đóng nhận báo giá vào Service Request.** Thêm `@EventPattern(EVENT_PATTERNS.SERVICE_REQUEST_BIDDING_CLOSED)` trong `TrackingEventsConsumer` và chuyển event vào `recordDomainEvent()`. Trong `SummaryService`, khi gặp event này, đặt `serviceRequest.status = 'bidding_closed'`, lưu `biddingClosedAt` trong DTO, và thêm phase `BIDDING_CLOSED` vào `computeCurrentPhase()`. Giữ `bidding.round.closed` chỉ cho milestone vòng đấu giá; không dùng nó để suy ra thời điểm Order Service ngừng nhận báo giá. Cập nhật kiểu dữ liệu mobile để hiển thị phase mới. Test scheduler → RabbitMQ → timeline/summary với một request không có `bidding.round.closed`.

**Tiêu chí hoàn thành.** Event `service_request.bidding_closed` xuất hiện một lần trong timeline và trạng thái summary phản ánh đúng việc request đã ngừng nhận báo giá.

## Checklist thực hiện

- [x] Thêm handler `SERVICE_REQUEST_BIDDING_CLOSED` và test idempotency.
- [x] Thêm `bidding_closed`, `biddingClosedAt`, `BIDDING_CLOSED` vào summary/DTO/mobile.
- [x] Kiểm thử payload scheduler, consumer, timeline/summary khi không có round-closed event; thêm test Compose cho broker thật.

**Kết quả xác minh.** Backend typecheck và mobile typecheck pass. Bộ test backend liên quan: 10 file pass, 3 file skip; 97 test pass, 9 test skip. Hai suite mobile liên quan: 13 test pass. Test Compose mới nằm trong nhóm skip do thiếu `TRACKING_TEST_*` và Docker daemon; cần chạy trong job tích hợp HG64-05 trước nghiệm thu production.

> Rà soát ngày 10/11/2026 trên nhánh `feature/HG-64-integrate-tracking-service-into-order-service` (`0655a59`). Đây là kết luận từ mã nguồn; cần xác minh lại sau khi sửa và trên môi trường triển khai.
