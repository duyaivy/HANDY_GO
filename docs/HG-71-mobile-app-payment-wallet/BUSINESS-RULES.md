# BUSINESS RULES & LIFECYCLE: PAYMENT & WALLET (MOBILE APP USER)

> **Mã tài liệu:** HG-71-BUSINESS-RULES
>
> **Áp dụng cho:** Toàn bộ luồng Mobile App Payment & Wallet của Khách hàng (Customer / User) và giao diện thanh toán đơn hàng.
>
> **Nguồn thẩm quyền quyết định (PO Authority):** [HandyGo PO Decisions Final](../../docs/HandyGo_PO_Decisions_Final_VI.md), [Payment Service Specification](../../backend/apps/payment-service/README.md), [State Machine Design](../../BAO_CAO_THIET_KE_STATE_MACHINE.md).

---

## 1. Nguyên tắc cốt lõi & Nguồn sự thật (Single Source of Truth)

1. **Phân định thẩm quyền dịch vụ (Separation of Concerns)**:
   * **Wallet Service**: Là **Nguồn sự thật duy nhất (Single Source of Truth)** đối với số dư tài khoản (`balance`, `availableBalance`, `reservedBalance`), sổ cái giao dịch (`ledger`), và các trạng thái khóa tạm giữ (`hold/reservation`). Mobile không được tự ý tính toán hoặc giả định số dư ví trên client.
   * **Payment Service**: Là bộ điều phối quy trình (Orchestrator) cho các giao dịch thanh toán đơn việc, nạp tiền cổng thanh toán (Top-up VNPAY), và quy trình hoàn tiền (Refund).
   * **API Gateway**: Là chốt chặn bảo mật duy nhất, chịu trách nhiệm xác thực RS256 JWT, inject định danh (`x-user-id`) và stripped sạch các header giả mạo từ client.
2. **Quy đổi tiền tệ & Đơn vị tính**:
   * Tỷ lệ cố định: **1 Point = 1 VND**. Không có chiết khấu nạp hay tỷ lệ quy đổi thứ hai.
   * Số tiền trong hệ thống là **số nguyên không âm (BigInt)**. Backend serialize số tiền dạng chuỗi `string` (ví dụ `"250000"`). Mobile App không được làm tròn số học kiểu float gây sai lệch tiền tệ.

---

## 2. Ma trận Trạng thái Đơn hàng & Quyền Thanh toán (Order Payment Lifecycle)

Thanh toán đơn hàng tuân theo quy tắc nghiêm ngặt của Product Owner (PO):

| Trạng thái đơn hàng (`order.status`) | Hành vi Thanh toán trên Mobile (`Payment Actions`) | Giải thích nghiệp vụ |
|---|:---:|---|
| `created` / `confirmed` | **Chặn thanh toán (Disabled)** | Event `order.created` chỉ tạo snapshot giá trị và tỷ lệ hoa hồng; **tuyệt đối không charge tiền trước**. |
| `in_progress` | **Chặn thanh toán (Disabled)** | Thợ đang thi công; chi phí có thể phát sinh thêm theo thỏa thuận chat/báo giá. |
| `awaiting_customer_confirmation` | **MỞ THANH TOÁN (Active)** | Thợ báo đã làm xong. Khách hàng kiểm tra nghiệm thu. Bấm nút **"Nghiệm Thu & Thanh Toán"** sẽ kích hoạt modal thanh toán. |
| `completed` | **Theo trạng thái payment thực tế** | Nghiệm thu đã hoàn tất; payment có thể còn unpaid/failed/pending. Cho thanh toán lại khi unpaid/failed; tiền mặt pending chờ thợ. Chỉ hiển thị paid khi payment succeeded. |
| `disputed` / `cancelled` | **Khóa thanh toán (Locked)** | Đang tranh chấp hoặc đã hủy. Không được thu tiền của khách. |

---

## 3. Quy tắc Phương thức Thanh toán Đơn hàng (Point vs Cash)

Khách hàng chỉ có thể chọn 1 trong 2 phương thức thanh toán chính thống:

### 3.1. Thanh toán bằng Điểm ví (`method = 'point'`)
* **Điều kiện tiên quyết**: Số dư khả dụng của khách (`availableBalance`) phải **≥ Giá dịch vụ thỏa thuận** (`agreedPrice`).
* **Hành vi hệ thống**:
  1. Khách hàng bấm xác nhận → Mobile nghiệm thu đơn trước nếu cần, rồi gọi `POST /payments` chọn `method: 'point'` theo DTO hiện tại.
  2. Mobile gọi `POST /payments/:id/pay-with-points` kèm body `{ confirm: true }`.
  3. Backend Payment gọi Wallet Service để thực hiện bút toán trừ điểm ví khách và phân bổ theo hợp đồng hoa hồng.
  4. Trạng thái thanh toán chỉ chuyển sang `succeeded` khi và chỉ khi Wallet Service đã commit thành công vào sổ cái.
* **Xử lý thiếu tiền (Insufficient Funds)**:
  * Nếu `availableBalance < agreedPrice`: Mobile **không được gửi lệnh thanh toán**, phải hiển thị rõ số tiền còn thiếu:
    $$\text{Số tiền thiếu} = \text{Giá thỏa thuận} - \text{Số dư khả dụng}$$
  * Hiển thị nút sang luồng Nạp tiền với số thiếu được tính chính xác; số nạp gợi ý tuân thủ hạn mức 10.000–50.000.000 VND mỗi lần.

### 3.2. Thanh toán bằng Tiền mặt (`method = 'cash'`)
* **Hành vi hệ thống**:
  1. Khách hàng chọn phương thức tiền mặt → Mobile gọi `POST /payments` với `method: 'cash'`.
  2. Giao diện khách hàng hiển thị thông báo: *"Vui lòng gửi số tiền ... đ trực tiếp cho thợ. Chờ thợ xác nhận đã nhận tiền."*
  3. Đơn hàng chuyển sang trạng thái chờ xác nhận tiền mặt (`pending`).
  4. **Thợ (Worker)** chịu trách nhiệm bấm `POST /payments/:id/confirm-cash` trên app của thợ khi đã cầm tiền.
  5. Khi thanh toán tiền mặt: **Không cộng điểm vào ví của Thợ**; hệ thống tự động ghi nhận công nợ hoa hồng (commission debt) mà thợ phải nộp cho nền tảng.

---

## 4. Quy tắc Nạp tiền vào Ví điểm (Top-up Rules)

1. **Kênh nạp**: Cổng thanh toán VNPAY (ATM nội địa, Internet Banking, VNPAY-QR, Thẻ quốc tế Visa/Mastercard).
2. **Hạn mức giao dịch**:
   * Tối thiểu: **10.000 VND** (tương đương 10.000 Point).
   * Tối đa cho 1 giao dịch nạp: **50.000.000 VND**.
3. **Thời hạn đơn nạp (TTL)**: Mỗi link thanh toán VNPAY có hạn sử dụng **15 phút** (`expiresAt`). Sau 15 phút, đơn nạp chuyển sang trạng thái `expired`.
4. **Cơ chế ghi nhận tiền (Settlement Rule)**:
   * **Trình duyệt quay về (Browser Return) KHÔNG xác nhận cộng tiền**: Khi khách hàng hoàn thành thanh toán trên VNPAY và trình duyệt quay về return URL, đây chỉ là trang thông báo tĩnh.
   * **Chỉ cộng tiền khi có IPN hợp lệ**: Backend nhận được webhook IPN có chữ ký số hợp lệ từ VNPAY, sau đó phát sự kiện nội bộ cho Wallet Service commit bút toán cộng điểm.
   * **Mobile Client Polling**: Mobile app sau khi mở VNPAY sẽ tự động thăm dò (polling) endpoint `GET /payments/topups/:id` mỗi **2.5 giây** (tối đa 40 lần = 100 giây). Khi thấy `status === 'completed'`, mobile sẽ phát lệnh làm mới ví (`invalidateQueries`) để số dư hiển thị tăng lên tức thì.
5. **Chế độ Dev / Sandbox Testing**:
   * Nút simulate chỉ hiển thị khi `__DEV__`; trước khi gọi endpoint, mobile yêu cầu top-up có `isSimulated=true`. Backend cũng phải bật mock. Endpoint `POST /payments/topups/:id/simulate` dùng để kiểm tra cộng điểm mà không cần thẻ thật.

---

## 5. Quy tắc Hoàn tiền (Refund Policy - PO Approved)

> [!IMPORTANT]
> **ĐÃ CHỐT: CHỈ HOÀN VỀ ĐIỂM VÍ HANDYGO (Customer Point Wallet).**
>
> Nền tảng HandyGo **tuyệt đối không hoàn tiền mặt ra ngoài tài khoản ngân hàng** cho bất kỳ trường hợp nào, kể cả khi đơn hàng gốc được thanh toán bằng Tiền mặt hay Điểm ví.

1. **Hình thức hoàn**:
   * Hoàn toàn phần (Full Refund): Hoàn đúng 100% giá trị đơn hàng đã thanh toán.
   * Hoàn một phần (Partial Refund): Hoàn một khoản tiền cụ thể theo phán quyết tranh chấp, thỏa mãn:
     $$\sum \text{Tiền hoàn các đợt} \le \text{Tổng tiền thanh toán ban đầu}$$
2. **Quy trình phê duyệt**:
   * Khách hàng gửi yêu cầu hoàn tiền (`POST /payments/:id/refunds`) kèm lý do và bằng chứng.
   * Yêu cầu chuyển vào hàng đợi duyệt của Quản trị viên (Admin).
   * Khi Admin chấp thuận: Payment Service gọi Wallet Service credit số điểm tương ứng vào ví khách hàng.
   * Trạng thái hoàn tiền: `requested` → `processing` → `completed` (hoặc `rejected`).

---

## 6. Quy tắc An toàn Idempotency & Chống Trừ Tiền Trùng

1. **Sinh mã Idempotency Key**:
   * Với `createTopup`, mobile sinh một mã duy nhất:
     $$\text{idempotencyKey} = \text{Crypto.randomUUID()}$$
   * Mã này được sinh **một lần duy nhất** ngay khi người dùng bấm nút submit trên giao diện.
   * `payWithPoints` chỉ nhận `{ confirm: true }`: backend tạo/khóa attempt và dùng định danh payment/attempt để chống trùng. Mobile không gửi UUID mới cho route này. UI refund chưa nằm trong phạm vi HG-71; khi bổ sung phải theo DTO refund tương ứng.
2. **Xử lý sự cố mạng & Retry**:
   * Khi tạo top-up gặp lỗi mất mạng/timeout, mobile retry **giữ đúng key và số tiền ban đầu**. Retry trả điểm dựa trên payment/attempt hiện có; payment processing không được coi là đã thất bại và không tạo lệnh trừ mới từ UI.
   * Backend cam kết:
     * Gửi lại cùng key + cùng payload: Trả về kết quả giao dịch đã thực hiện trước đó, không trừ tiền lần 2.
     * Gửi cùng key nhưng khác payload (thay đổi số tiền): Trả về lỗi `409 Conflict`.
3. **Chống Double Click (Debounce / In-flight Lock)**:
   * Tất cả các nút bấm thanh toán hoặc nạp tiền trên UI phải được **vô hiệu hóa ngay lập tức (`disabled={isPending}`)** khi bắt đầu gửi request, kèm spinner trạng thái để ngăn người dùng bấm nhiều lần liên tiếp.

---

## 7. Quy tắc Bảo mật & Dữ liệu Nhạy cảm trên Mobile

1. **Không lưu trữ bí mật tài chính trên thiết bị**: Mobile app không lưu số thẻ ngân hàng đầy đủ, mã PIN ngân hàng hoặc internal secret.
2. **Tính năng Riêng tư số dư (Privacy Toggle)**:
   * Trên thẻ ví (`WalletBalanceCard`), số dư mặc định có thể được ẩn đi dưới dạng `••••••` thông qua icon mắt. Trạng thái ẩn/hiện được ghi nhớ cục bộ bằng `AsyncStorage` / `MMKV` để thuận tiện cho người dùng khi ở nơi công cộng.
3. **Bảo vệ danh tính từ Gateway**:
   * Mobile app không được tự tạo hoặc gửi các header `x-user-id`, `x-user-roles`, `x-internal-secret`. Mọi thông tin danh tính đều được trích xuất từ JWT Access Token thông qua API Gateway.
