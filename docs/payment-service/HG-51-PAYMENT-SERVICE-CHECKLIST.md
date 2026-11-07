# HG-51 — Payment Service: kế hoạch và checklist

Cập nhật **07/11/2026**. Nguồn: [PO Final](../HandyGo_PO_Decisions_Final_VI.md), [quy chuẩn backend](../../backend/AGENTS.md), [Vibe Coding](../../backend/docs/VIBE_CODING_GUIDELINES.md), [DBML v2](../dbml/payment-service-v2.dbml). Mã hiện hành và hướng dẫn vận hành: [README Payment](../../backend/apps/payment-service/README.md). Bằng chứng kiểm thử: [07/11](evidence/HG-51-test-evidence-2026-11-07.md), [lịch sử 05/11](evidence/HG-51-test-evidence-2026-11-05.md).

## Phương án người dùng đã duyệt

- Seed 10% nhận bắt buộc `COMMISSION_SEED_EFFECTIVE_FROM` và `COMMISSION_SEED_ACTOR_ID`; không ngày/actor mặc định, không startup seed. Transaction với audit và advisory lock; cùng cấu hình chạy lại là no-op. Staging/prod chờ PO/DevOps cung cấp hai giá trị và xác minh actor thật.
- Commission hợp lệ 0–30%; cấm 100%. Snapshot tại `order.created`, version interval `[from,to)`, không sửa lịch sử hoặc tự áp phí cho Order trước rollout.
- Chỉ làm Payment. Wallet/User Trust còn thiếu contract thì ghi phụ thuộc và giữ fail-closed.
- Cash/Point đều chỉ refund Point, Admin phê duyệt. Không hoàn Cash thủ công. Approval giữ `needs_review` đến khi có funded Wallet operation, quy tắc commission và downstream contract đã xác nhận.

## Những gì đã hoàn thành trong workspace

Đã nối tiếp phần commission/Admin/audit/migration đang viết dở; hoàn thiện seed có kiểm soát, permission checks, Admin payment read, yêu cầu/duyệt/từ chối refund, khóa reservation và idempotency, replay DLQ có audit, snapshot báo cáo nội bộ theo ngày Việt Nam, browser return VNPAY và kiểm tra merchant/status. Thêm test DB/HTTP cho các luồng này. Không sửa Wallet/User Trust/Gateway, không phát event refund hoặc credit thiếu nguồn, không seed/migrate production và chưa tạo commit/PR.

Báo cáo reconciliation chỉ phản ánh unresolved trong DB Payment, chưa đối chiếu ledger Wallet/provider. Lịch sweep giữ mặc định 15s; đề xuất 60s/retention trong tài liệu PO chưa được coi là cấu hình đã duyệt. Không auto-purge.

## Checklist nghiệm thu

Checkbox chỉ đóng khi đủ tiêu chí của task. “Một phần” là đã có code/test nhưng vẫn còn integration gate; không đánh dấu toàn bộ PAY-01–PAY-11 chỉ từ unit/mock.

### 0. Contract — PAY-01, PAY-07

- [ ] T001 Đối chiếu và nghiệm thu Order eligibility/events, Wallet settlement/refund/top-up/withdrawal với producer/consumer thật.
  - Đã có clients và mock tests; Wallet funded refund và User Trust snapshot còn thiếu.
- [ ] T002 Thống nhất request/response, operation identity, event envelope/version, ACK/retry/DLQ và timeout liên service.
  - Payment nhận string event ID và envelope root/data/payload; top-up giữ root fields tương thích; chưa chứng minh RabbitMQ thật.
- [ ] T003 Xác minh Gateway/service authentication end-to-end.
  - API Payment dùng JWT RS256; Admin cần role và permission, HTTP test có từ chối 401/403. Gateway/IPN routing còn mở.

### 1. Database và nền tảng — PAY-01

- [x] T004 Prisma schema/client và migration riêng Payment; không foreign key chéo database; đã chạy 3 migration trên Docker test riêng.
- [ ] T005 Unique/index/FK/CHECK/overlap và kiểm chứng mọi luồng ghi.
  - DB test có one-payment/order, allocation, overlap/adjacent intervals, cap commission 0–30%, earning >0, top-up 1:1, refund amount. Còn nghiệm thu đầy đủ tương tác ledger/liên service.
- [ ] T006 Legal transitions/CAS/locks và consistency tài chính.
  - Đã có state machine, khóa payment khi tạo attempt/refund, advisory lock khi seed/version rule; financial failure/recovery liên service còn mở.
- [x] T007 Seed commission 10% có cấu hình rollout/actor bắt buộc, audit nguyên tử, không trùng khi chạy lại/đồng thời; không hồi tố.
  - Hoàn tất script và test DB. **Chưa seed staging/prod** vì chưa được cấp ngày/actor thật; đây là deployment gate, không phải giá trị cần tự đặt.
- [ ] T008 Cấu hình môi trường, Prisma generation/migration, health và shutdown.
  - Local build/DI/typecheck Payment đã kiểm tra; credentials/endpoint triển khai cần người vận hành xác minh.

### 2. Commission và events — PAY-07, PAY-08

- [ ] T009 Snapshot + GET/POST Admin version commission, quyền và audit.
  - Code và DB/HTTP test đã có; rate 0–30%, chỉ tạo version tương lai, khóa và DB exclusion, snapshot cũ nguyên vẹn. Auth cần cấp permission `commission:manage` thật trước rollout.
- [ ] T010 Transactional inbox/outbox, consumer Order, retry/DLQ/ACK/replay.
  - Code/unit/DB test đã có; replay Admin giữ ID/payload, reset retry có audit. Chưa test broker thật, crash/ACK race.
- [ ] T011 Tương thích event Payment với consumer Order/Notification/Tracking.
  - Giữ event cũ; không phát event partial/full refund mới khi contract downstream chưa thống nhất.

### 3. Payment Order — PAY-02–PAY-05

- [ ] T012 POST chọn method: Order completed, owner, amount/currency, eligibility; không charge.
  - Code/unit test có; chưa nghiệm thu Order HTTP thật.
- [ ] T013 Cash: đúng Worker, succeeded/idempotent, công nợ và thu commission; không credit Worker.
  - Code/unit test có; chưa nghiệm thu Wallet thật.
- [ ] T014 Point: Customer confirm, fixed operation/attempt, commit-before-success, timeout lookup trước retry.
  - Code/unit và DB double-click test có; chưa nghiệm thu Wallet ledger thật. Policy 30% bảo đảm earning dương; guard từ chối zero vẫn giữ để fail-closed dữ liệu bất thường.
- [ ] T015 Payment query owner/Worker/Admin, pagination/filter/BIGINT/redaction.
  - DB/HTTP test có; Admin đọc projection riêng qua `payment:read:all`, cần permission được cấp thực tế.
- [ ] T016 Quyền, eligibility, double-click, insufficient balance, timeout-after-commit, replay không debit trùng.
  - Unit/mock và DB concurrency có; còn test với Wallet thật.

### 4. Refund — PAY-06

- [x] T017 POST/GET yêu cầu full/partial: quyền, settled state, idempotency fingerprint, cap gồm pending/processing/needs_review/completed, khóa payment và test đồng thời.
  - Customer và Admin có endpoint riêng; rejection giải phóng reservation; duplicate request không thêm refund. Đã có test PostgreSQL/HTTP.
- [ ] T018 Refund chỉ Point cho cả Cash/Point; Admin phê duyệt, Wallet funded credit/reversal, thiếu nguồn needs_review, commit-before-completed.
  - Đã có approval/rejection có audit; không tự duyệt; audit failure rollback decision. Approval luôn `needs_review` vì contract funding chưa có. Không có nút confirm-completed hoặc Wallet call không bảo đảm nguồn.
- [ ] T019 Test actual full/partial settlement, cumulative commission rounding, timeout-after-commit, event/projection compatibility.
  - Đã test reservation full/partial, duplicate/mismatch, concurrent over-cap, concurrent decisions, rejection và audit rollback. **Chưa thực thi hoàn tiền**; rounding/reversal và success event chờ contract, không tự đặt quy tắc kế toán.

### 5. Top-up — PAY-09, PAY-10

- [ ] T020 Top-up create/query, ownership/idempotency/expiry/provider abstraction.
  - Code/unit test có; Gateway alias/routing cần xác minh.
- [ ] T021 VNPAY sandbox signature/merchant/reference/status/amount/redaction.
  - Code/unit test có; thêm merchant check và bắt buộc transaction status 00. Chưa có kết quả sandbox với credentials thật.
- [ ] T022 Outbox sau IPN hợp lệ, chỉ completed sau Wallet ACK.
  - Code/unit test có, reconciliation expire/stuck; chưa chứng minh broker/Wallet thật.
- [ ] T023 Test callback giả/trùng/trễ, restart và ACK timeout.
  - Unit test các callback, return handler không đổi dữ liệu. Restart và live sandbox còn mở. Endpoint return đã có ở Payment nhưng chưa xác minh Gateway/merchant.

### 6. Payout mock — PAY-11

- [ ] T024 Consume/store/claim trước dispatch và snapshot ngân hàng verified.
  - Consume/store/claim có code/unit test. User Trust là owner snapshot, API/mã hóa chưa có contract; default snapshot provider trả null → pending, không claim/dispatch.
- [ ] T025 Provider abstraction, kết quả cuối báo Wallet, unknown giữ hold/reconcile.
  - Code/unit test có; chưa nghiệm thu Wallet/provider thật.
- [ ] T026 Mock chỉ dev/sandbox, is_simulated rõ ràng, race/crash.
  - Production luôn disabled; test mock và definite/unknown outcome có. Live claim/cancel race còn mở.

### 7. Kiểm chứng và bàn giao

- [x] T027 Tổ chức feature module, dùng lại thư viện chung và cập nhật registry `backend/AGENTS.md`.
- [ ] T028 Unit + DB/HTTP + E2E/broker/liên service.
  - Xem evidence 07/11 cho lệnh/kết quả thực tế; chưa chạy broker và liên service thật.
- [ ] T029 Quality gate toàn backend.
  - Test/build/lint và typecheck riêng Payment chạy được. Typecheck toàn backend bị thiếu generated Tracking Prisma client (ngoài phạm vi); ghi rõ trong evidence.
- [x] T030 Cập nhật README/checklist/quyết định/evidence và hướng dẫn seed/config/dependencies.
- [ ] T031 Nghiệm thu liên service/rollout, credentials/actor thật và PR review.
  - Chưa deploy, seed thật, commit hoặc PR trong đợt này.

## Các việc tiếp theo theo owner

Chi tiết tại [PO-DECISIONS.md](PO-DECISIONS.md): PO/DevOps cấp rollout + actor thật và quyết định Order trước rollout; Wallet/Finance chốt nguồn và reversal/commission; User Trust/Security cung cấp snapshot; Auth cấp permissions; Order/Notification thống nhất event; Gateway/VNPAY cấu hình callback và chạy sandbox; Operations/Legal chốt giám sát/retention. Payment giữ fail-closed đến khi từng gate được kiểm chứng.

## Ánh xạ Jira

| Jira | Task |
| --- | --- |
| PAY-01 | T001–T008, T027–T031 |
| PAY-02 | T012, T016, T027–T031 |
| PAY-03 | T013, T016, T027–T031 |
| PAY-04 | T014, T016, T027–T031 |
| PAY-05 | T015–T016, T027–T031 |
| PAY-06 | T017–T019, T027–T031 |
| PAY-07 | T001–T002, T010–T011, T027–T031 |
| PAY-08 | T007, T009, T013–T014, T027–T031 |
| PAY-09 | T020, T022–T023, T027–T031 |
| PAY-10 | T021–T023, T027–T031 |
| PAY-11 | T024–T026, T027–T031 |
