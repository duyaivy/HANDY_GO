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
| | `bootstrapApplication(Module)` | **Microservice Bootstrap Engine.** Configures Pino logging, global `/api/v1` prefix, CORS, Swagger OpenAPI, and global ValidationPipe. Used in `main.ts`. |
| | `OutboxPublisherService`<br>`OutboxRepository` | **Reliable Transactional Outbox Pattern.** Persists domain events into the database within the same transaction and asynchronously dispatches to RabbitMQ with DLQ & retry support. |
| | `renderEmailTemplate(template, vars)` | **HTML Email Template Renderer.** Injects dynamic placeholders `{{variable}}` into branded HANDY GO responsive HTML email layouts. |
| | `EVENT_PATTERNS` | **Standardized Domain Event Constants.** E.g., `EVENT_PATTERNS.USER_REGISTERED`. |
| **`@app/auth`**<br>`libs/auth/src/` | `@Public()` | Disables default JWT authentication guard for open endpoints (e.g., login, register, health). |
| | `@RequirePermissions(...)` | Enforces declarative RBAC permission codes on routes. E.g., `@RequirePermissions(StandardPermissions.AUTH_ME)`. |
| | `@CurrentUser()` | Parameter decorator resolving the authenticated user from the JWT payload: `@CurrentUser() user: AuthenticatedUser`. |
| | `TokenSignerService` | **RS256 JWT Signer.** Generates access tokens, refresh tokens, and SHA-256 token hashes using RSA private keys. |
| | `TokenVerifierService` | **RS256 JWT Verifier.** Validates tokens using public keys without requiring access to private keys. |
| | `Role`, `RegisterRole`<br>`StandardPermissions` | Canonical enums for roles (`CUSTOMER`, `WORKER`, `ADMIN`) and permissions (`AUTH_ME`, `PROFILE_READ`, `PROFILE_UPDATE`, ...). |
| **`@app/database`**<br>`libs/database/src/` | `AuthPrismaService` | Prisma client connected to `auth_db` with connection pooling. |
| | `UserTrustPrismaService` | Prisma client connected to `user_trust_db` with connection pooling. |
| **`@app/config`**<br>`libs/config/src/` | `ConfigModule.forRoot(...)`<br>`ConfigService` | Strongly-typed environment variables, port definitions, secrets, and required key validation. |
| **`@app/rabbitmq`**<br>`libs/rabbitmq/src/` | `RabbitMQService` | RabbitMQ event broadcasting and RPC request-reply communications. |
| **`@app/redis`**<br>`libs/redis/src/` | `RedisService` | Redis cache access: `get`, `set`, `del`, `expire`. |
| **`@app/logger`**<br>`libs/logger/src/` | `LoggerModule.forRoot(name)` | High-performance Pino structured JSON logging module. |

---

### 4.2. Service-Internal Utilities & Infrastructure (`apps/auth-service/src/common/`)

| File Path | Function / Class | Purpose & Usage Contract |
| :--- | :--- | :--- |
| `common/utils/client-ip.util.ts` | `resolveClientIp(config, req, fallbackIp)` | **IP Spoofing Prevention.** Only trusts `x-forwarded-for` when validated against `x-internal-secret` from the API Gateway. Falls back to socket IP. |
| `common/utils/phone.util.ts` | `normalizeVietnamesePhone(rawPhone)` | **E.164 Vietnamese Mobile Phone Normalization.** Converts valid 10-digit mobile numbers (03, 05, 07, 08, 09) to `+84xxxxxxxxx`. Handles leading zeros (`840...`, `+840...`). Throws `BadRequestException` on invalid formats. |
| `common/utils/phone.util.ts` | `isValidVietnamesePhone(rawPhone)` | Boolean validator checking if a string conforms to Vietnamese mobile standards. |
| `common/utils/auth-response.builder.ts` | `AuthResponseBuilder` | **Standardized API Response Envelopes.** Factory methods: `buildRegisterResponse`, `buildAuthSuccessResponse`, `buildResendOtpResponse`, `buildLogoutResponse`, `buildMeResponse`. |
| `common/rate-limit/rate-limiter.service.ts` | `RateLimiterService` | **Multi-Tier Rate Limiting & Brute-Force Lockout:**<br>- `checkAndIncrement(key, limit, windowSecs, message)`: Throttler sliding window.<br>- `checkFailedLogins(phone)`: Lockout check (5 failed attempts locks for 15 minutes).<br>- `recordFailedLogin(phone)` & `resetFailedLogins(phone)`: Counter management. |
| `common/session/session.service.ts` | `SessionService` | **Session & Refresh Token Lifecycle:**<br>- `prepareSession()`: Pre-signs JWT prior to database transaction.<br>- `createSession()`: Stores session atomically.<br>- `rotateSession(refreshToken)`: Refresh token rotation with strict 7-day absolute lifetime.<br>- `revokeSession(refreshToken)`: Immediate invalidation on logout. |
| `common/rpc/user-trust.client.ts` | `UserTrustClient` | **Fail-Close RPC Client.** Communicates via RabbitMQ to verify user status and KYC profile provisioning in `user-trust-service`. |
| `common/constants/auth.constants.ts` | Configuration Constants | Rate limits, lockout durations (`FAILED_LOGIN_LOCKOUT_SECONDS = 900`), and internal header names (`INTERNAL_GATEWAY_HEADER = 'x-internal-secret'`). |
| `otp/otp.service.ts` | `OtpService` | **Cryptographic OTP Service:** Generates 6-digit codes, HMAC-SHA256 hashing, timing-safe equality verification, and SMTP email dispatching. |

---

## 5. Feature Blueprint & Implementation Template

When creating a new business feature, agents must replicate this pattern:

### 5.1. Controller Scaffold (`<feature>.controller.ts`)
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

### 5.2. Module Scaffold (`<feature>.module.ts`)
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
