# WALLET SERVICE

## V. EPIC: WALLET SERVICE — 8 TASKS

| Task | Mô tả công việc | API / Contract |
|---|---|---|
| **WAL-01 — Design Wallet Database & Ledger (Highest)** | Khởi tạo PostgreSQL/Prisma theo `handygo_wallet_service_v2.dbml`: `wallets`, `wallet_transactions`, `wallet_transfers`, `wallet_holds`, `withdrawals`, `outbox/inbox`. Quy định 1 POINT = 1 HGC = 1 VND, sử dụng BIGINT, ledger bất biến, balance constraints, unique wallet, idempotency và transaction indexes. Chuyển khoản nội bộ phải cân bằng tổng debit/credit, cập nhật balance và outbox nguyên tử. Đây là bước thiết kế DB ban đầu, không cần migration dữ liệu cũ. | Database |
| **WAL-02 — Implement Wallet Creation & Query (High)** | Tự động tạo ví 0 Point khi nhận `user.created` qua RabbitMQ, chống tạo trùng; seed ví hệ thống `PLATFORM_FEES`. Hỗ trợ xem số dư, trạng thái ví, lịch sử giao dịch, phân trang và filter. Trả `balance`, `reservedBalance`, `availableBalance`. Chỉ owner/Admin được truy cập public API; internal API yêu cầu service authentication. Publish `wallet.created` qua outbox và hỗ trợ đồng bộ user đã tồn tại. | `GET /wallets/me`<br>`GET /wallets/me/transactions`<br>`GET /wallets/me/transactions/:id`<br>`GET /internal/wallets/:userId/balance` |
| **WAL-03 — Implement Atomic Point Debit (Highest)** | Payment gọi Wallet trừ Point của Customer khi thanh toán. Thực hiện atomic transfer: Customer bị trừ `grossAmount`, Worker nhận `workerEarning`, hệ thống nhận `platformFee`. Validate quyền, số dư khả dụng, trạng thái các ví và tổng tiền. Sử dụng database transaction, row locking, ledger và outbox để tránh double-spend. Idempotency theo payment/attempt; timeout phải tra cứu kết quả trước khi retry. Publish `wallet.debited`, `wallet.credited` không trùng. | `POST /internal/wallets/:userId/debit-payment`<br>Internal operation status query |
| **WAL-04 — Implement Refund Credit & Adjustments (High)** | Hoàn Point theo giao dịch gốc, kiểm tra `refundId`, `paymentId`, số tiền và tổng đã hoàn. Thu hồi Point từ Worker/Platform hoặc dùng nguồn bù được duyệt; thiếu nguồn trả `needs_review`, không tự cộng Point. Admin có thể điều chỉnh số dư với authorization, reason, idempotency và audit. Ledger bất biến, sử dụng bút toán bù thay vì sửa giao dịch cũ. Publish `wallet.refunded`, `wallet.balance.adjusted` và `wallet.credited` khi phù hợp. | `POST /internal/wallets/:userId/refund-credit`<br>`POST /internal/wallets/:userId/adjustments` |
| **WAL-05 — Implement Wallet Top-up & Settlement Rules (High/P1)** | Hỗ trợ nạp Point thông qua Payment Service, không phụ thuộc cổng thanh toán cụ thể. VNPAY, Payoo hoặc provider khác chỉ là lựa chọn tích hợp ở Payment. Giữ API topup cũ làm alias tại Gateway/BFF, chuyển đến Payment bằng cùng idempotency key. Wallet chỉ cộng Point sau khi nhận `payment.topup.succeeded` từ Payment đã xác minh giao dịch. Ghi ledger deposit đúng một lần, publish `wallet.credited` và `wallet.topup.credited`. Quy định settlement Cash/Point, refund, withdrawal và conversion cố định 1 POINT = 1 VND. | `POST /wallets/me/topups` (Legacy alias)<br>`POST /payments/topups` (Payment API)<br>RabbitMQ Events |
| **WAL-06 — Implement Wallet Events, Security & Testing (High)** | Giữ 5 event cũ: `wallet.created`, `wallet.debited`, `wallet.credited`, `wallet.refunded`, `wallet.balance.adjusted`; bổ sung event topup/withdrawal khi cần. Triển khai RabbitMQ outbox/inbox, retry, DLQ, `correlationId` và idempotency. Kiểm thử authorization, service authentication, concurrent debit, holds, refund, timeout, duplicate requests/events và rollback transaction. Đối soát ledger với balance, reserved balance và tích hợp Payment Service. | RabbitMQ Events / Unit, Integration & E2E Tests |
| **WAL-07 — Implement Withdrawal Holds & Mock Payout Integration (High) — MỚI** | Cho phép User yêu cầu rút Point về tài khoản ngân hàng thông qua `MockPayoutProvider` của Payment, chưa chuyển tiền thật. Validate ownership, `bankAccountId` và `availableBalance`; tạo withdrawal + hold nguyên tử. Publish `wallet.withdrawal.requested`. Khi Payment xác nhận payout thành công thì capture hold và ghi debit ledger; thất bại/hủy hợp lệ thì release hold. Timeout hoặc trạng thái chưa rõ phải giữ hold để đối soát. Hỗ trợ danh sách, chi tiết, hủy và kiểm thử duplicate callback/cancellation race. | `POST /wallets/me/withdrawals`<br>`GET /wallets/me/withdrawals`<br>`GET /wallets/me/withdrawals/:id`<br>`POST /wallets/me/withdrawals/:id/cancel` |
| **WAL-08 — Implement Worker Earning & Platform Commission Collection (High) — MỚI** | Triển khai quản lý thu nhập Worker và thu phí nền tảng theo commission rules của Payment. Với Point, sử dụng lại atomic transfer ở WAL-03, không cộng tiền lần hai. Với Cash, Worker nhận tiền trực tiếp; Payment tạo `commission_receivables`, Wallet thu phí từ ví Worker sang ví hệ thống nếu đủ số dư. Nếu thiếu Point, giữ công nợ tại Payment, không cho số dư âm. Hỗ trợ idempotency, retry, settlement reporting, phân quyền và reconciliation giữa gross amount, worker earning và platform fee. | Internal Wallet Transfer / RabbitMQ Events / Settlement Integration |

## Lưu ý tích hợp Payment Provider

- Không mặc định VNPAY: VNPAY, Payoo hoặc nhà cung cấp khác là những phương án tham khảo, chỉ quyết định sau khi đánh giá API, chi phí và khả năng tích hợp.
- Payment Service chịu trách nhiệm lựa chọn provider, tạo yêu cầu thanh toán, xác minh callback/webhook và đối soát giao dịch.
- Wallet Service không tích hợp trực tiếp provider; chỉ ghi có Point khi Payment xác nhận giao dịch hợp lệ, có idempotency để tránh cộng tiền nhiều lần.
- Thiết kế provider adapter/interface để có thể đổi hoặc bổ sung cổng thanh toán mà không thay đổi logic Wallet.
- API `POST /payments/topups` và các event `payment.topup.succeeded`, `wallet.topup.credited` giữ nguyên, không phụ thuộc tên provider.

## Wallet internal API đề xuất

```http
POST /internal/wallets/:userId/debit-payment
POST /internal/wallets/:userId/refund-credit
GET  /internal/wallets/:userId/balance
```

Wallet nên lưu một `operationId` hoặc `idempotencyKey` unique cho mỗi lần trừ/hoàn tiền. Điều này rất quan trọng vì Payment có thể gửi lại request khi timeout; gửi lại không được trừ thêm lần nữa.

## Wallet RabbitMQ events

**Publish:**

- `wallet.created`
- `wallet.debited`
- `wallet.credited`
- `wallet.refunded`
- `wallet.balance.adjusted`

**Consume:** Có thể không cần consume domain event cho luồng thanh toán Point cơ bản nếu Payment gọi Wallet qua internal API đồng bộ. Sau này mới cần event cho top-up, settlement hoặc reconciliation.

## Các điểm cần thống nhất

- `payment.amount` được tính bằng VND, còn `wallet.balance` là HandyGo Coin (HGC). Nếu 1 HGC không bằng 1 VND, phải có quy tắc quy đổi rõ ràng; tuyệt đối không tự trừ số Point bằng số VND.
- Trừ Point từ Customer chưa đồng nghĩa với việc Worker đã được trả tiền. Nếu Worker nhận Point, cần credit hoặc transfer sang ví Worker; nếu Worker nhận VND, cần xác định cơ chế settlement/payout. Không nên tự động đánh dấu đã trả cho Worker chỉ vì Customer bị trừ Point.

## Những điểm tích hợp quan trọng nhất giữa sáu team

| Bên gọi / phát | Bên nhận | Contract |
|---|---|---|
| Order | Bidding | `service_request.published` qua RabbitMQ |
| Order | Matching | `service_request.published` qua RabbitMQ |
| Order | Tracking | Request/Proposal/Order events qua RabbitMQ |
| Bidding | Order | `GET /internal/service-requests/:id/bidding-eligibility` |
| Order | Bidding | `GET /internal/bids/:id/eligibility` |
| Order | Matching | `GET /internal/matching/results/:id/eligibility` |
| Matching | AI Service | `POST /internal/ai/matching/rank` |
| Order | Bidding | `order.created` qua RabbitMQ |
| Order | Payment | `order.completed` qua RabbitMQ |
| Payment | Order | `GET /internal/orders/:id/payment-eligibility` |
| Payment | Wallet | Internal debit/refund APIs |
| Payment | Order, Tracking | Payment events qua RabbitMQ |
| Wallet | Payment | Response giao dịch Wallet, cộng với event/audit khi cần |
