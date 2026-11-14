# REVIEW PR #63 — PAYMENT SERVICE × WALLET SERVICE

> **Dự án:** HandyGo (`duyaivy/HANDY_GO`)  
> **PR:** [#63 — HG-51 Payment Service](https://github.com/duyaivy/HANDY_GO/pull/63)  
> **Head đã review:** `6ea7aa4aaefe6735d1cdc05b95627ea5bc02db9f` (07/11/2026)  
> **Đối chiếu:** Payment Service trong PR #63; Wallet, Gateway, Order, User Trust hiện có trên nhánh `main`.  
> **Trạng thái review:** **REQUEST CHANGES — CHƯA NGHIỆM THU END-TO-END**.  
> **Phạm vi:** Backend, không yêu cầu chỉnh Mobile/FE trong đợt review này.

## 0. CHỐT PHẠM VI TỪ PRODUCT OWNER (BẮT BUỘC)

**Chỉ được mock duy nhất bước chuyển tiền từ ví sang tài khoản ngân hàng khi rút tiền (bank payout).** Các nghiệp vụ khác phải chạy thật trong hệ thống **sandbox** với database, số dư ví, ledger, hold, trạng thái Payment/Wallet, event và idempotency được cập nhật chính xác. Không được dùng mock Wallet hoặc mock Payment thay cho kết quả giao dịch khi nghiệm thu end-to-end.

| Nghiệp vụ | Yêu cầu đã chốt |
|---|---|
| Nạp Point | Gọi VNPAY **sandbox thật**, nhận IPN hợp lệ, Wallet thực sự cộng Point và ghi ledger; **1 Point = 1 VND**. |
| Thanh toán bằng Point | Customer chủ động xác nhận **sau khi Order hoàn thành**; Wallet thực sự trừ Customer, cộng Worker và Platform theo commission snapshot. |
| Thanh toán bằng Cash | Worker của Order xác nhận đã nhận tiền ngoài hệ thống; ghi Payment/commission receivable, **không cộng thu nhập Point cho Worker** chỉ vì nhận Cash. |
| Hoàn tiền | **Chỉ hoàn Point** (kể cả giao dịch gốc Cash), hỗ trợ full và partial; Admin phê duyệt; Wallet thực sự cộng Point **từ nguồn có bảo đảm**, không mint Point vô nguồn. |
| Rút Point | Đăng ký/hủy/xem trạng thái rút, hold, capture/release, ledger là **thật trong Wallet sandbox**; **chỉ `payoutProvider.send()` chuyển ngân hàng được giả lập**, không có tiền ngân hàng thật được chuyển. |
| Commission | Mặc định **10%**, Admin chỉ chỉnh **0%–30%**, snapshot theo Order, không áp lại hồi tố. |
| Tra cứu | Số dư khả dụng, số dư giữ, lịch sử nạp/trừ/hoàn/rút và trạng thái giao dịch phải phản ánh dữ liệu thực. |
| An toàn giao dịch | Chống double-credit/debit, retry có idempotency, không kết luận thành công từ timeout, có đối soát và audit. |

**Ranh giới mock:** Mock provider phải có `provider=mock`, `isSimulated=true`, marker `MOCK-*` hoặc tương đương và chỉ được bật có chủ đích trên môi trường sandbox/dev. Không đánh dấu đây là chuyển khoản ngân hàng thật; không được dùng chung tiền/ví có khả năng quy đổi thực tế khi demo payout mock. Trên hệ thống production có tiền thật, payout mock phải tiếp tục bị vô hiệu hóa.

## 1. KẾT LUẬN NGẮN

PR #63 có nền tảng khá đầy đủ cho Payment: payment order, Point/Cash, VNPAY top-up, refund request/approval, commission rule, payout orchestration, inbox/outbox, reconciliation. Wallet trên `main` có số dư/ledger, withdrawal hold, payment debit, top-up settlement và internal refund endpoint.

Tuy nhiên **có API hoặc unit test pass không đồng nghĩa flow hoạt động end-to-end**:

- **P0:** Admin duyệt refund nhưng chưa cộng Point vào Wallet.
- **P0:** Payment ↔ Wallet chưa có **funded refund contract** dùng được cho cả Point/Cash, nhất là refund của đơn Cash.
- **P0:** Gateway chưa allowlist `GET /api/v1/payments/topups/vnpay/ipn` như public route có xác thực chữ ký provider. Top-up chưa được chứng minh chạy sandbox end-to-end.
- **P1:** Mock payout hiện **không dispatch được** do `UnavailableBankSnapshotProvider.fetch()` luôn trả `null`; bật env đơn lẻ không khắc phục.
- **P1:** `POST /payments` có rủi ro vi phạm replay/idempotency sau khi Order đã chuyển `paymentState=paid`.
- **P1:** Chưa có bằng chứng test thật RabbitMQ + HTTP Payment–Wallet–Order–Gateway và các race/failure quan trọng.
- **P1:** Workflow `PR CI` của head review đang fail ở `Detect Changes`, các job Backend bị skip; phải điều tra/khắc phục. Không khẳng định lỗi nằm ở Payment nếu chưa có log.

**Quyết định:** **REQUEST CHANGES.** Chỉ xét merge để nghiệm thu đủ nghiệp vụ sau khi các acceptance criteria bên dưới được chứng minh, hoặc tách PR thành milestone chưa bật chức năng nếu đội chấp nhận phạm vi hạn chế rõ ràng.

---

## 2. FINDINGS — CẦN SỬA

### [P0-01] Refund approval chưa thực hiện credit Point

**Nguồn:** `backend/apps/payment-service/src/refunds/refunds.service.ts`, `src/refunds/refunds.controller.ts`.

**Hiện trạng:** `decide()` ghi approved metadata rồi chuyển refund thành `needs_review` với lý do `Awaiting approved Wallet funding/reversal...`. Không gọi `WalletClient.refundCredit()`, không hoàn tất refund, không cập nhật Payment thành `partially_refunded`/`refunded` và không phát success event. Điều này là **fail-closed có chủ đích**, không phải giao dịch đã hoàn thành.

**Cần làm:** Sau Admin approve, có workflow xác định nguồn hoàn, gọi Wallet với **cùng `refundId`/operation ID** cho mọi retry, kiểm tra kết quả Wallet/ledger, chỉ sau commit mới cập nhật refund `completed`, Payment `partially_refunded` hoặc `refunded` và phát event tương ứng. Timeout/5xx/response bất định phải giữ trạng thái đối soát; tuyệt đối không gọi lại bằng ID mới.

**Acceptance:** Admin duyệt full/partial refund trên Point hoặc Cash đã được tài trợ → số dư Customer tăng chính xác, debit nguồn tương ứng, ledger cân bằng, Payment/Refund chuyển trạng thái đúng, event phát một lần về mặt nghiệp vụ. Nếu thiếu nguồn → `needs_review`, không credit.

### [P0-02] Wallet refund-credit chưa đủ contract cho Cash → Point

**Nguồn:** `backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts`; `backend/apps/payment-service/src/common/clients/wallet.client.ts`.

**Hiện trạng:** Wallet `refundTx()` tìm `walletTransfer` gốc có `kind='payment'` và `operationId` bắt đầu bằng `paymentId:`. Cash được trả ngoài hệ thống nên không có giao dịch Wallet payment debit gốc; vì vậy Cash refund theo path này không có nguồn để đảo. Đối với Point, Wallet có logic khóa giao dịch gốc, recovery source, chặn over-refund nhưng cần xác minh liên service.

**Cần làm:** Chốt và triển khai **funding/compensation contract** trong Wallet cho Cash-to-Point (ví dụ quỹ refund Platform **đã được cấp Point thật/đủ nguồn**, hoặc cơ chế funded recovery được duyệt). Không tự tạo Point và không dùng `adjustment` chung làm đường tắt không theo refundId. Cần quyết định cách điều chỉnh commission khi refund partial/full và làm tròn nguồn khi chia nhiều phần.

**Acceptance:** Point refund và Cash refund đều được funded, atomic, idempotent; ledger cân bằng; nhiều partial refunds không vượt tổng tiền giao dịch; thiếu nguồn hoặc race → giữ `needs_review`/retry an toàn. Admin approve **không phải** bằng chứng Wallet đã cộng Point.

### [P0-03] VNPAY IPN đi qua Gateway có nguy cơ bị chặn JWT

**Nguồn:** `backend/apps/api-gateway/src/auth/gateway-auth-route.policy.ts`, `src/proxy/proxy.constants.ts`, `backend/apps/payment-service/src/topups/topups.controller.ts` và `providers/vnpay-topup.provider.ts`.

**Hiện trạng:** Gateway đã proxy `/api/v1/payments` nhưng **chưa có public rule** cho `GET /api/v1/payments/topups/vnpay/ipn`. Provider VNPAY không gửi user JWT; nếu route bị middleware yêu cầu Bearer token, IPN không tới Payment để xác minh HMAC.

**Cần làm:** Thêm **exact GET public exception** cho IPN (và `return` nếu chọn browser return qua Gateway), **không mở public cả `/payments`**. Payment bắt buộc kiểm chứng chữ ký HMAC SHA-512, merchant, transaction ref, số tiền, response/transaction status, duplicate, late callback. Cấu hình URL sandbox/dev/staging qua HTTPS public tunnel hoặc hostname được merchant chấp nhận. Return URL **không xác nhận giao dịch**.

**Acceptance:** VNPAY sandbox giao dịch thành công → IPN signed hợp lệ → Payment `credit_pending` → `payment.topup.succeeded` → Wallet ledger credit → `wallet.topup.credited` → Payment `completed`. Callback duplicate không tăng Point, chữ ký sai/amount sai không tăng Point, lỗi Wallet giữ đối soát và không báo hoàn tất.

**Cấu hình URL gợi ý** (phải xác minh thực tế):

```dotenv
# Public production-style gateway (chỉ sử dụng khi route/merchant đã cấu hình)
PUBLIC_API_BASE_URL=https://handygo.duyaivy.id.vn/api/v1
VNPAY_IPN_URL=https://handygo.duyaivy.id.vn/api/v1/payments/topups/vnpay/ipn
VNPAY_RETURN_URL=https://handygo.duyaivy.id.vn/api/v1/payments/topups/vnpay/return
VNPAY_PAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html

# Local gateway (không dùng localhost làm IPN cho callback Internet)
# http://localhost:3000/api/v1/payments/topups/vnpay/ipn
# Sử dụng HTTPS tunnel/staging và merchant config cho sandbox callback thực.
```

`VNPAY_IPN_URL` đang có trong `.env.example` như metadata triển khai, provider chưa tự đăng ký IPN với VNPAY. Không đưa credential/token vào source, file review hoặc Mobile.

### [P1-01] Payout mock có provider nhưng vẫn kẹt ở bank snapshot

**Nguồn:** `backend/apps/payment-service/src/payouts/mock-payout.provider.ts`, `src/payouts/payouts.module.ts`, `src/payouts/payouts.service.ts`, `backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts`.

**Hiện trạng:** `MockPayoutProvider` có `succeeded/failed/unknown` và `isSimulated=true`, nhưng `PayoutsModule` inject `UnavailableBankSnapshotProvider`, hàm `fetch()` luôn trả `null`; `PayoutsService.advance()` dừng tại `bank_snapshot_unavailable`. `PAYOUT_MOCK_ENABLED=true` **không đủ**. Mock cũng chỉ bật khi `NODE_ENV !== production` — giữ giới hạn này.

**Cần làm:** Ở **sandbox/dev mode**, cung cấp `SandboxBankSnapshotProvider` an toàn: xác minh `bankAccountId` thuộc user/active bằng User Trust hoặc dữ liệu fixture sandbox đã quản lý, trả snapshot **không chứa bank secret**, dùng duy nhất cho mock. Không bỏ qua ownership/authorization. Sau đó flow phải đi hết: Wallet tạo withdrawal + hold → event → Payment claim Wallet → mock send → Payment callback final result → Wallet capture/release → Payment cập nhật Payout. Giữ khả năng `unknown` không retry gửi tiền mù; cần đường xử lý manual/sandbox reconciliation.

**Acceptance:** Mock success trừ chính xác Point từ balance và release reserved; mock failure chỉ release reserved; unknown giữ hold/needs_review, không tự huỷ hay gửi lại; cancel thắng trước claim thì không có payout; replay không trừ hai lần. Trạng thái `isSimulated`/`provider=mock` phải hiển thị rõ ở backend response/audit, không ghi “đã chuyển khoản ngân hàng thật”.

**Feature flags:** Wallet cần `WALLET_WITHDRAWALS_ENABLED=true` **chỉ trong sandbox đã cấu hình và được test**; Payment cần `PAYOUT_MOCK_ENABLED=true`, `PAYOUT_MOCK_OUTCOME=succeeded|failed|unknown` cùng môi trường sandbox. Tất cả mặc định tắt; không bật mock payout trên production có giá trị thật.

### [P1-02] Replay `POST /payments` sau khi Order đã paid có thể lỗi

**Nguồn:** `backend/apps/payment-service/src/payment-orders/payment-orders.service.ts`, `src/common/clients/order-eligibility.client.ts`; `backend/apps/order-service/src/internal/internal-order.service.ts`.

**Hiện trạng:** `PaymentOrdersService.open()` kiểm tra `eligibility.isEligibleForSettlement` trước khi tải Payment và xét nhánh `SETTLED_STATUSES`. Order Service trả eligible false khi `paymentState='paid'`; như vậy một lần chọn lại **đúng phương thức** sau khi event `payment.succeeded` đã cập nhật Order có thể bị 409, dù code định cho replay trả payment cũ.

**Cần làm:** Xử lý replay trạng thái settled an toàn trước guard settlement mới, đồng thời vẫn xác thực ownership, cùng Order/method/amount/worker và không cho đổi phương thức hoặc phát sinh charge mới. Viết test sau khi Order projection chuyển sang `paid`.

### [P1-03] Cross-service contract và reconciliation cần chứng minh

**Nguồn:** Payment `src/common/outbox`, `src/common/inbound`, `src/topups`, `src/payment-orders`, Wallet `src/topup-settlement`, `src/payment-debit`, `src/withdrawal`, Order event consumer.

**Hiện trạng:** Có outbox/inbox + kiểm soát operation ID. Tuy nhiên các bài integration Payment hiện dùng Wallet/Order mock, chưa có bằng chứng broker + HTTP thật giữa Payment ↔ Wallet ↔ Order ↔ Gateway. `payment.topup.succeeded` phải khớp envelope mà Wallet consumer đọc, `wallet.topup.credited` phải về Payment đúng shape; thanh toán Point retry sau timeout không được debit lặp; `payment.succeeded` phải cập nhật Order projection.

**Cần làm:** Tạo test integration thực với Postgres cho từng service, RabbitMQ, Gateway HTTP, JWT, internal secret và fault injection (timeout/duplicate/restart). Reconcile chưa được coi là báo cáo đối soát tài chính thực nếu chưa so khớp ledger/provider.

### [P1-04] Permission Admin và seed commission cần chạy trên môi trường mục tiêu

**Nguồn:** `backend/apps/payment-service/src/common/auth/admin-access.ts`, `src/commission-rules`, `prisma/seed-commission.ts`.

**Hiện trạng:** Payment yêu cầu **cả Admin role và permission** (`refund:approve`, `commission:manage`, ...). Code có seed 10% có kiểm soát, không tự chạy. Nếu Auth chưa cấp permission hoặc commission rule chưa seed thì Admin API bị 403 hoặc `order.created` bị fail-closed.

**Cần làm:** Đồng bộ role-permission thực tế Auth, kiểm thử JWT Admin/customer/worker; seed commission 10% với `COMMISSION_SEED_EFFECTIVE_FROM` rõ timezone và `COMMISSION_SEED_ACTOR_ID` hợp lệ; kiểm tra migrations và rule không overlap. Không đặt giá trị mặc định tùy tiện trên production.

### [P1-05] CI head PR chưa xanh

**Nguồn:** [PR CI run #147](https://github.com/duyaivy/HANDY_GO/actions/runs/42361870243) tại head `6ea7aa4`.

**Hiện trạng ghi nhận khi review:** `Detect Changes = failure`, `CI Gate = failure`, `Backend CI = skipped`. Không có log đủ để khẳng định nguyên nhân nằm ở Payment.

**Cần làm:** Lấy step logs của `Detect Changes`, sửa nguyên nhân, rerun toàn bộ các job phù hợp. Không nghiệm thu chỉ dựa vào báo cáo test local.

---

## 3. API BE CẦN CÓ VÀ KIỂM TRA

Tất cả public API qua **Gateway** prefix `/api/v1`; internal API chỉ cho service-to-service có auth, **không cho Mobile/FE gọi thẳng**.

### 3.1. Wallet public (đã có controller)

| Method | API (không tính `/api/v1`) | Mục đích | Ghi chú |
|---|---|---|---|
| GET | `/wallets/me` | Số dư và số dư khả dụng | Dữ liệu Wallet thật. |
| GET | `/wallets/me/transactions` | Lịch sử | Pagination/filter theo contract. |
| GET | `/wallets/me/transactions/:id` | Chi tiết ledger | Chỉ owner. |
| POST | `/wallets/me/withdrawals` | Tạo withdrawal + hold | Bật flag sandbox sau khi flow mock chạy được. |
| GET | `/wallets/me/withdrawals` | Danh sách | Chỉ owner. |
| GET | `/wallets/me/withdrawals/:id` | Chi tiết | Chỉ owner. |
| POST | `/wallets/me/withdrawals/:id/cancel` | Hủy trước claim | Release hold chính xác. |

### 3.2. Payment public (đã có controller)

| Method | API | Mục đích |
|---|---|---|
| POST | `/payments` | Chọn `cash` hoặc `point`. |
| POST | `/payments/:id/pay-with-points` | Customer xác nhận Point (`confirm: true`). |
| POST | `/payments/:id/confirm-cash` | Worker xác nhận tiền mặt. |
| GET | `/payments/me` | Danh sách Payment theo user. |
| GET | `/payments/:id` | Chi tiết Payment. |
| GET | `/payments/order/:orderId` | Tra Payment theo Order. |
| GET | `/payments/:id/attempts` | Lịch sử thử thanh toán. |
| POST | `/payments/topups` | Tạo VNPAY sandbox checkout. |
| GET | `/payments/topups` | Lịch sử nạp. |
| GET | `/payments/topups/:id` | Trạng thái top-up. |
| GET | `/payments/topups/vnpay/ipn` | IPN public exact route, xác thực chữ ký. |
| GET | `/payments/topups/vnpay/return` | Browser return **không xác nhận đã trả tiền**. |

### 3.3. Refund/Admin (có API quản lý nhưng **chưa hoàn Point**)

| Method | API | Mục đích |
|---|---|---|
| POST | `/payments/:id/refunds` | Customer yêu cầu full/partial refund. |
| GET | `/payments/:id/refunds` | Customer xem refund của Payment. |
| POST | `/payments/admin/:id/refunds` | Admin tạo yêu cầu refund. |
| GET | `/payments/admin/:id/refunds` | Admin xem các refund của Payment. |
| POST | `/payments/admin/refunds/:id/decision` | Admin duyệt/từ chối. **Cần nối tới funded Wallet credit.** |
| GET | `/payments/admin/records` | Danh sách toàn bộ payment (phân quyền). |
| GET | `/payments/admin/records/:id` | Chi tiết admin. |
| GET / POST | `/payments/admin/operations/{dead-letters,replay,reports,reconcile}` | Vận hành, DLQ/reconcile (method theo controller). |

### 3.4. Internal Payment ↔ Wallet (không expose public)

- `POST /internal/wallets/:userId/debit-payment` — trừ/cộng settlement Point.
- `GET /internal/wallets/operations/:operationId` — tra trạng thái debit.
- `POST /internal/wallets/:userId/refund-credit` — Wallet đã có endpoint nhưng phải **mở rộng contract nguồn Cash/Point** và Payment phải thực sự gọi khi approved.
- `POST /internal/wallets/commission/collect` — thu hoa hồng Cash.
- `POST /internal/withdrawals/:id/claim` — claim trước khi mock send.
- `POST /internal/withdrawals/:id/status` — Payment báo final status.
- `GET /internal/orders/:orderId/payment-eligibility` — Order kiểm tra quyền settlement.

**Không yêu cầu thêm endpoint public “rút tiền từ Payment”** nếu public Wallet withdrawal endpoints đã đủ; Payment chỉ orchestration qua event/internal HTTP.

---

## 4. TEST CASE BẮT BUỘC TRƯỚC KHI BÁO DONE

| ID | Luồng test | Kết quả cần chứng minh |
|---|---|---|
| TOP-01 | VNPAY sandbox success (qua Gateway) | 1 IPN → 1 Wallet credit → 1 Payment completed; balance tăng đúng. |
| TOP-02 | Duplicate/sai chữ ký/sai amount/return-only | Không tăng Point vô căn cứ; IPN duplicate idempotent. |
| TOP-03 | Wallet tắt/timeout sau VNPAY đã thanh toán | Giữ `credit_pending`/`needs_review`, retry/ACK hoàn tất chính xác 1 lần. |
| PAY-01 | Order chưa completed | Không thanh toán. |
| PAY-02 | Point sau Order completed | Customer debit; Worker + Platform credit; ledger cân bằng; Order cập nhật paid. |
| PAY-03 | Point bấm hai lần/timeout/restart | Một logical debit, không double-charge; outcome unknown được đối soát. |
| PAY-04 | Cash xác nhận đúng/sai Worker | Đúng người mới xác nhận; không cộng Point thu nhập Worker; commission receivable chính xác. |
| PAY-05 | Replay chọn phương thức sau khi Order paid | Trả Payment cũ nếu khớp, không 409 sai và không thu thêm tiền. |
| REF-01 | Approved full Point refund | Customer được cộng Point thật từ nguồn đảm bảo; Payment `refunded`. |
| REF-02 | Hai approved partial refunds | Tổng refund ≤ gross; status `partially_refunded` rồi `refunded`; rounding nhất quán. |
| REF-03 | Approved Cash → Point refund | Quỹ funded bị debit, Customer được credit; không mint Point, có audit. |
| REF-04 | Thiếu nguồn/failed/timeout, approve lặp | `needs_review`/retry an toàn, không double credit, chỉ completed sau Wallet commit. |
| REF-05 | Quyền Admin, Customer/Worker, self-approval | Không lộ refund cho người ngoài; đúng permission; không tự duyệt yêu cầu của mình. |
| WDR-01 | Mock success | Withdrawal → hold → claim → mock success → Wallet capture + trừ số dư/ledger thật. |
| WDR-02 | Mock failed | Hold release, khả dụng trở lại; không mất Point. |
| WDR-03 | Mock unknown/crash/duplicate | Không gửi payout giả lập hai lần; giữ needs_review/hold an toàn. |
| WDR-04 | User cancel cạnh tranh claim | Chỉ một kết quả thắng; không âm reserved/balance. |
| OPS-01 | Mất kết nối RabbitMQ/Wallet/Order, service restart | Inbound/outbox replay và reconciliation đưa kết quả về đúng trạng thái. |
| OPS-02 | Commission 0%, 10%, 30%, >30%, seed cạnh tranh | Đúng limit/rule; phí snapshot không hồi tố; không sinh rule trùng. |
| OPS-03 | Test JWT/Gateway public policy | IPN không cần JWT nhưng phải có chữ ký; các route khác vẫn auth/RBAC. |

**Môi trường test bắt buộc:** DB isolated cho Payment + Wallet + Order, RabbitMQ, Gateway, User Trust (hoặc sandbox stub chỉ cho bank snapshot), và VNPAY sandbox thực. Trong **acceptance end-to-end**, không thay thế Wallet/Order HTTP/RabbitMQ bằng unit mocks. Riêng `provider.send()` của withdrawal được mock.

---

## 5. EVIDENCE ĐÃ CÓ VÀ CHƯA CÓ

Tài liệu `docs/payment-service/evidence/HG-51-test-evidence-2026-11-07.md` tự ghi nhận:

- **128 unit tests pass**, **37 DB/HTTP integration tests pass**, Payment typecheck, lint, build và một E2E DI test pass theo môi trường của tác giả PR.
- Integration chủ yếu dùng **Wallet/Order mock**; chưa kiểm tra RabbitMQ thật, Payment–Wallet–Order end-to-end, VNPAY merchant sandbox thực, withdrawal claim/cancel thực tế hay funded refund.
- Backend whole-project typecheck được báo bị chặn vì thiếu generated `@prisma/tracking-client`, chưa coi là lỗi Payment nếu chưa tái hiện.

**Lưu ý:** Đây là **evidence trong PR**, không phải kết quả mình trực tiếp chạy local/staging. Không được ghi “đã nghiệm thu” chỉ từ các con số trên. PR description ban đầu cũ hơn cập nhật 07/11 (các refund/Admin endpoint đã được thêm sau đó), nên dùng code head + evidence 07/11 khi sửa.

---

## 6. ĐỀ XUẤT PHÂN TASK / THỨ TỰ TRIỂN KHAI

1. **Payment + Wallet (P0):** Thống nhất funded refund contract, hoàn toàn bộ/một phần, Cash → Point, audit/reversal/commission và đối soát idempotency. Chỉ báo done khi Wallet thực sự có ledger credit.
2. **Gateway + Payment (P0):** Bổ sung public IPN route chính xác; setup VNPAY sandbox và chạy nạp Point thực vào Wallet qua broker.
3. **Payment + Wallet + User Trust (P1):** Sandbox snapshot/verified bank account, mock payout provider với success/failed/unknown, Wallet hold/capture/release thật. Không làm provider ngân hàng thật.
4. **Payment + Order + Wallet (P1):** Sửa settled replay; chạy tất cả flow payment Cash/Point và consumer event thật.
5. **Auth + DevOps + QA (P1):** Provision permissions/commission seed, migrations, CI, đầy đủ lỗi mạng/retry/duplicate/reconciliation, documentation và evidence.

## 7. ĐIỀU KIỆN APPROVE / MERGE

Chỉ APPROVE hoàn thành nghiệp vụ khi:

- [ ] Tất cả findings **P0** được sửa, có test và log/số liệu đối soát chứng minh credit/debit ledger thực.
- [ ] Top-up VNPAY **sandbox thật** qua IPN → Wallet ACK → Payment completed.
- [ ] Thanh toán Point và Cash với Order–Wallet qua HTTP + RabbitMQ thật hoạt động.
- [ ] Refund Point/Cash (full + partial) được Admin duyệt và **thực sự hoàn Point có nguồn**, không double-credit.
- [ ] Withdrawal **chỉ mock bank send**, còn hold, balance, ledger, claim, finish, cancel, failure đều thật trên Wallet sandbox.
- [ ] Các tình huống duplicate, timeout, out-of-order, service restart và race không làm lệch tiền.
- [ ] Gateway, Auth/RBAC, seed 10%, migration và env sandbox đúng, không lộ credentials.
- [ ] PR CI xanh hoặc có giải trình + bằng chứng đầy đủ cho check bắt buộc; không xem job skipped là pass.
- [ ] Có báo cáo test end-to-end cập nhật từ **commit mới**, các giới hạn còn lại được ghi rõ.

**Không nằm trong scope:** tích hợp ngân hàng thật, chuyển khoản thực, production payouts. **Không được mock:** nạp VNPAY sandbox, số dư và ledger, thanh toán Point/Cash, funded refunds, hay kết quả commit của Wallet.

---

## 8. LINK CODE ĐỐI CHIẾU

- [PR #63](https://github.com/duyaivy/HANDY_GO/pull/63)
- [Payment Refunds Service](https://github.com/duyaivy/HANDY_GO/blob/feature/HG-51-payment-service/backend/apps/payment-service/src/refunds/refunds.service.ts)
- [Payment Payout Provider Mock](https://github.com/duyaivy/HANDY_GO/blob/feature/HG-51-payment-service/backend/apps/payment-service/src/payouts/mock-payout.provider.ts)
- [Payment Payouts Service](https://github.com/duyaivy/HANDY_GO/blob/feature/HG-51-payment-service/backend/apps/payment-service/src/payouts/payouts.service.ts)
- [Payment Orders Service](https://github.com/duyaivy/HANDY_GO/blob/feature/HG-51-payment-service/backend/apps/payment-service/src/payment-orders/payment-orders.service.ts)
- [Wallet Refund Adjustment](https://github.com/duyaivy/HANDY_GO/blob/main/backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts)
- [Wallet Withdrawal](https://github.com/duyaivy/HANDY_GO/blob/main/backend/apps/wallet-service/src/withdrawal/withdrawal.service.ts)
- [Gateway Auth Public Rules](https://github.com/duyaivy/HANDY_GO/blob/main/backend/apps/api-gateway/src/auth/gateway-auth-route.policy.ts)
- [Gateway Payment Proxy](https://github.com/duyaivy/HANDY_GO/blob/main/backend/apps/api-gateway/src/proxy/proxy.constants.ts)
- [Evidence 07/11](https://github.com/duyaivy/HANDY_GO/blob/feature/HG-51-payment-service/docs/payment-service/evidence/HG-51-test-evidence-2026-11-07.md)
- [PR CI run #147](https://github.com/duyaivy/HANDY_GO/actions/runs/42361870243)

**Ghi chú cuối:** Review dựa trên mã nguồn GitHub tại head nêu trên, chưa chạy lại test độc lập hoặc tác động staging/production. Sau khi đồng đội sửa PR, phải review **head mới** và xác minh lại acceptance criteria.
