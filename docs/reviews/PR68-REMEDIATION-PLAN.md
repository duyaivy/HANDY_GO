# PR #68 review remediation plan

**Goal:** Verify every item in the attached review checklist and fix confirmed defects without changing chat business rules or adding distributed infrastructure.

**Architecture:** Keep the existing Nest/Socket.IO service, PostgreSQL transactions, durable outbox, and single Message Service deployment. Put admission controls before expensive work, verify read advancement using the existing conversation lock and database trigger, and retain provider verification for private media.

**Scope:** The user's seven priorities and `HANDY_GO_PR68_review_checklist.md`, downloaded from PR comment 6769504163. Work in place on the explicitly requested `feature/HG-69-message_service` branch. Do not push, merge, or resolve threads.

## Tasks

- [x] Socket controls (`realtime.ts`, new `realtime.spec.ts`): reproduce burst typing and concurrent handshake admission with real Socket.IO and mocked authority/database boundaries. Limit start/stop by user, socket, and conversation before authentication/DB/permission calls. Reserve admission synchronously after authentication, including pending handshakes, and release on disconnect/transport close. Check concurrency, aborted admission, and capacity recovery.
- [x] Read state (`lifecycle-concurrency.spec.ts`, runtime integration): inspect the existing PostgreSQL parent lock and migration trigger before changing code. The trigger already clamps with `GREATEST`; retain production logic and add real reverse/concurrent order, invalid/future cursor, first-insert and participant-isolation tests.
- [x] Upload (`uploads.controller.ts`, new `image-upload.interceptor.ts`, Cloudinary service/tests): reproduce multipart oversize and spoofed file types. Configure Multer from the existing image-size setting with one file and bounded fields/parts, filter allowed MIME types, and check JPEG/PNG/WebP signatures before provider upload. Keep chat's separate 10 MiB rule and generic configured cap. Exercise real multipart rejection, aborted requests, and valid uploads.
- [x] Authentication (`authority.ts`, `authority.spec.ts`): reduce the positive session cache lifetime to five seconds measured from request start; test revocation at expiry and repeated upstream failures. Bound permission proofs by bid expiration as well as the existing five-second cache lifetime.
- [x] Review the remaining checklist: inspect notification recipient binding and idempotency, broker confirmation/retries, mobile synchronization/logout, migration history, Docker/network configuration. Make further changes only for demonstrated defects; record evidence and production validation steps in `docs/reviews/PR68-REVIEW-RESULTS.md`.
- [x] Run focused regressions, backend unit/security tests, real PostgreSQL/runtime/broker integration where available, mobile tests/typecheck/lint, service/gateway builds, migration checks, and production Docker checks. Record failures, skipped checks and environment limits precisely.
- [x] Review the final diff against the checklist, report fixed/already-resolved/remaining items and merge readiness. No automatic commit or remote mutation.

## Review focus

Typing stop must remain usable after start; socket slots must not leak after abort; read acknowledgements must return the persisted maximum; generic uploads must retain their configured cap; expired permission/session evidence must never be extended by dependency failure. Production Cloudinary access, firewall/WireGuard state, staging backup/restore and multi-instance behavior require external validation.

## Execution notes

- Ruling: work in place on the explicitly requested feature branch and initially deliver changes uncommitted. The user subsequently authorized a local commit; push/merge/thread mutation remain prohibited.
- Ruling: the initial read-state mock omitted an existing trigger; remove the redundant service change and verify with real PostgreSQL instead.
- Ruling: preserve single-process deployment and document scaling requirements instead of adding Redis.
- Independent review found no concrete defects. Added timeout/rejection and multipart field-order tests; signature tests assert matching headers while full decoding remains provider-owned.
- See [PR68-REVIEW-RESULTS.md](PR68-REVIEW-RESULTS.md) for exact test outcomes, final-head CI requirements and unverified production checks.
