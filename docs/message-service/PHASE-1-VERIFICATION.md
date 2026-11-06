# Phase 1 verification

Verification date: 2026-11-06. Commands run from `backend/` unless specified. This record covers executable Phase 1 schema/contract/policy checks, not a running chat service. Final results below include the reviewed relocation and enum regression fix.

## Environment and safety

Existing backend dependencies were reused; no new dependency/provider/infrastructure was introduced. Docker Engine reports 29.6.2. The PostgreSQL test runner creates a uniquely named `postgres:17-alpine` container bound only to loopback, generates disposable credentials, passes its own URL explicitly to Prisma, applies migrations twice, and removes its own container in `finally`. It does not accept a database URL or load `.env`. No production database, secrets, orchestration or Nginx configuration was touched.

Prisma Message config requires an explicit service URL. For offline validation/generation, a syntactically valid dummy loopback URL suffices; neither command connects to it. Never substitute production credentials for verification.

## Executed checks

| Command                                                               | Outcome                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --short` (repository root, before edits)                  | Clean                                                                                                                                                                                                                                           |
| `docker info --format '{{.ServerVersion}}'`                           | 29.6.2, after Docker sandbox permission granted                                                                                                                                                                                                 |
| `pnpm test`                                                           | First sandbox launch could not resolve pinned pnpm version; elevated retry ran during contract RED stage: 180 existing files passed, 8 skipped, 14 intentional new contract assertions failed. This was not the final result.                   |
| `./node_modules/.bin/vitest run`                                      | Sandbox denied local HTTP listen (`EPERM`): 10 existing HTTP assertions failed in candidates-aggregation, workers controller and internal-endpoints tests; 1,380 passed, 118 skipped. Elevated retry below resolves this environmental failure. |
| `./node_modules/.bin/vitest run` (local-port access granted)          | 181 files passed, 8 skipped; 1,390 assertions passed, 118 skipped (intermediate green before final contract additions).                                                                                                                         |
| `pnpm run typecheck`                                                  | Exit 0: backend TypeScript build sources and all Prisma configs, including Message                                                                                                                                                              |
| `pnpm run lint`                                                       | Exit 0: repository oxlint                                                                                                                                                                                                                       |
| `./node_modules/.bin/tsc --noEmit -p tsconfig.message-contracts.json` | Initial test fixture literal type failed; fixed by typed literal, then exit 0; compiles portable exports and tests                                                                                                                              |
| `git diff --check` (root)                                             | Exit 0 at integration checkpoint                                                                                                                                                                                                                |

Sandbox `pnpm run typecheck`, `pnpm run lint`, and `pnpm run typecheck:message` initially failed pinned-version registry fetch. They did not expose source failures; explicit elevated TypeScript/lint runs succeeded. No signature verification was disabled. Direct existing local binaries were also used for the same underlying checks.

## Test scope and RED evidence

Contract implementer first ran payload/policy tests against missing behavior and observed 14 expected assertion failures, then implemented the validators/policy and observed green. Monotonic read helper had an additional failing assertion before implementation. Database implementer ran its unconstrained disposable baseline (`node scripts/test-message-database.mjs --red`) and observed duplicate-identity rejection assertion fail; counter-forgery regressions were also observed before constraints were added. RED mode intentionally fails and is not a release check.

Real SQL tests exercise uniqueness for pair and sender key, participant rejection, same-conversation replies, attachment foreign keys/shape/count, concurrent sequence allocation and duplicate rollback, monotonic read state, immutable pair/history, deletion restrictions, and isolated migration history. Portable tests exercise forged fields, UUIDs, bounds, types, contact patterns, owned/private verified media, lifecycle transitions, missing/unverified bid, stranger access, selected continuation, cancellation/completion and decimal-string cursor precision. SQL constraints cannot verify cross-service bid truth or provider ownership; server authority acquisition remains Phase 2 work.

Existing 118 skipped tests are not counted as passed. They include suites requiring opt-in integration environments; no claim is made that those integrations ran. New Message runtime HTTP/Socket.IO/RabbitMQ/provider end-to-end tests cannot run because handlers deliberately do not exist in Phase 1. Their required cases are listed in [Phase 2 handoff](PHASE-2-HANDOFF.md).

## Final verification and review

**Phase 1 status: COMPLETE. Phase 2 readiness: READY to implement against these contracts.** No runtime chat or production readiness is claimed.

Final checks after all code changes and relocation:

| Exact command                                                                                                                                                         | Actual result                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test` (local-port access granted)                                                                                                                               | Exit 0; **182 files passed, 8 skipped; 1,400 tests passed, 118 skipped**. Includes all 47 new Message contract/policy/OpenAPI assertions across two files.                                       |
| `pnpm run typecheck`                                                                                                                                                  | Exit 0; build source and Prisma config compilation                                                                                                                                               |
| `pnpm run typecheck:message`                                                                                                                                          | Exit 0; portable shared contract source and tests                                                                                                                                                |
| `pnpm run lint`                                                                                                                                                       | Exit 0; repository oxlint                                                                                                                                                                        |
| `node scripts/test-message-database.mjs` (Docker access granted)                                                                                                      | Exit 0; **27 actual SQL checks**, migration applied then repeated with no pending migrations, empty Prisma structural diff, runtime role denied other-schema SELECT and CREATE in message/public |
| `DATABASE_URL_MESSAGE=postgresql://test:test@127.0.0.1:1/disposable ./node_modules/.bin/prisma validate --config=foundations/message-service/prisma/prisma.config.ts` | Exit 0; schema valid; dummy URL, no DB connection                                                                                                                                                |
| `DATABASE_URL_MESSAGE=postgresql://test:test@127.0.0.1:1/disposable ./node_modules/.bin/prisma generate --config=foundations/message-service/prisma/prisma.config.ts` | Exit 0; Prisma client v7.10.0 generated at backend/node_modules/@prisma/message-client                                                                                                           |
| `python3 -m unittest discover -s deploy/production/tests -p test_database_incident.py`                                                                                | Exit 0; **14 tests passed**; existing production migration inventory unchanged                                                                                                                   |

The database runner itself executes `prisma migrate deploy --config=foundations/message-service/prisma/prisma.config.ts` twice with its own explicit loopback URL. Its structural check executes `prisma migrate diff --from-config-datasource --to-schema=foundations/message-service/prisma/schema.prisma --exit-code --config=foundations/message-service/prisma/prisma.config.ts` and asserts “No difference detected”. These real database checks establish SQL syntax, referential integrity, structural correspondence and repeat deployment behavior. No db push/reset or destructive command was used on an existing database.

The initial schema location under backend/apps caused the existing production inventory test to fail (14 tests, 5 failure subcases and 2 errors) because all apps schemas must be production registered. Root cause: automatic scanning in deploy/production/database_plan.py. Fix: stage Phase 1 at backend/foundations/message-service/prisma, with the same relative depth and updated references. Production orchestration and its tests were not edited; 14/14 pass after relocation. Future relocation/registration is explicitly a Phase 2/3 integration prerequisite.

Independent review found enum coercion accepting JSON arrays as messageType. Regression observed **3 failed / 44 passed** before the strict string check, then **47 passed** after it. Four cases cover IMAGE/VIDEO arrays and plain/coercible objects. Scoped re-review: **SPEC COMPLIANCE PASS; QUALITY PASS**, both enum and relocation addressed, no new breakage. Initial counter forgery, direct counter tampering and active-bid validity/round checks were also corrected with observed RED→GREEN before final review. No open important review findings remain.

Only existing skipped suites and deliberately future runtime checks remain unexecuted. The SQL runner was independently executed again by the coordinator after relocation; no subagent success assertion is the sole database evidence. The same applies to final full-suite, TypeScript, lint, Prisma validation/generation and production inventory results. No production privileges, deployed engine compatibility or real private-media/session integrations were exercised; those are Phase 2/3 dependencies and are not advertised as completed features.

## Final formatting and scope checks

From repository root:

```sh
./backend/node_modules/.bin/prettier --check backend/libs/common/src/message-contracts backend/foundations/message-service/prisma/prisma.config.ts backend/scripts/test-message-database.mjs backend/tsconfig.message-contracts.json backend/tsconfig.prisma.json backend/package.json docs/message-service
./backend/node_modules/.bin/oxlint backend/foundations/message-service/prisma/prisma.config.ts backend/scripts/test-message-database.mjs
git diff --check
git status --short
```

Prettier: exit0, all matched files use its style. Explicit oxlint for the staged Prisma config and database runner (outside the existing lint script globs): exit0. Diff check: exit0. Git inventory contains six modified existing files and24 new Phase1 files only. Initial working tree was clean; no unrelated changes were present or overwritten. HEAD remains14cc402c931862d8e0d2b8398a7fa91a31e02550. Existing production files are unchanged; no commits, pushes, rebases, merges or deployment occurred.
