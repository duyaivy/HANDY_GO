# HG64-06 — Contract sự kiện và tài liệu đang lệch (P3)

**Bằng chứng ban đầu.** Tên Order event được định nghĩa riêng ở `backend/apps/order-service/src/common/constants/order.constants.ts` và `backend/libs/common/src/events/event-patterns.ts`; các tên chung khớp nhưng không có một nguồn duy nhất. `docs/HG-64/README.md` và báo cáo cũ ghi “COMPLETED 100%/PRODUCTION READY” khi chưa có kết quả kiểm thử môi trường thật ở lần rà soát. `backend/README.md` và `backend/deploy/production/README.md` mô tả Tracking là scaffold/chưa realtime. Handler `service_request.bidding_closed` đã được bổ sung trong HG64-02.

**Hướng giải quyết đã chọn: `@app/common` là nguồn contract sự kiện duy nhất.** Trong Order Service, thay giá trị `EVENT_*` lặp lại ở `order.constants.ts` bằng `EVENT_PATTERNS` từ `@app/common`; thêm các kiểu payload cho `order.created`, `order.status.changed`, `service_request.bidding_closed` trong `backend/libs/common/src/events/` và dùng chúng tại publisher/consumer. Thêm test contract kiểm tra ba payload này. Sửa `docs/HG-64/README.md`, báo cáo nghiệm thu, `backend/README.md` và `backend/deploy/production/README.md` theo bằng chứng kiểm thử hiện có. Đổi toàn bộ link gắn với ổ đĩa cá nhân trong `docs/HG-64/` thành link tương đối.

**Tiêu chí hoàn thành.** Publisher và consumer dùng cùng contract đã kiểm thử; README, báo cáo và tài liệu triển khai mô tả chính xác bằng chứng hiện có và phần nghiệm thu còn thiếu; link nội bộ dùng đường dẫn tương đối.

## Checklist thực hiện

- [x] Chuyển Order Service sang `EVENT_PATTERNS` và payload types trong `@app/common`.
- [x] Thêm contract tests cho `order.created`, `order.status.changed`, `service_request.bidding_closed`.
- [x] Cập nhật bốn tài liệu trạng thái/triển khai và sửa link máy cá nhân trong `docs/HG-64/`.

## Kết quả thực hiện ngày 11/11/2026

- `order.constants.ts` tham chiếu tên event từ `EVENT_PATTERNS`; ba payload có interface chung được dùng khi ghi outbox và tại consumer Tracking.
- `pnpm run typecheck` pass. Bốn test files liên quan pass: 86 tests, gồm contract test ba event.
- Tài liệu ghi rõ pipeline PR và suite Compose với RabbitMQ/PostgreSQL/Redis chưa có bằng chứng chạy thành công. Phần nghiệm thu môi trường thật tiếp tục theo [HG64-05](./HG64-05_KIEM_THU_XUYEN_SUOT.md); không xác nhận production readiness ở thời điểm này.

> Rà soát ngày 10/11/2026 trên nhánh `feature/HG-64-integrate-tracking-service-into-order-service` (`0655a59`). Đây là kết luận từ mã nguồn; cần xác minh lại sau khi sửa và trên môi trường triển khai.
