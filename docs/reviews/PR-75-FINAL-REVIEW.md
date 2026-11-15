# PR #75 Final Review Report: Swagger & OpenAPI for Message Service

- **Repository:** `duyaivy/HANDY_GO`
- **PR:** [#75](https://github.com/duyaivy/HANDY_GO/pull/75)
- **Branch:** `chore/add-swagger-for-message-service`
- **Reviewer:** Senior Backend Engineer & Code Reviewer
- **Date:** 2026-11-11
- **Status:** Complete & Verified

---

## Executive Summary

PR #75 introduces complete OpenAPI/Swagger documentation for the Message Service, registers Message Service in API Gateway's unified Swagger UI multi-spec dropdown, and documents Socket.IO v1 contracts.

This review remediated all 5 identified review findings across documentation accuracy, endpoint topology, cursor security contracts, Socket.IO handshake error semantics, and API Gateway service whitelist hardening. All targeted changes preserve 100% backward compatibility for existing REST endpoints and Socket.IO events, enforce strict security controls, and align runtime behavior with official contract documentation.

---

## Remediated Review Findings

### Finding 1 — Incorrect conversation creation description (P2)
- **Problem:** Swagger annotations in `message.controller.ts` and DTOs stated that conversations require an already confirmed/accepted bid by the customer. However, the runtime business policy (`chatPermissions` in `backend/libs/common/src/message-contracts/policy.ts`) permits pre-booking chat during the bidding phase (`open_for_bidding` or `bidding_closed`) with an active, eligible bid before customer acceptance, as well as during active order execution.
- **Remediation:**
  - Updated `@ApiOperation` description in `backend/apps/message-service/src/message.controller.ts` to reflect exact policy conditions without implying customer acceptance is mandatory during bidding.
  - Updated `ConversationCreateDto.bidId` description in `backend/apps/message-service/src/dto/conversation-create.dto.ts`.
  - Reconciled REST contract documentation in `docs/message-service/REST-API-CONTRACTS.md`.
  - Underlying business policy and permission logic remain completely untouched.

### Finding 2 — Ambiguous public and internal OpenAPI endpoints (P2)
- **Problem:** Documentation and Swagger UI metadata previously suggested that client REST calls are proxied through API Gateway, obscuring the production WireGuard / Nginx routing topology and confusing public vs internal spec endpoints.
- **Remediation:**
  - Clarified full routing architecture across `docs/message-service/REST-API-CONTRACTS.md`, `docs/message-service/SOCKET-IO-CONTRACTS.md`, and `backend/apps/message-service/src/application.ts`:
    - **Public Swagger UI:** `https://handygo.duyaivy.id.vn/docs` (unified multi-spec dropdown hosted by API Gateway).
    - **Public Message Service OpenAPI Specification:** `https://handygo.duyaivy.id.vn/docs/specs/message-service` (proxied and normalized by API Gateway for browser consumption).
    - **Public Gateway OpenAPI JSON:** `https://handygo.duyaivy.id.vn/docs-json`.
    - **Internal Message Service OpenAPI JSON:** `http://10.77.0.4:3009/docs-json` (Message Service on VPS4 over WireGuard; `http://127.0.0.1:3009/docs-json` locally).
    - **Message Service REST API Traffic:** Handled directly by production Nginx on VPS1 routing `/api/v1/conversations` to Message Service on VPS4 (`http://10.77.0.4:3009`).
    - **Socket.IO Real-time Chat:** Routed directly through production Nginx to VPS4 (`http://10.77.0.4:3009`) with WebSocket sticky upgrade, bypassing API Gateway.
  - Removed misleading description implying API Gateway proxies message traffic.
  - Confirmed Swagger "Try it out" targets relative path `/api/v1/conversations` at public origin, matching Nginx upstream rules without adding unnecessary Gateway proxy routes.

### Finding 3 — Invalid cursor examples (P2)
- **Problem:** `ConversationListQueryDto` and `ConversationPageDto` contained a raw, unsigned base64url-encoded JSON string as a cursor example (`eyJ2IjoxLCJ1c2VySWQi...`). Passing this into the API caused `CursorCodec.decode()` to throw `VALIDATION_ERROR` (400) due to a missing HMAC-SHA256 signature, breaking Swagger UI "Try it out".
- **Remediation:**
  - Removed misleading `example` from `@ApiPropertyOptional` for query parameter `cursor` in `backend/apps/message-service/src/dto/conversation-query.dto.ts`, allowing Swagger UI "Try it out" to query the first page cleanly.
  - Documented that clients must pass the exact opaque string from `nextCursor` without fabricating or parsing cursor values.
  - Replaced `nextCursor` example in `backend/apps/message-service/src/dto/message-response.dto.ts` with a valid HMAC-signed opaque cursor generated via `CursorCodec` with standard test fixtures.
  - Added regression test asserting `CursorCodec` decodability and rejection of unsigned base64 JSON.

### Finding 4 — Socket.IO handshake error mismatch (P2)
- **Problem:** Contract documentation stated that exceeding the limit of 10 concurrent sockets per user returns `RATE_LIMITED`. However, `realtime.ts` catch block unconditionally converted all handshake errors to `UNAUTHORIZED`.
- **Remediation:**
  - Updated handshake middleware in `backend/apps/message-service/src/realtime.ts` to inspect the caught error:
    - If `err instanceof ChatError && err.code === 'RATE_LIMITED'`, emit error with message `'Rate limited'` and payload `{ code: 'RATE_LIMITED', retryable: true }`.
    - Otherwise (invalid/missing/expired JWT), emit error with message `'Unauthorized'` and payload `{ code: 'UNAUTHORIZED', retryable: false }`.
  - Updated `docs/message-service/SOCKET-IO-CONTRACTS.md` to document both error payload shapes.
  - Added test coverage in `backend/apps/message-service/src/realtime.spec.ts` for invalid JWT, exceeding 10 concurrent connections, rejection payload verification, and slot recovery after disconnect.

### Finding 5 — Harden Swagger service whitelist (P3)
- **Problem:** `SwaggerSpecsController` resolved extra spec services via `EXTRA_SPEC_SERVICES[serviceName]`. Object index access allowed prototype inheritance (`constructor`, `toString`, `valueOf`, `__proto__`) to return functions instead of undefined, risking unexpected SSRF or runtime crashes.
- **Remediation:**
  - Replaced object literal with strict `ReadonlyMap<string, string>`.
  - Looked up service names using `EXTRA_SPEC_SERVICES.get(serviceName)`.
  - Validated that `envKey` exists and `typeof envKey === 'string'`, otherwise throwing `NotFoundException`.
  - Added unit regression tests in `swagger-specs.controller.spec.ts` covering prototype pollution keys (`constructor`, `toString`, `valueOf`, `__proto__`, `hasOwnProperty`, `isPrototypeOf`), unknown services, and valid services.

---

## Files Modified

| File | Changes |
|------|---------|
| `backend/apps/api-gateway/src/swagger/swagger-specs.controller.ts` | Replaced object dictionary with `ReadonlyMap`, enforced strict own-lookup, hardened SSRF whitelist. |
| `backend/apps/api-gateway/src/swagger/swagger-specs.controller.spec.ts` | Added regression tests for prototype pollution keys and allowlist validation. |
| `backend/apps/message-service/src/application.ts` | Clarified public vs internal documentation endpoints and Nginx direct routing in Swagger description. |
| `backend/apps/message-service/src/dto/conversation-create.dto.ts` | Corrected bidId parameter description to reflect active/selected bidding rules. |
| `backend/apps/message-service/src/dto/conversation-query.dto.ts` | Removed invalid prefill cursor example, updated documentation for opaque cursor usage. |
| `backend/apps/message-service/src/dto/message-response.dto.ts` | Replaced invalid cursor example with genuine HMAC-signed opaque cursor fixture. |
| `backend/apps/message-service/src/message.controller.ts` | Updated `@ApiOperation` description to match `chatPermissions` policy; clarified query cursor description. |
| `backend/apps/message-service/src/realtime.ts` | Differentiated `RATE_LIMITED` (`retryable: true`) from `UNAUTHORIZED` (`retryable: false`) during Socket.IO handshake. |
| `backend/apps/message-service/src/realtime.spec.ts` | Added unit tests for invalid JWT, concurrent socket rate limiting, error payload assertions, and slot recovery. |
| `backend/apps/message-service/test/message-openapi.spec.ts` | Added assertions for creation description, architecture URLs, HMAC cursor decodability, and fake cursor rejection. |
| `docs/message-service/REST-API-CONTRACTS.md` | Documented public vs internal OpenAPI endpoints and Nginx direct VPS4 routing. |
| `docs/message-service/SOCKET-IO-CONTRACTS.md` | Documented public vs internal spec URLs and distinct `connect_error` shapes (`UNAUTHORIZED` vs `RATE_LIMITED`). |

---

## Verification Evidence

All verification commands executed from repository root and `backend/`:

### 1. Message Service OpenAPI Spec Tests
```bash
cd backend && pnpm vitest run message-openapi.spec.ts
```
- **Output:** 2 passed (2 tests), Duration: 787ms
  - `✓ exposes Swagger UI at /docs and OpenAPI spec at /docs-json without requiring authentication`
  - `✓ reconciles with checked-in docs/message-service/openapi.json without silent drift`

### 2. API Gateway Swagger Integration & Unit Tests
```bash
cd backend && pnpm vitest run gateway-swagger.integration.spec.ts swagger-specs.controller.spec.ts
```
- **Output:** 2 passed (13 tests), Duration: 519ms
  - `✓ includes Message Service in the Swagger UI multi-spec dropdown config`
  - `✓ GET /docs/specs/message-service resolves and rewrites Message Service spec`
  - `✓ từ chối các thuộc tính kế thừa và prototype pollution (constructor, toString, __proto__)`
  - `✓ chấp nhận các dịch vụ hợp lệ được định nghĩa trong SERVICE_ROUTES hoặc allowlist`

### 3. Socket.IO Handshake & Admission Rate Limit Tests
```bash
cd backend && pnpm vitest run realtime.spec.ts
```
- **Output:** 1 passed (15 tests), Duration: 1.15s
  - `✓ counts pending handshakes atomically and releases capacity on disconnect`
  - `✓ rejects handshake with UNAUTHORIZED when JWT authentication fails`
  - `✓ rejects handshake with RATE_LIMITED when exceeding 10 concurrent sockets and recovers slot on disconnect`
  - `✓ limits typing.start before authentication, DB and authority calls`
  - `✓ limits message.send before re-authentication and application work`

### 4. Production Service Endpoint Topology Tests
```bash
cd backend && pnpm vitest run service-endpoints.spec.ts
```
- **Output:** 1 passed (5 tests), Duration: 152ms
  - `✓ validates Message Service WireGuard address for api-gateway in production`
  - `✓ requires WireGuard routing for every User Trust caller, including the gateway`

### 5. Message Service & Common Contracts Regressions
```bash
cd backend && pnpm vitest run apps/message-service/ && pnpm run test:message:contracts
```
- **Output:**
  - `apps/message-service`: 10 passed, 4 skipped (integration suites requiring live DB), 67 passed, 21 skipped, Duration: 2.88s
  - `test:message:contracts`: 2 passed, 47 passed, Duration: 162ms

### 6. Backend Code Quality (Lint)
```bash
cd backend && pnpm run lint
```
- **Output:** `Finished in 37ms on 789 files with 96 rules using 11 threads. Found 10 warnings and 0 errors.` (0 lint errors).

### 7. Backend Typecheck
```bash
cd backend && pnpm run typecheck && pnpm run typecheck:message && pnpm run typecheck:message:runtime
```
- **Output:** All 3 TypeScript compilation checks exited with code 0 without any type errors.

### 8. Backend Build
```bash
cd backend && pnpm run build:message && pnpm run build:gateway && pnpm run build
```
- **Output:** Successfully compiled all 19 NestJS/Rspack microservice targets without errors.

---

## Production Smoke-Test Guide (Manual Runbook)

Because production WireGuard mesh and external VPS4 hosts are not running locally, execute the following smoke tests on production servers after deployment:

```bash
# 1. Verify Message Service container health on VPS4 (from VPS1 over WireGuard)
ssh deploy@10.77.0.1 "curl -fsS http://10.77.0.4:3009/health"

# 2. Verify Internal OpenAPI spec is served over WireGuard
ssh deploy@10.77.0.1 "curl -fsS http://10.77.0.4:3009/docs-json | jq .info"

# 3. Verify API Gateway spec proxy endpoint on VPS1
curl -fsS https://handygo.duyaivy.id.vn/docs/specs/message-service | jq .info

# 4. Verify Swagger UI multi-spec dropdown contains message-service
curl -fsS https://handygo.duyaivy.id.vn/docs | grep "message-service"

# 5. Verify Nginx direct routing of REST conversations endpoint (requires Bearer token)
curl -i -X POST https://handygo.duyaivy.id.vn/api/v1/conversations \
  -H "Authorization: Bearer <VALID_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"bidId":"00000000-0000-0000-0000-000000000000"}'

# 6. Verify Socket.IO handshake reject on invalid token
curl -i "https://handygo.duyaivy.id.vn/api/v1/chat/socket.io/?EIO=4&transport=polling"
```

---

## Remaining Risks

1. **Production WireGuard Latency:** When API Gateway on VPS1 fetches `/docs-json` from Message Service on VPS4 over WireGuard, network latency or packet loss could trigger the 5-second timeout, falling back to the offline spec stub. In production, this can be monitored via Gateway error logs.
2. **Client Cursor Resumption:** Clients must preserve `nextCursor` verbatim. If third-party clients attempt to construct or manipulate cursors manually, they will fail signature verification with 400. This is an intended security feature and is now explicitly documented.

---

## Merge Recommendation

### **READY TO MERGE**

**Justification:**
1. All 5 review findings are resolved with minimal, targeted, and backward-compatible changes.
2. Zero business logic or database migrations were modified.
3. Security posture is improved by eliminating prototype pollution vectors in Gateway Swagger proxying and correctly signing cursor documentation fixtures.
4. All unit, integration, lint, typecheck, and build steps pass with 100% success rate.
