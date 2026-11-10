# HG64-04 — Quarantine payload không ánh xạ được

## Lỗi đã xác nhận

Trước khi sửa, `TrackingEventsService.recordDomainEvent()` trả `INVALID_PAYLOAD_UNRESOLVABLE_FLOW` khi không tìm thấy `serviceRequestId` lẫn `orderId`. Consumer ACK RabbitMQ sau khi ghi log, khiến Tracking không có bản ghi để tra cứu và replay.

## Hướng giải quyết cụ thể

1. Áp dụng migration `20261110000000_rejected_tracking_events` trước khi chạy consumer mới. Bảng `tracking_service.rejected_tracking_events` lưu `event_id` duy nhất, `event_type`, `envelope`, `reason`, `received_at`, `resolved_at`; index hỗ trợ đếm và tìm bản chưa xử lý.
2. Khi thiếu cả hai ID, scrub token, secret, password, cookie và credential trong mọi tầng của envelope; giới hạn độ sâu, số key, độ dài chuỗi và tổng JSON còn 64 KiB. Upsert theo `eventId` trước khi trả kết quả quarantine. Nếu PostgreSQL không lưu được, consumer NACK với `requeue=true`; chỉ ACK sau khi upsert thành công.
3. Event có `orderId` hợp lệ nhưng Order flow chưa tới vẫn vào `pending_tracking_events` như hiện tại; không đưa vào quarantine.
4. Chạy reconciliation mỗi 15 giây để đếm bản chưa xử lý; log `[REJECTED_TRACKING_EVENTS_ALERT]` tối đa một lần mỗi phút khi count lớn hơn 0. Đưa log này vào hệ thống cảnh báo vận hành.
5. Sau khi sửa mapping, tra bản lỗi bằng `eventId`, chạy lệnh replay; lệnh gọi lại `recordDomainEvent()` và đánh dấu `resolvedAt` sau khi timeline ghi thành công. Bản gửi lại cùng `eventId` không tạo mốc trùng. Bản envelope bị cắt ngắn không được replay vì dữ liệu không còn đầy đủ; khôi phục payload từ outbox của producer rồi publish lại. Bản vượt 64 KiB chỉ giữ ID và loại event.

## Lệnh vận hành

Tại thư mục `backend/`, đặt `DATABASE_URL_TRACKING` trỏ tới database Tracking đã chạy migration và Prisma Client đã generate. Xem thông tin bản lỗi trước khi replay:

```powershell
pnpm tracking:replay-rejected -- --event-id <event-id>
```

Sau khi xác định đúng `serviceRequestId`, ghi timeline:

```powershell
pnpm tracking:replay-rejected -- --event-id <event-id> --service-request-id <uuid> --apply
```

Nếu mapping trong code mới tự tìm được ID, bỏ `--service-request-id` khi chạy `--apply`. Lệnh trả mã lỗi khi bản tin vẫn không ánh xạ được, giữ `resolvedAt` rỗng để điều tra tiếp. Không ghi envelope ra stdout.

## Tiêu chí nghiệm thu

- [x] Có schema và migration cho quarantine bền vững.
- [x] ACK chỉ sau upsert; lỗi PostgreSQL NACK với requeue.
- [x] Có lệnh replay, idempotency, cảnh báo số bản chưa xử lý và test cho payload lỗi, duplicate delivery, Order event đến sớm.
- [x] Prisma schema validate, backend typecheck, build Tracking Service và unit test Tracking đạt.

Test PostgreSQL `pending-inbox.postgres.spec.ts` đã được bổ sung để chạy với `TRACKING_TEST_DATABASE_URL` trên database kiểm thử đã áp dụng migration. Môi trường hiện tại không có Docker daemon và PostgreSQL cục bộ nên chưa thể chạy test này. Khi triển khai, áp dụng migration trước khi khởi động consumer mới.

Việc phát hiện lỗi trên môi trường triển khai cần kiểm tra cảnh báo và thử replay sau deploy.
