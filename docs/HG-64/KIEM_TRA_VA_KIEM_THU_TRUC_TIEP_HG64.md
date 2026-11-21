# HG-64 — Rà soát hoàn thành và hướng dẫn kiểm thử trực tiếp trên máy

**Ngày rà soát:** 11/11/2026

**Nhánh:** `feature/HG-64-integrate-tracking-service-into-order-service`
**Phạm vi:** sáu việc [HG64-01](./HG64-01_CACHE_REDIS.md) đến [HG64-06](./HG64-06_DONG_BO_CONTRACT_VA_TAI_LIEU.md). Các lệnh bên dưới dành cho PowerShell trên Windows, chạy từ checkout hiện tại. Chỉ dùng database, broker và Redis thử nghiệm; không trỏ biến môi trường vào production.

## 1. Kết luận rà soát

**HG-64 chưa hoàn tất nghiệm thu toàn bộ.** Mã nguồn và test cục bộ của 01, 03, 06 đã có; 02 và 04 có phần triển khai nhưng còn thiếu bằng chứng hoặc bước vận hành nêu dưới đây; 05 chưa có kết quả chạy suite Compose và CI Gate xanh. Không dùng số phần trăm trong các báo cáo lịch sử để kết luận phát hành.

| Task | Trạng thái kiểm chứng | Bằng chứng hiện có | Điều kiện còn thiếu |
| --- | --- | --- | --- |
| HG64-01 | Đạt ở mức mã nguồn và unit test | `eventSequence` được đọc trước cache và gắn vào key; kiểm tra quyền trước cache. Test mô phỏng key cũ còn sau khi xóa Redis thất bại. | Chưa chạy kịch bản lỗi Redis trên stack thật. |
| HG64-02 | Đã triển khai, chưa nghiệm thu toàn chuỗi | Handler `SERVICE_REQUEST_BIDDING_CLOSED`, summary `BIDDING_CLOSED`, DTO/mobile và test scheduler/consumer/summary có trong repo. `compose-runtime.spec.ts` thử broker → Tracking khi được bật. | Chưa chạy test Compose trên máy này. Chưa có test tự động chứng minh **scheduler thật** phát event qua broker tới Tracking trong một luồng duy nhất. |
| HG64-03 | Đạt ở mức mã nguồn và unit/contract test | Confirm/start/finish chỉ phát `order.status.changed`; Tracking và mobile nhận `AWAITING_CONFIRMATION`; Notification có test event. | Chưa chạy luồng API → outbox → broker → Gateway SSE với dịch vụ thật. |
| HG64-04 | Đã triển khai, còn bước vận hành | Migration `rejected_tracking_events`, upsert trước ACK, replay CLI, test quarantine/redelivery và log `[REJECTED_TRACKING_EVENTS_ALERT]`. | Test PostgreSQL thật chưa chạy ở lần rà soát này; chưa thấy cấu hình chuyển log cảnh báo vào hệ thống alert vận hành. |
| HG64-05 | **Chưa hoàn thành tiêu chí nghiệm thu** | Compose, suite `order-to-tracking.compose.spec.ts` và job `tracking-integration`/`CI Gate` đã được khai báo; config và TypeScript của suite hợp lệ. | Docker daemon máy rà soát không chạy; nhánh chưa có PR nên chưa có pipeline PR xanh. |
| HG64-06 | Đạt ở mức mã nguồn và tài liệu | `EVENT_PATTERNS`, ba payload type chung, contract test và link tương đối trong `docs/HG-64/`. README/báo cáo đã phân biệt test cục bộ với nghiệm thu thật. | Kết luận production vẫn phụ thuộc HG64-05. |

### Bằng chứng đã chạy ở lần rà soát này

- `backend`: `pnpm run typecheck` pass; nhóm test Tracking/Order/contract: **12 files pass, 4 files skip; 158 tests pass, 13 tests skip**. Bốn files skip là nhóm cần biến môi trường và dịch vụ thật, nên không tính là E2E pass.
- `backend`: `apps/notification-service/src/events/events.spec.ts`: **55 tests pass**. `tsc` cho suite HG64, `docker compose config --quiet` và Prisma Tracking schema validation pass.
- `mobile`: `pnpm run type-check` pass; 7 suite Tracking/Order UI: **72 tests pass** với `--forceExit`. Jest báo còn async handle sau test; cần điều tra riêng nếu bỏ `--forceExit`.
- `docker info` không kết nối được Docker Desktop Linux Engine. `gh pr status` xác nhận nhánh hiện không có PR. Vì vậy không có bằng chứng local Compose hoặc GitHub Actions cho commit hiện tại.

## 2. Chuẩn bị chung

1. Mở PowerShell tại root `D:\SCHOOL\PBL6`. Cần Node 24, pnpm 10.17.1 cho backend, pnpm 10.12.3/Node 20 cho mobile, Docker Desktop Linux containers và Docker Compose v2 cho phần tích hợp. Kiểm tra:

   ```powershell
   node --version
   pnpm --version
   docker version
   docker compose version
   docker info --format '{{.ServerVersion}}'
   ```

   `docker info` phải trả phiên bản server. Nếu lỗi kết nối daemon, dừng các bước có Compose và ghi **chưa chạy**, không coi Vitest skip là pass.

2. Chuẩn bị dependency và Prisma Client. Đứng trong `backend` cho tất cả lệnh ở mục 3–8, trừ khi có ghi khác:

   ```powershell
   Set-Location D:\SCHOOL\PBL6\backend
   pnpm install --frozen-lockfile
   pnpm run prisma:generate:order
   pnpm run prisma:generate:tracking
   pnpm run typecheck
   ```

3. Khi cần stack thật, tạo **key chỉ dùng cho test** trong `backend/keys` nếu chưa có cặp key. Đoạn này không sửa `.env` hoặc `.env.example`:

   ```powershell
   if (-not ((Test-Path .\keys\jwt-private.pem) -and (Test-Path .\keys\jwt-public.pem))) {
     node -e "const fs=require('node:fs'),c=require('node:crypto');fs.mkdirSync('keys',{recursive:true});const k=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});fs.writeFileSync('keys/jwt-private.pem',k.privateKey);fs.writeFileSync('keys/jwt-public.pem',k.publicKey)"
   }
   docker compose -f docker-compose.hg64-test.yml config --quiet
   docker compose -f docker-compose.hg64-test.yml up --build --wait -d
   docker compose -f docker-compose.hg64-test.yml ps
   ```

   `up` phải thoát mã 0; PostgreSQL, RabbitMQ, Redis, Order, Tracking, Gateway healthy và `migrate` completed. Nếu `up` lỗi, xem `docker compose -f docker-compose.hg64-test.yml logs --tail 100 migrate order-service tracking-service api-gateway` trước khi chạy test. Các cổng host của stack: Gateway 3300, Order 3304, Tracking 3310, PostgreSQL 55440, RabbitMQ 5673, Redis 6380. Không chạy song song với stack khác dùng cùng cổng.

4. Gán biến test cho các suite cần dịch vụ thật trong **cùng cửa sổ PowerShell**:

   ```powershell
   $env:TRACKING_TEST_DATABASE_URL = 'postgresql://hg64:hg64_local_test@127.0.0.1:55440/hg64?schema=tracking_service'
   $env:TRACKING_TEST_RABBITMQ_URL = 'amqp://hg64:hg64_local_test@127.0.0.1:5673'
   $env:TRACKING_TEST_REDIS_URL = 'redis://127.0.0.1:6380'
   $env:TRACKING_TEST_SERVICE_URL = 'http://127.0.0.1:3310'
   $env:TRACKING_TEST_INTERNAL_SECRET = 'hg64-integration-only-secret'
   ```

   **Không đặt các biến này khi chỉ chạy unit test:** chúng kích hoạt các suite thật và khiến skip biến thành test chạy.

## 3. HG64-01 — Cache version và quyền truy cập

**Chạy cục bộ:**

```powershell
pnpm exec vitest run apps/tracking-service/src/timeline/timeline.service.spec.ts apps/tracking-service/src/summary/summary.service.spec.ts apps/tracking-service/src/events/tracking-events.service.spec.ts --silent
```

**Kiểm tra pass:** tất cả test pass; đặc biệt test `uses a new cache version after ... old cache survives` trong timeline/summary và `checks ownership before returning a cached ...`. Trường hợp cần thấy là key `:v<eventSequence>` cũ vẫn tồn tại nhưng request sau event mới đọc key version mới; người không có quyền nhận 403 ngay cả khi có cached response.

**Kiểm tra thêm trên stack thật:** chạy mục 7 để tạo flow và payment event; suite đó đọc summary trước/sau payment. Sau đó đối chiếu version trong PostgreSQL với các key Redis:

```powershell
docker compose -f docker-compose.hg64-test.yml exec -T postgres psql -U hg64 -d hg64 -c "SELECT service_request_id, event_sequence FROM tracking_service.tracking_flows ORDER BY updated_at DESC LIMIT 5;"
docker compose -f docker-compose.hg64-test.yml exec -T redis redis-cli --scan --pattern 'tracking:*:v*'
```

Mỗi event mới phải tăng `event_sequence`; không dùng số key cũ còn lại làm dấu hiệu thất bại vì key đó được giữ đến hết TTL. Việc Redis xóa key thất bại đúng lúc commit hiện chỉ được mô phỏng ở unit test; chưa có test tự động trên stack thật.

## 4. HG64-02 — Đóng nhận báo giá

**Chạy cục bộ:**

```powershell
pnpm exec vitest run apps/order-service/src/service-requests/workers/order-deadline-scheduler.service.spec.ts apps/tracking-service/src/events/tracking-events.consumer.spec.ts apps/tracking-service/src/events/tracking-events.service.spec.ts apps/tracking-service/src/summary/summary.service.spec.ts --silent
```

**Chạy với stack thật sau mục 2:**

```powershell
pnpm exec vitest run apps/tracking-service/test/compose-runtime.spec.ts --silent
```

**Kiểm tra pass:** suite không được báo `skipped`; case `records the Order bidding-close event once and reports closure without a round-close event` pass. Nó publish `service_request.bidding_closed` hai lần cùng `eventId`, xác nhận timeline có đúng một bản, summary trả `serviceRequest.status=bidding_closed`, `biddingClosedAt`, `currentPhase=BIDDING_CLOSED`, trong khi vòng đấu giá vẫn `open`. Test scheduler riêng xác nhận payload producer. **Giới hạn:** suite Compose publish trực tiếp lên broker, chưa kích hoạt scheduler thật; muốn đóng task theo tiêu chí end-to-end cần thêm và chạy test scheduler → broker → Tracking.

**Mobile:** từ `backend/`, chạy lệnh sau; test phase `BIDDING_CLOSED` phải pass:

```powershell
Push-Location ..\mobile
pnpm exec jest --runInBand --silent --forceExit src/features/tracking/__tests__/tracking.test.ts
Pop-Location
```

## 5. HG64-03 — Một contract cho chuyển trạng thái Order

**Chạy cục bộ:**

```powershell
pnpm exec vitest run apps/order-service/src/orders/orders.service.spec.ts apps/tracking-service/src/summary/summary.service.spec.ts apps/notification-service/src/events/events.spec.ts --silent
```

**Kiểm tra pass:** ba transition `created → confirmed`, `confirmed → in_progress`, `in_progress → awaiting_customer_confirmation` mỗi transition ghi đúng một `order.status.changed`; test không tìm thấy `order.confirmed`, `order.started`, `order.finished`. Tracking summary trả `AWAITING_CONFIRMATION` và `finishedAt`; Notification vẫn nhận `order.status.changed`.

**Mobile:** từ `backend/`, chạy lệnh sau; màn hình chờ khách nghiệm thu phải pass. Suite live API/outbox/broker/SSE ở HG64-05 là bước xác nhận cuối cho task này.

```powershell
Push-Location ..\mobile
pnpm exec jest --runInBand --silent --forceExit src/features/tracking/__tests__/order-tracking-timeline.test.tsx src/features/orders/worker/__tests__/worker-job-detail-screen.test.tsx src/features/orders/customer/__tests__/customer-order-detail-tracking.test.tsx
Pop-Location
```

## 6. HG64-04 — Quarantine, ACK và replay

**Chạy cục bộ:**

```powershell
pnpm exec prisma validate --schema=apps/tracking-service/prisma/schema.prisma --config=apps/tracking-service/prisma/prisma.config.ts
pnpm exec vitest run apps/tracking-service/src/events/tracking-events.service.spec.ts apps/tracking-service/src/events/tracking-events.consumer.spec.ts apps/tracking-service/src/events/tracking-reconciliation.scheduler.spec.ts --silent
```

**Chạy PostgreSQL thật sau mục 2 và biến môi trường ở mục 2.4:**

```powershell
pnpm exec vitest run apps/tracking-service/test/pending-inbox.postgres.spec.ts --silent
```

**Kiểm tra pass:** suite không `skipped`; event không có `serviceRequestId`/`orderId` được lưu một lần trong `rejected_tracking_events`, redelivery không tạo bản trùng, envelope không chứa secret; replay sau khi bổ sung mapping tạo một timeline event và đặt `resolved_at`; lỗi lưu DB dẫn đến NACK/requeue trong consumer test.

**Thử CLI bằng bản lỗi thật trên stack thử nghiệm:** publish một event không thể ánh xạ rồi tra bản ghi. Chỉ dùng ID mới tạo; không dùng dữ liệu người dùng thật.

```powershell
$badEventId = [guid]::NewGuid().ToString()
$env:HG64_BAD_EVENT_ID = $badEventId
@'
import amqp from 'amqplib';
const connection = await amqp.connect('amqp://hg64:hg64_local_test@127.0.0.1:5673');
const channel = await connection.createConfirmChannel();
const data = { eventId: process.env.HG64_BAD_EVENT_ID, eventType: 'order.status.changed', payload: { nextStatus: 'confirmed' } };
channel.publish('handy-go.events', 'order.status.changed', Buffer.from(JSON.stringify({ pattern: 'order.status.changed', data })), { persistent: true });
await channel.waitForConfirms();
await channel.close();
await connection.close();
'@ | node --input-type=module
$count = ''
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $count = docker compose -f docker-compose.hg64-test.yml exec -T postgres psql -U hg64 -d hg64 -tAc "SELECT count(*) FROM tracking_service.rejected_tracking_events WHERE event_id = '$badEventId';"
  if ($count.Trim() -eq '1') { break }
  Start-Sleep -Seconds 1
}
if ($count.Trim() -ne '1') { throw 'Tracking không lưu rejected event trong 30 giây' }
docker compose -f docker-compose.hg64-test.yml exec -T postgres psql -U hg64 -d hg64 -c "SELECT event_id, reason, resolved_at FROM tracking_service.rejected_tracking_events WHERE event_id = '$badEventId';"
$env:DATABASE_URL_TRACKING = $env:TRACKING_TEST_DATABASE_URL
pnpm tracking:replay-rejected -- --event-id $badEventId
$requestId = [guid]::NewGuid().ToString()
pnpm tracking:replay-rejected -- --event-id $badEventId --service-request-id $requestId --apply
docker compose -f docker-compose.hg64-test.yml exec -T postgres psql -U hg64 -d hg64 -c "SELECT event_id, resolved_at FROM tracking_service.rejected_tracking_events WHERE event_id = '$badEventId';"
```

**Kiểm tra pass:** câu SQL đầu trả một hàng `resolved_at` rỗng; dry-run không in envelope; `--apply` báo `recorded: true`; SQL cuối có `resolved_at`. Để kiểm tra alert, tạm dừng **trước lệnh replay** ít nhất 60 giây rồi chạy `docker compose -f docker-compose.hg64-test.yml logs --since 2m tracking-service | Select-String 'REJECTED_TRACKING_EVENTS_ALERT'`. Test này chưa chứng minh alert đã được chuyển tới hệ thống giám sát; cần cấu hình và kiểm tra đường chuyển log đó trước nghiệm thu vận hành.

## 7. HG64-05 — Luồng đầy đủ với dịch vụ thật

Sau khi stack ở mục 2 healthy, chạy từ `backend/`:

```powershell
$env:HG64_E2E_REQUIRED = '1'
$env:HG64_ORDER_DATABASE_URL = 'postgresql://hg64:hg64_local_test@127.0.0.1:55440/hg64?schema=order_service'
$env:HG64_TRACKING_DATABASE_URL = 'postgresql://hg64:hg64_local_test@127.0.0.1:55440/hg64?schema=tracking_service'
$env:HG64_ORDER_URL = 'http://127.0.0.1:3304'
$env:HG64_GATEWAY_URL = 'http://127.0.0.1:3300'
$env:HG64_RABBITMQ_URL = 'amqp://hg64:hg64_local_test@127.0.0.1:5673'
$env:HG64_JWT_PRIVATE_KEY_PATH = 'keys/jwt-private.pem'
pnpm exec tsc --noEmit -p apps/tracking-service/test/tsconfig.hg64.json
pnpm exec vitest run apps/tracking-service/test/order-to-tracking.compose.spec.ts --silent
```

**Kiểm tra pass:** phải có **3 tests pass, 0 skip**: (1) Order API → outbox `published` → RabbitMQ → đúng một Tracking event cùng `eventId` → Gateway SSE → summary chờ nghiệm thu/completed/payment; (2) rework, dispute, cancel; (3) event đến sai thứ tự được giữ trong pending inbox và flush đúng một lần. Nếu thiếu biến, suite phải fail; `skipped` không được tính là pass.

**CI:** sau khi có PR cho nhánh, xem job `HG64 Order to Tracking integration` và `CI Gate` trên đúng commit bằng `gh pr checks <PR_NUMBER>`. Cả hai phải `pass`; lưu URL run và SHA vào biên bản nghiệm thu. Tại lần rà soát này chưa có PR nên bước này chưa thể xác nhận.

## 8. HG64-06 — Contract chung và tài liệu

**Chạy cục bộ:**

```powershell
pnpm exec vitest run apps/order-service/test/order-tracking-contract.spec.ts apps/order-service/src/orders/orders.service.spec.ts apps/order-service/src/service-requests/workers/order-deadline-scheduler.service.spec.ts --silent
pnpm run typecheck
Set-Location ..
$fileScheme = 'file:' + ('/' * 3)
$links = rg -n $fileScheme docs/HG-64
if ($LASTEXITCODE -eq 1) { 'PASS: không còn link gắn máy cá nhân trong docs/HG-64' } else { $links; throw 'Còn link gắn máy cá nhân hoặc rg lỗi' }
```

**Kiểm tra pass:** contract test của `order.created`, `order.status.changed`, `service_request.bidding_closed` pass, publisher dùng cùng tên trong `EVENT_PATTERNS`, các test producer pass, TypeScript không lỗi và không còn link máy cá nhân. Đối chiếu [README HG-64](./README.md), [báo cáo](./BAO_CAO_KIEM_TRA_TICH_HOP_TRACKING_ORDER.md), `backend/README.md`, `backend/deploy/production/README.md`: tất cả phải ghi rõ E2E/CI còn chờ nếu chưa có bằng chứng xanh.

## 9. Kết thúc phiên kiểm thử

Ghi commit SHA (`git rev-parse HEAD`), thời gian, phiên bản Node/pnpm/Docker, các lệnh đã chạy, số pass/skip/fail, URL CI và lỗi nếu có. Sau khi lấy đủ log, dừng stack thử nghiệm:

```powershell
Set-Location D:\SCHOOL\PBL6\backend
docker compose -f docker-compose.hg64-test.yml down -v --remove-orphans
```

Lệnh `down -v` xóa dữ liệu trong volume của **stack HG64 thử nghiệm**. Chỉ chạy khi không cần giữ dữ liệu để điều tra lỗi. Nếu test fail, giữ stack, thu log và kết quả SQL trước khi dừng.
