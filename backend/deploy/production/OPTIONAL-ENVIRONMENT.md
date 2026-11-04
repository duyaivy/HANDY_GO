# Production environment policy

Missing, empty and whitespace-only optional values mean unset. Nonblank values
retain their contents, including spaces in passwords. URL resolvers trim surrounding
whitespace. No credentials, provider ports or pool modes are substituted.

The raw ENV parser previously rejected every empty key except three database
overrides. Database budget preflight and Prisma configuration separately required
all nine `DIRECT_URL_*` values, even for releases/ENV refreshes without migrations.
Several consumers used `??`, untrimmed truthiness or unconditional numeric/JSON
validation, so blanks could mask their existing defaults.

## Database settings

For each suffix `AUTH`, `USER_TRUST`, `CATALOG`, `ORDER`, `BIDDING`, `MATCHING`,
`TRACKING`, `NOTIFICATION`, `WALLET`:

| Configuration | Resolution and validation |
| --- | --- |
| `DATABASE_URL_<suffix>` | Optional runtime override; fallback `DATABASE_URL`. Invalid nonblank overrides fail. |
| `DIRECT_URL_<suffix>` | Optional Prisma CLI override; fallback service database URL, then shared database URL. Explicit override schemas must match the service's canonical schema. |
| `DB_POOL_MAX_<suffix>` | Optional driver cap override; fallback `DB_POOL_MAX`. An explicit effective cap remains required in production. |
| `DB_DDL_VERIFIED_<suffix>` | Deployment preflight requires `true` when migrations are enabled, confirming the **selected** endpoint targets the correct database and supports DDL/advisory locks. Not required for runtime-only rollout or ENV refresh. Standalone Prisma CLI adds no new confirmation gate. |
| `DB_POOL_GROUP_<suffix>`, `DB_POOL_REPLICAS_<suffix>` | Required production budget inputs. Group limit/reserve and aggregate demand checks remain strict. |

`DATABASE_URL` remains required in production shared ENV. There is no production
localhost fallback. Prisma migrations always select the canonical service schema.
Runtime schema behavior remains service-specific; Notification replaces a shared
URL's schema with `notification_service` as before.

Supabase Session Pooler (`*.pooler.supabase.com:5432`) is acceptable for runtime
and verified migrations. Transaction Pooler (`:6543`) is accepted for runtime
but rejected for Prisma migration operations, including when selected by fallback.
Supply a verified direct/session override if runtime uses transaction pooling;
the resolver never rewrites the port. Other provider pool modes must be verified
by the operator; a hostname or `DIRECT_URL` label alone cannot establish semantics.
See [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres)
and [Prisma migration/pooler requirements](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/pgbouncer).

## Other affected optional settings

The shared startup validator and ConfigService now normalize blank values before
applying existing defaults or feature gates. This covers `PORT`, `LOG_LEVEL`,
`API_PREFIX`, `CORS_ORIGIN`, `UPSTREAM_TIMEOUT_MS`, `OTP_EXPIRATION_MINUTES`,
`OTP_RESEND_COOLDOWN_SECONDS`, `OTP_MAX_ATTEMPTS`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_FROM`, `CLOUDINARY_IMAGE_FOLDER`, `CLOUDINARY_VIDEO_FOLDER`,
`CLOUDINARY_IMAGE_MAX_SIZE_MB`, `CLOUDINARY_VIDEO_MAX_SIZE_MB`, and
`CLOUDINARY_VIDEO_CHUNK_SIZE_MB`. Nonblank chunk sizes still undergo validation.

Direct process/Nest readers were also corrected for:

- `DB_POOL_TIMEOUT_MS`, `DB_POOL_IDLE_MS`: existing finite timeout defaults.
- `RABBITMQ_EXCHANGE`, `LOG_LEVEL`: existing exchange/logger defaults.
- `NOTIFICATION_EVENT_PREFETCH`, `NOTIFICATION_EVENT_QUEUE`: existing transport
  defaults; malformed nonblank queue/prefetch settings still fail.
- `NOTIFICATION_EVENT_POLICIES`: existing default policy map when absent.
  Existing nonblank policy parsing rules are preserved.
- `PUSH_ENABLED`, `PUSH_WORKER_ENABLED`, `PUSH_WORKER_POLL_INTERVAL_MS`,
  `PUSH_WORKER_LEASE_TIMEOUT_MS`, `PUSH_WORKER_BATCH_SIZE`,
  `PUSH_MAX_RETRY_ATTEMPTS`: existing feature gates and worker defaults.
- `FIREBASE_SA_BASE64`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID`:
  skipped when push is disabled; existing credential resolution when enabled.
  Enabling push still requires valid Firebase configuration.
- `MATCHING_CONSUMER_PREFETCH`, `MATCHING_WORKER_CONCURRENCY`,
  `MATCHING_JOB_TIMEOUT_MS`, `MATCHING_MAX_RETRY_ATTEMPTS`,
  `AI_SERVICE_TIMEOUT_MS` in KYC: existing defaults.
- `BID_REVISION_COOLDOWN_MS`: existing bidding cooldown, including the test default.

`WALLET_CONSUMER_RETRY_DELAYS_MS`, `TRUSTED_PROXY_CIDRS`, matching ranking
provider selection, FastAPI timeout and push policy resolution already handled
blank input with the existing behavior; their implementation is unchanged. Optional feature flags
accessed through shared ConfigService now see blanks as unset. Reference-only
`PORT_*` and `RABBITMQ_QUEUE_*` values are not made mandatory by raw ENV parsing.
Payment has no Prisma owner; no `DIRECT_URL_PAYMENT` requirement was introduced.

Required shared secrets, database, TLS broker/cache URLs, service endpoints and
deployment metadata (`APP_IMAGE`, `APP_ENV_FILE`, `PRIVATE_IP`, `NGINX_IMAGE`)
remain mandatory. Authentication/authorization and simulated-policy restrictions
are unchanged. Invalid required effective connections still fail validation.

## Snapshots and rollout

Release generation preserves the raw `shared.env` bytes, SHA-256 and mode 600.
Compose passes that snapshot without adding optional empty overrides; consumers
normalize it. No service-specific secret files or new environment keys are needed.
Fencing, integrity checks, migration review/hash gates, rollback/compensation,
health checks and container restart verification are unchanged.

The workflow review also covered the separate Azure AI and Vercel deployments,
development Compose, mobile configuration and standalone operator/test scripts.
They do not feed the three-VPS production ENV parser. Operator/test scripts that
require explicit safe targets retain those requirements.

Use a new runtime/migration image release to obtain the startup/resolver fixes.
ENV-only refresh retains existing image digests and cannot update old application
code. Immutable rollback bundles retain their original behavior and snapshots.
Do not edit historical release bundles to retrofit these rules. No production
secrets or hosts need modification solely to remove an absent optional override.

## Local verification

- Complete backend suite: 180 files passed, 7 skipped; 1,351 tests passed,
  114 skipped. Covers the pooler hostname/port cases and preservation of Nest
  process ENV lookup. Deployment DDL gates remain covered by Python tests.
- Deployment/recovery suite: 202 tests run, 2 opt-in tests skipped, no failures.
- Dependency preflight fixtures: 13 tests passed; no real dependency connections.
- Typecheck and lint passed.
- Production contract validation, migration inventory and all three Compose
  profiles passed, including omission of every optional ENV and rejection of
  missing deployment metadata.
- All nine actual Prisma CLI configs/schemas validated offline with blank
  overrides and a synthetic Supabase Session Pooler URL fallback.
- Shell syntax and `git diff --check` passed.

No production deployment, production migration, secret update or VPS mutation
was performed. Provider connectivity and real migrations were not exercised in
this change; the local Docker daemon was unavailable. Session/transaction-pooler
behavior above is verified by resolver/preflight tests, not a live Supabase test.

## Files changed

Paths below are relative to the repository root. Production Compose and workflows
needed no edits: existing mandatory interpolation is limited to infrastructure
metadata, and workflows already preserve raw shared ENV. The Compose regression
validator now checks the optional-free configuration explicitly.

- `backend/.env.example`
- `backend/AGENTS.md`
- `backend/apps/bidding-service/src/bids/bids.service.ts`
- `backend/apps/bidding-service/src/prisma/prisma.service.ts`
- `backend/apps/bidding-service/src/sse/sse-event-bridge.service.ts`
- `backend/apps/catalog-service/src/prisma/prisma.service.ts`
- `backend/apps/matching-service/src/main.ts`
- `backend/apps/matching-service/src/queue/matching-job-queue.service.ts`
- `backend/apps/notification-service/src/events/event-topology.ts`
- `backend/apps/notification-service/src/events/notification-policy.ts`
- `backend/apps/notification-service/src/push/firebase-push.provider.ts`
- `backend/apps/order-service/src/prisma/prisma.service.ts`
- `backend/apps/tracking-service/src/common/prisma/prisma.service.ts`
- `backend/apps/user-trust-service/src/kyc/kyc-worker.service.ts`
- `backend/apps/wallet-service/src/wallet-ledger/wallet-prisma.service.ts`
- `backend/deploy/production/DATABASE-INCIDENT-20261104.md`
- `backend/deploy/production/ENV-REFRESH.md`
- `backend/deploy/production/OPTIONAL-ENVIRONMENT.md`
- `backend/deploy/production/README.md`
- `backend/deploy/production/database_plan.py`
- `backend/deploy/production/env-preflight.mjs`
- `backend/deploy/production/env/production.env.example`
- `backend/deploy/production/host.py`
- `backend/deploy/production/orchestrate.py`
- `backend/deploy/production/tests/env-preflight.test.mjs`
- `backend/deploy/production/tests/test_database_incident.py`
- `backend/deploy/production/tests/test_env_refresh.py`
- `backend/deploy/production/tests/test_release.py`
- `backend/deploy/production/verify.mjs`
- `backend/libs/config/src/config.module.ts`
- `backend/libs/config/src/config.service.ts`
- `backend/libs/config/src/index.ts`
- `backend/libs/config/src/optional-env.spec.ts`
- `backend/libs/config/src/optional-env.ts`
- `backend/libs/database/src/auth.prisma.service.ts`
- `backend/libs/database/src/matching.prisma.service.ts`
- `backend/libs/database/src/order.prisma.service.ts`
- `backend/libs/database/src/pool.config.spec.ts`
- `backend/libs/database/src/pool.config.ts`
- `backend/libs/database/src/user-trust.prisma.service.ts`
- `backend/libs/logger/src/logger.config.ts`
- `backend/libs/rabbitmq/src/rabbitmq.config.ts`
- `backend/libs/rabbitmq/src/rabbitmq.module.ts`
- `backend/scripts/migration-url.ts`
- `backend/scripts/validate-production-compose.py`
