# Database design

Phase 1 implements schema and invariants; it does not provide a running Message Service. Source: [Prisma schema](../../backend/foundations/message-service/prisma/schema.prisma), [initial migration](../../backend/foundations/message-service/prisma/migrations/20261106000000_initial_message/migration.sql), [disposable verification](../../backend/scripts/test-message-database.mjs).

## Ownership and isolation

Existing `.env.example` explicitly shares a PostgreSQL endpoint with service schemas; Bidding/Order Prisma models use `@@schema` and isolated migration directories. Message follows that topology with **schema `message`**, not a new database infrastructure dependency. It can also use a separate PostgreSQL database with the same schema. There are no foreign keys into Auth, Bidding, Order, or provider storage.

Message Prisma config requires an explicit `DIRECT_URL_MESSAGE` or `DATABASE_URL_MESSAGE`, does not load `.env`, and does not silently use the shared URL. The existing migration URL helper forces schema selection and rejects transaction pooler migrations. The dedicated migration directory and URL `schema=message` keep `_prisma_migrations` in `message`; the disposable test verifies this. SQL explicitly sets `search_path=message`, and trigger functions use a fixed `pg_catalog,message` search path. Functions use invoker rights (no security-definer elevation).

Production provisioning remains an operator decision, with no production action in Phase 1. A provisioning role creates/owns schema `message`; a migration role can own its objects but must not own the whole shared database. Runtime should receive only schema `USAGE` plus the required table rights. Do not give Message another service's owner credentials or memberships. PostgreSQL `PUBLIC` database/schema grants must be audited by the operator; revoking them in a shared production database is outside this phase.

Example provisioning outline for an operator to review, **not executed against production**:

```sql
-- Run in the chosen database as its provisioning administrator.
CREATE ROLE message_migrator LOGIN; -- provision password outside source control
CREATE ROLE message_runtime LOGIN;
CREATE SCHEMA message AUTHORIZATION message_migrator;
GRANT USAGE ON SCHEMA message TO message_runtime;
-- After migration; replace grants with exact per-table rights as handlers are implemented.
GRANT SELECT, INSERT, UPDATE ON message.conversations TO message_runtime;
GRANT SELECT, INSERT ON message.messages, message.message_attachments TO message_runtime;
GRANT SELECT, INSERT, UPDATE ON message.conversation_read_states TO message_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON message.outbox_events, message.consumed_events TO message_runtime;
-- No CREATE on schema, no cross-schema grants, no superuser/bypassrls/createdb.
```

Message runtime executes triggers with its own rights; sequence allocation needs `UPDATE` on conversations. Pair/counter guard triggers still constrain those writes. The database role is trusted service code, not end-user identity. REST/socket authorization must derive identity and ensure only the authenticated participant's read state is written. Database participant checks cannot distinguish one participant acting as the other when both use the same service DB role.

## Models and indexes

| Model                 | Identity and invariants                                                                                                                     | Query support                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Conversation          | UUID id; unique requestId/customerId/workerId; distinct immutable participants; nullable orderId may bind once; `OPEN`/`READ_ONLY` snapshot | customerId + lastMessageAt DESC + id DESC; equivalent worker index; orderId                                                  |
| Message               | UUID id; sender/clientMessageId UUID unique **across all conversations**; sequence bigint unique per conversation; immutable rows           | unique conversation/sequence supports keyset history; composite conversation/id supports reply integrity; reply lookup index |
| MessageAttachment     | UUID id; provider storageKey, type/MIME/bytes/order; unique message/position and message/storageKey                                         | message FK + unique indexes; no binary data or signed URLs                                                                   |
| ConversationReadState | PK conversation/user; bigint lastReadSequence >=0; at most two authorized participant rows                                                  | composite PK lookup                                                                                                          |
| OutboxEvent           | UUID event id; repository-style aggregate, eventVersion, JSON payload, retry/schedule/status                                                | status/nextRetryAt polling                                                                                                   |
| ConsumedEvent         | eventId varchar128 PK, eventType, consumedAt                                                                                                | durable consumer deduplication                                                                                               |

All timestamps use timestamptz(6). UUIDs use the repository's Prisma `uuid()` convention and PostgreSQL UUID columns (application-generated, so raw SQL callers supply ids). `customerId` is retained for authorization and participant listing without cross-service joins. No typing persistence, reactions, per-message receipts, partitions, or sharding.

Conversation listing specifies NULLS LAST for lastMessageAt and a stable fallback in the REST contract; avoid loading full histories. A conversation's status is a local lifecycle snapshot, not independent proof of committed bid eligibility.

## Sequence and idempotency transaction

A `BEFORE INSERT` message trigger locks its conversation row `FOR UPDATE`, checks sender membership and `OPEN`, allocates `last_sequence + 1`, overwrites supplied sequence/createdAt, and updates the listing timestamp. The row lock serializes concurrent writers for that conversation and remains held until commit. Unrelated conversations do not share that lock. A failed insert/transaction rolls the counter back. Tests send 20 concurrent unique messages and 8 concurrent retries; only one retry persists and the final counter remains contiguous.

Phase 2 transaction order:

1. Authenticate; verify current authoritative chat eligibility and media ownership outside a long-running transaction. Recheck current service/lifecycle policy before committing (see integration contract for limits of cross-service atomicity).
2. Begin transaction; lock conversation; look up `(senderId,clientMessageId)`; if found compare normalized immutable payload and return the original response or `IDEMPOTENCY_CONFLICT`.
3. Insert message, validated attachment metadata, and `message.created` outbox row in the **same transaction**. The trigger allocates the sequence. A unique violation rolls the entire attempt back; re-read the committed winner and apply the same comparison.
4. Commit; ACK includes durable row/decimal sequence. Broadcast after commit. Outbox retries cross-service publication.

Do **not** use `INSERT ... ON CONFLICT DO NOTHING` for message creation: PostgreSQL fires BEFORE INSERT triggers before conflict resolution, so that pattern can advance the counter even without inserting. Use lookup under the conversation lock and a normal INSERT, handling a unique error via rollback. A client retry's payload comparison and persisted ACK behavior are Phase 2 requirements, not SQL functionality supplied here. Serialization failures/deadlocks require bounded retry; never ACK a rolled-back attempt.

`sequence`, `lastSequence`, and `lastReadSequence` travel over JSON as canonical decimal strings. Do not convert bigint through JavaScript Number. History uses exclusive sequence bounds, not timestamps; REST resynchronization recovers missed broadcasts.

## SQL invariants beyond Prisma

The checked-in migration extends Prisma-generated DDL with:

- distinct customer/worker and immutable request/pair/id; order cannot be transferred once bound;
- server-only counter/timestamp mutation via nested sequence trigger;
- participant-only message insertion and read state rows;
- sender-scoped UUID client key uniqueness;
- positive message sequence, text content shape, no self reply;
- composite `(conversationId,replyToId)` FK to `(conversationId,id)` rejects cross-conversation and absent targets;
- attachment FK; nonblank provider keys (no HTTP URLs), allowlisted type/MIME, positive bounded bytes/dimensions/duration, positions 0..3;
- TEXT requires no attachments; IMAGE requires 1..4; VIDEO requires exactly one at position0, matching type. These are **deferred constraint triggers**: message and attachments must be inserted in one transaction, validated at commit;
- TEXT/optional media captions max4000 PostgreSQL characters (wire validator is stricter for supplementary Unicode because JavaScript counts UTF-16 code units); image 10MiB JPEG/PNG/WebP; video100MiB MP4/QuickTime/WebM;
- read state updates clamp to `GREATEST(old,new)` and reject negative/future cursors; immutable read identity;
- messages/attachments cannot UPDATE or DELETE. Conversation deletion is restricted by history/read FKs. No lifecycle transition deletes history.

Prisma does not represent CHECKs, deferred triggers or procedures. **Do not replace this migration with a bare generated diff or use db push as a substitute.** Future migrations must preserve these definitions. Storage-key syntax and bounds do **not** establish provider existence or ownership. Only Phase 2 trusted media verification may populate attachment metadata; the existing public upload API has no authoritative ownership ledger. Do not trust client MIME/bytes/URL assertions.

Read cursor bound is checked against the conversation counter in the current database snapshot; it never advances beyond persisted sequence. Input permits0 for an unread conversation. DB guard ensures monotonic row updates; per-user authorization remains mandatory in every endpoint/event.

## Safe verification

From `backend`, using installed dependencies and Docker:

```sh
node scripts/test-message-database.mjs
DATABASE_URL_MESSAGE=postgresql://test:test@127.0.0.1:1/disposable ./node_modules/.bin/prisma validate --config=foundations/message-service/prisma/prisma.config.ts
DATABASE_URL_MESSAGE=postgresql://test:test@127.0.0.1:1/disposable ./node_modules/.bin/prisma generate --config=foundations/message-service/prisma/prisma.config.ts
```

The test script ignores caller database URLs, generates a unique Docker name/password, binds an ephemeral loopback port, creates `handygo_message_disposable`, applies this migration with explicit local URLs, repeats `migrate deploy`, executes actual SQL invariants/concurrency assertions and removes only its owned container in `finally`. No real user database is targeted. `--red` uses a deliberately unconstrained fixture in that disposable database and must fail the duplicate-conversation assertion; it proves the test detects a missing invariant.

No production schema/user was created. Production shared-database grants, actual managed PostgreSQL engine/version, backup/retention policy and capacity are operator prerequisites. Disposable tests establish PostgreSQL17 behavior; they do not establish deployed VPS access control or runtime handler correctness.
