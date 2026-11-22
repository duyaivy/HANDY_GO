# PHẦN 3: THẺ VÍ & LUỒNG NẠP TIỀN (CUSTOMER WALLET & TOP-UP UI)

> **Mã công việc:** HG-71-PHAN-3
>
> **Phụ thuộc:** Hoàn thành Phần 1 & Phần 2
>
> **Mục tiêu:** Xây dựng UI trực quan cho thẻ ví, hiển thị số dư, modal nạp tiền VNPAY và tích hợp vào màn hình `/customer/payment`. Giữ nguyên các `testID` hiện hữu để đảm bảo tương thích ngược.

---

## 1. Danh sách file phụ trách

| STT | Loại | Đường dẫn file | Nhiệm vụ chính |
|:---:|:---:|---|---|
| 1 | Mới | `mobile/src/features/wallet/customer/components/wallet-balance-card.tsx` | Card hiển thị số dư khả dụng, tạm giữ, nút Nạp tiền & Lịch sử |
| 2 | Mới | `mobile/src/features/wallet/customer/components/topup-modal.tsx` | Modal / BottomSheet nạp tiền (mệnh giá nhanh, input, VNPAY button, simulate dev) |
| 3 | Sửa | `mobile/src/features/profile/customer/screens/customer-payment-screen.tsx` | Màn hình Quản lý thanh toán chính của Customer |
| 4 | Mới | `mobile/src/features/wallet/customer/__tests__/wallet-balance-card.test.tsx` | Unit test cho thẻ hiển thị số dư |
| 5 | Mới | `mobile/src/features/wallet/customer/__tests__/topup-modal.test.tsx` | Unit test cho modal nạp tiền |
| 6 | Sửa | `mobile/src/app/customer/__tests__/account-payment-flow.test.tsx` | Đảm bảo luồng test navigation hiện tại tiếp tục pass |
| 7 | Sửa | `mobile/src/constants/storage-keys.ts` | Lưu lựa chọn ẩn/hiện số dư trên thiết bị |
| 8 | Mới | `mobile/src/features/wallet/customer/__tests__/customer-payment-screen.test.tsx` | Kiểm tra tích hợp danh sách giao dịch và cập nhật số dư sau nạp thử |

---

## 2. Chi tiết kỹ thuật & Thiết kế Component

### 2.1. Component `WalletBalanceCard.tsx`
* **Giao diện**:
  * Nền gradient / xanh lục ngọc (`emerald-600` đến `teal-700`) hoặc màu xám sang trọng khi dark mode.
  * Icon chiếc ví (`WalletIcon`), chữ "Số dư khả dụng" kèm icon con mắt bật/tắt hiển thị số dư (đảm bảo tính riêng tư khi ở nơi công cộng).
  * Hiển thị số tiền lớn: ví dụ `250.000 đ` (kèm chữ Point nhỏ `250.000 điểm`).
  * Dòng trạng thái nhỏ hiển thị số dư tạm giữ: `Đang tạm giữ: 0 đ` (nếu có giao dịch đang giữ chỗ).
  * 2 nút hành động nhanh:
    1. **Nạp tiền** (`+ Nạp ví`): Mở `TopupModal`.
    2. **Lịch sử** (`Lịch sử GD`): Điều hướng sang `RouteNames.CUSTOMER_PAYMENT_TRANSACTION_HISTORY`.

### 2.2. Component `TopupModal.tsx`
* **Giao diện & Logic**:
  * Dùng `Modal` hoặc `BottomSheet` với overlay tối màu.
  * Tiêu đề: **Nạp điểm vào Ví HandyGo**.
  * Chú thích quy đổi: `1 VND = 1 Point`.
  * Grid chọn nhanh các mệnh giá phổ biến:
    * `50.000đ`, `100.000đ`, `200.000đ`
    * `500.000đ`, `1.000.000đ`, `2.000.000đ`
  * Ô `Input` nhập số tiền tự do (có format dấu chấm thời gian thực khi gõ, giới hạn tối thiểu 10.000đ, tối đa 50.000.000đ).
  * Nút chính: **"Thanh toán qua Cổng VNPAY"** (hiển thị logo VNPAY, icon bảo mật).
  * **Nút phụ Dev Mode (`__DEV__`)**:
    * Hiển thị nút viền nét đứt: **"⚡ [Sandbox] Giả lập nạp thành công"** giúp lập trình viên nạp ngay điểm vào ví test mà không cần thẻ ngân hàng thật.
  * Hiển thị trạng thái đang xử lý (`isCreating` / `isPolling`) kèm spinner.

### 2.3. Cập nhật `CustomerPaymentScreen.tsx`
Thay thế phần text placeholder *"Chức năng đang được phát triển"* bằng:
1. `WalletBalanceCard`: Đặt ở vị trí nổi bật trên cùng.
2. Section **"Phương thức thanh toán"** (giữ nguyên `testID="payment-linked-btn"` chuyển tới `/customer/payment/link-account`).
3. Section **"Lịch sử giao dịch gần đây"** (giữ nguyên `testID="payment-see-all-transactions-btn"`):
   * Hiển thị 3 giao dịch mới nhất.
   * Nút *"See all >"* chuyển tới toàn bộ lịch sử.
4. Tích hợp `TopupModal` ẩn/hiện theo state `isTopupModalOpen`.

---

## 3. Kế hoạch kiểm thử (Test Plan) cho Phần 3
1. **Kiểm tra render thẻ ví**:
   * Kiểm tra hiển thị số dư đúng format `100.000 đ`.
   * Bấm icon mắt ẩn số dư → số dư chuyển thành `••••••`.
2. **Kiểm tra modal nạp tiền**:
   * Bấm chọn chip 100k → input cập nhật giá trị 100.000.
   * Nhập dưới 10.000đ → nút thanh toán bị disable và hiện cảnh báo.
   * Bấm nạp tiền → gọi hàm `createTopup` và mở `startVnpayCheckout`.
3. **Chạy hồi quy navigation test**:
   * `pnpm test src/app/customer/__tests__/account-payment-flow.test.tsx` phải PASS toàn bộ các luồng A, B, C, D, E, F.

## 4. Tiêu chí nghiệm thu (Acceptance Criteria)
- [x] Giao diện dùng `Pressable` và native `Modal`; không render giá trị falsy bằng `&&`; mọi chuỗi hiển thị nằm trong `<Text>`. Không có ảnh bitmap trong các component mới nên không cần `expo-image`.
- [x] Thẻ ví lấy `availableBalance` và `reservedBalance` từ `useWallet()` / `wallets/me`, không tính số dư giả ở UI. Trạng thái chưa có ví hoặc lỗi được hiển thị riêng; ví không hoạt động không cho nạp.
- [x] Nút nạp thử chỉ xuất hiện trong `__DEV__`, kiểm tra `isSimulated` từ backend trước khi gọi simulate. Khi top-up đạt `completed`, `useTopup()` làm mới các query ví; bài test tích hợp xác nhận số dư chuyển từ `0 đ` lên `100.000 đ` sau khi mock backend trả kết quả thanh toán và cộng điểm.

## 5. Ghi chú triển khai và xác minh

- Chế độ ẩn số dư được lưu bằng `StorageService` với `WALLET_BALANCE_HIDDEN`; cả số dư khả dụng, điểm và số dư tạm giữ đều được che.
- Modal có sáu mệnh giá nhanh, nhập VND với dấu chấm, chặn số tiền ngoài khoảng 10.000–50.000.000 VND, khóa thao tác khi đang tạo hoặc xác nhận top-up. Nút VNPAY mở `checkoutUrl` từ API; nút sandbox dùng top-up mock của backend. Nếu backend không bật mock, UI báo lỗi rõ ràng.
- Màn hình `/customer/payment` hiển thị ba giao dịch mới nhất qua `WalletApi.getMyTransactions({ page: 1, limit: 3 })`, giữ `payment-linked-btn` và `payment-see-all-transactions-btn` cùng điều hướng cũ.
- Xác minh bằng Jest cho card, modal, màn hình tích hợp, hook/API ví và luồng navigation A–F; `pnpm run type-check` và ESLint cho các file liên quan. Test sandbox dùng API mock để xác nhận UI và việc làm mới số dư; chưa xác minh trực tiếp với thiết bị hoặc backend đang chạy.
