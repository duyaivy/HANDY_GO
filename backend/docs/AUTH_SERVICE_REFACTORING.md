# BÁO CÁO TỔNG KẾT: TÁI CẤU TRÚC AUTH-SERVICE THEO KIẾN TRÚC FEATURE-BASED

> **Dự án:** HANDY GO (PBL6)  
> **Service:** `auth-service`  
> **Nhánh:** `feature/HG-23-login_and_register`  
> **Mục tiêu:** Chuyển đổi toàn diện từ kiến trúc lai tạp (Hybrid Layer/Feature) sang kiến trúc **Feature-Based (Vertical Slice)** chuẩn mực của NestJS, đồng bộ với pattern của toàn bộ backend monorepo.

---

## 1. Bối cảnh & Nguyên nhân mã nguồn cũ bị "lai tạp" (Hybrid State)

### 1.1. Nguyên nhân
Trước khi refactor, mã nguồn `auth-service` trải qua 2 giai đoạn chuyển dịch dở dang:
1. **Khởi đầu theo Layer-Based Architecture:**
   - Toàn bộ DTO nằm tập trung tại `src/dto/` (layer DTO).
   - Toàn bộ nghiệp vụ use-case nằm tại `src/flows/` (layer Service).
   - Chỉ có duy nhất 1 monolithic controller (`src/auth-service.controller.ts`) và 1 facade service (`src/auth-service.service.ts`) tại root.
   - Các dịch vụ kỹ thuật hạ tầng (`outbox`, `rate-limit`, `rpc`, `session`, `seed`, `utils`) nằm cùng cấp ở root.
2. **Di chuyển dở dang sang Feature-Based (commit `a2cbdff9`):**
   - Đã tạo các thư mục `login/`, `otp/`, `register/` và đưa DTO cùng code flow vào đó.
   - **Tuy nhiên chưa hoàn thiện vì:**
     - Giữ lại thư mục `src/dto/` và `src/flows/` chứa toàn các file re-export 1 dòng (`export * from '../...'`) để làm shim tránh gãy các file unit test cũ.
     - Các thư mục feature `login/`, `otp/`, `register/` **không có Controller riêng và không có Module riêng**.
     - Vẫn giữ nguyên Controller khổng lồ `auth-service.controller.ts` hứng tất cả endpoint và delegate sang các flow.
     - [auth-service.module.ts](file:///Users/apple/QUOCDUY/PBL6/backend/apps/auth-service/src/auth-service.module.ts) ở root tự đăng ký và cung cấp mọi provider một cách thủ công, không phân rã thành sub-modules.
     - `login/dto/auth-responses.dto.ts` bị phụ thuộc chéo khi re-export cả DTO của `register` và `otp`.
     - File template HTML bị trùng lặp giữa `apps/auth-service/src/templates/` và `libs/common/src/templates/`.

---

## 2. Kiến trúc Feature-Based mục tiêu

Tuân thủ nguyên tắc **Vertical Slice Architecture** trong hệ sinh thái NestJS:
- **Độc lập và khép kín (Self-contained Features):** Mỗi feature domain chịu trách nhiệm toàn bộ vòng đời của mình bao gồm: Module, Controller (quản lý route HTTP tương ứng), Service (xử lý nghiệp vụ), DTO (validation), và Unit test.
- **Ranh giới rõ ràng (Separation of Concerns):** Tách bạch hoàn toàn giữa **Business Features** (`register`, `otp`, `login`, `health`) và **Shared/Infrastructure** (`common/`).
- **Không phá vỡ API Contract:** Tất cả các endpoint giữ nguyên 100% path prefix và signature:
  - `POST /api/v1/auth/register` (xử lý bởi `RegisterController`)
  - `POST /api/v1/auth/verify-email` & `POST /api/v1/auth/resend-otp` (xử lý bởi `OtpController`)
  - `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me` (xử lý bởi `LoginController`)
  - `GET /api/v1/health` (xử lý bởi `HealthController`)
- **Tương thích tuyệt đối với các dịch vụ khác:** `api-gateway` và Mobile App hoạt động bình thường mà không cần bất kỳ thay đổi nào.

---

## 3. Cấu trúc thư mục mới chi tiết

```
apps/auth-service/src/
├── register/                                # [Feature: Đăng ký tài khoản]
│   ├── dto/
│   │   ├── register.dto.ts
│   │   └── register-response.dto.ts
│   ├── register.controller.ts              # POST /auth/register
│   ├── register.controller.spec.ts         # Unit test riêng cho RegisterController
│   ├── register-flow.service.ts            # Business logic đăng ký & tạo challenge ban đầu
│   ├── register.module.ts                  # NestJS module của Register feature
│   └── index.ts
│
├── otp/                                     # [Feature: Xác thực & OTP]
│   ├── dto/
│   │   ├── verify-otp.dto.ts
│   │   ├── resend-otp.dto.ts
│   │   └── otp-responses.dto.ts
│   ├── templates/
│   │   └── otp-email.template.ts           # Template render HTML gửi mã OTP
│   ├── otp.controller.ts                   # POST /auth/verify-email, POST /auth/resend-otp
│   ├── otp.controller.spec.ts              # Unit test riêng cho OtpController
│   ├── otp.service.ts                      # Sinh mã OTP, mã hóa HMAC-SHA256, gửi email SMTP
│   ├── otp-flow.service.ts                 # Flow xác thực OTP & rate limit resend OTP
│   ├── otp.module.ts                       # NestJS module của OTP feature
│   └── index.ts
│
├── login/                                   # [Feature: Đăng nhập & Quản lý phiên]
│   ├── dto/
│   │   ├── login.dto.ts
│   │   ├── refresh-token.dto.ts
│   │   ├── logout.dto.ts
│   │   └── auth-responses.dto.ts
│   ├── login.controller.ts                 # POST /auth/login, refresh, logout; GET /auth/me
│   ├── login.controller.spec.ts            # Unit test riêng cho LoginController
│   ├── login-flow.service.ts               # Flow xác thực thông tin, cấp phát & thu hồi session
│   ├── login.module.ts                     # NestJS module của Login feature
│   └── index.ts
│
├── health/                                  # [Feature: Health Check]
│   ├── health.controller.ts                # GET /health
│   ├── health.controller.spec.ts
│   └── health.module.ts
│
├── common/                                  # [Cross-cutting Infrastructure & Shared Utilities]
│   ├── auth-common.module.ts               # Global Module cung cấp DB, Throttler, RPC, Session, Outbox, Seed
│   ├── constants/
│   │   └── auth.constants.ts               # Các hằng số định danh, rate limit, header names
│   ├── dto/
│   │   └── auth-responses.dto.ts           # DTO response chuẩn dùng chung (AuthSuccessResponse, MeResponse, ...)
│   ├── outbox/
│   │   └── auth-outbox.repository.ts       # Triển khai Outbox Repository với Prisma Auth
│   ├── rate-limit/
│   │   ├── rate-limiter.service.ts         # Service rate limit bọc ThrottlerStorage
│   │   └── rate-limiter.service.spec.ts
│   ├── rpc/
│   │   └── user-trust.client.ts            # Client giao tiếp RPC RabbitMQ sang user-trust-service
│   ├── seed/
│   │   └── auth-seed.service.ts            # Tự động khởi tạo roles, permissions khi service bootstrap
│   ├── session/
│   │   └── session.service.ts              # Quản lý vòng đời refresh token, ký JWT, rotation
│   └── utils/
│       ├── auth-response.builder.ts        # Builder chuẩn hóa cấu trúc JSON trả về client
│       ├── client-ip.util.ts               # Helper trích xuất & xác minh IP an toàn chống spoofing
│       ├── phone.util.ts                   # Chuẩn hóa số điện thoại di động VN sang chuẩn E.164
│       └── phone.util.spec.ts
│
├── auth-service.controller.ts               # Facade controller (giữ tương thích ngược cho test suites)
├── auth-service.service.ts                  # Facade service (giữ tương thích ngược cho test suites)
├── auth-service.module.ts                   # Root Module: import AuthCommonModule + Feature Modules
├── auth.constants.ts                        # Re-export tiện ích
└── main.ts                                  # Entry point bootstrap ứng dụng
```

---

## 4. Danh sách các thành phần tàn dư đã được dọn dẹp

| Thành phần cũ bị xóa | Lý do xóa | Vị trí thay thế mới |
| :--- | :--- | :--- |
| `src/dto/*` (7 files) | Chỉ là file shim re-export DTO 1 dòng | Nằm trực tiếp tại `dto/` của từng feature (`register/dto`, `otp/dto`, `login/dto`) và `common/dto/` |
| `src/flows/*` (3 files) | Chỉ là file shim re-export Service 1 dòng | Nằm trực tiếp tại từng feature tương ứng (`register/`, `otp/`, `login/`) |
| `src/rate-limit/` | Thành phần hạ tầng dùng chung bị đặt ngang cấp feature | Chuyển vào `src/common/rate-limit/` |
| `src/session/` | Quản lý hạ tầng session DB bị đặt ngang cấp feature | Chuyển vào `src/common/session/` |
| `src/rpc/` | Client RPC hạ tầng RabbitMQ | Chuyển vào `src/common/rpc/` |
| `src/outbox/` | Outbox pattern repository hạ tầng | Chuyển vào `src/common/outbox/` |
| `src/outbox/outbox-publisher.service.ts` | File re-export thừa thãi | Import trực tiếp từ `@app/common` |
| `src/seed/` | Hạ tầng seed quyền & role | Chuyển vào `src/common/seed/` |
| `src/utils/` | Tiện ích chung bị đặt ngang hàng feature | Chuyển vào `src/common/utils/` |
| `src/templates/template.html` | Bị duplicate thừa thãi | Đã có sẵn trong `libs/common/src/templates/template.html` |

---

## 5. Kết quả kiểm thử & Đảm bảo chất lượng (QA Verification)

Tất cả các bài test từ unit, integration đến e2e đã được thực thi và xác nhận hoạt động 100%:

### 5.1. Vitest Unit & Integration Test
- **Tổng số test files auth-service:** 11/11 files passed.
- **Tổng số unit/integration tests:** **89/89 tests passed 100%**.
  - `auth-service.service.spec.ts`: 25 passed.
  - `auth-flows-concurrency-security.spec.ts`: 15 passed.
  - `auth-di-signing.spec.ts`: 8 passed.
  - `phone.util.spec.ts`: 8 passed.
  - `rate-limiter.service.spec.ts`: 8 passed.
  - `otp.service.spec.ts`: 8 passed.
  - `login.controller.spec.ts`: 5 passed.
  - `register.controller.spec.ts`: 4 passed.
  - `auth-service.controller.spec.ts`: 4 passed.
  - `otp.controller.spec.ts`: 3 passed.
  - `health.controller.spec.ts`: 1 passed.
- **Toàn bộ monorepo test:** **42/42 test files passed, 153/153 tests passed 100%**.

### 5.2. Vitest E2E Test
- `test/app.e2e-spec.ts`: **3/3 tests passed 100%** (kiểm tra `/health`, `/auth/me` yêu cầu xác thực 401, và route không tồn tại trả về 404).

### 5.3. TypeScript Typecheck
- Lệnh: `pnpm run typecheck` (`tsc -b --force`)
- Kết quả: **0 lỗi compilation**.

### 5.4. Linter (Oxlint)
- Lệnh: `pnpm run lint` (`oxlint apps/ libs/ *.ts`)
- Kết quả: **0 warnings, 0 errors** trên 207 files.

---

## 6. Hướng dẫn mở rộng tính năng mới theo Feature-Based

Khi nhóm phát triển muốn bổ sung một tính năng mới vào `auth-service` (ví dụ: `password-reset`, `oauth2`):
1. **Tạo thư mục feature tại `src/<feature-name>/`:**
   ```
   src/password-reset/
   ├── dto/
   │   ├── forgot-password.dto.ts
   │   └── reset-password.dto.ts
   ├── password-reset.controller.ts   # @Controller('auth') với route tương ứng
   ├── password-reset.service.ts      # Logic nghiệp vụ
   ├── password-reset.module.ts       # Module NestJS
   └── index.ts
   ```
2. **Tận dụng `AuthCommonModule`:**
   - Các dịch vụ dùng chung (`AuthPrismaService`, `RateLimiterService`, `SessionService`, `TokenSignerService`, ...) đã được cung cấp toàn cục thông qua `AuthCommonModule`, chỉ cần inject vào service mà không phải import lặp lại nhiều lần.
3. **Đăng ký module vào `AuthServiceModule`:**
   - Thêm `PasswordResetModule` vào mảng `imports` trong [auth-service.module.ts](file:///Users/apple/QUOCDUY/PBL6/backend/apps/auth-service/src/auth-service.module.ts).
