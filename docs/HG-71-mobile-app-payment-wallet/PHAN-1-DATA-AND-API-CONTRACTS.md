# PHẦN 1: TẦNG DỮ LIỆU & API CONTRACTS

> **Mã công việc:** HG-71-PHAN-1
> **Phạm vi:** Mobile App của khách hàng. Các request đi qua API Gateway với base URL `/api/v1`. Không sửa Backend.
> **Trạng thái:** Hoàn thành và đã kiểm thử.

## 1. File triển khai

| File | Vai trò |
|---|---|
| `mobile/src/features/wallet/types/wallet.types.ts` | Kiểu ví, giao dịch, bộ lọc và phân trang |
| `mobile/src/features/wallet/types/payment.types.ts` | Kiểu top-up, thanh toán đơn và phân trang |
| `mobile/src/features/wallet/api/wallet.api.ts` | API ví và giao dịch của người dùng hiện tại |
| `mobile/src/features/wallet/api/payment.api.ts` | API top-up và thanh toán đơn |
| `mobile/src/features/wallet/utils/formatters.ts` | Định dạng Point/VND, chuyển số an toàn, xác định dấu giao dịch |
| `mobile/src/features/wallet/utils/__tests__/formatters.test.ts` | Test số tiền và dấu giao dịch |
| `mobile/src/features/wallet/api/__tests__/wallet-api.test.ts` | Test route, query và request body |

## 2. Hợp đồng Backend đã đối chiếu

Nguồn: `backend/apps/wallet-service/src/wallet-query/`, `backend/apps/payment-service/src/topups/`, `backend/apps/payment-service/src/payment-orders/`, `backend/apps/payment-service/src/payment-query/`.

### Ví và giao dịch

- `GET /wallets/me` trả `id`, `userId`, `balance`, `reservedBalance`, `availableBalance`, `status`, `createdAt`, `updatedAt`. Các số tiền là chuỗi số nguyên. `status` là `active | frozen | closed`. Response không có `currency`.
- `GET /wallets/me/transactions` nhận `page`, `limit`, `type`, `status`, `from`, `to`; trả `items`, `page`, `limit`, `total`, `totalPages`.
- `GET /wallets/me/transactions/:id` trả `id`, `type`, `amount`, `status`, `referenceId`, `description`, `createdAt`. Response không có `walletId`, `balanceBefore`, `balanceAfter` hoặc `direction`. `referenceId` và `description` có thể là `null`.
- Các loại giao dịch hiện được ghi bởi Wallet Service dùng chữ thường, ví dụ `topup`, `payment_debit`, `refund_credit`. `admin_adjustment` có thể tăng hoặc giảm số dư; API hiện không trả `direction`, nên `getTransactionSign` yêu cầu truyền direction riêng cho loại này và báo lỗi khi thiếu.

### Nạp tiền và thanh toán đơn

- `POST /payments/topups` nhận `{ amountVnd: number, idempotencyKey: string }`. Caller phải giữ nguyên key khi thử lại cùng một yêu cầu. Các số tiền trong response (`amountVnd`, `pointsToCredit`) là chuỗi.
- `GET /payments/topups` nhận `page`, `limit` và trả `items`, `page`, `limit`, `total`, `totalPages`.
- `GET /payments/topups/:id` trả trạng thái để client polling. `POST /payments/topups/:id/simulate` nhận `{ outcome: 'succeeded' | 'failed' }`; chỉ khả dụng khi Backend bật MockTopupProvider.
- Top-up có `isSimulated`, `simulationEndpoint`, `checkoutUrl`, `providerPaidAt`, `walletCreditedAt`, `expiresAt`, `createdAt`. Các trường endpoint, URL và thời điểm chưa phát sinh có thể `null`. Backend không trả `userId` trong top-up response.
- `POST /payments` nhận `{ orderId, method }` với `method: 'point' | 'cash'`. Giá trị Backend là `point`, không phải `points`.
- `POST /payments/:id/pay-with-points` nhận `{ confirm: true }`. Backend xử lý idempotency theo payment/attempt, không nhận idempotency key từ client cho route này.
- `GET /payments/order/:orderId` trả thanh toán với `customerUserId`, `workerUserId`, `amount`, `currency`, `method`, `status`, `platformFee`, `workerEarning`, `orderCompletedAt`, `paidAt`, `createdAt`, `updatedAt`. `method` và các thời điểm chưa phát sinh có thể `null`.
- Mọi phương thức API trả nguyên envelope `{ statusCode, message, data }` theo hành vi `ApiClient.get/post` hiện tại.

## 3. Quy tắc tiền tệ

- `formatPointsToVND` nhóm từng ba chữ số bằng dấu chấm và thêm ` đ`, kể cả với chuỗi số nguyên lớn hơn giới hạn an toàn của JavaScript Number.
- `parsePointsToNumber` chỉ nhận số nguyên trong phạm vi `Number.MIN_SAFE_INTEGER` đến `Number.MAX_SAFE_INTEGER`; vượt phạm vi sẽ ném `RangeError`. Các phép so sánh tiền lớn cần dùng `BigInt` từ chuỗi gốc.
- `null`, `undefined` và chuỗi rỗng tương ứng `0`. Giá trị thập phân hoặc chuỗi không hợp lệ bị từ chối, không được làm tròn.

## 4. Nghiệm thu

- [x] Các kiểu xuất khẩu khớp response và DTO hiện tại của Backend.
- [x] `cd mobile && pnpm run type-check` thành công.
- [x] `cd mobile && pnpm test src/features/wallet --runInBand` thành công (2 suites, 12 tests).
- [x] ESLint thành công cho các file Part 1.
