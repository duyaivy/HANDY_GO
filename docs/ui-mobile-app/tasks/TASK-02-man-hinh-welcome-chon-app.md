# TASK-02: Sửa giao diện chọn ứng dụng ban đầu (Welcome Screen)

- **Mục yêu cầu:** Mục 2 (HG-63)
- **Giai đoạn:** Giai đoạn 4
- **Độ ưu tiên:** Trung bình
- **Trạng thái:** Hoàn thành

---

## 1. Mục tiêu & Phạm vi

### Mục tiêu
Cải tiến màn hình chào mừng / chọn ứng dụng ban đầu (`welcome-screen.tsx`) để người dùng dễ dàng nhận diện và chọn vai trò "Khách hàng" hoặc "Thợ", giao diện trực quan, rõ ràng trạng thái được chọn, không bị cắt xén nội dung trên các thiết bị màn hình nhỏ hoặc khi người dùng cài đặt cỡ chữ lớn (Dynamic Type).

### Phạm vi chốt
- **Bao gồm:** Tái cấu trúc layout trong `mobile/src/features/auth/screens/welcome-screen.tsx` và route `mobile/src/app/welcome.tsx`.
- **Giữ nguyên:**
  - Nhận diện thương hiệu đã chốt: tông màu **Amber (#F5A524)** cho Khách hàng, tông màu **Blue (#0284C7 / #2563EB)** cho Thợ.
  - Logic xác định vai trò `selectedRole` ('Customer' | 'Worker') và luồng lưu trữ vai trò vào `useAuthStore`.
  - Cơ chế điều hướng hiện hữu (chọn khách hàng dẫn đến trang khách, chọn thợ dẫn đến trang thợ, hỗ trợ cả tài khoản khách vãng lai Guest).

---

## 2. Hiện trạng & Bằng chứng mã nguồn

1. **`mobile/src/features/auth/screens/welcome-screen.tsx`**:
   - Hiện tại màn hình có bố cục có thể bị tràn hoặc cắt bớt nội dung trên các màn hình có chiều cao hạn chế (như iPhone SE hoặc các dòng Android màn hình nhỏ).
   - Thẻ chọn Khách hàng và Thợ chưa có điểm nhấn trực quan đủ mạnh để phân biệt giữa trạng thái "đang chọn" (selected) và "chưa chọn" (unselected).
   - Một số vùng bấm (touch target) chưa đảm bảo kích thước tiêu chuẩn tối thiểu 44x44 pt theo chuẩn Accessibility của Apple/Google.
   - Chưa xử lý co giãn mượt mà khi người dùng bật chế độ phóng to chữ trong Accessibility settings của hệ điều hành.

2. **`mobile/src/app/__tests__/welcome.test.tsx`**:
   - Bộ test hiện có kiểm tra các hành vi cơ bản, cần được cập nhật và bổ sung các assertions cho accessibility roles, trạng thái selected và luồng điều hướng.

---

## 3. Thiết kế giải pháp kỹ thuật

### 3.1. Tái cấu trúc Layout và Trải nghiệm cuộn
- Đặt nội dung bên trong `Screen` bọc `ScrollView` có `contentContainerStyle={{ flexGrow: 1 }}` và cấu hình `bounces={false}`.
- Bố cục theo chiều dọc (1 cột) từ trên xuống dưới:
  1. **Header / Logo:** Logo HandyGo kèm tiêu đề chào mừng rõ ràng ("Chào mừng bạn đến với HandyGo").
  2. **Subtitle:** Đoạn mô tả ngắn gọn hướng dẫn ("Vui lòng chọn vai trò bạn muốn trải nghiệm").
  3. **Hai thẻ vai trò lớn (Role Cards):**
     - Thẻ 1: **Khách hàng** (Tìm thợ nhanh chóng, sửa chữa tận nơi).
     - Thẻ 2: **Thợ dịch vụ** (Nhận việc linh hoạt, tăng thu nhập).
  4. **Nút "Tiếp tục":** Đặt ở dưới cùng, có khoảng cách an toàn với cạnh dưới màn hình (`safe-area-inset-bottom`).

### 3.2. Thiết kế chi tiết cho Thẻ Vai trò (Role Card)
- **Kích thước & Vùng chạm:** Chiều cao tối thiểu mỗi thẻ từ 90px - 110px, đảm bảo vùng chạm cực kỳ thoải mái (vượt chuẩn 44pt).
- **Trạng thái Chưa chọn (Unselected):**
  - Viền mờ (`border-neutral-200 dark:border-neutral-800`).
  - Nền nhẹ (`bg-neutral-50/50 dark:bg-neutral-900/50`).
  - Icon radio/checkmark ở dạng vòng tròn rỗng không màu.
- **Trạng thái Đang chọn (Selected):**
  - Thẻ Khách hàng: Viền nổi bật màu Amber (`border-2 border-amber-500 bg-amber-50/40 dark:bg-amber-950/20`), biểu tượng checkmark màu vàng hổ phách có nền đầy đủ.
  - Thẻ Thợ: Viền nổi bật màu Xanh dương (`border-2 border-blue-500 bg-blue-50/40 dark:bg-blue-950/20`), biểu tượng checkmark màu xanh dương có nền đầy đủ.
  - Hiệu ứng shadow nhẹ (`shadow-sm`) để tạo chiều sâu giao diện.
- **Accessibility:**
  - `accessibilityRole="radio"` hoặc `"button"`.
  - `accessibilityState={{ selected: selectedRole === 'Customer' }}`.
  - `accessibilityLabel="Vai trò Khách hàng, chạm để chọn"`.

### 3.3. Nút "Tiếp tục" (CTA Button)
- Nút bấm lớn toàn chiều rộng (full width), chiều cao tối thiểu 50pt, bo tròn góc `rounded-full` hoặc `rounded-2xl`.
- Màu nền thay đổi ăn khớp theo vai trò đang chọn (nền Amber nếu chọn Khách, nền Blue nếu chọn Thợ).
- Trạng thái disabled nếu chưa chọn vai trò (nếu có lựa chọn ban đầu là null, hoặc mặc định đã chọn Khách hàng).

---

## 4. Kế hoạch kiểm thử & Nghiệm thu

### Ca kiểm thử bắt buộc
1. **Kiểm tra hiển thị trên thiết bị nhỏ (iPhone SE / Android màn hình nhỏ):** Toàn bộ nội dung hiển thị trọn vẹn; khi cuộn màn hình nội dung không bị vỡ hoặc che khuất nút "Tiếp tục".
2. **Kiểm tra cỡ chữ lớn (Dynamic Type):** Chỉnh font chữ hệ thống lên 150% -> text tự động xuống dòng hợp lý, thẻ tự co giãn chiều cao theo nội dung chữ, không bị tràn chữ ra ngoài thẻ.
3. **Chuyển đổi trạng thái chọn:**
   - Mặc định chọn Khách hàng -> Thẻ khách hàng sáng viền amber kèm dấu check.
   - Bấm sang Thẻ Thợ -> Thẻ khách hàng trở về unselected, thẻ Thợ sáng viền xanh kèm dấu check.
4. **Kiểm tra chế độ Tối (Dark Mode):** Độ tương phản văn bản đạt chuẩn WCAG AA trên nền tối, viền và dấu chọn nhìn rõ ràng.
5. **Điều hướng chính xác:** Bấm "Tiếp tục" khi chọn Khách hàng -> Điều hướng đúng route Khách hàng (`RouteNames.CUSTOMER_HOME` hoặc tương đương); chọn Thợ -> Điều hướng đúng route Thợ.

### Lệnh chạy test liên quan
```bash
cd mobile
pnpm test welcome.test.tsx
```

---

## 5. Checklist thực hiện

- [x] Cập nhật `welcome-screen.tsx`: bọc nội dung trong `ScrollView` có `flexGrow: 1`.
- [x] Bổ sung trạng thái viền và dấu checkmark cho 2 thẻ Khách hàng (Amber) và Thợ (Blue).
- [x] Tối ưu hóa kích thước nút bấm và touch target đạt chuẩn >= 44pt.
- [x] Gắn các thuộc tính accessibility (`accessibilityRole`, `accessibilityState`, `accessibilityLabel`).
- [x] Kiểm tra hiển thị trên Dark Mode và font size lớn.
- [x] Cập nhật assertions trong `welcome.test.tsx`.
- [x] Chạy test `pnpm test welcome.test.tsx` và `pnpm typecheck`.

