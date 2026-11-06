# Message Service Phase 2 Implementation Report

**Project:** HANDY_GO  
**Phase:** 2 (Bid-Authorized Messaging Implementation)  
**Authors:** Codex (initial implementation) & Antigravity (recovery, bugfix, integration & verification)  
**Date:** November 2026  
**Status:** COMPLETE (Ready for Phase 3 Infrastructure Deployment)  

---

## 1. Overview & Architecture

Phase 2 implements the bid-authorized private messaging system for HANDY_GO, connecting Customers and Workers on a one-to-one basis once a valid, committed worker bid exists. The architecture adheres to the zero-trust security model established in Phase 1:

```
[ Mobile App (Customer / Worker) ]
             |
             v  (TLS / Public Origin: https://handygo.duyaivy.id.vn)
      [ VPS1 Nginx ]
             |
             +--> /api/v1/conversations  --> [ VPS4 Message Service (NestJS) ]
             +--> /api/v1/chat/socket.io --> [ VPS4 Message Service (Socket.IO) ]
             |
             v (Internal Service Mesh / WireGuard)
  +----------+---------------------------------------------+
  |                                                        |
  v                                                        v
[ VPS1 Auth / Gateway / Cloudinary ]           [ VPS2 Bidding / Order Services ]
  - /internal/auth/chat-session                  - /internal/bids/:bidId/chat-eligibility
  - /internal/media/chat/verify                  - /internal/bids/chat-lookup
                                                 - /internal/service-requests/:id/chat-state
                                                           |
                                                           v
                                            [ RabbitMQ Notification Exchange ]
                                                           |
                                                           v
                                            [ Notification Service (PostgreSQL) ]
```

---

## 2. Backend Implementation Details

### 2.1 Service Foundation (`backend/foundations/message-service`)
- **Runtime:** NestJS 12 running on Node.js (ESM), standalone bootstrap under `foundations/message-service/src/main.ts`.
- **Database:** Dedicated PostgreSQL schema `message`. Isolated Prisma client generated via `@prisma/message-client`.
- **Database Migrations:**
  - `20261106000000_initial_message`: Tables for `conversations`, `messages`, `attachments`, `read_states`, `outbox_events`, `inbox_events`. Sequence and immutability triggers.
  - `20261106010000_conversation_list_indexes`: Performance indexes on `(customer_id, last_message_at DESC)` and `(worker_id, last_message_at DESC)`.
- **Configuration:** Managed via `.env` with variables `DATABASE_URL_MESSAGE`, `DIRECT_URL_MESSAGE`, `MESSAGE_JWT_PUBLIC_KEY`, `MESSAGE_INTERNAL_SECRET`, `MESSAGE_CURSOR_SECRET`, `RABBITMQ_URL`, `BIDDING_SERVICE_URL`, `ORDER_SERVICE_URL`, `AUTH_SERVICE_URL`, `MEDIA_SERVICE_URL`.

### 2.2 REST API Controllers (`application.ts`)
Base URL: `/api/v1/conversations` (strict response envelope `{ statusCode, message, data }`):
1. `POST /api/v1/conversations`:
   - Payload: `{ bidId: UUID }`.
   - Checks caller identity from JWT (marketplace `userId`), verifies active session in Auth Service, queries Bidding Service for bid validity.
   - Idempotently creates or returns existing conversation for `(requestId, customerId, workerId)`.
2. `GET /api/v1/conversations`:
   - Query: `limit?: number`, `cursor?: string`.
   - Cursor encrypted with HMAC-SHA256 containing `{ v: 1, userId, sortTimestamp, id }`.
   - Returns paginated list of conversations where user is customer or worker.
3. `GET /api/v1/conversations/:id`:
   - Returns conversation details and current computed permissions (`permissions.read`, `permissions.send`, `permissions.reason`).
4. `GET /api/v1/conversations/:id/messages`:
   - Cursor pagination via `beforeSequence` (fetching older messages) or `afterSequence` (resynchronization after reconnect).
   - Returns `highWaterSequence` in the same snapshot.
5. `PATCH /api/v1/conversations/:id/read`:
   - Payload: `{ lastReadSequence: string }`.
   - Monotonically advances the caller's read cursor. Broadcasts `message.read.updated` to participants.

### 2.3 Realtime Socket.IO Gateway (`realtime.ts`)
- **Transport:** Path `/api/v1/chat/socket.io/` on namespace `/`. Maximum payload size bounded to 16 KiB.
- **Connection Handshake:** Requires valid JWT in `auth.token`. Limits connections to maximum 10 active sockets per user.
- **Session Introspection:** Each privileged incoming socket event re-checks user session validity against Auth Service.
- **Token Expiry Management:** Timers automatically disconnect sockets upon access token expiration (`user.exp`).
- **Events Implemented:**
  - `conversation.join` / `conversation.leave`: Room management (`conversation:<id>`).
  - `message.send`: Validates input, checks rate limits (20 sends / 10s, 60 / 60s), executes message persistence, commits outbox event, and emits ACK. Broadcasts `message.new` to conversation participants.
  - `typing.start` / `typing.stop`: Tracks ephemeral typing state in memory. Automatically expires after 5 seconds. Emits `typing.update` only to other joined participant sockets (never echoes back to sender).
  - `message.read`: Monotonically advances read sequence and broadcasts `message.read.updated`.

### 2.4 Security & Data Protection (`security.ts`)
- **Contact Information Blocker:** High-performance regex checks filter out Vietnamese phone numbers, international formats, email addresses, external URLs, social media links (Zalo, Facebook, Telegram, WhatsApp). Violations return `CONTACT_INFORMATION_BLOCKED` (HTTP 422).
- **Rate Limiting:** Sliding window rate limiter protects endpoints against abuse and DoS.
- **Cursor Tamper Protection:** Keyset pagination cursors are encrypted with HMAC-SHA256 (`CursorCodec`) and validate user ownership.

---

## 3. Upstream Services Integration

### 3.1 Bidding Service (`apps/bidding-service`)
- `GET /api/v1/internal/bids/:bidId/chat-eligibility`: Authoritative check verifying that the bid is persisted, committed (`status === 'active' || status === 'selected'`), round is valid, and deadline has not expired.
- `GET /api/v1/internal/bids/chat-lookup?requestId=&workerId=`: Authoritative lookup to retrieve the original bid for a given pair without altering the database schema.

### 3.2 Order Service (`apps/order-service`)
- `GET /api/v1/internal/service-requests/:id/chat-state`: Executes within a repeatable-read transaction to atomically read request status, customer ID, selected order status, worker ID, and completion timestamp.

### 3.3 Auth Service (`apps/auth-service`)
- `POST /api/v1/internal/auth/chat-session`: Checks `{ accountId, userId, sid }` against active, unrevoked database sessions. Verifies account status and performs RPC check with User Trust Service with a 1.5-second timeout.

### 3.4 API Gateway & Cloudinary Private Media (`libs/cloudinary`, `apps/api-gateway`)
- Direct uploads from client request an upload signature with `intent: 'chat'`.
- Uploads use Cloudinary **authenticated** asset delivery (never public).
- Custom context includes HMAC receipt `HMAC-SHA256(ownerId:resourceType:storageKey, secret)`.
- `POST /api/v1/internal/media/chat/verify`: Validates storage key, owner binding, MIME type, and bytes. Generates a signed, private download URL valid for 5 minutes (`private_download_url`).

### 3.5 Notification Service (`apps/notification-service`)
- Ingests `message.created` (v1) events from RabbitMQ exchange `handygo.events`.
- Idempotently deduplicates events by `(conversationId, messageId, recipientId)`.
- **Privacy Enforcement:** Strips message content, URLs, and attachment metadata. Generates generic Vietnamese notification: *"Bạn có tin nhắn mới từ khách hàng/thợ"* and attaches deep link `handygo://chat/<conversationId>`.

---

## 4. Mobile Implementation Details

### 4.1 Chat Socket Manager (`mobile/src/features/chat/chat-socket.ts`)
- Singleton socket instance managing connection lifecycle.
- Automatically handles token expiration: upon `UNAUTHORIZED` connect error, triggers `refreshTokens()` and reconnects transparently.
- Implements typed `subscribe(event, handler)` and `request(event, payload)` returning a Promise resolved by socket ACK.

### 4.2 State Management & Cache (`mobile/src/features/chat/use-chat.ts`, `message-cache.ts`)
- Powered by TanStack Query (`queryClient`).
- **Optimistic UI:** When sending, messages immediately display in `outgoing` queue with a pending indicator.
- **Deduplication & Merge:** Merges incoming socket messages with local cache by `id` and `sequence`.
- **Contiguous Gap Resynchronization:** Tracks `contiguousSequence`. If a gap in sequence is detected (e.g. after network drop), automatically triggers paginated `afterSequence` queries until the high water mark is reached.
- **Monotonic Read Reporting:** Automatically sends `PATCH /conversations/:id/read` when the screen is focused and active.

### 4.3 UI Components & Screens
- `mobile/src/features/chat/chat-screen.tsx`:
  - FlatList with inverted message layout.
  - Reply quote preview and dismiss banner.
  - Inline image/video preview with full-screen view modal.
  - Dynamic typing indicator with bubble animation.
  - Resend button for failed outgoing messages with preserved `clientMessageId`.
- `mobile/src/features/chat/chat-entry.tsx`:
  - Entry button embedded in Customer Booking Radar (`mobile/src/app/customer/booking/radar.tsx`) and Worker screens (`worker-bid-modal.tsx`, `worker-job-detail-screen.tsx`).
  - Automatically invokes `ChatApi.create(bidId)` and navigates to `/chat/[id]`.
- Vietnamese localization across all states:
  - Error messages: *"Vui lòng không chia sẻ thông tin liên lạc ngoài ứng dụng"*, *"Cuộc trò chuyện hiện chỉ cho phép xem lịch sử"*, etc.
  - Read-only banner when order is completed or non-selected bid is rejected.

---

## 5. Verification Summary

All verification gates have been executed against real, isolated dependencies:
- **Prisma Schema & Database Invariants:** 27 assertions passed (`test-message-database.mjs`).
- **REST & Socket.IO Real Runtime:** 7 test suites passed in disposable PostgreSQL container (`test-message-runtime.mjs`).
- **RabbitMQ Broker Integration:** 2 test suites passed in disposable PostgreSQL + RabbitMQ containers (`test-message-broker.mjs`).
- **Message Contracts:** 47 test assertions passed (`test:message:contracts`).
- **Upstream Services Vitest:** 14 files / 144 tests passed (`chat-authority`, `chat-endpoints`, `chat-media-http`, `chat-session`, etc.).
- **Notification Integration:** 25 files / 225 tests passed (`test:notification:events`).
- **Mobile Frontend:** 68 test suites / 486 tests passed (`pnpm check-all` clean).
- **TypeScript & Linting:** 0 errors across both Backend (`oxlint`) and Mobile (`eslint`).
