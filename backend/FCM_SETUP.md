# HƯỚNG DẪN CẤU HÌNH HẠ TẦNG FIREBASE CLOUD MESSAGING (FCM) — HANDY GO

> **Tài liệu hướng dẫn triển khai & vận hành**  
> Áp dụng cho: `notification-service` (VPS1)  

---

## 1. Chuẩn bị Firebase Project & Service Account

### Bước 1: Tạo Firebase Project
1. Truy cập [Firebase Console](https://console.firebase.google.com/).
2. Nhấn **Add project**, nhập tên dự án (ví dụ: `handy-go-production`).
3. Tắt Google Analytics nếu chưa cần thiết, sau đó bấm **Create project**.

### Bước 2: Bật FCM HTTP v1 API
1. Truy cập [Google Cloud Console](https://console.cloud.google.com/) với cùng tài khoản Google.
2. Chọn dự án vừa tạo.
3. Điều hướng tới **APIs & Services > Library**.
4. Tìm kiếm `Firebase Cloud Messaging API` và nhấn **ENABLE**.

### Bước 3: Tạo Service Account Key
1. Quay lại Firebase Console, mở **Project settings** (biểu tượng bánh răng ở góc trên bên trái).
2. Chuyển sang tab **Service accounts**.
3. Tại mục **Firebase Admin SDK**, chọn ngôn ngữ **Node.js** và nhấn nút **Generate new private key**.
4. Xác nhận tạo key. Một file JSON chứa thông tin xác thực sẽ được tải về máy (ví dụ: `handy-go-production-firebase-adminsdk.json`).

> [!CAUTION]
> **Tuyệt đối không commit file JSON này vào kho mã nguồn Git.** File chứa private key có quyền truy cập quản trị Firebase.

---

## 2. Triển khai trên môi trường phát triển (Local Development)

### Cách 1: Đặt file JSON tại thư mục an toàn
1. Tạo thư mục bảo mật ngoài git (đã được cấu hình trong `.gitignore`):
   ```bash
   mkdir -p secrets
   cp /path/to/downloaded-firebase-key.json secrets/firebase-service-account.json
   ```
2. Thêm vào file `.env`:
   ```env
   PUSH_ENABLED=true
   PUSH_WORKER_ENABLED=true
   GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/backend/secrets/firebase-service-account.json
   FIREBASE_PROJECT_ID=handy-go-production
   PUSH_SIMULATED_POLICIES=true
   ```

### Cách 2: Chạy kiểm thử tự động (Unit Tests)
Khi chạy `pnpm test`, `FirebasePushProvider` sẽ tự động mock hoặc bỏ qua kết nối thực tế nếu `PUSH_ENABLED=false`. Toàn bộ 115+ unit tests chạy hoàn toàn độc lập mà không yêu cầu kết nối mạng hay Firebase credentials thực tế.

---

## 3. Triển khai trên môi trường Production (VPS1)

Hệ thống notification-service chạy trong Docker container trên VPS1 cùng với `api-gateway`, `auth-service`, `user-trust-service`.

### Bước 1: Copy Service Account Key lên VPS1
Sử dụng SSH/SCP để chuyển file JSON lên VPS tại thư mục bảo mật:
```bash
scp handy-go-production-firebase-adminsdk.json user@vps1-ip:/opt/handygo/secrets/firebase-sa.json
```
Phân quyền bảo mật chỉ cho phép user hiện tại đọc:
```bash
ssh user@vps1-ip "chmod 600 /opt/handygo/secrets/firebase-sa.json"
```

### Bước 2: Cập nhật Environment Variables trên VPS1
Trong file cấu hình môi trường production (`/opt/handygo/env/production.env`):
```env
PUSH_ENABLED=true
PUSH_WORKER_ENABLED=true
PUSH_WORKER_POLL_INTERVAL_MS=3000
PUSH_WORKER_BATCH_SIZE=50
PUSH_MAX_RETRY_ATTEMPTS=5
FIREBASE_PROJECT_ID=handy-go-production
GOOGLE_APPLICATION_CREDENTIALS=/opt/handygo/secrets/firebase-sa.json
```

### Bước 3: Chạy Database Migration
Áp dụng migration partial indexes cho bảng `notification_delivery_attempts`:
```bash
pnpm exec prisma migrate deploy --schema=apps/notification-service/prisma/schema.prisma
```

### Bước 4: Khởi động lại Notification Service
```bash
docker compose -f deploy/production/compose.production.yml up -d --no-deps notification-service
```

### Bước 5: Kiểm tra Log vận hành
Kiểm tra log của container để xác nhận worker đã khởi chạy thành công:
```bash
docker compose -f deploy/production/compose.production.yml logs -f notification-service
```
Log hợp lệ sẽ hiển thị:
```
[FirebasePushProvider] Initializing Firebase with credentials from: /opt/handygo/secrets/firebase-sa.json
[FirebasePushProvider] Firebase Cloud Messaging initialized successfully
[PushWorkerService] Starting Push notification worker polling loop
```

---

## 4. Xử lý sự cố thường gặp (Troubleshooting)

### 1. `messaging/registration-token-not-registered`
- **Nguyên nhân:** Người dùng đã gỡ ứng dụng hoặc xóa dữ liệu ứng dụng trên điện thoại.
- **Hành vi hệ thống:** `PushWorkerService` sẽ tự động phát hiện, gọi `DevicesRepository.deactivateById(tokenId)` để đánh dấu `isActive = false`, tránh gửi lại vào các lần sau.

### 2. `messaging/quota-exceeded` hoặc `messaging/unavailable`
- **Nguyên nhân:** Firebase tạm thời bảo trì hoặc vượt ngưỡng rate limit.
- **Hành vi hệ thống:** Đánh dấu là lỗi transient, tự động lùi thời gian gửi tiếp theo bằng thuật toán Exponential Backoff kèm Jitter ngẫu nhiên (`next_retry_at`).

### 3. Log hiển thị `Push delivery is disabled`
- Kiểm tra lại biến `PUSH_ENABLED` trong `.env`. Biến này phải có giá trị chính xác là `true`.
