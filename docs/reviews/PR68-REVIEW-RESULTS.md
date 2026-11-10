# HANDY_GO PR #68 review results

Reviewed 2026-11-10 against local `feature/HG-69-message_service` at
`b883e5b48aaf6369adcb90de1755d695d007e863`, plus the remediation changes delivered
with this report. Source checklist: [PR attachment](https://github.com/user-attachments/files/34633411/HANDY_GO_PR68_review_checklist.md).
This is code review and local regression evidence, not a production penetration test.

## Findings checklist

| Checklist item | Result | Evidence / disposition |
| --- | --- | --- |
| 1.1 Typing rate limits | Fixed | `realtime.ts`: start and stop limited by user (120/min), socket (40/10sec), and socket/conversation (4/sec); existing start limit 1/sec retained. Budgets run before authentication, DB, and authority calls. Live Socket.IO tests exercise bursts, rotating conversations, multiple sockets, all other supported events, and immediate start/stop. |
| 1.2 Concurrent socket limit | Fixed for the supported single process | Authenticated handshakes synchronously reserve a slot before `next()`. Pending + connected sockets cannot exceed ten/user. Transport close/disconnect release reservations. Tests cover twenty parallel admissions, capacity recovery, abort, later middleware rejection, and admission timeout. |
| 1.3 Monotonic read cursor | Already protected; stronger regression coverage added | Initial migration's `message.guard_read_state()` already uses `GREATEST(OLD.last_read_sequence, NEW.last_read_sequence)` on update; `read()` also locks the parent before reading/upserting. An initial mock-only reproduction omitted that trigger and was discarded. Real PostgreSQL verifies reversed updates, concurrent first inserts/updates through two service objects, participant isolation, invalid/future cursors and persisted maximum ACKs. No service or migration change was needed. |
| 2.1 Upload buffering/type checks | Fixed | New `ImageUploadInterceptor` uses the existing configured image cap in Multer, one file, one form field and bounded parts/field bytes. MIME rejection happens during intake; Cloudinary service checks matching JPEG/PNG/WebP signatures before upload. Tests cover oversize, multiple files, unsupported/spoofed types, short headers, valid signatures, interrupted request and both `intent=chat` field orders. Memory storage creates no temporary files. Full image decoding remains provider-owned. |
| 2.2 Process-local rate limits | Deployment constraint documented | Current Compose deploys one Message Service on VPS4; Nginx targets that host. Retained bounded/expiring in-memory limiter. No Redis added. Per-user budgets, socket caps and realtime fan-out are **not cluster-wide**. Scaling beyond one process requires shared admission/rate limits and a Socket.IO adapter, plus multi-instance tests. Restart resets budgets. |
| 2.3 Session revocation cache | Reduced and bounded; residual delay documented | Active-session cache reduced from 60 to five seconds, measured from verification start. Expiry/revocation/slow response and repeated Auth failure tested. JWT expiry, account/user/session binding, active account and user status remain checked. Permission proofs now expire no later than bid `validUntil`; reproduced expiry bug has regression coverage. No claim of instantaneous revocation. |
| 3.1 Outbox/RabbitMQ | Existing reliability mechanisms verified locally | Message and event commit atomically. Pending rows survive unavailable publication, retries retain identity and use bounded backoff; confirms and mandatory returns precede published status. New failure-injection tests cover publication failure/replacement worker, confirm followed by DB-mark failure/replay, and unroutable confirm. Real RabbitMQ + PostgreSQL tests verify stopped-publisher durability, recipient-only generic notifications, duplicate event delivery and replay under a different event ID. Lifecycle inbox claims/effects are transactional and tested concurrently. Full broker/node crash and quorum failover still require staging validation. |
| 3.2 Reconnect/synchronization | Existing behavior verified; multi-instance scenario deferred | Mobile reconnect authenticates from current token; history catches up via `afterSequence`, merges by message identity and tracks contiguous sequence. Tests cover gaps/duplicate events/reconnect; REST/Socket.IO tests run against real PostgreSQL. Different-instance reconnect is outside the current single-process deployment contract. |
| 3.3 Private media | Local authorization checks verified; provider checks open | History and URL refresh require membership. Internal verification is secret-authenticated, checks provider authenticated delivery, storage key, signed owner proof, actual bytes/format and expiry. Tests reject wrong owner/type/proof/cap. Mobile images use `cachePolicy="none"`; chat query state/socket is cleared on logout/account switch. Actual Cloudinary public-access denial, signed-download expiry and device cache behavior require production/staging checks below. |
| 3.4 Migrations/rollback | Local database checks passed; production validation open | Two migrations apply to a new disposable PostgreSQL and safely repeat. Constraint/trigger tests and Prisma structural diff pass. No migration edits. Existing rollback restores application/config digests without dropping history or reversing schema. Populated staging migration timing, lock duration, backup and restore remain required. |
| 3.5 VPS/WireGuard/Docker | Repository configuration/build verified; hosts unverified | Compose binds Message Service port 3009 to `${PRIVATE_IP}` on VPS4. Non-root/read-only containers, CPU/memory/PID caps, restart policy, health checks and log rotation are configured. Nginx strips identity/internal headers; Docker context excludes local credentials. All four profiles and production config validator pass; runtime image builds. Actual host firewall, Docker forwarding, tunnel peers/keys and operational limits are not established by repository files. |
| 3.6 Notification privacy | Already implemented; local tests pass | Server derives recipient from persisted customer/worker pair; events omit message content and media URLs. Notification inbox and per-message/recipient dedupe prevent duplicate notifications. Push worker rechecks token owner before delivery. Tests cover forged producer, self-recipient, duplicate identity and token-owner mismatch. RabbitMQ producer labels rely on trusted broker credentials/ACLs, which need production validation. |
| 3.7 Mobile lifecycle | Existing behavior verified locally | Logout closes socket and clears chat queries; account switch tears down old subscriptions; foreground reconnect synchronizes; unauthorized refresh uses backoff and generation checks; expiring media refresh uses authenticated history. Full mobile suite passes. Real airplane-mode/background/refresh/logout and media viewing need device validation. |

The three existing inline PR comments (lifecycle invalidation, render-time chat
creation, and a failed attachment breaking history) were already addressed in
local commit `b883e5b4`; their backend/mobile regression tests pass. They were not
reimplemented here.

## Test results

| Check | Result |
| --- | --- |
| Full backend `vitest run` | 201 files passed; **1,622 tests passed**, 141 skipped across 13 files. Environment-gated suites are not counted as verified by this run. |
| Disposable PostgreSQL runtime / REST / Socket.IO | **13 tests passed**. |
| Disposable PostgreSQL lifecycle/concurrency | **5 tests passed**, including expanded read-state test. |
| Database migrations/constraints/trigger checks | **27 checks passed**, repeated migrate deploy and empty Prisma structural diff. |
| Real RabbitMQ → Notification PostgreSQL | **2 integration tests passed**. |
| Full mobile Jest (`--runInBand --forceExit`, following package convention) | **89 suites, 659 tests passed**. Jest reports forced exit; this does not establish absence of test-runner open handles. |
| Mobile `tsc --noEmit`, `eslint .` | Passed. |
| Backend `tsc --noEmit -p tsconfig.build.json` and `tsconfig.prisma.json` | Passed after regenerating stale local Order Prisma client; no Order source changes. |
| Backend Oxlint | Passed with 10 existing warnings in untouched code. |
| Message TypeScript build / gateway Nest build | Passed. |
| Production Docker runtime build | Passed locally as `handygo-pr68-review:local`; Message Service module also imports successfully inside that image with networking disabled. No registry push or deployment. |
| Production Python tests | 237 run, passed with 2 skipped. |
| Production Compose and config validators | All four profiles passed; static production contracts passed using pinned PyYAML in a temporary environment. |
| Independent code review | No concrete correctness/security findings; added explicit rejection/timeout and multipart field-order tests from reviewer feedback. |
| GitHub Actions | [PR CI run 42837077847](https://github.com/duyaivy/HANDY_GO/actions/runs/42837077847) succeeded for remote head `21cf603dffb0d57331977e3f7b07d264f899eaac`. Local base is one commit ahead of that head, and that run does not cover this patch: **final-head CI remains required**. |

Focused pre-fix tests reproduced the socket race (20 admitted versus ten), late
typing checks, unbounded multipart admission, MIME/signature mismatch acceptance,
session cache delay, and permission reuse after bid expiry. These pass with the
fixes. Read-state integrity was verified against the real trigger instead of
assuming the static finding was valid.

Environment notes: the host pnpm version-switch attempt failed to fetch registry
signature metadata, so local checks used the already-installed tool binaries;
the production Docker build used the repository's pinned pnpm and frozen lockfile.
One final-image build retry encountered a Docker Hub TLS timeout; a subsequent
retry completed. No package-manager signature checks were disabled. The two
pre-existing temporary Python environments lacked usable PyYAML, so the static
config validator used a fresh temporary environment with `pyyaml==6.0.3`.

## Required staging/production validation

- [ ] Run CI on the exact reviewed commit after these local changes are committed/pushed by the maintainer; retain artifact/image digests and verify required checks.
- [ ] Confirm exactly one Message Service process/replica, including rollout overlap. Before scaling, implement/test shared budgets, session admission and realtime fan-out; do not infer cluster limits from these tests.
- [ ] Measure Auth load/latency with the shorter five-second session cache; revoke immediately after cache fill, verify requests/delivery stop after expiry, and exercise Auth outage. Review and explicitly accept the bounded cache window. Already authorized in-flight operations and already-issued media URLs are separate from cache expiry.
- [ ] With two unrelated conversation pairs, try foreign history/refresh/storage keys/owner proofs. Verify private Cloudinary assets reject unsigned/public URLs; test signed-download access before/after the five-minute expiry, including intermediary caching. Expiring bearer URLs remain usable by their holder until expiry.
- [ ] Check Cloudinary image/video decoding and upload presets/account quotas. Direct video upload is provider-side: declared init size is not a provider intake cap; actual final bytes/type are rejected on chat attachment verification. Confirm provider restrictions/cost controls for oversized direct uploads.
- [ ] Test actual 10 MiB images and oversized multipart uploads through Nginx and Gateway under concurrent load and aborts. Keep the configured intake cap and 12 MiB edge ceiling aligned with business rules; measure the Gateway's 160 MiB memory limit. The middleware caps each file, not aggregate memory across simultaneous uploads.
- [ ] Stop/restart RabbitMQ and service nodes around database commit, broker confirmation and inbox transaction; verify pending recovery, bounded retries, DLQ replay, no duplicated effects, backlog age alerts and quorum/disk behavior. Restrict producer broker credentials and publishing ACLs; a producer string alone is not cryptographic authorization.
- [ ] Restore a production-like backup into staging, apply migrations with existing data, record table locks/duration and verify history/read states. Rehearse application rollback with the retained schema, and independently verify backup/PITR restoration; do not drop the schema as rollback.
- [ ] From an external host verify port 3009 is inaccessible; from authorized WireGuard peers verify required service access. Inspect actual firewall/Docker rules, peer/key permissions, TLS, health/restart/log rotation, CPU/memory limits and secret mounts/log redaction.
- [ ] On real devices: airplane-mode send/retry/reconnect, offline gap catch-up, background/foreground, token refresh, logout/account switch, push token rebinding and expired media refresh. Confirm no prior account media remains visible or accessible through app state/cache.

## Merge recommendation

**Conditionally ready for maintainer review; do not merge based on old green CI.**
Confirmed local defects are fixed and relevant local checks pass. Require CI for
the final head before merge. Production rollout remains gated on the deployment,
private-media, backup/restore and device checks above and acceptance of the
single-instance and bounded-revocation constraints. No commit, push, merge,
deployment or review-thread resolution was performed during review. The user
subsequently authorized a local commit; pushing and merging remain unauthorized.
