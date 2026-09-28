# HƯỚNG DẪN CHẠY TEST DỰ ÁN HANDY GO (BACKEND + MOBILE)

Tài liệu này hướng dẫn chi tiết từng bước cho thành viên trong team cách mở các terminal, chạy các service backend và kết nối điện thoại Android qua USB để kiểm thử (cả test thủ công và test E2E tự động).

---

## I. Chuẩn bị trước khi chạy

### 1. Kiểm tra file cấu hình môi trường Mobile
Đảm bảo đã có file `mobile/.env` với nội dung sau (để điện thoại gọi được backend qua cáp USB thay vì dùng IP máy ảo):

```dotenv
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1
```

> **Lưu ý:** Nếu thiếu file này, app trên điện thoại sẽ tự động gọi vào `10.0.2.2:3000` và báo lỗi **"Không có kết nối mạng"**.

### 2. Thiết lập điện thoại Android
- Cắm cáp USB nối điện thoại với máy tính.
- Bật **USB Debugging** (Gỡ lỗi USB) trong *Developer Options* trên điện thoại.
- Chấp nhận hộp thoại cho phép máy tính gỡ lỗi (Allow USB debugging).

---

## II. Các Terminal cần mở và thứ tự chạy

Để hệ thống hoạt động đầy đủ, bạn cần mở **5 terminal riêng biệt** theo đúng thứ tự dưới đây:

### Terminal 1 — Bật hạ tầng Docker (Database, Queue, Mailpit)
1. Mở ứng dụng **Docker Desktop** trên Windows và chờ nó khởi động hoàn tất (*Engine running*).
2. Mở Terminal 1 và chạy:
   ```powershell
   cd D:\SCHOOL\PBL6\backend
   docker compose up -d postgres-auth postgres-user-trust rabbitmq mailpit
   docker compose ps
   ```
3. Chờ các container báo `healthy` hoặc `Up`.
4. Mở trình duyệt vào kiểm tra giao diện hộp thư OTP: **http://localhost:8025** (Mailpit).

---

### Terminal 2 — Khởi chạy Auth Service
Chạy service xác thực (đăng ký, đăng nhập, cấp token, gửi OTP):
```powershell
cd D:\SCHOOL\PBL6\backend
node --env-file=.env dist/apps/auth-service/main.js
```
*(Giữ terminal này luôn mở).*

---

### Terminal 3 — Khởi chạy User & Trust Service
Chạy service quản lý hồ sơ người dùng và đánh giá tín nhiệm:
```powershell
cd D:\SCHOOL\PBL6\backend
node --env-file=.env dist/apps/user-trust-service/main.js
```
*(Giữ terminal này luôn mở).*

---

### Terminal 4 — Khởi chạy API Gateway
Chạy cổng Gateway điều phối toàn bộ API ra ngoài (port 3000):
```powershell
cd D:\SCHOOL\PBL6\backend
node --env-file=.env dist/apps/api-gateway/main.js
```
*(Giữ terminal này luôn mở).*

> **Kiểm tra nhanh Gateway:** Mở trình duyệt vào [http://localhost:3000/health](http://localhost:3000/health), nếu thấy `{"status":"ok"}` là backend đã sẵn sàng 100%.

---

### Terminal 5 — Nối cổng USB và Chạy Metro Bundler
Terminal này đảm nhận việc chuyển tiếp dữ liệu qua cáp USB và phục vụ code JavaScript cho app điện thoại:

1. **Nối cổng (Reverse Port):**
   ```powershell
   $adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
   & $adb reverse tcp:3000 tcp:3000
   & $adb reverse tcp:8081 tcp:8081
   ```
   *(Cổng 3000 cho backend, cổng 8081 cho Metro).*

2. **Chạy Metro Bundler:**
   ```powershell
   cd D:\SCHOOL\PBL6\mobile
   pnpm start --clear
   ```
   *(Giữ terminal này luôn mở).*

3. **Mở app trên điện thoại:**
   - Mở ứng dụng **HANDY GO** đã cài trên điện thoại.
   - App sẽ tự động kết nối vào Metro và tải giao diện.

---

## III. Cách thực hiện Test

### Cách 1: Test tự động bằng Script E2E (Khuyên dùng)
Dự án đã viết sẵn kịch bản E2E tự động điền form và click các màn hình.

Mở thêm **Terminal 6**:
```powershell
cd D:\SCHOOL\PBL6\mobile
powershell -ExecutionPolicy Bypass -File .\scripts\test-e2e-auth.ps1
```

- **Quy trình script tự chạy:**
  1. Tự sinh SĐT, Email ngẫu nhiên và tự điền form Đăng ký.
  2. Tự bấm nút **"Đăng ký tài khoản"**.
  3. Dừng lại yêu cầu bạn lấy OTP:
     - Mở trình duyệt vào **http://localhost:8025** xem email mới nhất.
     - Nhập mã 6 số vào điện thoại và bấm **"Xác thực"**.
  4. Sau khi app quay về màn hình Đăng nhập:
     - Quay lại Terminal 6 nhấn **`ENTER`**.
     - Script sẽ tự động điền mật khẩu và đăng nhập vào màn hình chính.

---

### Cách 2: Test thủ công bằng tay trên điện thoại

1. **Đăng ký tài khoản:**
   - Vào màn hình Đăng ký tài khoản mới.
   - **Chọn vai trò:**
     - Chọn tab **"Khách hàng"**: Sau khi xác thực và đăng nhập sẽ vào màn hình dành cho Khách hàng (`/customer/home`).
     - Chọn tab **"Thợ dịch vụ"**: Sau khi xác thực và đăng nhập sẽ vào màn hình dành cho Thợ (`/worker/home`).
   - Điền Họ tên, SĐT Việt Nam (VD: `0901234567`), Email, Mật khẩu (tối thiểu 8 ký tự).
   - Bấm **"Đăng ký tài khoản"**.
2. **Lấy mã OTP:**
   - Vào **http://localhost:8025** (Mailpit) trên máy tính.
   - Mở email xác thực gửi đến địa chỉ bạn vừa nhập.
   - Lấy mã OTP 6 số và nhập vào app điện thoại -> Bấm **"Xác thực tài khoản"**.
3. **Đăng nhập:**
   - Nhập SĐT và Mật khẩu vừa tạo -> Bấm **"Đăng nhập"**.
   - Kiểm tra xem màn hình và tab Hồ sơ có hiển thị đúng vai trò đã đăng ký hay không.

---

## IV. Các lỗi thường gặp và cách xử lý nhanh

| Lỗi | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **`Filename longer than 260 characters`** khi build Android Studio | File `ninja.exe` cũ (v1.10) trong Android SDK CMake bị giới hạn 260 ký tự trên Windows. | Tải file `ninja.exe` mới nhất (v1.12+) từ GitHub Ninja Releases chép đè vào `AppData\Local\Android\Sdk\cmake\3.22.1\bin\ninja.exe`. Thêm `arguments "-DCMAKE_OBJECT_PATH_MAX=1024"` vào `build.gradle`. |
| **"Không có kết nối mạng"** hoặc `NETWORK_ERROR` trên điện thoại | App gọi nhầm `10.0.2.2` hoặc chưa reverse port 3000. | 1. Kiểm tra file `mobile/.env` có `EXPO_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1`.<br>2. Chạy lại lệnh `adb reverse tcp:3000 tcp:3000`.<br>3. Reload lại Metro bằng `pnpm start --clear`. |
| **Không mở được `http://localhost:8025`** | Docker Desktop chưa bật hoặc container `mailpit` chưa chạy. | Bật Docker Desktop và chạy lệnh: `docker compose up -d mailpit`. |
| **Sửa code backend nhưng app chạy không đổi** | Chưa biên dịch lại TypeScript sang JavaScript `dist/`. | Chạy lệnh `pnpm run build` trong thư mục `backend`, sau đó khởi động lại service đó. |
| **Rút dây cáp điện thoại cắm lại bị mất kết nối** | Mất mapping cổng adb reverse. | Chạy lại lệnh `adb reverse tcp:3000 tcp:3000` và `adb reverse tcp:8081 tcp:8081`. |
