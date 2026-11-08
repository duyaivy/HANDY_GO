# Payment Service — phạm vi sandbox sau review 08/11/2026

Yêu cầu mới của người dùng ngày 08/11/2026 thay đổi phạm vi nghiệm thu trong `docs/review.md`: **mô phỏng cổng nạp tiền, không cần giao dịch VNPAY thật**. Wallet, ledger, hold, Payment, HTTP và RabbitMQ vẫn chạy thật trên database sandbox. Review gốc và evidence lịch sử được giữ nguyên.

## Cấu hình và ranh giới mô phỏng

- `NODE_ENV=development` hoặc `test`; `TOPUP_MOCK_ENABLED=true` trên cả Payment và Wallet. Mặc định tắt; production không chấp nhận simulated top-up dù flag được bật.
- `POST /api/v1/payments/topups` tạo checkout `mock://topup/MOCK-*`, trả `provider=mock`, `isSimulated=true`.
- Owner dùng JWT gọi `POST /api/v1/payments/topups/:id/simulate` với `{ "outcome": "succeeded", "confirmSimulated": true }` hoặc outcome `failed`. Endpoint không public. Server dùng số tiền checkout đã lưu, không nhận số tiền ở bước xác nhận.
- Success chỉ chuyển `credit_pending` và ghi outbox. Wallet thực sự ghi ledger, phát ACK; Payment chỉ `completed` sau ACK hợp lệ. Ledger và event có marker mô phỏng. Không có giao dịch ngân hàng thật.
- VNPAY adapter được giữ lại; exact GET IPN/return qua Gateway đã mở, callback vẫn kiểm tra chữ ký khi dùng VNPAY. Mock provider không chấp nhận public IPN. Demo mô phỏng không cần merchant credentials.
- Chỉ dùng database/broker sandbox riêng, không dùng chung ví có thể quy đổi giá trị thật.

## Funded refund

Internal `refund-credit` nhận `paymentId`, `refundId`, `amount`, `method` (`point`/`cash`), `grossAmount`. Payment xác nhận giao dịch Cash và gross snapshot; Wallet chỉ nhận qua internal auth.

- Operation cố định: `<paymentId>:refund:<refundId>`. Lookup trả operationId, transferId, kind, amount, status; retry không tạo ID mới.
- Point: thu hồi từ nguồn settlement gốc, tính partial theo mục tiêu lũy kế và thứ tự nguồn cố định để không lệch làm tròn. Thiếu nguồn khả dụng thì rollback, giữ `needs_review`.
- Cash: lựa chọn sandbox là compensation từ số dư khả dụng có thật trong `PLATFORM_FEES`. Không tự nạp quỹ, không cho âm, không bỏ qua refund ID qua adjustment. Ràng buộc customer/gross snapshot và tổng refund; giao dịch Point không được đi nhánh Cash.
- Commission Point được đảo theo settlement gốc. **Cash compensation giữ nguyên commission snapshot/receivable đã ghi**: Platform chịu khoản compensation, không tự miễn nợ hoặc trả commission lại Worker. Đây là lựa chọn sandbox cần Finance phê duyệt trước khi dùng tiền thật, không phải chính sách PO được suy ra.
- Approval/audit commit trước remote call; scheduler tiếp tục refund đã approve sau crash/timeout. Chỉ completed sau khi xác minh operation/kind/amount/transfer của Wallet. Refund, Payment và success outbox commit cùng transaction.
- Commission seed vẫn là 10%, Admin chỉnh 0–30%, không hồi tố. Seed cần thời điểm có timezone và actor cấu hình rõ ràng; không chạy seed/migrate production trong đợt này.

## Withdrawal và phân quyền

- Sandbox cần `WALLET_WITHDRAWALS_ENABLED=true`, `PAYOUT_MOCK_ENABLED=true`, `PAYOUT_MOCK_OUTCOME=succeeded|failed|unknown`. Chưa có provider ngân hàng thật.
- Snapshot sandbox xác minh owner/active qua User Trust, chỉ lưu userId, bankAccountId và marker mock.
- Hold → claim → mock send → capture/release và ledger đều thật. Unknown giữ hold, không tự gửi lại.
- Admin độc lập có `payment:reconcile` gọi `POST /api/v1/payments/admin/operations/payouts/:id/resolve-sandbox`, body `{ "status": "failed", "reason": "…", "confirmSimulated": true }` hoặc `succeeded`. Chỉ cho uncertain mock ở non-production, có audit; notification retry không gọi send lại.
- Auth seed đồng bộ permission Payment từ `StandardPermissions`, chỉ gán cho Admin. JWT cũ cần refresh/login để nhận quyền mới. Requester/Customer không tự duyệt refund.

## Bàn giao

Xem [evidence 08/11](evidence/HG-51-review-update-2026-11-08.md). Test dùng Postgres/RabbitMQ Docker local, controller/client nghiệp vụ thật, JWT RS256 test và fixture bank ownership sandbox. Không có bằng chứng VNPAY merchant thật; yêu cầu mới không cần bước đó.

Migration inventory, migrate/status scripts và DB pool budget đã gồm Payment. CI được bổ sung integration thực. Chưa push, tạo commit, deploy hoặc cấp quyền trên môi trường thật. Báo cáo reconcile vẫn không phải đối soát độc lập provider/ledger: `walletLedgerCompared=false` được giữ nguyên.
