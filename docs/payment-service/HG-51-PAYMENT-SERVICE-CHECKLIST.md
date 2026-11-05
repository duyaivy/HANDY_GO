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

Tiến độ 03/11/2026, nhánh `feature/HG-51-payment-service`: đã tạo Prisma schema/client, migration ban đầu, hàm tính tiền chính xác, API tra cứu Customer/Worker và client Order eligibility. Client Order đã có unit test nhưng **chưa được nối vào luồng tạo hoặc thanh toán**.

- Lượt gần nhất đã thêm migration cho `failed_inbound_events` và `payouts.payout_operation_id`, state machine Payment/attempt có unit test, `WalletClient`, các helper tạo payload event, outbox repository/service và `PaymentDatabaseModule`. Đây mới là nền tảng, chưa phải các luồng hoàn chỉnh.
- `PaymentDatabaseModule` và outbox mới **chưa được wire** vào ứng dụng; `PaymentQueryModule` vẫn dùng Prisma provider riêng, `WalletClient` chưa được sử dụng, `main.ts` chưa kết nối RabbitMQ consumer. Chưa có inbox/consumer/retry processor thực thi.
- Sau các thay đổi gần nhất: `pnpm test apps/payment-service` đạt **43 test / 5 file**, `pnpm run typecheck` đạt. Đây không phải bằng chứng chạy nghiệp vụ tài chính.
- Trước các thay đổi gần nhất: 13 integration test PostgreSQL 16 riêng (7 schema, 6 HTTP/JWT), Payment build và lint đã đạt; migration **ban đầu** đã chạy trên database test riêng. Migration mới chưa chạy trên PostgreSQL; cần chạy lại integration test, build và lint cho trạng thái hiện tại.
- Chưa có luồng tạo/charge, refund, top-up VNPAY hay payout mock; chưa kiểm thử Payment–Wallet, race/lock hoặc RabbitMQ.
- Chưa tạo commit hoặc PR. Tại lần kiểm tra gần nhất, checklist **không bị ignore** nhưng vẫn chưa được Git theo dõi; `.gitignore` có thay đổi sẵn của người dùng, không tự ý sửa hoặc revert.

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
  - Một phần: đã có helper chuyển trạng thái Payment/attempt và test; chưa wire vào luồng nghiệp vụ, chưa có CAS/locking, retry hoặc idempotency thực thi.
- [ ] T007 Seed commission default chỉ sau khi PO chốt. Khi chưa có rule hợp lệ phải fail closed, không tự mặc định zero.
- [ ] T008 Test migration DB test riêng: tạo mới, unique/check, rollback/lock và schema isolation; không trỏ tới production.
  - Một phần: 7 test schema đã chạy trên PostgreSQL test riêng, có rollback từng test; chưa kiểm thử lock và cạnh tranh.

### 2. Commission và event — PAY-07, PAY-08

- [ ] T009 Tạo feature commission-rules: Admin GET/POST, authorization, audit, versioned rules không overlap; snapshot rate/fee/earning nguyên, half-up tại `order.created`.
- [ ] T010 Áp dụng transactional inbox/outbox, ACK sau commit, retry có giới hạn/DLQ; consume created/completed/cancelled, xử lý duplicate/out-of-order và không tự trừ ví.
  - Một phần: đã thêm repository/service và helper payload outbox cùng schema lưu inbound lỗi; chưa wire publisher, inbox, consumer hay retry/DLQ, và chưa kiểm thử giao dịch hoặc RabbitMQ.
- [ ] T011 Giữ `payment.pending`, `processing`, `succeeded`, `failed`, `cancelled`, `refunded` tương thích với Order và các consumer hiện hữu; test replay và hợp đồng payload.

### 3. Payment Order — PAY-02 đến PAY-05

- [ ] T012 `POST /payments`: xác minh Order completed, owner, amount/currency và trạng thái qua Order internal; upsert theo order, giữ snapshot, chỉ đổi method an toàn, không charge.
- [ ] T013 `POST /payments/:id/confirm-cash`: đúng Worker xác nhận, attempt và succeeded idempotent, ghi receivable; thu phí Wallet nếu đủ, thiếu giữ nợ, không credit Worker.
- [ ] T014 `POST /payments/:id/pay-with-points`: đúng Customer chủ động; attempt/operation cố định, Wallet debit/split atomic; chỉ succeeded sau xác nhận, timeout tra cứu trước retry, không tạo attempt mới khi outcome chưa rõ.
- [ ] T015 `GET /payments/:id`, `/payments/order/:orderId`, `/payments/me`, `/:id/attempts`: đã triển khai owner/Worker, phân trang/filter, serialize BIGINT và redaction; quyền Admin toàn hệ thống chờ chốt permission.
  - Một phần: 6 HTTP integration tests xác minh JWT, quyền Customer/Worker, pagination, BIGINT và redaction; Admin chưa được bật.
- [ ] T016 Test quyền, order chưa complete, amount mismatch, thay method, race/double click, thiếu tiền, lỗi Wallet, timeout sau commit và replay không debit hai lần.

### 4. Refund — PAY-06

- [ ] T017 `POST/GET /payments/:id/refunds`: kiểm tra quyền, trạng thái, idempotency và cap bao gồm in-flight; khóa payment/accumulator và test concurrent.
- [ ] T018 Point refund gọi Wallet với funding/reversal hợp lệ; thiếu nguồn `needs_review`, không mint. Cash refund có xác nhận thủ công, không giả lập chuyển khoản.
- [ ] T019 Test full/partial, rounding tích lũy, duplicate, mismatch, timeout, rollback và compatibility projection; partial downstream để tắt đến khi được duyệt.

### 5. Top-up — PAY-09, PAY-10

- [ ] T020 `POST/GET /payments/topups`: provider adapter, amount/idempotency/txnRef/expiry, kiểm soát replay và ownership; alias cũ ở Gateway nếu còn dùng.
- [ ] T021 Với VNPAY sandbox đã chọn, triển khai và xác minh signature, credentials, reference, status và amount theo contract; redaction, duplicate/out-of-order, không tin return URL. Chưa có adapter hoặc credentials cấu hình.
- [ ] T022 Phát `payment.topup.succeeded` qua outbox sau callback hợp lệ; chỉ completed khi `wallet.topup.credited` đã xác minh; reconcile thiếu IPN/ACK/timeout.
- [ ] T023 Test invalid signature/amount/expiry, duplicate, restart, Wallet ACK trễ; không phát credit khi không có bằng chứng provider.

### 6. Payout giả lập — PAY-11

- [ ] T024 Consume `wallet.withdrawal.requested`, kiểm tra identity/amount/bank snapshot và idempotency, lưu payout trước dispatch; claim Wallet qua internal HTTP trước mock provider.
- [ ] T025 Dùng `PayoutProvider`/`MockPayoutProvider`, xử lý thành công/thất bại qua contract Wallet; timeout/unknown giữ hold và reconcile, không retry mù.
- [ ] T026 Tắt mock controls ngoài dev/sandbox và hiển thị rõ giả lập; test duplicate, crash, claim/cancel race và kết quả mâu thuẫn.

### 7. Kiểm chứng và bàn giao — PAY-01 đến PAY-11

- [ ] T027 Tổ chức theo feature module NestJS với controller/service/DTO/tests riêng, tái sử dụng `@app/common`, `@app/auth`, `@app/rabbitmq`, outbox; cập nhật `backend/AGENTS.md` khi thêm thành phần dùng chung.
- [ ] T028 Cập nhật gateway, cấu hình, health, deployment và tài liệu liên quan; provider callback có auth/signature policy riêng, không expose internal API.
- [ ] T029 Unit + integration PostgreSQL/RabbitMQ + HTTP E2E bao phủ Cash, Point, refund, top-up, payout, retry, duplicate, cạnh tranh và đối soát; dùng hạ tầng test tách biệt.
- [ ] T030 Chạy `pnpm test apps/payment-service`, `pnpm run typecheck`, `pnpm run lint`, Payment build và test tích hợp mục tiêu trên trạng thái mới nhất; kết quả và giới hạn được ghi ở phần tiến độ. Việc này không thay thế độ phủ tài chính của T029.
- [ ] T031 Báo phần đã chứng minh, phần chưa chạy và các gate cần PO duyệt. Không bật provider/payout thật.

## Tiếp tục ở lượt sau

1. Hoàn thiện và kiểm thử nền tảng trước khi triển khai nghiệp vụ: chạy migration mới trên PostgreSQL test riêng; wire database/outbox dùng chung mà không phá test query; triển khai inbox, consumer, ACK/NACK, retry có giới hạn và replay an toàn; kết nối RabbitMQ trong `main.ts`.
2. Rà soát `WalletClient` và outbox trước khi dùng cho tiền thật: xác minh contract và response từng endpoint, phân biệt timeout/kết quả không chắc chắn với từ chối chắc chắn, kiểm tra header IP tin cậy; bảo đảm event được ghi cùng transaction thay đổi nghiệp vụ và kiểm thử duplicate/concurrency.
3. Triển khai commission rules và consumer `order.created/completed/cancelled`; fail closed khi chưa có rule, snapshot chính xác và xử lý duplicate/out-of-order. Không tự chốt tỷ lệ hoặc permission Admin.
4. Triển khai tạo Payment, Cash và Point; kiểm tra quyền, eligibility, locking, idempotency và tra cứu Wallet khi outcome chưa rõ. Sau đó làm refund có cap và xử lý Point/Cash đúng contract.
5. Triển khai top-up VNPAY sandbox, IPN/return và Wallet ACK; sau đó payout mock với claim/status Wallet, xử lý outcome không chắc chắn và đối soát. Không bật provider hoặc payout thật.
6. Cập nhật README, các vấn đề cần báo trong PR và checklist theo kết quả thực tế; chạy lại unit, typecheck, lint, build, PostgreSQL integration, Gateway và kiểm thử liên service/RabbitMQ khi hạ tầng cho phép.

Không đánh dấu hoàn thành PAY-01–PAY-11 chỉ dựa trên code nền tảng; mỗi task cần các contract, luồng và bằng chứng kiểm thử tương ứng. Các quyết định chưa được PO duyệt tiếp tục ghi vào mục cần xác nhận/PR thay vì tự đặt mặc định.

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
