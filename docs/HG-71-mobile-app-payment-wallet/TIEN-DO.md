# Báo Cáo Tiến Độ Review Mobile (HG-71)

- **Nhánh**: `feature/HG-71-mobile-app-payment-wallet`
- **Pull Request**: [#93](https://github.com/duyaivy/HANDY_GO/pull/93)
- **Người review**: `duyaivy` (Repository Owner)
- **Thời gian hoàn thành**: 21/11/2026
- **Trạng thái**: Đã sửa lỗi thống kê tính trên trang dữ liệu chưa đầy đủ. Với lịch sử nhiều trang, tạm ẩn các chỉ số tổng hợp cho đến khi có API tổng hợp từ Backend.

---

## 1. Vấn Đề Từ Review Của duyaivy

**Nội dung nhận xét:**
> **[P2 — Mobile/performance] Tránh tải toàn bộ lịch sử ví/payment khi hiển thị thống kê thợ.**  
> Hiện tại mỗi lần query này chạy, `allPayments()` và `allTransactions()` đều quét toàn bộ các trang (`limit: 100`), sau đó mới tính `workerFinancialSummary` và lấy 5 giao dịch gần nhất. Khi tài khoản có nhiều giao dịch, số HTTP requests và dung lượng truyền tăng theo lịch sử tích lũy; refetch sau 30 giây hoặc invalidate cache cũng phải quét lại. Ngoài độ trễ, dữ liệu bị cập nhật trong lúc phân trang có thể làm snapshot thống kê không nhất quán.

---

## 2. Chi Tiết Các Thay Đổi Đã Thực Hiện

### 2.1. Loại bỏ vòng lặp quét toàn bộ trang trong `useWorkerFinancials`
- **File**: `mobile/src/features/wallet/hooks/use-worker-financials.ts`
- **Cải tiến**:
  - Loại bỏ hoàn toàn hai hàm `allPayments()` và `allTransactions()` chạy vòng lặp tuần tự `for (let page = 1; ; page++)`.
  - Thay thế bằng **1 lượt truy vấn song song duy nhất** (`Promise.all`) với giới hạn cận trên cố định:
    - `PaymentApi.getMyPayments({ page: 1, limit: 100 }, signal)`
    - `WalletApi.getMyTransactions({ page: 1, limit: 100 }, signal)`
  - Giảm số lượng request từ `N + M` requests (tăng dần theo thời gian hoạt động của thợ) xuống cố định **2 requests song song**.
  - Giới hạn mảng `transactions` trả về cho dashboard ví đúng **5 giao dịch mới nhất** (`transactions.slice(0, 5)`), phù hợp với hiển thị tại màn hình [WorkerWalletScreen](file:///mobile/src/features/wallet/worker/screens/worker-wallet-screen.tsx#L32).
  - Tăng `staleTime` từ `30000` (30 giây) lên `60000` (1 phút) để giảm thiểu các lần tự động refetch ngầm không cần thiết.

### 2.2. Tách riêng hook phân trang `useWorkerCashPayments`
- **File**: `mobile/src/features/wallet/hooks/use-worker-cash-payments.ts`
- **Cải tiến**:
  - Tách luồng quản lý đơn tiền mặt chờ xác nhận ra khỏi dashboard tài chính tổng hợp.
  - Sử dụng `useInfiniteQuery` với kích thước trang chuẩn `CASH_PAYMENTS_PAGE_SIZE = 15`.
  - Chỉ fetch trang tiếp theo khi người dùng chủ động cuộn xuống cuối danh sách.
  - Cập nhật [wallet-query-keys.ts](file:///mobile/src/features/wallet/hooks/wallet-query-keys.ts) bổ sung key quản lý cache riêng biệt `workerCashPayments(userId)`.

### 2.3. Tối ưu màn hình `WorkerCashPaymentsScreen`
- **File**: `mobile/src/features/wallet/worker/screens/worker-cash-payments-screen.tsx`
- **Cải tiến**:
  - Chuyển sang sử dụng `useWorkerCashPayments()`.
  - Áp dụng cơ chế **khử trùng lặp bản ghi (Deduplication)** bằng `Map<string, OrderPaymentRecord>` theo `id`. Khi có giao dịch mới phát sinh đồng thời giữa các lần tải trang khiến chỉ mục phân trang bị xê dịch, danh sách hiển thị vẫn đảm bảo không bị trùng lặp phần tử hay crash React key.
  - Bổ sung callback `onEndReached` (`loadMore`) và `onEndReachedThreshold={0.5}` để tải trang kế tiếp mượt mà.
  - Bổ sung `ListFooterComponent` hiển thị `ActivityIndicator` khi đang fetch trang tiếp theo (`isFetchingNextPage`).
  - Tách hàm `renderEmpty()` xử lý phân nhánh trạng thái: chưa đăng nhập, đang tải, lỗi mạng (có nút bấm chạm để thử lại) và danh sách trống.

---

## 3. Kết Quả Kiểm Thử Và Đo Đạc

### 3.1. Unit & Integration Tests
Toàn bộ test suite liên quan đến Wallet đều vượt qua 100%:
- **Test Suites**: 25 passed, 25 total
- **Tests**: 153 passed, 153 total

Các bài test kiểm chứng chuyên biệt:
1. `mobile/src/features/wallet/hooks/__tests__/use-worker-financials.test.tsx`:
   - Xác nhận `PaymentApi.getMyPayments` và `WalletApi.getMyTransactions` chỉ được gọi **đúng 1 lần duy nhất** (không còn vòng lặp N+1).
   - Xác nhận danh sách giao dịch trả về cho dashboard được cắt chuẩn 5 bản ghi gần nhất.
   - Kiểm tra xử lý lỗi khi từng service riêng lẻ bị gián đoạn.
2. `mobile/src/features/wallet/hooks/__tests__/use-worker-cash-payments.test.tsx`:
   - Kiểm tra `useInfiniteQuery` tải phân trang từng trang (`page = 1`, sau đó `fetchNextPage()` tải `page = 2`).
   - Kiểm tra trạng thái báo lỗi và cờ `hasNextPage`.
3. `mobile/src/features/wallet/worker/__tests__/worker-cash-payments-screen.test.tsx`:
   - Kiểm tra render danh sách, cuộn tải trang tiếp theo qua sự kiện `onEndReached`.
   - **Xác minh khả năng chống trùng lặp**: mô phỏng bản ghi `order-2` xuất hiện ở cả trang 1 và trang 2 do dữ liệu mới chèn vào, màn hình hiển thị chính xác duy nhất 1 thẻ đơn `order-2`.
   - Kiểm tra trạng thái retry khi gặp lỗi mạng.

### 3.2. Kiểm tra chất lượng mã nguồn
- **TypeScript**: `tsc --noemit` chạy qua hoàn toàn, 0 lỗi kiểu dữ liệu.
- **ESLint**: Toàn bộ các file sửa đổi và file test mới tuân thủ 100% quy chuẩn linter dự án, không có warning/error.

---

## 4. Khuyến Nghị & Đặc Tả Bàn Giao Cho Backend (Task Riêng)

Theo định hướng từ review của `duyaivy`:
> *"Với `weeklyEarnings`, `commissionPaid`, `cashCommissionDue` cần đối soát ledger toàn kỳ, nên thống nhất thêm API thống kê tổng hợp từ Backend thay vì tải mọi bản ghi lên thiết bị."*

### Đề xuất API tổng hợp tài chính cho thợ:
- **Endpoint**: `GET /api/v1/payments/worker/financial-summary`
- **Mục đích**: Tính toán các chỉ số lũy kế và đối soát trực tiếp bằng SQL Aggregation trong database, loại bỏ hoàn toàn việc tính toán ở client.
- **Payload đề xuất**:
  ```json
  {
    "statusCode": 200,
    "message": "Worker financial summary retrieved",
    "data": {
      "weeklyEarnings": "1250000",
      "completedJobsThisWeek": 8,
      "commissionPaid": "350000",
      "cashCommissionDue": "50000"
    }
  }
  ```
- **Lợi ích**:
  - Truy vấn tức thời với độ phức tạp $O(1)$ request và kích thước payload cực nhỏ (< 1KB).
  - Đảm bảo tính toán công nợ và hoàn tiền (`refund_recovery`) hoàn toàn nhất quán theo transaction phía cơ sở dữ liệu.

---

## 5. Sửa Review Tiếp Theo: Không Tính Tổng Từ Trang 1

**Vấn đề:** `useWorkerFinancials` chỉ tải tối đa 100 payment và 100 bút toán ví nhưng vẫn gọi `workerFinancialSummary` trên hai tập dữ liệu đó. Với 150 payment hoặc hơn 100 bút toán, các chỉ số `weeklyEarnings`, `completedJobs`, `commissionPaid` và `cashCommissionDue` có thể thấp hơn thực tế.

**Đã sửa trong Mobile:**
- Chỉ gọi `workerFinancialSummary` khi cả hai response đều xác nhận toàn bộ dữ liệu nằm trong trang đầu: `page = 1`, `totalPages` khớp `total/limit`, số bản ghi và số ID riêng biệt đều bằng `total`.
- Nếu một nguồn có nhiều trang hoặc metadata không khớp, trả `summary: null`. Màn ví và màn số dư ẩn các chỉ số tổng, hiển thị thông báo chưa thể thống kê chính xác.
- Giữ preview 5 giao dịch mới nhất từ trang đầu; preview không bị dùng làm dữ liệu đầu vào cho các phép tổng hợp.
- Vẫn dùng một request tới mỗi service cho màn tổng quan. Không sửa Backend và không quét toàn bộ lịch sử trên thiết bị.

**Kiểm tra:** 25/25 bộ test ví, 153/153 test đạt; TypeScript và ESLint các file sửa đạt. Regression tests bao gồm 150 payment, 150 bút toán, metadata thiếu nhất quán, ID trùng và kiểm tra giao diện không hiện số tổng sai nhưng vẫn hiện giao dịch gần đây. Jest vẫn có cảnh báo `act` và dùng `--forceExit`; chưa kiểm tra luồng này trên app native hoặc Backend deploy.

**Giới hạn còn lại:** Khi lịch sử vượt một trang, các chỉ số tổng hợp chưa khả dụng. API tổng hợp phía Backend ở mục 4 là điều kiện để hiển thị lại chúng mà vẫn giữ giới hạn request cố định.
