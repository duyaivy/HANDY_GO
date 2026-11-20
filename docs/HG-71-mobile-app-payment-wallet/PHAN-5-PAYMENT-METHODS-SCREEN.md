# PHẦN 5: QUẢN LÝ PHƯƠNG THỨC THANH TOÁN (PAYMENT METHODS SCREEN)

> **Mã công việc:** HG-71-PHAN-5
>
> **Phụ thuộc:** Hoàn thành Phần 1, 2, 3
>
> **Mục tiêu:** Xây dựng màn hình quản lý các phương thức thanh toán tại `/customer/payment/link-account` để khách hàng xem các phương thức khả dụng và chọn phương thức mặc định khi tạo việc/nghiệm thu.

---

## 1. Danh sách file phụ trách

| STT | Loại | Đường dẫn file | Nhiệm vụ chính |
|:---:|:---:|---|---|
| 1 | Mới | `mobile/src/features/wallet/customer/components/payment-method-card.tsx` | Card hiển thị từng kênh thanh toán (Ví, VNPAY, Tiền mặt) |
| 2 | Sửa | `mobile/src/features/profile/customer/screens/customer-link-account-screen.tsx` | Màn hình Quản lý liên kết & Phương thức thanh toán |
| 3 | Mới | `mobile/src/features/wallet/customer/__tests__/customer-link-account-screen.test.tsx` | Unit test cho màn hình phương thức thanh toán |
| 4 | Mới | `mobile/src/features/wallet/hooks/use-preferred-payment-method.ts` | Đọc/lưu phương thức mặc định theo tài khoản trên thiết bị |
| 5 | Sửa | `mobile/src/constants/storage-keys.ts` | Khóa lưu lựa chọn mặc định theo user ID |
| 6 | Sửa | `mobile/src/app/customer/__tests__/account-payment-flow.test.tsx` | Hồi quy luồng B theo UI thực tế |
| 7 | Sửa | `mobile/src/features/wallet/hooks/wallet-query-keys.ts` | Khóa query lựa chọn mặc định dùng chung |

---

## 2. Chi tiết kỹ thuật & Thiết kế Component

### 2.1. Component `PaymentMethodCard.tsx`
* Card hiển thị từng phương thức:
  1. **Ví điện tử HandyGo Point (Mặc định)**:
     * Icon chiếc ví ngọc bích.
     * Tên: *Ví HandyGo (Điểm thưởng & Nạp tiền)*.
     * Số dư hiện có: Lấy từ `useWallet()` (ví dụ: `Số dư: 250.000 đ`).
     * Badge xanh: `Khuyên dùng` hoặc `Mặc định`.
  2. **Cổng thanh toán điện tử VNPAY**:
     * Icon / Logo VNPAY.
     * Tên: *Cổng VNPAY (ATM, QR Pay, Thẻ quốc tế)*.
     * Mô tả: *Thanh toán trực tiếp qua ngân hàng hoặc quét mã QR VNPAY*.
     * Huy hiệu: `Đã hỗ trợ`.
  3. **Tiền mặt khi hoàn tất (Cash on Delivery)**:
     * Icon tiền mặt.
     * Tên: *Tiền mặt (Trực tiếp cho thợ)*.
     * Mô tả: *Thanh toán bằng tiền mặt sau khi thợ hoàn thành việc*.
     * Huy hiệu: `Khả dụng`.

### 2.2. Cập nhật `CustomerLinkAccountScreen.tsx`
* Thay thế phần placeholder *"Chức năng đang được phát triển"* bằng:
  * **Header**: Thanh `AppBar` tiêu đề *"Phương thức thanh toán"*, phụ đề *"Liên kết tài khoản & ví"*, nút Back (giữ nguyên `testID="link-account-app-bar"`).
  * **Section 1: Phương thức thanh toán chính**:
    * Render `PaymentMethodCard` cho Ví HandyGo và Tiền mặt.
  * **Section 2: Cổng thanh toán tích hợp**:
    * Render thẻ VNPAY kèm nút "Nạp tiền ngay" dẫn sang luồng Top-up.
  * **Section 3: Ghi chú bảo mật & Quyền lợi**:
    * Thông tin cam kết bảo mật thanh toán chuẩn PCI-DSS, chính sách hoàn tiền 100% qua Ví nếu thợ không hoàn thành cam kết.
  * Giữ nguyên `testID="customer-link-account-screen"` để bảo toàn test tự động.

---

## 3. Kế hoạch kiểm thử (Test Plan) cho Phần 5
1. **Kiểm tra hiển thị đầy đủ phương thức**:
   * Kiểm tra render đủ 3 phương thức: Ví HandyGo, Cổng VNPAY, Tiền mặt.
   * Kiểm tra hiển thị đúng số dư ví từ `useWallet`.
2. **Kiểm tra hành động điều hướng**:
   * Bấm nút Back trên `AppBar` → điều hướng quay lại trang Quản lý thanh toán.
3. **Kiểm tra hồi quy**:
   * Chạy lại `account-payment-flow.test.tsx` (luồng B) đảm bảo PASS.

## 4. Tiêu chí nghiệm thu (Acceptance Criteria)
- [x] Ba kênh được tách thành phương thức chính (Ví/Tiền mặt) và cổng nạp ví (VNPAY); có nhãn trạng thái, lựa chọn radio và hỗ trợ dark mode.
- [x] Số dư khả dụng lấy từ `useWallet()` / `wallets/me`, dùng cùng query ví và cơ chế làm mới sau top-up của Phần 3. Loading, lỗi, chưa có ví và ví không hoạt động được hiển thị riêng.
- [x] Dùng các primitive React Native đa nền tảng, giữ testID và kiểm tra TypeScript/Jest/ESLint. Chưa xác minh trực tiếp runtime/styling trên thiết bị Android/iOS; đây là giới hạn kiểm chứng, không phải kết quả test thiết bị.

## 5. Kết quả triển khai

- `PaymentMethodCard` nhận icon, tiêu đề, mô tả, badge, nội dung và callback lựa chọn. Ví/Tiền mặt dùng `Pressable` với `accessibilityRole="radio"`; thẻ VNPAY chứa nút nạp riêng.
- Mặc định ban đầu là `point`. Khách có thể chọn `cash` hoặc `point`; `usePreferredPaymentMethod()` lưu bằng `StorageService` theo `PREFERRED_PAYMENT_METHOD(userId)`, đồng bộ lựa chọn qua React Query. Tài khoản khác không dùng chung lựa chọn; giá trị lưu sai định dạng quay về `point`; khách chưa đăng nhập không lưu được.
- Lựa chọn là thiết lập cục bộ trên thiết bị, không gọi API thanh toán. Hook được xuất để bộ chọn trong luồng nghiệm thu Phần 6 dùng lại; Phần 5 không thực hiện thanh toán đơn hoặc thay đổi phương thức của đơn hiện có.
- Nút “Nạp tiền ngay” mở `TopupModal` từ Phần 3 ngay trong màn hình. Chỉ bật khi đã tải được ví đang hoạt động. Ví bị đóng băng/đóng, chưa có ví hoặc lỗi tải không cho nạp; vẫn cho chọn Tiền mặt và thử tải lại khi lỗi.
- Số tiền hiển thị là `availableBalance`, không phải tổng `balance` bao gồm tiền tạm giữ. Không tự gán số dư 0 khi chưa tải được dữ liệu.
- Thông tin PCI-DSS nói về cổng VNPAY, không khẳng định HandyGo có chứng chỉ riêng. Đối chiếu [chính sách bảo mật thanh toán của VNPAY](https://vnpay.vn/chinh-sach/chinh-sach-bao-mat-thong-tin-thanh-toan-cho-khach-hang.html).
- Nội dung hoàn tiền theo BUSINESS-RULES: yêu cầu cần phê duyệt; hoàn toàn phần là 100% giá trị đã thanh toán về Ví, hoàn một phần theo kết quả xử lý. Không hứa tự động hoàn 100% cho mọi khiếu nại.

## 6. Xác minh

- Test màn hình dùng hook ví và hook lựa chọn thật với API/storage mock: đủ ba phương thức, số dư khả dụng, đổi/lưu/khôi phục mặc định, tách tài khoản, giá trị lưu không hợp lệ, mở/đóng top-up, khóa nạp khi ví không hoạt động/404, loading/lỗi/retry, khách chưa đăng nhập và hai cách Back.
- Hồi quy `account-payment-flow.test.tsx` giữ luồng A–F, bao gồm luồng B và các testID hiện hữu.
- Kiểm tra bằng Jest cho toàn bộ wallet và navigation, TypeScript và ESLint cho các file liên quan. Kiểm thử top-up settlement thật với API mock đã có ở Phần 3; test Phần 5 xác minh mở đúng modal dùng chung.
- Kết quả: **14 suite / 74 test** đạt với `pnpm test src/features/wallet src/app/customer/__tests__/account-payment-flow.test.tsx --runInBand --silent`; `pnpm run type-check` và ESLint đạt.
