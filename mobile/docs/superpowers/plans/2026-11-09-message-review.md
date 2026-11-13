# Message service review fixes

Goal: Resolve the nine findings in backend/docs/message-service/BRANCH-REVIEW-2026-11-09.md.

Keep the existing atomic PostgreSQL persistence, session cache TTL and account-scoped query keys. No new dependencies.

- [x] Backend build: supply a message database placeholder during Prisma generation; validate without real credentials.
- [x] Persistence: populate outbox sequence/time from INSERT RETURNING; recognize Prisma raw constraint metadata only for idempotency/reply constraints. Verify concurrent retries, foreign replies and outbox contract on disposable PostgreSQL.
- [x] Authority: reject unavailable verification after cache expiration; test repeated failures and revoked sessions after TTL.
- [x] Media: bypass user IP budget only for authenticated internal verification; test more than 100 requests and invalid credentials. Expired retry cache must verify read access and refresh signed URLs, including read-only conversations.
- [x] Mobile: navigate by read permission; retry transient refresh failures with bounded backoff and cancel on logout/account switch; globally invalidate the active account's inbox on message/read events and reconnect.
- [x] Run backend/mobile regression suites, type checks and relevant builds; inspect the final diff and record any verification limits.

Verification:
- Disposable PostgreSQL REST/Socket.IO: 13/13 passed (previously 3 failures).
- Full backend suite: 1,575 passed, 135 skipped by existing integration configuration.
- Full mobile suite: passed; two additional refresh lifecycle edge cases also passed.
- Backend and mobile TypeScript checks passed.
- Prisma generate with build-only placeholder URL passed; message-service and gateway builds passed.
- Independent review: no important findings.
- Full production Docker image build and device interaction were not run.
