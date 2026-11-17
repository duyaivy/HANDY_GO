# TASK-08: Đổi màu hover/pressed trang cài đặt cá nhân

- **Mục yêu cầu:** Mục 8 (HG-63)
- **Giai đoạn:** Giai đoạn 4
- **Độ ưu tiên:** Thấp - Trung bình
- **Trạng thái:** Hoàn thành

---

## 1. Mục tiêu & Phạm vi

### Mục tiêu
Thay thế màu nền xám mặc định khi người dùng chạm (pressed trên thiết bị di động) hoặc rê chuột (hover trên web preview) vào các dòng tùy chọn trong màn hình Cài đặt cá nhân của khách hàng bằng màu vàng hổ phách (Amber) thương hiệu nhẹ nhàng, giúp tăng tính thẩm mỹ và cảm giác phản hồi tương tác (tactile feedback) đồng bộ với toàn bộ ứng dụng.

### Phạm vi chốt
- **Bao gồm:** Màn hình Cài đặt khách hàng: `mobile/src/features/profile/customer/screens/customer-settings-screen.tsx`.
- **Ngoại trừ:**
  - Cài đặt của thợ (`worker-settings`): Hiện là placeholder, giữ nguyên theo quyết định đã chốt, không mở rộng tính năng mới trong HG-63.
  - Các nút hành động cảnh báo / nguy hiểm (như "Đăng xuất" hoặc "Xóa tài khoản"): Bắt buộc giữ nguyên màu đỏ cảnh báo (`red-500` / `active:bg-red-50`), không đổi sang màu amber.
  - Trạng thái vô hiệu hóa (disabled state) và đường viền chỉ thị tiêu điểm bàn phím (focus ring) giữ nguyên theo chuẩn accessibility.

---

## 2. Hiện trạng & Bằng chứng mã nguồn

Trong file `mobile/src/features/profile/customer/screens/customer-settings-screen.tsx`:
- Các dòng menu cài đặt (Đổi mật khẩu, Thông báo, Ngôn ngữ, Điều khoản dịch vụ, v.v.) hiện đang áp dụng màu xám trung tính:
  ```tsx
  className="flex-row items-center justify-between border-b border-neutral-100 p-3.5 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800/50"
  ```
- Màu `neutral-50` và `neutral-800/50` trông xám đục, không ăn khớp với tông màu chủ đạo vàng cam (Amber #F5A524) của tài khoản Khách hàng.

---

## 3. Thiết kế giải pháp kỹ thuật

### 3.1. Bảng màu tương tác chuẩn hóa

Áp dụng bảng màu tương tác theo quy chuẩn thiết kế:

| Trạng thái | Nền sáng (Light Mode) | Nền tối (Dark Mode) | Ghi chú |
|---|---|---|---|
| **Mặc định** | Nền trong suốt (`bg-transparent`) hoặc trắng (`bg-white`) | Nền trong suốt hoặc đen (`dark:bg-neutral-900`) | Trạng thái bình thường |
| **Pressed / Touch** (Mobile) | `active:bg-amber-50/80` | `dark:active:bg-amber-950/30` | Nhấn ngón tay trên màn hình |
| **Hover** (Web preview / Chuột) | `hover:bg-amber-50/50` | `dark:hover:bg-amber-950/20` | Rê chuột trên web preview |
| **Nút Nguy hiểm** (Đăng xuất) | `active:bg-red-50 dark:active:bg-red-950/30` | `active:bg-red-950/30` | Giữ nguyên màu đỏ cảnh báo |
| **Focus** (Bàn phím) | `focus:ring-2 focus:ring-amber-500` | `dark:focus:ring-amber-400` | Chuẩn Accessibility |

### 3.2. Cập nhật chi tiết trong `customer-settings-screen.tsx`
Thay thế các lớp class Tailwind trên từng dòng `Pressable` / menu item:
```tsx
// Trước:
className="flex-row items-center justify-between border-b border-neutral-100 p-3.5 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800/50"

// Sau:
className="flex-row items-center justify-between border-b border-neutral-100 p-3.5 active:bg-amber-50/80 dark:border-neutral-800 dark:active:bg-amber-950/30"
```

- **Lưu ý tương phản:** Đảm bảo khi nhấn xuống, màu nền amber nhạt không làm chìm hoặc khó đọc các icon và chữ tiêu đề bên trong.

---

## 4. Kế hoạch kiểm thử & Nghiệm thu

### Ca kiểm thử bắt buộc
1. **Chạm trên màn hình sáng (Light Mode):** Chạm tay giữ vào dòng "Đổi mật khẩu" hoặc "Thông báo" -> Vùng hàng đổi sang màu vàng hổ phách nhạt nhẹ nhàng, nhấc tay ra quay về bình thường.
2. **Chạm trên màn hình tối (Dark Mode):** Bật Dark Mode -> Chạm giữ -> Vùng hàng đổi sang màu amber sẫm (`dark:active:bg-amber-950/30`), dịu mắt và hài hòa.
3. **Kiểm tra nút "Đăng xuất":** Nhấn vào dòng "Đăng xuất" -> Màu phản hồi vẫn là màu đỏ nhạt (`red-50`), không bị chuyển thành màu vàng.
4. **Kiểm tra điều hướng:** Nhấn vào từng mục -> Vẫn kích hoạt chuyển trang tới đúng màn hình tương ứng (Đổi mật khẩu, Điều khoản...) bình thường.

---

## 5. Checklist thực hiện

- [x] Cập nhật các dòng menu cài đặt trong `customer-settings-screen.tsx` sang `active:bg-amber-50/80 dark:active:bg-amber-950/30`.
- [x] Xác nhận các mục nguy hiểm (Đăng xuất) vẫn dùng màu đỏ.
- [x] Kiểm tra trực quan trên cả 2 giao diện Sáng (Light) và Tối (Dark).
- [x] Chạy `pnpm typecheck` và `pnpm lint`.

