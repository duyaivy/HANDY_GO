# AGENTS.md - Development Standards & Reusable Component Registry

> **Scope:** `backend` workspace (HANDY GO - PBL6 Project)  
> **Target Audience:** Autonomous AI Coding Agents & Pair-Programming Assistants  
> **Enforcement:** Mandatory rules, architectural boundaries, and reusable registry.

---

## 📌 Critical Directive: Self-Updating Reusable Registry Protocol

> [!IMPORTANT]
> **MANDATORY FOR ALL AGENTS:**
> Whenever you implement, extend, or optimize:
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
| **`@app/common`**<br>`libs/common/src/` | `AppException`<br>`ERROR_CODES` | **Standardized HTTP Exceptions.**<br>`throw new AppException(HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR, 'Error description', { details });` |
| | `bootstrapApplication(Module, options?)` | **Microservice Bootstrap Engine.** Configures Pino logging, global `/api/v1` prefix, CORS, Swagger OpenAPI, and global ValidationPipe. Accepts `BootstrapOptions` (`connectMicroservices`, `setupApp`) or a bare `SetupAppCallback`. Used in `main.ts`. |
| | `HttpExceptionFilter` | **Global Exception Filter & Detailed Error Logger.** Catches all exceptions, formats standardized JSON error responses, logs full 5xx/4xx error context with method, URL, message & stack traces, and injects error details into `pino-http`. |
| | `OutboxPublisherService`<br>`OutboxRepository` | **Reliable Transactional Outbox Pattern.** Persists domain events into the database within the same transaction and asynchronously dispatches to RabbitMQ with DLQ & retry support. |
| | `renderEmailTemplate(template, vars)` | **HTML Email Template Renderer.** Injects dynamic placeholders `{{variable}}` into branded HANDY GO responsive HTML email layouts. |
| | `EVENT_PATTERNS` | **Standardized Domain Event Constants.** E.g., `EVENT_PATTERNS.USER_REGISTERED`. |
| | `ApiResponseEnvelope`<br>`ApiResponseDto`<br>`buildSuccessResponse(data, message, statusCode)` | **Standardized API Response Envelope Engine.** Wraps all HTTP responses across microservices in `{ statusCode: 200, message: '...', data: T }` structure. |

| **`@app/auth`**<br>`libs/auth/src/` | `@Public()` | Disables default JWT authentication guard for open endpoints (e.g., login, register, health). |
| | `@RequirePermissions(...)` | Enforces declarative RBAC permission codes on routes. E.g., `@RequirePermissions(StandardPermissions.AUTH_ME)`. |
| | `@CurrentUser()` | Parameter decorator resolving the authenticated user from the JWT payload: `@CurrentUser() user: AuthenticatedUser`. |
| | `TokenSignerService` | **RS256 JWT Signer.** Generates access tokens, refresh tokens, and SHA-256 token hashes using RSA private keys. |
| | `TokenVerifierService` | **RS256 JWT Verifier.** Validates tokens using public keys without requiring access to private keys. |
| | `Role`, `RegisterRole`<br>`StandardPermissions` | Canonical enums for roles (`CUSTOMER`, `WORKER`, `ADMIN`) and permissions (`AUTH_ME`, `PROFILE_READ`, `PROFILE_UPDATE`, ...). |
| **`@app/database`**<br>`libs/database/src/` | `AuthPrismaService` | Prisma client connected to `auth_db` with connection pooling. |
| | `UserTrustPrismaService` | Prisma client connected to `user_trust_db` with connection pooling. |
| **`@app/config`**<br>`libs/config/src/` | `ConfigModule.forRoot(...)`<br>`ConfigService` | Strongly-typed environment variables, port definitions, secrets (`isProduction`, `nodeEnv`, `cloudinaryVideoChunkSizeMb`, etc.), and required key validation. |
| **`@app/rabbitmq`**<br>`libs/rabbitmq/src/` | `RabbitMQService` | RabbitMQ event broadcasting and RPC request-reply communications. |
| **`@app/redis`**<br>`libs/redis/src/` | `RedisService` | Redis cache access: `get`, `set`, `del`, `expire`. |
| **`@app/logger`**<br>`libs/logger/src/` | `LoggerModule.forRoot(name)` | High-performance Pino structured JSON logging module. |
| **`@app/cloudinary`**<br>`libs/cloudinary/src/` | `CloudinaryModule`<br>`CloudinaryService` | **Cloudinary Media Storage Integration.** Streaming image upload (`uploadImage`) and signed direct big-video chunk upload initialization (`createVideoUploadSignature`). |

---

### 4.2. Service-Internal Utilities & Infrastructure

| File Path | Function / Class | Purpose & Usage Contract |
| :--- | :--- | :--- |
| `apps/api-gateway/src/dev/dev-video-upload.controller.ts` | `DevVideoUploadController` | **Development Video Upload Tester.** Serves HTML/JS tester page at `GET /dev/video-upload` in non-production environments (`NODE_ENV !== 'production'`) for direct-to-Cloudinary chunked video upload testing. Throws `404` in production. |
| `common/utils/client-ip.util.ts` | `resolveClientIp(config, req, fallbackIp)` | **IP Spoofing Prevention.** Only trusts `x-forwarded-for` when validated against `x-internal-secret` from the API Gateway. Falls back to socket IP. |
| `common/utils/phone.util.ts` | `normalizeVietnamesePhone(rawPhone)` | **E.164 Vietnamese Mobile Phone Normalization.** Converts valid 10-digit mobile numbers (03, 05, 07, 08, 09) to `+84xxxxxxxxx`. Handles leading zeros (`840...`, `+840...`). Throws `BadRequestException` on invalid formats. |
| `common/utils/phone.util.ts` | `isValidVietnamesePhone(rawPhone)` | Boolean validator checking if a string conforms to Vietnamese mobile standards. |
| `common/utils/auth-response.builder.ts` | `AuthResponseBuilder` | **Standardized API Response Envelopes.** Factory methods: `buildRegisterResponse`, `buildAuthSuccessResponse`, `buildResendOtpResponse`, `buildLogoutResponse`, `buildMeResponse`. |
| `common/rate-limit/rate-limiter.service.ts` | `RateLimiterService` | **Multi-Tier Rate Limiting & Brute-Force Lockout:**<br>- `checkAndIncrement(key, limit, windowSecs, message)`: Throttler sliding window.<br>- `checkFailedLogins(phone)`: Lockout check (5 failed attempts locks for 15 minutes).<br>- `recordFailedLogin(phone)` & `resetFailedLogins(phone)`: Counter management. |
| `common/session/session.service.ts` | `SessionService` | **Session & Refresh Token Lifecycle:**<br>- `prepareSession()`: Pre-signs JWT prior to database transaction.<br>- `createSession()`: Stores session atomically.<br>- `rotateSession(refreshToken)`: Refresh token rotation with strict 7-day absolute lifetime.<br>- `revokeSession(refreshToken)`: Immediate invalidation on logout. |
| `common/rpc/user-trust.client.ts` | `UserTrustClient` | **Fail-Close RPC Client.** Communicates via RabbitMQ to verify user status and KYC profile provisioning in `user-trust-service`. |
| `apps/catalog-service/src/common/outbox/catalog-outbox.repository.ts` | `CatalogOutboxRepository` | **Catalog Service Outbox Repository.** Implements `OutboxRepository` interface to query/update pending events in `catalog_service.outbox_events` table. |
| `common/constants/auth.constants.ts` | Configuration Constants | Rate limits, lockout durations (`FAILED_LOGIN_LOCKOUT_SECONDS = 900`), and internal header names (`INTERNAL_GATEWAY_HEADER = 'x-internal-secret'`). |
| `otp/otp.service.ts` | `OtpService` | **Cryptographic OTP Service:** Generates 6-digit codes, HMAC-SHA256 hashing, timing-safe equality verification, and SMTP email dispatching. |

---

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
