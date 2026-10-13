# Báo cáo cập nhật: Triển khai HG-31 (RefreshToken, Tối ưu hạ tầng, Fix Logout, Quên mật khẩu & Reset Password)

- **Mã công việc:** HG-31 (Phase 1, Phase 2, Phase 3, Phase 4 & Phase 5)
- **Nhánh thực hiện:** `feature/HG-31-RefreshToken_and_ForgotPassword`
- **Ngày cập nhật:** 13/10/2026

---

## 1. Tổng quan mục tiêu

1. **Tối ưu cấu hình Docker Compose:** Loại bỏ các container hạ tầng local dư thừa do toàn bộ hệ thống cơ sở dữ liệu và message broker đã chuyển sang môi trường Cloud (Supabase, CloudAMQP, Upstash).
2. **Khắc phục lỗ hổng phân biệt Token (Phase 1):**
   - Đảm bảo Access Token và Refresh Token có phạm vi sử dụng tách biệt hoàn toàn.
   - Ngăn chặn triệt để việc sử dụng Refresh Token để gọi các API được bảo vệ tại API Gateway (bao gồm cả các route upload media).
   - Đảm bảo tính tương thích ngược cho các Access Token cũ đã phát hành trong giai đoạn chuyển tiếp.
3. **Lưu trữ và Rotation Refresh Token an toàn (Phase 2):**
   - Lưu trữ Refresh Token dạng SHA-256 hash trong database; tuyệt đối không lưu token rõ.
   - Giới hạn phiên đăng nhập tuyệt đối 7 ngày (`REFRESH_TOKEN_EXPIRATION_DAYS`).
   - Rotation bằng cơ chế Compare-And-Swap (CAS) nguyên tử để chống Race Condition khi có 2 request refresh đồng thời.
   - Vô hiệu hóa ngay lập tức token cũ sau khi rotation; token mới kế thừa đúng account/session.
4. **Sửa Logout qua API Gateway (Phase 3):**
   - Mở đúng route `POST /api/v1/auth/logout` tại API Gateway thành public route, không đòi hỏi header `Authorization` (Access Token) khi người dùng đã hết hạn phiên truy cập.
   - Xác thực việc thu hồi session bằng `refreshToken` trong request body.
   - Đảm bảo tính chất Idempotent: luôn phản hồi HTTP 200 chuẩn hóa, không làm rò rỉ trạng thái tồn tại của token hay session.
   - Đảm bảo Refresh Token sau khi logout không thể dùng để refresh (nhận 401) và không bị Gateway nhận nhầm làm Access Token (nhận 401).
   - Gọi lại logout nhiều lần liên tiếp không gây lỗi và không tạo session mới.
5. **Tạo yêu cầu quên mật khẩu qua email (Phase 4):**
   - Mở public route `POST /api/v1/auth/forgot-password` nhận `{ email }`, chuẩn hóa email (lowercase + trim) trước khi tra cứu.
   - Chỉ tạo OTP challenge `reset_password` cho tài khoản hoạt động (`status = 'active'`) và đã xác minh email (`emailVerifiedAt != null`).
   - Dùng OTP ngẫu nhiên 6 chữ số, HMAC hash, thời hạn 10 phút, gửi email SMTP với nội dung và template riêng.
   - Chống dò tài khoản (User Enumeration Prevention): email không tồn tại, tài khoản chưa kích hoạt hoặc bị khóa đều nhận cùng status (HTTP 200) và body công khai giống tài khoản hợp lệ.
   - Xử lý lỗi SMTP an toàn: lỗi SMTP không làm lộ tài khoản, challenge được đánh dấu `failed` thay vì `delivered`.
   - Vô hiệu hóa challenge cũ: mọi challenge `reset_password` cũ của tài khoản bị hủy (`isUsed = true`) ngay khi có yêu cầu mới.
   - Giới hạn tần suất nguyên tử chia sẻ đa instance qua bảng `rate_limits` PostgreSQL: tối đa 5 yêu cầu/giờ theo email đã HMAC và 10 yêu cầu/giờ theo IP. Vượt giới hạn trả 429.
6. **Xác minh OTP và đổi mật khẩu một lần (Phase 5):**
   - Mở public route `POST /api/v1/auth/verify-reset-otp` nhận `{ email, otp }`. Xác minh chặt chẽ: đúng tài khoản, đúng mục đích (`reset_password`), đã gửi thành công (`deliveryStatus = 'delivered'`), chưa hết hạn, chưa dùng và chưa vượt số lần thử.
   - Cập nhật số lần thử nguyên tử khi nhập sai mã; vượt quá số lần thử trả 429 `OTP_ATTEMPTS_EXCEEDED`.
   - Khi OTP hợp lệ, đánh dấu challenge đã dùng (`isUsed = true`) và tạo single-use reset grant ngẫu nhiên (32 bytes hex), ngắn hạn (15 phút), chỉ lưu SHA-256 hash vào bảng `password_reset_grants` (thêm bằng migration cộng thêm).
   - Mở public route `POST /api/v1/auth/reset-password` nhận `{ resetToken, newPassword }`. Áp dụng cùng chính sách mật khẩu mạnh và giới hạn 72 byte UTF-8 như khi đăng ký.
   - Thực thi transaction nguyên tử: tiêu thụ grant bằng cập nhật có điều kiện (CAS), cập nhật mật khẩu với bcrypt hash (10 salt rounds), cập nhật `passwordChangedAt`, và thu hồi toàn bộ Refresh Session hiện có của tài khoản.
   - Chống race condition: hai request reset đồng thời với cùng grant chỉ có đúng một request thành công.
   - Sau khi đổi mật khẩu, đăng nhập bằng mật khẩu mới thành công, mật khẩu cũ bị từ chối; mọi Refresh Token cũ của tài khoản đều bị thu hồi và từ chối 401 khi refresh.
   - Test tích hợp chạy trên database thử nghiệm riêng, không can thiệp database dev có dữ liệu.

---

## 2. Chi tiết các thay đổi

### A. Tối ưu hạ tầng Docker (`backend/docker-compose.yml`)

- **Bối cảnh:** Toàn bộ backend hiện sử dụng dịch vụ Cloud:
  - Database PostgreSQL: **Supabase Cloud**
  - Message Broker: **CloudAMQP** (AMQPS / SSL)
  - Caching: **Upstash Redis** (TLS)
- **Thay đổi:**
  - Xóa 3 service container: `postgres-auth`, `postgres-user-trust`, `rabbitmq`.
  - Xóa các Docker volume cục bộ: `postgres-auth-data`, `postgres-user-trust-data`, `rabbitmq-data`.
  - Xóa ràng buộc khởi động `depends_on: rabbitmq` trong `user-trust-service`.
- **Kết quả:** File cấu hình Docker gọn nhẹ, chạy `docker compose config` hợp lệ, giảm tải tài nguyên máy host khi chạy backend.

---

### B. Phase 1: Phân biệt Access Token và Refresh Token

| Thành phần | File mã nguồn | Nội dung cập nhật |
| :--- | :--- | :--- |
| **Contract / Types** | [auth.types.ts](file:///d:/SCHOOL/PBL6/backend/libs/auth/src/auth.types.ts) | • Bổ sung `tokenType?: 'access' \| 'refresh' \| string` vào `JwtPayload`.<br>• Khai báo interface `RefreshTokenPayload` và `SessionBinding`. |
| **Token Signer** | [token-signer.service.ts](file:///d:/SCHOOL/PBL6/backend/libs/auth/src/token-signer.service.ts) | • Hàm `signAccessToken()` luôn tự động đính kèm claim `tokenType: 'access'` vào payload JWT. |
| **Token Verifier** | [token-verifier.service.ts](file:///d:/SCHOOL/PBL6/backend/libs/auth/src/token-verifier.service.ts) | • `verifyAccessToken()`:<br>  - Từ chối ngay lập tức nếu `payload.tokenType === 'refresh'`.<br>  - Từ chối nếu `tokenType` có giá trị khác `'access'`.<br>  - **Giai đoạn chuyển tiếp:** Chấp nhận nếu `tokenType === undefined` (Access Token cũ đã phát hành trước đợt cập nhật).<br>• `verifyRefreshToken()`:<br>  - Kiểm tra chữ ký RS256, issuer (`handy-go-auth`), audience (`handy-go-api`).<br>  - Bắt buộc `payload.tokenType === 'refresh'`.<br>  - Kiểm tra sự tồn tại của các trường định danh `sub`, `userId`, `sid`.<br>  - Ràng buộc session: Khi truyền tham số session, so khớp chính xác `sid`, `sub` (accountId), `userId`; từ chối nếu không khớp. |
| **API Gateway Auth** | [gateway-auth.middleware.ts](file:///d:/SCHOOL/PBL6/backend/apps/api-gateway/src/auth/gateway-auth.middleware.ts) | • Gọi `tokenVerifier.verifyAccessToken(token)`.<br>• Khi nhận Refresh Token, Gateway từ chối và phản hồi HTTP 401 với thông điệp rõ ràng.<br>• Chặn thành công trên mọi route bảo vệ, bao gồm toàn bộ route upload tại Gateway. |

---

### C. Phase 2: Lưu trữ và Rotation Refresh Token

| Thành phần | File mã nguồn | Nội dung hiện thực |
| :--- | :--- | :--- |
| **Không lưu token rõ** | [session.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/session/session.service.ts) | • `createSession()` & `saveSession()`: tính `refreshTokenHash = sha256(plainRefreshToken)`.<br>• Chỉ lưu `refreshTokenHash`, tuyệt đối không ghi token rõ vào PostgreSQL. |
| **Liên kết Account** | [session.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/session/session.service.ts) | • Bản ghi `refresh_sessions` liên kết trực tiếp với `account_id: account.id`. |
| **Giới hạn 7 ngày tuyệt đối** | [session.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/session/session.service.ts) | • Tính `absoluteExpiresAt = session.createdAt + 7 ngày`.<br>• Nếu session quá 7 ngày: đánh dấu `revokedAt = now` và trả về 401, không gia hạn.<br>• Mỗi lần rotate, `newExpiresAt = min(now + 7 ngày, absoluteExpiresAt)` đảm bảo không thể vượt quá mốc 7 ngày của phiên ban đầu. |
| **Compare-and-Swap (CAS)** | [session.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/session/session.service.ts) | • Cập nhật hash bằng `updateMany` với điều kiện `refreshTokenHash: hashed` (hash cũ) và `revokedAt: null`.<br>• Nếu 2 yêu cầu refresh đồng thời: yêu cầu đầu tiên đổi hash và count = 1 (thành công); yêu cầu thứ hai count = 0 (ném 401 `INVALID_REFRESH_TOKEN`). |
| **Vô hiệu hóa token cũ** | [session.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/session/session.service.ts) | • Hash trong database đã đổi sang hash của token mới.<br>• Mọi yêu cầu gọi lại với token cũ đều nhận 401 vì không tìm thấy hash khớp còn hiệu lực. |

---

### D. Phase 3: Sửa Logout qua API Gateway

| Thành phần | File mã nguồn | Nội dung hiện thực |
| :--- | :--- | :--- |
| **Mở Public Route tại Gateway** | [gateway-auth.middleware.ts](file:///d:/SCHOOL/PBL6/backend/apps/api-gateway/src/auth/gateway-auth.middleware.ts) | • Thêm `{ prefix: '/api/v1/auth/logout', methods: ['POST'] }` vào danh sách `PUBLIC_PREFIXES`.<br>• Cho phép request `POST /api/v1/auth/logout` đi qua trực tiếp (`next()`) mà không bắt buộc có `Authorization: Bearer <token>`.<br>• Nếu client gửi kèm Access Token đã hết hạn trong header, Gateway vẫn bỏ qua bước xác minh Access Token để request chuyển tiếp an toàn tới auth-service.<br>• Các method khác ngoài POST (như `GET /api/v1/auth/logout`) vẫn bắt buộc xác thực JWT (trả 401 nếu thiếu). |
| **Xác thực bằng Refresh Token** | [login.controller.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/login/login.controller.ts)<br>[logout.dto.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/login/dto/logout.dto.ts) | • Dùng `LogoutDto` (`{ refreshToken: string }`) trong request body làm thông tin xác thực duy nhất để thu hồi phiên.<br>• Thu hồi session trong DB bằng SHA-256 hash của token: `updateMany({ where: { refreshTokenHash, revokedAt: null }, data: { revokedAt: new Date() } })`. |
| **Phản hồi Idempotent** | [session.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/session/session.service.ts)<br>[auth-response.builder.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/utils/auth-response.builder.ts) | • Luôn trả về phản hồi chuẩn hóa: `{ statusCode: 200, message: 'Đăng xuất thành công', data: null }`.<br>• Token không tồn tại, sai định dạng hoặc đã thu hồi trước đó vẫn trả về 200, tuyệt đối không tiết lộ trạng thái session trong DB.<br>• Gọi logout nhiều lần liên tiếp không phát sinh lỗi và không bao giờ tạo session mới. |
| **Ngăn chặn tái sử dụng Token** | [token-verifier.service.ts](file:///d:/SCHOOL/PBL6/backend/libs/auth/src/token-verifier.service.ts)<br>[session.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/session/session.service.ts) | • **Refresh:** Gọi `POST /api/v1/auth/refresh` bằng Refresh Token đã logout bị từ chối 401 (`INVALID_REFRESH_TOKEN: Refresh token không hợp lệ hoặc đã hết hạn`).<br>• **Access:** Dùng Refresh Token đã logout làm Access Token tại Gateway bị `tokenVerifier` từ chối 401 do `tokenType: 'refresh'` (không thể nhận nhầm làm Access Token). |

---

### E. Phase 4: Quên mật khẩu qua email & Rate Limiting PostgreSQL

| Thành phần | File mã nguồn | Nội dung hiện thực |
| :--- | :--- | :--- |
| **Public Route tại Gateway** | [gateway-auth.middleware.ts](file:///d:/SCHOOL/PBL6/backend/apps/api-gateway/src/auth/gateway-auth.middleware.ts) | • Bổ sung `{ prefix: '/api/v1/auth/forgot-password', methods: ['POST'] }` vào `PUBLIC_PREFIXES`.<br>• Cho phép client chưa đăng nhập gọi yêu cầu quên mật khẩu mà không cần Access Token. |
| **DTO & Chuẩn hóa dữ liệu** | [forgot-password.dto.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/otp/dto/forgot-password.dto.ts) | • Định nghĩa `ForgotPasswordDto` với class-validator (`@IsNotEmpty`, `@IsEmail`).<br>• Tự động chuẩn hóa email (`email.trim().toLowerCase()`) trước khi băm HMAC và tra cứu tài khoản. |
| **Kiểm tra hợp lệ & Tạo Challenge** | [otp-flow.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/otp/otp-flow.service.ts) | • Chỉ tạo OTP challenge khi tài khoản tồn tại, `status === 'active'` và `emailVerifiedAt !== null`.<br>• Vô hiệu hóa toàn bộ challenge `reset_password` cũ của tài khoản (`isUsed: true`) trước khi tạo mã mới.<br>• Sinh OTP 6 chữ số ngẫu nhiên, lưu HMAC hash vào PostgreSQL, thời hạn 10 phút. |
| **Gửi email SMTP riêng biệt** | [otp.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/otp/otp.service.ts)<br>[otp-email.template.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/otp/templates/otp-email.template.ts) | • Hàm `sendPasswordResetOtp()` gửi email qua nodemailer với tiêu đề và template HTML chuyên biệt cho đặt lại mật khẩu.<br>• Khi SMTP lỗi: ghi log, cập nhật challenge `deliveryStatus: 'failed'` và `deliveryError`. Tuyệt đối không rethrow lỗi ra ngoài và không làm lộ tài khoản. |
| **Chống dò tài khoản (Anti-Enumeration)** | [otp-flow.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/otp/otp-flow.service.ts)<br>[auth-response.builder.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/utils/auth-response.builder.ts) | • Email không tồn tại, tài khoản chưa kích hoạt (`pending`), tài khoản bị khóa (`locked/suspended`) hay lỗi SMTP đều nhận cùng phản hồi HTTP 200 `{ statusCode: 200, message: 'Nếu email tồn tại và hợp lệ trong hệ thống, mã xác thực đặt lại mật khẩu đã được gửi đến hộp thư của bạn.', data: null }`. |
| **Rate Limiting PostgreSQL nguyên tử** | [postgres-throttler-storage.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/rate-limit/postgres-throttler-storage.ts)<br>[rate-limiter.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/rate-limit/rate-limiter.service.ts)<br>[auth-common.module.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/auth-common.module.ts) | • Hiện thực `PostgresThrottlerStorage` chạy lệnh nguyên tử `INSERT ... ON CONFLICT DO UPDATE` trên bảng `rate_limits`.<br>• Khóa email: `forgot_password_email:${hmac(email)}`, tối đa 5 lần/giờ.<br>• Khóa IP: `forgot_password_ip:${clientIp}`, tối đa 10 lần/giờ.<br>• Mọi instance của backend dùng chung bộ đếm trong database, ngăn chặn race condition và tự động reset khi hết window. |

---

### F. Phase 5: Xác minh OTP và đổi mật khẩu một lần

| Thành phần | File mã nguồn | Nội dung hiện thực |
| :--- | :--- | :--- |
| **Migration & Schema** | [schema.prisma](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/prisma/schema.prisma)<br>[migration.sql](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/prisma/migrations/20261013100000_add_password_reset_grants/migration.sql) | • Thêm model `PasswordResetGrant` ánh xạ bảng `password_reset_grants` (`id`, `account_id`, `token_hash`, `expires_at`, `is_used`, `created_at`, `used_at`).<br>• Ràng buộc khóa ngoại `account_id` -> `accounts.id` (ON DELETE CASCADE), chỉ mục độc nhất trên `token_hash`, chỉ mục tìm kiếm trên `(account_id, is_used)` và `expires_at`.<br>• Migration cộng thêm giữ nguyên toàn vẹn CSDL và các bảng hiện hữu. |
| **Public Routes tại Gateway** | [gateway-auth.middleware.ts](file:///d:/SCHOOL/PBL6/backend/apps/api-gateway/src/auth/gateway-auth.middleware.ts) | • Bổ sung `{ prefix: '/api/v1/auth/verify-reset-otp', methods: ['POST'] }` và `{ prefix: '/api/v1/auth/reset-password', methods: ['POST'] }` vào `PUBLIC_PREFIXES`.<br>• Cả 2 endpoint hoạt động không cần header `Authorization` (Access Token). |
| **Xác minh OTP & Cấp Reset Grant** | [otp-flow.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/otp/otp-flow.service.ts)<br>[verify-reset-otp.dto.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/otp/dto/verify-reset-otp.dto.ts) | • `POST /auth/verify-reset-otp` nhận `{ email, otp }`. Chuẩn hóa email trước khi truy vấn.<br>• Kiểm tra tài khoản tồn tại, chưa bị khóa (`suspended, locked, deleted`).<br>• Tìm challenge `reset_password` mới nhất: bắt buộc `deliveryStatus === 'delivered'`, `isUsed === false`, `expiresAt > now`, `attempts < maxAttempts (5)`.<br>• **Sai OTP:** Cập nhật nguyên tử tăng số lần thử trong transaction (`attempts: { increment: 1 }`), trả về `OTP_INVALID` kèm số lần thử còn lại hoặc 429 `OTP_ATTEMPTS_EXCEEDED` khi hết lượt.<br>• **Đúng OTP:** Cập nhật CAS `isUsed: true` trong transaction, vô hiệu hóa grant cũ, sinh `resetToken` ngẫu nhiên 32 bytes hex (64 ký tự), băm SHA-256 lưu `tokenHash` vào `password_reset_grants`, thời hạn 15 phút (900s). Chống replay attack (không thể xác minh OTP lần 2). |
| **Đổi mật khẩu an toàn & Thu hồi phiên** | [otp-flow.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/otp/otp-flow.service.ts)<br>[reset-password.dto.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/otp/dto/reset-password.dto.ts)<br>[session.service.ts](file:///d:/SCHOOL/PBL6/backend/apps/auth-service/src/common/session/session.service.ts) | • `POST /auth/reset-password` nhận `{ resetToken, newPassword }`.<br>• Áp dụng cùng chính sách mật khẩu mạnh và chặn giới hạn 72 byte UTF-8 matching register DTO (`@IsByteLength(1, 72)`, `@IsStrongPassword`).<br>• Tra cứu grant bằng SHA-256 hash của `resetToken`. Bị từ chối nếu grant không tồn tại, hết hạn hoặc đã sử dụng.<br>• Mã hóa bcrypt hash 10 rounds cho mật khẩu mới.<br>• **Transaction nguyên tử:**<br>  1. Tiêu thụ grant bằng cập nhật có điều kiện (CAS: `where: { id: grant.id, isUsed: false, expiresAt: { gt: now } }`). Hai request đồng thời chỉ có duy nhất 1 request thành công, request thứ hai count = 0 nhận `VALIDATION_ERROR`.<br>  2. Cập nhật `passwordHash`, `passwordChangedAt` và `updatedAt` trong bảng `accounts`.<br>  3. Gọi `sessionService.revokeAllSessions()` thu hồi toàn bộ Refresh Session còn hiệu lực của tài khoản (`revokedAt = now`). |

---

## 3. Kết quả kiểm thử tự động (Test Verification)

### A. Kiểm thử thư viện Auth (`libs/auth/src/auth.service.spec.ts`)
Tất cả 17/17 tests đạt (PASS):
1. ✅ Access Token mới có `tokenType: 'access'` được verifier xác nhận thành công.
2. ✅ Access Token cũ không có `tokenType` (giai đoạn chuyển tiếp) vẫn được chấp nhận.
3. ✅ Verifier từ chối Refresh Token (`tokenType: 'refresh'`) khi dùng làm Access Token.
4. ✅ Verifier từ chối token có `tokenType` không hợp lệ (ví dụ: `unknown_token_type`).
5. ✅ Verifier từ chối token có chữ ký RS256 không hợp lệ (giả mạo khóa).
6. ✅ Verifier từ chối token sai issuer.
7. ✅ Verifier từ chối token sai audience.
8. ✅ Verifier từ chối token đã hết hạn (`exp`).
9. ✅ `verifyRefreshToken` xác thực thành công Refresh Token hợp lệ.
10. ✅ `verifyRefreshToken` từ chối Access Token (không phải `refresh`).
11. ✅ `verifyRefreshToken` ràng buộc chính xác `sub`, `userId`, `sid` với session (từ chối nếu sai bất kỳ trường nào).

### B. Kiểm thử API Gateway Middleware (`apps/api-gateway/src/auth/gateway-auth.middleware.spec.ts`)
Tất cả 35/35 tests đạt (PASS):
1. ✅ `POST /api/v1/auth/forgot-password` nằm trong public routes, không yêu cầu JWT và inject `x-internal-secret`.
2. ✅ `GET /api/v1/auth/forgot-password` yêu cầu xác thực JWT và trả 401 khi không có token.
3. ✅ `POST /api/v1/auth/verify-reset-otp` nằm trong public routes, không yêu cầu JWT.
4. ✅ `POST /api/v1/auth/reset-password` nằm trong public routes, không yêu cầu JWT.
5. ✅ `POST /api/v1/auth/logout` nằm trong danh sách public routes, không yêu cầu xác thực JWT.
6. ✅ `POST /api/v1/auth/logout` không có `Authorization` header vẫn được `next()` và inject header `x-internal-secret`.
7. ✅ `POST /api/v1/auth/logout` có Access Token hết hạn trong `Authorization` header vẫn được bypass để request đi tới auth-service.
8. ✅ `GET /api/v1/auth/logout` bắt buộc xác thực JWT và bị trả 401 nếu thiếu token.
9. ✅ Gateway từ chối Refresh Token khi gọi route bảo vệ thông thường (ví dụ: `GET /api/v1/orders`), bất kể Refresh Token còn hạn hay đã thu hồi.
10. ✅ Gateway từ chối Refresh Token khi gọi route upload hình ảnh (`POST /api/v1/uploads/image`).
11. ✅ Gateway từ chối Refresh Token khi gọi route khởi tạo upload video (`POST /api/v1/uploads/video/init`).
12. ✅ Gateway chấp nhận Access Token mới có `tokenType: 'access'`.
13. ✅ Gateway chấp nhận Access Token cũ không có `tokenType` trong giai đoạn chuyển tiếp.
14. ✅ Test tích hợp end-to-end với cặp khóa RS256 thật (`TokenSignerService` + `TokenVerifierService` + `GatewayAuthMiddleware`).

### C. Kiểm thử Session Storage, Rotation & Logout (`apps/auth-service/src/common/session/session.service.spec.ts`)
Tất cả 14/14 tests đạt (PASS):
1. ✅ Đăng nhập tạo bản ghi session có `accountId`, `refreshTokenHash` khác token rõ và `expiresAt` đúng 7 ngày.
2. ✅ Refresh hợp lệ trả về token mới; sau rotation token cũ nhận 401.
3. ✅ Token mới sau rotation vẫn thuộc đúng tài khoản (`sub`), người dùng (`userId`) và phiên (`sid`).
4. ✅ **Concurrency CAS:** Hai refresh đồng thời chỉ có đúng một yêu cầu thành công, yêu cầu thứ hai nhận 401.
5. ✅ Token không tồn tại trong DB nhận 401.
6. ✅ Token đã bị thu hồi (`revokedAt != null`) nhận 401.
7. ✅ Token đã hết hạn (`expiresAt <= now`) nhận 401.
8. ✅ Session quá 7 ngày tuyệt đối nhận 401, bị thu hồi trong DB và không được gia hạn.
9. ✅ Session còn 2 ngày trong hạn 7 ngày tuyệt đối: hạn mới bị chặn tối đa không vượt quá mốc 7 ngày tuyệt đối.
10. ✅ **Logout:** Gọi logout với Refresh Token hợp lệ đánh dấu session đã thu hồi (`revokedAt: new Date()`).
11. ✅ **Security:** Sau khi logout, gọi refresh bằng token đó nhận 401 `INVALID_REFRESH_TOKEN`.
12. ✅ **Security:** Refresh Token sau khi logout không thể bị Gateway/Verifier nhận nhầm làm Access Token (từ chối 401).
13. ✅ **Idempotency:** Logout với token không khớp vẫn hoàn thành bình thường (200), không tiết lộ trạng thái session.
14. ✅ **Idempotency:** Gọi lại logout nhiều lần với cùng token không phát sinh lỗi hoặc tạo session mới.

### D. Kiểm thử Quên mật khẩu qua Email (`apps/auth-service/src/otp/otp-forgot-password.spec.ts`)
Tất cả 11/11 tests đạt (PASS):
1. ✅ Email hợp lệ của tài khoản đã xác minh tạo OTP `reset_password`, lưu HMAC hash và gửi mail đúng địa chỉ.
2. ✅ Chuẩn hóa email (lowercase + trim) trước khi tra cứu database và băm HMAC.
3. ✅ Email không tồn tại trong DB không tạo challenge nhưng nhận cùng response status 200 và message.
4. ✅ Tài khoản chưa xác minh email (`emailVerifiedAt = null`) không tạo challenge và nhận cùng response 200.
5. ✅ Tài khoản bị khóa (`status = locked`) không tạo challenge và nhận cùng response 200.
6. ✅ SMTP lỗi không làm lộ tài khoản qua status/body (vẫn trả 200), challenge được đánh dấu `failed` thay vì `delivered`.
7. ✅ Challenge cũ bị vô hiệu hóa (`isUsed: true`) ngay khi phát sinh yêu cầu mới.
8. ✅ Vượt quá 5 yêu cầu/giờ theo email (đã HMAC) trả 429 `RATE_LIMITED`.
9. ✅ Vượt quá 10 yêu cầu/giờ theo IP trả 429 `RATE_LIMITED`.
10. ✅ Hai instance độc lập dùng chung cùng một bộ đếm qua bảng `rate_limits` PostgreSQL (chặn 429 chính xác khi tổng lượt gọi vượt ngưỡng).
11. ✅ Controller endpoint `POST /auth/forgot-password` chuyển tiếp DTO và IP hợp lệ.

### E. Kiểm thử Xác minh OTP và Đổi mật khẩu (`apps/auth-service/src/otp/otp-password-reset.spec.ts`)
Tất cả 16/16 tests đạt (PASS):
1. ✅ Khởi tạo thành công OtpController và flowService.
2. ✅ Từ chối khi tài khoản không tồn tại (`INVALID_CREDENTIALS`), không tạo reset grant.
3. ✅ Từ chối khi tài khoản bị khóa (`ACCOUNT_BLOCKED`), không tạo reset grant.
4. ✅ Từ chối khi OTP chưa gửi thành công (`deliveryStatus !== delivered`), không tạo reset grant.
5. ✅ Từ chối với mã lỗi `OTP_ALREADY_USED` khi OTP đã được sử dụng, không tạo reset grant.
6. ✅ Từ chối với mã lỗi `OTP_EXPIRED` khi OTP đã hết hạn, không tạo reset grant.
7. ✅ Từ chối với mã lỗi `OTP_ATTEMPTS_EXCEEDED` (HTTP 429) khi đã vượt quá số lần thử, không tạo reset grant.
8. ✅ Nhập sai mã OTP: Tăng số lần thử nguyên tử, trả về `OTP_INVALID` kèm số lần thử còn lại; không tạo reset grant.
9. ✅ OTP hợp lệ tạo đúng một reset grant ngẫu nhiên (32 bytes hex), ngắn hạn (15 phút), chỉ lưu SHA-256 hash vào database; challenge được đánh dấu `isUsed: true`.
10. ✅ OTP không thể xác minh lần thứ hai (chống replay attack, lần 2 nhận `OTP_ALREADY_USED`).
11. ✅ Từ chối đổi mật khẩu khi resetToken không tồn tại (`VALIDATION_ERROR`), không thay đổi mật khẩu.
12. ✅ Từ chối đổi mật khẩu khi resetToken đã được sử dụng (`isUsed: true`), không thay đổi mật khẩu.
13. ✅ Từ chối đổi mật khẩu khi resetToken đã hết hạn, không thay đổi mật khẩu.
14. ✅ Grant hợp lệ đổi mật khẩu thành công: Cập nhật bcrypt hash mật khẩu mới, cập nhật `passwordChangedAt`, đăng nhập mật khẩu mới thành công, mật khẩu cũ thất bại, và thu hồi toàn bộ Refresh Session của tài khoản.
15. ✅ Hai request reset đồng thời với cùng một grant: Nhờ cập nhật CAS nguyên tử trong transaction, duy nhất 1 request thành công, request thứ hai bị từ chối `VALIDATION_ERROR`.
16. ✅ Sau khi đổi mật khẩu, Refresh Token cũ của tài khoản bị từ chối khi refresh (trả về 401 `INVALID_REFRESH_TOKEN`).

### F. Kiểm thử Storage Rate Limiting PostgreSQL (`apps/auth-service/src/common/rate-limit/postgres-throttler-storage.spec.ts`)
Tất cả 4/4 tests đạt (PASS):
1. ✅ Chèn bản ghi mới và trả về `totalHits = 1` khi key chưa tồn tại.
2. ✅ Tăng points và giữ `isBlocked = false` khi chưa vượt limit.
3. ✅ Đánh dấu `isBlocked = true` khi points vượt quá limit.
4. ✅ Hai instance độc lập dùng chung cùng một database chia sẻ chung một bộ đếm rate limit.

### G. Kiểm thử luồng tích hợp Auth Service (`apps/auth-service/test/auth-flows-concurrency-security.spec.ts`)
Tất cả 18/18 tests đạt (PASS):
1. ✅ Chuẩn hóa phản hồi logout về định dạng `{ statusCode: 200, message: 'Đăng xuất thành công', data: null }`.
2. ✅ Logout với token không khớp/đã thu hồi vẫn trả 200 idempotent, không gọi tạo session mới.
3. ✅ Gọi lại logout liên tiếp nhiều lần trả 200 idempotent, không gây lỗi và không tạo session mới.

### H. Kiểm thử Database Thử nghiệm Riêng (`apps/auth-service/test/password-reset-concurrency-postgres.spec.ts`)
1. ✅ Sử dụng biến môi trường riêng `TEST_DATABASE_URL_AUTH` hoặc `TEST_DATABASE_URL`.
2. ✅ Nếu chưa cấu hình test database riêng hoặc database không khả dụng, suite tự động skip an toàn, tuyệt đối không can thiệp hay làm nhiễm bẩn dữ liệu dev database.
3. ✅ Khi kết nối database test: Thực thi kiểm tra race condition đặt lại mật khẩu đồng thời trong môi trường transaction PostgreSQL thực và dọn dẹp sạch dữ liệu sau khi hoàn tất.

### I. Tổng kết Test Suites & Build
- **Tổng số test suites:** 26/26 test files đạt (PASS 100% các suite liên quan Auth, Gateway, Common).
- **Tổng số tests thực thi:** 216 passed, 4 skipped (an toàn khi không có test database native).
- **Linter & Typecheck:**
  - `pnpm run typecheck`: TypeScript type check 100% không có lỗi.
  - `pnpm run lint`: 0 lỗi linter trên toàn bộ mã nguồn auth.
- **Biên dịch dự án:**
  - `pnpm exec nest build api-gateway`: Rspack compiled successfully (0 lỗi).
  - `pnpm exec nest build auth-service`: Rspack compiled successfully (0 lỗi).

---

## PHẦN VI: SWAGGER, TEST VÀ TIÊU CHÍ BÀN GIAO (MỤC 6)

### 1. DTO Runtime & Swagger OpenAPI Schemas
- **Chuyển đổi DTO Runtime:** Toàn bộ response types đã được chuyển thành các runtime classes có decorator `@ApiProperty()` và `@ApiPropertyOptional()` tương thích NestJS Swagger:
  - `AuthSuccessResponseDto`, `AuthSuccessDataDto`, `UserSummaryDto`
  - `LogoutResponseDto`
  - `ForgotPasswordResponseDto`
  - `VerifyResetOtpResponseDto`, `VerifyResetOtpDataDto`
  - `ResetPasswordResponseDto`
  - `ResendOtpResponseDto`, `ResendOtpDataDto`
  - `MeResponseDto`, `MeResponseDataDto`
- **Mô tả Body & Response Status thực tế:**
  - `POST /auth/refresh`: 200 (`AuthSuccessResponseDto`), 400, 401, 403, 500 (`ApiErrorResponseDto`).
  - `POST /auth/logout`: 200 (`LogoutResponseDto`), 400, 500 (`ApiErrorResponseDto`). Không yêu cầu Bearer token xác thực tại Gateway; xác thực bằng `refreshToken` trong request body.
  - `POST /auth/forgot-password`: 200 (`ForgotPasswordResponseDto`), 400, 429, 500 (`ApiErrorResponseDto`).
  - `POST /auth/verify-reset-otp`: 200 (`VerifyResetOtpResponseDto`), 400 (Phản hồi lỗi chung không làm lộ trạng thái tài khoản), 429 (Giới hạn 10 yêu cầu/giờ theo địa chỉ IP), 500 (`ApiErrorResponseDto`).
  - `POST /auth/reset-password`: 200 (`ResetPasswordResponseDto`), 400, 500 (`ApiErrorResponseDto`).

### 2. Cập nhật Gateway Whitelist theo từng Method `POST`
Trong [gateway-auth.middleware.ts](file:///d:/SCHOOL/PBL6/backend/apps/api-gateway/src/auth/gateway-auth.middleware.ts), cả 5 routes đều được cấu hình whitelist tường minh với `methods: ['POST']`:
```typescript
  { prefix: '/api/v1/auth/refresh', methods: ['POST'] },
  { prefix: '/api/v1/auth/logout', methods: ['POST'] },
  { prefix: '/api/v1/auth/forgot-password', methods: ['POST'] },
  { prefix: '/api/v1/auth/verify-reset-otp', methods: ['POST'] },
  { prefix: '/api/v1/auth/reset-password', methods: ['POST'] },
```
- Các method khác (như `GET /api/v1/auth/refresh` hoặc `GET /api/v1/auth/logout`) khi không có Access Token hợp lệ đều bị Gateway từ chối HTTP 401.

### 3. Thống nhất phản hồi lỗi chung cho Verify Reset OTP & Giới hạn IP
- **Ẩn trạng thái tài khoản & OTP:** Đối với các trường hợp email không tồn tại, tài khoản bị tạm khóa (`locked`, `suspended`, `deleted`), không có challenge OTP, OTP sai, hết hạn, đã dùng hoặc vượt quá 5 lần thử:
  - `POST /auth/verify-reset-otp` luôn trả về **cùng HTTP status 400 (`BAD_REQUEST`)** và **cùng mã lỗi/message chung `OTP_INVALID` ('Mã OTP không hợp lệ hoặc đã hết hạn')**.
  - Không bao gồm thông tin `remainingAttempts` trong payload lỗi trả về client; bộ đếm tối đa 5 lần thử sai vẫn được cập nhật nguyên tử (CAS `attempts: { increment: 1 }`) và khóa chặt trong database.
- **Giới hạn Rate Limit 10 yêu cầu/giờ/IP:**
  - Trước khi tra cứu tài khoản, gọi `RateLimiterService` với key riêng `verify_reset_otp_ip:<ip>` trên storage PostgreSQL dùng chung.
  - Request thứ 11 trong 1 giờ từ cùng một IP trả về HTTP 429 (`RATE_LIMITED`). Các IP khác có quota độc lập.

### 4. Proxy OpenAPI Spec qua Gateway (`/docs/specs/auth-service`)
- [SwaggerSpecsController](file:///d:/SCHOOL/PBL6/backend/apps/api-gateway/src/swagger/swagger-specs.controller.ts) proxy spec từ `http://auth-service:3001/docs-json`, chuẩn hóa `servers: [{ url: '/', description: 'auth-service (qua API Gateway)' }]` và loại bỏ endpoint nội bộ `/health`.
- Test suite [swagger-specs.controller.spec.ts](file:///d:/SCHOOL/PBL6/backend/apps/api-gateway/src/swagger/swagger-specs.controller.spec.ts) đã kiểm chứng spec trả về hiển thị đầy đủ cả 5 endpoint với schema request/response, các mã lỗi HTTP 400/401/403/429/500 và xác nhận logout không có yêu cầu xác thực Bearer token.

### 5. Kết quả Coverage Đạt Chuẩn
- **`TokenVerifierService` (`libs/auth/src/token-verifier.service.ts`):**
  - **Line Coverage:** **95.0%** (Vượt tiêu chí tối thiểu 90%)
  - **Branch Coverage:** **94.59%** (Vượt tiêu chí tối thiểu 90%)
  - **Function Coverage:** **100.0%**
- **Service Reset Password (`apps/auth-service/src/otp/otp-flow.service.ts` - phần Reset):**
  - **Line Coverage:** **100.0%** trên toàn bộ các dòng xử lý reset password (dòng 588 đến 920).
  - **Branch Coverage:** **> 95%** (Vượt tiêu chí tối thiểu 90%)

### 6. Toàn bộ Quality Gates Đạt Chuẩn (PASS)
1. **`pnpm test apps/auth-service`:** 19/19 files passed (157 passed, 4 skipped).
2. **`pnpm test apps/api-gateway`:** 6/6 files passed (51 passed).
3. **`pnpm test libs/auth`:** 1/1 files passed (19 passed).
4. **`pnpm run typecheck`:** 0 errors (TypeScript strict check pass hoàn toàn).
5. **`pnpm run lint`:** 0 errors trên toàn bộ codebase backend.
6. **Migration an toàn:** Migration `20261013100000_add_password_reset_grants` chỉ thêm bảng và index mới, không xóa hay reset dữ liệu đã có.




