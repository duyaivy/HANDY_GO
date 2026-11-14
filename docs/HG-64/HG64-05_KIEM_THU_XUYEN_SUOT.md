# HG64-05 — Kiểm thử xuyên suốt Order → Tracking

## Lỗi đã xác nhận

Các test trước HG64-05 mock publisher của Order Service; nhóm test Compose publish trực tiếp lên RabbitMQ. Chưa có test tạo Order bằng API rồi theo cùng `eventId` từ outbox đến Tracking qua broker và Gateway.

## Hướng giải quyết cụ thể

1. Dùng `docker-compose.hg64-test.yml` để khởi động PostgreSQL, RabbitMQ, Redis, Order Service, Tracking Service và API Gateway. Service `migrate` áp dụng migration Order và Tracking trước khi hai consumer khởi động; mọi service đều có healthcheck. `Dockerfile.hg64-test` build ba service từ cùng commit.
2. Suite `order-to-tracking.compose.spec.ts` tạo Service Request, publish, tạo Proposal và cho worker accept qua Order API. Sau mỗi thao tác confirm/start/finish, suite lấy `eventId` từ Order outbox, chờ `status=published`, kiểm tra đúng một Tracking event có cùng ID và đúng `fromStatus`/`toStatus`.
3. Kết nối SSE qua API Gateway bằng JWT kiểm thử, kiểm tra event xác nhận xuất hiện với đúng timeline ID. Đọc Summary qua Gateway ở trạng thái chờ nghiệm thu và completed. Sau completed, publish payment event và kiểm tra Summary payment.
4. Các ca riêng thực hiện rework, dispute, cancel qua Order API; broker redelivery cùng `eventId`; status event đến trước `order.created` qua RabbitMQ và pending inbox.
5. Job `tracking-integration` trong `.github/workflows/pr-ci.yml` chạy stack với `docker compose up --build --wait`, chạy suite với `HG64_E2E_REQUIRED=1`, rồi chạy test mobile SSE parser/timeline. CI Gate yêu cầu job thành công khi backend thay đổi. Thiếu biến môi trường làm suite fail ngay lúc import.

## Chạy trên máy có Docker

Từ `backend/`, chạy toàn bộ lệnh sau trên Bash:

```bash
pnpm install --frozen-lockfile
pnpm run prisma:generate:order
pnpm run prisma:generate:tracking
mkdir -p keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/jwt-private.pem
openssl pkey -in keys/jwt-private.pem -pubout -out keys/jwt-public.pem
docker compose -f docker-compose.hg64-test.yml up --build --wait -d
HG64_E2E_REQUIRED=1 HG64_ORDER_DATABASE_URL='postgresql://hg64:hg64_local_test@127.0.0.1:55440/hg64?schema=order_service' HG64_TRACKING_DATABASE_URL='postgresql://hg64:hg64_local_test@127.0.0.1:55440/hg64?schema=tracking_service' HG64_ORDER_URL='http://127.0.0.1:3304' HG64_GATEWAY_URL='http://127.0.0.1:3300' HG64_RABBITMQ_URL='amqp://hg64:hg64_local_test@127.0.0.1:5673' HG64_JWT_PRIVATE_KEY_PATH='keys/jwt-private.pem' pnpm exec vitest run apps/tracking-service/test/order-to-tracking.compose.spec.ts
docker compose -f docker-compose.hg64-test.yml down -v --remove-orphans
```

Pipeline PR thực hiện đủ các bước trên và là nơi xác nhận kết quả chạy thật. Môi trường làm việc hiện tại không có Docker daemon, vì vậy chưa có kết quả xanh của suite Compose. Lệnh `docker compose config --quiet`, kiểm tra TypeScript của suite và phép thử fail khi thiếu biến đã đạt; chúng không thay thế kết quả pipeline.

## Tiêu chí nghiệm thu

- [x] Compose có migration, healthcheck và dependency thật.
- [x] Suite nối Order API với outbox, Tracking DB, Summary và Gateway SSE; có ca phục hồi.
- [x] CI bắt buộc chạy suite, không cho skip và đưa kết quả vào CI Gate.
- [ ] Pipeline PR chạy xanh với dependency thật. Chỉ đánh dấu sau khi có kết quả GitHub Actions của commit này.
