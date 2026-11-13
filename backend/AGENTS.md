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

| Thư viện          | Đường dẫn              | Công dụng                                                               |
| ----------------- | ---------------------- | ----------------------------------------------------------------------- |
| `@app/common`     | `libs/common/src/`     | Bootstrap, lỗi/response chuẩn, domain events, outbox và email template. |
| `@app/auth`       | `libs/auth/src/`       | JWT, guards, decorators và phân quyền.                                  |
| `@app/config`     | `libs/config/src/`     | Nạp, kiểm tra và đọc cấu hình.                                          |
| `@app/database`   | `libs/database/src/`   | Prisma clients, chọn database URL và cấu hình connection pool.          |
| `@app/rabbitmq`   | `libs/rabbitmq/src/`   | Publish, RPC, ACK/NACK và cấu hình transport.                           |
| `@app/redis`      | `libs/redis/src/`      | Cache, Pub/Sub, cấu trúc dữ liệu và distributed lock.                   |
| `@app/logger`     | `libs/logger/src/`     | Pino, request ID và che secrets.                                        |
| `@app/cloudinary` | `libs/cloudinary/src/` | Upload ảnh và ký upload video trực tiếp.                                |

## Helper dùng chung cần tra cứu trực tiếp

| Component                                                                             | Đường dẫn                                          | Công dụng                                                                                                            |
| ------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `bootstrapApplication`                                                                | `libs/common/src/bootstrap.ts`                     | Khởi tạo ứng dụng với logging, prefix, CORS, validation và shutdown hooks; hỗ trợ `connectMicroservices`/`setupApp`. |
| `AppException`, `ERROR_CODES`                                                         | `libs/common/src/errors/app-error.ts`              | Lỗi ứng dụng có mã và dữ liệu chuẩn.                                                                                 |
| `HttpExceptionFilter`                                                                 | `libs/common/src/filters/http-exception.filter.ts` | Chuẩn hóa response lỗi và ghi log tập trung.                                                                         |
| `ApiResponseDto`, `ApiErrorResponseDto`, `buildSuccessResponse`, `buildErrorResponse` | `libs/common/src/dto/api-response.dto.ts`          | Tạo response envelope thống nhất.                                                                                    |
| `EVENT_PATTERNS`, `DomainEvent`                                                       | `libs/common/src/events/`                          | Tên event và envelope dùng giữa các service.                                                                         |
| `OutboxPublisherService`, `OutboxRepository`                                          | `libs/common/src/outbox/`                          | Publisher và repository contract dùng chung cho các adapter outbox.                                                  |
| `PollBackoff`, `safeOutboxError`                                                      | `libs/common/src/outbox/poll-backoff.ts`           | Backoff có jitter và chuẩn hóa lỗi dependency để ghi log an toàn.                                                    |
| `renderEmailTemplate`                                                                 | `libs/common/src/templates/`                       | Render email từ template và biến đầu vào.                                                                            |
| `Public`, `RequirePermissions`, `RequireRoles`, `CurrentUser`                         | `libs/auth/src/auth.decorators.ts`                 | Metadata phân quyền và lấy identity từ request đã xác thực.                                                          |
| `TokenSignerService`, `TokenVerifierService`                                          | `libs/auth/src/`                                   | Ký/xác minh JWT RS256; dùng cùng guards và types được export bởi `@app/auth`.                                        |
| `optionalValue`                                                                       | `libs/config/src/optional-env.ts`                  | Thiếu/rỗng/whitespace thành unset; giữ nguyên giá trị nonblank. Ví dụ: `optionalValue(value) ?? fallback`.           |
| `validateProductionServiceEndpoints`                                                  | `libs/config/src/service-endpoints.ts`             | Kiểm tra endpoint theo registry; được gọi bởi `ConfigModule.forRoot`.                                                |
| `runtimeDatabaseUrl`                                                                  | `libs/database/src/pool.config.ts`                 | Chọn database override của service rồi URL chung; không dùng localhost fallback khi production thiếu URL.            |
| `databasePoolConfig`, `databasePoolError`                                             | `libs/database/src/pool.config.ts`                 | Kiểm tra giới hạn pool/timeout cho PrismaPg và log lỗi pool không lộ credentials.                                    |

## Helper nội bộ service

Các mục dưới đây dùng lại trong service sở hữu; không import trực tiếp từ một
microservice sang microservice khác. Thư viện dùng chung giữa service nằm ở `libs/`.

| Component                                                          | Đường dẫn                                                                                                        | Công dụng                                                                                                                |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `normalizeVietnamesePhone`, `isValidVietnamesePhone`               | `apps/auth-service/src/common/utils/phone.util.ts`                                                               | Chuẩn hóa và kiểm tra số điện thoại Việt Nam.                                                                            |
| `resolveClientIp`, `normalizeClientIp`                             | `apps/auth-service/src/common/utils/client-ip.util.ts`; `apps/wallet-service/src/common/utils/client-ip.util.ts` | Kiểm tra IP và chỉ tin forwarded IP sau khi xác minh gateway secret.                                                     |
| `BcryptPasswordHasher`, `PASSWORD_HASHER`                          | `apps/auth-service/src/common/security/password-hasher.ts`                                                       | Hash/so sánh mật khẩu qua một contract dùng chung cho các luồng Auth.                                                    |
| `PostgresThrottlerStorage`                                         | `apps/auth-service/src/common/rate-limit/postgres-throttler-storage.ts`                                          | Storage PostgreSQL cho Nest throttler.                                                                                   |
| `generateRequestCode`, `generateOrderCode`                         | `apps/order-service/src/common/utils/code-generator.util.ts`                                                     | Sinh mã request/order theo định dạng thống nhất.                                                                         |
| `CurrentUser`, `CurrentUserId`                                     | `apps/order-service/src/common/decorators/current-user.decorator.ts`                                             | Lấy identity từ gateway headers sau khi guard xác thực request.                                                          |
| `assertTrustedGateway`, `extractWorkerIdentity`                    | `apps/bidding-service/src/common/utils/security.util.ts`                                                         | Xác minh gateway secret và lấy worker identity.                                                                          |
| `TrustedGatewayGuard`, `AdminGuard`, `GatewayUserId`               | `apps/notification-service/src/common/`                                                                          | Xác thực request từ gateway, kiểm tra admin và lấy user ID đã xác thực.                                                  |
| `resolveNotificationDatabaseUrl`                                   | `apps/notification-service/src/common/notification-database.config.ts`                                           | Chọn URL override/shared và schema Notification.                                                                         |
| `PersistenceErrorsInterceptor`                                     | `apps/notification-service/src/common/persistence-errors.interceptor.ts`                                         | Ánh xạ lỗi storage sang HTTP và che thông tin nhạy cảm.                                                                  |
| `encodeNotificationCursor`, `decodeNotificationCursor`             | `apps/notification-service/src/notifications/notification-cursor.ts`                                             | Cursor phân trang gắn với user và bộ lọc.                                                                                |
| `NOTIFICATION_EVENTS`, `EventDataMap`, `validateNotificationEvent` | `apps/notification-service/src/events/event-contracts.ts`                                                        | Contract và validation chung cho các luồng nhận event của Notification.                                                  |
| `PushErrorClassifier`, `PushPayloadBuilder`                        | `apps/notification-service/src/push/`                                                                            | Phân loại lỗi FCM và tạo payload push với metadata được phép.                                                            |
| `searchCatalogPage`                                                | `apps/catalog-service/src/common/catalog-search.ts`                                                              | Tìm tên/mô tả không phân biệt dấu bằng PostgreSQL, giữ bộ lọc, thứ tự và count/page; trả ID trang để hydrate qua Prisma. |
