# Review lại PR #27 — Wallet Service — 26/10/2026

**Kết luận: chưa nên merge.** Bản sửa đã giải quyết một số lỗi thật, nhưng các bất biến quan trọng về refund và withdrawal vẫn chưa được bảo vệ đầy đủ. Không thể kết luận đã an toàn chỉ từ việc CI xanh hoặc đã thêm vài điều kiện kiểm tra.

## 1. Snapshot và phương pháp

| Mục | Giá trị |
| --- | --- |
| PR | https://github.com/duyaivy/HANDY_GO/pull/27 |
| Trạng thái lúc kiểm tra | Open, **chưa merge** |
| Head đã review lại | `0492104a0e189be1ca501d7287e402f75e877f14` |
| Base/main hiện tại | `20a105947d0621e06f735ad0571ba85f4182315f` |
| Head review lần đầu | `79035ac08be97ab31e3a2ef4e17dcfddf18ce90e` |
| Diff hiện tại so với main | 76 file |
| CI | Backend CI và CI Gate: success; Detect Changes: success; Frontend/Mobile: skipped |
| Thao tác GitHub | Chỉ đọc, chưa gửi comment/review |

Đối chiếu F01–F15 trong báo cáo lần đầu với source hiện tại, migration mới, shared bootstrap, RabbitMQ và response helper. Chạy **11 kiểm tra logic có assertion** trên phần thân class của snapshot mới bằng Node.js 24; import/decorator được bỏ để inject fake dependency. Đây là kiểm tra control flow, không phải integration test PostgreSQL/RabbitMQ hoặc HTTP E2E. Chưa cài dependency backend, generate Prisma client hoặc chạy lại toàn bộ Vitest/typecheck/lint. Không chạy migration, payout hay event vào môi trường của dự án.

Đã so nội dung **10 file spec được thêm bởi PR** với snapshot review lần đầu: **cả 10 không thay đổi**. Vì vậy các sửa đổi mới chưa kèm regression test trong các spec đó. CI xanh không phủ định các lỗi được nêu dưới đây.

## 2. Trạng thái từng phát hiện cũ

| ID | Trạng thái | Kết quả review lại |
| --- | --- | --- |
| F01 — Prisma schema/raw lock | **Một phần** | Đã truyền schema cho PrismaPg; raw SQL vẫn `FROM wallets` không qualify và chưa thiết lập search_path rõ ràng. |
| F02 — ACK/NACK | **Một phần** | Đã ACK sau success; mọi exception đều NACK requeue=true, không phân loại permanent error/backoff/giới hạn/DLQ ở consumer. |
| F03 — Event provisioning | **Đã sửa lỗi cũ** | Subscribe `USER_REGISTERED`, đọc `event.data.userId`, kiểm tra eventVersion=3; inbox lưu đúng event type. |
| F04 — Concurrent refund cap | **Chưa sửa** | Aggregate tổng đã refund vẫn ngoài transaction ledger. |
| F05 — Full refund replay | **Đã sửa lỗi cũ** | Replay được đưa lên trước kiểm tra cap; kiểm tra operationId/kind/amount. Tuy nhiên phát sinh R01 về owner ở nhánh này. |
| F06 — Cancel/payout race | **Một phần** | Đã chặn hủy nếu status khác requested, nhưng chưa có đường chuyển processing/dispatch handshake; vẫn thả hold và bỏ success muộn. |
| F07 — Withdrawal replay owner | **Đã sửa lỗi cũ** | So owner + amount + bankAccountId trước khi trả prior; mismatch trả 409. |
| F08 — Bank account ownership | **Chưa sửa** | Chưa xác minh account tồn tại/thuộc owner/active trước khi tạo hold và event. |
| F09 — Top-up duplicate payment | **Đã sửa lỗi cũ** | Dedup theo type+paymentId và migration thêm partial unique index trên top-up reference. |
| F10 — BigInt response | **Một phần** | Withdrawal đã map amount sang string; provision/refund/adjustment/commission vẫn trả BigInt thô. |
| F11 — Ledger replay fingerprint | **Đã sửa lỗi cũ** | Lưu fingerprint vào metadata, so operationId/kind/fingerprint trước replay. |
| F12 — RMQ payload validation | **Một phần** | Có kiểm tra typeof và regex amount; chưa validate UUID, chuỗi rỗng/độ dài, BIGINT range, envelope/version đầy đủ; malformed event bị ACK bỏ. |
| F13 — Refund rounding | **Chưa sửa** | Vẫn chia/làm tròn từng refund độc lập và dồn dư cho source cuối. |
| F14 — Adjustment audit | **Chưa sửa** | Chưa truyền/lưu actor identity; reason vẫn nằm trong referenceId. |
| F15 — Withdrawal pagination | **Đã sửa lỗi cũ** | Kiểm tra page integer≥1, limit integer trong 1–100. Có thể bổ sung safe offset/cursor sau. |

**Tổng:** 6 mục sửa đúng lỗi cũ, 5 mục sửa một phần, 4 mục chưa sửa. “Đã sửa lỗi cũ” chỉ xác nhận vấn đề cụ thể đã được xử lý qua đọc code/kiểm tra logic; không đồng nghĩa toàn module đã qua nghiệm thu tích hợp. Có **1 regression mới R01**.

## 3. Các vấn đề còn phải sửa

### A. [P1] F04 — Refund vẫn có thể vượt tiền gốc khi hai yêu cầu cùng qua precheck

**Vị trí:** [refund-adjustment.service.ts:32–44](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts#L32).

`walletTransfer.aggregate` và kiểm tra cap ở dòng 32–33 vẫn chạy trước `createBalancedTransfer`. Transaction Serializable chỉ nằm bên trong ledger. Thêm replay ở đầu phương thức không giải quyết hai refund có refundId khác nhau.

Ví dụ payment 100; R1 và R2 mỗi cái 60 cùng đọc totalRefunded=0; sau đó ledger có thể commit lần lượt cả hai nếu các ví nguồn có đủ tiền. Các ví nguồn thường có cả tiền từ payment khác. Lock ví không khôi phục điều kiện hạn mức đã được đọc ngoài transaction.

**Kiểm tra đã chạy:** cho hai aggregate cùng đọc 0, gọi method hiện tại với fake ledger; cả hai được chuyển tới ledger, tổng 120. Chưa chạy lịch thực thi trên PostgreSQL thật; ví dụ này chứng minh vị trí precheck vẫn không thuộc transaction, không khẳng định đã gây thất thoát ở production.

**Sửa:** lock payment/settlement accumulator; lookup replay, cap check, allocation và ledger writes phải trong một transaction. Thêm test DB hai refund 60 trên payment 100 với nguồn dư dả: chỉ một thành công.

### B. [P1] F06 — Guard requested chưa làm việc hủy payout an toàn

**Vị trí:** [withdrawal.service.ts:38–45](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts#L38).

Bản sửa từ chối cancel khi status không phải requested. Nhưng create vẫn ghi requested rồi publish `wallet.withdrawal.requested`; không có bước atomic claim/mark processing hoặc xác nhận Payment chưa nhận payout. DTO callback chỉ hỗ trợ succeeded/failed/cancelled, chưa có đường tiến hành processing.

Do đó `requested` **không chứng minh chưa dispatch**. Sau khi event đã được Payment nhận, user vẫn cancel thành công, hold released; callback success sau đó gặp hold không active và trả record cancelled mà không debit.

**Kiểm tra đã chạy:** create state requested → cancel → finish succeeded: status cancelled và debit=0 như trước. Đây là thứ tự gọi tuần tự, chưa cần chạy hai DB transaction đồng thời.

**Sửa:** payout state machine + dispatch/cancellation handshake với Payment, giữ hold khi processing/unknown; xử lý callback terminal mâu thuẫn bằng reconciliation/needs_review. Nếu chưa có Payment integration, nên khóa/disable luồng chưa đảm bảo thay vì cho status requested đại diện an toàn để release hold.

**Lỗi phụ của guard mới:** retry cancel hoặc callback cancelled lần hai hiện bị 409 vì status đã cancelled, trước cả check hold. Duplicate terminal callback cùng kết quả cần replay ổn định; callback khác kết quả mới cần đối soát.

### C. [P1] F10 — Serialization mới chỉ sửa Withdrawal

**Vị trí:** [refund-adjustment.controller.ts:14–15](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.controller.ts#L14), [wallet-provisioning.controller.ts:13](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/wallet-provisioning/wallet-provisioning.controller.ts#L13), [worker-commission.controller.ts:10](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/worker-commission/worker-commission.controller.ts#L10).

`serializeWithdrawal` đã xử lý đúng amount ở các response Withdrawal. Tuy nhiên các controller trên vẫn đưa Prisma wallet/transfer trực tiếp vào `buildSuccessResponse`. Helper hiện tại chỉ trả `{ statusCode, message, data }`, không chuyển BigInt. Bootstrap Wallet chưa có serializer/interceptor tương ứng.

Provision có balance/reservedBalance BigInt; refund/adjustment/commission có totalAmount BigInt. Khi serialize HTTP, có thể lỗi 500 **sau khi DB đã commit**. Retry sẽ nhận trạng thái không rõ dù việc chuyển tiền đã thành công.

**Kiểm tra đã chạy:** JSON.stringify response có transfer.totalAmount=100n vẫn ném TypeError. Chưa chạy HTTP E2E.

**Sửa:** mapper response cho tất cả financial endpoints, hoặc serializer rõ ràng áp dụng toàn service; money xuất decimal string, không Number. Test lần đầu/replay ở từng endpoint, không chỉ Withdrawal.

### D. [P1 có điều kiện cấu hình] F01 — ORM schema đã sửa, raw row-lock vẫn phụ thuộc search_path

**Vị trí:** [wallet-ledger.service.ts:55](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/wallet-ledger/wallet-ledger.service.ts#L55), [withdrawal.service.ts:20](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts#L20), [topup-settlement.service.ts:13](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/topup-settlement/topup-settlement.service.ts#L13).

Constructor đã truyền `{ schema }` cho PrismaPg, đây là tiến bộ đúng. Nhưng mọi lock vẫn là `FROM wallets` không schema-qualified; không có `SET LOCAL search_path`/connection option rõ ràng trong phần code đã xem. Schema option giúp ORM chọn schema, không phải bằng chứng rằng SQL thô đã được gắn schema tự động.

Với DB role giữ search_path mặc định và bảng chỉ nằm trong wallet_service, raw query có thể không tìm thấy relation; nếu schema khác có bảng cùng tên, câu lock có thể đi sai bảng. **Chưa chạy PostgreSQL để xác nhận cấu hình production thực tế**. Nếu DB role đã được cấu hình search_path phù hợp, tác động phụ thuộc cấu hình đó, nhưng dependency này chưa được khai báo/kiểm chứng trong feature.

**Sửa:** qualify bảng theo schema đã xác thực hoặc thiết lập search_path an toàn trên đúng transaction. Test database sạch, public trống, chạy transfer/withdrawal/top-up; không chỉ test `$connect` hoặc provisioning.

### E. [P1] F02 — Thêm ACK nhưng permanent error bị requeue vô hạn

**Vị trí:** [topup-settlement.consumer.ts:36–37](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/topup-settlement/topup-settlement.consumer.ts#L36), [wallet-provisioning.consumer.ts:46–47](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/wallet-provisioning/wallet-provisioning.consumer.ts#L46).

Lỗi thiếu ACK trên đường thành công đã sửa. Nhưng `catch { nack(context, true) }` áp dụng cho **mọi lỗi**: payload conflict 409, UUID sai, chuỗi quá dài, số vượt BIGINT, lỗi schema… Broker phát lại ngay cùng dữ liệu, không có retry count/backoff/giới hạn hoặc DLQ consumer.

Ví dụ top-up cùng payment khác amount được service từ chối đúng, nhưng consumer lại requeue mãi một conflict không bao giờ tự hết. Với nhiều poison message có thể tạo hot loop, tăng tải broker/DB và làm chậm event hợp lệ. Cũng chưa có log để truy nguyên exception trong catch.

**Kiểm tra đã chạy:** service giả trả permanent 409, gọi handler hiện tại ba lần → cả ba NACK requeue=true. Không phải benchmark broker thật.

**Sửa:** ACK replay hợp lệ; permanent validation/conflict đưa quarantine/DLQ có lý do; transient retry có delay và giới hạn. Không áp dụng ACK-drop cho financial event hợp lệ về cấu trúc nhưng thất bại xử lý. Retry của outbox chỉ bảo vệ publish, không giải quyết lỗi consumer này.

### F. [P1] F08 — Bank ownership vẫn chưa được xác minh

**Vị trí:** [withdrawal.service.ts:23–26](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts#L23).

Phần chống replay sai owner đã sửa, nhưng đây là việc khác với **ownership bank account**. Request mới vẫn nhận bankAccountId, tạo withdrawal/hold và đưa account đó vào event mà không kiểm tra account tồn tại, thuộc current user và active.

**Phạm vi kết luận:** xác định Wallet chấp nhận request với bank account chưa xác minh; chưa chứng minh Payment thực tế sẽ chuyển tiền cho người khác. WAL-07 yêu cầu validation này trong flow, hiện chưa có client/contract thực hiện.

**Sửa:** xác minh qua service sở hữu bank account, fail closed khi không xác định được, không truy cập DB service khác. Mock payout cũng cần mô hình ownership, không chỉ UUID hợp lệ.

### G. [P2] F13 — Refund nhỏ lặp lại vẫn thu hồi lệch nguồn

**Vị trí:** [refund-adjustment.service.ts:37–41](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts#L37).

Không có thay đổi ở thuật toán chia share. Với original gross=100, Worker=80, Platform=20, khi sources theo thứ tự Worker rồi Platform: mỗi refund 1 làm Worker share=floor(0,8)=0, Platform chịu 1. Sau 100 lần, Platform bị thu hồi 100, Worker 0. Tiền Platform từ payment khác bị dùng để bù mà không có quy tắc phê duyệt.

**Kiểm tra đã chạy:** thực thi 100 lần refund 1 qua phương thức mới với fake aggregate/ledger → recovery Worker=0, Platform=100. Query không orderBy, nên ví dụ chọn một thứ tự trả về có thể xảy ra; hệ thống hiện cũng chưa chốt nguồn nào chịu phần dư.

**Sửa:** allocation theo tổng refund lũy kế, trừ recovery từng nguồn đã thực hiện; rounding ổn định và giới hạn theo allocation gốc. Test 100×1 trên split 80/20, đảo thứ tự sources.

### H. [P2] F14 — Adjustment audit chưa được triển khai

**Vị trí:** [refund-adjustment.controller.ts:15](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.controller.ts#L15), [refund-adjustment.service.ts:47–52](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts#L47).

Vẫn chỉ nhận target userId và role Admin, không lấy actor ID để ghi audit. Metadata ledger mới chứa fingerprint, nhưng fingerprint không có actor/reason audit có cấu trúc/correlation. Reason vẫn bị nhét vào referenceId. Đây chưa đáp ứng WAL-04 và không thể truy nguyên chắc chắn admin nào đã điều chỉnh.

**Sửa:** truyền verified actor identity; lưu actor/target/reason/correlation/operation trong cùng transaction. Đặt giới hạn reason đúng trường lưu, không để chuỗi dài vượt reference_id VARCHAR(160).

### I. [P2] F12 — Validation thủ công của top-up còn thiếu và drop event im lặng

**Vị trí:** [topup-settlement.consumer.ts:21–30](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/topup-settlement/topup-settlement.consumer.ts#L21).

Đã chặn numeric/boolean amount và số không dương bằng typeof+regex; ví dụ sai type không còn tới settle. Tuy nhiên userId chỉ kiểm tra string, paymentId/idempotencyKey chấp nhận rỗng hoặc quá dài, amount không chặn PostgreSQL BIGINT overflow. Một phần malformed event đi tới DB rồi vòng NACK F02; phần không qua các if hiện tại bị ACK rồi return, không log/DLQ để tìm và replay khi cần.

**Sửa:** validate đầy đủ DTO/schema contract trên RMQ (UUID, nonempty/length, BIGINT range, envelope/version nếu contract quy định), log và quarantine payload không hợp lệ. Không chỉ dựa vào decorator DTO vì hybrid microservice hiện không kế thừa global ValidationPipe và chưa có pipe cục bộ.

**Kiểm tra đã chạy:** amount boolean bị chặn trước settle và ACK. Chưa chạy broker/schema-validator integration test.

### J. [P2, regression mới] R01 — Refund replay bypass owner check

**Vị trí:** [refund-adjustment.service.ts:17–21](https://github.com/duyaivy/HANDY_GO/blob/0492104a0e189be1ca501d7287e402f75e877f14/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts#L17).

Nhánh mới tìm existing refund và return trước khi tìm original transfer/customerWallet và kiểm tra userId ở dòng 31. Kiểm tra replay chỉ gồm operationId, amount, kind; **không gồm target owner**.

Gọi cùng paymentId/refundId/amount dưới userId khác vẫn trả transfer cũ như thành công. Không tạo credit mới, nhưng phá contract kiểm tra owner và có thể trả thông tin operation sai chủ thể. Endpoint là internal, yêu cầu shared service secret; đây **không phải lỗ hổng công khai cho user Internet** và không khẳng định có thể rút/hoàn tiền cho người khác qua đường này. Lỗi vẫn đáng sửa để caller không nhận thành công giả khi userId bị truyền nhầm.

**Kiểm tra đã chạy:** existing refund thuộc operation đã có; gọi refund('another-user', payload cũ) trả record existing với idempotentReplay=true, không thực hiện owner lookup.

**Sửa:** xác minh owner trên cả first execution và replay, hoặc lưu owner/request fingerprint đáng tin cậy vào operation rồi so trước return; thêm test retry cùng identity dưới user khác phải 403/409, không trả record.

## 4. Những sửa đổi được ghi nhận là đúng

- Provisioning đã dùng đúng `EVENT_PATTERNS.USER_REGISTERED`, envelope `data.userId`, version 3; bỏ mismatch `user.created`/flat payload cũ.
- Withdrawal replay kiểm tra đầy đủ owner/amount/bankAccountId; kiểm tra logic đã chứng minh user khác không nhận prior.
- Top-up lookup theo paymentId và partial unique index `wallet_transactions(type, reference_id) WHERE type='topup'…` bảo vệ chống hai payment-settlement giống nhau, kể cả key khác. Kiểm tra tuần tự cho credit một lần; chưa thử cạnh tranh transaction với DB thật.
- Ledger lưu và so fingerprint; key reuse với operation/payload khác bị từ chối. Đây là thay đổi đúng cho F11; cần regression tests để giữ hành vi.
- Full refund replay không còn bị cap check từ chối như cũ; phải hoàn thiện authorization R01 trước khi coi cả refund replay đã ổn.
- Withdrawal response convert amount sang decimal string; list chặn limit ngoài 1–100 và page không hợp lệ. Những endpoint còn lại cần áp dụng cùng nguyên tắc money serialization.

## 5. Kết quả 11 kiểm tra logic

| # | Nội dung | Kết quả |
| --- | --- | --- |
| 1 | Hai refund 60 cùng thấy đã hoàn 0 trên payment 100 | Vẫn chuyển tổng 120 tới fake ledger |
| 2 | Retry full refund đã có | Đã replay được |
| 3 | Retry refund nhưng đổi userId | Vẫn trả existing: regression R01 |
| 4 | Withdrawal replay khác owner | Đã từ chối 409 |
| 5 | Cancel requested rồi payout succeeded | Vẫn cancelled, debit=0 |
| 6 | Top-up cùng paymentId, khác key | Credit đúng một lần ở kiểm tra tuần tự |
| 7 | Ledger same key, khác operation/payload | Đã từ chối |
| 8 | 100 refund nhỏ của split 80/20 | Recovery Worker=0, Platform=100 |
| 9 | JSON serialization transfer BigInt | Vẫn TypeError |
| 10 | Consumer gặp permanent 409 lặp lại | Mỗi lần NACK requeue=true |
| 11 | Consumer nhận boolean amount | Chặn settle, ACK bỏ |

Các phép kiểm tra giữ nguyên phần thân service/handler, thay persistence và channel bằng fake. Chúng xác nhận control flow; **không chứng minh** transaction isolation, khả năng lock đúng schema, broker throughput, HTTP pipeline hoặc payout integration đã hoạt động thực tế. Phần này phải được bổ sung bởi integration tests trong repo.

## 6. Việc cần làm trước vòng review tiếp theo

1. Đưa refund cap/allocation/replay authorization vào cùng transaction và thêm test đồng thời, rounding, full refund retry.
2. Hoàn thiện payout processing/cancel handshake, callback idempotency và hold reconciliation; test success đến sau cancel.
3. Sửa raw SQL schema và kiểm chứng trên PostgreSQL sạch; không chỉ dựa vào `$connect`.
4. Serialize toàn bộ money response; test HTTP các endpoint provision/refund/adjustment/commission.
5. Consumer retry có phân loại/backoff/DLQ, validation đầy đủ; test poison event không tạo hot loop hoặc mất khả năng replay.
6. Thêm bank ownership verification và adjustment audit actor theo yêu cầu task.
7. Bổ sung regression tests. Các spec hiện có chưa thay đổi từ bản được review lần đầu.

PR description vẫn ghi `user.created`, bộ test cũ và mô tả đã hoàn tất WAL-01…WAL-08. Cần cập nhật cho khớp contract `user.registered` và phạm vi tích hợp thực tế; đây là vấn đề tài liệu/phạm vi nghiệm thu, không tính thêm một finding tiền tệ.

**Chưa đăng bất kỳ nhận xét nào lên PR.** Các vị trí trên ghim vào head đã kiểm tra; nếu PR có commit mới trước khi đăng hoặc review tiếp, cần đối chiếu lại diff và line anchor.
