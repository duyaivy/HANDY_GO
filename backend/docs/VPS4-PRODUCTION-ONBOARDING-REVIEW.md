# VPS4 production onboarding review

Date: 2026-11-11
Repository: `duyaivy/HANDY_GO`
Reviewed source: `main` at `c9a76a357cdf3727b5c2b1b79979ee550ea4328f`

## Recommendation

**NO-GO for a production deployment now.** The local changes need normal PR review and release-branch integration first. The production branch is still a three-VPS version, the release merge has not been rehearsed locally, the GitHub production secret values were not inspected, and the Message runtime integration harness could not run because the local Docker daemon is unavailable.

The implementation provides an explicit onboarding path for a pristine VPS4 and passes the local production coordinator, configuration, Compose, ENV preflight, Prisma, Message unit, and backend Vitest checks listed below. It does not establish VPS4 network health, production database readiness, the live presence of GitHub secrets, or production deployment readiness.

## Root causes

1. **ENV preflight:** `vps4` was already present in the role-to-database map, but the executable guard invoked `checkEnv()` only for `vps1`–`vps3`. Message Service configuration was not checked. The shared database URL was included for every host, so VPS4 could accidentally probe `DATABASE_URL` instead of requiring its explicit `DATABASE_URL_MESSAGE`.
2. **Bootstrap:** the coordinator included VPS4 in the host list but required all four previous stable IDs to be equal. The host executor can make a first snapshot with no previous release, but there was no explicitly authorized 3-to-4 transition; recovery deliberately refused to pretend a bootstrap had an old application version.
3. **Release readiness:** remote `release` still has a three-host production workflow, three-host migration ownership, no Message Service Compose profile, no Message runtime image artifact, and no Message Nginx routes. Remote `main` contains these Message/VPS4 changes. The two branches have diverged substantially.

## Implemented changes

- `deploy/production/env-preflight.mjs`: runs for `vps4`; requires Message Service configuration; verifies the public key, secret lengths and upstream URL shape; checks PostgreSQL with only `DATABASE_URL_MESSAGE`; checks Redis and RabbitMQ; emits only safe probe labels.
- `deploy/production/host.py`: runs the ENV dependency preflight on VPS4 before changing live containers; checks a no-stable VPS4 for any Docker containers, unexpected release artifacts, transaction records or container evidence; records explicit onboarding ownership; removes only the new Message Service container on onboarding rollback and leaves `stable.json` absent.
- `deploy/production/orchestrate.py`: adds the `--onboard-vps4` authorization; accepts only the exact null-VPS4 / equal-VPS1–3 stable snapshot; includes the ENV preflight in release bundles; records migration scope in the immutable manifest.
- `deploy/production/recovery.py`: recognizes only the explicit onboarding participant and preserves normal consistency rules for all ordinary transactions; restores VPS1–3 and handles the VPS4 participant without inventing a rollback version; finishes VPS4 last during onboarding compensation so its recovery marker remains durable if an earlier finish fails.
- `deploy/production/database_plan.py`: supports a bounded migration-validation scope. Onboarding verifies DDL configuration only for the Message migration and its additive Notification `chat` category migration.
- `.github/workflows/backend-production.yml`: adds the explicit `onboard_vps4` input, requires a forward deployment and `run_migrations=true`, and forwards the authorization to the coordinator.
- `deploy/production/env/production.env.example`: documents the consumed `MESSAGE_EVENT_QUEUE` variable and makes the example Message DB URL explicit. Documents `PORT_MESSAGE_SERVICE`, `MESSAGE_PORT`, and `SOCKET_IO_PATH` accurately.
- `deploy/production/README.md` and `README.md`: documents the four-host topology, onboarding, rollback, migration scope, ENV semantics and prerequisites.
- Tests: `deploy/production/tests/env-preflight.test.mjs`, `test_database_incident.py`, `test_host_recovery.py`, `test_nginx_preflight.py`, and `test_recovery.py`.

The previously modified `../docs/message-service/VPS4-PROVISIONING.md` was not changed as part of this work.

## Onboarding state machine

```text
Normal three-host stable state + VPS4 pristine
    │ explicit onboard_vps4=true and run_migrations=true
    ▼
Inspect all four hosts; require VPS1–VPS3 stable agreement and no VPS4 journals,
containers, unknown release/transaction state, or container evidence
    ▼
Stage one immutable bundle; begin snapshots (VPS4 previous=null and marked onboarding)
    ▼
Prepare and preflight all hosts; run only Message + Notification chat migrations
    ▼
Apply → verify all → public smoke → verify all → coordinated commit
    ├── success: all four stable pointers identify the new release
    └── failure: restore VPS1–VPS3; remove only the new VPS4 Message container;
                 keep VPS4 stable absent; preserve additive DB migrations
```

The onboarding condition is scoped to the explicit workflow input, the pristine VPS4 inspection and the durable VPS4 pending marker. Ordinary preflight, rollback and recovery keep the existing four-host consistency rules. A later deployment or ENV refresh after successful onboarding uses the ordinary matching four-host stable snapshots.

The new host has no application release to restore. If compensation is needed, VPS4 ends without a stable application version; the database migrations are not reversed. Retry after successful compensation requires another explicit onboarding operation. If compensation is partial, do not edit or delete pending journals. Use the recovery workflow with the original run ID, attempt, transaction and target; recovery infers onboarding from the pending marker and is retryable. A VPS4 that has any unrelated, unhealthy, partially bootstrapped or unknown state is rejected as fresh.

## Migration ownership and runtime wiring

- The production registry assigns Message migration ownership to VPS4, schema `message`, order `0`.
- The same feature adds an additive Notification enum value `chat`, owned by the existing Notification migration on VPS1, order `2`. Onboarding runs only these two message-related migrations, in host order VPS4 then VPS1. It does not run Order, Bidding, Matching, Tracking, Wallet, Catalog, Auth or User Trust migrations.
- `DATABASE_URL_MESSAGE` is mandatory for VPS4 preflight and Message runtime configuration; it never falls back to shared `DATABASE_URL`.
- Redis is checked because it is part of the shared production ENV dependency contract. This does not create a new Message Service Redis runtime dependency.
- Compose inherits the full shared raw ENV through the `x-app` anchor. Message Service overrides only `PORT=3009` and `NODE_OPTIONS`. Its port binding expands from host metadata and is exactly `10.77.0.4:3009:3009` on VPS4.
- `main.ts` prefers `PORT`, then `MESSAGE_PORT`; therefore `PORT_MESSAGE_SERVICE` is inventory-only and `MESSAGE_PORT` is the fallback. Socket.IO currently hard-codes `/api/v1/chat/socket.io/`, so `SOCKET_IO_PATH` is descriptive only. The broker reads `MESSAGE_EVENT_QUEUE`; `RABBITMQ_QUEUE_MESSAGE` was unused and is removed from the production example.
- Dockerfile generation creates the Message Prisma client; the production-dependencies stage preserves `node_modules/@prisma/message-client` across prune, and the runtime stage copies the resulting node_modules and compiled `dist/message-runtime` artifacts.
- Nginx contains REST routing for `/api/v1/conversations` and Socket.IO routing for `/api/v1/chat/socket.io/` to `10.77.0.4:3009`; the Socket.IO block sends HTTP/1.1 Upgrade and Connection headers. The production workflow’s default domain remains `handygo.duyaivy.id.vn`.

## Remote branch comparison and release integration

Remote refs were read without fetching into the workspace:

| Ref | Commit | State |
| --- | --- | --- |
| `main` | `c9a76a357cdf3727b5c2b1b79979ee550ea4328f` | Matches the local `HEAD` |
| `release` | `67992b751e6d67787ce5aaa8e37ba3960fea44e4` | Remote release head |
| Merge base | `e2f0484b3c5f1517ba1014bc6d9da05dfff55cc0` | Branches diverged |

GitHub comparison reports `main` ahead by 73 commits and `release` ahead by 20. The current remote `release` files confirm three-host assumptions in `backend-production.yml`, ENV refresh and recovery workflows, `orchestrate.py`, `database_plan.py`, Compose, and service registry. Its Dockerfile has no Message runtime artifact, and Nginx has no Message routes. `main` adds the Message service and changes overlapping production, database and application files. The compare API did not establish whether a merge would be conflict-free, and a local merge simulation was not possible because this workspace cannot update `.git` refs.

**Recommended owner-approved integration sequence:**

1. Create a release integration branch from remote `release` at `67992b751e6d67787ce5aaa8e37ba3960fea44e4`.
2. Review the 20 release-only commits against main, then integrate the reviewed Message feature and its required auth/order/bidding/notification dependencies together with this onboarding fix. Do not promote only the deployment files while omitting Message runtime dependencies. Because main is 73 commits ahead, the owner should select the intended source changes and resolve overlapping API, Prisma, and workflow changes on the integration branch.
3. Resolve and review the production hotspots as one set: all four backend workflows, `Dockerfile`, `services.json`, `compose.production.yml`, `database_plan.py`, Message and Notification migrations, ENV template, `host.py`, `orchestrate.py`, recovery code, and Nginx routes.
4. Run the release branch’s complete CI, actionlint, production config/Compose/coordinator suites, Message typecheck/build/unit tests, migration inventory and disposable integration tests on the integration branch. Review generated manifests and the final workflow diff.
5. Have the release owner approve a PR from that integration branch to protected `release`. Only after merge, production owners configure GitHub Environment `production` secrets and separately authorize a deployment. No merge or push to `release` was made here.

## GitHub production prerequisites

The `production` Environment must contain these secrets; values were not accessed or changed:

- `VPS1_HOST`, `VPS1_SSH_KEY`
- `VPS2_HOST`, `VPS2_SSH_KEY`
- `VPS3_HOST`, `VPS3_SSH_KEY`
- `VPS4_HOST`, `VPS4_SSH_KEY`
- `BACKEND_PRODUCTION_ENV`, updated with the required Message Service settings above

Existing VPS1–VPS3 secrets and deployment behavior must remain configured. The `release` workflow currently does not reference VPS4 secrets, so do not infer that the secrets exist just because `main` has references to them.

Before first onboarding, provision and verify VPS4’s host identity, SSH access, WireGuard full mesh, Docker Compose, firewall, disk/memory and TLS-independent service readiness. Verify no containers or leftover state on VPS4. Confirm the Message and Notification migration endpoints, backup/PITR, DDL permissions, and the two DDL verification settings. The exact workflow authorization is `onboard_vps4=true`, `run_migrations=true`, and no rollback release.

## Verification evidence

| Check | Result |
| --- | --- |
| `python3 -m unittest discover -s deploy/production/tests -v` | Passed: 246 tests; 2 existing Docker-dependent tests skipped |
| `node --test deploy/production/tests/env-preflight.test.mjs` | Passed: 20 tests |
| `python3 scripts/validate-production-compose.py` | Passed for VPS1, VPS2, VPS3, VPS4 and optional-ENV cases |
| `python scripts/check-production-config.py` | Passed; all four host memory/service contracts validated |
| `python3 deploy/production/database_plan.py` | Passed; Message and Notification migration owners/configs resolved |
| `pnpm run typecheck:message:runtime` | Passed |
| `pnpm run build:message` | Passed |
| `pnpm run prisma:validate:message` | Passed |
| `pnpm run prisma:generate:message` | Passed; generated `@prisma/message-client` locally |
| `pnpm exec vitest run apps/message-service/src` | Passed: 9 files, 63 tests |
| `pnpm run test` | Passed: 201 files, 1,622 tests; 13 files / 141 tests skipped by existing conditions |
| GitHub workflow YAML parse (PyYAML) | Passed: all four workflows parsed |
| `bash -n deploy/production/deploy.sh` | Passed |
| `git diff --check` | Pending final check |
| actionlint | Not run: binary unavailable and local Docker daemon is unavailable |
| `pnpm run test:message:runtime` | Blocked: test harness requires Docker; local Docker socket is unavailable |
| Production Docker image build | Not run: local Docker daemon unavailable |

No SSH access, production database connection, migration, deployment, ENV refresh, secret access, or release promotion was performed.

## Remaining risks

- Remote `release` remains three-VPS and is significantly diverged from `main`; merge conflicts and the exact release scope require owner review on an integration branch.
- GitHub Environment secret presence and validity cannot be established from workflow references; values were intentionally not read.
- Message database and RabbitMQ connectivity were validated with fakes locally, not against production dependencies.
- Message PostgreSQL/RabbitMQ runtime integration and Docker image build still need a Docker-enabled CI runner.
- The two onboarding migrations are additive and are intentionally not automatically rolled back. A failed onboarding can leave schema objects present while VPS4 has no stable application version.
- A public HTTPS smoke check still probes the existing API and catalog routes; it is not a Message business-acceptance test.

## GO / NO-GO

**NO-GO for production deployment until release integration, owner review, release-branch CI, and production prerequisites are complete.** The local code change is ready for review, but production promotion remains a separate owner-approved action.

## Blocking review remediation (2026-11-11)

Follow-up to reviewed commit `068ec5622b92`; all changes remain on
`fix/vps4-production-onboarding`.

1. **Missing network:** raw `docker run --network handygo_default` assumed a network
   that `compose pull` never creates. VPS4 now uses `compose run --rm --no-deps`
   with the Node entrypoint overridden to run only the ENV probe. Compose initializes
   its existing configured network idempotently; no application entrypoint or
   published service port runs. Empty networks remain available for retries.
2. **Interrupted onboarding recovery:** the pristine-only guard ran before pending
   ownership classification. Recovery now validates the pending transaction and
   manifest first and supports authorized SNAPSHOT, APPLYING, VERIFIED, RESTORED
   and partially committed states. Unknown ownership remains rejected. Compensation
   accepts VPS4's explicit `NO_PREVIOUS_RELEASE` response without fabricating history.
3. **Migration rollback:** coordinator and host restore had different policies.
   They now share `rollback_migrations_compatible`. Equal nonempty hashes require
   both rollback compatibility declarations. Changed hashes require a certificate
   pinning the exact three reviewed additive Message/Notification SQL files, the
   complete previous baseline inventory/ownership hash, and the new inventory hash.
   The scoped migration set must be exactly Message and Notification. Any unrelated
   inventory changes invalidate the baseline before prepare; partial execution of
   these additive migrations remains compatible. Altered or incompatible SQL fails
   closed. ENV refresh rollback with retained onboarding metadata is also covered.
4. **Partial staging:** staging previously left an unowned immutable directory when
   another host failed. Fenced host staging now writes a durable ownership receipt
   before extraction and validates archive paths and immutable contents. Cleanup
   removes only abandoned, owned staging directories, retains CLEANED receipts,
   and is retryable after interruption. Beginning a deployment marks staging CONSUMED.
   Stable/pending references and every terminal transaction receipt permanently
   protect release bundles from this cleanup, including compensated onboarding
   bundles needed to authenticate later inspection. Unknown artifacts are retained
   and rejected. After successful cleanup, retry uses a new workflow attempt/release
   identity; immutable IDs are never overwritten.

Changed files: `deploy/production/{host,orchestrate,recovery,database_plan}.py`,
`deploy/production/tests/{test_staging,test_vps4_network,test_host_recovery,test_recovery,test_release,test_database_incident}.py`,
`deploy/production/tests/env-preflight.test.mjs`, and this report.

Regression coverage includes each host failing staging, interrupted extraction and
cleanup, retries, unknown artifacts, historical/terminal release retention, all five
onboarding recovery phases, real differing inventory hashes, partial additive SQL
execution, changed/unexecuted unrelated SQL, and ENV refresh rollback after onboarding.
Mocks/fakes isolate all SSH and transaction failure scenarios from production.

Actual follow-up verification:

| Check | Result |
| --- | --- |
| Complete production Python coordinator/recovery suite | 261 tests run, OK; 2 Docker-gated tests skipped |
| ENV preflight suite, all four roles | 22 passed |
| Production Compose validation | Passed all four profiles and optional-ENV cases |
| Production configuration and migration inventory checks | Passed |
| actionlint 1.7.7, three production workflows and pr-ci | Passed |
| Message runtime typecheck and build | Passed |
| Message Prisma validation | Passed with explicit dummy localhost URL; no DB connection |
| Message unit tests | 9 files, 63 tests passed |
| Message runtime Docker integration | Attempted; blocked by unavailable Docker daemon |
| Production runtime Docker image build | Attempted; blocked by unavailable Docker daemon |

Independent review found and prompted correction of historical staging cleanup,
compensated-bundle retention, and ENV refresh compatibility regressions; dedicated
regression tests now cover them. No production host, database or secret was accessed.

**Remaining risk / NO-GO:** the reconstructed compatible baseline of current main
is different from the inspected remote release migration inventory. Onboarding will
reject this difference safely. The owner must reconcile the release integration's
migration inventory or approve a separate compatible migration rollout before
onboarding. Do not edit journal hashes or broaden the additive allowlist to bypass
this rejection. Docker integration and image build must still pass on Docker-enabled
CI, and the earlier release integration/production prerequisites remain mandatory.
