# REST API contracts (v1)

These are Phase 2 implementation contracts, not live routes. Machine-readable API: [openapi.json](openapi.json). Portable wire types and validation: `backend/libs/common/src/message-contracts/`. Keep these artifacts together when changing v1. Base URL stays `https://handygo.duyaivy.id.vn`. No new chat subdomain. Phase 3 will route these paths.

All operations require a valid access JWT, active account/session, and server-derived marketplace `userId` (not account `sub`). REST through the existing Gateway must preserve its authenticated identity and trusted internal authentication conventions. Direct internal calls never trust a caller's `x-user-id` without checking the service credential. Every operation checks conversation membership independently of room membership. Unrelated or unknown conversation IDs return indistinguishable 404. Suspended/revoked identity returns 401.

Responses reuse the existing common envelope exactly: `{statusCode:number,message:string,data:T,code?:string}`. Success omits `code`; error has `data:null` and stable `code`. Dates are UTC ISO 8601 strings. UUIDs follow repository UUID identity. PostgreSQL bigint sequences are canonical decimal **strings**, including `"0"`, never JSON numbers. All object input properties are allowlisted; reject extra fields, null where omitted optional fields are expected, invalid UUIDs and unbounded cursors.

## Operations

| Method/path                               | Request                                                                           | Success data/status                        | Permission                                |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| `POST /api/v1/conversations`              | `ConversationCreateInput = {bidId:UUID}`                                          | `ChatConversation`, 201 new / 200 existing | CREATE after current authoritative checks |
| `GET /api/v1/conversations`               | `limit?:1..100` (default 30), `cursor?:opaque`                                    | `ChatPage<ChatConversation>`, 200          | authenticated user's own conversations    |
| `GET /api/v1/conversations/{id}`          | path UUID                                                                         | `ChatConversation`, 200                    | READ                                      |
| `GET /api/v1/conversations/{id}/messages` | `limit?:1..100` (default 30), `beforeSequence?:decimal`, `afterSequence?:decimal` | `MessageHistoryPage`, 200                  | READ                                      |
| `PATCH /api/v1/conversations/{id}/read`   | `{lastReadSequence:decimal}`                                                      | `ChatReadState`, 200                       | READ, own user only                       |

REST sends are intentionally absent: `message.send` uses Socket.IO. `/api/v1/messages/...` is reserved; Phase 1 does not invent an unused endpoint.

Creation resolves the bid, request, owner, worker and selected order from authenticated internal authorities. The caller must be that customer or worker, the bid must have been persisted validly, and sending must currently be allowed. The client cannot choose request/customer/worker IDs. The unique request/customer/worker tuple gives atomic create-or-get idempotency; handle its unique violation by reading the winner. Return the same conversation ID through conversion to an order. Closed existing conversations remain discoverable by GET; POST must not reopen them. The current Bidding implementation does not permit resubmitting a withdrawn bid; this phase introduces no such capability. No transfer to a different worker is allowed. Recommendation-based orders without a previously valid bid are ineligible under the approved requirement.

`ChatConversation` fields: `id,requestId,orderId:null|UUID,customerId,workerId,status:OPEN|READ_ONLY,lastSequence,lastMessageAt:null|timestamp,createdAt,updatedAt,permissions:{read,send,reason:null|string},readStates:ChatReadState[]`. Status is a local presentation snapshot; current `permissions.send` is authority-derived. `ChatReadState` fields: `conversationId,userId,lastReadSequence,updatedAt`. No arbitrary participants or message previews from another worker are returned. `readStates` has at most the two participants; absent means zero/unread. A newly created conversation has `lastSequence:"0"`, `lastMessageAt:null`, and no messages.

`ChatMessage` fields: `id,conversationId,senderId,clientMessageId,sequence,messageType,content:null|string,replyToId:null|UUID,reply:null|ReplyPreview,attachments:ChatAttachment[],createdAt`. `ReplyPreview` is `{id,senderId:null|UUID,messageType:null|TEXT|IMAGE|VIDEO,content:null|string,unavailable:boolean}`; content is at most the first 160 Unicode code points of the original. Media replies show type without exposing URLs in the preview. A future unavailable target keeps `id`, sets other preview fields null and `unavailable:true`. No deletion endpoint exists in MVP; SQL hard deletes are restricted.

`ChatAttachment` fields: `id,storageKey,mediaType:IMAGE|VIDEO,mimeType,sizeBytes,position,width:null|integer,height:null|integer,durationMs:null|integer,url,urlExpiresAt`. Bounded bytes fit safely in a JS number (10 MiB image, 100 MiB video). URL generation occurs only after conversation READ authorization; URLs are short-lived and private as specified in SECURITY-DESIGN. Current public uploads are not sufficient for chat privacy.

## Pagination

Conversation lists use keyset order `COALESCE(lastMessageAt,createdAt) DESC,id DESC`, with indexes supporting participant selection. Cursor is base64url, maximum 2048 characters; server HMAC authenticates `{v:1,userId,sortTimestamp,id}` and binds it to authenticated identity. Bad format, wrong user, invalid MAC or unsupported version gives 400. Do not trust decoded SQL fragments. Bind typed values only. New messages can move an existing conversation above a page boundary: pagination is a live list, not a historical snapshot. Mobile deduplicates by conversation ID and refreshes the first page on reconnect/new activity; no repeatable whole-list snapshot is promised. Empty list: `{items:[],nextCursor:null}`.

History is ordered by server `sequence`, never client time. Default/before mode selects `< beforeSequence` (default latest), descending limit+1 then returns items ascending for rendering; `nextBeforeSequence` is the oldest returned sequence only when more older rows exist. After mode selects `> afterSequence` ascending, limit+1; `nextAfterSequence` is highest returned sequence only when more rows exist. The other continuation is null. Reject both directions together. Zero is a valid starting after cursor. Unknown future before cursors simply return the last page; future after cursors return empty. Each response has `highWaterSequence` read in the same database snapshot as its page. On reconnect a client captures a high water, fetches after its last contiguous sequence and continues until reaching it; newer results may also be consumed. Dedupe socket/history overlap by message ID and sequence. Bound each page to 100; never load the full history.

Example: `{items:[],nextBeforeSequence:null,nextAfterSequence:null,highWaterSequence:"0"}` is a valid empty conversation.

Read updates reject a sequence above the conversation high water or referring to no persisted message (except zero). Atomically apply `max(previous,incoming)`. A delayed device cannot move the cursor backwards. Derive user ID from JWT. Return persisted current state even for a stale update; broadcast only an actual advancement. One participant cannot update another's state. The shared `advanceReadSequence` helper specifies canonical/bounded/monotonic arithmetic; runtime still verifies message existence and membership.

## Errors

| HTTP | Stable code                 | Meaning / client behavior                                             |
| ---- | --------------------------- | --------------------------------------------------------------------- |
| 400  | VALIDATION_ERROR            | malformed input/cursor/read sequence; fix input                       |
| 401  | UNAUTHORIZED                | invalid/expired/revoked JWT or inactive identity; reauthenticate      |
| 403  | CHAT_INELIGIBLE             | no committed valid bid or creation no longer allowed                  |
| 404  | CONVERSATION_NOT_FOUND      | absent conversation or nonparticipant; do not enumerate               |
| 409  | CHAT_READ_ONLY              | participant can read but cannot send/create in this lifecycle         |
| 409  | IDEMPOTENCY_CONFLICT        | reused sender/clientMessageId with different canonical payload        |
| 400  | REPLY_NOT_FOUND             | absent/cross-conversation target, no cross-conversation disclosure    |
| 422  | MEDIA_UNVERIFIED            | asset ownership/completion/privacy/metadata cannot be established     |
| 422  | CONTACT_INFORMATION_BLOCKED | deterministic contact validation failed; generic explanation          |
| 413  | PAYLOAD_TOO_LARGE           | transport/serialized payload limit exceeded                           |
| 429  | RATE_LIMITED                | retry after response `Retry-After` seconds                            |
| 503  | ELIGIBILITY_UNAVAILABLE     | authority timeout/inconsistent snapshot; deny new writes, retry later |
| 500  | INTERNAL_ERROR              | generic failure without SQL/credentials/message contents              |

Socket-only send errors are listed here to keep one error vocabulary; OpenAPI lists applicable route errors. Example error: `{statusCode:404,message:"Conversation not found",data:null,code:"CONVERSATION_NOT_FOUND"}`. Do not expose participant IDs or dependency responses in error details.
