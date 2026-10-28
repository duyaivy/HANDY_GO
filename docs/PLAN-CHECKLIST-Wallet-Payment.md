# Plan & Checklist: hoàn thiện Wallet → Payment (HandyGo)

Nguồn: [Wallet-truoc-Payment-dinh-huong-trien-khai.md](./Wallet-truoc-Payment-dinh-huong-trien-khai.md) và [PR-27-wallet-rereview3-2026-10-26.md](./PR-27-wallet-rereview3-2026-10-26.md).
Trạng thái thực tế (từ review): code Wallet đã sửa trong working tree, unit test PASS (75 tests) nhưng **chưa có integration test PostgreSQL/RabbitMQ**; `payment-service` mới chỉ là skeleton (controller/service/health, chưa có Prisma, chưa có logic).

## Trả lời nhanh

**Payment-service làm trước hay sau?** → **SAU**. Lý do:

- Wallet là nguồn sự thật của ledger/hold; Payment chỉ gọi Wallet qua contract. Làm Payment trước sẽ phải đoán contract.
- Wallet còn thiếu bằng chứng integration (concurrency, DLQ, claim/cancel race). Cần xong để làm nền.
- Payment chưa có code, provider chưa chọn → dùng **mock Payment/provider** để test Wallet trước.
- Việc làm được ngay với Payment trong giai đoạn Wallet: **chốt contract** (endpoint claim/callback, event), không viết logic thật.
- Mốc chuyển sang Payment: hoàn thành Giai đoạn 0–5 bên dưới (đạt điều kiện nghiệm thu mục 5 của tài liệu định hướng).

## Hướng dẫn Docker để test (đã có Docker Desktop)

`backend/docker-compose.yml` hiện **không** có Postgres/RabbitMQ/Redis → tạo file riêng `backend/docker-compose.wallet-test.yml`:

```yaml
name: handygo-wallet-test
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: handygo_test
      POSTGRES_PASSWORD: handygo_test_pw
      POSTGRES_DB: handygo_wallet_test
    ports: ["55432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U handygo_test -d handygo_wallet_test"]
      interval: 3s
      retries: 20
    tmpfs: [/var/lib/postgresql/data] # dữ liệu mất khi down, đúng ý test
  rabbitmq-test:
    image: rabbitmq:3.13-management-alpine
    environment:
      RABBITMQ_DEFAULT_USER: handygo_test
      RABBITMQ_DEFAULT_PASS: handygo_test_pw
    ports: ["56672:5672", "56673:15672"]
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 5s
      retries: 20
  # redis-test: chỉ thêm nếu xác nhận Wallet cần Redis
  #   image: redis:7-alpine   ports: ["56379:6379"]
```

Env test (`backend/.env.wallet-test`, KHÔNG commit; thêm vào `.gitignore`):

```env
DATABASE_URL_WALLET=postgresql://handygo_test:handygo_test_pw@localhost:55432/handygo_wallet_test?schema=wallet_service
DATABASE_URL=postgresql://handygo_test:handygo_test_pw@localhost:55432/handygo_wallet_test
RABBITMQ_URL=amqp://handygo_test:handygo_test_pw@localhost:56672
RABBITMQ_EXCHANGE=handy-go.wallet-test.events
RABBITMQ_QUEUE_WALLET=wallet-service-test
INTERNAL_SERVICE_SECRET=test-internal-secret-at-least-32-characters-long
BANK_ACCOUNT_VERIFIER_URL=http://localhost:3002/<path đã xác minh>
```

Lệnh (PowerShell, trong `HANDY_GO\backend`):

```powershell
docker compose -f docker-compose.wallet-test.yml up -d --wait
# migrate wallet lên DB test (nạp env test trước, kiểm tra host=localhost:55432!)
Get-Content .env.wallet-test | ForEach-Object { if ($_ -match '^\s*([^#=]+)=(.*)$') { Set-Item "env:$($Matches[1].Trim())" $Matches[2] } }
pnpm run prisma:migrate:wallet
pnpm vitest run --config ./vitest.config.e2e.ts   # sau khi viết integration test
docker compose -f docker-compose.wallet-test.yml down -v
```

Link kiểm tra: RabbitMQ UI http://localhost:56673 (user/pass ở trên); Postgres: `docker exec -it <container> psql -U handygo_test -d handygo_wallet_test`.
Lưu ý: schema `wallet_service` cần được tạo/migrate bởi `migrate deploy`; nếu lỗi thiếu schema chạy `CREATE SCHEMA IF NOT EXISTS wallet_service;` trước.

---

## CHECKLIST

### Giai đoạn 0 — Chuẩn bị & chốt thông tin

- [x] Bật Docker Desktop, kiểm tra `docker info`
- [ ] Xác định nhánh/commit chứa bank verifier (review PR cũ không thấy); commit/push thay đổi working tree lên nhánh riêng
- [ ] Kiểm tra global prefix `api/v1` của user-trust-service: `.env.example` ghi `/internal/users/verify-bank-account` (không prefix) vs định hướng ghi `/api/v1/...` → test HTTP thật, sửa `BANK_ACCOUNT_VERIFIER_URL` đúng
- [ ] Xác nhận Wallet có cần Redis không (grep dependency runtime); ghi `not required` nếu không
- [ ] Hỏi chủ dự án: retention audit/DLQ, quyền replay DLQ, `needs_review` khi refund nguồn thiếu (không bù Platform)
- [ ] Kiểm tra PR #27 mergeable=false → rebase/merge base, xử lý conflict

### Giai đoạn 1 — Hạ tầng test

- [x] Tạo `backend/docker-compose.wallet-test.yml` (như trên)
- [x] Tạo `.env.wallet-test` (đã được .gitignore chặn sẵn; mẫu ở `scripts/wallet-test.env.template`)
- [x] Script/helper kiểm tra đích DB (host/db/schema phải là localhost:55432) trước migrate/reset
- [x] `. .\scripts\wallet-test-env.ps1 prisma:migrate:wallet` chạy sạch trên DB test (gồm 3 migration mới: audit_log, dead_letter_events, withdrawal_processing_status)
- [x] Sửa typecheck Wallet: `pnpm run typecheck:wallet` exit 0 (tsconfig.typecheck.json)
- [x] Cấu hình integration test Wallet (`vitest.config.integration.ts`) (setup/teardown, truncate giữa test)

### Giai đoạn 2 — Integration test Wallet trên PostgreSQL

- [ ] Raw SQL lock `"wallet_service"."wallets"` hoạt động trên DB sạch (F01)
- [ ] Double-spend: 2 transaction đồng thời không âm số dư
- [ ] Refund: 2 request 60/60 trên payment 100 → chỉ tổng ≤ 100 (F04)
- [ ] Refund: 100 lần hoàn 1 với split 80/20 → thu hồi đúng 80/20 (F13)
- [ ] Refund: retry toàn phần sau timeout; nguồn không đủ → `needs_review`; rollback giữa posting/outbox
- [ ] Replay refund bởi user khác → forbidden (R01); cùng key khác payload → conflict
- [ ] Withdrawal race: claim vs cancel đồng thời, chỉ một thắng (2 kết nối DB) (F06)
- [ ] Callback lặp idempotent; callback mâu thuẫn → `needs_review`; success sau cancel được ghi bằng chứng
- [ ] Adjustment ghi `wallet_audit_logs` cùng transaction (F14); rollback thì không còn audit
- [ ] Test serialize BigInt qua HTTP E2E (F10)

### Giai đoạn 3 — RabbitMQ: retry & DLQ

- [ ] Thay `nack(requeue=true)` bằng retry queue có TTL: 5s → 30s → 5m, tối đa 3 lần (cấu hình được; test dùng delay ngắn)
- [ ] Hết retry → DLQ; malformed/conflict → DLQ/quarantine kèm lý do (không mất bằng chứng)
- [ ] Idempotency theo business operation, không chỉ message ID
- [ ] Phân biệt rõ retry của outbox publisher và retry consumer (ghi docs)
- [ ] Integration test: transient fail → retry → thành công; quá số lần → DLQ; duplicate → ACK
- [ ] Quy trình replay DLQ có kiểm soát + audit (script/endpoint admin); không log secret/số TK đầy đủ

### Giai đoạn 4 — Bank verifier & identity

- [ ] Integration test thật Wallet → User Trust (HTTP, `x-internal-secret`)
- [ ] Case: owned đúng/sai, account không có, user inactive, secret sai, URL/prefix sai, timeout 3s, response sai format, không tạo hold khi chưa xác minh
- [ ] Ghi rõ hạn chế: `active` = user active, chưa phải trạng thái bank account
- [ ] Xác nhận actor adjustment lấy từ `x-user-id` do Gateway inject; Gateway xóa header client; test spoofing
- [ ] Chỉ admin có permission được adjust và đọc audit

### Giai đoạn 5 — Mock Payment & nghiệm thu Wallet

- [ ] Viết mock Payment/provider (claim HTTP, callback success/failed/duplicate/trễ/timeout/crash) — gắn nhãn mock
- [ ] Chốt & ghi API contract: event `wallet.withdrawal.requested`, endpoint claim, callback (`withdrawalId`, `payoutOperationId`)
- [ ] Feature flag tắt mặc định cho payout thật
- [ ] Chạy full: `pnpm lint`, `pnpm test`, integration, `pnpm typecheck`; ghi lỗi notification-service (firebase-admin) là blocker ngoài phạm vi nếu có sẵn từ trước
- [ ] Cập nhật PR description + báo cáo mục 6 của tài liệu định hướng (đã chạy/chưa chạy/giới hạn)
- [ ] Review lại, merge Wallet (kiểm tra CI + mergeable)

### Giai đoạn 6 — Payment service (SAU khi xong Wallet)

- [ ] Thiết kế: Prisma schema `payment_service` (payment, attempt, payout_operation, refund, webhook_event), migration, thêm script `prisma:*:payment` vào package.json
- [ ] Chọn provider (VNPAY/Payoo/khác — quyết định của chủ dự án); adapter + MockPayoutProvider
- [ ] Top-up: tạo payment, xác minh chữ ký callback/webhook, phát event nạp Point cho Wallet (idempotent)
- [ ] Thanh toán Point: orchestration gọi Wallet transfer customer → worker/platform, xử lý timeout/reconciliation
- [ ] Payout: nhận `wallet.withdrawal.requested`, lưu payout operation TRƯỚC khi dispatch, claim Wallet, gọi provider (idempotency), callback kết quả; unknown → manual review, không tự retry mù
- [ ] Refund: sở hữu lifecycle (`requested/completed/needs_review`), gọi Wallet refund
- [ ] Đối soát (reconciliation job) với provider
- [ ] Unit + integration test với Docker (thêm DB payment vào compose test), e2e Wallet ↔ Payment thật
- [ ] Thêm vào gateway/docker-compose chính, health check, docs

### Giai đoạn 7 — Hoàn tất

- [ ] E2E luồng: top-up → thanh toán → refund → withdrawal → payout (sandbox/mock)
- [ ] Cập nhật `docs/HUONG_DAN_BUILD_VA_CHAY.md` kèm hướng dẫn compose test
- [ ] Bản tổng kết: phần đã chứng minh vs chưa (không báo xanh nếu chưa chạy)

---

# KẾ HOẠCH CHI TIẾT GIAI ĐOẠN 1 — Hạ tầng test

Mục tiêu: chạy được Postgres + RabbitMQ test local bằng Docker, migrate Wallet sạch lên DB test, typecheck Wallet chạy được, và có khung vitest integration. **Chưa viết test nghiệp vụ** (Giai đoạn 2).

## Hiện trạng đã kiểm tra

- Docker Desktop **chưa chạy** (không kết nối được `dockerDesktopLinuxEngine`) → bước 1 bắt buộc.
- `.gitignore` đã chặn `.env.*` (trừ `.env.example`) → `.env.wallet-test` không bị commit; không cần sửa.
- `wallet-service/prisma/prisma.config.ts` đọc `DATABASE_URL_WALLET` ưu tiên, tự thêm `schema=wallet_service`; nạp `.env` từ cwd nếu có (biến đã set trong process vẫn ưu tiên vì `loadEnvFile` không ghi đè).
- Code Wallet **không dùng Redis** → ghi "Redis: not required", không thêm container.
- `vitest.config.e2e.ts` chỉ include `**/*.e2e-spec.ts`, đã alias `@app/*`; hiện chỉ có `apps/wallet-service/test/app.e2e-spec.ts`; env chỉ có `AUTH_SERVICE_URL`.
- `pnpm typecheck` = `tsc -p tsconfig.build.json` (lỗi TS6305 do project references chưa build; notification-service lỗi firebase-admin có sẵn; đã có script `typecheck:notification` riêng).

## Các bước

### 1.1 Bật Docker (5 phút)

- [ ] Mở Docker Desktop, chờ "Engine running"
- [ ] `docker info` và `docker compose version` chạy không lỗi
- [ ] Kiểm tra port 55432, 56672, 56673 trống: `Get-NetTCPConnection -LocalPort 55432,56672,56673 -ErrorAction SilentlyContinue` (rỗng = trống; nếu bận, đổi port trong compose + env)

### 1.2 Tạo `backend/docker-compose.wallet-test.yml`

- [ ] Nội dung theo plan mục "Hướng dẫn Docker" ở trên (postgres:16-alpine, rabbitmq:3.13-management-alpine, `name: handygo-wallet-test`, healthcheck, tmpfs cho Postgres)
- [ ] Không có volume bền, không dùng chung network/tên với `docker-compose.yml` chính
- [ ] Verify: `docker compose -f docker-compose.wallet-test.yml up -d --wait` → cả 2 service `healthy`; mở http://localhost:56673 đăng nhập được

### 1.3 Tạo `backend/.env.wallet-test` (đã được gitignore)

- [ ] Biến: `DATABASE_URL_WALLET`, `DATABASE_URL`, `RABBITMQ_URL`, `RABBITMQ_EXCHANGE=handy-go.wallet-test.events`, `RABBITMQ_QUEUE_WALLET=wallet-service-test`, `INTERNAL_SERVICE_SECRET`, `BANK_ACCOUNT_VERIFIER_URL` (tạm `http://localhost:3002/internal/users/verify-bank-account`, xác minh ở Giai đoạn 4)
- [ ] Thêm `backend/.env.wallet-test.example` (đã commit được) không chứa secret thật
- [ ] **Không** sửa `backend/.env` đang dùng (trỏ Supabase) để tránh nhầm đích

### 1.4 Script guard + helper nạp env

- [ ] Tạo `backend/scripts/wallet-test-env.ps1`: nạp `.env.wallet-test` vào process hiện tại, **dừng nếu** host DB khác `localhost`/`127.0.0.1` hoặc port ≠ 55432 hoặc tên DB không chứa `test`
- [ ] Tạo `backend/scripts/wallet-test-up.ps1`: gọi guard → `docker compose up -d --wait` → `CREATE SCHEMA IF NOT EXISTS wallet_service` (qua `docker compose exec postgres-test psql`) → `pnpm run prisma:migrate:wallet`
- [ ] Tạo `backend/scripts/wallet-test-down.ps1`: `docker compose down -v`
- [ ] Thêm script npm: `test:wallet:up`, `test:wallet:down` (gọi các file .ps1)

### 1.5 Migrate Wallet lên DB test

- [ ] Chạy `wallet-test-up.ps1`; mong đợi áp dụng toàn bộ migration gồm `20261026000100_add_wallet_audit_log`, `20261026000101_add_dead_letter_events`, `20261026000200_add_withdrawal_processing_status`
- [ ] `pnpm run prisma:status:wallet` → "Database schema is up to date"
- [ ] Kiểm tra bảng: `\dt wallet_service.*` có `wallets`, `wallet_audit_logs`, `dead_letter_events`...
- [ ] Chạy lại `down -v` rồi `up` lần 2 để chứng minh migrate trên DB **trống** lặp lại được (reproducible)
- [ ] Nếu migration lỗi (ví dụ enum/`search_path`), ghi lỗi + sửa migration (đây chính là bằng chứng F01 cần có)

### 1.6 Smoke test RabbitMQ

- [ ] Khởi động wallet-service với env test (`pnpm start:dev wallet-service` hoặc lệnh Nest tương ứng) và xác nhận kết nối broker, queue `wallet-service-test` xuất hiện trong UI
- [ ] Nếu service tự khai báo exchange/queue theo `RABBITMQ_EXCHANGE`, kiểm tra tên đúng là tên test (không đụng tên production)
- [ ] Dừng service; ghi lại các queue/exchange đã tạo để Giai đoạn 3 dùng

### 1.7 Sửa typecheck Wallet

- [ ] Tái hiện: `pnpm exec tsc --noEmit -p tsconfig.build.json` → ghi lại lỗi TS6305
- [ ] Thử theo thứ tự: (a) `pnpm exec tsc -b libs/*/tsconfig.lib.json` rồi typecheck lại; (b) `pnpm prisma:generate` rồi lại; (c) nếu vẫn lỗi, thêm `apps/wallet-service/tsconfig.typecheck.json` (mô phỏng `apps/notification-service/tsconfig.typecheck.json`, include wallet + libs qua `paths`) và script `typecheck:wallet`
- [ ] Mục tiêu: `pnpm run typecheck:wallet` exit 0
- [ ] Ghi riêng: lỗi notification-service (firebase-admin) = blocker có sẵn, không sửa

### 1.8 Khung integration test (chỉ hạ tầng)

- [ ] Tạo `backend/vitest.config.integration.ts` (copy cấu hình e2e, include `apps/wallet-service/test/integration/**/*.int-spec.ts`, `fileParallelism: false`, `testTimeout: 30000`, `globalSetup` kiểm tra guard)
- [ ] Tạo `apps/wallet-service/test/integration/helpers/`: `db.ts` (PrismaClient tới DB test, hàm `truncateAll()` chỉ chạy khi guard pass), `rabbit.ts` (kết nối amqplib/`@app/rabbitmq`, purge queue test)
- [ ] 1 test mẫu `infra.int-spec.ts`: kết nối DB, `SELECT 1`, tạo wallet rồi đọc lại; kết nối RabbitMQ publish/consume 1 message
- [ ] Thêm script `test:integration:wallet` = `vitest run --config ./vitest.config.integration.ts`
- [ ] Verify: test mẫu xanh khi hạ tầng up; **fail rõ ràng** (không treo) khi hạ tầng down

### 1.9 Tài liệu & ghi nhận

- [ ] Thêm mục "Chạy integration test Wallet" vào `docs/HUONG_DAN_BUILD_VA_CHAY.md` (lệnh up/migrate/test/down, port, cảnh báo không trỏ Supabase)
- [ ] Ghi kết quả thực tế: lệnh đã chạy, pass/fail, Redis=not required, port, tên queue/exchange test (không kèm mật khẩu)
- [ ] Tick checklist Giai đoạn 1 ở trên

## Tiêu chí hoàn thành Giai đoạn 1

1. `test:wallet:up` dựng được Postgres+RabbitMQ healthy và migrate Wallet sạch, chạy lặp được.
2. Guard chặn mọi migrate/truncate nếu đích không phải DB test local.
3. `typecheck:wallet` (hoặc tương đương) exit 0; lỗi notification ghi nhận là ngoài phạm vi.
4. `test:integration:wallet` chạy test mẫu xanh với hạ tầng up.
5. Không file nào chứa secret thật; `.env.wallet-test` bị gitignore.

## Rủi ro / lưu ý

- Docker chưa chạy là blocker duy nhất hiện tại; nếu không bật được, mọi bước 1.2+ chỉ làm được phần file, không chứng minh được.
- `tmpfs` trên Docker Desktop/WSL2 hoạt động bình thường; nếu lỗi quyền thì bỏ `tmpfs`, dùng `down -v`.
- Prisma 7 + schema tùy chỉnh: nếu `migrate deploy` không tạo schema tự động, bước `CREATE SCHEMA` ở 1.4 là bắt buộc.
- Thứ tự thực hiện gợi ý: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.7 (song song) → 1.6 → 1.8 → 1.9. Ước lượng: ~2–3 giờ.

---

# KẾ HOẠCH TẠO FILE — Giai đoạn 1 (có ràng buộc phạm vi)

**Ràng buộc:** (1) Ưu tiên TẠO FILE MỚI. (2) File cũ chỉ được sửa phần liên quan wallet-service, bằng cách THÊM dòng; không đổi/xóa/format lại nội dung khác. (3) Docker đã bật, port 55432/56672/56673 đã xác nhận trống.

## A. File MỚI sẽ tạo (đường dẫn trong `HANDY_GO/backend`)

| #   | File                                                     | Mục đích                                                                                                                                  |
| --- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docker-compose.wallet-test.yml`                         | Postgres 16 (55432) + RabbitMQ 3.13 mgmt (56672/56673), healthcheck, project name `handygo-wallet-test`, tmpfs                            |
| 2   | `.env.wallet-test`                                       | Env test thật (đã bị `.gitignore` chặn bởi `.env.*`)                                                                                      |
| 3   | `.env.wallet-test.example`                               | Bản mẫu không secret thật, commit được (khớp `!.env.example`? KHÔNG — pattern `.env.*` sẽ chặn; xem mục C)                                |
| 4   | `scripts/wallet-test-env.ps1`                            | Nạp env + guard: chỉ cho phép host localhost/127.0.0.1, port 55432, DB tên chứa `test`                                                    |
| 5   | `scripts/wallet-test-up.ps1`                             | guard → compose up --wait → `CREATE SCHEMA IF NOT EXISTS wallet_service` → `prisma:migrate:wallet`                                        |
| 6   | `scripts/wallet-test-down.ps1`                           | `compose down -v`                                                                                                                         |
| 7   | `apps/wallet-service/tsconfig.typecheck.json`            | Typecheck riêng wallet (tránh TS6305), mô phỏng file của notification-service                                                             |
| 8   | `vitest.config.integration.ts`                           | Config integration: include `apps/wallet-service/test/integration/**/*.int-spec.ts`, không chạy song song, timeout 30s, globalSetup guard |
| 9   | `apps/wallet-service/test/integration/global-setup.ts`   | Kiểm tra guard + hạ tầng reachable, fail nhanh nếu down                                                                                   |
| 10  | `apps/wallet-service/test/integration/helpers/db.ts`     | PrismaClient tới DB test, `truncateAll()` (chỉ khi guard pass)                                                                            |
| 11  | `apps/wallet-service/test/integration/helpers/rabbit.ts` | Kết nối/publish/consume/purge queue test                                                                                                  |
| 12  | `apps/wallet-service/test/integration/infra.int-spec.ts` | Test mẫu: DB `SELECT 1` + tạo/đọc wallet; RabbitMQ publish→consume                                                                        |

## B. File CŨ sẽ sửa (chỉ thêm, chỉ liên quan wallet)

| File                                    | Thay đổi duy nhất được phép                                                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/package.json`                  | Thêm 4 dòng script trong `scripts`: `test:wallet:up`, `test:wallet:down`, `test:integration:wallet`, `typecheck:wallet`. Không đổi dependencies/script khác |
| `docs/HUONG_DAN_BUILD_VA_CHAY.md`       | Thêm 1 mục mới ở cuối: "Chạy integration test Wallet". Không đụng nội dung có sẵn                                                                           |
| `docs/PLAN-CHECKLIST-Wallet-Payment.md` | Tick checkbox                                                                                                                                               |

**KHÔNG sửa:** `.gitignore`, `docker-compose.yml`, `.env`, `.env.example`, `tsconfig*.json` gốc, `vitest.config*.ts` hiện có, `libs/*`, mọi service khác (user-trust, notification, payment...), code nghiệp vụ wallet-service (giai đoạn này không đổi logic).
Nếu cần thêm dependency (ví dụ `amqplib` dev) chỉ khi `libs/rabbitmq` không đủ; kiểm tra trước, hỏi bạn trước khi sửa `package.json` dependencies.

## C. Điểm cần quyết định nhỏ

- `.gitignore` chặn `.env.*` nên `.env.wallet-test.example` sẽ không được commit mặc định. Phương án không sửa `.gitignore`: đặt mẫu tại `scripts/wallet-test.env.template` (không bị chặn). **Chọn phương án này** thay cho file #3.

## D. Thứ tự thực hiện & kiểm chứng

1. Tạo #1 → `docker compose -f docker-compose.wallet-test.yml up -d --wait` → 2 service healthy, mở http://localhost:56673.
2. Tạo #2, template, #4–#6 → chạy `wallet-test-up.ps1`; `pnpm run prisma:status:wallet` = up to date; `\dt wallet_service.*` thấy bảng; chạy `down` rồi `up` lần 2 (reproducible). Thử guard: đặt host sai → script phải từ chối.
3. Tạo #7 → thêm script `typecheck:wallet` → `pnpm run typecheck:wallet` exit 0 (nếu TS6305 còn, thử `tsc -b libs/*/tsconfig.lib.json` trước, vẫn không sửa tsconfig gốc).
4. Tạo #8–#12 + script `test:integration:wallet` → test xanh khi hạ tầng up; fail rõ khi down.
5. Smoke wallet-service với env test (đọc-only quan sát queue/exchange), ghi tên vào docs.
6. Thêm mục docs, tick checklist, báo cáo: lệnh đã chạy + kết quả thật.

## E. Kiểm tra không vi phạm phạm vi

- Sau khi xong: liệt kê file thay đổi (so với danh sách A/B); mọi file ngoài A/B phải là 0. Với `package.json` kiểm tra diff chỉ +4 dòng script.
- Trước khi sửa `package.json` và docs, sao lưu bản gốc vào thư mục tạm để so sánh rồi xóa sau khi xác minh.

---

# CẬP NHẬT 27/10/2026 17:15 — Sau khi merge origin/main

**Đã làm:** merge `origin/main` (17 commit, chủ yếu bidding-service PR #28) vào `feature/HG-52-wallet-services` (commit merge `91443d5`).

- Xung đột `backend/package.json`: giữ cả script `bidding` (main) và `wallet` (nhánh này) trong 3 dòng tổng hợp `prisma:generate|migrate|status`.
- Xung đột khi khôi phục thay đổi wallet ở `user-trust-service.controller(.spec).ts`: main đã tự thêm `ConfigService`/`internalServiceSecret`/`Query`; giữ phần của main, thêm `Post` + endpoint verify-bank-account của wallet, bỏ import trùng; mock secret spec đặt `secret-1` để khớp test verify.
- Thay đổi chưa commit của wallet vẫn còn nguyên trong working tree (stash đã pop và xóa).

**Lỗi notification-service:** main KHÔNG sửa mã nguồn notification (chỉ đổi package.json). Tuy vậy sau `pnpm install` + `pnpm run prisma:generate` thì `pnpm run typecheck` (full), `typecheck:notification` và `typecheck:wallet` đều **exit 0**. Nhiều khả năng lỗi `firebase-admin` trước đó do môi trường thiếu cài đặt/generate, không phải lỗi mã nguồn.

**Kết quả chạy lại:**
| Kiểm tra | Kết quả |
|---|---|
| `pnpm run typecheck` (full) | PASS |
| `pnpm run typecheck:notification` | PASS |
| `pnpm run typecheck:wallet` | PASS |
| `pnpm run lint` | PASS (chỉ 2 warning unused ở notification, có sẵn) |
| `pnpm run test:integration:wallet` | PASS 3/3 (Docker, DB+RabbitMQ test) |
| `pnpm run test` (unit toàn repo) | 551 pass, **55 fail**, toàn bộ ở auth: `auth-service/test/*` (27), `libs/auth/auth.service.spec.ts` (18), `session.service.spec.ts` (10). Nguyên nhân: thiếu JWT Public Key ("chạy `pnpm run keys:generate`"). Không thuộc wallet/user-trust/notification |

**Việc còn lại/đề xuất:**

- [ ] (Ngoài phạm vi wallet) Chạy `pnpm run keys:generate` hoặc cấu hình JWT key để xác nhận 55 test auth xanh; không sửa code auth
- [ ] Chạy lại unit riêng wallet + user-trust: `pnpm exec vitest run apps/wallet-service apps/user-trust-service`
- [ ] Commit thay đổi wallet (chưa commit) khi bạn đồng ý; kiểm tra `.gitignore`, `docker-compose.yml`, `.env.example` đang có thay đổi chưa rõ thuộc phạm vi nào
- [ ] Bước 1.6 (smoke wallet-service với env test) còn mở; sau đó sang Giai đoạn 2

---

## KẾT QUẢ THỰC THI GIAI ĐOẠN 2–5 (đã chạy thật trên Postgres :55432 + RabbitMQ :56672)

`pnpm vitest run --config ./vitest.config.integration.ts` → **8 file, 60 test pass**. `pnpm run typecheck:wallet` sạch. Unit `apps/wallet-service apps/user-trust-service` → 75 pass.

| Giai đoạn | Kết quả | File test |
|---|---|---|
| 2. Ledger/refund/withdrawal/HTTP trên DB thật | Xong: double-spend, refund 60/60 và 100×1 đồng thời, `needs_review`, audit rollback, claim vs cancel race (2 pool), BigInt qua HTTP, 403 secret/role | `ledger-refund`, `withdrawal`, `http` `.int-spec.ts` |
| 3. Retry/DLQ/replay | Xong: retry qua queue TTL (`<queue>.retry.<delay>`), hết lượt → `<queue>.dlq` + quarantine DB, replay chỉ cho `payment.topup.succeeded`/`user.registered`, có audit; chạy trên RabbitMQ thật | `rabbit-retry.int-spec.ts` |
| 4. Bank verifier | Xong với **fake HTTP server** (owned/active, sai secret, 404, 5xx, JSON hỏng, timeout, server tắt → đều fail-closed). `active` = user active, KHÔNG phải trạng thái tài khoản ngân hàng | `bank-verifier-http.int-spec.ts` |
| 5. Mock Payment | Xong **mock** (không phải Payment thật): claim, success, failed, event/callback trùng, callback muộn sau cancel → `needs_review`, provider crash sau claim | `mock-payment-contract.int-spec.ts` |

Thay đổi hành vi: endpoint adjustment đọc actor từ `x-user-id` (do gateway inject, phải là UUID; `x-actor-id` không còn được tin).

---

## CẬP NHẬT 28/10/2026 — Sửa theo review PR #27 (10 mục)

**Kết quả chạy THẬT** (Postgres test `:55432`, RabbitMQ test `:56672`; migration chỉ chạy trên DB test qua `pnpm run test:wallet:up`):
- Integration `pnpm run test:integration:wallet` → **7 file, 77 test pass**.
- Unit `pnpm vitest run apps/wallet-service apps/user-trust-service` → **22 file, 85 test pass**.
- `pnpm run typecheck:wallet` → sạch.
- Auth: đã generate JWT keys (`node scripts/generate-jwt-keys.mjs`, thư mục `keys/` và `.env` bị gitignore) → `pnpm vitest run apps/auth-service` → 23 file, 162 pass, 4 skipped, không lỗi. Log SMTP là lỗi giả lập trong test.

| # | Thay đổi |
|---|---|
| 1 | `global-setup.ts` validate cả `DATABASE_URL_WALLET` và `DATABASE_URL` (phải cùng DB test); `truncateAll` kiểm tra `current_database()` trước khi TRUNCATE |
| 2 | Verifier gọi `${USER_TRUST_SERVICE_URL}/${API_PREFIX}/internal/users/verify-bank-account`; lỗi hạ tầng → 503. Test gọi controller/service User Trust **thật** qua HTTP (global prefix + secret thật); chỉ bảng bank account là in-memory fake, token verifier mock |
| 3 | `finish` với callback mâu thuẫn (failed→succeeded, cancel→succeeded…) → `needs_review` + outbox `wallet.withdrawal.needs_review` |
| 4 | Retry/DLQ/replay publish qua confirm channel (`confirmed-queue-publisher.ts`); chỉ ACK sau khi broker confirm, lỗi → NACK requeue |
| 5 | `WALLET_WITHDRAWALS_ENABLED` mặc định `false` → tạo withdrawal trả 503 |
| 6 | `create` kiểm tra replay idempotent trước khi gọi verifier → retry bản đã commit không phụ thuộc User Trust |
| 7 | Swagger `/docs` dựng lại trong `setupApp` |
| 8 | `WalletNotProvisionedException` coi là lỗi tạm: retry có giới hạn, hết lượt → quarantine/DLQ, replay được |
| 9 | `payoutOperationId` (UUID, unique) trong event `wallet.withdrawal.requested`; `POST internal/withdrawals/:id/claim` và `/status` bắt buộc `payoutOperationId`; `payoutReference` unique (trùng → 409). Test bằng mock Payment |

Quyết định nghiệp vụ đã áp dụng: refund thiếu nguồn → 409 + `wallet.refund.needs_review` (audit + outbox), không tạo Point/không dùng Platform; adjustment/DLQ/audit-read cần Admin + permission `wallet:adjust` / `wallet:dlq:read` / `wallet:dlq:replay` / `wallet:audit:read` (header `x-user-permissions` từ gateway); replay DLQ có audit; không tự xóa ledger/audit.

**Chưa làm / cần xác nhận**: Payment & payout provider thật; gateway phải cấp các permission mới ở trên; DLQ retention chốt sau; `active` ≠ bank-verified; staging/production migrate theo quy trình deploy.

