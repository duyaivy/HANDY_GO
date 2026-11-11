# Socket.IO Real-time Chat Contracts (v1)

This document specifies the production Socket.IO v1 contracts for HANDY_GO Message Service running on VPS4. REST endpoints are documented separately via Swagger UI (`/docs`) and OpenAPI JSON (`/docs-json`).

Production Nginx terminates TLS at `https://handygo.duyaivy.id.vn` and routes `/api/v1/chat/socket.io/` directly to VPS4 over WireGuard (`http://10.77.0.4:3009`), supporting HTTP Long-Polling and WebSocket sticky upgrades.

---

## 1. Connection & Authentication

- **Path:** `/api/v1/chat/socket.io/`
- **Namespace:** `/` (default namespace)
- **Transport:** Polling (`transport=polling`) and WebSocket upgrade (`transport=websocket`)
- **Max Payload Buffer:** 16,384 bytes (16 KiB)

### Handshake Authentication

Clients must provide their JWT Access Token in the handshake `auth` object. Query string credentials are not accepted.

```javascript
import { io } from 'socket.io-client';

const socket = io('https://handygo.duyaivy.id.vn', {
  path: '/api/v1/chat/socket.io/',
  auth: {
    token: accessToken, // Bearer JWT token from POST /api/v1/auth/login
  },
  transports: ['polling', 'websocket'],
});
```

### Handshake Verification & Admission Policy

1. **Token Validation:** Verified using `TokenVerifierService` (RS256 signature, issuer, audience, expiration, non-empty `userId`).
2. **Concurrent Connection Slots:** Maximum **10 concurrent sockets per user** (`userId`). Excess handshakes are rejected with `RATE_LIMITED`.
3. **Connection Error Shape:** Handshake failure produces a `connect_error` event with:
   ```json
   {
     "message": "Unauthorized",
     "data": {
       "code": "UNAUTHORIZED",
       "retryable": false
     }
   }
   ```
4. **Token Expiry Disconnect:** Upon connection, the server arms an unreferenced timer scheduled for `user.exp * 1000 - Date.now()`. When the token expires, the socket is immediately and forcibly disconnected (`socket.disconnect(true)`). Clients must refresh tokens before expiry and reconnect.

---

## 2. Rooms & Presence

- **User Room:** `user:{userId}` — Joined automatically upon successful authentication. Used for user-scoped broadcasts (e.g. new messages across all user conversations).
- **Conversation Room:** `conversation:{conversationId}` — Joined explicitly by client via `conversation.join`. Used for active viewing, typing indicators, and message broadcasts.

---

## 3. Wire Interfaces & Acknowledgement (ACK) Format

Every client-to-server event must supply an Acknowledgement (ACK) callback. Responses follow standard `ChatAck<T>`:

### Success ACK:
```json
{
  "ok": true,
  "data": { ... }
}
```

### Error ACK:
```json
{
  "ok": false,
  "error": {
    "code": "CHAT_ERROR_CODE",
    "message": "CHAT_ERROR_CODE",
    "retryable": false,
    "retryAfterMs": 1000
  }
}
```

HTTP response envelopes (`{ statusCode, message, data }`) are strictly reserved for REST APIs and are **never** used for Socket.IO ACKs.

---

## 4. Client-to-Server Events

| Event | Input Payload | Success ACK Data | Description & Validation |
|-------|---------------|------------------|--------------------------|
| `conversation.join` | `{ conversationId: UUID }` | `{ conversation: ChatConversation, highWaterSequence: string }` | Validates user membership (READ permission) and joins `conversation:{conversationId}` room. |
| `conversation.leave` | `{ conversationId: UUID }` | `{ conversationId: UUID }` | Leaves `conversation:{conversationId}` room, stops active typing indicator. Idempotent. |
| `message.send` | `MessageSendInput` (see below) | `{ message: ChatMessage, duplicate: boolean }` | Sends a new message transactionally. Allocates monotonic sequence and stores outbox. |
| `message.read` | `{ conversationId: UUID, lastReadSequence: string }` | `ChatReadState` | Advances authenticated user's monotonic read cursor. Broadcasts `message.read.updated` if sequence actually advanced. |
| `typing.start` | `{ conversationId: UUID }` | `{ conversationId: UUID }` | Announces user started typing. Requires SEND permission. Rate limited to 1/s per socket. |
| `typing.stop` | `{ conversationId: UUID }` | `{ conversationId: UUID }` | Announces user stopped typing. |

### MessageSendInput Schema

```typescript
interface MessageSendInput {
  conversationId: string; // UUID
  clientMessageId: string; // UUID (generated once by client per outgoing message)
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO';
  content?: string; // Required for TEXT (max 4000 UTF-16 code units); optional caption for media
  replyToId?: string; // UUID of message in the same conversation being replied to
  attachments?: Array<{
    storageKey: string; // Cloudinary publicId, 1-512 chars from [A-Za-z0-9_/-]
  }>;
}
```

#### Rules by Message Type:
- **`TEXT`:** `content` is required (non-blank, ≤ 4000 code units). `attachments` must be omitted or empty.
- **`IMAGE`:** 1 to 4 image attachments. `content` is optional (caption).
- **`VIDEO`:** Exactly 1 video attachment. `content` is optional (caption).
- **Contact Info Guard:** Deterministic scanning blocks phone numbers, emails, social handles (Zalo, Telegram, WhatsApp), and payment bypass keywords (`CONTACT_INFORMATION_BLOCKED`).

### Idempotency & Deduping (`clientMessageId`)

- `clientMessageId` is scoped to `(senderId, clientMessageId)` across all conversations.
- Re-sending with identical payload returns the already-committed `message` and `duplicate: true`.
- Re-sending with different payload using the same `clientMessageId` fails with `IDEMPOTENCY_CONFLICT`.

---

## 5. Server-to-Client Events

| Event | Payload Schema | Target Audience | Description |
|-------|----------------|-----------------|-------------|
| `message.new` | `ChatMessage` | Both participants' sockets in `user:{userId}` | Broadcast after message commit. Delivers new incoming/outgoing message. |
| `message.read.updated` | `ChatReadState` | Both participants' sockets in `user:{userId}` | Emitted when a participant advances their read sequence. |
| `typing.update` | `TypingUpdate` | Devices in `conversation:{id}` except sender | Volatile broadcast indicating typing status of the other participant. |

### TypingUpdate Schema

```typescript
interface TypingUpdate {
  conversationId: string;
  userId: string;
  isTyping: boolean;
  expiresAt: string; // ISO 8601 UTC timestamp
}
```

Typing state is ephemeral memory (not persisted in DB). Server expires typing activity after 5 seconds of inactivity.

---

## 6. Rate Limits

| Scope | Key | Limit | Window |
|-------|-----|-------|--------|
| Connections | per `userId` | 10 concurrent | Instantaneous |
| Sends (burst) | `send-short:{userId}` | 20 messages | 10 seconds |
| Sends (sustained) | `send-long:{userId}` | 60 messages | 60 seconds |
| Typing Start | `typing:{socketId}:{convId}` | 1 start | 1 second |
| Typing Events | `typing-user:{userId}` | 120 events | 60 seconds |
| General Events | `events:{userId}` | 120 events | 60 seconds |

---

## 7. Reconnection & Catch-Up Workflow

1. Client connects via Socket.IO with valid JWT.
2. Server admits client and joins `user:{userId}`.
3. Client issues `conversation.join` to receive `highWaterSequence`.
4. If client was offline and missed messages, it issues `GET /api/v1/conversations/:id/messages?afterSequence=<lastSeenSequence>` via REST history to fetch contiguous missing messages up to `highWaterSequence`.
5. Duplicates between Socket.IO broadcast and REST history are deduplicated using message `id` and `sequence`.
