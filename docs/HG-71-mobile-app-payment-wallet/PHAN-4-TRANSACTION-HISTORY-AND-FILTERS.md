# PHẦN 4: LỊCH SỬ GIAO DỊCH VÍ & BỘ LỌC (TRANSACTION HISTORY & FILTERS)

> **Mã công việc:** HG-71-PHAN-4
>
> **Phụ thuộc:** Hoàn thành Phần 1, 2, 3
>
> **Mục tiêu:** Xây dựng màn hình lịch sử giao dịch toàn diện tại `/customer/payment/transaction-history` sử dụng `@shopify/flash-list` tối ưu hiệu năng cuộn cao cấp, hỗ trợ bộ lọc tab và xem chi tiết giao dịch.

---

## 1. Danh sách file phụ trách

| STT | Loại | Đường dẫn file | Nhiệm vụ chính |
|:---:|:---:|---|---|
| 1 | Mới | `mobile/src/features/wallet/customer/components/transaction-item.tsx` | Item hiển thị một giao dịch (memoized với `React.memo`) |
| 2 | Mới | `mobile/src/features/wallet/customer/components/transaction-detail-modal.tsx` | Modal / BottomSheet xem thông tin chi tiết một giao dịch |
| 3 | Sửa | `mobile/src/features/profile/customer/screens/customer-transaction-history-screen.tsx` | Màn hình danh sách lịch sử giao dịch hoàn chỉnh |
| 4 | Mới | `mobile/src/features/wallet/customer/__tests__/transaction-item.test.tsx` | Unit test cho item giao dịch |
| 5 | Mới | `mobile/src/features/wallet/customer/__tests__/customer-transaction-history-screen.test.tsx` | Integration test cho màn hình lịch sử giao dịch |

---

## 2. Chi tiết kỹ thuật & Thiết kế Component

### 2.1. Component `TransactionItem.tsx`
* Tuân thủ quy tắc Vercel Mobile: **Bắt buộc dùng `React.memo`** để tránh re-render khi cuộn danh sách.
* Các thuộc tính hiển thị:
  * **Icon theo loại giao dịch**:
    * `TOPUP`: Icon mũi tên hướng xuống màu xanh lá (Nạp tiền).
    * `PAYMENT_DEBIT`: Icon chiếc ví màu cam (Thanh toán dịch vụ).
    * `REFUND`: Icon hoàn tiền màu tím (Hoàn trả điểm).
    * Khác (`ADJUSTMENT`...): Icon thông báo màu xám.
  * **Tên giao dịch**: Ví dụ: *"Nạp tiền qua VNPAY"*, *"Thanh toán đơn việc #HG-1024"*, *"Hoàn tiền dịch vụ"*.
  * **Thời gian**: Định dạng ngày giờ Việt Nam (ví dụ: `14:30 - 20/11/2026`).
  * **Số tiền**:
    * Giao dịch cộng tiền: Hiển thị màu xanh lá kèm dấu `+` (ví dụ `+100.000 đ`).
    * Giao dịch trừ tiền: Hiển thị màu trung tính / đen kèm dấu `-` (ví dụ `-250.000 đ`).
  * Bấm vào item gọi callback `onPress(transaction)`.

### 2.2. Component `TransactionDetailModal.tsx`
* Hiển thị dạng BottomSheet hoặc Modal nổi giữa màn hình khi người dùng bấm vào một giao dịch:
  * Trạng thái giao dịch: Huy hiệu xanh (Thành công).
  * Mã giao dịch (`id`).
  * Mã tham chiếu đơn hàng / giao dịch gốc (`referenceId`).
  * Số dư trước giao dịch (`balanceBefore`) và sau giao dịch (`balanceAfter`).
  * Nội dung chi tiết (`description`).
  * Nút "Đóng" và nút "Cần trợ giúp về giao dịch này" (mở hỗ trợ khách hàng).

### 2.3. Cập nhật `CustomerTransactionHistoryScreen.tsx`
Thay thế phần placeholder bằng kiến trúc danh sách hoàn chỉnh:
* **Header**: Thanh `AppBar` tiêu đề *"Lịch sử giao dịch"*, có nút Back.
* **Bộ lọc Filter Tabs**:
  * Các tab ngang:
    * `Tất cả` (All)
    * `Nạp tiền` (`type=TOPUP`)
    * `Thanh toán` (`type=PAYMENT_DEBIT`)
    * `Hoàn tiền` (`type=REFUND`)
* **Danh sách FlashList**:
  * Sử dụng `@shopify/flash-list` với `estimatedItemSize={76}`.
  * Tích hợp dữ liệu từ `useWalletTransactions(selectedType)`.
  * Hỗ trợ `onEndReached` tải tiếp trang sau.
  * Hỗ trợ `RefreshControl` kéo xuống để làm mới (pull-to-refresh).
* **Trạng thái đặc biệt**:
  * `LoadingState`: Skeleton placeholder khi tải lần đầu.
  * `EmptyState`: Hiển thị hình ảnh hoặc icon khi chưa có giao dịch nào thuộc bộ lọc đó.

---

## 3. Kế hoạch kiểm thử (Test Plan) cho Phần 4
1. **Kiểm tra render danh sách**:
   * Mock 10 giao dịch → kiểm tra render đủ 10 item.
   * Kiểm tra giao dịch `TOPUP` có dấu `+` và màu xanh lá.
   * Kiểm tra giao dịch `PAYMENT_DEBIT` có dấu `-`.
2. **Kiểm tra filter tab**:
   * Bấm tab `Nạp tiền` → gọi lại query với filter `type: 'TOPUP'`.
3. **Kiểm tra click xem chi tiết**:
   * Bấm vào 1 item → modal chi tiết mở ra hiển thị đúng mã giao dịch và số tiền.
4. **Kiểm tra hồi quy**:
   * `screen.getByTestId('customer-transaction-history-screen')` vẫn tồn tại, test `account-payment-flow.test.tsx` pass.

## 4. Tiêu chí nghiệm thu (Acceptance Criteria)
- [x] Triển khai danh sách ảo hóa bằng `@shopify/flash-list` 2, item memoized và callback ổn định; không lồng danh sách trong ScrollView dọc. Hiệu năng FPS thực tế cần đo trên thiết bị (xem phần xác minh).
- [x] Thanh tab/header giữ vị trí khi lọc; test xác nhận dữ liệu tab cũ không lọt sang tab mới và không duplicate dữ liệu giữa trang.
- [x] Format thời gian `HH:mm - DD/MM/YYYY` và tiền tệ Việt Nam, giữ chính xác chuỗi số nguyên lớn.

## 5. Kết quả triển khai và đối chiếu contract

- `TransactionItem` dùng `React.memo`, callback `onPress(transaction)` ổn định, icon theo loại, dấu cộng/trừ và màu theo chiều giao dịch, định dạng `HH:mm - DD/MM/YYYY` theo giờ thiết bị. Số tiền giữ nguyên chuỗi số nguyên để không mất chính xác khi vượt giới hạn Number.
- Màn hình dùng FlashList 2.0.2 có sẵn trong repository, không lồng trong ScrollView dọc. Phiên bản 2 tự đo kích thước item và không hỗ trợ `estimatedItemSize`; không thêm prop của phiên bản 1. Header và thanh tab nằm ngoài danh sách để giữ vị trí ổn định; đổi tab đưa danh sách của bộ lọc mới về đầu.
- Các tab gửi đúng giá trị contract Phần 1: `undefined`, `topup`, `payment_debit`, `refund_credit` (các tên TOPUP/PAYMENT_DEBIT/REFUND trong thiết kế phía trên là tên mô tả, không phải giá trị gửi API).
- Dữ liệu lấy từ `useWalletTransactions(selectedType)`, phân trang 15 bản ghi; loại trùng theo `id` giữa các trang. Query riêng cho từng bộ lọc ngăn phản hồi cũ ghi đè tab mới. Có skeleton, trạng thái rỗng, lỗi và thử lại, spinner tải tiếp, kéo làm mới; lỗi trang sau giữ các giao dịch đã tải.
- Modal có trạng thái thật (thành công, đang xử lý, thất bại hoặc đảo giao dịch), số tiền, thời gian, mã giao dịch/tham chiếu, nội dung, đóng bằng nút hoặc Back hệ thống và điều hướng tới `/customer/support`.
- Theo contract đã xác minh ở Phần 1, cả list/detail API đều **không trả `balanceBefore`, `balanceAfter`, `direction`**. Hai dòng số dư trước/sau hiển thị “Chưa được cung cấp”; `admin_adjustment` không tự gán dấu cộng/trừ. Không suy ra số dư lịch sử từ số dư hiện tại.
- File bổ sung ngoài bảng: `mobile/src/features/wallet/utils/transaction-display.ts` chia sẻ định dạng item/modal; `transaction-detail-modal.test.tsx` kiểm tra trạng thái không thành công; cập nhật test navigation `account-payment-flow.test.tsx` cho UI thực tế.

### Xác minh

- Test item: dấu cộng/màu xanh, dấu trừ/mã đơn, số nguyên lớn, ngày giờ Việt Nam và callback.
- Test màn hình dùng hook/query thật với API mock: 10 item, bốn bộ lọc, phản hồi tab cũ về muộn, phân trang trùng ID, kéo làm mới, lỗi tải thêm và retry, loading/rỗng/lỗi ban đầu.
- Test modal: đúng mã, số tiền, tham chiếu, mô tả, đóng, mở hỗ trợ; trạng thái pending/failed/reversed không hiển thị thành công.
- Hồi quy navigation A–F và các test wallet; TypeScript và ESLint cho các file liên quan.
- Kết quả: `pnpm test src/features/wallet src/app/customer/__tests__/account-payment-flow.test.tsx --runInBand --silent` đạt **13 suite / 65 test**; `pnpm run type-check` và ESLint đạt.
- Test màn hình thay FlashList bằng RN FlatList để kích hoạt callback trong Jest; test navigation vẫn mount FlashList thật. Chưa đo FPS hoặc xác minh thao tác cuộn trên thiết bị thật.
