# AGENTS.md - Development Standards & Reusable Component Registry

> **Scope:** `backend` workspace (HANDY GO - PBL6 Project)  
> **Target Audience:** Autonomous AI Coding Agents & Pair-Programming Assistants  
> **Enforcement:** Mandatory rules, architectural boundaries, and reusable registry.

---

## 📌 Critical Directive: Self-Updating Reusable Registry Protocol

> [!IMPORTANT]
> **MANDATORY FOR ALL AGENTS:**
> Whenever you implement, extend, or optimize reusable application code in `apps/` or `libs/`:
> 1. A shared library, utility function, or helper.
> 2. A cross-cutting service, repository, messaging client, or RPC contract.
> 3. A reusable decorator, guard, filter, or interceptor.
> 
> 👉 **YOU MUST IMMEDIATELY UPDATE SECTION 4 ("Reusable Component Registry") OF THIS DOCUMENT** before completing your turn. Specify: Component/Function Name, File Path, Purpose, and Usage Example.

---

## 1. Architectural Foundation: Feature-Based (Vertical Slice)

All microservices located under `backend/apps/<service-name>` (e.g., `auth-service`, `catalog-service`, `user-trust-service`, etc.) **MUST** strictly adhere to the **Feature-Based (Vertical Slice)** architecture.

### 1.1. Standard Service Directory Layout
```
apps/<service-name>/src/
├── <feature-a>/                     # Self-contained Business Domain Feature A
│   ├── dto/                         # Feature-specific DTOs
│   │   ├── <action>-<feature>.dto.ts
│   │   └── <feature>-response.dto.ts
│   ├── <feature>.controller.ts      # HTTP Controller (Routing, OpenAPI/Swagger, Validation)
│   ├── <feature>.controller.spec.ts # Controller Unit Tests
│   ├── <feature>.service.ts         # Feature Business Logic & Domain Operations
│   ├── <feature>.service.spec.ts    # Service Unit Tests
│   ├── <feature>.module.ts          # NestJS Feature Module
│   └── index.ts                     # Feature Public API (Barrel Export)
│
├── health/                          # Standardized Microservice Health Feature
│   ├── health.controller.ts
│   ├── health.controller.spec.ts
│   └── health.module.ts
│
├── common/                          # Service-Internal Cross-Cutting Infrastructure
│   ├── <service>-common.module.ts   # Global Module aggregating DB, Throttler, RPC, Outbox, etc.
│   ├── constants/                   # Internal constants & configuration keys
│   ├── dto/                         # DTOs shared across multiple features (e.g., pagination, auth envelopes)
│   ├── utils/                       # Internal utilities & helpers
│   └── ...                          # Internal clients (RPC, DB repositories, session, etc.)
│
├── <service-name>.module.ts         # Root Service Module (imports only common & feature modules)
└── main.ts                          # Standardized bootstrap entry point
```

### 1.2. Strict Architectural Invariants & Constraints
1. **NO ROOT-LEVEL LAYER FOLDERS:** Do NOT create monolithic layer folders directly under `src/` (e.g., `src/controllers/`, `src/services/`, `src/flows/`, `src/dto/`). All business logic belongs to its respective feature folder.
2. **SELF-CONTAINED MODULES:** Every feature must be an independent NestJS module with its own Controller, Service, Module, DTOs, and Tests.
3. **DTO ISOLATION:** Keep DTOs inside `src/<feature>/dto/`. Only elevate a DTO to `src/common/dto/` or `libs/` if it serves as a shared contract for 2 or more distinct features.
4. **NO CIRCULAR DEPENDENCIES:** Features must never form circular imports. If Feature A requires functionality from Feature B, inject Feature B's service via `FeatureBModule` exports, or extract the shared concern into `common/` or `libs/`.
5. **FAIL-CLOSE INTEGRATION:** External RPC calls and cross-service dependencies must fail gracefully without leaving the database in an inconsistent state.

---

## 2. Technology Stack & Core Conventions

- **Runtime & Framework:** Node.js (ESM), NestJS v12.
- **Language & Compiler:** TypeScript 6 (Strict Mode, ESNext module resolution, `.js` import extensions).
- **Package Manager:** `pnpm` (Monorepo workspace).
- **ORM & Data Storage:** Prisma Client with PostgreSQL connection pooling (`@prisma/adapter-pg`).
- **Messaging & Event-Driven:** RabbitMQ (`amqp-connection-manager`, `amqplib`) via transactional Outbox Pattern.
- **Cache & Rate-Limiting:** Redis (`ioredis`), NestJS Throttler (`@nestjs/throttler`).
- **Security & Cryptography:** RS256 Asymmetric JWT signing/verification, HMAC-SHA256, bcrypt.
- **Structured Logging:** Pino structured JSON logger via `nestjs-pino`.
- **Testing Framework:** Vitest (Native ESM test runner).

---

## 3. Quality Gate (Mandatory Verification Commands)

Before completing any code modifications, the agent **MUST** run and pass the following quality gates:

```bash
# 1. Run unit & integration tests for the modified service
pnpm test apps/<service-name>

# 2. Strict TypeScript typecheck across monorepo & Prisma clients
pnpm run typecheck

# 3. Monorepo linter verification (Oxlint)
pnpm run lint
```

> **Zero-Tolerance Policy:** No compilation errors, unresolved lint warnings, or broken test suites are permitted in the final response.

---

## 4. Reusable Component Registry

**DO NOT REINVENT THE WHEEL. REUSE THE FOLLOWING EXISTING ASSETS:**

### 4.1. Monorepo Shared Libraries (`libs/`)

| Library (`libs/`) | Exported Asset | Purpose & Usage Contract |
| :--- | :--- | :--- |
| **`@app/common`**<br>`libs/common/src/` | `AppException`<br>`ERROR_CODES`<br>`AppErrorData` | **Standardized HTTP Exceptions.**<br>`throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'Error description', { data });`<br>Supports `data.verification` containing `challengeId`, `phone`, `emailMasked`, `expiresAt`, `resendAvailableAt` for pending account and delivery failure flows. |
| | `bootstrapApplication(Module, options?)` | **Microservice Bootstrap Engine.** Configures Pino logging, global `/api/v1` prefix, CORS, Swagger OpenAPI, and global ValidationPipe. Accepts `BootstrapOptions` (`connectMicroservices`, `setupApp`) or a bare `SetupAppCallback`. Enables shutdown hooks. Used in `main.ts`. |
| | `HttpExceptionFilter` | **Global Exception Filter & Detailed Error Logger.** Catches all exceptions, formats standardized JSON error responses, logs full 5xx/4xx error context with method, URL, message & stack traces, and injects error details into `pino-http`. |
| | `OutboxPublisherService`<br>`OutboxRepository` | **Reliable Transactional Outbox Pattern.** Persists domain events into the database within the same transaction and asynchronously dispatches to RabbitMQ with DLQ & retry support. |
| | `renderEmailTemplate(template, vars)` | **HTML Email Template Renderer.** Injects dynamic placeholders `{{variable}}` into branded HANDY GO responsive HTML email layouts. |
| | `EVENT_PATTERNS` | **Standardized Domain Event Constants.** E.g., `EVENT_PATTERNS.USER_REGISTERED` (eventVersion: 3, unified payload containing `roles: ["Customer", "Worker"]`). |
| | `ApiResponseEnvelope`<br>`ApiErrorResponseEnvelope`<br>`ApiResponseDto`<br>`ApiErrorResponseDto`<br>`buildSuccessResponse(data, message, statusCode)`<br>`buildErrorResponse(statusCode, code, message, data)` | **Standardized API Response Envelope Engine.** Wraps every HTTP response in `{ statusCode, message, data }`; errors additionally expose a stable `code`. Error `data` is always present (`null` when empty) and contains business metadata such as `verification` or `fieldErrors`. |
| **`@app/auth`**<br>`libs/auth/src/` | `@Public()` | Disables default JWT authentication guard for open endpoints (e.g., login, register, health). |
| | `@RequirePermissions(...)` | Enforces declarative RBAC permission codes on routes. E.g., `@RequirePermissions(StandardPermissions.AUTH_ME)`. |
| | `@CurrentUser()` | Parameter decorator resolving the authenticated user from the JWT payload: `@CurrentUser() user: AuthenticatedUser`. |
| | `TokenSignerService` | **RS256 JWT Signer.** Generates access tokens, refresh tokens, and SHA-256 token hashes using RSA private keys. |
| | `TokenVerifierService` | **RS256 JWT Verifier.** Validates tokens using public keys without requiring access to private keys. |
| | `Role`, `RegisterRole`<br>`StandardPermissions`<br>`TokenType` | Canonical enums & const maps for roles (`CUSTOMER`, `WORKER`, `ADMIN`), permissions (`AUTH_ME`, `PROFILE_READ`, ...), and token types (`TokenType.ACCESS`, `TokenType.REFRESH`). |
| **`@app/database`**<br>`libs/database/src/` | `AuthPrismaService` | Prisma client connected to `auth_db` with connection pooling. |
| | `UserTrustPrismaService` | Prisma client connected to `user_trust_db` with connection pooling. |
| **`@app/config`**<br>`libs/config/src/` | `ConfigModule.forRoot(...)`<br>`ConfigService` | Strongly-typed environment variables, port definitions, secrets (`isProduction`, `nodeEnv`, `cloudinaryVideoChunkSizeMb`, etc.), and required key validation. |
| **`@app/rabbitmq`**<br>`libs/rabbitmq/src/` | `RabbitMQService` | RabbitMQ event broadcasting and RPC request-reply communications. |
| **`@app/redis`**<br>`libs/redis/src/` | `RedisService` | Redis cache access: `get`, `set`, `del`, `expire`. |
| **`@app/logger`**<br>`libs/logger/src/` | `LoggerModule.forRoot(name)`<br>`createLoggerConfig(serviceName)` | Pino structured logging with request IDs and secret redaction, including `x-internal-secret` and notification `pushToken` fields. Usage: `LoggerModule.forRoot('auth-service')`; logger settings live in `logger.config.ts`. |
| **`@app/cloudinary`**<br>`libs/cloudinary/src/` | `CloudinaryModule`<br>`CloudinaryService` | **Cloudinary Media Storage Integration.** Streaming image upload (`uploadImage`) and signed direct big-video chunk upload initialization (`createVideoUploadSignature`). |

---

### 4.2. Service-Internal Utilities

| File Path | Function / Class | Purpose & Usage Contract |
| :--- | :--- | :--- |
| `apps/api-gateway/src/auth/gateway-auth.middleware.ts` | `GatewayAuthMiddleware` | Removes client-supplied `x-user-*` and `x-internal-secret` headers on all routes, verifies access tokens on protected routes, and injects trusted gateway headers. Usage: register as middleware before proxying requests to downstream services. |
| `apps/api-gateway/src/dev/dev-video-upload.controller.ts` | `DevVideoUploadController` | **Development Video Upload Tester.** Serves HTML/JS tester page at `GET /dev/video-upload` in non-production environments (`NODE_ENV !== 'production'`) for direct-to-Cloudinary chunked video upload testing. Throws `404` in production. |
| `common/utils/client-ip.util.ts` | `resolveClientIp(config, req, fallbackIp)`<br>`normalizeClientIp(ip, fallback)` | **IP Spoofing Prevention & Normalization.** Only trusts `x-forwarded-for` when validated against `x-internal-secret` from API Gateway. Validates with `net.isIP`, strips IPv4-mapped IPv6 (`::ffff:`), and normalizes `::1` loopback. |
| `common/security/password-hasher.ts` | `BcryptPasswordHasher`<br>`PASSWORD_HASHER` | **Decoupled Password Hashing Abstraction.** Implements `IPasswordHasher` with configurable salt rounds (default: 10), isolating password hashing/comparison from business flow services. |
| `otp/repositories/password-reset.repository.ts` | `PasswordResetRepository`<br>`PASSWORD_RESET_REPOSITORY` | **Transactional Password Reset Repository.** Encapsulates all Prisma queries, atomic CAS consumption, row-level locking (`SELECT ... FOR UPDATE`), and transactional session revocation for password reset flows. |
| `otp/services/reset-token.service.ts` | `ResetTokenService`<br>`RESET_TOKEN_SERVICE` | **Cryptographic Reset Token Manager.** Generates 32-byte hex reset tokens and SHA-256 hashes with configurable expiration (default: 900s). |
| `otp/services/password-reset-email.dispatcher.ts` | `PasswordResetEmailDispatcher`<br>`PASSWORD_RESET_EMAIL_DISPATCHER` | **Password Reset Email Dispatcher & Anti-Enumeration Timing Equalizer.** Encapsulates reset email delivery and provides dummy cryptographic operations to eliminate timing side-channels against user enumeration. |
| `common/utils/phone.util.ts` | `normalizeVietnamesePhone(rawPhone)` | **E.164 Vietnamese Mobile Phone Normalization.** Converts valid 10-digit mobile numbers (03, 05, 07, 08, 09) to `+84xxxxxxxxx`. Handles leading zeros (`840...`, `+840...`). Throws `BadRequestException` on invalid formats. |
| `common/utils/phone.util.ts` | `isValidVietnamesePhone(rawPhone)` | Boolean validator checking if a string conforms to Vietnamese mobile standards. |
| `common/utils/password.util.ts` | `@IsMaxByteLength(72)` | **UTF-8 Byte Length Validator.** Enforces strict 72-byte limit matching mobile and bcrypt boundary, preventing truncation vulnerabilities while preserving 8-64 char complexity rules. |
| `common/utils/auth-response.builder.ts` | `AuthResponseBuilder` | **Standardized API Response Envelopes.** Factory methods: `buildRegisterResponse` (includes `challengeId`), `buildAuthSuccessResponse`, `buildResendOtpResponse` (includes `challengeId`), `buildLogoutResponse`, `buildMeResponse`. |
| `common/rate-limit/rate-limiter.service.ts` | `RateLimiterService` | **Multi-Tier Rate Limiting & Brute-Force Lockout:**<br>- `checkAndIncrement(key, limit, windowSecs, message)`: Throttler sliding window.<br>- `checkFailedLogins(phone)`: Lockout check (5 failed attempts locks for 15 minutes).<br>- `recordFailedLogin(phone)` & `resetFailedLogins(phone)`: Counter management. |
| `apps/auth-service/src/common/rate-limit/postgres-throttler-storage.ts` | `PostgresThrottlerStorage` | Atomic PostgreSQL-backed Nest throttler storage. `new PostgresThrottlerStorage(db)`; `increment(key, ttl, limit, blockDuration, throttlerName)` uses a single upsert and returns the installed throttler storage-record contract. |
| `common/session/session.service.ts` | `SessionService` | **Session & Refresh Token Lifecycle:**<br>- `prepareSession()`: Pre-signs JWT prior to database transaction.<br>- `createSession()`: Stores session atomically.<br>- `rotateSession(refreshToken)`: Refresh token rotation with strict 7-day absolute lifetime.<br>- `revokeSession(refreshToken)`: Immediate invalidation on logout. |
| `common/rpc/user-trust.client.ts` | `UserTrustClient` | **Fail-Close RPC Client.** Communicates via RabbitMQ to verify user status and KYC profile provisioning in `user-trust-service`. |
| `apps/catalog-service/src/common/outbox/catalog-outbox.repository.ts` | `CatalogOutboxRepository` | **Catalog Service Outbox Repository.** Implements `OutboxRepository` interface to query/update pending events in `catalog_service.outbox_events` table. |
| `apps/order-service/src/prisma/prisma.service.ts` | `PrismaService`<br>`OrderPrismaService` | **Order Service Database Client.** Connects to `order_service` PostgreSQL schema with connection pooling adapter `@prisma/adapter-pg`. Exports client types from `@prisma/order-client`. |
| `apps/order-service/src/common/outbox/order-outbox.repository.ts` | `OrderOutboxRepository` | **Order Service Outbox Repository.** Implements `OutboxRepository` interface for `order_service.outbox_events`, provides `createEvent(data, tx)` for atomic event publishing in ACID transactions. |
| `apps/order-service/src/common/inbox/consumed-event.repository.ts` | `ConsumedEventRepository` | **Idempotent Consumer Inbox Repository.** Atomic deduplication and idempotency tracking using `order_service.consumed_events` (`recordEventIfNew`, `isEventConsumed`). |
| `apps/order-service/src/common/utils/code-generator.util.ts` | `generateRequestCode(date?)`<br>`generateOrderCode(date?)` | **Business Code Generator.** Produces uppercase alphanumeric unique codes: `REQ-YYYYMMDD-XXXX` and `ORD-YYYYMMDD-XXXX` with unambiguous charset (avoids 0/O, 1/I). |
| `apps/order-service/src/common/decorators/current-user.decorator.ts` | `@CurrentUser()`<br>`@CurrentUserId()` | **Zero JWT Re-verification Gateway Header Decorators.** Resolves authenticated user identity directly from trusted Gateway headers (`x-user-id`, `x-user-roles`, `x-user-permissions`). |
| `apps/order-service/src/service-requests/workers/order-deadline-scheduler.service.ts` | `OrderDeadlineSchedulerService` | **Order Service Deadline Scheduler Worker.** Scans requests every 60s, closes bidding (+24h), and expires inactive requests (+48h) with transactional outbox events. |
| `apps/order-service/src/booking-proposals/booking-proposals.service.ts` | `BookingProposalsService` | **Booking Proposals & Immutable Price Negotiation Service.** Manages pre-order booking proposals (ORD-04, ORD-05), XOR source validation (bid vs. recommendation), immutable revision history increments (`revisionNo`), worker change requests, worker rejection, and customer withdrawal. |
| `apps/order-service/src/orders/orders.service.ts` | `OrdersService` | **Orders & Atomic Contract Finalization Service.** Executes atomic single-transaction contract finalization (ORD-06) upon proposal acceptance: pessimistic locking, address snapshotting, order creation (`created`, `unpaid`), proposal finalization, competing proposal supersession, status history logging, and `order.created` outbox publishing. |
| `apps/order-service/src/internal/internal-order.service.ts` | `InternalOrderService`<br>`InternalOrderController` | **Internal Inter-Service Order API (ORD-09).** Provides secure internal endpoints protected by `InternalSecretGuard` (`x-internal-secret` timing-safe comparison): `GET /internal/service-requests/:id/bidding-eligibility` and `GET /internal/orders/:orderId/payment-eligibility` (returns exact string decimal `agreedPrice`). |
| `apps/order-service/src/common/outbox/order-outbox-publisher.service.ts` | `OrderOutboxPublisherService` | **Order Service Outbox Publisher Poller (ORD-09).** Scheduled poller running every 3s via `@app/common` `OutboxPublisherService` to broadcast pending outbox events to RabbitMQ with DLQ and retry support. |
| `apps/order-service/src/consumers/payment-events.consumer.ts` | `PaymentEventsConsumer` | **Payment Domain Event Consumer (ORD-09).** Idempotent RabbitMQ consumer for `payment.succeeded` and `payment.failed` events using `consumed_events` table deduplication, updating `orders.payment_state` (`paid`/`failed`). |
| `apps/order-service/src/**/dto/` | `OrderResponseDto`<br>`ServiceRequestResponseDto`<br>`BookingProposalResponseDto`<br>`PaymentEligibilityResponseDto`<br>`BiddingEligibilityResponseDto` | **Order Service Canonical Domain & Inter-Service DTOs.** Strongly-typed schemas for order lifecycle, immutable proposal revisions, deadline tracking, and payment eligibility with exact string decimal `agreedPrice`. |
| `apps/order-service/test/order-service.e2e-spec.ts` | Vitest / Supertest E2E Suite | **Order Service Full Lifecycle E2E Test Suite.** Validates health, security guards (`x-user-id`, `x-internal-secret`), Service Request drafts & publishing, Booking Proposal revision & worker acceptance, atomic Order materialization, proof-of-work evidence, finish/rework/complete lifecycle, dispute resolution, and payment eligibility. |
| `apps/bidding-service/src/common/outbox/bidding-outbox.repository.ts` | `BiddingOutboxRepository` | **Bidding Service Outbox Repository.** Implements `OutboxRepository` interface to query/update pending events in `bidding_service.outbox_events` table. |
| `apps/bidding-service/src/common/utils/security.util.ts` | `assertTrustedGateway`<br>`extractWorkerIdentity` | **Trusted Gateway & Worker Role Guard Utilities.** Timing-safe `x-internal-secret` verification and worker role extraction from trusted gateway headers. |
| `common/constants/auth.constants.ts` | Configuration Constants | Rate limits, lockout durations (`FAILED_LOGIN_LOCKOUT_SECONDS = 900`), and internal header names (`INTERNAL_GATEWAY_HEADER = 'x-internal-secret'`). |
| `apps/api-gateway/src/proxy/proxy.constants.ts` | `ServiceRouteConfig.pathRewrite` | **Identity-aware upstream path rewriting.** Use for routes whose downstream path must be derived from gateway-verified headers; e.g. identity verification maps `/api/v1/identity/verify` to the authenticated user's AI endpoint. |
| `otp/otp.service.ts` | `OtpService` | **Cryptographic OTP & SMTP Service:** Generates 6-digit codes, HMAC-SHA256 hashing, timing-safe equality verification. Supports Gmail SMTP (`smtp.gmail.com:465` SSL with App Password) with fail-fast missing credentials check and delivery failure handling. |
| `otp/otp-flow.service.ts` | `OtpFlowService` | **Atomic OTP Concurrency & Lockout:**<br>- `verifyEmail`: Transaction-level conditional updates (`isUsed = false`, `deliveryStatus = 'delivered'`, not expired, `attempts < 5`) for both failed and valid codes; 5 failed attempts completely locks verification until new challenge requested.<br>- `resendOtp`: Account row-level lock (`SELECT ... FOR UPDATE`), active pending challenge (15s timeout) / cooldown check returning 429 without sending 2nd email; SMTP dispatch outside transaction with timeout; on SMTP failure old delivered code remains valid and immediate resend allowed. |

---

### 4.3. Notification Service Phase 1

| Component | File Path | Purpose & Usage Example |
| :--- | :--- | :--- |
| `NotificationPrismaService` | `apps/notification-service/src/common/notification-prisma.service.ts` | Supabase PostgreSQL pool and lifecycle: prefers `DATABASE_URL_NOTIFICATION`, otherwise uses `DATABASE_URL` with `schema=notification_service`. Inject into repositories; `db.notification.count({ where: { recipientUserId, readAt: null } })`. Queries only the Notification-owned schema. |
| `resolveNotificationDatabaseUrl` | `apps/notification-service/src/common/notification-database.config.ts` | Shared runtime/migration URL resolution. `resolveNotificationDatabaseUrl(override, sharedUrl)` preserves URL options and adds `notification_service` when no override schema is supplied; replaces any shared-URL schema on fallback. |
| `NotificationCommonModule` | `apps/notification-service/src/common/notification-common.module.ts` | Shared service configuration, logging, persistence and gateway guard. Import once in `NotificationServiceModule`; no messaging or delivery dependencies. |
| `TrustedGatewayGuard` | `apps/notification-service/src/common/trusted-gateway.guard.ts` | Timing-safe internal secret validation followed by UUID identity validation; no JWT verification. `@UseGuards(TrustedGatewayGuard)` before reading `@GatewayUserId()`. |
| `GatewayUserId` | `apps/notification-service/src/common/gateway-user-id.decorator.ts` | Extracts the gateway-injected user ID after `TrustedGatewayGuard` validates the request. Use `@GatewayUserId() userId: string`; Swagger exposes Bearer authentication without asking clients for internal identity headers. |
| `PersistenceErrorsInterceptor` | `apps/notification-service/src/common/persistence-errors.interceptor.ts` | Sanitizes storage diagnostics before shared logging/responses; maps conflicts to 409, missing rows to 404, unavailable storage to 503. Registered with `APP_INTERCEPTOR`. |
| `DevicesRepository` | `apps/notification-service/src/devices/devices.repository.ts` | Atomic registration/rotation with user advisory lock, unique token/device constraints and token-free projections. `repository.register(userId, dto)`; `repository.deactivate(userId, id)`. |
| `NotificationsRepository` | `apps/notification-service/src/notifications/notifications.repository.ts` | Owned keyset queries, unread counts, conditional read updates and bulk read-all. `repository.markAllRead(userId)`. |
| `encodeNotificationCursor`, `decodeNotificationCursor` | `apps/notification-service/src/notifications/notification-cursor.ts` | Versioned date/UUID cursor bound to user and read filter; database queries always enforce ownership. `decodeNotificationCursor(cursor, userId, false)`. |
| `PreferencesRepository` | `apps/notification-service/src/preferences/preferences.repository.ts` | Atomic per-user preference upsert and safe channel projection. `repository.update(userId, { pushEnabled: false })`. |

### 4.4. Notification Service Phase 2

| Component | File Path | Purpose & Usage Example |
| :--- | :--- | :--- |
| `NOTIFICATION_EVENTS`, `EventDataMap`, `validateNotificationEvent` | `apps/notification-service/src/events/event-contracts.ts` | Provisional typed contracts for 16 events; validates UUIDs, version, source, routing and bounded fan-out, strips unknown fields. `validateNotificationEvent(packet, routingKey)`. |
| `NotificationRouter` | `apps/notification-service/src/events/notification-router.ts` | Typed recipient/category/entity strategies with no foreign database access. `router.resolve(event)`. |
| `renderNotificationTemplate` | `apps/notification-service/src/events/notification-templates.ts` | Vietnamese templates and controlled role placeholders, with reviewed transition-specific templates. `renderNotificationTemplate(event.eventType, 'worker', policy.template)`. |
| `NotificationPolicy` | `apps/notification-service/src/events/notification-policy.ts` | Central reviewed optional/mandatory/disabled policies and transition/template allowlist; provisional simulation restricted to test/development. `policies.resolve(event)`. |
| `EventProcessorService` | `apps/notification-service/src/events/event-processor.service.ts` | Atomic inbox claim, bounded fan-out and notification persistence; no delivery jobs. `processor.process(validatedEvent)`. |
| `NotificationsRepository.createInAppBatch` | `apps/notification-service/src/notifications/notifications.repository.ts` | Inserts at most 100 rows per statement in caller's transaction. `repository.createInAppBatch(tx, rows)`. |
| `PreferencesRepository.findInAppOptOuts` | `apps/notification-service/src/preferences/preferences.repository.ts` | One batched query for optional in-app preferences; absent preferences mean enabled. `repository.findInAppOptOuts(tx, userIds)`. |
| `assertEventTopology`, `eventTransportOptions` | `apps/notification-service/src/events/event-topology.ts` | Reuses shared topic exchange configuration; dedicated quorum consumer/retry/DLQ queues with bounded prefetch and reliable dead lettering. `await assertEventTopology(channel, options)`. |
| `EventConsumerService`, `transferEvent` | `apps/notification-service/src/events/event-consumer.service.ts` | Manual acknowledgement after commit or confirmed mandatory retry/DLQ transfer; safe channel-close redelivery and structured diagnostics. Nest lifecycle starts the consumer; `transferEvent(channel, queue, message, headers)`. |

### 4.5. Notification Service Phase 3 (FCM Push Notification)

| Component | File Path | Purpose & Usage Example |
| :--- | :--- | :--- |
| `PushModule` | `apps/notification-service/src/push/push.module.ts` | Push notification feature module encapsulating provider, worker, job queue repository, and policy resolver. Import in `NotificationServiceModule`. |
| `PushProvider`<br>`FirebasePushProvider` | `apps/notification-service/src/push/firebase-push.provider.ts`<br>`apps/notification-service/src/push/push-provider.ts` | **Firebase Admin SDK Push Provider.** Implements FCM HTTP v1 batch messaging (`sendEach`) up to 500 messages, handles credential resolution (`FIREBASE_SA_BASE64` in-memory / `cert` file / `applicationDefault`), fail-fast checks, and graceful shutdown. |
| `PushJobRepository` | `apps/notification-service/src/push/push-job.repository.ts` | **PostgreSQL Durable Job Queue Repository.** Atomic worker claiming via `SELECT ... FOR UPDATE SKIP LOCKED`, lease timeout abandoned job recovery, exponential backoff with jitter retry scheduling, and atomic transaction-level job creation. `pushJobs.claimPendingJobs(batchSize)`. |
| `PushWorkerService` | `apps/notification-service/src/push/push-worker.service.ts` | **In-Process Push Worker.** Periodic polling loop (default 3s), batch processing, retries with exponential backoff, and automatic device token deactivation on invalid token responses. Non-overlapping execution with graceful shutdown. |
| `PushErrorClassifier` | `apps/notification-service/src/push/push-error-classifier.ts` | **FCM Error Classifier.** Classifies FCM error codes into transient/retryable (`messaging/unavailable`, timeouts), permanent token deactivation (`messaging/registration-token-not-registered`), and terminal config errors. Sanitizes and bounds error messages. |
| `PushPayloadBuilder` | `apps/notification-service/src/push/push-payload.builder.ts` | **FCM Payload Builder.** Whitelists safe business metadata (`notificationId`, `eventType`, `entityId`, etc.), strips FCM reserved keys, converts all data attributes to strings, and truncates body to respect 4096-byte boundary. |
| `PushPolicyResolver` | `apps/notification-service/src/push/push-policy.resolver.ts` | **Push Eligibility Policy Evaluator.** Safe default-disabled event policy resolver with mandatory vs optional modes, explicit JSON opt-in (`PUSH_EVENT_POLICIES`), and simulated testing support (`PUSH_SIMULATED_POLICIES`). |

### 4.6. Admin Broadcast & User Trust RPC

| Component | File Path | Purpose & Usage Example |
| :--- | :--- | :--- |
| `AdminGuard` | `apps/notification-service/src/common/admin.guard.ts` | **Admin Role Guard.** Verifies `x-user-roles` gateway header includes `Role.ADMIN` (case-insensitive). `@UseGuards(AdminGuard)` on administrative routes. |
| `UserTrustRpcClient` | `apps/notification-service/src/common/rpc/user-trust-rpc.client.ts` | **User & Trust RPC Client.** Fetches active user IDs via RabbitMQ RPC (`user.get-all-active-ids`). `userTrustClient.getAllActiveUserIds(targetGroup)`. |
| `getAllActiveUserIds` | `apps/user-trust-service/src/user-trust-service.controller.ts`<br>`apps/user-trust-service/src/user-trust-service.service.ts` | **Active User IDs RPC Provider.** Microservice message pattern `user.get-all-active-ids` querying active users filtered by target group (`ALL`, `CUSTOMERS`, `WORKERS`). |
| `AdminBroadcastNotificationDto`<br>`BroadcastResponseDto` | `apps/notification-service/src/notifications/dto/broadcast-notification.dto.ts` | **Broadcast DTOs.** Validates title, body, category, targetGroup, optional recipientUserIds, and sendPush flag. |

## 5. Feature Blueprint & Implementation Template

When creating a new business feature, agents must replicate this pattern:

### 5.1. Controller Scaffold — Public Route (`<feature>.controller.ts`)
```typescript
import { Body, Controller, HttpCode, HttpStatus, Ip, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '@app/auth';
import { ConfigService } from '@app/config';
import { resolveClientIp } from '../common/utils/client-ip.util.js';
import { MyFeatureService } from './my-feature.service.js';
import { MyFeatureDto } from './dto/my-feature.dto.js';

@ApiTags('My Feature')
@Controller('my-feature')
export class MyFeatureController {
  constructor(
    private readonly service: MyFeatureService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('action')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Performs feature business action' })
  @ApiResponse({ status: 200, description: 'Action completed successfully' })
  async handleAction(
    @Body() dto: MyFeatureDto,
    @Ip() clientIp: string,
    @Req() req: Request,
  ) {
    const ip = resolveClientIp(this.config, req, clientIp);
    return this.service.execute(dto, ip);
  }
}
```

### 5.2. Controller Scaffold — Protected Route (JWT required)

> [!IMPORTANT]
> **DOWNSTREAM SERVICES MUST NEVER RE-VERIFY THE JWT TOKEN.**
> The API Gateway has already verified the RS256 token and injected trusted identity headers.
> Read user identity directly from these headers — DO NOT import `TokenVerifierService`, `JwtAuthGuard`, or any JWT-decoding logic in downstream services.

The API Gateway (`apps/api-gateway`) performs RS256 JWT verification once and injects the following **trusted internal headers** before forwarding to any downstream service:

| Header | Source (from JWT payload) | Example value |
| :--- | :--- | :--- |
| `x-user-id` | `payload.userId` | `uuid-v4-user-id` |
| `x-user-account-id` | `payload.sub` | `uuid-v4-account-id` |
| `x-user-roles` | `payload.roles` (JSON array → comma-separated) | `Customer` or `Worker,Admin` |
| `x-user-permissions` | `payload.permissions` (JSON array → comma-separated) | `profile:read,profile:update` |
| `x-internal-secret` | `config.internalServiceSecret` | `<32-byte random hex>` |
| `x-forwarded-for` | Client socket IP (resolved by gateway) | `203.0.113.5` |

**Security invariant enforced by every downstream service:**
- Validate `x-internal-secret` using **timing-safe comparison** against `config.internalServiceSecret`. If missing or mismatched → reject with `403 Forbidden` immediately.
- Never trust `x-user-id`, `x-user-roles`, `x-user-permissions` unless `x-internal-secret` is valid (prevents header injection/spoofing from external clients).

```typescript
import { Controller, Get, Headers, ForbiddenException, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ConfigService } from '@app/config';
import crypto from 'node:crypto';
import { MyProtectedService } from './my-protected.service.js';

@ApiTags('My Protected Feature')
@ApiBearerAuth()
@Controller('my-resource')
export class MyProtectedController {
  constructor(
    private readonly service: MyProtectedService,
    private readonly config: ConfigService,
  ) {}

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get current user resource (requires JWT via Gateway)' })
  @ApiResponse({ status: 200, description: 'Success' })
  @ApiResponse({ status: 403, description: 'Request did not come from the trusted API Gateway' })
  async getMyResource(
    @Headers('x-internal-secret') internalSecret: string | undefined,
    @Headers('x-user-id') userId: string | undefined,
    @Headers('x-user-roles') userRoles: string | undefined,
    @Headers('x-user-permissions') userPermissions: string | undefined,
  ) {
    // 1. Validate the request came through the trusted API Gateway
    this.assertTrustedGateway(internalSecret);

    // 2. Parse identity from headers (no JWT decoding needed)
    const roles = userRoles ? userRoles.split(',') : [];
    const permissions = userPermissions ? userPermissions.split(',') : [];

    return this.service.getMyResource(userId!, roles, permissions);
  }

  private assertTrustedGateway(incomingSecret: string | undefined): void {
    const expected = this.config.internalServiceSecret;
    const isValid =
      !!expected &&
      !!incomingSecret &&
      incomingSecret.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(incomingSecret), Buffer.from(expected));
    if (!isValid) {
      throw new ForbiddenException('Request must originate from the API Gateway');
    }
  }
}
```

### 5.3. Module Scaffold (`<feature>.module.ts`)
```typescript
import { Module } from '@nestjs/common';
import { MyFeatureController } from './my-feature.controller.js';
import { MyFeatureService } from './my-feature.service.js';

@Module({
  controllers: [MyFeatureController],
  providers: [MyFeatureService],
  exports: [MyFeatureService],
})
export class MyFeatureModule {}
```

---

## 6. Authentication Architecture: Centralized Gateway Auth (Defense-in-Depth)

> [!IMPORTANT]
> **This section defines the mandatory security boundary between the API Gateway and all downstream microservices. Every agent MUST understand and enforce this contract.**

### 6.1. Who Does What

```
[Internet Client]
     │  Authorization: Bearer <RS256 JWT>
     ▼
┌──────────────────────────────────────────────────────────────────────┐
│  API GATEWAY  (apps/api-gateway)                                     │
│                                                                      │
│  ① Strip all client-supplied x-user-* headers (anti-spoofing)        │
│  ② PUBLIC ROUTES → forward as-is (no token check)                   │
│  ③ PROTECTED ROUTES → verify RS256 JWT (→ 401 if invalid)           │
│  ④ Coarse-grained ROLE check per route pattern (→ 403 if denied)    │
│  ⑤ Inject trusted headers + x-internal-secret, then forward         │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ Internal VPC / Docker network
                            ▼
┌──────────────────────────────────────────────────────────────────────┐
│  DOWNSTREAM SERVICES  (order, catalog, user-trust, wallet, ...)      │
│                                                                      │
│  ① Validate x-internal-secret (timing-safe) → 403 if missing/wrong  │
│  ② Read x-user-id, x-user-roles, x-user-permissions from headers    │
│  ③ Fine-grained (data-ownership) authorization in service layer      │
│  ④ NEVER decode/verify the JWT token again                           │
└──────────────────────────────────────────────────────────────────────┘
```

### 6.2. Public Routes (No JWT Required)

The following route patterns are whitelisted at the Gateway and forwarded without authentication:

| Pattern | Method(s) | Reason |
| :--- | :--- | :--- |
| `/api/v1/auth/register` | POST | Registration |
| `/api/v1/auth/login` | POST | Login |
| `/api/v1/auth/verify-email` | POST | OTP verification |
| `/api/v1/auth/resend-otp` | POST | Resend OTP |
| `/api/v1/auth/refresh` | POST | Token refresh (uses refresh token, not access token) |
| `/api/v1/catalog` | GET | Public catalog browsing |
| `/api/v1/categories` | GET | Public category listing |
| `/health` | GET | Health check |
| `/docs` | GET | Swagger UI |

> **Critical:** `POST/PUT/PATCH/DELETE` on `/api/v1/catalog` and `/api/v1/categories` are **protected**. Only `GET` is public.
