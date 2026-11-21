# TASK-01: Tiến độ tải ảnh ngay trên ảnh đặt việc

- **Mục yêu cầu:** Mục 1 (HG-63)
- **Giai đoạn:** Giai đoạn 3
- **Độ ưu tiên:** Trung bình - Cao
- **Trạng thái:** Hoàn thành

---

## 1. Mục tiêu & Phạm vi

### Mục tiêu
Người dùng khi tạo đơn đặt việc và đính kèm hình ảnh mô tả công việc sẽ thấy tiến độ tải ảnh (vòng tròn tiến độ và % nếu đo được byte, hoặc spinner nếu không xác định) hiển thị trực tiếp trên từng thumbnail ảnh. Chặn việc nhấn "Tiếp tục" khi còn ảnh đang tải hoặc đang xử lý.

### Phạm vi chốt
- **Bao gồm:** Tiến độ upload **chỉ áp dụng cho ảnh đặt việc khách hàng** (`customer-booking-screen.tsx`).
- **Ngoại trừ:** Luồng KYC tài khoản thợ (`identity-api.ts`) và ảnh minh chứng hoàn thành đơn của thợ (`worker-job-complete-screen.tsx`) nằm ngoài phạm vi task này theo quyết định đã chốt.

---

## 2. Hiện trạng & Bằng chứng mã nguồn

1. **`mobile/src/features/orders/api/orders.api.ts`**:
   - `OrdersApi.uploadImage(fileUri: string, folder?: string): Promise<string>` hiện chỉ nhận URI và gửi qua `ApiClient.post` dưới dạng `FormData`.
   - Chưa hỗ trợ callback theo dõi tiến độ upload (`onUploadProgress`) và chưa nhận `AbortSignal` để hủy request.

2. **`mobile/src/features/orders/customer/screens/customer-booking-screen.tsx`**:
   - Chỉ sử dụng một cờ boolean đơn lẻ `isUploading` cho toàn bộ quá trình upload.
   - Khi chọn nhiều ảnh, gọi `uploadSingleImage` lần lượt nhưng giao diện không hiển thị tiến độ % cụ thể trên từng ảnh.
   - Chưa có ID ổn định cho từng item ảnh trong hàng đợi (chỉ có mảng string URI).
   - Khi người dùng xóa ảnh đang tải hoặc rời màn hình (unmount), tác vụ upload không bị abort, dẫn đến callback muộn có thể gây memory leak hoặc ghi đè URL vào draft mới.

---

## 3. Thiết kế giải pháp kỹ thuật

### 3.1. Mở rộng `OrdersApi.uploadImage`
- Giữ nguyên hợp đồng trả về `Promise<string>` (URL ảnh trên server).
- Bổ sung tham số tùy chọn `options`:
  ```typescript
  export interface UploadImageOptions {
    onProgress?: (percent: number) => void;
    signal?: AbortSignal;
  }
  ```
- Chuyển `onProgress` vào cấu hình `onUploadProgress` của Axios / `ApiClient.post`.
- Công thức tính phần trăm:
  ```typescript
  if (event.total && event.total > 0) {
    const percent = Math.min(100, Math.max(0, Math.round((event.loaded * 100) / event.total)));
    options?.onProgress?.(percent);
  }
  ```
- **Lưu ý thích ứng React Native:** Nếu adapter không trả về `total` hoặc báo `100%` trước khi server phản hồi hoàn tất:
  - Khi chưa có total: chuyển sang trạng thái spinner vô định.
  - Khi đã gửi 100% byte nhưng chưa nhận response JSON từ server: hiển thị trạng thái "Đang xử lý", **không tự tạo phần trăm giả**.

### 3.2. Quản lý trạng thái ảnh trong `customer-booking-screen.tsx`
- Định nghĩa kiểu dữ liệu cho từng ảnh trong draft:
  ```typescript
  export interface BookingImageItem {
    id: string; // UUID hoặc client-generated ID duy nhất
    localUri: string;
    remoteUrl?: string;
    status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
    progress: number; // 0 - 100
    errorMessage?: string;
    abortController?: AbortController;
  }
  ```
- Giới hạn số lượng ảnh: Tối đa **5 ảnh** (tính cả ảnh đã hoàn tất và ảnh đang trong hàng đợi tải).
- Quy trình upload:
  - Tải tuần tự từng ảnh trong danh sách `pending`.
  - Khi bắt đầu tải ảnh: cập nhật `status = 'uploading'`, khởi tạo `AbortController`.
  - Khi nhận `progress = 100`: cập nhật `status = 'processing'`.
  - Khi API trả về URL thành công: cập nhật `remoteUrl = url`, `status = 'completed'`.
  - Nếu upload thất bại: cập nhật `status = 'error'`, thông báo lỗi tiếng Việt, tự động loại bỏ thumbnail lỗi hoặc hiển thị nút thử lại (không gửi local URI lên đơn đặt việc).
- Điều kiện tiếp tục:
  - Vô hiệu hóa (disable) nút "Tiếp tục" / "Xác nhận đặt việc" chừng nào vẫn còn ảnh có trạng thái `'pending' | 'uploading' | 'processing'`.
- Quản lý vòng đời (Lifecycle & Cleanup):
  - Khi người dùng bấm xóa thumbnail ảnh đang tải: gọi `item.abortController?.abort()`.
  - Khi người dùng bấm nút Quay lại (Back) hoặc rời khỏi màn hình đặt việc: abort toàn bộ các tác vụ đang tải dở dang và tự động xóa bản nháp (reset draft), giúp người dùng khi vào lại dịch vụ sẽ có một phiên đặt mới sạch sẽ, không bị giữ lại ảnh cũ từ phiên đã thoát. Khi người dùng bấm "Tiếp tục" sang các bước sau, bản nháp và các URL ảnh đã tải thành công vẫn được bảo lưu trọn vẹn.

### 3.3. Giao diện Thumbnail & Overlay tiến độ
- Trên từng thumbnail ảnh (kích thước khoảng 72x72 hoặc 80x80):
  - Lớp overlay mờ đen `bg-black/40` bán trong suốt khi đang tải.
  - Trạng thái `uploading`: Hiển thị vòng tròn SVG / ActivityIndicator kèm con số `%` rõ ràng ở giữa.
  - Trạng thái `processing`: Hiển thị spinner và nhãn chữ "Đang xử lý".
  - Trạng thái `completed`: Ẩn overlay, hiển thị biểu tượng checkmark xanh nhỏ ở góc hoặc nút xóa ảnh `X`.
  - Thêm đầy đủ thuộc tính `accessibilityLabel` (ví dụ: `accessibilityLabel="Ảnh 1, đang tải 45%"`).

---

## 4. Kế hoạch kiểm thử & Nghiệm thu

### Ca kiểm thử bắt buộc
1. **Một ảnh đơn lẻ:** Chọn 1 ảnh -> thấy vòng tròn tiến độ tăng dần -> "Đang xử lý" -> thành công -> hiển thị ảnh và URL.
2. **Nhiều ảnh (tuần tự):** Chọn 3 ảnh cùng lúc -> ảnh 1 tải, ảnh 2 và 3 ở trạng thái chờ -> lần lượt từng ảnh hoàn tất.
3. **Giới hạn số lượng:** Thử chọn quá 5 ảnh -> hiển thị cảnh báo không vượt quá 5 ảnh.
4. **Mạng chậm / Spinner vô định:** Giả lập không có `event.total` -> hiển thị spinner mượt mà, không crash hoặc hiển thị NaN%.
5. **Đạt 100% trước response:** Đạt 100% byte -> hiển thị "Đang xử lý" -> không hiển thị hoàn tất giả trước khi API trả 200 OK.
6. **Lỗi mạng giữa chừng:** Ngắt kết nối khi đang tải ảnh 2 -> ảnh 2 báo lỗi bằng tiếng Việt, không cho bấm "Tiếp tục", các ảnh 1 đã xong vẫn giữ nguyên.
7. **Hủy thao tác xóa ảnh:** Bấm nút xóa trên ảnh đang tải 50% -> tác vụ HTTP bị hủy ngay lập tức, thumbnail biến mất.
8. **Rời màn hình khi đang tải:** Bấm nút Back quay lại khi đang tải -> không văng lỗi crash ứng dụng ("Can't perform a React state update on an unmounted component").

### Lệnh chạy test liên quan
```bash
cd mobile
pnpm test orders.api.test.ts
pnpm test customer-orders.test.tsx
```

---

## 5. Checklist thực hiện

- [x] Mở rộng interface và hàm `OrdersApi.uploadImage` với `UploadImageOptions` (`onProgress`, `signal`).
- [x] Viết unit test cho `OrdersApi.uploadImage` trong `orders.api.test.ts` (test progress callback và abort signal).
- [x] Cập nhật state quản lý ảnh trong `customer-booking-screen.tsx` sang dạng `BookingImageItem[]`.
- [x] Thiết kế component Thumbnail Overlay (vòng tròn tiến độ, %, "Đang xử lý").
- [x] Cài đặt logic upload tuần tự và xử lý abort khi xóa ảnh hoặc unmount màn hình.
- [x] Ràng buộc vô hiệu hóa nút "Tiếp tục" khi chưa tải xong.
- [x] Chạy test `pnpm test` và kiểm tra typecheck `pnpm typecheck`.

