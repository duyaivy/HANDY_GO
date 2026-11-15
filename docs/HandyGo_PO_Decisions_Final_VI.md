# HG-51 — PAYMENT SERVICE: CÁC QUYẾT ĐỊNH CỦA PRODUCT OWNER

**Dự án:** HandyGo  
**Phạm vi:** PAY-01–PAY-11 / Payment Service  
**Ngày chốt:** 05/11/2026  
**Cập nhật chính sách:** 05/11/2026 — chỉ hoàn về Point; Admin phê duyệt; bổ sung cấu hình VNPAY theo môi trường  
**Trạng thái:** Các quyết định nghiệp vụ đã được PO phê duyệt; những đề xuất kỹ thuật và phụ thuộc bên ngoài được phân biệt rõ  
**PR liên quan:** https://github.com/duyaivy/HANDY_GO/pull/63

> **Cách đọc tài liệu:** **ĐÃ CHỐT** là chính sách PO đã xác nhận. **ĐỀ XUẤT TRIỂN KHAI** là phương án kỹ thuật cần đội phát triển/bảo mật rà soát, không phải phê duyệt nghiệp vụ mới. **CHƯA CHỐT / PHỤ THUỘC** là nội dung chưa có xác nhận cuối cùng về quy trình, chính sách hoặc hợp đồng với hệ thống bên ngoài. Không được xem một đề xuất kỹ thuật là tích hợp đã hoàn thành.

## Các nguyên tắc nghiệp vụ bắt buộc

- Chỉ được thanh toán đơn hàng **sau khi Customer xác nhận hoàn thành Order**. Event `order.created` chỉ tạo trước bản ghi Payment và chụp (snapshot) mức hoa hồng; `order.completed` chỉ mở điều kiện thanh toán. Không tự động trừ Wallet.
- Payment điều phối quy trình; Wallet là nguồn dữ liệu chuẩn đối với số dư Point, các bút toán ledger và khoản tạm giữ (hold). **1 Point = 1 VND**; tiền và Point được biểu diễn bằng số nguyên chính xác.
- Mỗi Order có tối đa một Payment nhưng có thể có nhiều payment attempt. Thanh toán Point phải do Customer chủ động xác nhận. Chỉ Worker được giao Order mới được xác nhận đã nhận tiền mặt. Thanh toán Cash không tự tạo Point thu nhập cho Worker. **Mọi refund được phê duyệt, dù Payment ban đầu là Cash hay Point, đều hoàn dưới dạng Point vào ví HandyGo của Customer; không hoàn tiền mặt/chuyển khoản.**

## 1. Commission mặc định — ĐÃ CHỐT

**Quyết định:** Commission mặc định là **10,00%** giá trị Order đã thỏa thuận. Admin được cấu hình tỷ lệ trong khoảng **0,00%–30,00%** (bao gồm hai đầu mút). Commission áp dụng cho Order phải được snapshot tại `order.created` và **không được thay đổi hồi tố**.

**Đề xuất triển khai:**
- Tạo rule ban đầu 10% bằng seed script hoặc migration có kiểm soát, có khả năng truy vết, trước khi xử lý các event `order.created` thuộc phạm vi áp dụng. Dùng định danh hệ thống có audit hoặc Admin được ủy quyền; **không tự tạo UUID Admin giả**.
- Thời điểm hiệu lực phải là thời điểm rollout được cấu hình rõ ràng, không tự lấy thời gian khởi động ứng dụng. Cần làm rõ cách xử lý Order tạo trước rollout; không tự áp lại phí hoặc sửa ngày hiệu lực cho Order lịch sử.
- Version hóa bằng khoảng hiệu lực `[effective_from, effective_to)` (không bao gồm mốc kết thúc). Ngăn các rule active có khoảng hiệu lực chồng lấn **ở cấp database/cơ chế đồng thời**, không chỉ kiểm tra `SELECT` trước khi `INSERT`. Giữ nguyên snapshot và lịch sử.
- Tính platform fee bằng **ROUND_HALF_UP** đến VND nguyên; `worker_earning = gross - platform_fee`.
- Quản lý rule cần quyền Admin phù hợp và audit người tạo, thời gian hiệu lực, tỷ lệ và thay đổi.

**Phương án kỹ thuật được người dùng chốt ngày 07/11/2026:**
- Seed có kiểm soát nhận bắt buộc `COMMISSION_SEED_EFFECTIVE_FROM` (ISO timestamp có timezone) và `COMMISSION_SEED_ACTOR_ID` (UUID của Admin thật hoặc actor hệ thống đã được cấp quyền/audit). Không có giá trị mặc định, không tự chạy khi ứng dụng khởi động.
- Dev/test dùng thời điểm cố định và identity thử nghiệm rõ ràng; với DB dev dùng Admin thật đã tồn tại. UUID sinh trong integration fixture chỉ thuộc database test cô lập, không dùng như Admin triển khai.
- Staging/production chờ PO/DevOps cung cấp hai giá trị và xác minh actor. Payment không truy cập trực tiếp database Auth để xác minh chéo service.
- Seed giao dịch nguyên tử cùng audit, khóa đồng thời; chạy lại cùng cấu hình không thêm rule/audit. Cấu hình mâu thuẫn bị từ chối; không tự thay lịch sử hay lấp khoảng trước rollout.
- Phạm vi thực hiện là Payment. Phụ thuộc Wallet (nguồn refund) và User Trust (bank snapshot) được ghi lại và giữ fail-closed, không sửa hai service đó.

**Ví dụ:** Order 500.000 VND, commission 10% → platform nhận 50.000 VND, Worker nhận 450.000 VND. Commission 0% → platform nhận 0 VND, Worker nhận toàn bộ giá trị đơn.

## 2. Commission 100% — ĐÃ CHỐT: KHÔNG CHO PHÉP

- Không cho phép commission lớn hơn 30%; **100% bị cấm**.
- **Cho phép 0%**. Với Order có giá trị dương, `worker_earning` phải lớn hơn 0.
- Không cần yêu cầu Wallet hỗ trợ Worker earning bằng 0 để đáp ứng chính sách này.
- Kiểm tra khoảng giá trị và độ chính xác của tỷ lệ ở API, service và database. Giá trị đơn dương với tỷ lệ hợp lệ phải cho ra cách phân bổ tiền hợp lệ.

## 3. Quyền Admin — ĐỀ XUẤT TRIỂN KHAI

**Chính sách:** Các chức năng Admin phải có RBAC và audit rõ ràng. PO đã phê duyệt quyền Admin cấu hình commission từ 0–30%. Tên cụ thể và phạm vi của các permission dưới đây là đề xuất kỹ thuật, chưa phải bộ định danh quyền được PO ký duyệt riêng.

| Permission đề xuất | Phạm vi |
|---|---|
| `payment.read.all` | Xem toàn bộ Payment, có che dữ liệu nhạy cảm |
| `commission.manage` | Tạo và version hóa commission rule |
| `refund.read.all` | Xem các yêu cầu refund |
| `refund.create` | Tạo yêu cầu refund |
| `refund.approve` | Duyệt refund và số tiền cần hoàn |
| `refund.confirm` | Xác nhận hoàn tất nghiệp vụ sau khi Wallet đã xác nhận ghi Point (không thay thế quyền duyệt) |
| `payment.reconcile` | Thực hiện đối soát được phân quyền |
| `payment.dlq.replay` | Replay dead-letter event có kiểm soát |

Ưu tiên sử dụng tên quyền và vai trò đã có của dự án. Audit phải ghi Admin ID, hành động, trạng thái trước/sau, lý do và thời điểm. Nên tách người tạo và người duyệt đối với refund giá trị lớn; ngưỡng giá trị cụ thể cần có chính sách riêng.

## 4. Hoàn tiền cho đơn thanh toán Cash — ĐÃ CHỐT: CHỈ TRẢ POINT

**Quyết định PO (thay thế chính sách cũ):** HandyGo **không hoàn tiền mặt** cho bất kỳ khoản refund nào. Nếu Order đã được thanh toán bằng Cash, refund được Admin phê duyệt sẽ **cộng Point tương ứng vào ví HandyGo của Customer**, theo quy đổi **1 Point = 1 VND**. Hỗ trợ full và partial refund.

**Quy trình thống nhất:**
1. Customer gửi yêu cầu refund hoặc Admin khởi tạo yêu cầu có lý do, tham chiếu Payment/Order và số tiền.
2. Admin có quyền `refund.approve` kiểm tra bằng chứng/tranh chấp và **duyệt hoặc từ chối**; mọi quyết định phải có audit. **Không yêu cầu Customer xác nhận đã nhận tiền mặt**.
3. Sau khi được duyệt, Payment yêu cầu Wallet thực hiện một thao tác **credit Point có nguồn bảo đảm** cho Customer bằng `refundId`/operation ID cố định, idempotent.
4. Chỉ chuyển refund sang `completed` khi Wallet xác nhận bút toán cộng Point đã commit; nếu chưa rõ kết quả phải tiếp tục đối soát, không cộng lần hai.
5. Nếu chưa xác định nguồn bảo đảm hoặc không đủ nguồn để cộng Point (đặc biệt với Cash vì Worker nhận tiền ngoài hệ thống), chuyển **`needs_review`**, không tự phát hành Point và không đánh dấu hoàn thành.

**Phụ thuộc tài chính cần đội phụ trách thống nhất trước khi bật Cash-to-Point refund:** Ví hoặc khoản bảo đảm nào chi trả Point cho đơn Cash (ví Worker, khoản công nợ, quỹ bồi hoàn do platform quản lý, hoặc cơ chế khác), cách ghi nợ/thu hồi, và cách điều chỉnh commission. **Admin duyệt refund không đồng nghĩa cho phép tự mint Point không có nguồn.**

## 5. Hoàn tiền cho đơn thanh toán Point — ĐÃ CHỐT

**Quyết định:** Refund của đơn thanh toán bằng Point cũng **chỉ hoàn Point vào ví Customer**; hỗ trợ hoàn toàn bộ hoặc một phần. **Admin là người phê duyệt**. Nếu Wallet không có nguồn tiền/bút toán đảo hợp lệ, refund chuyển **`needs_review`**. Không hoàn Cash, không tự tạo Point không có nguồn và Payment không trực tiếp sửa số dư.

**Đề xuất triển khai:**
- Tất cả yêu cầu refund đi qua cùng một workflow phê duyệt Admin, không tách hai sản phẩm “cash refund” và “point refund”. Chỉ khác nhau ở nguồn cấp Point và cách đảo settlement/commission.
- Refund tham chiếu Payment đã `succeeded` ban đầu, có `refundId`, idempotency key và Wallet operation ID ổn định.
- Wallet thực hiện bút toán đảo/ghi Point có cân bằng và nguồn phù hợp; Payment chỉ chuyển `completed` sau khi Wallet xác nhận commit.
- Ngăn refund đồng thời làm vượt tổng số tiền đã thanh toán: kiểm tra trong transaction nguyên tử cả tổng đã hoàn và các khoản đang xử lý/đã duyệt.
- Kết quả Wallet không xác định phải giữ trạng thái đối soát; không dùng operation ID mới để retry.
- Admin approval phải được lưu cùng actor ID, lý do, thời gian, số tiền và bằng chứng; Customer không có quyền tự chấp thuận refund của chính mình.

**CHƯA CHỐT / PHỤ THUỘC:** Nguồn ngân sách cho hoàn Point đối với các khoản đã phân bổ/đã rút, đặc biệt với đơn Cash; quy trình thu hồi nợ hoặc bù nguồn. Trước khi có contract nguồn, giữ `needs_review`/fail-closed.

## 6. Partial refund — ĐÃ CHỐT

**Quyết định:** Hỗ trợ **cả full refund và partial refund**.

- **Đơn Cash và Point đều hoàn về Point, không có lựa chọn Cash refund.** Hoàn một phần: Payment chuyển `partially_refunded`. Khi tổng số tiền hoàn đạt toàn bộ giá trị đã thanh toán: Payment chuyển `refunded`.
- Ví dụ: Order đã thanh toán 500.000 VND, hoàn 100.000 VND → giá trị chưa hoàn còn 400.000 VND.
- Định nghĩa/version contract event tương thích downstream (`payment.partially_refunded`, `payment.refunded`, hoặc contract khác được các service liên quan thống nhất). Các trường đề xuất: `paymentId`, `orderId`, `refundId`, `refundAmount`, `totalRefunded`, `remainingAmount`, `status`, `eventId`, `eventVersion`.
- Phải thống nhất với consumer của Order và Notification trước khi phát event có ngữ nghĩa mới. Partial refund **không đồng nghĩa** hủy Order hoặc hoàn toàn bộ.
- Chỉ phát event refund thành công **sau khi Point đã được ghi có**. Admin phải duyệt trước mọi thực hiện hoàn tiền.
- Cần chốt quy tắc điều chỉnh commission tương ứng và cách xử lý làm tròn/phần dư VND; không tự đặt quy tắc kế toán trong code.

## 7. Nạp Point qua VNPAY — ĐÃ CHỐT NGUYÊN TẮC VÀ CẤU HÌNH MÔI TRƯỜNG

- **VNPAY sandbox** là provider ban đầu cho việc nạp Point. **Không dùng API refund của VNPAY cho tính năng Refund của HandyGo**: mọi hoàn tiền nội bộ chỉ trả Point theo mục 4–6.
- **Return URL không phải bằng chứng đã thanh toán.** Backend phải xác thực IPN (chữ ký, merchant, mã giao dịch, số tiền, trạng thái). Chỉ hoàn tất top-up khi nhận `wallet.topup.credited` sau khi Wallet commit. Nếu chưa có ACK, giữ `credit_pending` và đối soát.
- Cấu hình theo môi trường, không hard-code domain hay secret vào code. Tất cả lời gọi từ bên ngoài phải đi qua **API Gateway**; không public trực tiếp Payment Service `:3007`.

### 7.1. Production — domain backend HandyGo

**Đã xác nhận từ PO:** backend public base URL là `https://handygo.duyaivy.id.vn`.

**Đường dẫn đề xuất theo endpoint Payment PR #63, cần API Gateway proxy đúng:**

```dotenv
PUBLIC_API_BASE_URL=https://handygo.duyaivy.id.vn/api/v1
VNPAY_IPN_URL=https://handygo.duyaivy.id.vn/api/v1/payments/topups/vnpay/ipn
# VNPAY_RETURN_URL phải là endpoint/trang xử lý browser return thực sự tồn tại.
# Nếu chọn backend return handler qua Gateway, cần triển khai và đăng ký route này:
VNPAY_RETURN_URL=https://handygo.duyaivy.id.vn/api/v1/payments/topups/vnpay/return
VNPAY_PAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_TMN_CODE=<merchant-code-in-secret-store>
VNPAY_HASH_SECRET=<hash-secret-in-secret-store>
```

**Chú ý:** `GET /api/v1/payments/topups/vnpay/ipn` hiện có ở Payment Service nhưng **Gateway route phải được xác minh/bổ sung**. `GET /api/v1/payments/topups/vnpay/return` nêu trên là **đường dẫn thiết kế đề xuất, chưa được PR #63 triển khai**; không được cấu hình như endpoint hoạt động cho đến khi có handler thật. Có thể chọn `VNPAY_RETURN_URL` là trang web/app return của frontend thay vì BE, miễn xử lý redirect và truy vấn trạng thái top-up đúng cách. IPN riêng biệt với Return URL.

### 7.2. Local development — dùng Gateway port 3000

Theo `backend/.env.example` hiện tại: `API_PREFIX=api/v1`, Gateway ở `localhost:3000`, Payment Service nội bộ ở `localhost:3007`.

```dotenv
PUBLIC_API_BASE_URL=http://localhost:3000/api/v1
# Browser Return URL chỉ khả dụng nếu backend/frontend đã có handler thật:
VNPAY_RETURN_URL=http://localhost:3000/api/v1/payments/topups/vnpay/return
# Đường IPN local để test bằng tay (không phải URL VNPAY có thể gọi từ Internet):
VNPAY_IPN_URL_LOCAL=http://localhost:3000/api/v1/payments/topups/vnpay/ipn
VNPAY_PAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html
VNPAY_TMN_CODE=<sandbox-merchant-code>
VNPAY_HASH_SECRET=<sandbox-hash-secret>
```

**Bắt buộc khi test callback VNPAY thật từ Internet:** `localhost` **không thể làm IPN public**. Dùng HTTPS tunnel (ví dụ ngrok/cloudflared) hoặc một staging HTTPS domain truy cập được từ bên ngoài, forward tới Gateway `localhost:3000`. Ví dụ khi đã có hostname tunnel thực:

```dotenv
VNPAY_IPN_URL=https://<public-dev-host>/api/v1/payments/topups/vnpay/ipn
# Chỉ sử dụng nếu có return handler tương ứng trên tunnel:
VNPAY_RETURN_URL=https://<public-dev-host>/api/v1/payments/topups/vnpay/return
```

Không được giả định VNPAY cho phép đăng ký/cập nhật mọi IPN URL động; cần đối chiếu quy định/cấu hình merchant sandbox. `VNPAY_IPN_URL` trong ví dụ là **giá trị dùng để cấu hình phía merchant/VNPAY hoặc tài liệu triển khai**; code PR #63 hiện mới đọc `VNPAY_RETURN_URL`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_PAY_URL`, không tự đọc `VNPAY_IPN_URL`.

### 7.3. Checklist kỹ thuật bắt buộc trước khi bật

1. Xác minh `https://handygo.duyaivy.id.vn/api/v1` trỏ qua Nginx tới API Gateway và route `GET /payments/topups/vnpay/ipn` tới Payment Service; public route IPN **không yêu cầu JWT**, được bảo vệ bằng chữ ký VNPAY.
2. Thiết kế và triển khai **Return URL handler thực sự** (ở FE hoặc BE) trước khi điền `VNPAY_RETURN_URL`. Return URL chỉ cho biết kết quả hiển thị; FE/BE truy vấn trạng thái top-up do hệ thống xác nhận.
3. Tách secrets và callback URLs cho dev/staging/prod; không đưa hash secret vào source, log hay client bundle.
4. Chỉ tin IPN chữ ký hợp lệ và kiểm tra chính xác `vnp_TmnCode`, `vnp_TxnRef`, `vnp_Amount`, trạng thái, idempotency; theo tài liệu VNPAY sandbox, đối chiếu chữ ký và response code thực tế.
5. Test IPN trùng, sai chữ ký, sai amount, callback đến muộn, thiếu Wallet ACK, timeout và đối soát.
6. Không coi việc tài liệu có URL là bằng chứng route/Gateway/merchant đã được cấu hình; kiểm chứng trên môi trường thật trước khi bật.

**Tham khảo VNPAY:** https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html và https://sandbox.vnpayment.vn/apis/docs/faqs/ .

**PHỤ THUỘC:** Merchant credentials, địa chỉ IPN được VNPAY sandbox chấp nhận, endpoint Return URL thực tế, Gateway route và thử nghiệm sandbox end-to-end.

## 8. Payout và bank snapshot đã xác thực — ĐÃ CHỐT

**Quyết định:** **User Trust Service sở hữu thông tin tài khoản ngân hàng đã xác minh.** Payment không nhận trực tiếp thông tin ngân hàng thô từ client và không chỉ dựa vào `bankAccountId` chưa được xác minh.

**Contract đề xuất:** Payment gọi internal API có xác thực và version để lấy snapshot từ User Trust, gồm bank account ID, danh tính chủ sở hữu, trạng thái verified, ngân hàng và số tài khoản được bảo vệ. Snapshot phải khớp user và tài khoản của withdrawal. Cần mã hóa dữ liệu lưu trữ, che thông tin trong log và phân quyền truy cập. Wallet quản lý hold/release cho withdrawal; Payment điều phối payout.

Mock payout chỉ được chạy ở dev/sandbox, có chỉ báo mô phỏng rõ ràng. Giữ payout production ở trạng thái disabled tới khi có contract snapshot đã xác thực và provider thanh toán được phê duyệt.

**CHƯA CHỐT:** Internal API chính xác của User Trust, tiêu chí xác minh tài khoản ngân hàng, lịch lưu trữ, phân quyền truy cập và phê duyệt phương án mã hóa/quản lý khóa. Không được mô tả các phần này như thể đã triển khai xong.

## 9. Đối soát, retry và lưu trữ — ĐỀ XUẤT TRIỂN KHAI / CẦN RÀ SOÁT PHÁP LÝ

| Hạng mục | Phương án đề xuất |
|---|---|
| Quét giao dịch tài chính chưa xác định kết quả | Mỗi 60 giây; bảo đảm idempotency và an toàn khi chạy đồng thời |
| Đối soát hằng ngày | Báo cáo sai lệch settlement/top-up/refund mỗi ngày |
| Retry inbound tạm thời | Tối đa 8 lần, exponential backoff có giới hạn |
| Kết quả Wallet chưa rõ | Tra cứu cùng operation ID trước khi retry an toàn; không trừ tiền lặp một cách mù quáng |
| Replay dead-letter | Chỉ người vận hành được phân quyền; có audit và idempotency |
| Log kỹ thuật | Mục tiêu đề xuất lưu 90 ngày, hạn chế dữ liệu nhạy cảm |
| Bản ghi tài chính/audit | Mục tiêu đề xuất lưu 10 năm, **cần rà soát pháp lý và nghiệp vụ** |

Đây **không phải** thời hạn lưu trữ theo quy định pháp luật đã được xác minh. Không triển khai xóa dữ liệu tự động cho tới khi chính sách lưu trữ phù hợp được phê duyệt riêng.

## 10. Contract Wallet / RabbitMQ — ĐỀ XUẤT TRIỂN KHAI

Đề xuất thống nhất envelope:

```json
{
  "eventId": "stable-event-id",
  "eventType": "payment.topup.succeeded",
  "eventVersion": 1,
  "source": "payment-service",
  "occurredAt": "2026-11-05T12:00:00Z",
  "data": {
    "paymentId": "topup-uuid",
    "topupId": "topup-uuid",
    "userId": "user-uuid",
    "amount": "100000",
    "idempotencyKey": "stable-key"
  }
}
```

- Chuẩn hóa dữ liệu nghiệp vụ trong `data` và version contract; chỉ tạm hỗ trợ dạng root/`payload` cũ khi producer/consumer hiện tại còn cần.
- `eventId` có thể là chuỗi ổn định, không bắt buộc UUID (có giới hạn độ dài và validation). Các ID thực thể nghiệp vụ vẫn tuân theo quy định UUID của từng domain.
- Số tiền truyền dưới dạng chuỗi số nguyên dương theo contract; không dùng floating point.
- Thống nhất các trường producer/consumer cụ thể với đội Wallet trước khi bật thay đổi.
- `payment.topup.succeeded` chỉ có nghĩa provider đã xác nhận thanh toán, **chưa chắc Point đã được cộng vào Wallet**; `wallet.topup.credited` là xác nhận Wallet đã commit.

## Ranh giới triển khai và trạng thái bàn giao

**PO đã phê duyệt chính sách không có nghĩa chức năng đã được tích hợp hoàn chỉnh.** Ngày 07/11/2026 đã bổ sung trong workspace: seed có kiểm soát, API commission Admin, tra cứu Payment Admin, workflow yêu cầu/duyệt refund (Cash/Point đều có đích Point), replay DLQ có audit và báo cáo nội bộ Payment. Refund được duyệt giữ `needs_review`, chưa credit Wallet hoặc phát event hoàn thành. Bank snapshot và tích hợp tài chính liên service còn phụ thuộc bên ngoài. Xem [checklist hiện hành](payment-service/HG-51-PAYMENT-SERVICE-CHECKLIST.md) và [bằng chứng 07/11](payment-service/evidence/HG-51-test-evidence-2026-11-07.md). Không đánh dấu toàn bộ HG-51 đã hoàn thành trước nghiệm thu.

**Phân công đề xuất:** Payment (refund chỉ trả Point, commission, admin), Wallet (nguồn hoàn tiền và ledger idempotent), User Trust (bank snapshot đã xác minh), Order/Notification (consumer event partial refund), Operations/Security (credentials, đối soát, lưu trữ, replay).
