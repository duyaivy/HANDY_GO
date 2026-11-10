# Socket.IO v1 contracts

Phase 2 specification only; no gateway is started by this phase. Socket.IO **path** is `/api/v1/chat/socket.io/`, namespace is `/`, rooms are server-created `user:{userId}` and `conversation:{conversationId}`. Path, namespace and room are different concepts. Use HTTPS/WSS on the existing public domain. Do not add a chat subdomain. Phase 3 owns routing/sticky upgrade configuration.

Wire interfaces are `ClientToServerChatEvents`, `ServerToClientChatEvents` and `ChatAck<T>` in `backend/libs/common/src/message-contracts/types.ts`. Every client event must supply an ACK callback. ACK shapes are exactly `{ok:true,data:T}` or `{ok:false,error:{code:ChatErrorCode,message:string,retryable:boolean,retryAfterMs?:number}}`; HTTP envelopes are reserved for REST. Never use client-supplied sender/user/room IDs as identity.

Connect using `auth:{token:accessToken}` (no query-string credentials). Verify RS256, issuer, audience, exp, token type and marketplace `userId`; check active session/account with Auth integration. Connection error is `connect_error` with `data:{code:"UNAUTHORIZED",retryable:false}`. Reconnect with refreshed token after expiry. Timers disconnect at JWT expiry; per-event expiry/revocation checks prevent a still-connected socket continuing to write. Connected sockets are not permanent authorization grants.

## Events

| Client → server      | Payload                             | Success ACK data                                    | Required check                                                         |
| -------------------- | ----------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| `conversation.join`  | `{conversationId}`                  | `{conversation:ChatConversation,highWaterSequence}` | current active identity + READ; room entry grants no further authority |
| `conversation.leave` | `{conversationId}`                  | `{conversationId}`                                  | identity + READ before reporting membership; idempotent                |
| `message.send`       | `MessageSendInput` below            | `{message:ChatMessage,duplicate:boolean}`           | current authoritative SEND, ownership and reply checks                 |
| `message.read`       | `{conversationId,lastReadSequence}` | `ChatReadState`                                     | READ; update only authenticated user's monotonic cursor                |
| `typing.start`       | `{conversationId}`                  | `{conversationId}`                                  | current SEND                                                           |
| `typing.stop`        | `{conversationId}`                  | `{conversationId}`                                  | current SEND (permission loss triggers server stop regardless)         |

| Server → client        | Payload                                      | Delivery                                                           |
| ---------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `message.new`          | `ChatMessage`                                | authorized participants' devices after commit; duplicates possible |
| `message.read.updated` | `ChatReadState`                              | authorized participants' devices after actual committed advance    |
| `typing.update`        | `{conversationId,userId,isTyping,expiresAt}` | conversation room, without draft text                              |

No server accepts a client `message.new`, `message.read.updated`, `typing.update`, or arbitrary room event. Unknown event/payload fields are rejected before handler work. Shared validators name operations exactly as above; REST uses `conversation.create`, `conversations.list`, `messages.list`. READ joins remain allowed for eligible historical members of a closed conversation; SEND and typing do not.

## Sending and replies

`MessageSendInput = {conversationId,clientMessageId:UUID,messageType:TEXT|IMAGE|VIDEO,content?:string,replyToId?:UUID,attachments?:[{storageKey:string}]}`. TEXT requires nonblank content of at most 4000 UTF-16 code units and no attachments; IMAGE permits 1–4 images and optional nonblank caption; VIDEO permits one video and optional caption. All attachments must match the message type. Omit unused fields; null is not accepted. `storageKey` is the existing Cloudinary `publicId`, 1–512 characters from `[A-Za-z0-9_/-]`. Do not send URLs, MIME/size metadata, binaries, sender IDs or eligibility flags. Duplicate asset keys in one message are invalid. Metadata comes from trusted provider lookup/ownership integration, never mobile assertions.

Server establishes sender ID, validates content, retrieves independently verified media metadata and reply target in the same conversation, checks fresh authority and persists message/attachments/outbox transactionally. SQL assigns bigint sequence while locking the conversation row. ACK success is issued **after commit**, not when the handler receives input. A database failure must produce an error ACK with no successful broadcast. Actual send/persistence/integration handlers are Phase 2 work.

`clientMessageId` is UUID generated once for each logical outgoing message; the unique scope is `(senderId,clientMessageId)` across all conversations. After permission checks, an exact canonical replay returns the original persisted message and `duplicate:true`, without allocating a new committed sequence/outbox event. A different conversation, type, content, reply target or ordered attachments with the same key gives IDEMPOTENCY_CONFLICT. Canonical payload keeps content exactly as validated (no silent trimming), omits absent optional fields, treats empty attachments like omitted for TEXT, and preserves attachment order. No content hash is required in schema: compare persisted fields after reading the unique winner. Concurrent unique violations require transaction rollback, winner lookup and canonical comparison. A newly allocated transaction may roll back; clients see no successful sequence until commit.

Broadcast can arrive before or after sender ACK. Include the sending device and all other authorized devices of both participants; use Socket.IO room-union delivery to avoid duplicate emission to a socket in both user and conversation rooms. Keep user-room events limited to conversations authorized for that user and re-check account state before sending. Mobile reconciles optimistic entry by `clientMessageId`, then deduplicates by message ID/sequence. Duplicate retry does not require a new broadcast. Lost ACK/broadcast is recovered with same-key retry and REST history. Socket.IO is not a durable exactly-once transport.

Reply target must exist and share conversation; return the same REPLY_NOT_FOUND for absent or inaccessible target. Target is loaded transactionally and protected by composite foreign key. `reply` includes sender/type/160-code-point text preview or an unavailable placeholder; mobile does not fetch a second endpoint for every reply. No MVP delete endpoint exists. If a future retention/tombstone policy hides a target, preserve unavailable preview semantics and reply ID.

## Reconnect and permission changes

On connect, add the authenticated user's own room only. Client then GETs its list, joins an authorized conversation and fetches history after its last **contiguous** sequence to high water. Persist sequence after processing, tolerate duplicates and gaps, and request missing history. Do not assume socket recovery means every event was delivered. A history request and join can overlap safely through deduplication. Read state is fetched with conversation detail. Server removes rooms/typing on account or membership invalidation and refuses each subsequent event based on current authority even before room removal. Closed business state does not delete historical access.

## Typing, limits and multi-device behavior

Typing is process-local ephemeral memory keyed by conversation/user/socket. No PostgreSQL, outbox, RabbitMQ or Redis requirement. Client starts on typing, refreshes every 2.5 seconds, stops after approximately 1.5 seconds idle, and never sends draft text. Server expires each socket's activity after 5 seconds. Aggregate `isTyping:true` while any authorized device is active; emit false only when the last device stops/expires/disconnects or permission is revoked. `expiresAt` is server time, latest active expiry, false events use now. A READ_ONLY conversation cannot start typing. Evict all entries on disconnect. Clients also expire display locally at expiresAt so process restart does not leave stale indicators.

Initial configurable limits: Socket.IO `maxHttpBufferSize=16384` bytes; per-send validated serialized UTF-8 JSON ≤16 KiB; at most 4 attachments; no binary frames. Reject unsupported binary payloads. Per user: 20 sends/10 seconds, 60 sends/minute, 10 concurrent sockets; joins/reads 120/minute, typing starts at most 1/second per conversation/socket. REST list/history 120/minute/user, create 20/minute/user. Over-limit ACK uses RATE_LIMITED, retryable true and retryAfterMs. Client must debounce; server always enforces. Local counters suffice for one instance; scaling requires shared counters and adapter coordination.

Single instance may use local rooms and typing. Before horizontal scaling add Redis Socket.IO adapter (ephemeral fanout only), shared rate/typing coordination, suitable load-balancer WebSocket/sticky polling behavior and durable outbox/recovery tests. PostgreSQL remains message source of truth. Dependency calls are bounded async I/O; no blocking moderation/provider work inside event loop.
