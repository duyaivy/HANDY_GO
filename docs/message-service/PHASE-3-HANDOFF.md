# Phase 3 infrastructure handoff

This is a deployment design handoff, not authorization to deploy. Phase 2 leaves production routing, orchestration, service registration and secrets unchanged. Final Phase 2 verification and remaining gates are recorded in [PHASE-2-VERIFICATION.md](PHASE-2-VERIFICATION.md).

## Existing deployment constraints

The current deployment is a coordinated three-host transaction, not independent `compose up` operations. Sources: `backend/deploy/production/orchestrate.py`, `host.py`, `recovery.py`, `database_plan.py`, `services.json`, `compose.production.yml`, and `.github/workflows/backend-production*.yml`. `ROLES` is currently `('vps3','vps2','vps1')`. Production uses digest-pinned application/migration images, one shared environment snapshot and hash, per-host ownership journals, previous-release manifests and migration hashes. A release is stable only after internal and public probes and coordinated commit. Cleanup can still leave `unlock_pending` after a successful commit.

Message stays under `backend/foundations/message-service` during Phase 2. The production database inventory scans `backend/apps/*/prisma`; moving the schema or registering Message must be a deliberate coordinated Phase 3 change. Preserve the original migrations and checksums, generated-client output and Message config/script paths. Do not regenerate the Phase 1 migration: its deferred attachment constraints and sequence/immutability triggers are not fully represented by Prisma.

## Four-host transaction upgrade

Before provisioning a release, extend every participant list to include VPS4: SSH setup/cleanup and host identity, workflow hosts/keys, registry/service budgets, Compose selection, manifests, migration ownership/hash calculation, shared environment distribution, endpoint callers, public/internal verification, rollback, ENV refresh, and recovery. Add tests for four-host snapshot, partial apply, partial commit, unavailable VPS4, first-deploy rollback and recovery; also test old three-host bundles and compatibility when adding/removing a participant. Never treat an absent prior VPS4 release as a successful restore.

Choose and document the four-host rollout and restore order from actual dependencies. The existing tuple controls deployment and `reversed(ROLES)` controls recovery; do not rely on prose describing an order that disagrees with source. All participants must complete preflight before the first apply. Include VPS4 in the single `backend-production` concurrency boundary. A separate Message deployment workflow must not bypass the cluster journal.

For each host validate SSH identity, trusted host key, `/opt/handygo/host.json`, Docker/Compose/Python versions, disk and immutable bundle checksums, registry access, memory/swap reserve, DNS/TLS, WireGuard paths and dependency reachability from containers. Establish backups/PITR and migration compatibility before enabling `run_migrations`. Retain current and at least two previous stable digest/bundle/environment snapshots.

## VPS4 networking and routing

Proposed WireGuard address: `10.77.0.4/32`, subject to operator address-conflict review. Add explicit peers/AllowedIPs to every host that needs VPS4; verify host and container paths both directions. Keep application ports private, bound to WireGuard or internal container networks; allow only required peer sources. Review provider firewall, Docker forwarding/DOCKER-USER and IPv6, not just UFW. Only VPS1 terminates public TLS.

Nginx on VPS1 must route `/api/v1/conversations` and subpaths to Message while preserving the original URI. Route `/api/v1/chat/socket.io/` to the same instance with HTTP/1.1 Upgrade/Connection forwarding and adequate read/send timeouts for ping intervals. Preserve `/` namespace and trailing transport path. Test WebSocket upgrade and any enabled polling transport, CORS origin validation and the 16 KiB socket payload bound. A single instance needs no Redis adapter. Do not expose `/internal`, database ports, broker management, or signed-media resolver endpoints publicly. Keep public origin `https://handygo.duyaivy.id.vn`.

Auth and Gateway internal private-media endpoints become cross-host dependencies from VPS4. Their current Docker DNS addresses are only valid on VPS1. Phase 3 must register Message as a caller, publish only necessary WireGuard ports and supply reachable origins; Docker DNS names on VPS1 cannot be used unchanged on VPS4. Bidding and Order endpoints on VPS2 must accept VPS4 as an authenticated private caller. User Trust authorization checks and RPC broker reachability must remain available. WireGuard does not replace service-secret/JWT checks.

## Image, Compose and database

Include the staged Message source, its standalone build output, generated `@prisma/message-client`, Prisma runtime/pg adapter and Socket.IO runtime dependencies in the reviewed Docker build. Existing production images enumerate registered Nest apps; a passing local standalone build alone does not prove the production Docker image contains Message. Provide a migration image with the exact Message config and both original/additive SQL histories. Pin digests and architecture consistently with the existing amd64 fleet.

Add an explicit Message Compose service on VPS4 with resource limits measured under socket/reconnect/media/history/outbox load; do not invent a RAM guarantee. Configure signal/graceful-stop budget, health check, restart policy, read-only mounts and logging rotation. No cross-host `depends_on`. Health must distinguish process liveness from PostgreSQL/authority/broker readiness. Message persistence can ACK while RabbitMQ is unavailable only if its transactional outbox is healthy; alert on growing outbox age.

Provision schema `message` and dedicated migrator/runtime privileges on the chosen PostgreSQL endpoint. No cross-schema table reads, FKs, ownership or broad role membership. Migrate with explicit `DIRECT_URL_MESSAGE` (preferred session/DDL endpoint) or `DATABASE_URL_MESSAGE` and schema `message`; never a transaction pooler for Prisma migrations. Register Message migration ownership, DDL-verification flag, pool budget, probes and migration-hash inputs. Snapshot/PITR first; apply reviewed backward-compatible migrations before traffic. Verify repeated deploy is a no-op, `_prisma_migrations` remains isolated and runtime cannot create objects/read other schemas.

## Secrets and operational configuration

Use only secret names in this handoff; provision actual values outside source control. Carry Message database runtime/direct URLs, JWT public key/issuer/audience, internal service credential, cursor HMAC key, allowed origins, service port, authority/media service origins, RabbitMQ connection/topology, connection pool budget and completion-window settings into the existing shared environment snapshot. Carry private Cloudinary configuration and owner-binding secret into Gateway. Exact implemented names and local startup commands are listed in the Phase 2 implementation report and development examples; cross-check them with source before promotion. No generic variable name is evidence that source consumes it.

RabbitMQ must use confirmed durable publication, stable `message.created` IDs, Message lifecycle queue/bindings, Notification binding, retry queues/DLQ and bounded prefetch. Preserve event IDs during replay. Broker credentials/TLS/vhost permissions should scope consumers/publishers appropriately. Validate Notification preferences, generic chat push content, deduplication and authenticated app navigation. Never include message text or media URLs in push/log diagnostics.

## Pending transaction recovery and rollback

Never delete `pending.json` or apply a TTL to bypass a stuck release. Inspect the original run ID/attempt, exact transaction and target, previous stable manifests, migration metadata, `touched` and phase on **all four hosts**. Automatic preflight may finish only verified untouched `SNAPSHOT/touched=false` transactions. Any touched apply, restored or partial-commit state requires the existing manual recovery workflow and exact identity approval.

Extend `.github/workflows/backend-production-recovery.yml` and its source-provenance validation, SSH identities and `recovery.py` to VPS4 before rollout. `inspect` must remain read-only; `recover` requires `RECOVER_PRODUCTION`; `abort-untouched` remains explicitly approved and must never certify a degraded previous release. Unavailable hosts, divergent transaction owners or migration incompatibility keep journals protected and require intervention. Successful cleanup requires durable cluster reinspection and matching stable state.

Rollback restores previous digest-pinned images and environment snapshots, verifies every host and public business smoke, then authorizes journal finish. It never undoes database migrations, purges queues, deletes volumes or destroys history. Different migration hashes require compatibility review/manual recovery; no automatic down migration. First deploy with no previous release stops target containers and records intervention rather than claiming recovery. Preserve Message PostgreSQL history/outbox and private provider media while rolling application versions back. Replay supported events idempotently after restoration.

## Production smoke and monitoring gates

Before public enablement verify pre-bid denial; committed-bid customer/worker chat; two-worker isolation and selected continuity; text/reply/image/video with real private provider ownership and expiring URLs; typing expiry across devices; read monotonicity; lost ACK same-key retry; reconnect paginated gap repair; withdrawn/canceled/completed denial; expired/revoked JWT; broker outage/outbox recovery and duplicate Notification delivery. Run through actual Nginx/WireGuard and on a device, including background FCM/deep link handling. Do not infer those results from local authority doubles.

Monitor active socket count, auth rejects/revocations, dependency latency/timeouts, PostgreSQL pool wait/locks/query latency, message ACK p95, sequence/idempotency conflicts, reconnect/resync failures, typing rate, outbox oldest age/retries/DLQ and Notification failures. Also monitor host OOM/restarts/disk, TLS expiry and WireGuard health. Retain ID-only correlation and redact tokens, drafts, bodies, upload signatures and private URLs. Establish backup restore drills, media retention/reporting/support access policy and an operator-owned incident runbook before broad release.
