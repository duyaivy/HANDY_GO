# Notification Service — Phase 1

Core APIs only: devices, in-app notifications and channel preferences. Feature-first structure:

```text
src/
  common/         configuration, Prisma lifecycle, trusted gateway guard, safe errors
  devices/        controller, service, repository, DTOs, module, tests
  notifications/ controller, service, repository, DTOs, module, tests
  preferences/   controller, service, repository, DTOs, module, tests
  health/        health endpoint
```

## Configuration and startup

The service owns `notification_service` within the shared Supabase PostgreSQL database. It never queries another service's tables or adds cross-service foreign keys.

- Prefer `DATABASE_URL_NOTIFICATION` if nonempty. If it has no `schema` parameter, add `schema=notification_service`.
- Otherwise use `DATABASE_URL` and set `schema=notification_service`, replacing any other schema on that shared URL. Preserve other parameters such as `sslmode`.
- Runtime and migration CLI share `resolveNotificationDatabaseUrl`. Both load service `.env` before root `.env`; supplied environment variables take precedence.
- Require `INTERNAL_SERVICE_SECRET`. Default port is 3008; default API prefix is `api/v1`.
- An explicit override schema is supported for isolated tests. The database role needs permission to create/manage the selected schema for migrations.

```sh
pnpm run prisma:generate:notification
pnpm run prisma:migrate:notification
pnpm exec nest start notification-service --watch
```

These migration commands target the configured database. Apply the migration before exposing the APIs. The Phase 1 implementation was validated against isolated PostgreSQL; it does not apply migrations to Supabase automatically.

For Docker development, `docker compose up -d --no-deps notification-service`
uses a service-specific nodemon command that generates the Prisma client before
every Nest build. This also works with an existing development image that predates
the Notification client: source is bind-mounted, whereas `node_modules` lives
inside the container. Prisma schema changes trigger regeneration automatically.
After building, `exec node` runs the compiled application directly under nodemon;
`SIGTERM` lets Nest close its HTTP listener and database pool on restart. Avoid
nesting `nest start` here, which can leave its application child holding port 3008.
After pulling changes to the Compose command, recreate the service with the same
`docker compose up` command; `docker compose restart` does not apply command changes.

`GET /health`, `/docs` and `/docs-json` are available directly. Mobile clients call the gateway, normally port 3000, with `Authorization: Bearer <accessToken>`. The existing gateway already proxies `/api/v1/notifications` and exposes the service's Swagger document in its docs selector. Direct service calls require trusted internal headers and are not a second JWT authentication path.

## API contract

All successful operations return HTTP 200 with `{ statusCode: 200, message, data }`. Errors use `{ statusCode, code, message, data }`. Swagger decorators and response DTOs are the contract source of truth.

| Method | Path under `/api/v1/notifications` | Request / response data |
| --- | --- | --- |
| POST | `/devices` | `{ platform: "android" \| "ios", pushToken, deviceId? }` → device metadata, never token |
| DELETE | `/devices/:id` | Soft-deactivate one owned UUID → `{ id, isActive: false }` |
| GET | empty | `limit=20` (1–100), `cursor?`, `isRead=true\|false` → `{ items, nextCursor }` |
| GET | `/unread-count` | `{ count }` |
| GET | `/:id` | Owned notification details; does not mark read |
| PATCH | `/:id/read` | Details with first `readAt` preserved on retries |
| POST | `/read-all` | One database bulk update → `{ updatedCount }` |
| GET | `/preferences` | `{ pushEnabled, inAppEnabled, emailEnabled }` |
| PATCH | `/preferences` | At least one boolean channel; omitted values stay unchanged |

Registration returns the same record for a matching token or `(userId, deviceId)`. Send a stable installation `deviceId` on every registration for token rotation. Without it, a newly issued token cannot be linked to the old installation. Multiple devices are supported. Tokens registered to another user or conflicting installation return 409, including inactive registrations; ownership is never silently transferred. Repeated deactivation succeeds for an existing owned device. Other-user and missing devices/notifications both return 404.

Notification order is `createdAt DESC, id DESC`; the UUID resolves timestamp ties. The cursor records that tuple, user and filter. Reuse it with the same `isRead` filter. It is an opaque position marker, not an authorization credential: every query independently scopes to the trusted user. New inserts ahead of a cursor do not repeat earlier items. Lists are not a frozen snapshot if notifications change read state between requests. Delivery status does not control read/unread state.

Preferences default to push=true, in-app=true, email=false without creating a row on GET. Null/string booleans and empty patches are rejected. DBML v1 defines no mandatory-category policy; all three channels are configurable. Preferences are persisted only; delivery enforcement is deferred.

HTTP 400 covers invalid DTOs, UUIDs and cursors; 401 covers missing/invalid authentication; 403 covers an untrusted internal secret; 404 hides missing/foreign resources; 409 covers registration/database conflicts; 503 covers storage failure. Client-supplied user IDs in bodies/queries never select ownership.

## Database and DBML decisions

Migration: `prisma/migrations/20261020000000_notification_phase1/migration.sql`.

All seven supplied tables and five enums are preserved. Delivery attempts, consumed events and outbox tables are schema-only, with no processing code.

Changes/clarifications relative to DBML:

- Upgrade the `(user_id, device_id)` index to unique, preventing duplicate installation records during token rotation. PostgreSQL still allows multiple null device IDs. Keep the global unique push token.
- Extend both recipient/time indexes with descending `id` for deterministic cursor pagination. The recipient/read/time index also supports unread counts.
- Use `timestamptz(3)` to match JavaScript/Prisma millisecond precision, avoiding cursor gaps from discarded microseconds.
- Supply UUID and creation timestamp defaults; Prisma maintains `updated_at`.
- Add the DBML-requested checks: `attempt_no >= 1`; push attempts require a device, email/in-app attempts omit it. Local foreign keys use restrictive deletes to preserve future delivery history.
- Preserve `web` in the database enum for compatibility; Phase 1 registration accepts Android/iOS only.
- No category-specific preference fields or mandatory-category constraints exist in the supplied schema; none were invented.

## Verification and fixtures

Unit tests run without external systems. Real database integration tests activate with `NOTIFICATION_TEST_DATABASE_URL`; without it they are explicitly skipped. Use a dedicated database named `notification_test*`. Tests create and remove only a random isolated schema within it, and seed notification rows through `test/fixtures.ts`. No public send/create endpoint exists.

```sh
docker run --detach --rm --name handygo-notification-test \
  -e POSTGRES_USER=notification_test -e POSTGRES_PASSWORD=notification_test \
  -e POSTGRES_DB=notification_test -p 127.0.0.1:55438:5432 postgres:17-alpine

NOTIFICATION_TEST_DATABASE_URL=postgresql://notification_test:notification_test@127.0.0.1:55438/notification_test \
  pnpm test apps/notification-service

pnpm run typecheck
pnpm run typecheck:notification
pnpm run lint
pnpm build
docker stop handygo-notification-test
```

Integration coverage includes actual RS256 verification by the existing gateway middleware, spoofed headers, all protected routes, DTO validation, token deduplication/rotation/reactivation, concurrent registration, ownership, tied-timestamp pagination, read filters/counts, idempotent read operations, preferences and concurrent partial updates, SQL constraints, Swagger response schemas and sanitized storage failures. No Firebase, RabbitMQ, Redis or email process is needed.

Shared integration changes cover Prisma scripts/client packaging, optional Compose environment wiring and push-token log redaction. The monorepo typecheck now checks application/library source rather than the root config with an empty files list; two existing import compatibility errors were corrected in Auth throttler types and Catalog Prisma configuration to make that gate pass. Their business logic is unchanged. Production orchestration now includes the Notification migration on VPS1 and read-only core API probes; deployment state remains PARTIAL. This phase does not deploy the service.

## Deferred phases

RabbitMQ consumers, Firebase/FCM delivery, workers, retries/DLQs, outbox/inbox processing, email, preference enforcement during delivery, realtime gateways and Redis remain unimplemented. Future push workers belong inside this service. No Phase 2/3 runtime work was started.
