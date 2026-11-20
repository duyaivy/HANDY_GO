# PHẦN 2: QUẢN LÝ STATE & CUSTOM HOOKS

> **Mã công việc:** HG-71-PHAN-2
> **Phụ thuộc:** HG-71 Phần 1
> **Trạng thái:** Hoàn thành và đã kiểm thử.

## 1. Phạm vi triển khai

| File | Chức năng |
|---|---|
| `mobile/src/features/wallet/hooks/wallet-query-keys.ts` | Query keys cho ví, giao dịch, chi tiết giao dịch và top-up |
| `mobile/src/features/wallet/hooks/use-wallet.ts` | Đọc ví và phân biệt ví chưa tồn tại với lỗi khác |
| `mobile/src/features/wallet/hooks/use-wallet-transactions.ts` | Phân trang vô tận lịch sử giao dịch theo loại |
| `mobile/src/features/wallet/hooks/use-topup.ts` | Tạo top-up, mở checkout, polling, giả lập và quản lý cache |
| `mobile/src/features/wallet/hooks/use-order-payment.ts` | Thanh toán Point/Cash, kiểm tra số dư và chống gửi trùng |
| `mobile/src/features/wallet/hooks/__tests__/` | Test hooks, polling, phân trang và thanh toán |
| `mobile/src/constants/storage-keys.ts` | Khóa lưu idempotency key theo người dùng |
| `mobile/src/stores/use-auth-store.ts` | Xóa cache ví và top-up khi đăng xuất |
| `mobile/src/lib/auth/__tests__/auth-store-and-role-guard.test.tsx` | Kiểm tra cache tài chính được xóa khi đăng xuất |

## 2. Hành vi đã triển khai

### Query và cache

- `walletQueryKeys.all` là `['wallet']`; các key `me`, `transactions(filters)`, `transactionDetail(id)` và `topupDetail(id)` nằm dưới key này.
- `useWallet` giữ cache tươi 30 giây, trả `balance`, `availableBalance`, `reservedBalance` dạng chuỗi, `currency: 'POINT'` và trạng thái ví đúng theo Backend (`active | frozen | closed`). Lỗi `ApiError` 404 tạo trạng thái `isWalletNotFound` và không retry; lỗi khác retry tối đa hai lần.
- `useWalletTransactions(type?)` dùng `useInfiniteQuery`, mỗi trang 15 giao dịch, lấy trang tiếp theo từ `page` và `totalPages`, cache tươi 60 giây.
- Logout hủy query đang chạy và xóa toàn bộ cache dưới `walletQueryKeys.all` để tài khoản sau không đọc số dư hay top-up cũ.

### Nạp tiền

- `createTopup(amountVnd)` chỉ chấp nhận số nguyên từ 10.000 đến 50.000.000 VND. Hook tạo `randomUUID` một lần cho yêu cầu; thao tác gửi đồng thời được gộp vào một request.
- Nếu request thất bại, idempotency key được giữ trong MMKV theo user ID. Thử lại cùng số tiền, kể cả sau khi mở lại màn hình, sẽ dùng key cũ. Thành công sẽ xóa key đã lưu và cập nhật `activeTopup`.
- `startVnpayCheckout(checkoutUrl, topupId)` mở URL trước rồi mới polling. Nếu mở URL lỗi, polling không bắt đầu.
- Polling tuần tự mỗi 2,5 giây, tối đa 40 lần; không chồng request. `completed` mới làm mới cache ví; `failed`, `cancelled`, `expired`, `needs_review` dừng polling. Hết lượt đặt `hasPollingTimedOut`; unmount hoặc `cancelPolling` hủy timer và bỏ qua response đến muộn.
- `simulateTopup` chỉ làm mới ví nếu response đã là `completed`. Nếu Backend trả `credit_pending`, hook tiếp tục polling đến khi Wallet Service xác nhận hoàn tất.

### Thanh toán đơn hàng

- `processPayment('cash')` gọi `openPayment` và trả payment đang chờ thợ xác nhận. Hook không gọi thanh toán Point.
- `processPayment('point')` gọi `openPayment`, đọc số dư khả dụng mới nhất, rồi chỉ gọi `payWithPoints` nếu đủ tiền. Thiếu tiền ném `InsufficientWalletBalanceError` kèm `shortfall` dạng chuỗi số nguyên để UI dẫn sang nạp tiền.
- Sau thành công, hook làm mới cache ví và đơn hàng. Các lần bấm đồng thời được gộp để không tạo hai luồng thanh toán.
- Method gửi Backend là `point`, đúng với DTO hiện tại. Backend tự bảo đảm idempotency cho `pay-with-points` theo payment/attempt.

## 3. Nghiệm thu

- [x] `cd mobile && pnpm run type-check` thành công, không thêm `any` trong hooks.
- [x] ESLint thành công cho hooks và các file tích hợp.
- [x] `cd mobile && pnpm test src/features/wallet/hooks --runInBand` thành công: 4 suites, 16 tests.
- [x] `cd mobile && pnpm test src/features/wallet src/lib/auth/__tests__/auth-store-and-role-guard.test.tsx --runInBand` thành công: 7 suites, 44 tests.
