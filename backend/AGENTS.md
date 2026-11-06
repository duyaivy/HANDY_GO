# Danh mục thư viện và logic tái sử dụng

Chỉ lưu component dùng chung hoặc helper có thể dùng lại cho nhiều luồng.
Mỗi mục gồm tên, đường dẫn và công dụng ngắn gọn. Chỉ cập nhật khi component
được thêm, đổi API, di chuyển hoặc xóa. Đường dẫn tính từ thư mục `backend/`.

## Thư viện dùng chung

| Thư viện | Đường dẫn | Thành phần có thể dùng lại |
| --- | --- | --- |
| `@app/common` | `libs/common/src/` | Bootstrap, lỗi và response chuẩn, domain events, outbox, email template. |
| `@app/auth` | `libs/auth/src/` | JWT signer/verifier, guards, decorators, roles và permissions. |
| `@app/config` | `libs/config/src/` | `ConfigModule.forRoot`, `ConfigService`: nạp, kiểm tra và đọc cấu hình ứng dụng. |
| `@app/database` | `libs/database/src/` | Prisma clients Auth/User Trust/Order/Matching; cấu hình URL và connection pool. |
| `@app/rabbitmq` | `libs/rabbitmq/src/` | `RabbitMQService`, `RabbitMQContextService`, `createRabbitMQOptions`: publish, RPC, ACK/NACK và cấu hình transport. |
| `@app/redis` | `libs/redis/src/` | `RedisService`: cache, Pub/Sub, list/sorted set và distributed lock. |
| `@app/logger` | `libs/logger/src/` | `LoggerModule.forRoot`, `createLoggerConfig`: Pino, request ID và che secrets trong log. |
| `@app/cloudinary` | `libs/cloudinary/src/` | `CloudinaryModule`, `CloudinaryService`: upload ảnh và tạo chữ ký upload video trực tiếp. |

## Logic dùng chung cần tra cứu

| Component | Đường dẫn | Công dụng |
| --- | --- | --- |
| `bootstrapApplication` | `libs/common/src/bootstrap.ts` | Khởi tạo ứng dụng với logging, prefix, CORS, validation và shutdown hooks; hỗ trợ `connectMicroservices`/`setupApp`. |
| `AppException`, `ERROR_CODES` | `libs/common/src/errors/app-error.ts` | Lỗi ứng dụng có mã và dữ liệu chuẩn. |
| `HttpExceptionFilter` | `libs/common/src/filters/http-exception.filter.ts` | Chuẩn hóa response lỗi và ghi log tập trung. |
| `ApiResponseDto`, `ApiErrorResponseDto`, `buildSuccessResponse`, `buildErrorResponse` | `libs/common/src/dto/api-response.dto.ts` | Tạo response envelope thống nhất. |
| `EVENT_PATTERNS`, `DomainEvent` | `libs/common/src/events/` | Tên event và envelope dùng giữa các service. |
| `OutboxPublisherService`, `OutboxRepository` | `libs/common/src/outbox/` | Publisher và repository contract dùng chung cho các adapter outbox. |
| `PollBackoff`, `safeOutboxError` | `libs/common/src/outbox/poll-backoff.ts` | Backoff có jitter và chuẩn hóa lỗi dependency để ghi log an toàn. |
| `renderEmailTemplate` | `libs/common/src/templates/` | Render email từ template và biến đầu vào. |
| `Public`, `RequirePermissions`, `RequireRoles`, `CurrentUser` | `libs/auth/src/auth.decorators.ts` | Metadata phân quyền và lấy identity từ request đã xác thực. |
| `TokenSignerService`, `TokenVerifierService` | `libs/auth/src/` | Ký/xác minh JWT RS256; dùng cùng guards và types được export bởi `@app/auth`. |
| `optionalValue` | `libs/config/src/optional-env.ts` | Thiếu/rỗng/whitespace thành unset; giữ nguyên giá trị nonblank. Ví dụ: `optionalValue(value) ?? fallback`. |
| `validateProductionServiceEndpoints` | `libs/config/src/service-endpoints.ts` | Kiểm tra endpoint theo registry; được gọi bởi `ConfigModule.forRoot`. |
| `runtimeDatabaseUrl` | `libs/database/src/pool.config.ts` | Chọn database override của service rồi URL chung; không dùng localhost fallback khi production thiếu URL. |
| `databasePoolConfig`, `databasePoolError` | `libs/database/src/pool.config.ts` | Kiểm tra giới hạn pool/timeout cho PrismaPg và log lỗi pool không lộ credentials. |

## Helper nội bộ service

Các mục dưới đây dùng lại trong service sở hữu; không import trực tiếp từ một
microservice sang microservice khác. Thư viện dùng chung giữa service nằm ở `libs/`.

| Component | Đường dẫn | Công dụng |
| --- | --- | --- |
| `normalizeVietnamesePhone`, `isValidVietnamesePhone` | `apps/auth-service/src/common/utils/phone.util.ts` | Chuẩn hóa và kiểm tra số điện thoại Việt Nam. |
| `resolveClientIp`, `normalizeClientIp` | `apps/auth-service/src/common/utils/client-ip.util.ts`; `apps/wallet-service/src/common/utils/client-ip.util.ts` | Kiểm tra IP và chỉ tin forwarded IP sau khi xác minh gateway secret. |
| `BcryptPasswordHasher`, `PASSWORD_HASHER` | `apps/auth-service/src/common/security/password-hasher.ts` | Hash/so sánh mật khẩu qua một contract dùng chung cho các luồng Auth. |
| `PostgresThrottlerStorage` | `apps/auth-service/src/common/rate-limit/postgres-throttler-storage.ts` | Storage PostgreSQL cho Nest throttler. |
| `generateRequestCode`, `generateOrderCode` | `apps/order-service/src/common/utils/code-generator.util.ts` | Sinh mã request/order theo định dạng thống nhất. |
| `CurrentUser`, `CurrentUserId` | `apps/order-service/src/common/decorators/current-user.decorator.ts` | Lấy identity từ gateway headers sau khi guard xác thực request. |
| `assertTrustedGateway`, `extractWorkerIdentity` | `apps/bidding-service/src/common/utils/security.util.ts` | Xác minh gateway secret và lấy worker identity. |
| `TrustedGatewayGuard`, `AdminGuard`, `GatewayUserId` | `apps/notification-service/src/common/` | Xác thực request từ gateway, kiểm tra admin và lấy user ID đã xác thực. |
| `resolveNotificationDatabaseUrl` | `apps/notification-service/src/common/notification-database.config.ts` | Chọn URL override/shared và schema Notification. |
| `PersistenceErrorsInterceptor` | `apps/notification-service/src/common/persistence-errors.interceptor.ts` | Ánh xạ lỗi storage sang HTTP và che thông tin nhạy cảm. |
| `encodeNotificationCursor`, `decodeNotificationCursor` | `apps/notification-service/src/notifications/notification-cursor.ts` | Cursor phân trang gắn với user và bộ lọc. |
| `NOTIFICATION_EVENTS`, `EventDataMap`, `validateNotificationEvent` | `apps/notification-service/src/events/event-contracts.ts` | Contract và validation chung cho các luồng nhận event của Notification. |
| `PushErrorClassifier`, `PushPayloadBuilder` | `apps/notification-service/src/push/` | Phân loại lỗi FCM và tạo payload push với metadata được phép. |
| `searchCatalogPage` | `apps/catalog-service/src/common/catalog-search.ts` | Tìm tên/mô tả không phân biệt dấu bằng PostgreSQL, giữ bộ lọc, thứ tự và count/page; trả ID trang để hydrate qua Prisma. |
