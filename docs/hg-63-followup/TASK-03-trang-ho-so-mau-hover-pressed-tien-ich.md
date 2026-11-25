# TASK-03: Trang hồ sơ - Bỏ hẳn màu khi nhấn/giữ (Active State) các tiện ích

## 1. Mục tiêu & Hiện tượng
- **Hiện trạng:**
  - Tại trang Hồ sơ khách hàng (`CustomerProfileScreen`) và Cài đặt (`CustomerSettingsScreen`), các mục tiện ích như *Phương thức thanh toán*, *Lịch sử giao dịch*, *Địa chỉ đã lưu*, *Cài đặt ứng dụng*, *Đổi mật khẩu*, *Trung tâm hỗ trợ* hiện đang dùng class màu nền khi nhấn giữ:
    `active:bg-amber-50/80 dark:active:bg-amber-950/30`
  - Hiệu ứng đổi màu nền này gây cảm giác chói, không tự nhiên và làm mất tính liền mạch của card thông tin.
- **Yêu cầu cập nhật:**
  - **Bỏ hoàn toàn màu nền khi nhấn giữ:** Khi người dùng chạm, bấm hoặc nhấn giữ các mục tiện ích, **không đổi màu nền (không có màu nền active)**, giữ nguyên nền trắng/đen tự nhiên của thẻ cha.
  - Xóa bỏ triệt để các class `active:bg-...` trên các thẻ `Pressable` của nhóm tiện ích.
  - Đồng bộ giữa trang Hồ sơ (`customer-profile-screen.tsx`) và trang Cài đặt (`customer-settings-screen.tsx`).

---

## 2. Các file ảnh hưởng chính
- `mobile/src/features/profile/customer/screens/customer-profile-screen.tsx`:
  - Mục *Phương thức thanh toán* (`profile-payment-item`)
  - Mục *Lịch sử giao dịch*
  - Mục *Địa chỉ đã lưu*
  - Mục *Cài đặt ứng dụng* (`profile-setting-item`)
  - Mục *Đổi mật khẩu* (`profile-change-password-btn`)
  - Mục *Trung tâm hỗ trợ*
- `mobile/src/features/profile/customer/screens/customer-settings-screen.tsx`:
  - Mục *Đổi mật khẩu* và các item thiết lập.
- `mobile/src/features/profile/customer/__tests__/customer-settings-screen.test.tsx`:
  - Cập nhật test case: Bỏ assertion `toContain('active:bg-amber-50/80')` hoặc kiểm tra không còn class `active:bg-amber`.

---

## 3. Các bước thực hiện kỹ thuật
1. **Loại bỏ className active background:**
   - Trong `customer-profile-screen.tsx`:
     - Xóa `active:bg-amber-50/80 dark:active:bg-amber-950/30` khỏi tất cả các `Pressable` tiện ích.
     - Ví dụ:
       ```tsx
       // Trước:
       className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-amber-50/80 dark:border-neutral-800 dark:active:bg-amber-950/30"
       // Sau:
       className="flex-row items-center justify-between border-b border-neutral-100 p-4 dark:border-neutral-800"
       ```
   - Trong `customer-settings-screen.tsx`:
     - Xóa tương tự trên các nút item cài đặt và đổi mật khẩu.

2. **Giữ nguyên các thuộc tính khác:**
   - Giữ nguyên bố cục flex, padding (`p-4`), đường viền chia dòng (`border-b border-neutral-100 dark:border-neutral-800`).
   - Giữ nguyên màu sắc và icon riêng biệt của từng chức năng.

3. **Cập nhật Unit Test:**
   - Điều chỉnh file test `customer-settings-screen.test.tsx`:
     - Đảm bảo kiểm tra các nút vẫn nhấn được bình thường và không còn chứa class `active:bg-amber`.

---

## 4. Kịch bản kiểm thử (Test Cases)
- [x] Mở tab Hồ sơ trên ứng dụng.
- [x] Nhấn và giữ lần lượt các mục:
  - Phương thức thanh toán
  - Lịch sử giao dịch
  - Địa chỉ đã lưu
  - Cài đặt ứng dụng
  - Đổi mật khẩu
  - Trung tâm hỗ trợ
- [x] Quan sát: **Hoàn toàn không có màu nền đổi khi nhấn giữ**, nền thẻ giữ nguyên đồng nhất.
- [x] Kiểm tra trên cả chế độ Sáng (Light Mode) và chế độ Tối (Dark Mode).
- [x] Chạy `pnpm test customer-settings-screen.test.tsx` pass 100%.
