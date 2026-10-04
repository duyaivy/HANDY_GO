# HANDY GO Backend

> **Chạy cùng mobile qua Metro:** đọc [hướng dẫn ngắn](../docs/HUONG_DAN_BUILD_VA_CHAY.md). Phần 1 là chạy hằng ngày; phần 2 là chuẩn bị env, keys, DB và build lần đầu. Các mô tả scaffold/lệnh cũ ở những phần chưa cập nhật của README này cần đối chiếu với source.

> **HG-23 schema:** xem [quy trình đồng bộ Auth và User & Trust](../docs/HG23_DB_ALIGNMENT.md) trước khi chạy migration. Migration mới chỉ dành cho DB rỗng; không tự xóa/chuyển dữ liệu cũ.

NestJS monorepo gồm **API Gateway** và **10 microservices**, cùng các thư viện dùng chung (**shared libraries**).

> [!NOTE]
> **Trạng thái hiện tại:**
>
> - Gateway, Auth và User & Trust đã có luồng đăng ký, OTP, JWT, session và hồ sơ; các domain còn lại có phần scaffold.
> - Auth/User & Trust đang dùng PostgreSQL riêng, Prisma, RabbitMQ và RS256; luồng local dùng Mailpit cho OTP.
> - Docker Compose hiện có hai PostgreSQL, RabbitMQ, Mailpit và các ứng dụng NestJS. Các app scaffold bổ sung dùng profile `all`.
> - Luồng Customer đã chạy trên điện thoại thật; các ca OTP đồng thời, trạng thái deleted và validation backend còn có lỗi đã ghi nhận trong lần kiểm tra trước.

---

## 1. Cấu trúc ứng dụng & Thư viện

### 1.1. Danh sách ứng dụng (`apps/`)

Trong môi trường local và Docker Compose, `api-gateway` đóng vai trò là cổng giao tiếp dự kiến hướng tới client (intended client-facing gateway), đồng thời toàn bộ cổng dịch vụ (3000–3010) đều được publish trực tiếp ra máy host để phục vụ phát triển và kiểm thử độc lập:

| Ứng dụng | Thư mục | Port | Trạng thái & Vai trò |
| :--- | :--- | :---: | :--- |
| **`api-gateway`** | `apps/api-gateway` | `3000` | Cổng mobile gọi API; chuyển tiếp Auth và User & Trust |
| **`auth-service`** | `apps/auth-service` | `3001` | Đăng ký, OTP, login, RS256, refresh session, roles và outbox |
| **`user-trust-service`** | `apps/user-trust-service` | `3002` | Nhận event, lưu user/Customer profile và cung cấp hồ sơ |
| **`catalog-service`** | `apps/catalog-service` | `3003` | HTTP scaffold cho domain danh mục dịch vụ (catalog) |
| **`order-service`** | `apps/order-service` | `3004` | HTTP scaffold cho domain đơn yêu cầu dịch vụ (order) |
| **`bidding-service`** | `apps/bidding-service` | `3005` | HTTP scaffold cho domain đấu thầu / báo giá (bidding) |
| **`matching-service`** | `apps/matching-service` | `3006` | HTTP scaffold cho domain khớp nối dịch vụ (matching) |
| **`payment-service`** | `apps/payment-service` | `3007` | HTTP scaffold cho domain thanh toán (payment) |
| **`notification-service`** | `apps/notification-service` | `3008` | HTTP scaffold cho domain thông báo (notification) |
| **`wallet-service`** | `apps/wallet-service` | `3009` | HTTP scaffold cho domain ví điện tử (wallet - scaffold mở rộng) |
| **`tracking-service`** | `apps/tracking-service` | `3010` | HTTP scaffold cho domain theo dõi lộ trình (tracking - scaffold mở rộng) |

### 1.2. Thư viện dùng chung (`libs/`)

- **`libs/config`** *(Hoạt động)*: Tích hợp `@nestjs/config`, nạp env phân tầng và kiểm tra tính hợp lệ của `PORT`, `NODE_ENV`, `LOG_LEVEL`, cùng các URL upstream bắt buộc.
- **`libs/logger`** *(Hoạt động)*: Pino logging (`nestjs-pino`), xuất pretty log ở development và JSON log ở production; xử lý `x-request-id` và tự động che headers nhạy cảm (`authorization`, `cookie`).
- **`libs/common`** *(Hoạt động)*: Khởi tạo ứng dụng chuẩn (`bootstrapApplication`) gồm Logger, CORS, tiền tố toàn cục `API_PREFIX` (mặc định `api/v1`), loại trừ `/health`.
- **`libs/database`**, **`libs/redis`**, **`libs/rabbitmq`**, **`libs/auth`** *(Scaffold)*: Khung module và service rỗng, chưa khởi tạo client hay kết nối cơ sở hạ tầng.

---

## 2. Yêu cầu môi trường (Prerequisites)

- **Docker & Docker Compose v2** (quy trình Docker-first, khuyến nghị).
- **Hoặc chạy trực tiếp trên máy host:**

  - **Node.js**: Phiên bản 24 (tương thích môi trường Node 24 trong `Dockerfile.dev`).
  - **pnpm**: Phiên bản `10.17.1` (cố định qua trường `packageManager` trong `package.json`):

    ```bash
    corepack enable
    corepack prepare pnpm@10.17.1 --activate
    ```

---

## 3. Cấu hình biến môi trường (Environment Setup)

### 3.1. Thứ tự ưu tiên nạp cấu hình

Module `libs/config` đọc cấu hình từ file `.env` tập trung tại thư mục gốc:

1. Biến môi trường hệ thống / process (`process.env`, bao gồm mục `environment` trong Compose).
2. File cấu hình chung ở thư mục gốc: `backend/.env` (tạo từ `.env.example`).

Quy tắc xác thực: `PORT` (1–65535), `NODE_ENV` (`development` | `test` | `production`), `LOG_LEVEL` (`fatal` | `error` | `warn` | `info` | `debug` | `trace` | `silent`), `OTP_SECRET` (bắt buộc cho `auth-service`), và các URL upstream bắt buộc phải đúng định dạng URL.

### 3.2. Cấu hình Secret & Bảo mật

Hệ thống yêu cầu hai secret quan trọng:

1. **`OTP_SECRET`** (Bắt buộc cho `auth-service`):
   - Chuỗi bí mật dùng để băm HMAC-SHA256 mã OTP trước khi lưu vào cơ sở dữ liệu.
   - Độ dài khuyến nghị: tối thiểu 32 ký tự ngẫu nhiên.
   - **Bắt buộc**: nếu không được cấu hình, `auth-service` sẽ từ chối khởi động để ngăn chặn rủi ro bảo mật từ default secret hardcode.
   - *Lưu ý khi cập nhật secret*: các mã OTP đang chờ xác thực được tạo bằng secret cũ sẽ không còn hợp lệ. Người dùng cần bấm gửi lại mã (`/auth/resend-otp`).

2. **`INTERNAL_SERVICE_SECRET`** (Chia sẻ giữa `api-gateway` và các service nội bộ):
   - Secret nội bộ dùng để xác thực request chuyển tiếp từ API Gateway tới các microservice backend qua header `x-internal-secret`.
   - `auth-service` chỉ tin cậy header `x-forwarded-for` khi header `x-internal-secret` hợp lệ; nếu không sẽ fallback về IP socket kết nối để ngăn chặn tấn công giả mạo IP (IP spoofing) vượt qua rate limit.
   - Trong Docker Compose, cổng `3001` của `auth-service` không được publish ra host bên ngoài, chỉ giao tiếp nội bộ qua mạng docker với `api-gateway`.

### 3.3. Thiết lập ban đầu

```bash
# Tạo file env chung ở thư mục gốc từ file mẫu
cp .env.example .env
```

> [!WARNING]
> Không commit các file `.env` thực tế vào Git.


---

## 4. Chạy với Docker Compose (Khuyến nghị)

### 4.1. Khởi động và vận hành

```bash
# Khởi dựng image và chạy toàn bộ 11 container ở chế độ nền
docker compose up --build -d

# Xem trạng thái và healthcheck của các container
docker compose ps

# Theo dõi logs (toàn bộ hoặc service cụ thể)
docker compose logs -f
docker compose logs -f api-gateway

# Khởi động lại hoặc dừng hệ thống
docker compose restart auth-service
docker compose down
```

### 4.2. Cơ chế tự động reload mã nguồn

- Thư mục `apps/`, `libs/`, `nest-cli.json` và `tsconfig*.json` được bind-mount vào container. Khi file `.ts`/`.json` thay đổi, `nodemon` sẽ tự động trigger NestJS restart ứng dụng tương ứng (delay 300ms).
- Thư mục `node_modules` nằm hoàn toàn trong image. Khi thay đổi `package.json` hoặc `pnpm-lock.yaml`, bắt buộc phải rebuild lại image:

  ```bash
  docker compose build --no-cache
  docker compose up -d
  ```

---

## 5. Chạy trực tiếp trên máy host (Local Development)

```bash
# 1. Cài đặt dependencies
pnpm install

# 2. Chạy API Gateway (Terminal 1 - Port 3000)
pnpm exec nest start api-gateway --watch

# 3. Chạy service độc lập (Terminal 2 - Port 3001)
pnpm exec nest start auth-service --watch
```

---

## 6. Endpoint & Kiểm tra kết nối

### 6.1. Health Check trực tiếp từng Service

Tất cả 11 app cung cấp endpoint `GET /health` (không prefix, chỉ phản ánh HTTP server process đang hoạt động):

```bash
# API Gateway
curl http://localhost:3000/health

# Microservices (mỗi service lắng nghe trên cổng riêng từ 3001 đến 3010)
curl http://localhost:3001/health   # auth-service
curl http://localhost:3002/health   # user-trust-service
curl http://localhost:3003/health   # catalog-service
curl http://localhost:3004/health   # order-service
curl http://localhost:3005/health   # bidding-service
curl http://localhost:3006/health   # matching-service
curl http://localhost:3007/health   # payment-service
curl http://localhost:3008/health   # notification-service
curl http://localhost:3009/health   # wallet-service
curl http://localhost:3010/health   # tracking-service
```

Phản hồi chuẩn: `{"status":"ok","service":"<name>","timestamp":"..."}`.

### 6.2. Route chuyển tiếp mẫu qua API Gateway

- **Proxy health check tới auth-service**:

  ```bash
  curl -H "x-request-id: test-123" http://localhost:3000/api/v1/services/auth/health
  ```

  Gateway chuyển tiếp request tới `AUTH_SERVICE_URL/health` kèm `x-request-id`. Trả về `502 Bad Gateway` nếu upstream không phản hồi, hoặc `504 Gateway Timeout` nếu vượt quá `UPSTREAM_TIMEOUT_MS` (mặc định 3000ms).

---


## 7. Lệnh kiểm tra, Lint, Test & Build

| Thao tác | Lệnh | Ghi chú |
| :--- | :--- | :--- |
| **Lint** | `pnpm lint` | Phân tích tĩnh bằng `oxlint` cho `apps/`, `libs/`, `*.ts` |
| **Typecheck** | `pnpm typecheck` | Kiểm tra TypeScript bằng `tsc -b --force --pretty false` |
| **Unit Test** | `pnpm test` | Chạy unit tests với Vitest (`vitest run`) |
| **Unit Test (Watch)** | `pnpm test:watch` | Chạy Vitest ở chế độ theo dõi thay đổi |
| **Test Coverage** | `pnpm test:cov` | Báo cáo độ phủ kiểm thử (`vitest run --coverage`) |
| **Test Debug** | `pnpm test:debug` | Debug kiểm thử (`vitest --inspect-brk --no-file-parallelism`) |
| **E2E Test** | `pnpm test:e2e` | Chạy kiểm thử E2E (`vitest run --config ./vitest.config.e2e.ts`) |
| **Build toàn bộ** | `pnpm build` | Biên dịch toàn bộ apps và libs (`nest build --all`) |
| **Build Gateway** | `pnpm build:gateway` | Chỉ biên dịch `api-gateway` |
| **Chạy Production** | `pnpm start:prod` | Chạy bundle production của Gateway (`node dist/apps/api-gateway/main.js`) |
| **Format code** | `pnpm format` | Tự động format code với Prettier |

## 8. Event message sử dụng structure
```bash
{
  eventId: string;
  eventVersion: number;
  occurredAt: Date;
  producer: string;
  data: T;
}

# Ví dụ
{
  "eventId": "event-001",
  "eventVersion": 1,
  "occurredAt": "2026-09-19T09:00:00.000Z",
  "producer": "order-service",
  "data": {
    "orderId": "order-001",
    "customerId": "user-001",
    "serviceId": "service-001"
  }
}
```
