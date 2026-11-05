# HG-51 — Payment Service: kế hoạch và checklist

Nguồn yêu cầu: [HG-51](https://quocduy0322.atlassian.net/browse/HG-51); [DBML Payment v2](../dbml/payment-service-v2.dbml); [quy chuẩn backend](../../backend/AGENTS.md); [Vibe Coding](../../backend/docs/VIBE_CODING_GUIDELINES.md); [định hướng Wallet trước Payment](../Wallet-truoc-Payment-dinh-huong-trien-khai.md). Checklist này theo dõi thực tế, không thay thế Jira.

## Các quyết định kế thừa

- Chỉ thanh toán sau khi Customer xác nhận hoàn thành Order; `order.created` chỉ pre-create/snapshot và `order.completed` chỉ mở thanh toán, không tự charge.
- Mỗi Order tối đa một Payment, nhiều attempts; Payment điều phối, Wallet sở hữu ledger, balance, hold. VND và Point là số nguyên, 1 Point = 1 VND; snapshot phí tại `order.created`, không áp dụng hồi tố.
- Point phải được Customer chủ động xác nhận; Wallet chuyển tiền atomic, Payment chỉ thành công khi Wallet commit. Timeout: tra cứu operation trước retry.
- Cash do đúng Worker xác nhận; không cộng Point từ tiền mặt, tạo công nợ hoa hồng và thu từ Wallet nếu đủ.
- Refund Point cần nguồn hoặc đảo phân bổ hợp lệ; thiếu nguồn `needs_review`. Refund Cash xử lý thủ công. Tổng refund in-flight/completed không vượt payment.
- Top-up độc lập với thanh toán Order, provider-agnostic: callback xác minh mới phát event thành công; chỉ completed sau Wallet ACK, return URL không chứng minh đã thanh toán.
- Payout ban đầu dùng mock, không chuyển tiền thật; Payment claim Wallet trước dispatch. Kết quả không chắc chắn phải giữ hold để đối soát. Các tính năng chưa an toàn phải tắt mặc định.
- Giữ các payment event/status cũ; thêm `partially_refunded` nhưng không bật downstream trước khi thống nhất tương thích.
- Wallet đã được làm trước; xác minh contract và các integration gate thực tế, không chặn toàn bộ triển khai Payment chỉ vì hai service còn đang chờ ghép.

## Quyết định và phụ thuộc cần xác nhận trước khi bật

- [ ] PO xác nhận tỷ lệ commission mặc định, thời điểm hiệu lực, actor seed và quy tắc hiệu lực/overlap; không tự seed một tỷ lệ tài chính.
- [x] Người dùng chọn VNPAY sandbox cho top-up (03/11/2026); payout vẫn mock.
- [ ] Xác minh contract IPN/response VNPAY sandbox và quyền sử dụng credentials; không đưa secrets vào tài liệu.
- [ ] Chốt quyền Admin tạo rule/refund, quy trình xác nhận Cash refund, các trạng thái refund và hợp đồng partial refund với Order/Notification.
- [ ] Xác nhận contract truy vấn provider, thời hạn retry/reconcile, lưu và replay DLQ, audit/retention, cũng như nguồn bù refund được duyệt.
- [ ] Xác minh live contract Order/Wallet, auth nội bộ, trạng thái merge và bằng chứng integration Wallet, đặc biệt claim/cancel race, refund concurrency và top-up ACK. Mock Wallet không chứng minh E2E.
- [ ] DBML quy định worker earning có thể bằng 0, nhưng Wallet debit hiện yêu cầu lớn hơn 0: chốt xử lý 100% commission trước khi bật Point.
- [ ] Order trả decimal string như `350000.00`, Payment lưu BIGINT: chỉ chấp nhận giá VND nguyên, chuyển chính xác và không làm tròn ngầm.
- [ ] Wallet event `eventId` hiện có thể là chuỗi có dấu `:`, trong khi DBML đề xuất UUID cho inbox; contract cần tương thích với producer, không ép UUID.
- [ ] Wallet `TopupSettlementConsumer` hiện đọc trực tiếp `userId`, `paymentId`, `amount`, `idempotencyKey` ở root; publisher `@app/common` mặc định bọc payload vào `data`/`payload`. Cần thống nhất adapter/consumer và kiểm thử RabbitMQ thật trước khi phát event nạp.
- [ ] Event `wallet.withdrawal.requested` hiện chỉ chứa `bankAccountId`, không có bank snapshot. Phải xác định nguồn internal được phép cung cấp snapshot và cách mã hóa trước khi dispatch payout; không giả định event đã chứa thông tin ngân hàng.
- [ ] Chốt permission cho Admin xem mọi payment, quản lý commission và refund; hiện API tra cứu chỉ cho Customer/Worker liên quan.
- [ ] Chốt tương thích thứ tự và cấu trúc Order events, nhất là projection khi partial refund. Các vấn đề cần đưa vào PR cũng được ghi trong [README Payment](../../backend/apps/payment-service/README.md#questions-to-carry-into-the-pr).

## Công việc theo thứ tự phụ thuộc

Tiến độ cập nhật 05/11/2026: ngoài nền tảng (schema/migration, tính tiền chính xác, state machine, API tra cứu, client Order/Wallet, outbox), đã triển khai **toàn bộ phần không phụ thuộc quyết định PO** ở mức code + unit test: inbox/retry, consumer Order events, commission snapshot (fail-closed), tạo/chọn method Payment, Cash, Point, top-up VNPAY (tắt đến khi cấu hình), payout mock (tắt đến khi có bank snapshot), reconciliation. Xem [README Payment](../../backend/apps/payment-service/README.md).

- `PaymentDatabaseModule` (outbox) và `PaymentInboundModule` (inbox) đã được wire ở module gốc; `main.ts` đã kết nối RabbitMQ consumer queue `payment-service`. Mỗi feature dùng `PaymentPrismaModule` chung.
- Kiểm tra 05/11/2026: `vitest run apps/payment-service/src` đạt **110 test / 13 file**; Payment E2E (DI toàn module) đạt; `nest build payment-service` đạt; `oxlint apps/payment-service libs` exit 0; `tsc -p tsconfig.build.json` không có lỗi thuộc Payment. `pnpm run typecheck` toàn backend vẫn fail do thiếu generated `@prisma/tracking-client` của Tracking Service (không thuộc Payment). Đây là bằng chứng unit/mock, **không phải** bằng chứng chạy tài chính thật.
- **Đã chạy trên Docker** (05/11/2026, container `handygo-payment-test`, PostgreSQL 16, DB `handygo_hg51_payment_test`, `127.0.0.1:55433`, dữ liệu tmpfs): cả 2 migration (kể cả `failed_inbound_events`/`payout_operation_id`) áp dụng thành công; **17 integration test / 3 file đạt** (7 schema, 6 HTTP/JWT, 4 mới trong `payment-flows.int-spec.ts`: migration bổ sung, duplicate `order.created`, snapshot commission, double click Point với `FOR UPDATE` → 1 attempt, 1 `payment.succeeded`). Chạy lại bằng `pnpm run test:payment:docker` (thêm `-KeepRunning` để giữ container; `pnpm run test:payment:down` để xóa). Wallet trong các test này là mock.
- **Chưa chạy** (chưa có RabbitMQ test và Wallet/Order thật): kiểm thử RabbitMQ và Payment–Wallet–Order liên service.
- **Cố ý chưa làm vì chờ PO** (xem [PO-DECISIONS.md](./PO-DECISIONS.md)): refund/partial refund (T017–T019), Admin + API quản lý commission (T009 phần Admin), seed commission mặc định (T007), nguồn bank snapshot payout (T024 phần snapshot), quy tắc DLQ replay/retention.
- Chưa tạo commit hoặc PR. Checklist và các file mới chưa được Git theo dõi; `.gitignore` có thay đổi sẵn của người dùng, không tự ý sửa hoặc revert.

Các checkbox chỉ đánh dấu hoàn thành khi đủ điều kiện nêu trong mục; các ghi chú “một phần” không có nghĩa task đã xong.

### 0. Khảo sát và contract — PAY-01, PAY-07

- [ ] T001 Đối chiếu Order eligibility, Order events, Wallet debit/status/refund/commission, top-up event/ACK và withdrawal claim/status với producer/consumer thực tế; xác minh prefix và response envelope.
  - Một phần: đã đối chiếu Order eligibility và một số contract Wallet; chưa chứng minh toàn bộ contract bằng integration liên service.
- [ ] T002 Thiết kế contract request/response, định danh business operation, replay fingerprint, event envelope, ACK/NACK, retry/DLQ, version, quyền và timeout; báo rõ khác biệt giữa Jira, DBML và code.
- [ ] T003 Kiểm tra cấu hình Gateway, trusted identity và service authentication; không tin header từ client.

### 1. Database và nền tảng — PAY-01

- [x] T004 Tạo Prisma schema, client, cấu hình PostgreSQL riêng và migration theo DBML v2; không migrate dữ liệu cũ. Không tạo foreign key giữa database service.
  - Migration ban đầu đã được xác minh; migration bổ sung cho inbound retry và payout operation vẫn cần chạy và kiểm thử trên database test riêng.
- [ ] T005 Đảm bảo unique/index/foreign key nội bộ và DB CHECK về số tiền, tỷ lệ, tổng phân bổ, attempt, hạn hiệu lực; ngăn commission rules hiệu lực chồng nhau.
  - Một phần: migration đã có các constraint này và test một số trường hợp; cần tiếp tục xác minh đầy đủ cùng các luồng ghi.
- [ ] T006 Định nghĩa legal transitions, CAS/locking, retry và idempotency theo từng aggregate; giữ status cũ, chưa phát trạng thái partial không tương thích.
  - Một phần: transitions được áp dụng trong luồng Cash/Point; `SELECT ... FOR UPDATE` trên payment/top-up, CAS `updateMany` khi hủy/finalize, attempt cố định cho Point, idempotency bằng `consumed_events`, `provider_notifications`, idempotency key top-up. Mới kiểm thử bằng mock; test khóa/cạnh tranh trên PostgreSQL đã viết nhưng chưa chạy.
- [ ] T007 Seed commission default chỉ sau khi PO chốt. Khi chưa có rule hợp lệ phải fail closed, không tự mặc định zero.
  - Một phần: fail-closed đã có (`CommissionRuleService`, retry rồi `dead`) và có unit test; không seed — chờ PO.
- [ ] T008 Test migration DB test riêng: tạo mới, unique/check, rollback/lock và schema isolation; không trỏ tới production.
  - Một phần: 7 test schema đã chạy trên PostgreSQL test riêng trước đó; `payment-flows.int-spec.ts` (migration bổ sung, snapshot, double click với lock) đã viết nhưng **chưa chạy**.

### 2. Commission và event — PAY-07, PAY-08

- [ ] T009 Tạo feature commission-rules: Admin GET/POST, authorization, audit, versioned rules không overlap; snapshot rate/fee/earning nguyên, half-up tại `order.created`.
  - Một phần: snapshot rate/fee/earning tại `order.created` đã có và test; Admin GET/POST/audit **chưa làm** (chờ quyền Admin).
- [ ] T010 Áp dụng transactional inbox/outbox, ACK sau commit, retry có giới hạn/DLQ; consume created/completed/cancelled, xử lý duplicate/out-of-order và không tự trừ ví.
  - Một phần: inbox giao dịch, retry có backoff/giới hạn, `dead`, ACK sau khi lưu lỗi/NACK khi không lưu được, consumer created/completed/cancelled (duplicate, completed-trước-created → retry) và consumer `wallet.topup.credited`/`wallet.withdrawal.requested` đã có + unit test. Chưa kiểm thử với PostgreSQL/RabbitMQ thật; DLQ replay chờ PO.
- [ ] T011 Giữ `payment.pending`, `processing`, `succeeded`, `failed`, `cancelled`, `refunded` tương thích với Order và các consumer hiện hữu; test replay và hợp đồng payload.
  - Một phần: phát `payment.pending` (order.completed), `succeeded`, `failed`, `cancelled` qua outbox; `processing` không phát event; chưa test hợp đồng với consumer Order/Tracking/Notification thật.

### 3. Payment Order — PAY-02 đến PAY-05

- [ ] T012 `POST /payments`: xác minh Order completed, owner, amount/currency và trạng thái qua Order internal; upsert theo order, giữ snapshot, chỉ đổi method an toàn, không charge.
  - Một phần: đã làm và unit test (owner, eligibility, amount mismatch, đổi method an toàn, không charge). Không tạo payment mới nếu `order.created` chưa xử lý (409) để không áp commission hồi tố.
- [ ] T013 `POST /payments/:id/confirm-cash`: đúng Worker xác nhận, attempt và succeeded idempotent, ghi receivable; thu phí Wallet nếu đủ, thiếu giữ nợ, không credit Worker.
  - Một phần: đã làm và unit test, gồm thu commission qua Wallet và giữ `due` khi thiếu; sweep thu lại trong reconciliation. Chưa test với Wallet thật.
- [ ] T014 `POST /payments/:id/pay-with-points`: đúng Customer chủ động; attempt/operation cố định, Wallet debit/split atomic; chỉ succeeded sau xác nhận, timeout tra cứu trước retry, không tạo attempt mới khi outcome chưa rõ.
  - Một phần: đã làm và unit test (xác nhận `confirm:true`, attempt cố định, chỉ 4xx chắc chắn mới failed, tra cứu operation, reconcile cùng operation). Từ chối Point khi worker earning = 0 (chờ PO). Chưa test với Wallet thật.
- [ ] T015 `GET /payments/:id`, `/payments/order/:orderId`, `/payments/me`, `/:id/attempts`: đã triển khai owner/Worker, phân trang/filter, serialize BIGINT và redaction; quyền Admin toàn hệ thống chờ chốt permission.
  - Một phần: 6 HTTP integration tests xác minh JWT, quyền Customer/Worker, pagination, BIGINT và redaction; Admin chưa được bật.
- [ ] T016 Test quyền, order chưa complete, amount mismatch, thay method, race/double click, thiếu tiền, lỗi Wallet, timeout sau commit và replay không debit hai lần.
  - Một phần: unit test cho các ca trên (mock); double click có test PostgreSQL với `FOR UPDATE` đã viết nhưng chưa chạy; replay không debit hai lần dựa vào idempotency Wallet theo `paymentId:attemptId`, chưa chứng minh với Wallet thật.

### 4. Refund — PAY-06

- [ ] T017 `POST/GET /payments/:id/refunds`: kiểm tra quyền, trạng thái, idempotency và cap bao gồm in-flight; khóa payment/accumulator và test concurrent.
  - Chưa làm: chờ PO (Cash refund, Admin, partial refund).
- [ ] T018 Point refund gọi Wallet với funding/reversal hợp lệ; thiếu nguồn `needs_review`, không mint. Cash refund có xác nhận thủ công, không giả lập chuyển khoản.
  - Chưa làm: chờ PO (nguồn bù Point, quy trình Cash refund).
- [ ] T019 Test full/partial, rounding tích lũy, duplicate, mismatch, timeout, rollback và compatibility projection; partial downstream để tắt đến khi được duyệt.
  - Chưa làm: phụ thuộc T017–T018.

### 5. Top-up — PAY-09, PAY-10

- [ ] T020 `POST/GET /payments/topups`: provider adapter, amount/idempotency/txnRef/expiry, kiểm soát replay và ownership; alias cũ ở Gateway nếu còn dùng.
  - Một phần: `POST/GET /payments/topups`, `GET /payments/topups/:id` đã có + unit test (idempotency, ownership, 1 VND = 1 Point, hết hạn 15 phút). Trả 503 khi VNPAY chưa cấu hình. Chưa có alias Gateway.
- [ ] T021 Với VNPAY sandbox đã chọn, triển khai và xác minh signature, credentials, reference, status và amount theo contract; redaction, duplicate/out-of-order, không tin return URL. Chưa có adapter hoặc credentials cấu hình.
  - Một phần: adapter VNPAY (ký HMAC-SHA512, xác minh IPN, amount ×100, redaction, dedupe `provider_notifications`) đã có + unit test theo thuật toán công khai. **Chưa xác minh với sandbox thật** và chưa có credentials; adapter tắt khi thiếu cấu hình.
- [ ] T022 Phát `payment.topup.succeeded` qua outbox sau callback hợp lệ; chỉ completed khi `wallet.topup.credited` đã xác minh; reconcile thiếu IPN/ACK/timeout.
  - Một phần: IPN hợp lệ → `credit_pending` + outbox; chỉ `completed` khi nhận `wallet.topup.credited`; credit không có bằng chứng provider → `needs_review`; sweep expire checkout và gắn `needs_review` khi thiếu ACK sau 1 giờ. Chưa test RabbitMQ/Wallet thật; chưa thống nhất envelope event với Wallet (xem PO-DECISIONS #10).
- [ ] T023 Test invalid signature/amount/expiry, duplicate, restart, Wallet ACK trễ; không phát credit khi không có bằng chứng provider.
  - Một phần: unit test đủ các ca chữ ký sai, amount sai, duplicate, IPN đến sau khi hết hạn, provider thất bại; chưa test restart/Wallet ACK trễ trên hạ tầng thật.

### 6. Payout giả lập — PAY-11

- [ ] T024 Consume `wallet.withdrawal.requested`, kiểm tra identity/amount/bank snapshot và idempotency, lưu payout trước dispatch; claim Wallet qua internal HTTP trước mock provider.
  - Một phần: consume, validate, idempotent, lưu payout trước dispatch, claim Wallet trước provider đã có + unit test. **Bank snapshot chưa có nguồn được duyệt**: `BankSnapshotProvider` mặc định không trả gì nên payout giữ `pending`, không claim/dispatch.
- [ ] T025 Dùng `PayoutProvider`/`MockPayoutProvider`, xử lý thành công/thất bại qua contract Wallet; timeout/unknown giữ hold và reconcile, không retry mù.
  - Một phần: đã có và unit test; outcome provider không rõ → `needs_review` giữ hold; kết quả cuối được báo lại Wallet idempotent qua sweep.
- [ ] T026 Tắt mock controls ngoài dev/sandbox và hiển thị rõ giả lập; test duplicate, crash, claim/cancel race và kết quả mâu thuẫn.
  - Một phần: mock tắt mặc định và luôn tắt khi `NODE_ENV=production`, payout lưu `is_simulated=true`; test duplicate/mâu thuẫn event, claim bị từ chối. Chưa test crash/claim-cancel race với Wallet thật.

### 7. Kiểm chứng và bàn giao — PAY-01 đến PAY-11

- [ ] T027 Tổ chức theo feature module NestJS với controller/service/DTO/tests riêng, tái sử dụng `@app/common`, `@app/auth`, `@app/rabbitmq`, outbox; cập nhật `backend/AGENTS.md` khi thêm thành phần dùng chung.
  - Một phần: đã tổ chức theo feature và cập nhật `backend/AGENTS.md`; refund/commission-admin chưa có.
- [ ] T028 Cập nhật gateway, cấu hình, health, deployment và tài liệu liên quan; provider callback có auth/signature policy riêng, không expose internal API.
  - Một phần: README, `.env.example` đã cập nhật; IPN xác thực bằng chữ ký riêng. **Chưa** chỉnh Gateway để public route IPN và chưa cập nhật deployment/health.
- [ ] T029 Unit + integration PostgreSQL/RabbitMQ + HTTP E2E bao phủ Cash, Point, refund, top-up, payout, retry, duplicate, cạnh tranh và đối soát; dùng hạ tầng test tách biệt.
  - Một phần: unit test cho Cash, Point, top-up, payout, retry, duplicate, reconciliation; integration PostgreSQL đã viết chưa chạy; chưa có RabbitMQ/HTTP E2E cho các luồng mới; refund chưa có.
- [ ] T030 Chạy `pnpm test apps/payment-service`, `pnpm run typecheck`, `pnpm run lint`, Payment build và test tích hợp mục tiêu trên trạng thái mới nhất; kết quả và giới hạn được ghi ở phần tiến độ. Việc này không thay thế độ phủ tài chính của T029.
  - Một phần: unit (110), E2E, build, lint đạt; typecheck toàn backend vướng lỗi Tracking Service; integration PostgreSQL chưa chạy (không có hạ tầng).
- [ ] T031 Báo phần đã chứng minh, phần chưa chạy và các gate cần PO duyệt. Không bật provider/payout thật.
  - Một phần: xem phần tiến độ và `PO-DECISIONS.md`.

## Tiếp tục ở lượt sau

1. Khi có PostgreSQL test riêng và RabbitMQ test: chạy migration mới và `pnpm run test:integration:payment` (gồm `payment-flows.int-spec.ts`), sửa lỗi nếu có; thêm kiểm thử Payment–Wallet–Order liên service.
2. Sau khi PO chốt: seed commission, quyền Admin + API commission, refund (Cash/Point/partial), nguồn bank snapshot, retention/DLQ replay; chốt envelope event top-up với Wallet.
3. Cấu hình Gateway cho IPN VNPAY (public, chỉ xác thực chữ ký) và xác minh contract/response VNPAY sandbox với credentials được cấp.
4. Cập nhật checklist/README và tick từng task chỉ khi có bằng chứng tích hợp tương ứng.

Không đánh dấu hoàn thành PAY-01–PAY-11 chỉ dựa trên code nền tảng hoặc unit test với mock; mỗi task cần các contract, luồng và bằng chứng kiểm thử tương ứng. Các quyết định chưa được PO duyệt tiếp tục ghi vào mục cần xác nhận/PR thay vì tự đặt mặc định.

## Ánh xạ yêu cầu

| Jira | Checklist |
|---|---|
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
