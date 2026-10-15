# Chạy HANDY GO trên điện thoại bằng Metro

Cách chạy giống môi trường hiện tại: **hạ tầng Docker → 3 service backend trên máy → điện thoại USB → Metro**.

Các lệnh dùng PowerShell. Thay `D:\school\PBL6\HANDY_GO` bằng thư mục source trên máy bạn.

**Nếu máy đã cài đặt và điện thoại đã có app, làm phần 1. Máy mới làm phần 2 trước.**

## 1. Chạy hằng ngày

### Bước 1 — Bật Docker và hạ tầng

Mở Docker Desktop, chờ Docker chạy. Mở terminal:

```powershell
cd D:\school\PBL6\HANDY_GO\backend
docker compose up -d postgres-auth postgres-user-trust rabbitmq
docker compose ps
```

Chờ hai PostgreSQL và RabbitMQ hiện `healthy`.

Nếu vừa sửa source backend, build lại trước khi mở các service:

```powershell
pnpm run build
```

### Bước 2 — Mở ba terminal backend

**Terminal Auth** — giữ mở:

```powershell
cd D:\school\PBL6\HANDY_GO\backend
node --env-file=.env dist/apps/auth-service/main.js
```

**Terminal User & Trust** — giữ mở:

```powershell
cd D:\school\PBL6\HANDY_GO\backend
node --env-file=.env dist/apps/user-trust-service/main.js
```

**Terminal Gateway** — giữ mở:

```powershell
cd D:\school\PBL6\HANDY_GO\backend
node --env-file=.env dist/apps/api-gateway/main.js
```

Mở [http://localhost:3000/health](http://localhost:3000/health). Có phản hồi nghĩa là Gateway đã lên; tiếp tục chạy app để kiểm tra luồng đăng nhập.

### Bước 3 — Cắm điện thoại và nối cổng USB

Bật USB debugging, mở khóa điện thoại và chấp nhận hộp thoại cho phép debug. Chạy trong terminal khác:

```powershell
adb devices
```

Lấy serial của thiết bị có trạng thái `device` rồi thay `YOUR_DEVICE_SERIAL` bên dưới:

```powershell
$DeviceSerial = "YOUR_DEVICE_SERIAL"
adb -s "$DeviceSerial" reverse tcp:3000 tcp:3000
adb -s "$DeviceSerial" reverse tcp:8081 tcp:8081
```

Trong `mobile/.env`, đặt:

```dotenv
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_URL=http://127.0.0.1:3000/api/v1
```

- Cổng 3000 nối điện thoại tới backend.
- Cổng 8081 nối điện thoại tới Metro.
- Rút/cắm lại USB thì kiểm tra và tạo lại các mapping trên.

### Bước 4 — Chạy Metro

**Terminal Metro** — giữ mở:

```powershell
cd D:\school\PBL6\HANDY_GO\mobile
pnpm start --dev-client --localhost --port 8081
```

Mở **HANDY GO** trên điện thoại và chọn development server.

Nếu vừa sửa `.env`, dừng Metro bằng `Ctrl+C` rồi chạy:

```powershell
pnpm start --dev-client --localhost --port 8081 --clear
```

**Nếu app trên điện thoại của bạn chưa tự nối Metro:** bản đang dùng trên máy hiện tại có package `com.obytes.development`. Trong terminal đã khai báo `$DeviceSerial`, mở bằng:

```powershell
adb -s "$DeviceSerial" shell am start -W -a android.intent.action.VIEW -d "exp+obytesapp://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" -p com.obytes.development
```

Với app build mới từ config hiện tại, package là `com.handygo.development`; dùng:

```powershell
adb -s "$DeviceSerial" shell am start -W -a android.intent.action.VIEW -d "exp+handy-go-mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081" -p com.handygo.development
```

<a id="otp"></a>

### Bước 5 — Đăng ký / đăng nhập

- Đã có tài khoản: đăng nhập bằng **phone + password**.
- Tài khoản mới: đăng ký, sau đó kiểm tra hòm thư Gmail (hoặc thư mục Spam/Quảng cáo) để lấy mã OTP 6 số.
- Nhập mã 6 số trên điện thoại để hoàn tất kích hoạt.
- Email OTP được gửi trực tiếp qua Gmail SMTP thật (`smtp.gmail.com`).
- OTP hết hạn sau 10 phút; gửi lại cần chờ cooldown 60 giây.

**Chạy xong:** app vào Login hoặc khôi phục phiên; đăng ký/OTP vào Customer Home và hồ sơ tải được.

## 2. Chỉ làm lần đầu trên máy mới

### Chuẩn bị

Cần có **Git, Node.js 24, Docker Desktop, Android Studio/SDK, JDK và ADB**. Môi trường hiện tại đã build Android bằng JDK 21.

Clone đúng branch team bàn giao; đổi đường dẫn trong các lệnh nếu máy bạn đặt source ở chỗ khác.

Cài/bật Corepack nếu chưa có:

```powershell
npm install --global corepack
corepack enable
```

Corepack chọn pnpm theo từng thư mục: backend `10.17.1`, mobile `10.12.3`. Nếu máy có pnpm global khác, dùng `corepack pnpm` thay `pnpm` trong các lệnh.

### Chuẩn bị backend

```powershell
cd D:\school\PBL6\HANDY_GO\backend
pnpm install --frozen-lockfile

if (-not (Test-Path ".env")) {
    Copy-Item .env.example .env
}
if (-not (Test-Path "apps/api-gateway/.env")) {
    Copy-Item apps/api-gateway/.env.example apps/api-gateway/.env
}

pnpm run keys:generate
docker compose up -d postgres-auth postgres-user-trust rabbitmq
docker compose ps
```

Chờ DB/RabbitMQ healthy, sau đó:

```powershell
pnpm run db:setup
pnpm run build
```

Giữ cấu hình local trong hai file example. Trong `apps/api-gateway/.env` cần có:

```dotenv
AUTH_SERVICE_URL=http://localhost:3001
USER_TRUST_SERVICE_URL=http://localhost:3002
INTERNAL_SERVICE_SECRET=your-internal-gateway-secret-32-chars
```

Trong `backend/.env`, cần đảm bảo khai báo:
- `OTP_SECRET`: Bắt buộc cho `auth-service` khởi động; dùng để băm HMAC-SHA256 mã OTP. Nếu đổi secret, OTP đang chờ xác thực sẽ không còn hợp lệ và cần gửi lại qua app (`/auth/resend-otp`).
- `INTERNAL_SERVICE_SECRET`: Secret xác thực header nội bộ giữa Gateway và `auth-service` để chống giả mạo IP.

`db:setup` sinh Prisma clients và áp dụng migration cho cả hai DB. Không thêm một `PORT=3000` dùng chung vào `backend/.env`.


### Chuẩn bị mobile và cài app lần đầu

```powershell
cd D:\school\PBL6\HANDY_GO\mobile
pnpm install --frozen-lockfile

if (-not (Test-Path ".env")) {
    Copy-Item .env.example .env
}
```

Sửa `mobile/.env` thành API URL USB ở bước 3. Cắm điện thoại, tạo reverse, rồi chạy:

```powershell
pnpm exec expo run:android --device
```

Chọn đúng điện thoại. Lệnh sinh native project nếu chưa có, build/cài Development Build và mở Metro. Nếu đã có Metro ở 8081, dừng Metro đó trước khi chạy lệnh này.

Điện thoại đã có app tương thích thì dùng phần 1, không cần build/cài lại mỗi lần. Thay JS/UI thường chỉ cần Metro reload; thêm native module hoặc đổi icon/splash cần build/cài lại.

## 3. Khi không chạy được

| Hiện tượng | Kiểm tra nhanh |
| --- | --- |
| `adb devices` hiện `unauthorized` | Mở khóa điện thoại, chấp nhận USB debugging |
| App không tải code | Metro đang chạy; có reverse 8081; mở đúng package |
| App báo lỗi mạng | Có reverse 3000; Gateway đã chạy; env có `/api/v1` |
| Gateway báo thiếu `AUTH_SERVICE_URL` | Tạo và kiểm tra `backend/apps/api-gateway/.env` |
| Backend báo thiếu bảng/client | Chờ DB healthy, chạy `pnpm run db:setup` rồi build lại |
| Không thấy OTP trong Gmail | Kiểm tra hòm thư Spam/Junk hoặc kiểm tra cấu hình SMTP_USER / SMTP_PASS trong `backend/.env` |
| Cổng bị chiếm | Đóng đúng terminal server/Metro cũ trước khi mở lại |
| Build Android thiếu SDK/JDK | Kiểm tra `JAVA_HOME`, SDK path và cài phiên bản Gradle yêu cầu |

## 4. Kết thúc

- `Ctrl+C` ở terminal Metro và ba terminal backend.
- Muốn dừng hạ tầng: vào `backend` chạy `docker compose stop`.
- Giữ env, RSA keys và DB volumes để hôm sau chạy lại.
