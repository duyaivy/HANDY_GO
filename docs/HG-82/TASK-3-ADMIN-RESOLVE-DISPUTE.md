# [HG-82] Task 3: Admin phán quyết khiếu nại sau hoàn thành

- **Mã công việc:** HG-82-TASK-03
- **Phân hệ:** `order-service`, `payment-service`, `notification-service`, `tracking-service`
- **Trạng thái:** Đã triển khai code local; chưa xác minh tích hợp DB/RabbitMQ/Wallet vì Docker local chưa chạy
- **Nhánh phát triển:** `feature/HG-82-order-dispute-7-days-admin-resolution`
- **Tài liệu liên quan:** `docs/HG-82/README.md`, Task 1 và Task 2 trong cùng thư mục

## 1. Phạm vi và hiện trạng

Task này xử lý khiếu nại HG-82 mở từ đơn đã `completed` trong vòng 7 ngày (`disputePreviousStatus = completed`). Tranh chấp ORD-08 mở khi `in_progress` hoặc `awaiting_customer_confirmation` vẫn dùng hành vi cũ. Không được suy diễn `complete` thành `dismiss` hoặc `cancel` thành `refund`: hai action cũ không tạo giao dịch hoàn tiền.

Các sự thật cần giữ khi triển khai:

- Payment nhận `order.created`, `order.completed`, `order.cancelled` và từ Task 3 nhận thêm `order.dispute.decision.recorded`. `order.completed` chỉ mở payment cho khách thanh toán; nó không chứng minh đã thu tiền hoặc giải ngân.
- Payment hiện chỉ tạo refund cho payment `succeeded` hoặc `partially_refunded`; nó kiểm tra cả các khoản refund đã đặt chỗ. Refund được coi là hoàn tất sau khi Wallet xác nhận ghi sổ.
- Payment tiêu thụ `order.dispute.decision.recorded`, không dùng `order.dispute.resolved` để tạo refund. Chưa có cơ chế giữ hoặc nhả tiền theo khiếu nại HG-82; phán quyết refund chỉ trở thành kết quả cuối khi Wallet xác nhận. Không ghi “giải ngân” hoặc “giải phóng hold” là kết quả của event này.
- Trạng thái `completed` mô tả công việc đã nghiệm thu. Với khiếu nại sau hoàn thành, không đổi đơn sang `cancelled` chỉ để biểu diễn refund; kết quả tranh chấp và trạng thái tiền là dữ liệu riêng.

### 1.1. Chủ sở hữu phần tích hợp liên dịch vụ

- Phạm vi HG-82 bao gồm **cả `order-service` và `payment-service` trên nhánh HG-82**: Order ghi quyết định, Payment tiêu thụ event và thực hiện refund, Order nhận kết quả cuối. Hai phần đã được code trong cùng nhánh. Contract liên dịch vụ gồm `order.dispute.decision.recorded`, `GET /api/v1/internal/payments/order/:orderId/refundable`, `POST /api/v1/internal/payments/dispute-resolutions/:resolutionId/cancel-for-override`, `payment.dispute.refund.completed` và `payment.dispute.refund.needs_review`, đều gắn `resolutionId`.
- **Chính sách mở lại khiếu nại sau hoàn tiền (Policy):** Đơn đã hoàn tiền toàn phần (`paymentState = 'refunded'`) kết thúc quyền mở khiếu nại sau hoàn thành (trả HTTP 409 `ORDER_ALREADY_FULLY_REFUNDED`). Đơn hoàn tiền một phần (`paymentState = 'partially_refunded'`) vẫn được phép mở khiếu nại trong cửa sổ 7 ngày từ `completedAt`.
- **Đối soát & Override an toàn:**
  - Khi Wallet từ chối 4xx (`credit.outcome === 'rejected'`), Payment gọi lại `getOperation(operationId)` để xác thực chắc chắn không có ledger commit rồi mới chuyển dispute refund sang trạng thái terminal `failed` (giải phóng hạn mức hoàn tiền cho phán quyết thay thế) và phát `payment.dispute.refund.needs_review`. Nếu trạng thái Wallet chưa xác định (`unknown`), giữ nguyên `needs_review` và giữ chỗ reservation.
  - Trước khi supersede một phán quyết `needs_review` (`action = refund`), Order bắt buộc gọi `POST /api/v1/internal/payments/dispute-resolutions/:resolutionId/cancel-for-override`. Payment chỉ trả `safeToOverride = true` sau khi xác nhận Wallet không ghi nhận chuyển tiền và chuyển refund cũ sang trạng thái terminal `cancelled`/`failed` dưới khóa Payment; nếu Wallet đã commit, Payment đối soát hoàn tất ngay và chặn override (`409 DISPUTE_REFUND_ALREADY_COMPLETED`). Nếu có completion đến muộn sau khi cancel, Payment vẫn đồng bộ `completed` và Order đồng bộ `paymentState` + ghi bản ghi `reconciled_late`.
  - Event kết quả hoàn tiền lệch guard ở Order **không** bị ghi vào `consumed_events`; thay vào đó được phân loại (`recoverable` / `invalid`) và lưu bền vững vào `order_service.inbound_event_reconciliations` với `safe_payload` chỉ gồm các trường cho phép. Admin xem qua `GET /api/v1/admin/orders/dispute-reconciliations` và phát lại `eventId` gốc sau khi sửa dữ liệu qua `POST /api/v1/admin/orders/dispute-reconciliations/:eventId/replay`.
- **Tổng hợp Prisma Migrations trên nhánh HG-82 (7 migrations additive):**
  - `order-service` (6): `20261121000000_add_dispute_evidence_metadata`, `20261121001000_add_dispute_queue_index`, `20261121002000_admin_dispute_resolutions`, `20261122000000_active_dispute_resolution_unique`, `20261122001000_add_order_dispute_category`, `20261122002000_add_inbound_event_reconciliations` (3 migration ngày 22/11 cần chạy `prisma migrate deploy` trước khi khởi chạy code mới).
  - `payment-service` (1): `20261121002000_dispute_refund_link`.

## 2. Action và chuyển trạng thái

| Bối cảnh | Action nhận | Kết quả nghiệp vụ |
| :--- | :--- | :--- |
| Sau hoàn thành (`disputePreviousStatus = completed`) | `dismiss` | Bác bỏ khiếu nại; `disputed → completed`. Giữ mốc hoàn thành, trạng thái Payment và số tiền hiện có. Không phát lại `order.completed`. |
| Sau hoàn thành | `rework` | Yêu cầu bảo hành; `disputed → in_progress`. Không tạo khoản thu mới. Giữ mốc hoàn thành đầu tiên để kiểm toán. |
| Sau hoàn thành, Payment đã thanh toán và còn số dư được hoàn | `refund` | Ghi quyết định `refund_pending`; đơn vẫn `disputed` cho đến khi Payment xác nhận. Khi refund hoàn tất, `disputed → completed`; lưu kết quả hoàn toàn phần hoặc một phần. |
| Trước hoàn thành (`in_progress` hoặc `awaiting_customer_confirmation`) | `resume_previous_state`, `cancel`, `complete` | Giữ ý nghĩa ORD-08 hiện tại. Không ánh xạ các action này sang refund/bảo hành. |

Với khiếu nại sau hoàn thành, từ chối ba action cũ bằng HTTP 400 `LEGACY_ACTION_NOT_ALLOWED_AFTER_COMPLETION`. Với tranh chấp trước hoàn thành, từ chối `dismiss`, `rework`, `refund` trong Task này để tránh thay đổi ngầm hành vi cũ. UI chỉ hiển thị action đúng với `disputePreviousStatus`.

### 2.1. Mốc hoàn thành và bảo hành

- Thêm `firstCompletedAt` nullable vào Order; backfill từ `completedAt` hiện có. Luồng hoàn thành đơn mới gán trường này đúng một lần khi khách nghiệm thu lần đầu. Đây là mốc nghiệm thu đầu tiên, không bao giờ ghi đè. Nếu bản ghi lịch sử thiếu mốc đáng tin cậy, đánh dấu cần rà soát; không tự gán `now()` cho một lần hoàn thành trong quá khứ.
- `completedAt` và `workerFinishedAt` biểu diễn chu kỳ thực hiện hiện tại. Khi `rework`, lưu snapshot hai mốc cũ trong hồ sơ phán quyết rồi reset chúng về `null`; `firstCompletedAt` vẫn giữ nguyên.
- Khi thợ làm lại xong và khách nghiệm thu, `completedAt` nhận mốc mới. Cửa sổ khiếu nại 7 ngày của Task 1 tính từ mốc hoàn thành chu kỳ mới; `firstCompletedAt` phục vụ kiểm toán lịch sử.
- Hoàn thành chu kỳ bảo hành phát event riêng `order.warranty.completed`. Không phát thêm `order.completed` để tránh tạo một chu kỳ thanh toán mới hoặc thông báo hoàn thành gốc lần hai. Cần cập nhật nhánh hoàn thành đơn để phân biệt chu kỳ gốc và bảo hành.
- `rework` không tự giữ tiền, giải ngân hay đổi trạng thái Payment. Nếu nhóm muốn tạm dừng thu tiền/giải ngân trong bảo hành, phải bổ sung contract Payment/Wallet riêng trước khi công bố tính năng đó.

### 2.2. Refund sau hoàn thành

- Chỉ chấp nhận khi Payment gốc ở `succeeded` hoặc `partially_refunded`. Nếu `pending`, `processing`, `failed`, `cancelled` hoặc không tìm thấy Payment: HTTP 409 `PAYMENT_NOT_REFUNDABLE`, không ghi phán quyết. Trường hợp “khách thắng nhưng chưa trả tiền” cần chính sách miễn thu riêng; Task 3 này không gọi đó là refund.
- Nếu Admin phán quyết chính đơn do mình là khách hàng, trả HTTP 403 `REFUND_SELF_APPROVAL_FORBIDDEN` trước khi ghi quyết định; Payment kiểm tra lại actor theo snapshot để bảo vệ lớp cuối.
- Số tiền là VND nguyên dương, truyền dưới dạng chuỗi thập phân `refundAmountVnd`; không dùng JavaScript `Number` để tính tiền. Nếu bỏ trống, mặc định bằng **số tiền còn được hoàn** do Payment tính, không mặc định bằng `agreedPrice`.
- Order gọi API nội bộ chỉ đọc của Payment theo `orderId` để lấy `paymentId`, trạng thái và hạn mức còn hoàn trước khi nhận quyết định. Payment kiểm tra lại dưới khóa giao dịch khi tiêu thụ event; kiểm tra ở Order không thay thế kiểm tra của Payment.
- Payment tái sử dụng các bất biến của `RefundsService`: payment đã thanh toán, tổng các refund đã hoàn/đặt chỗ không vượt số đã thu, idempotency key, phê duyệt và xác nhận Wallet. Order không ghi trực tiếp DB Payment/Wallet.
- Nếu Wallet chưa xác nhận, response và hồ sơ phải là `refund_pending` hoặc `needs_review`, tuyệt đối không hiển thị “đã hoàn tiền”. `Refund.status = needs_review` trong Payment hiện được gán ngay sau phê duyệt và có thể là trạng thái trung gian đang đối soát; Order chỉ chuyển resolution sang `needs_review` khi Payment gửi tín hiệu **cần can thiệp** rõ ràng, không sao chép trạng thái thô này. Không tự thử lại bằng một ID mới sau timeout; tiếp tục đối soát bằng cùng `resolutionId`/`refundId`.

## 3. Dữ liệu cần bổ sung

Tạo migration trong `order-service`:

1. `Order.firstCompletedAt DateTime?`, bất biến sau lần gán đầu; backfill an toàn như mục 2.1. Migration thêm cột trước, rồi chạy câu lệnh idempotent trong migration local: `UPDATE order_service.orders SET first_completed_at = completed_at WHERE first_completed_at IS NULL AND completed_at IS NOT NULL;`. Với đơn từng làm lại hoặc dữ liệu lịch sử không đủ tin cậy, `completed_at` chỉ là mốc cũ hiện biết, cần đối chiếu `order_status_history` trước khi gọi là “lần đầu”. Không chạy migration/backfill trên môi trường deploy khi chưa được chỉ đạo.
2. `PaymentState.partially_refunded` để projection Order diễn đạt đúng refund một phần.
3. Bảng `OrderDisputeResolution` lưu một quyết định cho mỗi lần mở tranh chấp: `id` (resolutionId), `orderId`, `disputedAt` của lần khiếu nại, `idempotencyKey`, `requestHash` để so payload khi retry, `adminUserId`, `action` chuẩn, `resolutionNote`, `state` (`refund_pending | completed | needs_review` trong code hiện tại), `refundAmountVnd` nullable, `paymentId`/`refundId` nullable, snapshot `completedAt` và `workerFinishedAt` trước phán quyết, `failureCode` nullable và các timestamp. Unique (`orderId`, `disputedAt`) và unique `idempotencyKey` để không tạo hai phán quyết cho cùng một lần khiếu nại. Payment bổ sung `Refund.disputeResolutionId` nullable/unique để liên kết refund với quyết định.

`disputeResolvedAt` trên Order chỉ ghi khi kết quả cuối đã xong: ngay với `dismiss`/`rework`, sau xác nhận Payment với `refund`. `disputeResolutionNote` vẫn lưu để API cũ đọc được; bảng mới là nguồn kiểm toán các lần phán quyết. Khi `refund_pending` hoặc `needs_review`, Order giữ `status = disputed` để Task 2 vẫn thấy hồ sơ cần theo dõi. Với refund hoàn tất, Order trở về `completed` và giữ `completedAt`/`firstCompletedAt`; `paymentState` lấy từ kết quả Payment (`partially_refunded` hoặc `refunded`). Không sửa `cancelledAt`/`cancelReason` cho khiếu nại sau hoàn thành.

## 4. API Admin

`POST /api/v1/admin/orders/:id/resolve-dispute` tiếp tục dùng `TrustedGatewayGuard` và `AdminGuard`, đồng thời service kiểm tra role. Request mới:

~~~json
{
  "action": "refund",
  "resolutionNote": "Đã xác minh lỗi thi công và chấp thuận hoàn một phần.",
  "refundAmountVnd": "150000",
  "idempotencyKey": "case-82-123-decision-1"
}
~~~

- `action`: `dismiss | rework | refund` cho HG-82; ba action ORD-08 cũ chỉ cho tranh chấp trước hoàn thành.
- `resolutionNote`: bắt buộc, tối thiểu 5 ký tự sau trim.
- `refundAmountVnd`: chỉ nhận với `refund`; chuỗi số nguyên VND > 0, tùy chọn để mặc định bằng số còn hoàn. Từ chối số lẻ, giá trị âm/0 và giá trị lớn hơn hạn mức Payment cho phép bằng HTTP 400 `REFUND_AMOUNT_EXCEEDS_REFUNDABLE`.
- `idempotencyKey`: bắt buộc cho quyết định mới. Gọi lặp cùng key và payload trả hồ sơ hiện có; cùng key khác payload hoặc quyết định khác cho cùng lần khiếu nại trả 409 `DISPUTE_ALREADY_DECIDED`.
- `dismiss`/`rework` trả 200 với trạng thái cuối. `refund` trả 202 và `resolutionId`/`state = refund_pending`; không trả 200 “đã hoàn tiền” khi mới ghi quyết định.
- API đọc trạng thái đã thêm: `GET /api/v1/admin/orders/dispute-resolutions/:resolutionId`, trả `refund_pending`, `needs_review` hoặc `completed`, `refundId` và mã lỗi an toàn. API danh sách Task 2 trả `resolution` của đúng lần khiếu nại hiện tại cho các đơn vẫn `disputed`.

## 5. Giao dịch, event và tích hợp Payment

### 5.1. Order transaction

1. Trước transaction, tra `idempotencyKey`: nếu đã có cùng payload, trả hồ sơ hiện có kể cả khi Order không còn `disputed`; nếu key trùng nhưng payload khác, trả 409. Với refund, gọi API nội bộ chỉ đọc của Payment để kiểm tra sơ bộ điều kiện và lấy số tiền chính xác bằng chuỗi/`bigint`. Không giữ khóa DB Order trong lúc gọi HTTP và không gọi Wallet từ Order.
2. Trong transaction, khóa Order và kiểm tra role Admin, `status = disputed`, `disputePreviousStatus`, `disputedAt` và quyết định đã tồn tại cho lần khiếu nại này. Kiểm tra lại idempotency dưới khóa để xử lý hai request đồng thời.
3. Ghi `OrderDisputeResolution`, tăng `version` và cập nhật Order. Điều kiện update gồm `id`, `status = disputed` **và** `version = order.version`; nếu count = 0 trả 409. Khóa dòng và version check đều được kiểm thử.
4. Với `dismiss`/`rework`, ghi `OrderStatusHistory` và event `order.status.changed` trong cùng transaction. Với `refund` đang chờ Payment, chưa ghi chuyển trạng thái cuối.
5. Ghi outbox `order.dispute.decision.recorded` cho cả ba action. Với `dismiss`/`rework` đã hoàn tất, ghi thêm `order.dispute.resolved`. Không phát `order.completed`/`order.cancelled` cho ba action HG-82.

Payload quyết định gồm `resolutionId`, `orderId`, `orderCode`, `disputedAt`, `adminUserId`, `action` chuẩn, `resolutionNote`, `customerUserId`, `workerUserId`, `paymentId` nullable, `refundAmountVnd` dạng chuỗi nullable, `decidedAt`. Event cuối có thêm `resolvedStatus` và `resolvedAt`. Tên event nằm trong `EVENT_PATTERNS`/`ORDER_CONSTANTS`; publisher dùng envelope `eventId` hiện có.

### 5.2. Payment và xác nhận cuối

- Payment thêm consumer có inbox chống lặp cho `order.dispute.decision.recorded` khi `action = refund`. Lookup Payment theo `orderId`, xác thực dữ liệu/số tiền, khóa Payment và tạo refund gắn `resolutionId` bằng idempotency key ổn định. Cần thêm đường xử lý nội bộ dùng chung bất biến với `RefundsService.create`/`decide`: API tạo refund hiện chỉ cho Admin hoặc chủ Payment, nên không thể gọi nguyên hàm đó với actor `system` và mặc định `admin = false`. `Refund.requestedByUserId` cho luồng nội bộ có thể là `null` (schema cho phép) hoặc UUID hệ thống hợp lệ; không ghi giả là khách đã tự yêu cầu nếu Admin khởi tạo. `approvedByUserId` là UUID Admin HG-82 và phải khác người yêu cầu **lẫn** `payment.customerUserId`; nếu Admin cũng là khách của Payment, guard hiện tại phải từ chối hoặc chuyển người duyệt khác, không bỏ guard. Giữ audit hai actor và không gọi Wallet trực tiếp từ Order.
- Sau Wallet xác nhận ghi sổ, Payment vẫn phát `payment.refunded` hiện có và bổ sung event kết quả có `resolutionId`, `orderId`, `paymentId`, `refundId`, `refundAmountVnd`, `paymentStatus` (`partially_refunded | refunded`). Khi đối soát còn đang chạy, giữ kết quả Order ở `refund_pending`; chỉ phát `payment.dispute.refund.needs_review` với mã lỗi an toàn khi đã xác định cần can thiệp thủ công theo quy tắc vận hành. Timeout đơn lẻ không chứng minh thất bại hay cần tạo refund mới.
- Order thêm consumer idempotent cho kết quả Payment. Chỉ event khớp `resolutionId` đang chờ mới được kết thúc hồ sơ, cập nhật `paymentState`, `disputeResolvedAt`, `OrderStatusHistory` (`disputed → completed`) và outbox `order.dispute.resolved`. Event cần can thiệp thực sự mới đặt resolution `needs_review`; Order vẫn `disputed` và lưu mã lỗi an toàn.
- Notification/Tracking tiêu thụ event quyết định và event cuối theo hợp đồng; thông báo “đã chấp thuận hoàn tiền, đang xử lý” khác “đã hoàn tiền”. Không phát hai thông báo hoàn tiền thành công từ `payment.refunded` và `order.dispute.resolved` cho cùng `resolutionId`.
- Không tuyên bố có “hold” hoặc “giải ngân khi dismiss” trong Task này. Payment gốc có thể đã thanh toán; Payment hiện không có hold theo dispute. Nếu cần giữ tiền 7 ngày, phải thiết kế riêng nguồn tiền và thời điểm giữ trước khi triển khai.

## 6. Kiểm thử và tiêu chí nghiệm thu

- DTO/API: role Admin, body hợp lệ/sai, idempotency, action không đúng bối cảnh, 200 và 202, response trạng thái phán quyết.
- `dismiss`: giữ `completedAt`/`workerFinishedAt`, trở về `completed`, không có `order.completed` mới và không đổi Payment.
- `rework`: snapshot mốc cũ, giữ `firstCompletedAt`, reset mốc chu kỳ hiện tại, hoàn thành bảo hành phát event riêng, không tạo thanh toán thứ hai; kiểm tra cửa sổ 7 ngày của chu kỳ mới.
- `refund`: hoàn toàn phần/một phần, mặc định số còn hoàn, số tiền không hợp lệ, Payment chưa thu, refund đã đặt chỗ, quyết định lặp, timeout, Wallet cần rà soát, event đến lặp/sai thứ tự, kết quả thành công và projection `partially_refunded/refunded`.
- Test tích hợp local Order → outbox → Payment inbox → RefundsService/Wallet test → Payment outcome → Order inbox; xác nhận không có hai refund hoặc hai phán quyết khi retry. Unit test/mock một service không đủ để tuyên bố luồng tiền đã chạy.
- Migration chỉ tạo trong repository; không tự chạy trên môi trường deploy. Trước khi phát hành, phải có kế hoạch backfill `firstCompletedAt` và kiểm tra dữ liệu cũ.

## 7. Checklist triển khai

- [x] Tạo migration Order/Payment và backfill mốc hoàn thành đầu; thêm hồ sơ phán quyết, projection refund một phần.
- [x] Cập nhật DTO, lỗi, API Admin và guard bối cảnh action; bảo toàn ORD-08.
- [x] Cập nhật lifecycle làm lại và event bảo hành; cửa sổ 7 ngày tiếp tục tính từ `completedAt` của chu kỳ hiện tại.
- [x] Tạo event quyết định/kết quả và outbox Order; dùng status + version CAS.
- [x] Tích hợp Payment consumer/refund có idempotency, phê duyệt/audit và event sau xác nhận Wallet.
- [x] Tích hợp Order inbox, Notification và Tracking cho trạng thái chờ/kết thúc.
- [x] Chạy unit test, typecheck, build, lint và Prisma schema validate local.
- [ ] Chạy migration/test tích hợp trên DB, RabbitMQ và Wallet test local khi Docker khả dụng; chưa kiểm chứng trên deploy.
