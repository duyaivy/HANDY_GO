# HƯỚNG DẪN CHUYỂN ĐỔI SANG API BACKEND THỰC TẾ (REAL API INTEGRATION GUIDE)

> **Tài liệu lịch sử — phần bên dưới không phải hợp đồng API hiện tại.** Source ngày 27/09/2026 gọi backend thật, không có chế độ dummyjson/OTP cố định được mô tả ở đây. Base URL cần `/api/v1`, và logout gửi `refreshToken` trong body. Dùng [hướng dẫn chạy Metro](../docs/HUONG_DAN_BUILD_VA_CHAY.md) và đối chiếu [AuthApi hiện tại](src/services/auth/auth-api.ts) khi tích hợp. Giữ nội dung cũ bên dưới để tham khảo lịch sử chuyển đổi.

Tài liệu này ghi chú chi tiết cách hệ thống Mobile chuyển đổi từ chế độ **Mock API** sang **Backend API thực tế** (NestJS Microservices), đảm bảo việc tích hợp diễn ra trơn tru mà không cần viết lại mã nguồn.

---

## 1. Cơ chế Chuyển đổi Tự động (Zero-Code Switch)

Trong mã nguồn [`src/services/auth/auth-api.ts`](file:///d:/school/PBL6/HANDY_GO/mobile/src/services/auth/auth-api.ts), chế độ Mock được kiểm soát tự động thông qua biến môi trường:

```typescript
const isMockMode = !Env.EXPO_PUBLIC_API_URL || Env.EXPO_PUBLIC_API_URL.includes('dummyjson.com');
```

- **Khi `EXPO_PUBLIC_API_URL` trỏ vào `dummyjson.com` (hoặc để trống):**
  - Chế độ Mock tự động kích hoạt.
  - Phản hồi dữ liệu mẫu, mã OTP `123456`, mô phỏng độ trễ mạng thực tế 400ms.
- **Khi `EXPO_PUBLIC_API_URL` trỏ vào URL Backend thật:**
  - `isMockMode` tự động chuyển thành `false`.
  - Mọi hàm trong `AuthApi` sẽ gọi trực tiếp đến Backend thật thông qua [`ApiClient`](file:///d:/school/PBL6/HANDY_GO/mobile/src/services/api/api-client.ts).

---

## 2. Bảng Đối chiếu Endpoints (Mobile Client vs NestJS Backend)

Mã nguồn Mobile đã được xây dựng khớp 100% với hợp đồng API của `auth-service` trên Backend:

| Chức năng | Phương thức & Route trên Backend | Payload DTO (Mobile gửi lên) | Phản hồi từ Backend | Trạng thái tích hợp |
| :--- | :--- | :--- | :--- | :--- |
| **Đăng ký tài khoản** | `POST /auth/register` | `{ fullName, phone, email, password }` | `{ statusCode: 201, data: { userId, phone, email, ... } }` | Khớp 100% |
| **Xác thực OTP** | `POST /auth/verify-email` | `{ email, phone, otp }` | `{ statusCode: 200, data: { user, accessToken, refreshToken } }` | Khớp 100% |
| **Gửi lại mã OTP** | `POST /auth/resend-otp` | `{ email, phone }` | `{ statusCode: 200, message: '...' }` (áp dụng cooldown 60s) | Khớp 100% |
| **Đăng nhập** | `POST /auth/login` | `{ phone, password }` | `{ statusCode: 200, data: { user, accessToken, refreshToken } }` | Khớp 100% |
| **Làm mới Token** | `POST /auth/refresh` | `{ refreshToken }` | `{ statusCode: 200, data: { accessToken, refreshToken, expiresIn } }` | Đã có hàng đợi 401 tự động |
| **Đăng xuất** | `POST /auth/logout` | *(Bearer Access Token)* | `{ statusCode: 200 }` | Khớp 100% |
| **Thông tin cá nhân** | `GET /auth/me` | *(Bearer Access Token)* | `{ statusCode: 200, data: AuthUser }` | Dùng khi app khởi động (`hydrate`) |

---

## 3. Các bước kết nối khi Backend sẵn sàng

Khi bạn khởi động xong Backend (Docker Compose / NestJS API Gateway):

### Bước 1: Cấu hình `mobile/.env`
Cập nhật biến `EXPO_PUBLIC_API_URL` trỏ tới địa chỉ của Backend:

- **Nếu dùng Android Emulator:**
  ```env
  EXPO_PUBLIC_API_URL=http://10.0.2.2:3000
  ```
- **Nếu dùng điện thoại thật cắm cáp USB (đang dùng):**
  Chạy lệnh reverse port của Backend:
  ```powershell
  adb reverse tcp:3000 tcp:3000
  ```
  Và cấu hình `.env`:
  ```env
  EXPO_PUBLIC_API_URL=http://localhost:3000
  ```
- **Nếu dùng điện thoại qua cùng mạng WiFi:**
  ```env
  EXPO_PUBLIC_API_URL=http://192.168.x.x:3000
  ```
- **Nếu triển khai lên Server Staging / Production:**
  ```env
  EXPO_PUBLIC_API_URL=https://api.handygo.vn
  ```

### Bước 2: Khởi động lại Metro Bundler
Sau khi sửa `.env`, khởi động lại Metro để nạp biến môi trường mới:
```powershell
pnpm exec expo start -c
```

---

## 4. Danh sách dọn dẹp khi lên Production (Cleanup Checklist)

Khi chuẩn bị đóng gói bản phát hành chính thức (Release Build), bạn chỉ cần dọn dẹp các điểm sau:

- [ ] **Gỡ bỏ nút Demo Bypass trên giao diện:**
  - File: [`src/features/auth/screens/login-screen.tsx`](file:///d:/school/PBL6/HANDY_GO/mobile/src/features/auth/screens/login-screen.tsx)
  - Đoạn code: Khối `<View className="mt-4 border-t ...">` chứa 2 nút *"Vào Khách mẫu"* và *"Vào Thợ mẫu"*.
- [ ] **Xóa fallback mã OTP cứng:**
  - File: [`src/features/auth/screens/otp-verification-screen.tsx`](file:///d:/school/PBL6/HANDY_GO/mobile/src/features/auth/screens/otp-verification-screen.tsx)
  - Đoạn code: Nhánh fallback `if (otp.trim() === '123456')` trong `catch (err)`.
- [ ] **Chuyển hướng trang chủ khởi động:**
  - Thay vì hiển thị `BaseDemoScreen` (màn hình giới thiệu kiến trúc), cấu hình điều hướng mặc định chuyển người dùng chưa đăng nhập về `/login` và người dùng đã đăng nhập về `/customer` hoặc `/worker`.
- [ ] **Dọn dẹp mã giả lập trong `auth-api.ts` (Tùy chọn):**
  - Xóa bỏ các khối `if (isMockMode) { ... }` trong [`src/services/auth/auth-api.ts`](file:///d:/school/PBL6/HANDY_GO/mobile/src/services/auth/auth-api.ts) để code gọn gàng, chỉ giữ lại các lệnh gọi `ApiClient`.
