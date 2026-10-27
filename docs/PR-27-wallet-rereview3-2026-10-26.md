# PR #27 Wallet — Kết quả thực thi Fix Plan

**Ngày:** 26/10/2026  
**Phạm vi:** `backend/apps/wallet-service` và phần interceptor/config cần thiết  
**PR GitHub:** [duyaivy/HANDY_GO#27](https://github.com/duyaivy/HANDY_GO/pull/27)  
**Trạng thái PR:** chưa sửa trực tiếp, chưa push, chưa comment/review trên GitHub

## 1. Điểm đã tiếp tục từ plan

Đã tiếp tục triển khai trong working tree, không sửa hoặc push PR #27 trên GitHub. Các thay đổi tập trung trong wallet-service: transaction refund, withdrawal state machine, BigInt serialization, schema-qualified SQL, DLQ/quarantine, bank verifier và adjustment audit.

## 2. Trạng thái A–J sau lần thực thi này

| Mã lỗi | Phương án fix | Bằng chứng | Kết quả |
|---|---|---|---|
| F04 | Serializable transaction bao trùm replay, lock payment, cap, allocation và ledger write. | [refund-adjustment.service.ts](../backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts), `createBalancedTransferInTx`. | Đã triển khai; chưa có PostgreSQL concurrency test. |
| F06 | Bắt buộc `requested → processing` trước terminal callback; giữ hold khi processing; mâu thuẫn chuyển `needs_review`. | [withdrawal.service.ts](../backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts), [withdrawal-status.dto.ts](../backend/apps/wallet-service/src/withdrawal/dto/withdrawal-status.dto.ts). | Đã triển khai guard; chưa xác nhận handshake Payment/runtime. |
| F10 | Global interceptor serialize mọi BigInt thành decimal string. | [bigint-serializer.interceptor.ts](../backend/apps/wallet-service/src/common/interceptors/bigint-serializer.interceptor.ts), [main.ts](../backend/apps/wallet-service/src/main.ts). | Đã triển khai; chưa có HTTP E2E. |
| F01 | Qualify raw lock SQL bằng `"wallet_service"."wallets"`. | [wallet-ledger.service.ts](../backend/apps/wallet-service/src/wallet-ledger/wallet-ledger.service.ts), [withdrawal.service.ts](../backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts), [topup-settlement.service.ts](../backend/apps/wallet-service/src/topup-settlement/topup-settlement.service.ts). | Đã triển khai; chưa chạy DB sạch với role/search_path production. |
| F02 | Permanent/malformed event ghi DLQ rồi ACK; transient vẫn retry. | [topup-settlement.consumer.ts](../backend/apps/wallet-service/src/topup-settlement/topup-settlement.consumer.ts), [wallet-provisioning.consumer.ts](../backend/apps/wallet-service/src/wallet-provisioning/wallet-provisioning.consumer.ts), [add_dead_letter_events](../backend/apps/wallet-service/prisma/migrations/20261026000101_add_dead_letter_events/migration.sql). | Đã triển khai phân loại/quarantine; chưa có backoff/max-retry broker test. |
| F08 | External verifier port; thiếu URL, timeout, HTTP lỗi hoặc response không khẳng định ownership đều fail-closed. | [bank-account-verifier.port.ts](../backend/apps/wallet-service/src/withdrawal/bank-account-verifier/bank-account-verifier.port.ts), [http-bank-account-verifier.ts](../backend/apps/wallet-service/src/withdrawal/bank-account-verifier/http-bank-account-verifier.ts). | Đã triển khai adapter; cần URL/contract và integration test thật. |
| F13 | Cumulative target trừ cumulative recovery theo source, phần dư deterministic ở source cuối. | [refund-adjustment.service.ts](../backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts). | Đã triển khai; chưa có test 100×1 trên PostgreSQL. |
| F14 | Actor/reason ghi trong `wallet_audit_logs` cùng transaction adjustment. | [wallet-ledger.service.ts](../backend/apps/wallet-service/src/wallet-ledger/wallet-ledger.service.ts), [add_wallet_audit_log](../backend/apps/wallet-service/prisma/migrations/20261026000100_add_wallet_audit_log/migration.sql). | Đã triển khai; cần xác nhận nguồn actor là JWT/header trusted. |
| F12 | Validate UUID, amount, idempotency length, BIGINT range; malformed event quarantine. | [topup-settlement.consumer.ts](../backend/apps/wallet-service/src/topup-settlement/topup-settlement.consumer.ts). | Đã triển khai cho top-up; envelope contract/broker integration chưa kiểm chứng đầy đủ. |
| R01 | Replay refund phải lookup credit wallet và xác minh `userId` trước khi trả existing. | [refund-adjustment.service.ts](../backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts). | Đã triển khai; cần regression test riêng retry dưới user khác. |

## 3. Files và migration đã cập nhật

- [schema.prisma](../backend/apps/wallet-service/prisma/schema.prisma): `processing`, `needs_review`, `WalletAuditLog`, `DeadLetterEvent`.
- [add_wallet_audit_log](../backend/apps/wallet-service/prisma/migrations/20261026000100_add_wallet_audit_log/migration.sql)
- [add_dead_letter_events](../backend/apps/wallet-service/prisma/migrations/20261026000101_add_dead_letter_events/migration.sql)
- [add_withdrawal_processing_status](../backend/apps/wallet-service/prisma/migrations/20261026000200_add_withdrawal_processing_status/migration.sql)
- [bigint-serializer.interceptor.ts](../backend/apps/wallet-service/src/common/interceptors/bigint-serializer.interceptor.ts)
- [refund-adjustment.service.ts](../backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts)
- [wallet-ledger.service.ts](../backend/apps/wallet-service/src/wallet-ledger/wallet-ledger.service.ts)
- [withdrawal.service.ts](../backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts)
- [http-bank-account-verifier.ts](../backend/apps/wallet-service/src/withdrawal/bank-account-verifier/http-bank-account-verifier.ts) (+ spec)`n- [user-trust-service.controller.ts](../backend/apps/user-trust-service/src/user-trust-service.controller.ts), [user-trust-service.service.ts](../backend/apps/user-trust-service/src/user-trust-service.service.ts) (endpoint verify + spec)`n- [docker-compose.yml](../backend/docker-compose.yml), [.env.example](../backend/.env.example): `BANK_ACCOUNT_VERIFIER_URL`
- [topup-settlement.consumer.ts](../backend/apps/wallet-service/src/topup-settlement/topup-settlement.consumer.ts)
- [wallet-provisioning.consumer.ts](../backend/apps/wallet-service/src/wallet-provisioning/wallet-provisioning.consumer.ts)

### 3.1. Thay đổi ngoài `apps/wallet-service`

| File | Thay đổi | Lý do |
|---|---|---|
| [user-trust-service.service.ts](../backend/apps/user-trust-service/src/user-trust-service.service.ts) | Thêm `verifyBankAccountOwnership(userId, bankAccountId)`: tìm `UserBankAccount` theo `id` + `userId` + user `active`, trả `{ owned, active }`. | F08 — nguồn xác thực chủ tài khoản ngân hàng. |
| [user-trust-service.controller.ts](../backend/apps/user-trust-service/src/user-trust-service.controller.ts) | Thêm `POST /internal/users/verify-bank-account`; bảo vệ bằng `x-internal-secret` (timing-safe), 400 khi thiếu tham số, 403 khi sai secret; inject `ConfigService`. | F08 — endpoint internal cho wallet. |
| [user-trust-service.controller.spec.ts](../backend/apps/user-trust-service/src/user-trust-service.controller.spec.ts) | Cấp `ConfigService` mock; thêm 3 test endpoint verify (hợp lệ, secret sai/thiếu, thiếu tham số). | Giữ spec cũ chạy được và phủ endpoint mới. |
| [docker-compose.yml](../backend/docker-compose.yml) | Thêm `BANK_ACCOUNT_VERIFIER_URL` vào env của `wallet-service`. | Wallet gọi được verifier trong Docker. |
| [.env.example](../backend/.env.example) | Thêm `BANK_ACCOUNT_VERIFIER_URL=http://localhost:3002/internal/users/verify-bank-account`. | Ghi nhận cấu hình bắt buộc. |

Không sửa: `payment-service`, `auth-service`, `notification-service` (lỗi typecheck firebase-admin là có sẵn, chưa xử lý). `.gitignore` có thay đổi trong working tree nhưng không thuộc phạm vi fix này.

Lưu ý triển khai: `user-trust-service` không cần migration mới; `backend/.env` cần tự thêm `BANK_ACCOUNT_VERIFIER_URL` khi chạy trực tiếp.
## 4. Validation

| Kiểm tra | Kết quả |
|---|---|
| Vitest wallet + user-trust | **PASS — 21 files, 75 tests** (gồm test mới cho verifier, interceptor BigInt, endpoint verify) |
| Oxlint wallet + user-trust | **PASS** |
| Wallet Prisma schema/client | **PASS — validate và generate thành công** |
| Wallet app typecheck riêng | **BLOCKED bởi project references chưa build (`dist/libs/*` TS6305); full typecheck cũng còn lỗi có sẵn ở notification-service** |
| PostgreSQL migration deploy | **Chưa chạy** vì workspace không cung cấp DB runtime/credentials |
| RabbitMQ/E2E payout và bank verifier | **Chưa chạy** vì không có môi trường tích hợp |

## 5. Các việc còn thiếu để coi là “fix tất cả”

1. Chạy PostgreSQL integration test cho refund concurrent/cap, rounding, raw schema lock, audit atomicity và withdrawal race.
2. Chạy RabbitMQ test với DLQ thật, backoff và max-retry; hiện transient vẫn dùng `nack(requeue=true)` nên chưa chứng minh chống hot loop hoàn toàn.
3. ~~Cung cấp verifier~~ — endpoint đã có tại `user-trust-service`, URL đã cấu hình; còn thiếu integration test thật giữa hai service.
4. Chạy payout handshake thực tế với Payment Service, gồm dispatch claim và callback đến sau cancel.
5. Regression tests: F08 (fail-closed) và F10 (BigInt) đã thêm; F04, F06, F12, F13, F14, R01 mới có unit test cập nhật ở refund/withdrawal spec, chưa có integration test trên PostgreSQL.
6. Sửa lỗi typecheck ngoài phạm vi wallet tại `notification-service`, sau đó chạy lại full backend typecheck.
7. Cập nhật PR description và migration deploy trên staging; chưa thực hiện các thao tác GitHub/DB này.

## 6. Thông tin bạn cần cung cấp

### 6.1. Hạ tầng test

`backend/docker-compose.yml` hiện **chưa tạo container PostgreSQL, RabbitMQ hoặc Redis**. File chỉ khai báo các microservice và truyền vào chúng các hostname/URL hạ tầng bên ngoài (`DATABASE_URL`, `RABBITMQ_URL`, `REDIS_URL`). Vì vậy hiện chưa thể kết luận rằng Docker Compose của backend đã có database test.

Để chạy đầy đủ integration test, cần cung cấp một trong các lựa chọn:

- PostgreSQL test riêng, có thể chạy migration wallet và cho phép hai transaction đồng thời.
- RabbitMQ test riêng có quyền tạo exchange, queue, retry queue và DLQ.
- Redis test nếu flow runtime cần Redis.
- Hoặc bổ sung các container hạ tầng vào một compose file test riêng; không dùng database production.

Thông tin cần xác nhận:

1. Docker CLI đã cài nhưng Docker Desktop daemon hiện chưa chạy (cần khởi động). Dùng PostgreSQL local Docker, Testcontainers hay staging?
2. `DATABASE_URL_WALLET`/connection string test và schema chính thức (`wallet_service`).
3. Có được phép chạy `prisma migrate deploy` trên database test không?
4. RabbitMQ URL test, exchange/queue hiện có, max retry và backoff mong muốn.
5. Có cần Redis cho bộ test này không?

### 6.2. Bank account verifier — ĐÃ CHỐT: `user-trust-service` (port 3002)

Đã triển khai (cập nhật code):

- [user-trust-service.controller.ts](../backend/apps/user-trust-service/src/user-trust-service.controller.ts): `POST /internal/users/verify-bank-account`, xác thực bằng header `x-internal-secret` (so sánh timing-safe với `INTERNAL_SERVICE_SECRET`), thiếu tham số → 400, sai secret → 403.
- [user-trust-service.service.ts](../backend/apps/user-trust-service/src/user-trust-service.service.ts): `verifyBankAccountOwnership(userId, bankAccountId)` truy vấn `UserBankAccount` theo `id` + `userId` + user `active`.
- Contract: request `{ "userId": "...", "bankAccountId": "..." }` → response `{ "owned": boolean, "active": boolean }`. Wallet chỉ cho rút khi cả hai `true`; mọi lỗi/timeout/thiếu URL đều từ chối (fail-closed).
- Cấu hình `BANK_ACCOUNT_VERIFIER_URL`: [docker-compose.yml](../backend/docker-compose.yml) (`http://user-trust-service:3002/internal/users/verify-bank-account`) và [.env.example](../backend/.env.example) (`http://localhost:3002/internal/users/verify-bank-account`). Khi chạy trực tiếp, cần thêm biến này vào `backend/.env`.

Còn cần xác nhận: `UserBankAccount` chưa có cờ trạng thái riêng nên "active" hiện suy ra từ `user.status === 'active'`; timeout/retry policy; chạy integration test thật giữa hai service.
### 6.3. Payout handshake

Payment Service hiện chưa cung cấp đầy đủ contract/flow payout để chứng minh F06 trên runtime. Cần cung cấp:

1. Service nào dispatch payout.
2. Ai gọi `requested → processing`.
3. Dispatch dùng HTTP hay RabbitMQ.
4. Callback status và idempotency contract.
5. Quy tắc xử lý success/failed đến sau cancel.
6. Có payout sandbox/mock để chạy race test hay không.

### 6.4. RabbitMQ DLQ

1. Dùng RabbitMQ DLQ thật, bảng `dead_letter_events`, hay cả hai?
2. Max retry và lịch backoff, ví dụ `5s → 30s → 5m`.
3. Quy trình replay DLQ.
4. Chính sách lưu và masking payload lỗi.

### 6.5. Adjustment audit và identity

1. Actor ID lấy từ JWT claim nào.
2. Header actor có được gateway tin cậy inject không.
3. Có cần lưu correlation ID, IP, role và service name không.
4. Ai được đọc audit log và thời gian lưu log.

### 6.6. Quy tắc nghiệp vụ refund

1. Khi source không đủ tiền recovery thì fail, chuyển `needs_review` hay platform bù?
2. Quy tắc phân bổ phần dư rounding.
3. Có cần accumulator riêng cho mỗi payment không?
4. Có thể chạy concurrent integration test trên database test không?

### 6.7. Phạm vi validation ngoài wallet

Nếu muốn full backend typecheck xanh, cần xác nhận có cho phép sửa lỗi dependency/typecheck hiện có ở `notification-service` hay chỉ ghi nhận là blocker ngoài phạm vi wallet.

## 7. Kết luận merge

Chưa nên merge PR #27. Phần code wallet đã được triển khai và kiểm tra mục tiêu, nhưng các bằng chứng integration/runtime còn thiếu như liệt kê ở trên.


