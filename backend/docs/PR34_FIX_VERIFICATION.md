# PR34 reliability fixes — 2026-10-28

The working tree contains fixes on top of `21c08a3`; existing GitHub CI for that commit does not cover these changes.

| Review | Resolution |
| --- | --- |
| 01, 10 | Existing Python schemas and pytest-asyncio retained. |
| 02 | RabbitMQ message remains unacked through processing. Failures are counted in PostgreSQL; after five failures the original payload is retained in `event_deliveries` before ACK. Lease contention does not consume the retry budget. |
| 03 | Candidate HTTP and AI HTTP accept the job AbortSignal. The worker holds its concurrency slot until the processor exits. A persisted attempt token and deadline fence result writes; a stale attempt cannot fail a newer/completed run. |
| 04 | Public/internal recommendations compare the current projection revision. Missing projection or unavailable lifecycle fails closed. Eligibility requires the current completed run. Revision 2 with only revision 1 complete returns pending with no recommendations. |
| 05 | Both User Trust matching endpoints require a timing-safe internal secret guard. |
| 06 | Authoritative HTTP discovery returns an empty result only for a successful array response. HTTP failures throw and retry; the unbounded RPC fallback was removed. |
| 07 | Bidding returns request-wide bidder IDs. Gateway excludes them across pages and replenishes from Top 20. If the bidder index cannot be obtained, recommendations are suppressed with partial failure rather than silently allowing duplicates. |
| 08 | Matching consumes bidding_closed/expired. Projection updates cannot downgrade revisions or reopen terminal requests. Published deadlines also hide expired/closed requests if lifecycle delivery is delayed. Legacy projections with null deadlines continue to use their lifecycle status. |
| 09 | Atomic lease claim and conditional transactional completion preserve result IDs and produce one logical completion event. Completed jobs are no-ops in orchestration. |
| 11 | Failure of bidding-status is surfaced as unavailable/partial even when the bids request succeeds. |
| 12 | Preselect the nearest 100 eligible workers, with worker ID as deterministic tie-break, before AI ranking. Notifications still cover the full eligible population. |
| 13 | Completion writes `matching.eligible_workers.ready` in bounded chunks of 100, conforming to Notification's version-1 envelope, in the same transaction. Stable event IDs survive outbox retries. |
| 14 | Distance filtering, counts, ordering and pagination execute in PostgreSQL. Application memory only materializes the selected page. |
| 15 | Duplicate Order migration removed; canonical migration retained. |

## Deployment

Apply `20261028000000_matching_reliability` before starting the updated Matching service, then regenerate the Matching Prisma client. No application schema has been migrated on the shared database by this verification.

For migration tooling on Supabase, provide `DIRECT_URL_MATCHING` using the session/direct connection. Runtime retains `DATABASE_URL_MATCHING` (or `DATABASE_URL`). The verification runner derives Supabase's session port 5432 from a configured transaction-pooler port 6543 only for migration tooling; see [Supabase connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).

Database-backed dead letters are intentionally retained, not silently discarded. After correcting the underlying problem, replay the retained payload with its original event ID to the Matching queue and reset/delete that event's `event_deliveries` record in a controlled maintenance operation. Do not clear successful `consumed_events`. Outbox delivery remains at least once; consumers deduplicate by stable event ID.

## Reproduce using `.env`

```sh
node scripts/test-env.mjs apps/matching-service apps/api-gateway apps/bidding-service apps/user-trust-service apps/notification-service apps/order-service
node scripts/verify-pr34.mjs
node scripts/verify-pr34-ai.mjs
pnpm run typecheck
pnpm run lint
```

`PR34_ENV_FILE` selects another env file. The first command sets NODE_ENV=test/CI=true so legacy manual tests with fixed shared-data IDs are skipped. Policy/credential unit tests explicitly control the configuration they test while the runner still loads `.env`.

`verify-pr34.mjs` uses Supabase/CloudAMQP from `.env`, creates only randomly named test schemas/queues and cleans them up. It verifies clean Prisma migration deployment, upgrade with pre-existing completed results, concurrent claims/completions, expired-attempt fencing, lifecycle/revision replay, geographic pagination, deadlines, durable dead letters, and SIGKILL before ACK followed by broker redelivery and duplicate-event replay.

`verify-pr34-ai.mjs` uses the local AI URL and internal secret from `.env`, the existing `ai-ai-service:latest` image, and a read-only mount of current AI source. It starts and stops its own container. Verified model readiness and a real two-worker inference using `intfloat/multilingual-e5-small-hybrid-v1.0`.

For repeatable HTTP failure injection, see `postman/simulations/pr34.context.md`. This is a separate mocked-upstream check, not live service evidence.
