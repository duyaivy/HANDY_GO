# Production container evidence hotfix — PR #70

Repository: `duyaivy/HANDY_GO`. Branch: `hotfix/fix-production-container-evidence`.
Incident inputs dated 2026-11-09; no production hosts were contacted during this work.

## Incident and root causes

The reported stable release is `prod-20261106-42173362859-a1`; the failed pending
transaction/target is `prod-20261109-42631371549-a1`. VPS3 was reported to have
`phase=SNAPSHOT`, `touched=false`, and baseline-only container evidence. Healthy
catalog-service had the same StartedAt as its durable accepted receipt.

Originally, `Host._transaction_evidence()` treated any truthy pending evidence
as proof of restoration when verifying `pending.previous.release_id`. A baseline
made that branch return the absent `restored` section as `{}`. The path
`recovery.reconcile()` → coordinator `verify previous` → `Host.verify()` →
`_verify_bound_container()` then rejected healthy catalog-service for missing
acceptance. The initial PR corrected this lifecycle selection and added safe
reason codes without reducing runtime checks.

Follow-up review found a second lifecycle problem: after failed B force-recreates
stable A during restore, A's new container evidence belongs to B's pending
transaction. `finish(B)` archived it under B and removed pending; a later C
SNAPSHOT verified A against A's original, now stale, container IDs. Defaulting
missing durable transaction/phase fields also allowed incomplete receipts to
look successfully committed.

## Reproduction and implementation

`test_evidence_selection.py` reproduces the original baseline-only VPS3/catalog
case with temporary journals and mocked Docker. Before the initial fix it raised
the reported changed/restarted/unhealthy error despite matching runtime evidence.

Before the follow-up implementation, ran:

```bash
python3 -m unittest discover -s deploy/production/tests -p test_rollback_evidence.py -v
```

The complete `test_verified_rollback_survives_finish_and_next_snapshot` lifecycle
failed with `CONTAINER_ID_MISMATCH` after real mocked-Docker begin, commit,
restore, verification, authorization, finish, and C begin operations. The same
test now succeeds and asserts A's historical receipt bytes remain unchanged.

### Evidence selection

| Lifecycle | Required source |
| --- | --- |
| Active target APPLYING/VERIFIED/COMMITTED | Its pending accepted section |
| Completed pending RESTORED, verifying previous | Its pending restored section |
| Previous stable under pristine SNAPSHOT | Durable evidence for that stable release |
| No pending | Durable evidence for the requested release |
| Previous during incomplete/touched recovery | Reject |
| Missing, malformed or contradictory required evidence | Reject; no rebaseline or stale fallback |

Durable evidence now uses one small per-host `container-evidence.json` pointer:

```json
{
  "version": 1,
  "role": "vps3",
  "release_id": "prod-20261106-42173362859-a1",
  "transaction": "prod-20261109-42631371549-a1",
  "section": "restored",
  "receipt_sha256": "<SHA-256 of the exact immutable receipt bytes>"
}
```

On an authorized tracked COMMITTED or RESTORED finish, the host validates the
complete acceptance record and writes, in this order:

1. Immutable transaction receipt under its actual transaction owner, using schema
   version 3 and its host role. Existing identical receipts are reused; conflicting
   receipts stop cleanup and are never overwritten.
2. The pointer to that exact receipt, atomically using the existing private-file,
   fsync and rename writer.
3. Guarded pending cleanup, after both durable writes succeed.

Interrupted writes preserve pending state for inspected, fenced recovery. A retry
reuses the same immutable receipt. SNAPSHOT finish and abort do not promote new
container acceptance. Restored A therefore keeps B's verified restored evidence
after finish and through C's untouched SNAPSHOT. The next successful release
replaces the pointer with its own authorized receipt. Explicit deployment rollback
where target and transaction differ uses the actual owner rather than assuming
their IDs are equal.

The reader validates pointer version, role, release, owner, section and receipt
hash; then validates the receipt lifecycle and evidence. It never scans directory
ordering or timestamps. The pointer participates in `state_token()`, so changing
it invalidates stale coordinator operations. Existing host locks, session fences,
cluster verification/public smoke, and coordinator authorization remain required.
Both normal deployment and `recovery.reconcile()` already use `Host.finish()`;
no separate recovery evidence policy or change to `recovery.py` is needed.

### Receipt validation and historical compatibility

Durable acceptance requires explicit transaction and target ownership, previous
snapshot, `touched=true`, valid terminal phase, `verification=CLUSTER_VERIFIED`,
and `unlock=VERIFIED_FINISH`. RESTORED also requires the correct previous release,
restore decision, positive attempt counter, and valid recovery source phase.
Evidence version must explicitly be integer 1, service scope must match the host,
transitions must be an empty map if present, and every selected lifecycle record
must be valid. COMMITTED cannot carry restored acceptance. Unverified observations
and abort receipts cannot authorize acceptance. Missing phase or owner is never
silently inferred on a durable receipt.

Historical source inspection found schema-2 receipts written by
`e7ae88bd`'s `finish()` with terminal state, owner, verification and unlock fields.
The earlier `471fa23b` executor only unlinked pending; it did not write a receipt
that would justify the removed defaults. Schema-2 complete receipts remain
supported without a pointer. Unversioned receipts are supported only with the
same complete explicit fields, covering the existing legacy-journal finish path;
they receive no missing-field defaults. Unsupported versions and incomplete
historical records fail closed. Schema-3 receipts require their pointer, so
deleting it cannot silently revive the original acceptance.

Legacy pending journals may still infer phase from a boolean touched flag and may
lack baseline evidence while untouched. Required accepted/restored evidence must
carry its version, and restored evidence must carry its actual restore decision.
Legacy manifests without `container_verification_version=1` retain their existing
health, immutable-image, zero-restart and business-probe policy. Stored bundles
are not rewritten or upgraded in place.

Runtime verification continues to enforce full container identity, resolved
manifest image ID, restart count, StartedAt, healthy/running/non-OOM state, and
historical restart classification rules. Errors identify missing evidence,
invalid lifecycle, container/image/restart/start-time mismatch or unhealthy state;
new diagnostics never dump ENV, JWTs, connection strings or credentials.

## Regression tests and actual validation

The follow-up suite covers the entire A → failed touched B → force-recreated A →
verified and authorized finish → C SNAPSHOT lifecycle, immutable A history,
missing/tampered pointer and receipts, semantic validation even with a matching
hash, incomplete/unverified recovery, pointer-write failure and retry without
receipt rewrites, conflicting receipts, explicit rollback owner/target differences,
malformed modern records, narrow historical compatibility, and runtime ID/image/
restart/StartedAt mismatches. Original SNAPSHOT, legacy, recovery and abort tests
remain in the full suite. Docker commands are mocked in lifecycle tests.

Commands executed from `backend/`:

```bash
python3 -m unittest discover -s deploy/production/tests -v
python3 -m py_compile deploy/production/host.py deploy/production/tests/test_evidence_selection.py deploy/production/tests/test_rollback_evidence.py
/tmp/handygo-evidence-validation/bin/ruff check deploy/production/host.py deploy/production/tests/test_evidence_selection.py deploy/production/tests/test_rollback_evidence.py
/tmp/handygo-evidence-validation/bin/python scripts/check-production-config.py
python3 scripts/validate-production-compose.py
node --test deploy/production/tests/env-preflight.test.mjs
bash -n deploy/production/deploy.sh deploy/production/setup-ssh.sh
/tmp/actionlint ../.github/workflows/pr-ci.yml ../.github/workflows/backend-production.yml ../.github/workflows/backend-env-refresh.yml ../.github/workflows/backend-production-recovery.yml
git diff --check
```

Results: full suite 235 tests, OK with two optional Nginx Docker tests skipped
(no configured locally pulled `HANDYGO_TEST_NGINX_IMAGE`); all other listed checks
passed, including 13 Node tests. There is no configured Python type-check task;
Python compilation and Ruff checks cover the changed files. Ruff 0.14.3,
PyYAML 6.0.3 and actionlint 1.7.7 were installed/downloaded only to `/tmp` for local
validation. Initial validation attempts found missing PyYAML and blocked sandbox
DNS; the authorized tool downloads resolved those limitations. Docker daemon is
unavailable locally; Compose config resolution does not require it. No workflow
files were changed. PR CI must run again on the pushed revision; prior CI success
does not establish the new revision's result.

## Operator runbook and rollout

### Reviewed source to main and release

Do not merge or deploy automatically. Review PR #70 against `main`, wait for its
new CI and maintainer approval, then integrate it through normal branch controls.
Separately promote the reviewed commit to protected `release` through the normal
release process, preserving CI provenance. Coordinate the release-branch update
with incident operators: a push may trigger production automation. Do not treat
promotion as permission to run recovery or a fresh deployment. Verify the exact
checkout SHA in every subsequent recovery/deployment run.

### Immutable executor copies

Existing `/opt/handygo/releases/<id>/host.py` copies retain their old behavior.
A source edit does not update them. Never patch those bundles, their manifests,
historical receipts, or production pointers manually. Do not invoke old bundle
executors directly, even where older documentation suggests doing so.

The current `Coordinator.executor()` sends reviewed `host.py`, `release_log.py`
and `services.json` from the runner checkout to the host Python loader. Old
bundles remain validated data. Run recovery from a reviewed `release` revision
that contains this fixed loader/host implementation. An old run rerun can still
use old source; never assume a source merge changed its executor. Once pointers
exist, all coordinators must retain pointer-aware execution; older runners cannot
maintain this ownership model safely.

### Inspect the reported pending transaction

Only an explicitly authorized operator should dispatch **Backend production
transaction recovery** at the fixed `release` SHA with:

| Input | Value |
| --- | --- |
| mode | `inspect` |
| original_run_id | `42631371549` |
| original_attempt | `1` |
| transaction | `prod-20261109-42631371549-a1` |
| target | `prod-20261109-42631371549-a1`, confirm against original journal |
| confirm | empty |

Review `execution.json`, `summary.md` and redacted logs for all three hosts, not
only VPS3. Require the expected owner/target, stable previous
`prod-20261106-42173362859-a1`, untouched SNAPSHOT participants, consistent bundles,
no restore activity or foreign/deferred transaction, and `FINISH_SNAPSHOT`.
Inspection plans recovery; it does not certify runtime acceptance. The host
inspection function is read-only, but the workflow acquires locks, increments
cluster epoch and claims fencing metadata. It is not entirely write-free.

### Explicitly authorized recovery

After reviewing inspection, an authorized operator may dispatch the same exact
identifiers at the fixed SHA with `mode=recover` and
`confirm=RECOVER_PRODUCTION`. For the unchanged untouched SNAPSHOT plan, recovery
verifies previous stable on every host using trusted durable evidence, runs
business/public probes, rechecks cluster state, authorizes finish and performs
guarded receipt-before-pending cleanup. It does not call restore, run migrations,
restart containers or change stable for this plan. Expected status is
`FAILED_ROLLBACK_SUCCESS` with verification `PASSED` and unlock `COMPLETE`.

If inspection instead finds touched state, a different owner, missing evidence,
runtime mismatch or incompatible migrations, stop for a new operator decision.
Manual recover supports other lifecycle plans and can recreate containers during
a legitimate restore; the untouched incident authorization does not cover that
different state. On an explicitly authorized genuine rollback, restored evidence
is verified before cluster authorization and durable pointer publication. Later
SNAPSHOT verification uses that exact completed recovery receipt.

The separate `abort-untouched` mode requires explicit
`confirm=ABORT_UNTOUCHED_SNAPSHOT`. It is only a cancellation option for precisely
untouched state with unchanged previous stable. It uses fenced runtime observation
twice at least 20 seconds apart plus business/public probes, then writes an abort
receipt and performs guarded pending cleanup. It does not certify the previous
release or publish accepted evidence. Expected status is
`SNAPSHOT_ABORTED_PREVIOUS_NOT_VERIFIED`. Do not use it to repair missing acceptance,
and do not assume it makes a subsequent verified deployment possible.

### Retry and subsequent deployment

On interruption, keep all files and inspect again with the fixed coordinator and
exact identifiers. A receipt/pointer write failure leaves pending intact; an
identical authorized finish can retry without rewriting history. Never manually
delete pending/stable or manufacture evidence. If a completed rollback predates
this pointer mechanism and no pending remains, do not scan for a recent receipt
or create a pointer by hand: preserve records and obtain a separately reviewed
ownership/recovery decision. This patch does not invent historical lineage.

After verified recovery, confirm all pending journals are absent, stable remains
the intended release, and retain artifacts. Start a separately authorized fresh
deployment at the reviewed fixed revision with a new transaction ID and normal
CI provenance. Keep normal guards, tests, migration controls and smoke probes.

## Remaining risks and rollback considerations

- Production state was supplied by the incident report, not observed here. No
  production SSH, deployment, migration, restart or file mutation was performed.
- Strict validation can reveal older incomplete/corrupt evidence. Stop rather
  than fabricate fields, rebaseline runtime or rewrite historical receipts.
- Pointer/hash integrity relies on existing trusted host filesystem ownership;
  a privileged attacker able to rewrite all deployment state is outside this
  mechanism's trust boundary. Runtime comparisons and fencing remain enforced.
- Old historical completed rollbacks without a pointer require explicit review;
  no automatic receipt search or migration is performed.
- Reverting to a pointer-unaware executor can reintroduce stale evidence or fail
  to update ownership. Do not roll back automation alone after pointer adoption;
  preserve state, inspect with the fixed runner and obtain a reviewed plan.
- Optional Docker integration tests and live-host verification were not run.
  All local lifecycle tests used mocks; new PR CI results remain separate.

## Files changed in the follow-up

- `backend/deploy/production/host.py`
- `backend/deploy/production/tests/test_evidence_selection.py`
- `backend/deploy/production/tests/test_rollback_evidence.py`
- `backend/docs/hotfix/PRODUCTION-CONTAINER-EVIDENCE-HOTFIX.md`

Application code, Prisma schemas, migrations, workflows, production bundles and
production state are unchanged. The patch is prepared for another PR review;
it is not approval to merge or deploy.
