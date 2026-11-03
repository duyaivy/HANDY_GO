# PRODUCTION DEPLOY TRANSACTION RECOVERY HOTFIX REPORT

- **Project:** HANDY_GO
- **Branch:** `hotfix/production-deploy-recovery`
- **Target Task:** PRODUCTION_DEPLOY_TRANSACTION_RECOVERY
- **Status:** **PASS**
- **Date:** 2026-11-04

---

## 1. Problem Context & Incident Root Cause

In production deployment of HANDY_GO across three VPS hosts (`vps1`, `vps2`, `vps3`), a critical incident revealed serious cascading failures:
1. **Host Unhealthy Rollout:** During rollout, `vps3` failed deployment due to an unhealthy Wallet Service.
2. **Broken Compensation:** Rollback compensation could not complete because the previous RabbitMQ connection was unavailable.
3. **Pending Journal Left Intact:** The unfinished deployment transaction remained in `/opt/handygo/pending.json` on `vps3` (and untouched snapshot journals remained on other instances).
4. **Subsequent Deployments Blocked:** Later deployments failed immediately at `begin()` because an older transaction already existed in `pending.json`.
5. **Ownership Corruption on Retry:** Subsequent runs generated a new transaction ID (`prod-YYYYMMDD-RUN_ID-aATTEMPT`). When compensation was triggered, the coordinator attempted rollback using the *new* transaction ID against the *old* transaction on the host.
6. **No Matching Transaction:** Hosts rejected the call with `No matching transaction`, leaving hosts locked and journals orphaned.
7. **Manual Interventions Required:** Operators had to manually investigate and remove `pending.json` on multiple hosts, risking split-brain state and unverified releases.

The goal of this hotfix is to eliminate this recurring failure pattern and guarantee production transactional safety.

---

## 2. Assessment of Codex's Work

### Implemented by Codex
- **Dedicated Production Recovery Workflow (`.github/workflows/backend-production-recovery.yml`):**
  - Created a separate, manual GitHub Actions recovery workflow independent of the ENV refresh workflow.
  - Added strict validation of Run ID, Run Attempt, Transaction ID, Target Release ID, and exact repository identity.
  - Provided `inspect` (dry-run) and `recover` (write) modes.
- **Cluster Session Lock & Host Fencing (`backend/deploy/production/orchestrate.py` & `host.py`):**
  - Implemented session-bound locking on `vps3` (`cluster.lock`) with monotonic epoch tracking (`cluster-epoch.json`).
  - Added epoch and session fencing (`--fence <epoch:uuid>`) across all 3 hosts, preventing split-brain coordinators.
  - Added `--expected-state` compare-and-swap token check on remote host mutations.
  - Introduced remote execution of trusted in-repo runner code (`host.py` and `release_log.py`) via base64 loader, eliminating dependency on outdated host executors.
- **State Machine & Reconciliation Engine (`backend/deploy/production/recovery.py`):**
  - Pure planner `plan()` that analyzes cluster snapshots without mutating disk.
  - Handled `SNAPSHOT`, `APPLYING`, `VERIFIED`, `COMMITTED`, `RESTORED`, and `BOOTSTRAP_FAILED`.
  - Implemented cluster-wide rollback verification (verifying on all 3 hosts and public smoke testing before authorizing finish).
- **Coordinator Integration (`backend/deploy/production/orchestrate.py` & `refresh_env.py`):**
  - Integrated `preflight()` into `execute()`, bounded to `len(ROLES) + 1` iterations.
  - Added transaction ownership classification: `OWNED`, `FOREIGN_OWNER`, `NO_JOURNAL`.
  - Delegated rollback compensation to `reconcile()`.
  - Replaced duplicate recovery logic in `refresh_env.py` with unified `reconcile(env_only=True)`.

### Incomplete & Defective in Codex's Workspace
- **Test Failure (`KeyError: 'phase'`):** `host.py` in `restore()` directly accessed `state['phase']`. In `test_env_refresh.py` (`test_restore_uses_previous_env_and_local_image_cache`), `state` lacked `'phase'`, crashing the test.
- **Legacy Pending Journal Incompatibility:** Older versions of `host.py` in production wrote `pending.json` with only `transaction`, `target`, `previous`, and `touched: False` (omitting `phase`). `inspect_state()` and `owner()` in `host.py` as well as `plan()` in `recovery.py` strictly assumed `'phase'` was always present in the dictionary, causing cluster inspection and reconciliation to fail on legacy pending journals.
- **Missing Test Coverage:** Legacy journal inspection/restoration and CLI validation paths in `recovery.py` lacked explicit test cases.
- **Missing Documentation:** No handoff report or operational runbook had been created.

### Preserved Components
All of Codex's core architecture—cluster locking, fencing tokens, remote loader, ownership tracking, dedicated workflow, and regression test suites—was logically sound and preserved in its entirety.

---

## 3. Antigravity Implementation & Enhancements

### Files Modified & Created
1. `backend/deploy/production/host.py` (Modified)
2. `backend/deploy/production/recovery.py` (Modified)
3. `backend/deploy/production/tests/test_host_recovery.py` (Modified - added 3 legacy tests)
4. `backend/deploy/production/tests/test_recovery.py` (Modified - added 4 tests: legacy reconciliation & CLI validation)
5. `backend/deploy/production/README.md` (Modified - added operational recovery workflow note)
6. `backend/docs/CODEX_TO_AGY_RECOVERY_HANDOFF.md` (Created)
7. `backend/docs/PRODUCTION_DEPLOY_RECOVERY_HOTFIX.md` (Created)

### Detailed Code Changes

#### 1. Backward-Compatible Phase Normalization in `host.py`
In `inspect_state(role)`:
```python
if 'phase' not in pending and type(pending.get('touched')) is bool:
    # Backward compatibility with legacy pending journals generated before phase was added to begin()
    pending['phase'] = 'APPLYING' if pending['touched'] else 'SNAPSHOT'
```
In `Host.owner(transaction)`:
```python
if 'phase' not in state and type(state.get('touched')) is bool:
    state['phase'] = 'APPLYING' if state['touched'] else 'SNAPSHOT'
```
In `Host.restore(transaction)`:
```python
state['recovery_from_phase'] = state.get('phase', 'APPLYING' if state.get('touched') else 'SNAPSHOT')
```

#### 2. Robust State Planner in `recovery.py`
In `plan(states, expected=None)`:
```python
owned = {}
for r, s in states.items():
    if s.get('pending'):
        p = dict(s['pending'])
        if 'phase' not in p and type(p.get('touched')) is bool:
            p['phase'] = 'APPLYING' if p['touched'] else 'SNAPSHOT'
        owned[r] = p
```
In `reconcile()`:
Read phase with `.get('phase')` to prevent `KeyError` when handling legacy or test-mocked dictionaries.

#### 3. Expanded Test Suites
- Added `test_legacy_pending_without_phase_is_inspected_as_snapshot_if_untouched` in `test_host_recovery.py`.
- Added `test_legacy_pending_without_phase_can_be_finished_safely` in `test_host_recovery.py`.
- Added `test_legacy_pending_touched_without_phase_can_be_restored_safely` in `test_host_recovery.py`.
- Added `test_legacy_pending_snapshot_cluster_reconciliation` in `test_recovery.py`.
- Added `test_recovery_cli_argument_validation` in `test_recovery.py`.
- Added `test_recovery_cli_executes_reconcile_with_expected` in `test_recovery.py`.
- Added `test_recovery_cli_recover_flag_disables_inspect_only` in `test_recovery.py`.

---

## 4. Verification & Validation Evidence

### 1. Test Suite Results
```bash
python3 -m unittest discover -s backend/deploy/production/tests -v
```
**Output:**
```text
Ran 149 tests in 0.447s
OK (skipped=2)
```
- **Total Tests:** 149
- **Passing:** 147
- **Skipped:** 2 (standard skipped tests: `test_admin_manual_dispatch_records_exact_source_and_identity`, etc.)
- **Failing:** 0
- **Errors:** 0

### 2. Git Diff Formatting
```bash
git diff --check
```
**Output:** Exited with code 0 (clean, no trailing whitespace or formatting issues).

### 3. Production Compose Validation
```bash
cd backend && python3 scripts/validate-production-compose.py
```
**Output:**
```text
vps1: exact service set and shared raw ENV resolved correctly
vps2: exact service set and shared raw ENV resolved correctly
vps3: exact service set and shared raw ENV resolved correctly
```

### 4. Syntax & Static Verification
```bash
bash -n backend/deploy/production/deploy.sh
bash -n backend/deploy/production/setup-ssh.sh
node --check backend/deploy/production/env-preflight.mjs
node --check backend/deploy/production/verify.mjs
```
**Output:** All commands exited with code 0.

### 5. Actionlint Workflow Verification
```bash
docker run --rm -v "$PWD:/repo:ro" rhysd/actionlint:1.7.7 \
  /repo/.github/workflows/pr-ci.yml \
  /repo/.github/workflows/backend-production.yml \
  /repo/.github/workflows/backend-env-refresh.yml \
  /repo/.github/workflows/backend-production-recovery.yml
```
**Output:** Exited with code 0 (all 4 workflows strictly adhere to GitHub Actions syntax and linting standards).

---

## 5. Verification Against Mandatory Criteria

| # | Mandatory Verification Item | Verification Mechanism / Test Case | Result |
|---|---|---|---|
| 1 | Deployment proceeds when no host has pending transactions | `test_no_pending_on_all_three_hosts_does_not_mutate`, `ReleaseTests` | **VERIFIED** |
| 2 | Host with old pending blocks unsafe deployment before any new begin | `test_old_unsafe_pending_blocks_new_begin_and_staging` | **VERIFIED** |
| 3 | VPS3 begin succeeds but VPS2 begin fails | `test_cancellation_during_later_begin_reconciles_only_confirmed_journals` | **VERIFIED** |
| 4 | Compensation does not restore a transaction owned by another run | `test_incident_b_foreign_pending_after_first_begin_never_restored_as_new_owner` | **VERIFIED** |
| 5 | SSH timeout after remote begin is handled safely | `test_begin_timeout_after_remote_journal_write_is_reconciled_by_owner` | **VERIFIED** |
| 6 | SNAPSHOT + untouched recovery is safe and idempotent | `test_untouched_snapshot_verified_then_finished_without_restore`, `test_recovery_retried_twice_is_idempotent` | **VERIFIED** |
| 7 | Partial rollback failure preserves journal state | `test_incident_a_wallet_unhealthy_old_broker_preserves_original_transaction`, `test_old_broker_unhealthy_preserves_journal_and_stable` | **VERIFIED** |
| 8 | RESTORED journals unlocked only after required verification | `test_restored_requires_cluster_authorization_before_unlock`, `test_restored_state_requires_whole_cluster_and_public_verification` | **VERIFIED** |
| 9 | Partial commit cannot be silently marked stable | `test_partial_commit_restores_previous_exact_release_on_every_participant`, `test_unlocked_partial_commit_is_not_silently_downgraded` | **VERIFIED** |
| 10 | Recovery retries do not corrupt transaction ownership | `test_recovery_retried_twice_is_idempotent`, `test_failed_finish_can_be_retried_without_repeating_restore` | **VERIFIED** |
| 11 | Existing ENV refresh workflow continues to work | All 22 tests in `test_env_refresh.py` pass | **VERIFIED** |
| 12 | Production recovery cannot silently execute migrations | `test_migration_hash_mismatch_blocks_automatic_and_manual_restore`, `test_migration_mismatch_blocks_restore_before_docker` | **VERIFIED** |
| 13 | Secrets are not leaked into logs or artifacts | `test_recovery_errors_and_artifact_redact_loaded_secret`, `test_inspect_is_read_only_and_does_not_expose_env` | **VERIFIED** |
| 14 | Production workflows cannot race with recovery | Shared `concurrency.group: backend-production` across workflows + `cluster.lock` + epoch fencing tokens | **VERIFIED** |
| 15 | Legacy pending journals are handled safely | `test_legacy_pending_without_phase_*`, `test_legacy_pending_snapshot_cluster_reconciliation` | **VERIFIED** |

---

## 6. Operational Runbook & Handoff Guide

### 6.1 Merging the Hotfix Safely
1. Create a Pull Request from `hotfix/production-deploy-recovery` targeting `main`.
2. Confirm that GitHub Actions PR CI runs and passes all backend tests and actionlint validation.
3. Merge the PR into `main` using **Squash and Merge** (or rebase merge).
4. **Fast-forward promotion to `release`:** In accordance with the HANDY_GO deployment design, promote the commit from `main` to the `release` branch while strictly preserving ancestry:
   ```bash
   git checkout release
   git pull origin release
   git merge --ff-only main
   git push origin release
   ```

### 6.2 Automatic Reconciliation vs. Manual Recovery
- **Automatic Pre-deploy Reconciliation:**
  - When a normal deployment or manual rollback is triggered, `preflight()` automatically checks all 3 VPS hosts.
  - If any host has an **untouched snapshot** (e.g. from an aborted previous run where containers were not mutated), preflight safely verifies the existing release and unlocks the snapshot before beginning the new transaction.
  - If any host has a **touched or unsafe journal** (`APPLYING`, partial commit, or restore error), preflight refuses to begin a new deployment, preserving the host journals and failing closed.
- **Dedicated Recovery Workflow:**
  - For touched or unsafe transactions, operators use the dedicated workflow on GitHub Actions:
    **`Backend production transaction recovery`** (`.github/workflows/backend-production-recovery.yml`).
  - No manual SSH terminal access is required.

### 6.3 Step-by-Step Operator Guide for Existing Production Incidents

#### Step 1: Inspect (Dry-Run Mode)
1. Go to GitHub Actions → **Backend production transaction recovery**.
2. Click **Run workflow** on the `release` branch.
3. Fill in the parameters from the original failed run:
   - `mode`: **`inspect`**
   - `original_run_id`: `<Run ID of the failed deployment>` (e.g., `41666137769`)
   - `original_attempt`: `<Run Attempt of the failed deployment>` (e.g., `1`)
   - `transaction`: `<Exact Transaction ID>` (e.g., `prod-20261103-41666137769-a1`)
   - `target`: `<Target Release ID from the journal>` (e.g., `prod-20261103-41666137769-a1`)
   - `confirm`: leave blank.
4. Run the workflow and inspect the generated GitHub Step Summary and `recovery-output` artifact.
5. The inspect step will verify the current state across `vps1`, `vps2`, `vps3` without mutating any containers or deleting any journals.

#### Step 2: Recover (Verified Safe Execution)
1. If the inspect report confirms that the previous release is intact and compatible:
   - `mode`: **`recover`**
   - Same `original_run_id`, `original_attempt`, `transaction`, and `target`.
   - `confirm`: **`RECOVER_PRODUCTION`**
2. The recovery workflow will:
   - Acquire the cluster lock and fence all 3 VPS.
   - Execute restore of previous containers in reverse host order (`vps3` → `vps2` → `vps1`).
   - Run health and application probes across all 3 hosts.
   - Run public HTTPS smoke tests against `API_DOMAIN`.
   - Call `authorize-finish` and `finish` to archive the transaction receipt into `/opt/handygo/transactions/<transaction>.json` and cleanly remove `pending.json`.
   - Output `FAILED_ROLLBACK_SUCCESS` or `STABLE`.

#### Step 3: Confirm Stability Across All Three VPS
Check the workflow Step Summary or verify via public endpoints:
```bash
curl -i https://handygo.duyaivy.id.vn/health
curl -i https://handygo.duyaivy.id.vn/api/v1/categories
```
All services should return HTTP 200.

#### Step 4: Contingency / If Recovery Fails
- If recovery fails (e.g. RabbitMQ or external database remains unreachable):
  - The workflow terminates with `MANUAL_INTERVENTION_REQUIRED`.
  - All journals in `/opt/handygo/pending.json` are **preserved** with incremented `recovery_attempt` counters.
  - No blind journal deletion occurs.
  - Resolve the underlying infrastructure issue (e.g., restart RabbitMQ broker or fix connectivity), then rerun the recovery workflow with the same inputs.

---

## 7. Final Deliverable Status

**FINAL STATUS: PASS**

The hotfix is complete, fully tested, backward-compatible with legacy journals, and verified against all production constraints. It is ready for pull request review and merge.
