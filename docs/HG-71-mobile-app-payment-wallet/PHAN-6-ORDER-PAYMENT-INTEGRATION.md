# PHẦN 6: TÍCH HỢP THANH TOÁN VÀO LUỒNG ĐƠN HÀNG (ORDER PAYMENT FLOW)

> **Mã công việc:** HG-71-PHAN-6
>
> **Phụ thuộc:** Hoàn thành Phần 1, 2, 3
>
> **Mục tiêu:** Kết nối tính năng thanh toán vào màn hình chi tiết đơn hàng của khách (`customer-order-detail-screen.tsx`). Khách hàng có thể nghiệm thu và trả tiền bằng Điểm ví hoặc Tiền mặt, với cơ chế kiểm tra số dư và hỗ trợ nạp bù tự động.

---

## 1. Danh sách file phụ trách

| STT | Loại | Đường dẫn file | Nhiệm vụ chính |
|:---:|:---:|---|---|
| 1 | Mới | `mobile/src/features/wallet/customer/components/order-payment-modal.tsx` | BottomSheet / Modal chọn phương thức thanh toán khi nghiệm thu đơn hàng |
| 2 | Sửa | `mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx` | Kết nối sự kiện bấm nút Nghiệm thu để mở modal thanh toán |
| 3 | Sửa | `mobile/src/features/orders/components/order-payment-card.tsx` | Cập nhật card hiển thị trạng thái thanh toán động |
| 4 | Mới | `mobile/src/features/wallet/customer/__tests__/order-payment-modal.test.tsx` | Unit test cho modal thanh toán đơn hàng |
| 5 | Sửa | `mobile/src/features/orders/customer/__tests__/customer-order-detail-screen.test.tsx` | Kiểm tra luồng nghiệm thu và thanh toán trên màn hình đơn hàng |

---

## 2. Chi tiết kỹ thuật & Thiết kế Component

### 2.1. Component `OrderPaymentModal.tsx`
* **Trigger**: Mở ra khi khách hàng bấm nút **`🎉 Nghiệm Thu & Thanh Toán`** (`testID="customer-confirm-completion-btn"`).
* **Nội dung hiển thị**:
  1. **Tóm tắt đơn việc**: Tên dịch vụ, thợ thực hiện, và **Tổng chi phí nghiệm thu** (ví dụ: `250.000 đ`).
  2. **Chọn phương thức thanh toán**:
     * **Tùy chọn A: Ví điểm HandyGo**:
       * Hiển thị số dư khả dụng hiện có: `Số dư ví: 300.000 đ`.
       * **Trường hợp đủ tiền**:
         * Hiển thị dấu tick chọn, dòng ghi chú *"Số dư sau thanh toán: 50.000 đ"*.
         * Nút chính: **"Xác nhận thanh toán 250.000 đ"** (màu xanh lá emerald).
       * **Trường hợp thiếu tiền**:
         * Ví dụ số dư là `100.000 đ` (thiếu `150.000 đ`).
         * Hiển thị cảnh báo màu cam: *"Số dư ví không đủ (Còn thiếu 150.000 đ)"*.
         * Nút phụ nổi bật: **"+ Nạp thêm 150.000 đ qua VNPAY"** (mở nhanh `TopupModal` với giá trị nạp gợi ý là số tiền còn thiếu).
     * **Tùy chọn B: Tiền mặt trực tiếp cho thợ (Cash)**:
       * Mô tả: *"Bạn sẽ thanh toán 250.000 đ bằng tiền mặt trực tiếp cho thợ. Thợ sẽ xác nhận đã nhận tiền trên ứng dụng của họ."*
       * Nút chính: **"Xác nhận trả tiền mặt"**.
  3. **Xử lý gọi API**:
     * Khi khách xác nhận trả bằng Điểm:
       * Gọi `useOrderPayment.processPayment('points')` → backend thực hiện trừ điểm ví (`POST /payments/:id/pay-with-points`).
       * Khi thành công: hiển thị thông báo mừng 🎉 *"Thanh toán thành công! Đơn hàng đã hoàn tất."* và chuyển `paymentState` sang `paid`.
     * Khi khách xác nhận trả Tiền mặt:
       * Gọi `useOrderPayment.processPayment('cash')` → backend lưu trạng thái chờ thợ xác nhận (`POST /payments`).
       * Hiển thị thông báo *"Đã ghi nhận phương thức tiền mặt. Vui lòng gửi tiền cho thợ."*

### 2.2. Cập nhật `CustomerOrderDetailScreen.tsx`
* Tích hợp hook `useWallet` và `useOrderPayment`.
* Thay vì chỉ gọi `confirmCompletion()` và đóng đơn đơn giản trong `handleConfirmCompletion`:
  * Mở `OrderPaymentModal`.
  * Sau khi hoàn tất thanh toán thành công trong modal, tự động cập nhật lại chi tiết đơn hàng và hiển thị nút **"⭐ Đánh Giá Thợ"**.

### 2.3. Cập nhật `OrderPaymentCard.tsx`
* Hiển thị động theo `paymentState`:
  * `paid`: Badge xanh lá **"Đã thanh toán"**, hiển thị phương thức đã dùng (Điểm ví hoặc Tiền mặt).
  * `pending`: Badge xanh dương **"Chờ xác nhận"**.
  * `unpaid`: Badge hổ phách **"Chờ thanh toán"**.
  * `refunded`: Badge tím **"Đã hoàn tiền"**.

---

## 3. Kế hoạch kiểm thử (Test Plan) cho Phần 6
1. **Kiểm tra luồng Điểm ví đủ tiền**:
   * Giá đơn: 200.000 đ, số dư ví: 500.000 đ → Chọn Ví HandyGo → Bấm xác nhận → Gọi API thanh toán điểm thành công.
2. **Kiểm tra luồng Điểm ví thiếu tiền**:
   * Giá đơn: 300.000 đ, số dư ví: 100.000 đ → Hiển thị cảnh báo thiếu 200.000 đ → Nút Nạp bù tiền xuất hiện.
3. **Kiểm tra luồng Tiền mặt**:
   * Chọn Tiền mặt → Bấm xác nhận → Gọi API mở đơn thanh toán cash → Trạng thái chuyển sang chờ thợ xác nhận.
4. **Kiểm tra tích hợp màn hình đơn hàng**:
   * Bấm `customer-confirm-completion-btn` mở đúng modal thanh toán.

## 4. Tiêu chí nghiệm thu (Acceptance Criteria)
- [x] Modal xác nhận nghiệm thu trước rồi thanh toán `point`, kiểm tra số dư khả dụng mới nhất và đối chiếu số tiền payment với số tiền khách xác nhận. Test tích hợp API mock chứng minh đúng thứ tự, phương thức, số tiền và trạng thái thành công.
- [x] Khóa submit tức thời ở UI/hook; backend chống trùng theo payment/attempt. Test bấm liên tiếp, retry sau lỗi, payment đã thành công/đang xử lý và bộ test backend payment đã được chạy.
- [x] Nạp bù giữ nguyên đơn, dịch vụ, thợ, phương thức và tình trạng nghiệm thu; polling top-up tiếp tục khi đóng modal nạp. Test từ thiếu tiền → sandbox `credit_pending` → đóng nạp → polling `completed` → đủ tiền → thanh toán cùng đơn đạt.

## 5. Triển khai theo API hiện tại

- `processPayment` nhận `point` theo DTO, không phải `points` trong bản mô tả. Route `pay-with-points` chỉ nhận `{ confirm: true }`; backend dùng payment/attempt và khóa ledger để chống trùng, không nhận khóa idempotency mới từ mobile (contract Phần 1).
- Khi khách bấm nút nghiệm thu, màn hình chỉ mở modal. Khách xác nhận trong modal mới gọi `confirmCompletion()`, rồi `POST /payments` để chọn phương thức; `point` kiểm tra ví và gọi trừ điểm, `cash` chỉ ghi nhận lựa chọn. Nghiệm thu lỗi không gọi thanh toán. Nếu nghiệm thu thành công nhưng mở payment lỗi (kể cả snapshot chưa sẵn sàng), modal hiển thị lỗi cho retry và không lặp nghiệm thu đã thành công.
- `usePreferredPaymentMethod` từ Phần 5 cung cấp lựa chọn ban đầu. Có thể đổi Ví/Tiền mặt trong modal mà không thay đổi thiết lập mặc định của tài khoản.
- Mọi tính toán số dư/thiếu tiền dùng `BigInt`; giá đơn dạng Decimal nguyên (`200000.00`) được chuẩn hóa chính xác, giá có phần lẻ hoặc Number không an toàn bị chặn. Tổng tiền payment khác số tiền vừa xác nhận không được trừ điểm.
- Nút nạp bù gợi ý số thiếu, tối thiểu 10.000 và tối đa 50.000.000 VND mỗi lần. Khoản thiếu ngoài khoảng được giải thích và cho nạp nhiều lần. `TopupModal` nhận `initialAmount` và chế độ nội dung nhúng; toàn luồng chỉ dùng một native Modal, tránh xung đột trình bày modal trên iOS. Đóng nạp quay lại thanh toán và làm mới ví; hook nạp vẫn mounted để tiếp tục polling. Không tự động thanh toán khi vừa nạp xong: khách phải xác nhận.
- Ví không hoạt động/chưa tải được không cho trả bằng điểm; vẫn có thể chọn tiền mặt. Hook kiểm tra lại trạng thái và số dư từ backend trước khi trừ điểm để xử lý trường hợp số dư thay đổi sau khi mở modal.
- Chỉ `succeeded` mới báo thanh toán thành công. `processing` hoặc tiền mặt `pending` không báo đã trả tiền. Payment đã settled/processing không bị gửi thêm lệnh trừ điểm từ hook. Lỗi/cancelled hiển thị thông báo để xử lý lại.
- Màn hình dùng `GET /payments/order/:orderId` cho đơn đã hoàn tất, cập nhật card theo payment thực tế, polling 2,5 giây khi pending/processing. Khi thanh toán thành công làm mới ví/đơn, hiển thị nút đánh giá theo trạng thái đơn. Đơn completed nhưng unpaid/failed có nút thanh toán lại; không mất khả năng thanh toán khi lần trước lỗi sau nghiệm thu.
- `OrderPaymentCard` hiển thị paid/pending/unpaid/refunded, phương thức thực tế và số tiền nguyên chính xác; không tự gán phương thức tiền mặt khi chưa chọn.

### File bổ sung ngoài bảng

- `mobile/src/features/wallet/hooks/use-order-payment.ts` và test: kiểm tra snapshot, ví hoạt động, payment đã xử lý, cập nhật cache và chống submit trùng.
- `mobile/src/features/wallet/hooks/wallet-query-keys.ts`: query payment theo order ID.
- `mobile/src/features/wallet/utils/formatters.ts`: chuẩn hóa giá Decimal nguyên.
- `mobile/src/features/wallet/customer/components/topup-modal.tsx`: số tiền gợi ý ban đầu.
- `mobile/src/features/wallet/customer/__tests__/order-payment-card.test.tsx`: trạng thái, phương thức, số nguyên lớn và giá Decimal.

## 6. Xác minh và giới hạn

- Jest mobile: modal đủ/thiếu điểm, tiền mặt pending, submit trùng, nghiệm thu lỗi, retry payment sau nghiệm thu, processing không trừ lại, failed không báo thành công, giá không hợp lệ, lựa chọn mặc định và luồng sandbox nạp bù/polling/quay lại thanh toán.
- Test màn hình đơn: mở modal trước khi gọi API; nghiệm thu + trả điểm + cập nhật chi tiết/nút đánh giá; tiền mặt không hiển thị đã thanh toán; mở lại thanh toán cho đơn completed; hồi quy sửa lại/hủy/worker/tracking và navigation A–F.
- Backend: `pnpm exec vitest run apps/payment-service/src/payment-orders/payment-orders.service.spec.ts` đạt **19/19**, gồm chống trùng, không trừ lại payment đã thành công và kết quả ví unknown giữ processing.
- TypeScript và ESLint kiểm tra các file thay đổi. Các test tích hợp mobile dùng API mock, test backend dùng mock repository/wallet; chưa chạy thanh toán với hệ thống backend đang phục vụ hoặc thiết bị Android/iOS thật.
- Kết quả hồi quy: `pnpm test src/features/wallet src/features/orders src/app/customer/__tests__/account-payment-flow.test.tsx --runInBand --silent` đạt **32 suite / 259 test**. Sau khi chuyển sang một native Modal, chạy lại test customer wallet và chi tiết đơn; `pnpm run type-check` và ESLint đều đạt.
