# HƯỚNG DẪN CHẠY TEST DỰ ÁN HANDY GO

Tài liệu này hướng dẫn chi tiết cách chạy toàn bộ hệ sinh thái backend ngầm bên trong Docker và kết nối ứng dụng mobile (React Native / Expo) trên cả **Điện thoại thật (cáp USB)** và **Máy ảo Android Studio (Emulator)** để kiểm thử.

> 💡 **Điểm tiện lợi:** Toàn bộ Backend (Database, RabbitMQ, API Gateway, Auth, User-Trust) **đều chạy ngầm 100% trong Docker bằng 1 lệnh duy nhất (0 terminal mở)**. Bạn chỉ cần giữ **đúng 1 terminal duy nhất cho Mobile (Metro)**.

---

## PHẦN I: BẬT TOÀN BỘ HỆ SINH THÁI BACKEND (ÁP DỤNG CHUNG)

### 1. Chuẩn bị (Chỉ làm 1 lần đầu tiên trên máy mới)
Nếu máy bạn chưa từng build image backend, mở terminal tại thư mục `backend` và chạy:
```cmd
cd /d D:\SCHOOL\PBL6\backend
docker build -t handy-go-backend-dev:local -f Dockerfile.dev .
```

### 2. Khởi động Backend bằng 1 lệnh duy nhất
1. Mở ứng dụng **Docker Desktop** trên Windows và chờ nó báo *Engine running* (icon xanh).
2. Mở một terminal bất kỳ tại thư mục `backend` và chạy:
   ```cmd
   cd /d D:\SCHOOL\PBL6\backend
   docker compose up -d
   ```
   > 🚀 **Lệnh này tự động bật ngầm toàn bộ 6 service:**
   > - `postgres-auth`, `postgres-user-trust`: 2 cơ sở dữ liệu PostgreSQL.
   > - `rabbitmq`: Hệ thống hàng đợi Message Broker.
   > - `auth-service`: Dịch vụ xác thực tài khoản (cổng 3001, gửi OTP qua Gmail SMTP).
   > - `user-trust-service`: Dịch vụ hồ sơ & độ tin cậy (cổng 3002).
   > - `api-gateway`: Cổng API Gateway điều phối toàn bộ hệ thống (cổng 3000).

3. **Kiểm tra trên trình duyệt:**
   - **Tài liệu Swagger API:** [http://localhost:3000/docs](http://localhost:3000/docs) (Xem toàn bộ API đã sẵn sàng).
4. 👉 **TẮT LUÔN CỬA SỔ TERMINAL NÀY ĐI.** Toàn bộ Backend đã chạy ngầm trong Docker Desktop, không cần giữ terminal mở.

---

## PHẦN II: HƯỚNG DẪN CHẠY MOBILE (CHỌN 1 TRONG 2 TRƯỜNG HỢP)

---

### 📱 TRƯỜNG HỢP 1: DÙNG ĐIỆN THOẠI THẬT (CẮM CÁP USB)

#### Bước 1: Cấu hình file `mobile/.env`
Mở file `mobile/.env` và đặt URL là `127.0.0.1`:
```dotenv
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1
```

#### Bước 2: Chuẩn bị trên điện thoại
1. Cắm cáp USB nối điện thoại với máy tính.
2. Vào **Cài đặt** -> **Tùy chọn nhà phát triển (Developer Options)** -> Bật **Gỡ lỗi USB (USB Debugging)**.
3. Mở khóa màn hình điện thoại và tích chọn **"Luôn cho phép từ máy tính này"** khi thấy thông báo gỡ lỗi USB hiện lên.

#### Bước 3: Nối cổng USB và Chạy Metro (1 Terminal duy nhất)
Mở một cửa sổ PowerShell (hoặc tab Terminal trong Android Studio/VS Code) và chạy:

```powershell
# 1. Nối cổng mạng từ máy tính sang điện thoại qua cáp USB
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:3000 tcp:3000
& $adb reverse tcp:8081 tcp:8081

# 2. Chuyển vào thư mục mobile và bật Metro Bundler
cd D:\SCHOOL\PBL6\mobile
pnpm start --clear
```

#### Bước 4: Mở app trên điện thoại
Mở ứng dụng **HANDY GO** trên điện thoại lên, app sẽ tự động kết nối với Metro và tải giao diện để test.

---

### 💻 TRƯỜNG HỢP 2: DÙNG MÁY ẢO ANDROID STUDIO (EMULATOR)

> 🌟 **Ưu điểm khi dùng máy ảo:** Không cần dây cáp, **hoàn toàn KHÔNG cần chạy lệnh `adb reverse`**.

#### Bước 1: Cấu hình file `mobile/.env`
Mở file `mobile/.env` và đặt URL là **`10.0.2.2`**:
```dotenv
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1
```
*(💡 Giải thích: `10.0.2.2` là địa chỉ IP alias đặc biệt do Android Studio cung cấp để máy ảo trỏ thẳng về cổng 3000 của máy tính host).*

#### Bước 2: Bật máy ảo trong Android Studio
1. Mở phần mềm **Android Studio**.
2. Mở công cụ **Device Manager** (ở thanh công cụ bên phải hoặc menu *Tools -> Device Manager*).
3. Bấm nút **Play ▶** cạnh thiết bị máy ảo của bạn để khởi động máy ảo lên.

#### Bước 3: Chạy Metro và Khởi động App (1 Terminal duy nhất)
Mở một cửa sổ PowerShell và chạy:

```powershell
cd D:\SCHOOL\PBL6\mobile
pnpm start --clear
```
- Khi Metro đã sẵn sàng, bạn chỉ cần nhấn phím **`a`** trên bàn phím (hoặc bấm nút **Run ▶** trên thanh toolbar của Android Studio).
- App sẽ được tự động cài đặt và mở lên ngay trên màn hình máy ảo!

---

## PHẦN III: QUY TRÌNH KIỂM THỬ LUỒNG AUTHENTICATION

*(Quy trình kiểm thử giống nhau cho cả Điện thoại thật và Máy ảo)*:

1. **Đăng ký tài khoản:**
   - Trên màn hình app, chọn **"Chưa có tài khoản? Đăng ký ngay"**.
   - **Chọn vai trò:**
     - Bấm tab **"Khách hàng"**: Sau khi đăng nhập sẽ vào trang chủ khách (`/customer/home`).
     - Bấm tab **"Thợ dịch vụ"**: Sau khi đăng nhập sẽ vào trang chủ thợ (`/worker/home`).
   - Điền đầy đủ: Họ tên, Số điện thoại Việt Nam (VD: `0901234567`), Email, Mật khẩu (tối thiểu 8 ký tự).
   - Bấm **"Đăng ký tài khoản"**.

2. **Lấy mã OTP xác thực:**
   - Mở hòm thư Gmail (hoặc mục Spam/Quảng cáo) của email vừa đăng ký.
   - Mở email có tiêu đề `[HANDY GO] Mã xác thực tài khoản của bạn`, lấy mã OTP 6 số.
   - Nhập vào màn hình app trên điện thoại/máy ảo -> Bấm **"Xác thực tài khoản"**.

3. **Đăng nhập và kiểm tra kết quả:**
   - Sau khi xác thực xong, màn hình Đăng nhập tự động hiện lên (kèm SĐT đã điền sẵn).
   - Nhập Mật khẩu vừa tạo -> Bấm **"Đăng nhập"**.
   - **Kiểm tra kết quả điều hướng:**
     - Nếu đăng ký vai trò **Khách hàng**: App sẽ chuyển hướng vào màn hình trang chủ khách hàng (`/customer/home`) và tab Hồ sơ hiển thị `Vai trò: Customer`.
     - Nếu đăng ký vai trò **Thợ dịch vụ**: App sẽ chuyển hướng vào màn hình dành cho thợ (`/worker/home`) và tab Hồ sơ hiển thị `Vai trò: Worker`.

---

## PHẦN IV: BẢNG XỬ LÝ NHANH CÁC LỖI THƯỜNG GẶP

| Hiện tượng | Nguyên nhân | Cách xử lý |
| :--- | :--- | :--- |
| **`Filename longer than 260 characters`** khi build Android Studio | File `ninja.exe` cũ (v1.10) trong Android SDK CMake bị giới hạn 260 ký tự trên Windows. | Tải file `ninja.exe` mới nhất (v1.12+) từ GitHub Ninja Releases chép đè vào `AppData\Local\Android\Sdk\cmake\3.22.1\bin\ninja.exe`. Thêm `arguments "-DCMAKE_OBJECT_PATH_MAX=1024"` vào `build.gradle`. |
| **"Không có kết nối mạng"** hoặc `NETWORK_ERROR` trên app | Cấu hình sai IP trong `.env` hoặc cáp USB chưa reverse port. | - **Nếu dùng điện thoại thật USB:** Đảm bảo `.env` là `127.0.0.1` và đã chạy lệnh `adb reverse tcp:3000 tcp:3000`.<br>- **Nếu dùng máy ảo Emulator:** Đảm bảo `.env` là `10.0.2.2`.<br>Sau khi sửa `.env`, luôn reload lại Metro bằng `pnpm start --clear`. |
| **Không nhận được mã OTP qua Gmail** | Email bị lọc vào Spam/Quảng cáo hoặc cấu hình Gmail App Password trong `backend/.env` chưa đúng. | Kiểm tra thư mục Spam trong Gmail; hoặc kiểm tra cấu hình `SMTP_USER` và `SMTP_PASS` trong file `backend/.env`. |
| **Sửa code backend nhưng không thấy thay đổi** | Docker container đang chạy code cũ chưa cập nhật. | Chạy lại lệnh build image: `docker build -t handy-go-backend-dev:local -f Dockerfile.dev .` rồi chạy lại `docker compose up -d`. |
| **Khi kết thúc làm việc** | Muốn tắt toàn bộ backend để giải phóng RAM máy tính. | Vào thư mục `backend` chạy lệnh: `docker compose down`. |
