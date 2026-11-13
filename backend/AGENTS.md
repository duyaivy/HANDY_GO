# Danh mục thành phần tái sử dụng

Chỉ ghi thư viện dùng chung và helper đang được dùng ở nhiều luồng.
Không ghi module khởi tạo riêng của service, chi tiết triển khai hoặc thành phần
chỉ có một nơi dùng. Không thêm mục chỉ vì vừa tạo file mới.
Không tự cập nhật danh mục sau mỗi task. Khi thêm mục, phải xác minh nơi dùng
thực tế trong code nghiệp vụ; test, re-export và đăng ký DI không tính là bằng
chứng tái sử dụng. Ngoại lệ: người dùng yêu cầu ghi nhận một API dùng chung.
Với mục đã có, chỉ sửa khi API/đường dẫn thay đổi hoặc xóa khi không còn phù hợp.
Đường dẫn tính từ `backend/`. Helper trong `apps/` chỉ dùng trong service sở hữu;
không import chéo giữa các microservice.

## Thư viện dùng chung

| Thư viện | Đường dẫn | Công dụng |
| --- | --- | --- |
| `@app/common` | `libs/common/src/` | Bootstrap, lỗi/response chuẩn, domain events, outbox và email template. |
| `@app/auth` | `libs/auth/src/` | JWT, guards, decorators và phân quyền. |
| `@app/config` | `libs/config/src/` | Nạp, kiểm tra và đọc cấu hình. |
| `@app/database` | `libs/database/src/` | Prisma clients, chọn database URL và cấu hình connection pool. |
| `@app/rabbitmq` | `libs/rabbitmq/src/` | Publish, RPC, ACK/NACK và cấu hình transport. |
| `@app/redis` | `libs/redis/src/` | Cache, Pub/Sub, cấu trúc dữ liệu và distributed lock. |
| `@app/logger` | `libs/logger/src/` | Pino, request ID và che secrets. |
| `@app/cloudinary` | `libs/cloudinary/src/` | Upload ảnh và ký upload video trực tiếp. |

## Helper dùng chung cần tra cứu trực tiếp

| Thành phần | Đường dẫn | Công dụng |
| --- | --- | --- |
| Message contracts, validators và policy | `libs/common/src/message-contracts/` | Contract REST/Socket.IO và validation dùng cho backend/mobile; không phụ thuộc Nest runtime. |
| `OrderCreatedPayload`, `OrderStatusChangedPayload`, `ServiceRequestBiddingClosedPayload` | `libs/common/src/events/order-tracking-payloads.ts` | Payload contract dùng chung giữa Order Service và Tracking Service. |
| `PollBackoff`, `safeOutboxError` | `libs/common/src/outbox/poll-backoff.ts` | Backoff có jitter và chuẩn hóa lỗi dependency cho các worker. |
| `optionalValue` | `libs/config/src/optional-env.ts` | Chuẩn hóa cấu hình thiếu/rỗng/whitespace thành unset. |
| `runtimeDatabaseUrl`, `databasePoolConfig`, `databasePoolError` | `libs/database/src/pool.config.ts` | Chọn URL, kiểm tra pool/timeout và ghi lỗi không lộ credentials. |

## Helper dùng ở nhiều luồng trong một service

| Thành phần | Đường dẫn | Công dụng |
| --- | --- | --- |
| `normalizeVietnamesePhone` | `apps/auth-service/src/common/utils/phone.util.ts` | Chuẩn hóa số điện thoại cho đăng ký, đăng nhập và OTP. |
| `resolveClientIp` | `apps/auth-service/src/common/utils/client-ip.util.ts`; `apps/wallet-service/src/common/utils/client-ip.util.ts` | Lấy IP cho các controller; chỉ tin forwarded IP sau khi xác minh gateway secret. Mỗi service dùng bản riêng. |
| `CurrentUser`, `CurrentUserId` | `apps/order-service/src/common/decorators/current-user.decorator.ts` | Lấy identity cho các controller Order, Booking Proposal và Service Request. |
| `TrustedGatewayGuard`, `GatewayUserId` | `apps/notification-service/src/common/` | Xác thực gateway và lấy user ID cho Devices, Notifications và Preferences. |
| `searchCatalogPage` | `apps/catalog-service/src/common/catalog-search.ts` | Tìm kiếm không phân biệt dấu, lọc và phân trang cho Services/Categories. |
