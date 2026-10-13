# Báo cáo cập nhật: Phân biệt Access Token và Refresh Token & Tối ưu hạ tầng Docker

- **Mã công việc:** HG-31 (Phần 1: Phân biệt Access Token và Refresh Token)
- **Nhánh thực hiện:** `feature/HG-31-RefreshToken_and_ForgotPassword`
- **Ngày cập nhật:** 13/10/2026

---

## 1. Tổng quan mục tiêu

1. **Tối ưu cấu hình Docker Compose:** Loại bỏ các container hạ tầng local dư thừa do toàn bộ hệ thống cơ sở dữ liệu và message broker đã chuyển sang môi trường Cloud.
2. **Khắc phục lỗ hổng phân biệt Token (Ticket HG-31 - Phần 1):**
   - Đảm bảo Access Token và Refresh Token có phạm vi sử dụng tách biệt hoàn toàn.
   - Ngăn chặn triệt để việc sử dụng Refresh Token để gọi các API được bảo vệ tại API Gateway (bao gồm cả các route upload media).
   - Đảm bảo tính tương thích ngược (backward compatibility) cho các Access Token cũ đã phát hành trong giai đoạn chuyển tiếp, tránh gây gián đoạn phiên làm việc của người dùng.

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

### B. Phân biệt Access Token và Refresh Token (HG-31)

#### 1. Lỗi trước khi sửa
- Refresh Token được ký dưới dạng RS256 JWT có chứa claim `tokenType: 'refresh'`.
- Access Token trước đây chưa được đính kèm claim `tokenType`.
- Bộ kiểm tra token (`TokenVerifierService.verifyAccessToken`) tại API Gateway chỉ xác minh chữ ký RS256, issuer và audience mà không kiểm tra giá trị `tokenType`.
- **Hệ quả:** Client có thể sử dụng Refresh Token còn hạn để gọi các route được bảo vệ tại Gateway (bao gồm route `/api/v1/uploads/image` và `/api/v1/uploads/video/init`), ngay cả khi phiên làm việc của Refresh Token đó đã bị thu hồi trong cơ sở dữ liệu.

#### 2. Giải pháp kỹ thuật

| Thành phần | File mã nguồn | Nội dung cập nhật |
| :--- | :--- | :--- |
| **Contract / Types** | [auth.types.ts](file:///d:/SCHOOL/PBL6/backend/libs/auth/src/auth.types.ts) | • Bổ sung `tokenType?: 'access' \| 'refresh' \| string` vào `JwtPayload`.<br>• Khai báo interface `RefreshTokenPayload` và `SessionBinding`. |
| **Token Signer** | [token-signer.service.ts](file:///d:/SCHOOL/PBL6/backend/libs/auth/src/token-signer.service.ts) | • Hàm `signAccessToken()` luôn tự động đính kèm claim `tokenType: 'access'` vào payload JWT. |
| **Token Verifier** | [token-verifier.service.ts](file:///d:/SCHOOL/PBL6/backend/libs/auth/src/token-verifier.service.ts) | • `verifyAccessToken()`:<br>  - Từ chối ngay lập tức nếu `payload.tokenType === 'refresh'`.<br>  - Từ chối nếu `tokenType` có giá trị khác `'access'`.<br>  - **Giai đoạn chuyển tiếp:** Chấp nhận nếu `tokenType === undefined` (Access Token cũ đã phát hành trước đợt cập nhật).<br>• `verifyRefreshToken()`:<br>  - Kiểm tra chữ ký RS256, issuer (`handy-go-auth`), audience (`handy-go-api`).<br>  - Bắt buộc `payload.tokenType === 'refresh'`.<br>  - Kiểm tra sự tồn tại của các trường định danh `sub`, `userId`, `sid`.<br>  - Ràng buộc session: Khi truyền tham số session, so khớp chính xác `sid`, `sub` (accountId), `userId`; từ chối nếu không khớp. |
| **API Gateway Auth** | [gateway-auth.middleware.ts](file:///d:/SCHOOL/PBL6/backend/apps/api-gateway/src/auth/gateway-auth.middleware.ts) | • Gọi `tokenVerifier.verifyAccessToken(token)`.<br>• Khi nhận Refresh Token, Gateway từ chối và phản hồi HTTP 401 với thông điệp rõ ràng.<br>• Chặn thành công trên mọi route bảo vệ, bao gồm toàn bộ route upload tại Gateway. |

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
Tất cả 26/26 tests đạt (PASS):
1. ✅ Gateway từ chối Refresh Token khi gọi route bảo vệ thông thường (ví dụ: `GET /api/v1/orders`), bất kể Refresh Token còn hạn hay đã thu hồi.
2. ✅ Gateway từ chối Refresh Token khi gọi route upload hình ảnh (`POST /api/v1/uploads/image`).
3. ✅ Gateway từ chối Refresh Token khi gọi route khởi tạo upload video (`POST /api/v1/uploads/video/init`).
4. ✅ Gateway chấp nhận Access Token mới có `tokenType: 'access'`.
5. ✅ Gateway chấp nhận Access Token cũ không có `tokenType` trong giai đoạn chuyển tiếp.
6. ✅ Test tích hợp end-to-end với cặp khóa RS256 thật (`TokenSignerService` + `TokenVerifierService` + `GatewayAuthMiddleware`).

### C. Build kiểm tra biên dịch
- `nest build api-gateway`: Thành công (0 lỗi).
- `nest build auth-service`: Thành công (0 lỗi).
