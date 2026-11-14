# Recovery payment.pending và debit thiếu tiền

## Thứ tự triển khai

1. Áp dụng migration Payment `20261110160000_fair_reconciliation` trước Payment mới; triển khai Order trả `completedAt` trước Payment.
2. Triển khai Wallet có kết quả debit thiếu tiền được lưu theo operation ID. Không cần migration mới: `WalletTransfer` đã hỗ trợ `failed` và metadata.
3. Triển khai Payment đọc `failureCode`, rồi theo dõi/reconcile attempt cũ bằng operation ID cũ.
4. Kiểm kê dữ liệu thiếu event, đối chiếu downstream, apply theo manifest và lưu báo cáo từng batch.

## Contract Wallet

`POST /internal/wallets/:userId/debit-payment` trả HTTP thành công kèm **kết quả operation**: `completed` hoặc `failed`. HTTP thành công không đồng nghĩa đã debit. Thiếu tiền khả dụng (`balance - reservedBalance`) trả `status: failed`, `failureCode: INSUFFICIENT_FUNDS` sau khi transaction commit. Không thay đổi số dư, không ghi ledger posting hoặc event debit/credit cho operation failed.

`GET /internal/wallets/operations/:operationId` trả cùng trạng thái/mã lỗi. Operation ID vẫn là `<paymentId>:<attemptId>`. Replay giữ kết quả cuối cùng ngay cả sau khi nạp thêm; đổi payload dưới ID cũ bị từ chối. Transaction tranh chấp được retry có giới hạn với cùng ID; hết retry, lỗi DB, timeout, HTTP 4xx/5xx hoặc GET 404 không được suy luận thành failure đã lưu.

Payment chỉ chốt attempt `failed` khi có terminal operation từ Wallet. Khách xác nhận thanh toán lại mới tạo attempt/operation mới. `processing` tiếp tục dùng ID cũ, kể cả reconciliation chạy cùng request HTTP. Không tự đánh dấu attempt lịch sử failed chỉ vì Wallet trả 404: phải đối soát, hoặc retry đúng operation cũ. Reconciliation có thể debit operation cũ nếu chưa từng commit và nay ví đủ tiền; không tự đổi ID để thử lại.

Commission/refund/adjustment giữ hành vi thiếu nguồn tiền có thể retry. Refund Point chỉ tìm transfer Payment `completed`; transfer failed không phải nguồn tiền để hoàn và không phải bằng chứng đã thanh toán Point cho trường hợp đổi sang Cash.

## Kiểm kê và backfill

Chạy tại `backend/`, Node >=22.6 và dependencies đã cài. CLI chỉ dùng `DATABASE_URL_PAYMENT` được truyền rõ trong process; không tự nạp `.env` hay fallback sang DB khác. Giữ credentials trong môi trường chạy, không đưa vào report hoặc Git.

```powershell
# DATABASE_URL_PAYMENT phải được cấu hình đúng database cần kiểm kê.
pnpm.cmd run recover:payment:pending --report inventory-001.json --batch-size 100
```

Mặc định là dry-run, mọi transaction kiểm kê đều read-only. Report chứa `runId`, `cutoff`, `scanned`, `counts`, kết quả từng Payment, `nextCursor`, `hasMore`. Phạm vi gồm Payment có `created_at` và `order_completed_at` không sau cutoff. Nếu `hasMore: true`, chạy batch tiếp với **cùng cutoff** và `--after <nextCursor>`, dùng tên report mới. Batch đúng bằng giới hạn có thể cần thêm một lần đọc rỗng để xác nhận đã hết.

| Outcome | Cách xử lý |
| --- | --- |
| `candidate` | Payment `pending`/`failed`, không có paidAt, settlement settled, terminal event hoặc attempt pending/processing/succeeded; cần đối chiếu downstream trước apply |
| `existing_event` | Đã có payment.pending ở bất kỳ trạng thái outbox nào; không tạo ID mới. Nếu failed, dùng API replay có audit và giữ event ID |
| `processing_requires_review` | Tra cứu Wallet theo operation ID của attempt và đợi kết quả rõ ràng |
| `terminal_requires_review` | Đối soát trạng thái hiện tại; không tạo pending cho Payment settled/refunded/cancelled hoặc có bằng chứng terminal |
| `no_longer_completed` | Bản ghi không còn đủ điều kiện khi đọc lại; điều tra thay đổi dữ liệu |
| `backfilled` | Đã commit event và audit cùng transaction |
| `failed` | Lỗi/lock timeout; lưu mã lỗi, đối chiếu audit rồi chạy lại ID đó trong một batch mới |

Đối chiếu từng candidate với projection Order, inbox/notification thực sự đăng ký nhận event, lịch sử Wallet và bản lưu event nếu có retention. Không coi việc thiếu dòng outbox là bằng chứng event chưa từng được downstream xử lý. Trong repo hiện tại Order nhận `payment.succeeded`/`payment.failed`; Notification không khai báo `payment.pending`. Cần kiểm tra subscriber của môi trường triển khai trước recovery. Công cụ không truy vấn chéo DB để thay thế việc đối soát này.

Tạo manifest JSON chỉ chứa candidate đã được đối soát vẫn chờ thanh toán:

```json
[
  {
    "paymentId": "<UUID Payment đã đối soát>",
    "downstreamState": "awaiting_payment",
    "evidence": "<tham chiếu kết quả query, inbox hoặc phiếu đối soát>",
    "checkedAt": "<ISO timestamp lúc đối soát>"
  }
]
```

```powershell
pnpm.cmd run recover:payment:pending --apply --reviewed reviewed.json --actor '<UUID Admin/system actor>' --reason '<lý do và tham chiếu đối soát>' --cutoff '<cutoff của dry-run>' --report applied-001.json --batch-size 100
```

Apply chỉ duyệt các Payment trong manifest, kiểm tra lại trạng thái/event/settlement/attempt dưới `FOR UPDATE`, rồi ghi outbox và audit `payment.pending.backfill` trong cùng transaction. Không sửa trạng thái, timestamp hoàn tất hoặc số tiền Payment. Audit lưu actor, reason, run ID, trạng thái trước, bằng chứng downstream và event ID. UUID actor cần được đối chiếu với identity có quyền vận hành; CLI kiểm tra định dạng, không xác minh identity qua Auth.

Chạy lại/chạy đồng thời không tạo thêm event khi event cũ còn lưu. Không xóa outbox/audit trong lúc recovery. Sau retention, phải kiểm tra bản lưu/inbox trước khi duyệt manifest. Lock timeout 5 giây, statement timeout 15 giây; lỗi một bản ghi không dừng các bản ghi còn lại. `--report` bắt buộc và không ghi đè file có sẵn. `notSelected` liệt kê các ID trong manifest chưa thuộc batch hiện tại (do cursor/cutoff/không tìm thấy); phải giải thích các ID còn lại trước khi đóng recovery. Nếu process chết sau commit, audit vẫn lưu; chạy lại với tên report mới để kiểm tra event.

Sau apply, theo dõi outbox published/retry/failed và downstream. Row lock bảo vệ thứ tự ghi ở Payment, không bảo đảm thứ tự đến qua broker: không replay pending cho bản ghi đã terminal; kiểm tra consumer có chống lùi trạng thái khi nhận event muộn. Nếu inventory phát hiện terminal thiếu dữ liệu downstream, thực hiện quy trình reconciliation riêng theo trạng thái hiện tại, giữ ID của event đã tồn tại.

## Test bằng container local có sẵn

Database Payment test tên `handygo_hg51_payment_test` có thể đặt trong container PostgreSQL Wallet test cổng 55432. Áp dụng migration Payment/Wallet/Order vào database test đó, rồi export `PAYMENT_TEST_DATABASE_URL`, `DATABASE_URL_PAYMENT`, `DATABASE_URL_WALLET`, `DATABASE_URL_ORDER` cùng trỏ tới nó. Không đổi guard sang database local có dữ liệu sử dụng.

Nếu dùng broker Wallet test cổng 56672, đặt `PAYMENT_TEST_RABBITMQ_URL` và `RABBITMQ_URL` cùng trỏ tới broker đó; mặc định suite transport vẫn dùng 56674. Guard chỉ chấp nhận localhost/127.0.0.1 và cổng test 56672/56674.

```powershell
pnpm.cmd run test:integration:payment
pnpm.cmd run test:integration:wallet
pnpm.cmd run typecheck:payment
pnpm.cmd run typecheck:wallet
```

Wallet suite dùng `.env.wallet-test` và dọn fixture trong `handygo_wallet_test`; Payment suite dùng database riêng. Ledger Wallet append-only nên fixture ledger của Payment integration được giữ trong database test. Không teardown/xóa volume của môi trường người dùng đang chạy.
