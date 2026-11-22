# TASK-05: Thống nhất tiếng Việt trong toàn bộ luồng hủy

- **Mục yêu cầu:** Mục 5 (HG-63)
- **Giai đoạn:** Giai đoạn 1 (Làm song song hoặc nối tiếp ngay sau TASK-04)
- **Độ ưu tiên:** Cao
- **Trạng thái:** Hoàn thành

---

## 1. Mục tiêu & Phạm vi

### Mục tiêu
Chuẩn hóa 100% ngôn ngữ tiếng Việt tự nhiên, chính xác, không pha trộn tiếng Anh trong toàn bộ giao diện và thông báo liên quan đến luồng hủy yêu cầu tìm thợ và hủy đơn hàng. Loại bỏ hoàn toàn các chuỗi tiếng Anh tĩnh (hardcoded English text) và các thông báo lỗi raw tiếng Anh trả về từ máy chủ.

### Phạm vi chốt
- **Bao gồm:**
  - Màn hình Radar tìm thợ: `mobile/src/app/customer/booking/radar.tsx`.
  - Hộp thoại hủy đơn: `mobile/src/features/orders/customer/screens/customer-order-cancel-dialog.tsx` và route `mobile/src/app/customer/orders/[id]/cancel-dialog.tsx`.
  - Màn hình chi tiết đơn: `mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx`.
  - Ánh xạ lỗi (Error message mapping) từ `ApiError` sang tiếng Việt.
- **Ngoại trừ:** Không thay đổi các mã hằng số nghiệp vụ nội bộ (Error codes, Enum status như `CANCELLED`, `PENDING`) ở tầng API/DTO.

---

## 2. Hiện trạng & Bằng chứng mã nguồn

1. **`mobile/src/app/customer/booking/radar.tsx`**:
   - Dòng 824: Nút hủy hiển thị chữ tiếng Anh cứng:
     ```tsx
     <Text className="ml-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">
       Cancel order
     </Text>
     ```
   - Một số nhãn trạng thái và thông báo còn hiển thị tiếng Anh hoặc placeholder chưa hoàn thiện.
2. **`mobile/src/features/orders/customer/screens/customer-order-cancel-dialog.tsx`**:
   - Khi API gặp lỗi từ server, chuỗi `error.message` tiếng Anh của backend (ví dụ: *"Cannot cancel order in current state"*, *"Request timeout"*) có thể bị hiển thị trực tiếp lên hộp thoại thông báo của người dùng.
3. **Các file kiểm thử tự động (Unit Tests):**
   - Một số test case hiện tại đang tìm kiếm chuỗi `'Cancel order'` hoặc placeholder tiếng Anh, nếu sửa UI sang tiếng Việt mà không cập nhật test thì test sẽ bị fail.

---

## 3. Thiết kế giải pháp kỹ thuật

### 3.1. Bảng chuẩn hóa từ ngữ tiếng Việt
Thay thế toàn bộ các từ tiếng Anh bằng từ ngữ tiếng Việt chuẩn ngữ cảnh dịch vụ sửa chữa:

| Tiếng Anh cũ | Tiếng Việt chuẩn hóa | Ngữ cảnh sử dụng |
|---|---|---|
| `Cancel order` | **Hủy tìm thợ** / **Hủy yêu cầu** | Nút bấm tại màn hình Radar tìm thợ |
| `Cancel order` | **Hủy đơn đặt việc** | Nút bấm tại màn hình Chi tiết đơn đã nhận |
| `Are you sure you want to cancel?` | **Bạn có chắc chắn muốn hủy yêu cầu này không?** | Modal xác nhận |
| `Cancellation reason` | **Lý do hủy yêu cầu** | Tiêu đề lựa chọn lý do |
| `Change of plan` | **Thay đổi kế hoạch, không cần làm nữa** | Lý do mặc định |
| `Found another worker` | **Đã tìm được thợ khác** | Tùy chọn lý do |
| `Price is too high` | **Giá dịch vụ chưa phù hợp** | Tùy chọn lý do |
| `Cancel` (nút đóng) | **Không** / **Quay lại** | Nút hủy thao tác dialog |
| `Confirm Cancel` | **Xác nhận hủy** | Nút xác nhận hành động hủy |
| `Cancelling...` | **Đang xử lý hủy...** | Trạng thái loading khi đang gửi request |
| `Cancelled successfully` | **Đã hủy yêu cầu thành công** | Thông báo sau khi hủy hoàn tất |

### 3.2. Ánh xạ mã lỗi (Error Mapping)
Tạo hoặc mở rộng hàm ánh xạ mã lỗi tập trung trong `mobile/src/services/api/api-error.ts` hoặc hook orders:

```typescript
export function getCancelErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'ORDER_NOT_FOUND':
      case 'REQUEST_NOT_FOUND':
        return 'Không tìm thấy yêu cầu dịch vụ hoặc yêu cầu đã bị xóa.';
      case 'ORDER_ALREADY_CANCELLED':
      case 'REQUEST_ALREADY_CANCELLED':
        return 'Yêu cầu này đã được hủy trước đó.';
      case 'ORDER_IN_PROGRESS':
        return 'Thợ đã bắt đầu thực hiện công việc, không thể hủy tự động. Vui lòng liên hệ hỗ trợ.';
      case 'WORKER_ACCEPTED':
        return 'Thợ vừa chấp nhận đơn, vui lòng kiểm tra lại trạng thái đơn hàng.';
      case 'NETWORK_ERROR':
        return 'Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.';
      case 'TIMEOUT':
        return 'Yêu cầu xử lý quá thời gian chờ. Vui lòng kiểm tra lại danh sách đơn hàng.';
      default:
        return 'Không thể hủy yêu cầu vào lúc này. Vui lòng thử lại sau.';
    }
  }
  return 'Đã có lỗi không xác định xảy ra. Vui lòng thử lại sau.';
}
```

- **Quy tắc quan trọng:** Tuyệt đối không bao giờ hiển thị raw string `error.message` tiếng Anh từ backend trực tiếp lên `Alert.alert` hoặc Toast của người dùng.

### 3.3. Tối ưu hóa UI văn bản tiếng Việt
- Tiếng Việt có độ dài ký tự trung bình dài hơn tiếng Anh khoảng 20% - 30% và có dấu thanh điệu.
- Đảm bảo các `Text` trong modal và nút bấm không bị cắt ngắn (ellipsis) xấu xí:
  - Cho phép `numberOfLines` phù hợp hoặc `flex-wrap`.
  - Đảm bảo khoảng cách dòng (`leading-normal` hoặc `lineHeight` tối thiểu 20) để các dấu câu như ngã, hỏi, nặng không bị chạm viền trên/dưới.

---

## 4. Kế hoạch kiểm thử & Nghiệm thu

### Ca kiểm thử bắt buộc
1. **Kiểm tra trực quan Radar:** Mở màn hình Radar -> Nút bấm ở dưới modal hiển thị rõ ràng chữ tiếng Việt "Hủy tìm thợ" (không còn chữ "Cancel order").
2. **Kiểm tra Dialog xác nhận:** Bấm nút hủy -> Modal xác nhận hiện ra với tiêu đề, nội dung và 2 nút "Không" và "Xác nhận hủy" hoàn toàn bằng tiếng Việt.
3. **Kiểm tra thông báo lỗi:** Giả lập các lỗi server (`400`, `404`, `409`, `500`, timeout) -> Tất cả thông báo lỗi hiện lên đều là câu tiếng Việt rõ nghĩa, tuyệt đối không xuất hiện câu tiếng Anh.
4. **Kiểm tra kích thước chữ lớn:** Bật font chữ lớn trên hệ thống -> Các nút tiếng Việt không bị rớt chữ kỳ lạ hoặc che mất icon.
5. **Cập nhật Unit Test:** Bộ test `radar.test.tsx` và `customer-order-cancel-dialog.test.tsx` chạy pass với các selector tiếng Việt mới.

### Lệnh chạy test liên quan
```bash
cd mobile
pnpm test radar.test.tsx
pnpm test customer-order-cancel-dialog.test.tsx
```

---

## 5. Checklist thực hiện

- [x] Thay chuỗi `'Cancel order'` thành `'Hủy tìm thợ'` trong `mobile/src/app/customer/booking/radar.tsx`.
- [x] Rà soát và việt hóa các tiêu đề, thông báo, nút bấm trong `customer-order-cancel-dialog.tsx`.
- [x] Cài đặt hàm `getCancelErrorMessage` ánh xạ mã lỗi backend sang tiếng Việt chuẩn.
- [x] Rà soát `customer-order-detail-screen.tsx` đảm bảo các nút và dialog hủy dùng từ ngữ nhất quán.
- [x] Cập nhật lại các file unit test đang tìm kiếm chuỗi tiếng Anh cũ.
- [x] Chạy test `pnpm test` và `pnpm typecheck`.

