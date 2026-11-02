# Định hướng triển khai HandyGo: Wallet trước, Payment sau

Tài liệu phản hồi các câu hỏi trong báo cáo của đồng đội, để cả nhóm và AI triển khai theo cùng một phạm vi. Người thực hiện có hai task Wallet Service và Payment Service, nhưng **làm Wallet trước**.

> **Trạng thái tài liệu:** đã chốt Wallet triển khai trước Payment, và Wallet gọi User Trust qua **HTTP internal** để xác minh bank account. Các giá trị mặc định bên dưới là hướng triển khai được đề xuất; thông tin môi trường và các quyết định chưa được chủ dự án xác nhận được ghi rõ. Không xem tài liệu này là bằng chứng các service đã kết nối hoặc test thành công.

## 0. Trả lời trực tiếp các thông tin đồng đội đang cần

Đây là phần bạn có thể gửi nguyên văn cho đồng đội/AI. Các mục “đề xuất” là mặc định có thể dùng để chuẩn bị và kiểm thử local; không phải thông tin đã kiểm tra trên máy của đồng đội hoặc chính sách production đã được duyệt.

### 0.1. Môi trường integration test

1. **Lựa chọn:** đề xuất tạo Docker Compose test riêng với PostgreSQL và RabbitMQ chạy local; không dùng staging/production. Testcontainers không bắt buộc. Người chạy test cần bật Docker daemon; chưa xác nhận trạng thái daemon trên máy đồng đội.
2. **Database:** dùng database test riêng, schema `wallet_service`. `DATABASE_URL_WALLET` phải do người chạy cấu hình trỏ chính xác tới database test. **Chưa có connection string hoặc port cụ thể được xác nhận**; AI tạo `.env` mẫu với giá trị test local và báo lại URL không chứa secret. Không đưa URL production vào tài liệu hay log.
3. **Migration:** được chuẩn bị và chạy `prisma migrate deploy` trên database test riêng do nhóm tạo sau khi kiểm tra đích kết nối. Không chạy trên production; staging/shared database cần chủ môi trường xác nhận riêng.
4. **RabbitMQ:** tạo broker test riêng, dùng exchange/queue có tên riêng theo cấu hình test; không khẳng định đã có URL, tên exchange hay queue cụ thể. Đề xuất tối đa 3 lần retry **sau lần xử lý đầu**, với backoff 5 giây → 30 giây → 5 phút; cấu hình được. Test có thể dùng delay ngắn hơn trong môi trường test.
5. **Redis:** chưa xác nhận có bắt buộc. Kiểm tra dependencies thực tế; nếu Wallet/runtime test không cần Redis thì không thêm Redis làm điều kiện chạy. Nếu cần, thêm Redis test riêng.

### 0.2. Bank account verifier — đã chốt HTTP internal

- **Bên gọi:** Wallet Service. **Bên xác minh:** User Trust Service, port 3002.
- **Transport:** HTTP request/response nội bộ; dùng service authentication `x-internal-secret`. Không chuyển flow này sang RabbitMQ RPC. RabbitMQ vẫn có thể được dùng cho event và các luồng khác trong hệ thống.
- **Contract mong muốn:** `POST` với body `{ "userId": "<uuid>", "bankAccountId": "<uuid>" }`; service trả thông tin `owned` và `active`. Wallet chỉ tạo withdrawal mới khi cả hai là `true`; missing configuration, timeout, lỗi mạng, HTTP lỗi, sai format hoặc kết quả âm tính đều fail-closed, không tạo withdrawal/hold.
- **Đường dẫn/response thực tế:** đồng đội kiểm tra route, global prefix và response envelope ở code đang làm trước khi kết nối. `BANK_ACCOUNT_VERIFIER_URL` phải trỏ tới URL đã kiểm chứng; ví dụ Docker `http://user-trust-service:3002/api/v1/internal/users/verify-bank-account` chỉ đúng nếu global prefix thực sự áp dụng cho route. Host-local có thể dùng `localhost:3002` với path tương ứng. Báo cáo code verifier của đồng đội chưa thấy trong snapshot PR `0492104`; cần xác nhận nhánh/commit thực tế.
- **Timeout/retry mặc định đề xuất:** 3 giây, cấu hình được; không retry tự động trong cùng HTTP request ở giai đoạn đầu. Client retry dùng cùng idempotency key; nếu withdrawal đã tạo hợp lệ phải replay ổn định. Không mở DB transaction trong lúc chờ User Trust.
- **Ý nghĩa `active`:** theo báo cáo đồng đội, hiện chỉ suy ra user active; chưa chứng minh bank account active riêng hoặc provider đã xác minh. Cần ghi rõ hạn chế này trong contract, không tự tuyên bố có bank-account status.

### 0.3. Payout handshake — Wallet trước, Payment sau

1. **Dispatch:** Payment chịu trách nhiệm điều phối payout; trong task Wallet, dùng mock Payment/provider để test contract. Chưa có provider thật hoặc Payment end-to-end được xác nhận.
2. **Claim:** Payment/mock gọi Wallet qua internal HTTP để chuyển `requested → processing` bằng conditional update/locking. Bước claim phải thắng cancel trước khi Payment dispatch payout.
3. **Giao tiếp đề xuất:** Wallet phát `wallet.withdrawal.requested` qua RabbitMQ; Payment/mock gọi claim qua HTTP internal. Nếu code hiện tại có contract khác, đồng đội đối chiếu và báo chênh lệch trước khi ghép hai service; các endpoint cụ thể phải được thiết kế/ghi trong API contract, không coi tên ví dụ là đã tồn tại.
4. **Callback:** Payment báo kết quả xác minh `succeeded` hoặc `failed` với `withdrawalId`, `payoutOperationId` và khóa idempotency ổn định. Cùng operation và payload/kết quả lặp lại phải trả kết quả cũ. Kết quả mâu thuẫn đưa `needs_review`, lưu bằng chứng.
5. **Cancel/unknown:** chỉ release hold khi cancel thắng trước claim hoặc failure/cancel được Payment xác nhận chắc chắn theo contract. `processing`, timeout, crash hoặc kết quả chưa rõ giữ hold để đối soát. Success sau cancel là mâu thuẫn cần điều tra; không im lặng bỏ qua và không tự chuyển tiền lần hai.
6. **Sandbox/mock:** cho phép dùng mock trong integration test; **chưa xác nhận có sandbox/provider payout thật**. Provider phải hỗ trợ idempotency/tra cứu hoặc có quy trình review khi kết quả không rõ; không tự retry payout thật một cách mù quáng.

### 0.4. RabbitMQ DLQ

- **Đề xuất:** RabbitMQ retry queues + DLQ; không bắt buộc thêm bảng `dead_letter_events` nếu chưa có yêu cầu lưu trữ/vận hành riêng. Nếu cần audit bền vững, thiết kế bảng theo nhu cầu thực tế mà không log dữ liệu nhạy cảm.
- **Retry đề xuất:** 3 lần sau lần xử lý đầu, backoff 5 giây → 30 giây → 5 phút; timeout/lỗi tạm thời retry có delay, lỗi payload/conflict không thể tự khỏi đưa DLQ/quarantine. Không requeue nóng vô hạn.
- **Replay:** người vận hành kiểm tra/sửa nguyên nhân rồi replay có kiểm soát; giữ business operation/event identity, ghi người thao tác và kết quả; consumer vẫn phải idempotent.
- **Masking/retention:** không log secret, thông tin ngân hàng đầy đủ; giới hạn quyền đọc. **Thời gian lưu cụ thể chưa chốt**, do chủ dự án quyết định theo nhu cầu vận hành.

### 0.5. Adjustment audit và identity

- **Actor:** `x-user-id` do Gateway inject sau xác thực; có thể lưu thêm `x-user-account-id` nếu Gateway cung cấp. Đồng đội kiểm tra claim/header thực tế và chống client spoofing trước khi tin giá trị.
- **Audit đề xuất:** actor, target, operation/idempotency key, amount/direction, reason, timestamp, correlation ID, service/role khi cần; lưu cùng transaction với ledger. IP chỉ lưu nếu xuất phát từ chuỗi proxy tin cậy.
- **Quyền đọc:** Admin có permission phù hợp. **Retention chưa có quyết định cụ thể**; cấu hình được và báo chủ dự án xác nhận.

### 0.6. Refund

- **Nguồn không đủ:** đề xuất `needs_review`; không tự credit thêm và không tự dùng tiền Platform bù nếu chưa được phê duyệt. Payment dự kiến sở hữu lifecycle refund; Wallet sở hữu kết quả ledger operation. Đây là đề xuất nghiệp vụ cần nhóm chốt trước tích hợp Payment thật.
- **Rounding:** đề xuất tính allocation theo tổng refund lũy kế rồi trừ lượng đã thu hồi từng nguồn; quy tắc ổn định để khi hoàn đủ thì Worker/Platform được thu hồi đúng allocation gốc.
- **Accumulator:** đề xuất có accumulator theo payment gốc hoặc cơ chế tương đương được lock. Cap check, replay/owner, allocation và ledger/outbox phải cùng transaction.
- **Concurrency test:** chạy được đề xuất trên PostgreSQL test riêng; chưa xác nhận Docker/database trên máy đồng đội đã sẵn sàng. Test hai refund đồng thời không vượt payment gốc.

### 0.7. Full backend typecheck

Chạy full backend typecheck nếu môi trường cho phép. Nếu lỗi Notification do thay đổi Wallet gây ra thì xử lý; nếu lỗi đã tồn tại độc lập thì ghi chính xác file/lỗi và báo blocker ngoài phạm vi. Không tự refactor Notification khi chưa xác định nguyên nhân. Không báo full typecheck xanh nếu chưa chạy hoặc đang lỗi.

### 0.8. Những thông tin đồng đội cần phản hồi sau khi chuẩn bị

1. Nhánh/commit chứa bank verifier; URL, prefix, response envelope và quyền gọi thực tế.
2. Docker daemon đã chạy chưa; test DB/broker được tạo ở đâu, cổng và tên database/exchange/queue test **không kèm mật khẩu**.
3. Redis có thực sự cần cho test Wallet không; kết quả migration/test trên database test.
4. Những contract payout/refund còn khác với phương án trên; trạng thái mock và những phần chờ Payment thật.
5. Các giá trị audit retention và quyền replay DLQ cần chủ dự án quyết định; kết quả full typecheck và blocker ngoài phạm vi.

## 1. Bối cảnh kiểm tra

Ngày 27/10/2026 đã đọc một số file của [PR #27](https://github.com/duyaivy/HANDY_GO/pull/27) tại head `0492104a0e189be1ca501d7287e402f75e877f14`. PR vẫn mở tại thời điểm kiểm tra. Head này giống snapshot trong báo cáo review lần hai.

- `backend/docker-compose.yml` ở snapshot này khai báo các service ứng dụng và các URL hạ tầng; không có service container PostgreSQL, RabbitMQ hoặc Redis trong file đó.
- Withdrawal trong snapshot này vẫn tạo hold và event, kiểm tra status khi cancel; chưa thấy handshake processing với Payment trong các file đã đọc.
- Các thay đổi `verify-bank-account` và `BANK_ACCOUNT_VERIFIER_URL` mà báo cáo đồng đội mô tả **không thấy trong các file tương ứng trên head PR được kiểm tra**. Có thể thay đổi nằm ở workspace local, commit chưa push hoặc nhánh khác. Không kết luận đồng đội chưa triển khai; hãy xác định source thật và commit/push hoặc ghi rõ cách tích hợp trước khi review lại.
- Không truy cập máy Docker của đồng đội; thông tin Docker daemon chưa chạy là thông tin trong báo cáo, không phải trạng thái đã được kiểm chứng ở máy đó.

Mục tiêu tài liệu này là trả lời các quyết định cần thiết, **không thay thế review code, test runtime hoặc xác nhận của chủ dự án**.

## 2. Chia phạm vi hai giai đoạn

| Nội dung | Giai đoạn 1 — Wallet trước | Giai đoạn 2 — Payment sau |
| --- | --- | --- |
| Ledger và balance | Hoàn thiện Wallet DB, transaction, locking, idempotency, query, audit, outbox/inbox. | Gọi Wallet qua contract và đối soát. |
| Thanh toán Point | Cung cấp internal operation transfer customer → worker/platform, query kết quả, test bằng caller giả. | Thực hiện payment orchestration, quyết định attempt, gọi và xử lý timeout/reconciliation. |
| Refund | Wallet kiểm tra hạn mức, nguồn thu hồi, bút toán và idempotency; trả kết quả hoặc needs_review rõ ràng. | Sở hữu quy trình yêu cầu refund, theo dõi trạng thái và xử lý needs_review theo contract. |
| Top-up | Consumer nhận event mô phỏng đúng contract, dedup và cộng Point an toàn. | Tích hợp provider, xác minh callback và phát event hợp lệ. |
| Withdrawal/payout | Wallet quản lý withdrawal, hold, claim/cancel/finalization an toàn; có mock Payment để test. | Payment nhận request, claim, gọi MockPayoutProvider hoặc provider đã được chọn, xác nhận và đối soát kết quả. |
| Provider | Không tích hợp trực tiếp vào Wallet. | Thiết kế adapter; VNPAY, Payoo hoặc provider khác chỉ là phương án, không mặc định chọn. |

**Nguyên tắc:** không cần Payment thật để kiểm thử transaction Wallet và giao thức với mock. Tuy nhiên, test mock không chứng minh Payment thật, webhook provider hay chuyển tiền thật hoạt động. Các chức năng chưa có đầu gọi an toàn hoặc chưa được kiểm thử nên để **feature flag tắt theo mặc định hoặc không expose cho người dùng**, tùy kiến trúc repo hiện tại.

## 3. Trả lời từng mục đồng đội cần

### 3.1. Hạ tầng test

**Đề xuất:** tạo compose test riêng, ví dụ `backend/docker-compose.wallet-test.yml`, gồm PostgreSQL và RabbitMQ dành riêng cho test. Dùng port tách biệt, credential dev/test riêng và volume/project name test để không đụng môi trường đang chạy.

1. **PostgreSQL:** database riêng cho test; cấu hình `DATABASE_URL_WALLET` trỏ tới database này và schema `wallet_service`. Mỗi lần chạy phải kiểm tra rõ hostname, database, schema và môi trường trước khi migrate hoặc xóa dữ liệu. Tuyệt đối không trỏ tới production hoặc database thật có dữ liệu cần giữ.
2. **Migrations:** có thể chạy `prisma migrate deploy` và reset dữ liệu **trên database test được tạo riêng**, sau khi xác thực đích test. Việc cấp quyền thao tác lên staging/shared database phải được chủ môi trường xác nhận riêng; không tự cho phép dựa trên tài liệu này.
3. **Concurrency:** tạo ít nhất hai kết nối/transaction thực sự đồng thời; chạy các test double-spend, refund cap, claim/cancel race và duplicate request.
4. **RabbitMQ:** broker test riêng, được phép tạo exchange/queue/retry/DLQ trong broker đó. Đặt tên queue/exchange test để tránh dùng queue đang phục vụ hệ thống khác.
5. **Redis:** chỉ thêm container nếu luồng Wallet hoặc dependency runtime dùng trong bài test thực sự cần. Nếu các bài test Wallet không cần Redis, ghi rõ `not required` và không xem là blocker.
6. **Docker daemon:** người chạy test khởi động Docker Desktop/daemon. Nếu môi trường AI không thể điều khiển daemon, báo rõ blocker kèm lệnh chạy lại, không báo integration test pass.

Không cần yêu cầu người dùng gửi connection string production. AI có thể chuẩn bị cấu hình localhost test qua env mẫu; hãy chọn port trống theo môi trường thực tế.

### 3.2. Bank account verifier — User Trust

Đã chốt **User Trust là service xác minh tài khoản ngân hàng** và Wallet gọi **HTTP internal API** có service authentication; không đọc trực tiếp User Trust database, không dùng RabbitMQ RPC cho bước xác minh này.

**Trước khi tích hợp:** xác nhận code verifier thực sự có trong nhánh làm việc, request/response và global prefix. Theo bootstrap tại snapshot review cũ có prefix `api/v1`; đường dẫn thực tế phải được xác minh bằng routing/HTTP test. Ví dụ URL có thể là:

```text
http://user-trust-service:3002/api/v1/internal/users/verify-bank-account
```

Đây chỉ là ví dụ khi chạy cùng Docker network và route có prefix, **không phải URL đã được kiểm thử**. Khi Wallet chạy trực tiếp trên host, dùng host/port phù hợp với môi trường đó. Không hard-code URL trong business logic.

Contract dự kiến: `POST` body `{ userId, bankAccountId }`, header service secret, response rõ `owned` và `active`; cần thống nhất response envelope thực tế của repo, UUID validation, status code, timeout và correlationId. Wallet chỉ tạo withdrawal mới sau khi nhận xác nhận hợp lệ; lỗi kết nối, timeout, response sai, missing URL, `owned=false` hoặc `active=false` đều **fail closed**.

**Timeout/retry đề xuất:** timeout 3 giây cấu hình được; không tự retry đồng bộ trong request đầu tiên. Khi client retry cùng idempotency key, Wallet phải kiểm tra lại và trả kết quả ổn định nếu withdrawal đã được tạo, không tạo thêm hold. Nếu trước đó request chưa commit thì thử lại an toàn.

`UserBankAccount` chưa có status riêng theo báo cáo; vì vậy `active` suy ra từ user active chỉ chứng minh **user active**, không chứng minh bank account đang hoạt động với ngân hàng hoặc đã được xác minh bởi provider. Đặt tên/ghi chú contract đúng ý nghĩa; bổ sung bank-account state/verification sau nếu nghiệp vụ yêu cầu. Cần quan tâm thay đổi bank account giữa thời điểm xác minh và payout; Payment phải kiểm tra/đóng băng thông tin payout theo contract, không dùng xác minh cũ làm bảo đảm vĩnh viễn.

**Test:** ownership đúng/sai, account không có, user inactive, secret sai, URL sai/prefix, timeout, malformed response, retry và không tạo hold khi chưa xác minh.

### 3.3. Payout handshake — làm Wallet và mock trước

**Phân vai đề xuất:**

- Wallet là nguồn sự thật của `withdrawal`, `hold` và biến động Point.
- Payment là bên điều phối payout và chịu trách nhiệm trạng thái/đối soát với provider. Một mock Payment được phép mô phỏng trách nhiệm đó trong giai đoạn 1, nhưng không được gắn nhãn là Payment thực tế.
- Event `wallet.withdrawal.requested` có thể qua RabbitMQ. Trước khi Payment dispatch payout, Payment gọi API claim nội bộ của Wallet để nhận quyền xử lý. Claim và cancel phải là chuyển trạng thái nguyên tử được database bảo vệ.

**State transition đề xuất:**

| Từ | Hành động | Sang | Hold |
| --- | --- | --- | --- |
| `requested` | User cancel thắng trước claim | `cancelled` | Release một lần |
| `requested` | Payment claim thành công | `processing` | Giữ |
| `processing` | Payment xác nhận success | `succeeded` | Capture + debit ledger một lần |
| `processing` | Payment xác nhận thất bại chắc chắn | `failed` | Release một lần |
| `processing` | Timeout/unknown, kết quả mâu thuẫn | `needs_review` hoặc trạng thái tương đương | Giữ, chờ đối soát |

**Lưu ý:** cách gọi status hoặc tên endpoint do team thống nhất theo code, không tự xem tên ví dụ là endpoint đã tồn tại. Không có transition `processing → cancelled/released` chỉ vì client timeout; chỉ release nếu Payment/provider xác nhận dừng hoặc thất bại chắc chắn theo contract.

**Atomic claim/cancel:** dùng conditional update/row lock trong cùng transaction với hold và state. `requested → processing` và `requested → cancelled` phải loại trừ nhau; test hai kết nối DB cùng chạy để xác minh chỉ một nhánh thành công. Không mở HTTP call tới Payment trong transaction giữ DB lock.

**Callback và idempotency:** dùng `withdrawalId`, `payoutOperationId` ổn định và kết quả đã xác minh. Callback lặp cùng operation/kết quả trả kết quả cũ; cùng operation nhưng dữ liệu khác hoặc terminal result mâu thuẫn phải lưu/đưa vào `needs_review` và cảnh báo, không báo thành công giả. Callback `success` đến sau cancel là mâu thuẫn nghiêm trọng, giữ bằng chứng để đối soát; không tự ghi có/trừ tiền lần nữa theo suy đoán.

**Xử lý Payment crash:** claim xong nhưng chưa rõ đã gửi provider hay chưa phải giữ hold. Payment cần lưu payout operation trước khi dispatch và dùng idempotency của provider nếu hỗ trợ; không tự gửi lại payout chỉ vì hết timeout. Nếu provider không hỗ trợ idempotency/tra cứu, cần manual review. Không có cơ chế nào trong Wallet một mình bảo đảm provider bên ngoài chi tiền đúng một lần.

**Test phase 1:** Mock Payment/provider mô phỏng claim, success, failed, duplicate, callback trễ, timeout và crash. Fake provider chỉ dùng test; không chạy payout thật hoặc mặc định chọn provider.

### 3.4. Retry và DLQ RabbitMQ

**Đề xuất:** RabbitMQ retry queue + DLQ cho message xử lý thất bại. Có thể thêm bảng bền vững cho vận hành nếu team thấy cần, nhưng không yêu cầu tạo bảng chỉ để thay DLQ. Cần ghi rõ retry/DLQ của publisher outbox và retry/DLQ của consumer là hai cơ chế khác nhau.

| Tình huống | Xử lý đề xuất |
| --- | --- |
| Event đã xử lý cùng identity + payload hợp lệ | ACK sau khi xác nhận replay hợp lệ. |
| Payload malformed / sai version / conflict không thể tự khỏi | Chuyển DLQ/quarantine kèm lý do, không ACK rồi bỏ mất bằng chứng. |
| Dependency/DB lỗi tạm thời | Retry có delay và giới hạn; tránh `nack(requeue=true)` liên tục. |
| Quá số lần retry | Chuyển DLQ, log/metric và có hướng đối soát. |

**Default đề xuất:** tối đa 3 lần retry sau lần xử lý đầu, delay `5 giây → 30 giây → 5 phút`; cấu hình được. Đây là đề xuất vận hành, không phải số liệu đo đạc đã được benchmark. Xác nhận đầy đủ message delivery, routing, publisher confirm và crash window theo hạ tầng thực tế; consumer vẫn phải idempotent vì có thể nhận lại.

**Replay:** người vận hành kiểm tra và sửa nguyên nhân, sau đó replay có kiểm soát, giữ event/operation identity; không replay hàng loạt mù quáng. Ghi audit thao tác replay, số lần và kết quả. Không log service secret, số tài khoản đầy đủ hoặc dữ liệu nhạy cảm; dùng masking và giới hạn quyền đọc/retention theo cấu hình.

### 3.5. Adjustment audit và identity

**Đề xuất:** lấy `x-user-id` làm actor user ID và `x-user-account-id` nếu có từ Gateway đã xác thực; role/permission cũng từ trusted headers. Gateway phải xóa header do client cung cấp rồi inject lại, Wallet phải xác thực kênh/secret trước khi tin header. Kiểm tra middleware thực tế và test spoofing, không chỉ dựa vào tên header.

Lưu trong cùng DB transaction với adjustment: actor ID, target wallet/user ID, operation ID/idempotency key, direction/amount, reason, correlation ID, timestamp và kết quả. IP có thể lưu nếu đến từ chuỗi proxy tin cậy; không tin thẳng `X-Forwarded-For` từ client. Ghi source service/roles khi hữu ích và không log secret.

Chỉ admin có permission phù hợp được điều chỉnh và đọc audit. Retention nên cấu hình theo chính sách dự án; **chưa chốt thời gian cụ thể**. Tránh ghi reason vào trường referenceId ngắn nếu có thể dùng trường audit/metadata riêng có validation độ dài.

### 3.6. Refund và rounding

**Đề xuất nghiệp vụ:**

1. Hoàn theo payment gốc, owner và currency/đơn vị hợp lệ; tổng refund đã commit không vượt gross gốc.
2. Nếu nguồn Worker/Platform không đủ để thu hồi theo allocation, **không tự credit tiền mới và không tự lấy nguồn Platform bù**. Trả/ghi `needs_review` theo contract; ghi rõ một service sở hữu trạng thái quy trình để có thể tra cứu/retry sau review.
3. Đề xuất Payment sở hữu lifecycle của refund (`requested`, `completed`, `needs_review`…), Wallet sở hữu kết quả ledger operation và tra cứu operation. Nếu Wallet chưa có Payment, mock giữ phần lifecycle giả; tài liệu contract phải nói rõ chỗ lưu bền vững và lỗi khi chưa tích hợp. Không khẳng định mock là Payment thật.
4. Lưu accumulator/refund allocation theo payment gốc hoặc cơ chế tương đương; lock payment/accumulator, kiểm tra replay, tính total đã hoàn, kiểm tra giới hạn, ghi postings/ledger/outbox trong **cùng transaction**. Có thể retry serialization conflict có giới hạn bằng cách đọc lại state.
5. Chia theo **tổng refund lũy kế**, so với tổng từng source đã được thu hồi, và tính chênh lệch cho lần hiện tại; chốt quy tắc làm tròn ổn định. Đảm bảo khi hoàn đủ, recovery từng nguồn bằng đúng phần gốc từng nguồn nhận, trừ trường hợp nguồn bù được duyệt và ghi nhận riêng.
6. Replay cùng refund/payment/owner/amount trả kết quả cũ; cùng key nhưng payload/owner khác báo conflict/forbidden. Không bỏ qua owner khi replay.

**Test cần có:** 2 request 60/60 trên payment 100 với DB thật và ví nguồn đủ tiền; retry refund toàn phần sau timeout; 100 lần refund 1 với split 80/20; nguồn không đủ; rollback giữa posting/outbox; duplicate và mismatch payload. Chạy concurrency trên database test riêng như mục 3.1.

### 3.7. Typecheck Notification ngoài phạm vi Wallet

Ưu tiên hoàn tất Wallet. Chạy full backend typecheck theo yêu cầu repo và ghi kết quả. Nếu lỗi Notification phát sinh **do thay đổi Wallet**, sửa hoặc điều chỉnh thay đổi gây lỗi; nếu lỗi đã tồn tại độc lập, ghi nhận file/lỗi rõ ràng là blocker ngoài phạm vi. Không tự refactor Notification chỉ để làm xanh một check khi chưa xác định nguyên nhân và phạm vi.

Nếu full check không chạy được, phải báo **chưa chạy được** và lý do; không lấy kết quả mock/unit hoặc CI cũ để khẳng định full backend xanh. Thực hiện thêm unit, integration và typecheck mục tiêu Wallet theo script thực tế repo hỗ trợ.

## 4. Những phần cần làm trong task Wallet trước

1. Sửa các lỗi logic/bảo mật đã review: atomic refund, rounding, replay ownership, Wallet DB schema/raw SQL và money serialization cho mọi response.
2. Hoàn thiện withdrawal state machine, bank-account verifier, ownership, claim/cancel, callback idempotency, giữ hold khi chưa rõ kết quả.
3. Consumer validation, ACK/NACK, retry bounded, DLQ/replay; bảo vệ idempotency theo business operation, không chỉ message ID.
4. Adjustment actor audit; validate các API, service authentication và không trả dữ liệu chéo user.
5. Tạo test hạ tầng riêng; test PostgreSQL/RabbitMQ và mock Payment/provider; tài liệu setup, kết quả và giới hạn.
6. Cập nhật docs/status task: phân biệt Wallet tự hoạt động, mock đã test, và phần Payment/provider chưa triển khai.

Các phần liên quan Payment như API top-up thật, lựa chọn provider, verify callback, commission receivable, settlement thực tế và payout provider adapter thuộc task Payment tiếp theo. Có thể thống nhất contract từ bây giờ; không tuyên bố những phần đó đã hoàn tất trong task Wallet.

## 5. Điều kiện nghiệm thu / merge đề xuất

**Có thể xem xét merge Wallet giai đoạn 1 khi:**

- Các lỗi Wallet blocking đã được sửa và review lại; migration, typecheck và các test cần thiết có kết quả rõ ràng.
- Integration test dùng PostgreSQL và RabbitMQ test chứng minh transaction/locking, duplicate events, retry/DLQ, claim-cancel race, refund cap và rollback.
- Bank verifier đã có source được chia sẻ và test contract thực tế, hoặc withdrawal được tắt an toàn cho đến khi verifier sẵn sàng.
- Mock Payment chứng minh state transitions; luồng payout thật **được khóa hoặc chưa expose** cho đến khi Payment thực tế và provider được triển khai/đối soát.
- Không có dữ liệu production bị sử dụng cho test; tài liệu phân biệt rõ đã chạy, chưa chạy và giới hạn.

**Chưa coi là nghiệm thu end-to-end thật** nếu chưa có Payment service thật, provider callback verification, xử lý unknown/reconciliation và test tích hợp các service thực tế. Việc merge code và cho phép người dùng dùng tính năng tài chính là hai quyết định có thể tách biệt.

Trước khi merge PR còn phải kiểm tra lại GitHub mergeability, CI và base/head hiện tại. Lúc kiểm tra metadata PR #27, GitHub trả `mergeable: false`; trạng thái này có thể thay đổi và chưa đủ thông tin để xác định nguyên nhân xung đột cụ thể.

## 6. Báo cáo đồng đội/AI cần trả sau khi thực hiện

- Commit/nhánh thực tế, file thay đổi, migrations và feature flags.
- Bảng đối chiếu các yêu cầu Wallet: hoàn thành, một phần, chưa làm; chỉ rõ Payment thật hay mock.
- Cấu hình test không chứa secret; cách khởi chạy và dọn riêng môi trường test.
- Lệnh đã chạy và kết quả thực tế: unit, integration DB/RabbitMQ, concurrency, typecheck/lint; liệt kê lỗi/blocker ngoài phạm vi.
- Chi tiết state transitions, idempotency, timeout/unknown và reconciliation; bank verifier URL/prefix đã kiểm chứng.
- Các quyết định vẫn cần chủ dự án xác nhận, ví dụ retention audit, quyền vận hành replay và provider sau này.
