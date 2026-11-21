# HG64-01 — Cache 7 ngày có thể giữ timeline/summary cũ khi vô hiệu hóa Redis thất bại (P1)

**Trạng thái:** Đã triển khai và kiểm thử trên nhánh HG-64 ngày 10/11/2026.

**Bằng chứng.** `TrackingEventsService.recordDomainEvent()` commit `consumedEvent`, `trackingFlow`, `trackingEvent` trước, sau đó mới gọi `redis.delByPattern('tracking:*:<serviceRequestId>:*')` (`backend/apps/tracking-service/src/events/tracking-events.service.ts`, khoảng dòng 203–296). `RedisService.delByPattern()` trả về ngay nếu mất kết nối và nuốt lỗi sau khi log (`backend/libs/redis/src/redis.service.ts`, dòng 92–112). `TimelineService` và `SummaryService` đọc cache **trước** khi đọc lại flow, rồi lưu cache terminal flow với TTL 604800 giây (`timeline.service.ts`, dòng 20, 38–44, 143–148; `summary.service.ts`, dòng 24, 41–49, 392–402).

**Tình huống.** Summary của order `completed` được cache; một sự kiện thanh toán mới được ghi trong lúc thao tác xóa cache thất bại. Khi Redis phục hồi, cache cũ vẫn tồn tại và endpoint có thể trả tình trạng thanh toán/timeline cũ trong tối đa 7 ngày. Lần phát lại RabbitMQ không chắc sửa được: event đã nằm trong `consumedEvent`, nên nhánh idempotency trả về trước khi xóa cache.

**Hướng giải quyết đã chọn: cache theo `trackingFlow.eventSequence`.** Trong `TimelineService.getRequestTimeline()` và `SummaryService.getRequestSummary()`, đọc `trackingFlow` trước khi tra cache, lấy `eventSequence`, rồi thêm `:v<eventSequence>` vào cuối cache key theo vai trò hiện có. Khi một event mới commit, `eventSequence` tăng cùng giao dịch ghi timeline; request tiếp theo sẽ dùng key mới. Cache key cũ tự hết hạn sau 7 ngày. Không dùng `delByPattern()` làm điều kiện bảo đảm tính đúng của hai endpoint này. Giữ nguyên kiểm tra quyền truy cập trước khi trả cache; khi cache hit vẫn phải xác nhận người dùng còn quyền với flow. Thêm test mô phỏng Redis lỗi đúng lúc event mới commit và xác nhận request kế tiếp trả dữ liệu mới.

**Tiêu chí hoàn thành.** Request bắt đầu sau khi event mới commit đọc `eventSequence` mới và không truy cập cache key của version cũ, kể cả khi Redis không xóa được key cũ. Quyền truy cập được kiểm tra trước khi đọc cache. Request đang chạy đồng thời với giao dịch ghi event có thể đọc snapshot tại thời điểm truy vấn flow.

## Checklist thực hiện

- [x] Đọc `trackingFlow.eventSequence` trước khi tra cache và thêm version vào key timeline/summary.
- [x] Kiểm tra quyền trước khi trả cached response của từng vai trò.
- [x] Viết test: cache terminal flow → Redis không xóa được key → ghi payment event → GET dùng version mới.

**Kết quả xác minh.** `pnpm run typecheck` thành công. `pnpm exec vitest run apps/tracking-service --silent`: 9 file pass, 3 file skip vì thiếu dependency thật; 86 test pass, 8 test skip. Test mới kiểm tra cache version cũ vẫn còn, payment event làm tăng version và summary/timeline đọc version mới; test quyền kiểm tra người dùng không được phép không thể lấy cached response.

> Rà soát ngày 10/11/2026 trên nhánh `feature/HG-64-integrate-tracking-service-into-order-service` (`0655a59`). Đây là kết luận từ mã nguồn; cần xác minh lại sau khi sửa và trên môi trường triển khai.
