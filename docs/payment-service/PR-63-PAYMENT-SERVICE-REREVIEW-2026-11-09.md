# HANDY_GO — REVIEW LẠI PR #63 (HG-51 PAYMENT SERVICE)

**Ngày review:** 09/11/2026  
**Pull request:** https://github.com/duyaivy/HANDY_GO/pull/63  
**Nhánh:** `feature/HG-51-payment-service` → `main`  
**Commit được review:** `b22a7a44be8e7861e06230b09009c75e02298279`  
**Trạng thái tại thời điểm kiểm tra:** PR open; GitHub `mergeable: true` (không đồng nghĩa với đã đạt yêu cầu).  
**Quy mô PR:** 13 commits, 136 files changed.  
**Kết luận:** **REQUEST CHANGES — chưa approve/merge ngay**.

> Phạm vi: review mã nguồn và tài liệu evidence trên GitHub, đối chiếu các findings của lần review ngày 08/11/2026 với chính sách PO đã chốt. Không chạy lại test hoặc thực hiện deployment. Kết quả kiểm thử dưới đây là **báo cáo trong repository**, không phải xác minh chạy lại của reviewer.

## 1. Kết quả kiểm tra các findings cũ

| Finding | Tình trạng tại commit `b22a7a4` | Ghi chú |
|---|---|---|
| Gateway yêu cầu JWT với VNPAY IPN/Return | **ĐÃ SỬA (code)** | `api-gateway/src/auth/gateway-auth-route.policy.ts` mở chính xác hai route `GET`; những endpoint Payment khác không được mở rộng mặc định. |
| Refund chưa cộng Point | **ĐÃ BỔ SUNG (code)** | Payment gọi Wallet `refund-credit`, tra cứu operation cố định, xác minh ledger commit. |
| Refund chưa cập nhật Payment và phát event | **ĐÃ BỔ SUNG (code)** | Cập nhật `partially_refunded`/`refunded`, outbox, audit sau xác minh Wallet. |
| Malformed RabbitMQ event bị ACK nhưng không lưu dấu | **CHƯA SỬA** | Nhánh lỗi envelope vẫn trả `dead` mà không ghi failed event/quarantine. |
| Phân loại HTTP 4xx của Wallet | **CẦN XÁC MINH CONTRACT** | Phần lớn 4xx vẫn được coi là definitive failure; cần chứng minh các mã được phân loại đúng. |
| Bank snapshot User Trust / payout | **SANDBOX MỘT PHẦN** | Có sandbox provider gọi User Trust xác minh ownership; chưa phải payout ngân hàng production. |

## 2. Các phát hiện còn tồn tại và yêu cầu xử lý

### [P1][CONFIRMED] Inbound malformed event có thể bị ACK mà không có quarantine record

**File:** `backend/apps/payment-service/src/common/inbound/payment-inbox.service.ts`  
**Code liên quan:** `handle()` khi `unwrapInboundEvent(raw)` ném lỗi và trường hợp không tìm được registered handler; `consume()` gọi `rabbit.ack(context)` khi `handle()` trả outcome bình thường.

Khi event không có usable envelope hoặc không có handler, hàm xử lý ghi warning và trả `dead` nhưng **không tạo bản ghi lỗi bền vững**, trong khi consumer vẫn ACK broker message. Message vì vậy có thể biến mất khỏi RabbitMQ mà không có dữ liệu cần thiết để điều tra hoặc replay.

**Yêu cầu sửa:**

1. Thiết kế đường quarantine/dead-letter cho payload không parse được hoặc event type không được đăng ký; lưu metadata và payload đã xử lý an toàn trước ACK (không log bí mật nhạy cảm).
2. Nếu persist failure thất bại, không ACK: áp dụng NACK/requeue hoặc cơ chế DLQ đáng tin cậy; tránh vòng lặp vô hạn.
3. Trường hợp không có `eventId`, tạo khóa quarantine độc lập có tính ổn định phù hợp, không giả mạo ID của business event.
4. Thêm test malformed JSON/body/envelope, missing `eventId`, unknown event handler, persist failure và duplicate redelivery.

**Tiêu chí chấp nhận:** Không có đường ACK nào làm mất event bất thường mà thiếu record để audit/quarantine, hoặc thiếu broker DLQ bảo đảm.

### [P1][REQUIRES CONTRACT VERIFICATION] Phân loại lỗi Wallet HTTP 4xx cần chứng minh chính xác

**File:** `backend/apps/payment-service/src/common/clients/wallet-outcome.ts`  
**Liên quan:** `wallet.client.ts`, `payment-orders.service.ts`, Wallet Service operation/status/error contracts.

`interpretWalletResult()` coi `401`, `403`, `408`, `429` là `unknown`; hầu hết 4xx còn lại là `failed`. Cách này có thể đúng với **một số** lỗi nghiệp vụ, nhưng không thể mặc định mọi `409 Conflict` hay những lỗi ứng dụng khác là một lần debit chắc chắn thất bại nếu operation có thể đã commit/đang xử lý.

**Yêu cầu:**

1. Đối chiếu **mã lỗi và response body thực tế của Wallet** cho debit, operation lookup, duplicate operation, insufficient funds, conflict và timeout.
2. Tách definitive business failure với inconclusive outcome theo documented code/contract, không suy đoán chỉ từ HTTP status.
3. Khi kết quả chưa rõ, giữ `processing`, lookup cùng `operationId` và reconcile; không tạo attempt/operation mới dẫn tới double debit.
4. Bổ sung test tình huống 409, 404 khi lookup operation, timeout sau commit và retry trùng.

**Lưu ý:** Đây là yêu cầu kiểm chứng rủi ro, **chưa phải kết luận đã có double charge**.

### [P1][PO/FINANCE DEPENDENCY] Nguồn tiền của Cash → Point refund cần phê duyệt nghiệp vụ

**File:** `backend/apps/wallet-service/src/refund-adjustment/refund-adjustment.service.ts`

Hiện tại, refund của Payment ban đầu bằng Cash dùng ví hệ thống `PLATFORM_FEES` làm **nguồn debit**, và ví khách hàng làm đích **credit Point**. Giao dịch sử dụng balanced ledger, không tự mint Point vô nguồn — đây là điểm tốt.

Tuy nhiên PO mới chốt **mọi refund chỉ về Point, Admin duyệt**, chưa chốt `PLATFORM_FEES` là quỹ gánh trách nhiệm hoàn tiền Cash, nhất là khi hoàn toàn bộ Order lớn hơn commission đã thu.

**Yêu cầu:**

- Xác nhận bằng văn bản Finance/PO: nguồn ngân sách, điều kiện đủ số dư, xử lý công nợ và chính sách hoàn phí.
- Giữ `needs_review` và không credit nếu quỹ thiếu nguồn.
- Không bật Cash refund dùng nguồn quỹ này cho production trước khi chốt chính sách.
- Nếu chỉ merge sandbox, ghi rõ hạn chế và dấu hiệu `isSimulated`/cấu hình an toàn tương ứng.

### [P2][SCOPE/DOCUMENTATION] Mô tả PR và phạm vi thay đổi chưa được cập nhật đầy đủ

**File:** PR description, `docs/payment-service/*`, các tài liệu/nhánh phụ được đưa vào PR.

PR description hiện vẫn có mục *Not included* nói chưa có Admin/refund/commission seed, dù code đã bổ sung các phần đó. PR có 136 file, gồm cả Gateway, Auth, Wallet, CI/CD và một số tài liệu ngoài Payment.

**Yêu cầu:** Cập nhật mô tả PR theo code mới, liệt kê phần đã hoàn thành, sandbox only, các external dependencies, và giữ lại chỉ các thay đổi chéo service có lý do rõ ràng. Rà soát `.gitignore` cùng các tài liệu không liên quan để tránh accidental diff.

## 3. Phần đã cải thiện đáng ghi nhận

- **Gateway VNPAY:** Bổ sung exact public GET IPN và Return, không mở rộng toàn bộ `/payments`.
- **Refund:** Admin approve trước; operation ID dạng `${paymentId}:refund:${refundId}`; Wallet credit có nguồn và idempotency; Payment xác minh operation đã completed trước khi chuyển refund sang completed và phát outbox event.
- **Refund full/partial:** Có logic cộng dồn và chuyển trạng thái Payment sau khi Wallet commit; có reconciliation tiếp tục refund được approve.
- **Wallet:** Bổ sung service xử lý funded refund theo balanced transfer; trường hợp thiếu nguồn chuyển needs_review, không tự tạo Point.
- **Sandbox:** Mock top-up chỉ bật trong non-production và có kịch bản tích hợp; provider mock không làm VNPAY IPN thật trở thành bằng chứng thanh toán.
- **Payout:** Có sandbox bank snapshot adapter sử dụng internal User Trust verification, nhưng không đồng nghĩa tích hợp bank payout thật.

## 4. Đối chiếu chính sách PO cuối cùng

| Chính sách | Đánh giá |
|---|---|
| Commission mặc định 10%; Admin chọn 0–30% | **Code đã hỗ trợ** seed có kiểm soát, validation, snapshot; production seed cần actor + rollout timestamp thực. |
| Chỉ thanh toán sau khi Customer xác nhận Order completed | **Logic đã có**, vẫn phải xác minh cross-service khi triển khai. |
| Cash và Point refund **đều về Point** | **Code đã có luồng thực hiện**, có điều kiện nguồn quỹ. |
| Admin phải duyệt refund | **Đã có approval/audit**, cần đối chiếu quyền Auth khi triển khai thực tế. |
| Hỗ trợ full và partial refund | **Đã có logic và integration tests theo evidence**; cần đảm bảo downstream hiểu event partial. |
| Nạp Point qua VNPAY ở Gateway production/dev | **Gateway code đã sửa**, cần đăng ký/cấu hình merchant URL và xác minh sandbox thật trước khi bật. |
| Bank snapshot User Trust | **Sandbox verification đã có**, production payout chưa đủ. |
| Wallet giữ ownership ledger, Point 1:1 VND | **Thiết kế phù hợp**; cần xác nhận nguồn bù cho Cash refund. |

## 5. Bằng chứng test đã commit (chưa tự chạy lại)

Theo `docs/payment-service/evidence/HG-51-review-update-2026-11-08.md`:

- Default suite: **1.491 tests pass**, 118 skip.
- Payment integration: **51/51 pass** trên PostgreSQL và RabbitMQ Docker theo báo cáo.
- Typecheck, lint, build: tài liệu báo cáo **pass**.
- Có test Gateway + HTTP nội bộ + RabbitMQ và funded Wallet refund.
- Chưa có xác minh VNPAY merchant sandbox thật, ngân hàng thật, rollout/migration/seed production.
- Báo cáo ghi GitHub Actions có lần gặp lỗi `Migration owner classification missing or invalid: payment-service`; tài liệu không xác nhận CI remote xanh sau sửa. **Cần xem lại trạng thái CI thực tế tại head commit mới.**

Không được xem kết quả được ghi trong tài liệu là xác nhận độc lập của reviewer, cũng không được coi là chứng cứ đã chạy trên production.

## 6. Blocker trước merge so với các việc có thể deferred

### Cần xử lý trước khi approve PR hiện tại

- [ ] Xử lý đường malformed/unknown inbound event an toàn, không ACK rồi mất record.
- [ ] Đối chiếu Wallet 4xx response contract và chứng minh phân loại definitive/unknown là đúng.
- [ ] Chạy/kiểm tra CI ở HEAD cuối cùng; test migration và cross-service không có failure liên quan PR.
- [ ] Cập nhật PR description và xác định chính xác phạm vi demo/sandbox; dọn accidental diff nếu có.
- [ ] Ghi rõ Cash refund nguồn `PLATFORM_FEES` chỉ được bật trong điều kiện nguồn quỹ và chính sách được duyệt.

### Có thể deferred nếu PR chỉ merge để hỗ trợ sandbox

- [ ] VNPAY merchant sandbox thật và callback công khai chạy thử với credentials được cấp.
- [ ] Payout ngân hàng thật và bank snapshot an toàn cho production.
- [ ] Đối soát độc lập giữa Payment, Wallet ledger và provider (báo cáo hiện mới đếm trạng thái chưa hoàn tất).
- [ ] Chính sách Finance về Cash refund dùng quỹ `PLATFORM_FEES`, trước khi bật refund Cash-to-Point production.
- [ ] Phê duyệt retention, quy trình vận hành DLQ và chính sách audit chính thức.

## 7. Kết luận reviewer

**REQUEST CHANGES — chưa merge tại commit `b22a7a4`.**

PR #63 đã tiến bộ rõ rệt so với 08/11: Gateway route VNPAY đã sửa; refund Point đã được nối với Wallet thật, cập nhật trạng thái Payment và event; các integration test liên service đã được bổ sung. Tuy nhiên, lỗi mất dấu malformed RabbitMQ event vẫn tồn tại, Wallet failure classification còn cần chứng cứ contract, và phạm vi/quyết định nguồn quỹ Cash refund cần phân biệt rõ sandbox với production.

**Có thể xem xét APPROVE/MERGE theo phạm vi sandbox** khi các mục bắt buộc phía trên được xác minh/sửa và CI của commit cuối cùng xanh. Không tuyên bố toàn bộ Payment production-ready nếu VNPAY merchant, nguồn Cash refund và payout thật chưa được hoàn tất/phê duyệt.


## 8. Execution plan and evidence - 2026-11-10

Acceptance scope: sandbox per `PO-DECISIONS.md`. The historical review above remains unchanged; Finance approval and production readiness are not claimed.

| Step | Acceptance criteria | Result |
|---|---|---|
| 1 | Persist malformed/unknown delivery before ACK; independent quarantine key; storage failure NACK with backoff | Implemented and unit tested |
| 2 | Verify Wallet contract; unknown HTTP results retain the same operation/attempt | Implemented and unit tested |
| 3 | Block new production Cash refunds pending Finance funding policy | Implemented and unit tested |
| 4 | Tests, typecheck, lint, build; PostgreSQL/RabbitMQ migrations and integration | Full backend after rebasing onto PR HEAD: 1,584 passed / 118 skipped; targeted: 155 passed; Payment/Wallet typecheck, backend lint and Payment build pass. Local Docker daemon unavailable; remote CI verification follows push |
| 5 | Push current branch, update PR scope, comment execution evidence, verify final HEAD CI | See PR #63 execution comment |

### Technical decisions and limits

- Reuse `failed_inbound_events` with status `quarantined` and key `quarantine:<sha256(type + payload)>`. This identifies a delivery, never a business event. Migration `20261110143000_allow_inbound_quarantine` extends the existing status CHECK constraint without changing stored rows. Identical redelivery updates the same record.
- Retain only reason, digest and byte length for quarantine, avoiding arbitrary credentials and personal/bank data. Admin listing includes quarantine metadata; replay is rejected because the body is not retained. Recovery requires producer investigation and a corrected envelope with the original business ID. JSON key order can change the digest without affecting business inbox deduplication.
- On storage failure, keep delivery unacknowledged for five seconds before NACK/requeue. Prolonged database outages continue retrying at a reduced rate; no arbitrary discard without a guaranteed broker DLQ. Production monitoring, retention and recovery procedures remain required.
- Actual Wallet contract: `PaymentDebitService` can return 400/VALIDATION_ERROR or 404/NOT_FOUND before entering ledger; duplicate matching fingerprints return the existing operation. Ledger currently throws plain Error for insufficient balance, inactive wallets and mismatched idempotency, mapped to HTTP 500 by the shared filter. No error code guarantees an operation never committed on a previous request. All HTTP 4xx/5xx, timeout and missing lookup therefore stay unknown; only persisted operation `failed` is definitive failure and `completed` is success. Limitation: insufficient funds without a terminal operation stays processing until a future Wallet terminal-failure contract improves this behavior.
- New Cash refunds are blocked under `NODE_ENV=production` through the existing needs_review/audit path. Existing committed refunds remain readable on replay. Sandbox still requires available PLATFORM_FEES funds, never unbacked Point creation. Finance policy, real VNPAY merchant verification and real bank payout remain external dependencies.

Final push and CI evidence is recorded in the PR execution comment, separately from historical test reports.

Remote CI initially exposed the existing status CHECK constraint rejecting quarantined rows. Added an additive constraint migration; the PostgreSQL regression remains enabled and must pass on the final HEAD.
