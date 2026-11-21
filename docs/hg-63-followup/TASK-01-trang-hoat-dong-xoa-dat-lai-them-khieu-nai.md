# TASK-01: Trang hoạt động - Xóa tab Đặt lại, Thêm tab Đang khiếu nại

## 1. Mục tiêu & Hiện tượng
- **Hiện trạng:**
  - Tại trang Hoạt động (`CustomerOrdersScreen`), thanh bộ lọc đơn hàng đang gồm 5 tab: `Đang tìm`, `Đang làm`, `Đặt lại`, `Hoàn thành`, `Đã hủy`.
  - Tab `Đặt lại` (`Reorder`) hiện tại không phản ánh đúng nghiệp vụ vòng đời đơn hàng, nút "Đặt lại" trên thẻ đơn hàng chỉ điều hướng về trang chủ (`/customer`).
  - Khi đơn hàng phát sinh tranh chấp hoặc khách hàng gửi khiếu nại (`disputed`), hiện chưa có tab chuyên biệt để khách hàng theo dõi các đơn đang chờ giải quyết khiếu nại.
- **Yêu cầu:**
  1. Xóa hoàn toàn tab `Đặt lại` (`Reorder`) khỏi thanh filter tabs và logic bộ lọc.
  2. Bổ sung tab mới `Đang khiếu nại` (`Disputed` - nhãn tiếng Việt: **Đang khiếu nại**).
  3. Lọc và hiển thị chính xác các đơn hàng có trạng thái `disputed` trong tab này.
  4. Đảm bảo đồng bộ với API `useCustomerOrders` và các trạng thái badge, nút tương tác trên thẻ đơn hàng.

---

## 2. Các file ảnh hưởng chính
- `mobile/src/features/orders/customer/screens/customer-orders-screen.tsx`:
  - Mảng `ACTIVITY_FILTER_TABS`, `ACTIVITY_TAB_LABELS`, `VIETNAMESE_LABEL_MAP`.
  - Logic phân loại đơn hàng theo `activeTab === 'Disputed'`.
  - Xóa nút "Đặt lại" hoặc điều chỉnh hành động trên card đơn.
- `mobile/src/features/orders/hooks/use-customer-orders.ts`:
  - Kiểm tra param `status` khi fetch đơn hàng cho tab `Disputed` (`status: 'disputed'`).
- `mobile/src/app/customer/__tests__/activities-flow.test.tsx`:
  - Cập nhật kịch bản test kiểm tra sự xuất hiện của tab `Đang khiếu nại` và không còn tab `Đặt lại`.

---

## 3. Các bước thực hiện kỹ thuật
1. **Cập nhật danh mục Tab:**
   - Thay `'Reorder'` bằng `'Disputed'` trong `ACTIVITY_FILTER_TABS`.
   - Cập nhật `ACTIVITY_TAB_LABELS`:
     ```ts
     export const ACTIVITY_FILTER_TABS = [
       'Searching',
       'In process',
       'Disputed',
       'Finished',
       'Cancelled',
     ] as const;

     const ACTIVITY_TAB_LABELS: Record<ActivityFilterTab, string> = {
       'Searching': 'Đang tìm',
       'In process': 'Đang làm',
       'Disputed': 'Đang khiếu nại',
       'Finished': 'Hoàn thành',
       'Cancelled': 'Đã hủy',
     };
     ```
   - Cập nhật `VIETNAMESE_LABEL_MAP` bổ sung: `'đang khiếu nại': 'Disputed'`, `'khiếu nại': 'Disputed'`. Xóa mapping `'đặt lại'`.

2. **Cập nhật Logic lọc đơn hàng (`useCustomerOrders`):**
   - Đảm bảo khi chọn tab `Disputed`, hook gọi query với `status: 'disputed'`.
   - Hiển thị badge trạng thái màu cam/đỏ cảnh báo (`bg-rose-100 text-rose-800` hoặc `bg-amber-100 text-amber-800`).

3. **Cập nhật Card & Empty State:**
   - Xóa nút "Đặt lại" (`router.push(RouteNames.CUSTOMER_HOME)`) trên các card.
   - Thêm text empty state khi tab `Disputed` không có đơn: `"Chưa có đơn hàng nào đang khiếu nại"`.

---

## 4. Kịch bản kiểm thử (Test Cases)
- [x] Mở trang Hoạt động, kiểm tra các tab hiển thị đúng thứ tự: **Đang tìm | Đang làm | Đang khiếu nại | Hoàn thành | Đã hủy**.
- [x] Không còn thấy chữ "Đặt lại" trên thanh tab.
- [x] Bấm vào tab "Đang khiếu nại", danh sách đơn hiển thị đúng các đơn có status `disputed`.
- [x] Chạy `pnpm test activities-flow.test.tsx` và `customer-orders.test.tsx` pass 100%.

