# TASK-07: Loading khi chuyển giữa app khách và thợ

- **Mục yêu cầu:** Mục 7 (HG-63)
- **Giai đoạn:** Giai đoạn 3
- **Độ ưu tiên:** Cao
- **Trạng thái:** Hoàn thành

---

## 1. Mục tiêu & Phạm vi

### Mục tiêu
Cung cấp trải nghiệm chuyển đổi mượt mà, phản hồi ngay lập tức bằng màn hình/overlay loading khi người dùng chuyển qua lại giữa chế độ Khách hàng (Customer) và Thợ (Worker). Khắc phục triệt để lỗi gọi điều hướng trùng lặp (duplicate navigation) và loại bỏ hiện tượng treo màn hình hoặc mất phản hồi.

### Phạm vi chốt
- **Bao gồm:**
  - Gom luồng điều hướng chế độ vào một hook/hàm duy nhất: `useAppModeSwitch` hoặc tương đương.
  - Cập nhật component thẻ chuyển: `mobile/src/features/profile/components/app-switch-card.tsx`.
  - Màn hình profile khách và thợ: `customer-profile-screen.tsx`, `worker-profile-screen.tsx`, `customer-switch-to-worker-screen.tsx`.
  - Thành phần hiển thị overlay ở cấp root layout: `mobile/src/app/_layout.tsx`.
- **Ngoại trừ:** Không can thiệp vào logic cấp quyền vai trò (Role-based access control) trong JWT/Session hiện có của `useAuthStore`.

---

## 2. Hiện trạng & Bằng chứng mã nguồn

### Bằng chứng 1: Điều hướng trùng lặp trong `app-switch-card.tsx`
Trong `mobile/src/features/profile/components/app-switch-card.tsx`:
```tsx
// Khi chuyển sang Worker (dòng 33-37):
const handleSwitchToWorker = () => {
  useAuthStore.getState().setActiveMode('Worker');
  onSwitch?.('Worker'); // <-- Gọi callback của màn hình cha (màn hình cha lại gọi router.replace)
  router.replace(RouteNames.WORKER_HOME as any); // <-- Bản thân card lại tự gọi router.replace lần nữa!
};

// Khi chuyển sang Customer (dòng 86-90):
const handleSwitchToCustomer = () => {
  useAuthStore.getState().setActiveMode('Customer');
  onSwitch?.('Customer'); // <-- Gọi callback màn hình cha
  router.replace(RouteNames.CUSTOMER_HOME as any); // <-- Lại gọi router.replace!
};
```
*Hậu quả:* Router nhận 2 lệnh điều hướng gần như đồng thời, gây ra lỗi giật màn hình (flicker), cảnh báo duplicate key trong React Navigation, hoặc điều hướng sai lịch sử.

### Bằng chứng 2: Trải nghiệm loading bị ngắt quãng
- Trước đây loading indicator chỉ nằm cục bộ trong màn hình Profile. Khi router bắt đầu chuyển trang (`router.replace`), màn hình Profile bị unmount ngay lập tức khiến loading biến mất, màn hình đích chưa kịp render xong gây ra khoảng trắng (blank frame) từ 500ms - 2s trên các máy chậm.

---

## 3. Thiết kế giải pháp kỹ thuật

### 3.1. Gom đầu mối chuyển chế độ (Single Source of Truth)
1. **Loại bỏ tự ý điều hướng trong `AppSwitchCard`:**
   - `AppSwitchCard` chỉ đóng vai trò hiển thị UI. Khi bấm chuyển, component chỉ gọi prop callback `onSwitch?.(targetMode)` và **tuyệt đối không tự gọi `router.replace`**.
2. **Xây dựng Hook chuyển chế độ an toàn (`useAppModeSwitch`):**
   ```typescript
   export function useAppModeSwitch() {
     const router = useRouter();
     const [isSwitching, setIsSwitching] = useState(false);
     const [switchError, setSwitchError] = useState<string | null>(null);

     const switchToMode = async (targetMode: 'Customer' | 'Worker') => {
       // 1. Kiểm tra điều kiện & quyền (VD: thợ đã KYC/đủ vai trò chưa)
       // 2. Kích hoạt Root Overlay Loading
       // 3. Cập nhật activeMode trong useAuthStore
       // 4. Gọi router.replace ĐÚNG MỘT LẦN duy nhất
     };

     return { switchToMode, isSwitching, switchError };
   }
   ```

### 3.2. Hiển thị Root Loading Overlay
1. **Vị trí đặt Overlay:** Đặt ở cấp cao nhất trong `mobile/src/app/_layout.tsx` (ngay trên Stack navigator) để overlay tồn tại xuyên suốt quá trình unmount màn hình cũ và mount màn hình mới.
2. **Không lưu vào Persistent Storage:** Trạng thái `isModeSwitching` chỉ tồn tại trong bộ nhớ RAM (in-memory state/Zustand store). Tuyệt đối **không lưu vào AsyncStorage** để tránh trường hợp crash app khi mở lại bị kẹt ở màn hình loading vĩnh viễn.
3. **Giao diện Overlay:**
   - Nền mờ nhẹ làm tối màn hình (`bg-black/60` hoặc `backdrop-blur-sm`).
   - Spinner/ActivityIndicator màu Amber hoặc Blue theo chế độ đích.
   - Text thông báo rõ ràng bằng tiếng Việt: *"Đang chuyển sang giao diện Thợ..."* hoặc *"Đang chuyển sang giao diện Khách hàng..."*.
   - Khóa toàn bộ tương tác chạm màn hình để ngăn chặn người dùng bấm liên tục (Spam click).

### 3.3. Thời điểm tắt Loading & Cơ chế Watchdog 10 giây
1. **Khi nào tắt loading?**
   - Không đợi tất cả API dữ liệu trang chủ tải xong (trang đích tự hiển thị skeleton/loading nội dung riêng).
   - Tắt overlay ngay khi màn hình đích kích hoạt sự kiện **Focus** và thực hiện xong lần vẽ đầu tiên (`onLayout`).
2. **Cơ chế Watchdog Timeout (10 giây):**
   - Khởi tạo một bộ đếm thời gian 10 giây khi bắt đầu chuyển mode.
   - Nếu sau 10 giây mà màn hình đích vẫn chưa gửi tín hiệu sẵn sàng (do lỗi crash ngầm hoặc lỗi router):
     - **Không tự động coi là thành công.**
     - Chuyển giao diện overlay sang trạng thái cảnh báo lỗi: *"Không thể chuyển ứng dụng vào lúc này. Vui lòng thử lại."*.
     - Cung cấp 2 nút bấm cho người dùng:
       - **Thử lại:** Kích hoạt lại lệnh điều hướng.
       - **Quay về:** Hoàn tác mode cũ và tắt overlay.

---

## 4. Kế hoạch kiểm thử & Nghiệm thu

### Ca kiểm thử bắt buộc
1. **Chuyển 2 chiều thành công:**
   - Từ Khách hàng -> Thợ: Bấm chuyển -> Overlay loading hiện ra ngay lập tức -> Chuyển sang Home Thợ mượt mà -> Loading tắt.
   - Từ Thợ -> Khách hàng: Bấm chuyển -> Overlay hiện ra -> Chuyển sang Home Khách -> Loading tắt.
2. **Chặn bấm liên tục (Spam Click):** Bấm nút chuyển nhiều lần thật nhanh -> Chỉ nhận 1 lần bấm, nút bị disable ngay tức khắc, chỉ có 1 router event được gửi đi.
3. **Tài khoản thiếu quyền (Customer chưa có role Worker):** Bấm chuyển sang Thợ -> Điều hướng tới màn hình đăng ký/giới thiệu thợ (`CUSTOMER_SWITCH_TO_WORKER`), không kích hoạt mode Worker lậu.
4. **Chế độ Guest:** Chuyển qua lại giữa guest Khách và guest Thợ hoạt động trơn tru.
5. **Đồng hồ Watchdog:** Giả lập router bị kẹt quá 10s -> Overlay hiển thị thông báo lỗi và 2 lựa chọn Thử lại / Quay về, không bị treo app vĩnh viễn.

### Lệnh chạy test liên quan
```bash
cd mobile
pnpm test app-mode-switch-integration.test.tsx
pnpm test customer-profile-screen.test.tsx
pnpm test worker-profile-screen.test.tsx
```

---

## 5. Checklist thực hiện

- [x] Xóa bỏ lệnh `router.replace` thừa bên trong `app-switch-card.tsx`, chỉ giữ callback.
- [x] Xây dựng hoặc hoàn thiện hook chuyển đổi `useAppModeSwitch`.
- [x] Tích hợp Root Overlay Loading tại `mobile/src/app/_layout.tsx`.
- [x] Cài đặt sự kiện tắt loading khi màn hình đích focus.
- [x] Cài đặt timeout an toàn 10s (Watchdog) với thông báo lỗi và nút quay lại.
- [x] Cập nhật unit test trong `app-mode-switch-integration.test.tsx` và `app-mode-switch-flow.test.tsx`.
- [x] Chạy `pnpm test` và `pnpm typecheck`.

