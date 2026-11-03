# Tracking pending inbox rollout and verification

Pending events now live in PostgreSQL `tracking_service.pending_tracking_events`.
RabbitMQ ACK follows the committed inbox upsert. Consumption, sequence allocation,
timeline insertion and inbox deletion use one transaction, serialized by a
transaction-scoped advisory lock on the stable event ID. Redis loss no longer
removes the only copy of a pending event. Transactions use PostgreSQL's configured
WAL/fsync/replication durability: this is not a guarantee against losing the DB
volume or promoting a stale asynchronous replica. Keep `fsync` and
`synchronous_commit` enabled; document backup/failover RPO with the DB operator.

## Deploy

1. Stop old tracking consumers and reconciliation schedulers on every replica.
   Keep RabbitMQ queues intact. Keep Redis intact until legacy pending is imported.
2. Generate the tracking Prisma client and apply migrations to the intended DB:
   `pnpm run prisma:generate:tracking` then `pnpm run prisma:migrate:tracking`.
3. If an earlier PR build ran, provide `REDIS_URL` and `DATABASE_URL_TRACKING` to
   `node scripts/import-tracking-pending.mjs` for a count-only preview. Run with
   `--apply` to import both historical key formats. This commits PostgreSQL before
   removing each Redis head, can be rerun after interruption, and refuses entries
   without a stable ID. Do not restart old consumers during import. A repeated
   preview must report zero entries. The old sorted-set indexes are unused.
4. Start the new tracking replicas. Verify pending counts fall when flows exist.
   Do not roll back to a Redis-only consumer while PostgreSQL pending rows exist.

## Automated tests

`pnpm test apps/tracking-service` runs unit regressions and SSE recovery tests.
For real PostgreSQL checks, migrate a dedicated test DB, then explicitly set
`TRACKING_TEST_DATABASE_URL` and run:

`pnpm test apps/tracking-service/test/pending-inbox.postgres.spec.ts`

This suite tests redelivery, service recreation without Redis, concurrent replicas,
transaction rollback and scheduled retry. It creates unique fixtures and deletes
only those fixtures. It is skipped unless the explicit test URL is supplied.
These tests do not emulate a host power failure or a real RabbitMQ restart.

## Broker/crash acceptance test (isolated environment only)

- Publish `order.status.changed` with a fixed UUID eventId/orderId and no requestId.
  Confirm RabbitMQ delivery ACK and a pending row containing the original payload.
- Stop tracking after commit but before ACK: broker redelivery must leave one row.
  Stop tracking after ACK, restart it, and publish `order.created` with the mapping:
  there must be one timeline event and no pending row for that event ID.
- Restart/clear only the isolated test Redis while pending remains: the PostgreSQL
  row must remain and complete after order creation.
- Force a DB failure during timeline insertion. Both consumed-event and timeline
  writes must roll back; pending remains. Restore DB, wait for nextAttemptAt plus
  scheduler interval, without publishing another message, and verify completion.
- Send duplicate deliveries and run two tracking replicas concurrently; query by
  event ID and confirm exactly one timeline row. Deliver the mapping between the
  initial flow lookup and pending commit to verify the post-commit recheck.
- Keep SSE on replica A, interrupt Redis Pub/Sub and write an event on B; A must
  catch up via periodic DB drain without another event, with no duplicate IDs.

## Operations

Scheduler processes bounded batches. Missing flows are revisited after 15 seconds;
failed events remain stored, with attempts/last_error and capped exponential
backoff. No automatic poison-message deletion. Inspect old pending rows and the
PENDING_ORDER_STALLED_ALERT logs. Repair the upstream mapping or malformed payload
with an audited operation, retaining event_id; set next_attempt_at to now to retry.
Events missing a stable ID are rejected to the existing DLQ for operator repair.
