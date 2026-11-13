# Báo cáo review PR #27 — Wallet Service

**Kết luận: đề nghị sửa trước khi merge.** Nền tảng ledger có hướng thiết kế đúng, nhưng các luồng refund, withdrawal, top-up và event consumption còn lỗi ảnh hưởng tới tính đúng đắn tiền và khả năng vận hành. Không nên xem WAL-01…WAL-08 là đã hoàn tất chỉ dựa trên CI xanh.

## 1. Phạm vi và bằng chứng

| Mục | Giá trị |
| --- | --- |
| PR | https://github.com/duyaivy/HANDY_GO/pull/27 |
| Nhánh feature | `feature/HG-52-wallet-services` |
| Nhánh so sánh | `main` |
| Head đã review | `79035ac08be97ab31e3a2ef4e17dcfddf18ce90e` |
| Main/base đã kiểm tra | `41bad2b2bdbabe2520ce6f315e60e2a4410e974b` |
| Thay đổi | 74 file; +1.366 / −6 dòng |
| Ngày review | 25/10/2026, giờ Việt Nam |
| Yêu cầu đối chiếu | File đính kèm `Markdown đã dán (1)(4).md`, WAL-01…WAL-08 |
| Hành động trên GitHub | Chỉ đọc; chưa gửi comment, review hoặc request changes |

Đã đọc toàn bộ diff, các file mới của Wallet, cấu hình bootstrap/RabbitMQ, outbox dùng chung, route và auth tại Gateway, producer đăng ký tài khoản, cấu hình Prisma hiện có và các phần triển khai liên quan. Các liên kết bên dưới ghim vào head SHA để vị trí không thay đổi theo branch.

**Mức xác minh:** review tĩnh và chạy 7 kiểm tra logic có assertion bằng Node.js 24 trên phần thân service của đúng snapshot. Harness bỏ import/decorator để thay các dependency bằng fake; không thay đổi phần thân phương thức nghiệp vụ. Kết quả này không thay thế integration test PostgreSQL/RabbitMQ hoặc HTTP E2E. Chưa chạy lại toàn bộ Vitest/typecheck/lint của repo: workspace chỉ có snapshot phục vụ đọc, không có dependency backend, Prisma client đã generate hay database/broker test. Không coi các lệnh trong PR description là đã được reviewer chạy lại.

GitHub check-runs tại head: **Backend CI: success; CI Gate: success; Detect Changes: success; Frontend/Mobile: skipped**. Trạng thái này không chứng minh các bất biến tài chính và callback race đã được kiểm thử.

P1 = cần ưu tiên sửa trước khi merge/đưa tính năng vào sử dụng; P2 = lỗi đúng đắn, bảo mật hoặc khả năng vận hành cần sửa trong phạm vi feature. Không xếp P0 vì chưa có bằng chứng khai thác thực tế hoặc tác động vô điều kiện trên production.

## 2. Danh sách phát hiện

| ID | Mức | Vấn đề | Bằng chứng |
| --- | --- | --- | --- |
| F01 | P1 | Runtime Prisma chưa chọn schema Wallet đúng cách | Code + đối chiếu adapter và tài liệu |
| F02 | P1 | Consumer không ACK/NACK trong chế độ manual ACK | Code + cấu hình RabbitMQ |
| F03 | P1 | Provisioning nghe sai event và sai cấu trúc payload Auth | Đối chiếu consumer/producer |
| F04 | P1 | Hai refund có thể vượt tổng tiền gốc | Code + kiểm tra lịch thực thi có fake ledger |
| F05 | P1 | Retry refund đã thành công có thể trả lỗi thay vì replay | Kiểm tra logic đã chạy |
| F06 | P1 | Hủy withdrawal thả hold khi payout có thể đã được nhận | Kiểm tra logic đã chạy |
| F07 | P1 | Replay withdrawal trả dữ liệu của user khác | Kiểm tra logic đã chạy |
| F08 | P1 | Không xác minh ownership/trạng thái bank account khi rút | Code; thiếu yêu cầu WAL-07 |
| F09 | P1 | Top-up cùng payment có thể được cộng nhiều lần | Kiểm tra logic đã chạy |
| F10 | P1 | Nhiều endpoint trả BigInt thô sau khi transaction commit | Code + kiểm tra JSON serialization |
| F11 | P2 | Idempotency ledger không ràng buộc với nội dung operation | Kiểm tra logic đã chạy |
| F12 | P2 | DTO top-up không được validate trên đường RabbitMQ | Code + cấu hình hybrid application |
| F13 | P2 | Partial refund làm sai phân bổ thu hồi Worker/Platform | Phân tích số học từ code |
| F14 | P2 | Adjustment không lưu actor và audit context | Code; thiếu yêu cầu WAL-04 |
| F15 | P2 | Phân trang withdrawal không giới hạn hoặc validate | Code |

## 3. Chi tiết lỗi và cách sửa

### F01 — [P1] Chọn schema cho PrismaPg và raw SQL không nhất quán

**Vị trí comment:** [wallet-prisma.service.ts:18](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/wallet-ledger/wallet-prisma.service.ts#L18).

Constructor thêm `schema=wallet_service` vào connection string nhưng tạo adapter chỉ bằng `new PrismaPg({ connectionString: walletConnectionString })`. Với driver adapter, schema cần được cấu hình trong options của adapter. Mẫu đúng đã có trong `backend/libs/database/src/auth.prisma.service.ts`: `new PrismaPg({ connectionString }, { schema })`.

Migration được cấu hình hướng tới schema Wallet, trong khi runtime không truyền tùy chọn schema cho adapter. Trong triển khai dùng schema riêng như thiết kế, truy vấn ORM có thể đi vào `public` và không tìm thấy bảng. `WalletProvisioningService.onModuleInit()` lập tức upsert ví hệ thống nên lỗi có thể xuất hiện ngay khi khởi động.

Ngoài ra, các lệnh lock đang là `SELECT id FROM wallets ... FOR UPDATE` không ghi rõ schema. Sửa options của adapter chưa đủ để bảo đảm raw SQL dùng đúng bảng: cần schema-qualified SQL hoặc search_path được thiết lập và kiểm chứng trên chính connection transaction.

**Cách sửa:** thống nhất hàm resolve schema cho migrate/runtime; truyền `{ schema }` vào PrismaPg; qualify bảng trong raw query theo schema đã xác thực. Không nội suy identifier chưa kiểm soát từ input HTTP vào SQL. Cần xử lý cả trường hợp `DATABASE_URL` có schema của service khác; config migrate và runtime hiện có quy tắc fallback khác nhau.

**Test cần có:** database mới chỉ có bảng trong `wallet_service`, giữ `public` trống, chạy migration → boot → provision → balanced transfer → withdrawal; kiểm tra row lock thực sự khóa bảng Wallet. Chưa chạy integration test này trong phiên review.

### F02 — [P1] Consumer không ACK làm queue ngừng tiến triển

**Vị trí comment:** [topup-settlement.consumer.ts:8](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/topup-settlement/topup-settlement.consumer.ts#L8). Cùng lỗi tại [wallet-provisioning.consumer.ts:7](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/wallet-provisioning/wallet-provisioning.consumer.ts#L7).

`main.ts` dùng `createRabbitMQOptions('wallet-service-events')`. Hàm dùng chung bật `noAck: false`, `prefetchCount = 10`, nhưng cả hai handler chỉ `await` service, không nhận `RmqContext`, không ACK/NACK.

Với cấu hình này, return thành công từ handler không thay ACK. Khi số delivery chưa ACK đạt prefetch, consumer không nhận thêm công việc; message vẫn unacked và có thể được phát lại khi channel đóng. Handler lỗi cũng không có chính sách retry có giới hạn/DLQ tại consumer. Retry của outbox chỉ giải quyết việc publish, không giải quyết transaction thất bại ở consumer.

**Cách sửa:** lấy `@Ctx() context: RmqContext`; ACK sau khi commit, kể cả replay hợp lệ. Phân loại transient error để retry có backoff và giới hạn; malformed event đưa DLQ/quarantine; tránh requeue vòng lặp nóng. Reuse `RabbitMQContextService` hiện có nếu phù hợp.

**Test cần có:** publish hơn 10 event và xác nhận mọi event được xử lý; mất kết nối sau DB commit trước ACK phải replay an toàn; poison event không chặn các event hợp lệ tiếp theo.

### F03 — [P1] User đăng ký mới không được tạo ví từ event thực tế

**Vị trí comment:** [wallet-provisioning.consumer.ts:7](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/wallet-provisioning/wallet-provisioning.consumer.ts#L7).

Wallet subscribe `user.created` và đọc `event.userId ?? event.id`. Auth hiện phát `EVENT_PATTERNS.USER_REGISTERED = 'user.registered'`; payload ở `register-flow.service.ts` là envelope `{ eventId, eventVersion: 3, occurredAt, producer, data: { userId, accountId, ... } }`.

Có hai mismatch độc lập: tên event khác và `userId` nằm trong `data`. Chỉ đổi decorator thành `user.registered` vẫn chưa đủ. Không có thay đổi producer/bridge trong PR để chuyển thành contract Wallet đang nghe.

**Hậu quả:** đăng ký qua flow thật không tạo ví; API `/wallets/me` trả không tìm thấy; các luồng top-up/debit không có ví để xử lý. HTTP provisioning nội bộ không tự giải quyết việc đăng ký và backfill.

**Cách sửa:** thống nhất contract với Auth đang chạy, dùng constant và validate version/envelope; lấy `data.userId`; inbox dùng `eventId` của envelope. Nếu vẫn muốn `user.created`, cần producer/bridge thực tế và test được đường đi đó. Bổ sung cơ chế backfill có checkpoint cho user cũ theo WAL-02.

**Test cần có:** event nguyên bản lấy từ producer đăng ký thật tạo đúng một ví và một `wallet.created`; redelivery không tạo thêm.

### F04 — [P1] Kiểm tra tổng refund ngoài transaction cho phép over-refund

**Vị trí comment:** [refund-adjustment.service.ts:19](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts#L19).

`aggregate` tổng đã hoàn và kiểm tra hạn mức chạy trước `createBalancedTransfer`. Transaction Serializable chỉ bắt đầu bên trong ledger, nên không bao gồm điều kiện tổng refund.

**Tình huống:** payment gốc 100; hai yêu cầu refund khác ID, mỗi yêu cầu 60, đồng thời đọc tổng đã hoàn bằng 0. Cả hai qua kiểm tra 60 ≤ 100. Sau đó hai transaction ledger có thể chạy lần lượt và đều commit nếu ví nguồn đủ tiền. Khóa ví và Serializable trong ledger không ngăn được quyết định đã được đưa ra ngoài transaction. Ví nguồn có tiền từ các giao dịch khác là tình huống bình thường.

**Đã kiểm tra:** harness cho hai `aggregate` cùng trả 0, sau đó fake ledger ghi nhận tổng credit 120 trên payment 100. Đây là minh họa bằng thực thi phương thức thật với fake dependency, chưa phải thử đồng thời trên PostgreSQL.

**Cách sửa:** lock bản ghi payment/settlement hoặc refund accumulator; kiểm tra replay, tổng đã hoàn và ghi refund trong cùng transaction. Có thể dùng conditional update tăng `refundedAmount` với điều kiện không vượt gross. Ledger phải nhận transaction hiện tại thay vì tự mở transaction độc lập. Retry conflict Serializable phải đọc lại hạn mức.

**Test cần có:** hai refund 60 trên payment 100 với nguồn dư dả; chỉ một thành công. Tổng refund đã commit luôn ≤ tiền gốc.

### F05 — [P1] Retry refund thành công bị từ chối trước khi đến idempotency

**Vị trí comment:** [refund-adjustment.service.ts:20](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts#L20).

Service cộng `amount` vào tổng refund đã hoàn trước khi ledger tìm idempotency key. Nếu đã refund đầy đủ 100/100 và response bị timeout, retry cùng `refundId` vẫn kiểm tra `100 + 100 > 100` rồi trả 409. Refund một phần cũng lỗi khi tổng hiện tại cộng lại amount vượt hạn mức.

**Hậu quả:** Payment không nhận được replay thành công của giao dịch đã commit, có thể treo reconciliation hoặc báo thất bại dù khách đã nhận Point.

**Đã kiểm tra:** trường hợp full refund replay bị từ chối trước khi dependency ledger được gọi.

**Cách sửa:** trong transaction xử lý refund, tra cứu operation theo refund ID trước; cùng fingerprint thì trả kết quả cũ, khác fingerprint thì conflict; chỉ tính hạn mức cho refund mới. Giữ kiểm tra owner và binding với payment gốc.

**Test cần có:** full/partial refund thành công → retry 1 hoặc nhiều lần cùng ID và payload phải trả cùng kết quả, không phát event hoặc chuyển tiền thêm.

### F06 — [P1] Hủy rút tiền có thể giải phóng tiền đã được gửi payout

**Vị trí comment:** [withdrawal.service.ts:28](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts#L28), phần bỏ qua callback ở dòng 34.

`cancel()` gọi thẳng `finish(..., 'cancelled')`. `finish` chỉ kiểm tra hold active, không kiểm tra payout đã được Payment nhận chưa, không có handshake hủy, không lưu processing/unknown/payout reference trước khi cho hủy. Sau khi release hold, callback succeeded đến muộn bị bỏ qua vì hold không còn active.

**Tình huống:** event `wallet.withdrawal.requested` đã được Payment nhận → user hủy → hold released và available balance tăng → payout hoàn tất → callback succeeded → method trả bản ghi cancelled mà không debit. User có thể dùng lại số Point đồng thời đã nhận payout. Rủi ro này tồn tại ở contract ngay cả với MockPayoutProvider, không cần chuyển tiền thật mới xuất hiện.

**Đã kiểm tra:** gọi cancel rồi finish succeeded; trạng thái giữ cancelled và tổng debit bằng 0.

**Cách sửa:** triển khai state machine payout/cancellation. Chỉ hủy cục bộ khi chắc chắn chưa dispatch hoặc đã được Payment xác nhận hủy; nếu processing/timeout/unknown phải giữ hold và reconciliation. Khóa withdrawal/hold theo thứ tự thống nhất và dùng conditional transition; callback terminal mâu thuẫn phải tạo cảnh báo/needs_review, không im lặng trả thành công.

**Test cần có:** cancel trước dispatch; cancel sau Payment nhận; success/cancel đến theo hai thứ tự; duplicate callback; mất response; payout timeout. Không release hold khi kết quả chưa rõ.

### F07 — [P1] Idempotency withdrawal làm lộ bản ghi user khác

**Vị trí comment:** [withdrawal.service.ts:11](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts#L11).

Tra cứu `idempotencyKey` trên toàn bảng rồi `return prior` trước khi kiểm tra `prior.userId === userId`. Key do client cung cấp và không bắt buộc có entropy cao. User B biết/đoán key của A có thể nhận record của A, gồm withdrawal ID, user/wallet ID, bankAccountId, amount, trạng thái và có thể payoutReference.

**Điều kiện:** phải trùng key; đây không phải endpoint đọc mọi ví tùy ý. Với code hiện tại, lỗi BigInt F10 có thể khiến response HTTP thất bại; F07 vẫn là lỗi authorization trong service và sẽ lộ ra khi sửa serialization. Không nên coi lỗi serialization là biện pháp bảo vệ dữ liệu.

**Đã kiểm tra:** gọi `create` dưới user attacker với key trỏ record victim, service trả record victim.

**Cách sửa:** scope unique key theo owner + operation, hoặc kiểm tra owner trước replay; lưu fingerprint gồm userId, amount, bankAccountId. Cùng owner/key nhưng khác payload phải trả 409. Không dùng độ khó đoán của key thay cho authorization.

**Test cần có:** hai user dùng cùng key không nhận dữ liệu của nhau; retry cùng user/key nhưng khác amount/bank account bị từ chối.

### F08 — [P1] Withdrawal chấp nhận bankAccountId chưa xác minh

**Vị trí comment:** [withdrawal.service.ts:18](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts#L18).

DTO chỉ kiểm tra UUID. Service không tra cứu bank account, không xác minh tài khoản tồn tại, thuộc user hiện tại, đang hoạt động hoặc đủ điều kiện rút; ID được ghi vào withdrawal rồi đưa vào event yêu cầu payout.

**Hậu quả đã xác định trong Wallet:** user tạo được yêu cầu/hold với bank account bất kỳ theo định dạng UUID; yêu cầu không hợp lệ được chuyển downstream. **Chưa đủ bằng chứng để khẳng định chuyển tiền sang tài khoản người khác**, vì phần Payment có thể có kiểm tra riêng khi được triển khai. Tuy vậy WAL-07 yêu cầu ownership và bankAccountId validation ở flow này, và PR hiện chưa có client/contract thực hiện kiểm tra đó.

**Cách sửa:** gọi service sở hữu bank account bằng service-auth trước khi chấp nhận, hoặc xác định một contract có xác nhận ownership được kiểm chứng. Fail closed khi dependency không khả dụng. Không mở DB của service khác để tự đọc. Mock phải có dữ liệu ownership và kiểm tra tương đương.

**Test cần có:** account người khác, không tồn tại, inactive và dependency timeout không tạo payout request hợp lệ hoặc hold bị bỏ quên.

### F09 — [P1] Top-up deduplicate theo key tùy ý, không theo payment gốc

**Vị trí comment:** [topup-settlement.service.ts:11](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/topup-settlement/topup-settlement.service.ts#L11).

Service chỉ unique theo `topup:${dto.idempotencyKey}`. `paymentId` được lưu vào operationId/referenceId trên wallet_transactions nhưng cả hai không có unique constraint bảo vệ top-up. Cùng paymentId với key khác sẽ tạo ledger entry mới và tăng balance lần nữa.

**Tình huống:** Payment reconcile/re-publish cùng payment dưới message/request key khác, hoặc thay đổi key generation. Đây không phải redelivery byte-for-byte: cùng key được chặn, nhưng cùng giao dịch tài chính khác key thì không. WAL-05 yêu cầu cộng đúng một lần cho giao dịch đã xác minh.

**Đã kiểm tra:** hai settle cùng paymentId, amount 100, keys khác nhau → balance tăng 200.

**Cách sửa:** dùng khóa nghiệp vụ ổn định theo payment/provider transaction đã chuẩn hóa; unique ở DB theo operation type + paymentId hoặc một settlement table riêng. Inbox eventId chỉ giải quyết lặp message; vẫn cần unique payment để chống hai event khác ID cho cùng tiền nạp. Lưu userId, amount/currency và fingerprint để phát hiện payload mâu thuẫn.

**Test cần có:** cùng event phát lại; event khác ID/key cùng payment; cùng payment nhưng user/amount khác; tất cả không được cộng thêm hoặc chuyển sang user khác.

### F10 — [P1] BigInt thô gây HTTP 500 sau khi tiền/hold đã thay đổi

**Vị trí comment:** [withdrawal.controller.ts:11](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/withdrawal/withdrawal.controller.ts#L11).

Withdrawal create/list/get/cancel/callback trả Prisma objects chứa `amount: bigint`. Provision controller cũng trả wallet có balance/reservedBalance BigInt; refund/adjustment/commission trả transfer có totalAmount BigInt. `buildSuccessResponse` là lớp envelope; đường bootstrap đã đọc không có serializer BigInt. Query service tự `.toString()` nên riêng các API query đã xử lý tốt hơn.

JSON.stringify với BigInt ném TypeError. Với POST, transaction đã commit trước lúc Express serialize response: client thấy 500 dù hold/transfer thành công; retry làm tăng rủi ro trạng thái không rõ. Các GET withdrawal cũng không thể trả bản ghi có tiền đúng cách.

**Đã kiểm tra:** JSON.stringify record withdrawal có `amount: 100n` ném lỗi BigInt. Chưa chạy HTTP E2E toàn ứng dụng; kết luận dựa trên các giá trị trả về và bootstrap đã kiểm tra.

**Cách sửa:** response DTO/mapper cho tất cả money fields, xuất decimal string; hoặc serializer được áp dụng rõ ràng toàn service. Không đổi sang Number vì mất độ chính xác ngoài safe integer. Giữ cùng shape giữa lần đầu và replay.

**Test cần có:** HTTP thật cho create/list/get/cancel/provision/refund/adjustment/commission, bao gồm amount > Number.MAX_SAFE_INTEGER trong giới hạn BIGINT; response serialize được và không mất chữ số.

### F11 — [P2] Ledger replay key trùng nhưng operation khác

**Vị trí comment:** [wallet-ledger.service.ts:28](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/wallet-ledger/wallet-ledger.service.ts#L28).

`existing` tìm theo idempotencyKey rồi trả luôn. Không so operationId, kind, parties, amount hoặc postings. Key trùng nhưng payload khác bị coi là thành công thay vì conflict. Ledger không lưu fingerprint và transfer metadata hiện không được dùng để ràng buộc yêu cầu.

Ví dụ cùng refundId nhưng khác paymentId: nếu cả hai qua các precheck, call thứ hai có thể nhận transfer của payment thứ nhất mà không hoàn payment thứ hai. Commission dùng paymentId cho operationId nhưng caller key cho idempotency, nên key reuse có thể che mất một collection khác. Với debit, operation ID được ghép từ payment/attempt nhưng replay payload thay đổi vẫn không bị phát hiện.

**Đã kiểm tra:** yêu cầu new-op/99 với key đã có old-op/10 trả old-op như replay thành công.

**Cách sửa:** lưu request fingerprint chuẩn hóa; unique operation identity riêng và validate cả hai khóa; chỉ replay nếu identity + payload khớp. Conflict trả mã nghiệp vụ rõ. Đảm bảo PaymentDebitService không xây response operationId từ request khi kết quả replay thực sự thuộc identity khác.

**Test cần có:** key trùng/khác operation; operation trùng/khác key; cùng identity đổi amount, parties hoặc kind; concurrent duplicate phải trả kết quả ổn định.

### F12 — [P2] Consumer top-up không chạy DTO validation

**Vị trí comment:** [main.ts:7](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/main.ts#L7), cùng [topup-settlement.consumer.ts:8](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/topup-settlement/topup-settlement.consumer.ts#L8).

Bootstrap đăng ký global ValidationPipe cho app HTTP; connectMicroservice không bật `inheritAppConfig`, consumer cũng không có pipe hoặc explicit validation. Kiểu TypeScript `PaymentTopupSucceededDto` không tự thực thi decorator class-validator.

Vì vậy handler không bảo đảm amount là chuỗi số nguyên dương, userId là UUID, các key không thiếu và payload đúng version. Ví dụ amount dạng JSON number đã mất độ chính xác có thể được BigInt chuyển sang giá trị sai; `BigInt(true)` cũng là 1 nếu không có validation trước. Số âm/0 bị DB constraints ngăn ghi, nhưng lỗi vẫn đi vào transaction và hiện không có ACK/DLQ policy tốt theo F02.

**Cách sửa:** validate envelope và data bằng schema/DTO thực sự trước persistence. Bật kế thừa config có cân nhắc HTTP exception filter không tự phù hợp với RMQ, hoặc khai báo RPC-specific pipe/filter. Bắt buộc amount dạng decimal string trong giới hạn PostgreSQL BIGINT; validate payment identity, currency/conversion, eventVersion/producer theo contract và quyền publish ở broker.

**Test cần có:** event thật qua RMQ với amount boolean/number/negative/decimal/overflow, userId sai, field thiếu, version lạ; từ chối và quarantine, không đổi balance.

### F13 — [P2] Refund nhỏ lặp lại làm Platform chịu quá phần đã nhận

**Vị trí comment:** [refund-adjustment.service.ts:26](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts#L26).

Mỗi refund tự làm tròn xuống từng share; nguồn cuối nhận toàn bộ phần dư, không xét tổng từng nguồn đã bị thu hồi. Query entries cũng không orderBy nên không có contract nguồn nào chịu phần dư.

Ví dụ sources theo thứ tự Worker 80, Platform 20 trên gross 100. Refund 1 nhiều lần: Worker share = floor(1×80/100)=0, Platform chịu 1 mỗi lần. Sau 100 refund, Worker bị thu hồi 0, Platform bị thu hồi 100 mặc dù chỉ được nhận 20 từ payment đó. Nếu Platform có balance từ payment khác, hệ thống âm thầm dùng tiền đó; nếu không, refund dừng dù Worker vẫn còn tiền.

**Cách sửa:** tính allocation trên tổng refund lũy kế rồi lấy chênh lệch so với tổng đã thu hồi từng nguồn, với quy tắc làm tròn ổn định và giới hạn theo allocation gốc. Mọi khoản bù thêm phải là nguồn được duyệt/audit, không vô tình lấy từ fee pool.

**Test cần có:** 100 lần refund 1 của payment 100, allocation 80/20; tổng recovery cuối đúng 80/20. Chạy cả thứ tự sources đảo ngược và nguồn thiếu tiền.

### F14 — [P2] Adjustment thiếu actor và lý do audit có cấu trúc

**Vị trí comment:** [refund-adjustment.controller.ts:15](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.controller.ts#L15).

Controller kiểm tra trusted secret và role Admin nhưng không lấy actor user/account ID; service chỉ nhận target userId và DTO. Transfer không lưu actor, request/correlationId, thời điểm phê duyệt hoặc audit record. Reason bị đặt vào `referenceId` của một posting thay vì trường reason/metadata rõ ràng; DTO không giới hạn độ dài reason theo `reference_id VARCHAR(160)`.

**Hậu quả:** không xác định được admin nào điều chỉnh khi cần điều tra hoặc đối soát. Log HTTP thông thường không thay được business audit nguyên tử gắn với ledger. Reason dài còn có thể gây lỗi DB dù qua validation.

**Cách sửa:** yêu cầu actor identity từ trusted headers, permission cụ thể cho adjustment; lưu actor, target, reason, operation, correlation và nguồn tài trợ trong audit/transfer metadata cùng transaction. Chọn đúng kiểu dữ liệu cho reason và giới hạn hợp lý. Không cho client tự khai actor chưa xác minh.

**Test cần có:** role Admin thiếu actor bị từ chối; adjustment thành công có audit truy nguyên actor và before/after; retry không sinh audit trùng; rollback không để lại audit thành công giả.

### F15 — [P2] Withdrawal list nhận limit không giới hạn

**Vị trí comment:** [withdrawal.controller.ts:12](https://github.com/duyaivy/HANDY_GO/blob/79035ac08be97ab31e3a2ef4e17dcfddf18ce90e/backend/apps/wallet-service/src/withdrawal/withdrawal.controller.ts#L12).

`page`/`limit` là string được ép bằng unary `+`, không dùng DTO validation. Query như `page=abc`, `page=0`, `limit=-1` đi xuống Prisma dưới dạng NaN/skip âm hoặc có ngữ nghĩa truy vấn không mong muốn; limit rất lớn không bị chặn và có thể kéo lịch sử dài vào bộ nhớ. Đây là endpoint có thể gọi bởi user đăng nhập thông thường.

**Cách sửa:** dùng pagination DTO với integer page ≥ 1, limit 1–100 và giới hạn offset; order ổn định bằng createdAt + id hoặc cursor. Trả metadata pagination nhất quán như transaction history.

**Test cần có:** NaN, số âm, số lẻ, limit 0, limit rất lớn → 400; user này không đọc được lịch sử user khác.

## 4. Đối chiếu từng task

| Task | Đã có | Phần chưa đủ để nghiệm thu |
| --- | --- | --- |
| WAL-01 | BIGINT, nonnegative/reserved constraints, owner XOR system, unique ownership, append-only trigger cho wallet_transactions, balanced transfer ở service | F01; chưa có wallet_transfer_postings như mô tả PR; invariant balance/postings của transfer chưa được DB enforce. Có thể dùng wallet_transactions làm postings nếu team thống nhất và sửa tài liệu; không tự coi thiếu bảng riêng là lỗi tiền khi cùng chức năng đã có. |
| WAL-02 | Query theo owner, money dạng string ở query, seed PLATFORM_FEES, inbox cho provisioning | F03; response provisioning F10; chưa có backfill job/process user cũ. Admin xem ví user khác chưa có public route riêng, nếu đó là yêu cầu thực tế cần làm rõ. |
| WAL-03 | Debit/credit Worker/Platform trong cùng transaction; lock theo wallet ID đã sort; kiểm tra tổng và available balance | F01/F11; chỉ chống trùng theo payment+attempt, không tự chặn payment mới attempt. Cần contract Payment bảo đảm không tạo attempt mới để lặp một payment đã thành công; không kết luận đây là bug độc lập khi contract chưa có. Chưa có integration test concurrency/timeout. |
| WAL-04 | Refund kiểm tra owner/giao dịch gốc, compensation transfer, adjustment check Admin | F04/F05/F11/F13/F14; needs_review hiện chỉ nằm trong error text, không có operation bền vững để Payment query. Cần thiết kế rõ ai lưu trạng thái review. |
| WAL-05 | Consumer top-up và 2 event credit; Wallet không gắn provider cụ thể | F02/F09/F12; chưa có Payment top-up flow hay legacy alias trong Gateway ở snapshot này. Đây là tích hợp còn thiếu, không yêu cầu tự chọn VNPAY hoặc cổng thật. |
| WAL-06 | Outbox publisher có polling/retry/DLQ phía publish; provisioning inbox | F02/F12; inbox không bao phủ top-up; chưa có correlation xuyên luồng; thiếu các integration tests/reconciliation bắt buộc. Không được nhầm outbox retry với consumer retry. |
| WAL-07 | Withdrawal + hold nguyên tử, available balance, callback terminal, list/detail/cancel | F06/F07/F08/F10/F15; schema có processing/needs_review/payoutReference nhưng flow chưa dùng để giải quyết dispatch/unknown; chưa có MockPayoutProvider integration trong PR. |
| WAL-08 | Balanced commission transfer Worker → PLATFORM_FEES; không cho balance âm | Chưa có commission_receivables/Payment rules/settlement reporting/reconciliation tích hợp. `collect` bắt mọi lỗi thành “pending” 409 nhưng không có pending record; cần contract Payment quản lý công nợ. Point settlement không được tiếp tục gọi commission collection lần nữa. |

**Lưu ý về task đầu vào:** phần dưới file đính kèm có ghi “consume có thể không cần” và bàn về conversion chưa chốt, trong khi bảng WAL-02/WAL-05 đã yêu cầu user/top-up events và đã chốt 1 POINT = 1 HGC = 1 VND. Báo cáo ưu tiên bảng task cụ thể. Những đoạn ghi chú cũ nên được làm sạch để tránh team triển khai hai contract khác nhau.

## 5. Nhận xét bảo mật và tính nhất quán đã kiểm tra

- Không thấy đường SQL injection trong các giá trị UUID dùng tagged `$queryRaw`; vấn đề raw SQL hiện tại là schema/search_path, không phải nội suy chuỗi input.
- Public wallet routes yêu cầu secret và identity; query transaction detail có scope walletId của owner. Gateway strip các header identity/secret từ client trước khi inject. Không có bằng chứng để kết luận client ngoài Internet chỉ cần tự thêm `x-user-id` là vượt quyền.
- Gateway route Wallet chỉ public-prefix `/api/v1/wallets`, không proxy `/api/v1/internal`. Vì vậy không quy kết endpoint internal debit/refund là API trừ tiền mở cho user thông thường. Vẫn cần giữ network boundary và quyền service-caller khi Payment được tích hợp.
- Sử dụng một shared internal secret chỉ xác minh thuộc trusted boundary, không phân biệt Payment/Gateway/service khác. Nếu cần hạn chế caller tới từng financial action, nên có service identity/scoped credential hoặc mTLS. Đây là hardening theo trust model, chưa tính thành lỗ hổng khai thác Internet trong PR.
- Check secret đang so string length trước timingSafeEqual Buffer; chuỗi Unicode bằng số ký tự nhưng khác số byte có thể ném exception. Nên so Buffer byteLength rồi timingSafeEqual; ảnh hưởng chủ yếu là response/error handling, không có bằng chứng bypass secret nên không nâng thành finding P1.
- Transaction balance + ledger + outbox là đúng hướng. Lock wallet IDs theo thứ tự cố định giúp giảm deadlock. Serializable không tự retry P2034 và không bảo vệ precheck nằm ngoài transaction.
- Append-only trigger hiện chỉ bảo vệ wallet_transactions; wallet_transfers có thể cập nhật bằng SQL trực tiếp. Cần DB role/permission hoặc trigger tương ứng nếu “ledger bất biến” bao gồm transfer metadata/status. Chưa thấy mutation transfer trong application để kết luận lỗi đang xảy ra.
- Event `wallet.credited` và `wallet.topup.credited` đang dùng cùng payload/eventId. Team cần chốt dedup scope của consumer `(eventType,eventId)` hay eventId toàn cục, để hai event khác loại không triệt tiêu nhau. Đây là rủi ro contract cần thống nhất, chưa có downstream consumer thực tế để chứng minh mất event.
- Event payload hiện chưa thống nhất envelope `eventVersion/occurredAt/producer/data/correlationId` với Auth. Outbox eventVersion có cột nhưng publisher dùng payload thô; thêm cột không tự đưa version/correlation vào message.

## 6. Kiểm tra đã chạy và giới hạn

| Kiểm tra logic | Kết quả quan sát |
| --- | --- |
| Retry refund đã hoàn 100/100 cùng refund ID | Bị “Refund exceeds original payment amount” trước ledger replay |
| Hai precheck refund 60 cùng thấy tổng 0 của payment 100 | Phương thức cho phép gọi ledger hai lần, tổng 120 trong fake persistence |
| Withdrawal create với key có sẵn của user khác | Trả record của user khác |
| Cancel rồi callback succeeded | Hold đã release, trạng thái cancelled, không debit |
| Top-up cùng paymentId, key khác nhau | Cộng hai lần, 100 → tổng credit 200 |
| Ledger key trùng nhưng operation/amount khác | Trả operation cũ, idempotentReplay=true |
| JSON stringify withdrawal có BigInt | TypeError |

Harness chỉ chạy phần service với fake repositories/ledger; nó chứng minh control flow và validation/replay thiếu tại các vị trí đã nêu, không mô phỏng đầy đủ PostgreSQL isolation, DB rollback, Nest DI, broker redelivery, gateway HTTP hay mock payout. Ví dụ concurrency refund cần test PostgreSQL thật để xác nhận lịch thực thi, nhưng cấu trúc transaction hiện tại rõ ràng không chứa precheck hạn mức.

Các spec mới của PR chủ yếu kiểm tra một số guard đầu vào với mock: thiếu ví, allocation không cân, delegating publisher, seed upsert, query owner/pagination. Chưa thấy test thật cho successful financial transactions, lock contention, cap refund, rollback, withdrawal callback/cancel, broker ACK, schema migration/runtime hoặc HTTP BigInt. Con số “12 file / 17 test passed” trong PR description không tương đương việc các yêu cầu này đã được kiểm chứng.

### Bộ test cần ưu tiên sau khi sửa

1. PostgreSQL sạch: migrate → boot → seed → provision, xác nhận schema và raw row locks.
2. Atomic debit: đủ tiền/thiếu tiền/ví frozen; rollback nếu lỗi posting hoặc outbox; tổng debit=credit; đồng thời không double-spend.
3. Idempotency: duplicate cùng payload, khác payload, concurrent duplicate; timeout sau commit; operation query trả lại kết quả đúng.
4. Refund: tổng không vượt gross; nguồn thiếu tiền; full/partial retry; nhiều refund nhỏ; hai refund đồng thời; original payment/owner sai.
5. Top-up: RMQ thực, duplicate event/payment, malformed payload, delayed provisioning, valid publisher và retry/DLQ.
6. Withdrawal: bank ownership; key owner scope; payout success/failure/unknown; duplicate callback; cancel race; hold không được thả khi payout chưa xác định.
7. HTTP thật: money serialization cho mọi endpoint, authorization/role/ownership, UUID và money overflow, pagination bounds.
8. Reconciliation: balance = tổng signed ledger; reserved = tổng active holds; Point settlement không thu commission hai lần; cash fee thiếu Point giữ công nợ tại Payment.

## 7. Thứ tự sửa đề xuất

1. **Khả năng chạy:** F01, F02, F03, F10 để hệ thống boot, nhận event và trả response đúng.
2. **Bảo toàn tiền:** F04, F05, F06, F09, F11, F13; chốt operation identity và payout state machine trước.
3. **Bảo mật/audit:** F07, F08, F12, F14, F15.
4. **Nghiệm thu tích hợp:** mock Payment hợp đồng rõ, backfill, needs_review/reconciliation, test DB/broker/HTTP thật; cập nhật trạng thái task cho đúng phạm vi đã làm.

## 8. Kế hoạch comment sau khi được duyệt

Chưa có comment nào được đăng. Các mục F01–F15 có sẵn vị trí ghim ở mục 3. Khi được duyệt, nên đăng mỗi lỗi thành một inline thread riêng trên dòng diff tương ứng, mô tả trigger → hậu quả → đề nghị sửa; tránh nhân đôi cùng lỗi lên nhiều controller. F02 có thể chọn consumer top-up làm thread chính và dẫn consumer provisioning trong nội dung.

Trước khi đăng cần đọc lại head SHA và diff. Nếu PR có commit mới, phải kiểm tra lỗi còn tồn tại và cập nhật line anchor; không tự gắn nhận xét của snapshot cũ lên code đã được sửa. Các nhận xét hardening/chưa xác minh ở mục 5 không nên tự biến thành blocking finding.

## 9. Tài liệu kỹ thuật dùng đối chiếu

- [Prisma PostgreSQL — specifying schema with driver adapters](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql#specifying-schema-with-driver-adapters): adapter options có schema riêng; đối chiếu thêm AuthPrismaService trong chính repo.
- [NestJS RabbitMQ — message acknowledgement](https://docs.nestjs.com/microservices/rabbitmq#message-acknowledgement): manual ACK và RmqContext/channel acknowledgement.
- [NestJS hybrid application — sharing configuration](https://docs.nestjs.com/faq/hybrid-application#sharing-configuration): microservice không tự kế thừa global pipes/filters của app HTTP nếu chưa bật inheritAppConfig.

Nguồn chính của từng finding là code tại head được ghim và task đính kèm. Không truy cập hoặc sửa dữ liệu tài chính thật; không chạy migration hay gửi event vào môi trường của dự án.
