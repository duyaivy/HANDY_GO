# TASK-06: Màn hình đặt thợ - Sửa lỗi tự động đổi tên đơn hàng và mô tả

## 1. Mục tiêu & Hiện tượng
- **Hiện trạng:**
  - Trong luồng tạo đơn đặt việc / đặt thợ ngay (`/customer/booking`), người dùng gặp hiện tượng:
    1. **Tên đơn hàng tự động bị đổi:** Chọn dịch vụ cụ thể (ví dụ: *Sửa máy giặt*, *Sửa tivi*, *Sửa ống nước*...), nhưng khi vào màn hình hoặc chuyển bước, tên đơn bị reset hoặc tự động đổi thành `"Dịch vụ tiện ích"` hoặc `"Tôi cần người dịch vụ tiện ích"`.
    2. **Mô tả đơn hàng bị ghi đè:** Người dùng đã tự tay nhập mô tả chi tiết sự cố trong ô `TextInput`, nhưng khi nhấn vào các chip gợi ý (Sự cố / Vị trí / Mức độ) hoặc nhấn tiếp tục, toàn bộ mô tả đã gõ bị xóa trắng hoặc bị thay thế bằng chuỗi tự sinh tự động.
- **Yêu cầu:**
  - **Giữ nguyên 100% tên dịch vụ** đã chọn từ danh mục ban đầu, không được để fallback đè về "Dịch vụ tiện ích".
  - **Bảo toàn mô tả người dùng tự gõ:** Khi người dùng bấm chip gợi ý, nội dung gợi ý phải được ghép nối thông minh (append) vào mô tả hiện tại chứ không được ghi đè (overwrite). Nếu người dùng đã gõ mô tả riêng, không được tự ý thay thế khi ấn "Tiếp tục".

---

## 2. Nguyên nhân gốc (Root Cause)
1. **Reset tên dịch vụ trong `CustomerBookingScreen`:**
   - Trong `customer-booking-screen.tsx`:
     ```ts
     const targetServiceName = React.useMemo(() => {
       const raw = searchParams?.serviceName;
       return Array.isArray(raw) ? raw[0] : raw;
     }, [searchParams?.serviceName]);
     ```
   - Khi điều hướng từ các màn hình danh mục hoặc chi tiết dịch vụ (`service-detail-screen.tsx`, `category-screen.tsx`), route param chỉ truyền `{ serviceId }` mà không truyền `serviceName`.
   - Kết quả: `targetServiceName` nhận giá trị `undefined`. Khi hàm `store.setService(targetServiceId, targetServiceName)` chạy trong `useBookingDraftStore.ts`, do `serviceName` mặc định là `'Dịch vụ tiện ích'`, nên tên dịch vụ chuẩn bị ghi đè thành `'Dịch vụ tiện ích'`.
2. **Logic chip gợi ý ghi đè mô tả trong `handleSelectChip`:**
   - Hàm `handleSelectChip` tính toán:
     ```ts
     const newText = parts.length > 0 ? `${parts.join(' - ')}. Cần thợ kiểm tra và xử lý sớm.` : '';
     if (newText) {
       setDescription(newText); // Xóa sạch description người dùng đã gõ trước đó!
     }
     ```
3. **Logic nút Tiếp tục (`handleNext`):**
   - Trong `handleNext`:
     ```ts
     if (!description.trim()) {
       setDescription(generateQuickDescription(serviceName));
     }
     ```
   - Nếu `serviceName` bị rỗng hoặc là `'Dịch vụ tiện ích'`, chuỗi mô tả sẽ bị gán thành `"Tôi cần người dịch vụ tiện ích"`.
4. **Phân tích ngược tên dịch vụ từ mô tả (Regex Drift):**
   - Ở trang danh sách đơn (`customer-orders-screen.tsx`), hàm `getRequestServiceTitle` cố gắng dùng regex cắt chuỗi `"Tôi cần người..."` để đoán tên dịch vụ. Khi chuỗi mô tả bị sai lệch, tên hiển thị trên danh sách đơn cũng bị sai lệch theo.

---

## 3. Các file ảnh hưởng chính
- `mobile/src/features/orders/customer/screens/customer-booking-screen.tsx`:
  - `targetServiceName`: Tra cứu từ danh mục nếu `searchParams` chỉ có `serviceId`.
  - `handleSelectChip`: Ghép chuỗi thông minh thay vì ghi đè `description`.
  - Không tự ý thay đổi mô tả nếu người dùng đã có nội dung hợp lệ.
- `mobile/src/features/orders/stores/use-booking-draft-store.ts`:
  - Hàm `setService`: Không ghi đè `serviceName` hiện tại bằng giá trị mặc định nếu tham số truyền vào là `undefined`.
- `mobile/src/features/catalog/screens/service-detail-screen.tsx`:
  - Đảm bảo truyền cả `serviceName` trong navigation params khi nhấn "Đặt ngay".
- `mobile/src/app/customer/booking/summary.tsx`:
  - Bảo toàn tên dịch vụ và mô tả khi gửi lên API `OrdersApi.createRequest`.

---

## 4. Các bước thực hiện kỹ thuật
1. **Bảo vệ `serviceName` trong Store:**
   ```ts
   setService: (serviceId: string, serviceName?: string) =>
     set(state => ({
       serviceId,
       serviceName: serviceName || (serviceId ? KNOWN_SERVICES_BY_ID[serviceId] : state.serviceName) || 'Dịch vụ tiện ích',
     })),
   ```
   - Nhờ đó, nếu chỉ có `serviceId` (ví dụ ID sửa máy giặt), hệ thống vẫn tự tra ra đúng tên "Sửa máy giặt".

2. **Sửa `handleSelectChip` để không xóa mô tả tự gõ:**
   - Khi người dùng bấm chip, chỉ cập nhật phần tiền tố hoặc bổ sung thông tin vào mô tả:
   - Nếu người dùng đã gõ văn bản riêng, giữ nguyên phần văn bản đó và chỉ thêm gợi ý vào cuối.

3. **Truyền đầy đủ thông tin khi điều hướng:**
   - Trong `service-detail-screen.tsx` và `category-screen.tsx`:
     ```ts
     router.push({
       pathname: RouteNames.CUSTOMER_BOOKING,
       params: { serviceId, serviceName: service.name },
     });
     ```

---

## 5. Kịch bản kiểm thử (Test Cases)
- [x] Chọn dịch vụ "Sửa máy giặt" từ trang chủ/danh mục -> Chuyển sang màn hình đặt thợ.
- [x] Tên dịch vụ trên giao diện hiển thị đúng "Sửa máy giặt" (không bị thành "Dịch vụ tiện ích").
- [x] Gõ mô tả: "Máy bị kêu to và không vắt được".
- [x] Chọn chip: "Vị trí: Nhà tắm", "Mức độ: Nặng".
- [x] Kiểm tra: Mô tả đã gõ không bị mất.
- [x] Nhấn "Tiếp tục" qua các bước -> Màn hình Xác nhận (Summary) và Radar hiển thị đúng tên dịch vụ và đúng mô tả đã nhập.

