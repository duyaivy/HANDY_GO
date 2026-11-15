# Message Service Phase 2 Verification Report

**Project:** HANDY_GO  
**Phase:** 2 (Bid-Authorized Messaging Verification)  
**Execution Agent:** ANTIGRAVITY  
**Verification Environment:** macOS / Darwin (Local isolated containers: PostgreSQL 17 Alpine, RabbitMQ 4.2 Alpine)  
**Date:** November 2026  
**Overall Result:** PASS (Phase 2 Gates Passed 100%)  

---

## 1. Summary of Verification Outcomes

| Domain | Total Tests / Assertions | Status | Execution Harness |
|--------|--------------------------|--------|-------------------|
| **Database Schema & Invariants** | 27 / 27 | PASS | `backend/scripts/test-message-database.mjs` |
| **REST & Socket.IO Runtime** | 7 / 7 | PASS | `backend/scripts/test-message-runtime.mjs` |
| **Broker Integration & Outbox** | 2 / 2 | PASS | `backend/scripts/test-message-broker.mjs` |
| **Message Contracts & Specs** | 47 / 47 | PASS | `pnpm test:message:contracts` |
| **Upstream Authority & Media** | 144 / 144 | PASS | `pnpm vitest run apps/order-service ...` |
| **Notification Events & Dedupe** | 225 / 225 | PASS | `pnpm test:notification:events` |
| **Backend Linting (Oxlint)** | 738 files checked | PASS | `pnpm run lint` |
| **Backend Typecheck** | 2 tsconfigs checked | PASS | `pnpm typecheck && pnpm typecheck:message:runtime` |
| **Backend Build** | Standalone build | PASS | `pnpm run build:message` |
| **Mobile Test Suites (Jest)** | 486 / 486 (68 suites) | PASS | `cd mobile && pnpm test` |
| **Mobile Typecheck** | All files checked | PASS | `cd mobile && pnpm run type-check` |
| **Mobile Lint (ESLint)** | All files checked | PASS | `cd mobile && pnpm run lint` |
| **Mobile Combined Check** | Complete CI gate | PASS | `cd mobile && pnpm run check-all` |

---

## 2. Detailed Test Runs & Commands

### 2.1 Message Database Schema & Invariants
- **Command:** `node scripts/test-message-database.mjs`
- **Container:** Disposable `postgres:17-alpine` container on random port.
- **Outcome:** **PASS** (27 / 27 checks passed)
- **Verified Invariants:**
  - Duplicate conversation identity rejected (`(request_id, customer_id, worker_id)` unique constraint).
  - Identical participants rejected (`customer_id != worker_id` check constraint).
  - Duplicate sender idempotency key rejected (`(conversation_id, sender_id, client_message_id)` unique).
  - Idempotency key unique across conversations.
  - Outsider sender rejected.
  - Cross-conversation reply rejected (`reply_to_id` must belong to same `conversation_id`).
  - Nonexistent reply rejected.
  - Empty text rejected.
  - Media message without attachment rejected at commit.
  - Concurrent sends allocate unique contiguous sequence (`BIGINT`).
  - Concurrent duplicate sends persist once and rollback duplicate sequence.
  - Read cursor monotonic under stale writes (`GREATEST(last_read_sequence, EXCLUDED.last_read_sequence)`).
  - Outsider read state rejected.
  - Read cursor beyond history rejected.
  - Conversation cannot transfer participants.
  - Read state identity immutable.
  - History and reply targets cannot be edited (immutability trigger).
  - Attachment cannot reference missing message.
  - Media transaction with verified reference persists.
  - Invalid metadata and type mismatch rejected.
  - Initial message counter cannot be forged directly.
  - Large allowed video with provider MIME persists.
  - Deletion restricted while history exists.
  - Migration history isolated in `message` schema (`_prisma_migrations`).
  - Prisma structural diff is empty after migration.
  - Runtime role restricted to `message` schema.

### 2.2 Real PostgreSQL REST and Socket.IO Runtime
- **Command:** `node scripts/test-message-runtime.mjs`
- **Container:** Disposable `postgres:17-alpine` container on random port.
- **Outcome:** **PASS** (7 / 7 tests passed, duration: 6.63s)
- **Verified Behaviors:**
  - Denies access before worker bidding and denies spoofed HTTP identity.
  - Creates conversation once under concurrent creates and isolates other workers.
  - Commits one message + outbox record and returns identical persisted ACK under concurrent retries.
  - Persists replies, rejects foreign reply targets, and recovers history after sequence.
  - Advances only caller's monotonic read cursor and rejects future cursor values.
  - Typing indicator expires and lifecycle denial applies to joined sockets while history remains intact.
  - Rejects revoked sessions on existing connected socket.

### 2.3 Committed Message Outbox to Real RabbitMQ & Notification Service
- **Command:** `node scripts/test-message-broker.mjs`
- **Containers:** Disposable `postgres:17-alpine` + `rabbitmq:4.2-alpine`.
- **Outcome:** **PASS** (2 / 2 tests passed, duration: 1.03s)
- **Verified Behaviors:**
  - ACK result is durable while publisher is stopped; subsequent delivery creates exactly one private generic recipient notification in Notification Service PostgreSQL database.
  - Duplicate transport delivery and different event IDs for the same logical message create no duplicate notifications.

### 2.4 Message Contracts & OpenAPI Validation
- **Command:** `pnpm test:message:contracts` (`vitest run libs/common/src/message-contracts`)
- **Outcome:** **PASS** (47 / 47 tests passed in 126ms)
- **Verified Contracts:**
  - OpenAPI 3.0 specification conformance (`openapi.spec.ts`, 4 tests).
  - Portable validators: `ConversationCreateInput`, `MessageSendInput`, `MessageReadInput`, pagination queries, attachment metadata, error codes, and permission matrices (`contracts.spec.ts`, 43 tests).

### 2.5 Upstream Authority, Auth, Media & Order Endpoints
- **Command:** `pnpm vitest run apps/order-service/src/internal apps/bidding-service/src/bids apps/auth-service/src/internal apps/auth-service/src/common/session libs/cloudinary/src apps/api-gateway/src/uploads`
- **Outcome:** **PASS** (14 files, 144 tests passed in 1.25s)
- **Verified Behaviors:**
  - Bidding Service: `/internal/bids/:bidId/chat-eligibility` and `/internal/bids/chat-lookup`.
  - Order Service: `/internal/service-requests/:id/chat-state` with repeatable-read isolation and internal secret guard.
  - Auth Service: `/internal/auth/chat-session` session binding and User Trust RPC timeout.
  - Cloudinary: Authenticated delivery context, HMAC receipt validation, upload size bounds check (`Math.min(chatCap, configuredCap)`), 5-minute signed URL expiration.
  - API Gateway: Internal secret verification bypass for chat media upload verifier.

### 2.6 Notification Service Ingestion & Push Integration
- **Command:** `pnpm test:notification:events` (`node scripts/test-notification-events.mjs`)
- **Containers:** Docker Compose with isolated PostgreSQL + RabbitMQ.
- **Outcome:** **PASS** (25 test files, 225 tests passed in 52.87s)
- **Verified Behaviors:**
  - `message.created` v1 event parsing, validation, and schema compliance.
  - Stripping of message body and private attachment links.
  - Generic notification text generation: *"Bạn có tin nhắn mới từ thợ"* / *"Bạn có tin nhắn mới từ khách hàng"*.
  - Idempotent inbox insertion and transaction rollback safety.
  - Push notification dispatch and recipient preference honoring.

### 2.7 Backend Static Analysis & Build
- **Oxlint:** `pnpm run lint` -> **PASS** (738 files, 0 errors, 0 warnings).
- **TypeScript:** `pnpm typecheck && pnpm typecheck:message:runtime` -> **PASS** (0 errors).
- **Build:** `pnpm run build:message` (`tsc -p foundations/message-service/tsconfig.build.json`) -> **PASS** (exit code 0).

### 2.8 Mobile Test Suite & Static Analysis
- **Jest Unit & Component Tests:** `cd mobile && pnpm test` -> **PASS** (68 test suites, 486 tests passed in 4.63s).
- **Mobile Chat Tests:**
  - `use-chat.test.tsx` (PASS)
  - `chat-entry.test.tsx` (PASS)
  - `chat-socket.test.ts` (PASS)
  - `chat-media.test.ts` (PASS)
  - `chat-config.test.ts` (PASS)
  - `message-cache.test.ts` (PASS)
- **Mobile Typecheck:** `cd mobile && pnpm run type-check` -> **PASS** (0 errors).
- **Mobile ESLint:** `cd mobile && pnpm run lint` -> **PASS** (0 errors, 18 pre-existing warnings in unrelated files).
- **Mobile Check-All Gate:** `cd mobile && pnpm run check-all` -> **PASS** (clean run of lint + typecheck + test).

---

## 3. End-to-End User Journey Verification

```
[1] Customer creates Service Request
       |
       v (PASS: Order Service creates request record)
[2] Worker submits valid Bid
       |
       v (PASS: Bidding Service commits bid; eligibility is true)
[3] Chat access unlocked for both participants
       |
       v (PASS: ChatEntry button visible and enabled on Customer Radar and Worker Job detail)
[4] Conversation opened
       |
       v (PASS: POST /api/v1/conversations creates or fetches private conversation)
[5] Socket.IO connection established
       |
       v (PASS: Handshake authenticated; socket joins conversation room)
[6] Realtime messaging (Text & Replies)
       |
       v (PASS: Text sent, validated for off-platform contacts, sequence allocated, ACK received)
[7] Media messaging (Image & Video)
       |
       v (PASS: Upload with intent='chat', HMAC verified, short-lived private download URL rendered)
[8] Typing indicators
       |
       v (PASS: typing.start/stop broadcasts typing.update to counterpart; expires in 5s)
[9] Read status tracking
       |
       v (PASS: PATCH /conversations/:id/read advances sequence; updates message.read.updated)
[10] Network disconnect & reconnect
       |
       v (PASS: Socket reconnects, refreshes token, gap resync fetches missing messages via afterSequence)
[11] Worker selected & Order completed
       |
       v (PASS: Selected worker conversation stays open; other workers become READ_ONLY; history preserved)
```

---

## 4. Verification Status Classifications

- **PASS:**
  - Database schema, migrations, and constraint invariants.
  - NestJS REST API endpoints (`/conversations`, `/messages`, `/read`).
  - Socket.IO gateway connection, authentication, room isolation, and events.
  - Message sequence allocation and deduplication.
  - Off-platform contact information blocking.
  - Media attachment ownership and private download URL generation.
  - Ephemeral typing indicators and automatic expiration.
  - Monotonic read sequence synchronization.
  - RabbitMQ outbox publishing and Notification Service deduplication.
  - Mobile Expo Router navigation and conversation screens.
  - Mobile optimistic messaging, retry handling, and cache gap recovery.
  - Mobile Vietnamese UI localization.
  - All unit, integration, and static analysis test suites.

- **NOT_RUN / BLOCKED (Deferred to Phase 3 Preflight / Staging):**
  - **Live Cloudinary Asset Uploads:** Real production Cloudinary API upload and Admin API asset inspection were not executed in automated tests because production API secrets are reserved for production/staging environments. Mocked and SDK-verified interfaces passed.
  - **Physical Device Push Notifications (APNs / FCM):** Real Apple Push Notification Service and Firebase Cloud Messaging end-to-end device delivery requires physical devices with registered device push tokens. Local push worker unit and integration tests passed.
  - **Multi-VPS Network Routing:** WireGuard tunnel (`10.77.0.4`) and VPS1 Nginx reverse proxy configuration are Phase 3 deployment tasks.
