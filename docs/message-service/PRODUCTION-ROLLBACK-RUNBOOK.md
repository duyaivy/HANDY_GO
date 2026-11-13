# Production Rollback & Incident Recovery Runbook
## Message Service & 4-Host Cluster Recovery Protocols

**Project:** HANDY_GO  
**Scope:** Cluster Incident Handling (`vps1`, `vps2`, `vps3`, `vps4`)  
**Recovery Tooling:** `backend/deploy/production/recovery.py`  
**Automated Workflow:** `.github/workflows/backend-production-recovery.yml`  

---

## 1. Rollback Philosophy & Core Guarantees

1. **Zero Data Destruction**: Rollback restores immutable application container digests and configuration snapshots. It **NEVER** runs down migrations, drops database tables, or purges message history.
2. **Reverse Rollout Order**: Rollback and compensation occur in edge-to-leaf reverse order:
   ```text
   Rollout:  VPS4 ➔ VPS3 ➔ VPS2 ➔ VPS1
   Rollback: VPS1 ➔ VPS2 ➔ VPS3 ➔ VPS4
   ```
3. **Fail-Closed on Divergence**: If any host exhibits an unexpected transaction owner or divergent stable state, automatic rollback stops and requests manual intervention (`FAILED_NEEDS_INTERVENTION`).
4. **Idempotent Recovery**: `recovery.py` can be safely rerun multiple times until all hosts reach consistent stable states.

---

## 2. Automatic Rollback Scenarios

During execution of `backend-production.yml`, the orchestrator automatically triggers compensation upon any of the following events:
- **Container Health Check Timeout**: Message Service fails to report HTTP 200 on `/health` within preflight window.
- **Container Restart Detected**: `restart_count > 0` during observation period.
- **Dependency Connection Failure**: PostgreSQL or RabbitMQ unreachable from VPS4 container.
- **Nginx Config Test Failure**: `nginx -t` fails on VPS1.
- **Workflow Interruption**: Runner cancelled or SSH timeout during `apply`.

### Automatic Compensation Workflow
1. The coordinator intercepts the failure exception.
2. For every host that executed `begin` or `apply`:
   - Reverts Compose configuration to `pending.json['previous']`.
   - Restarts containers with previous image digest.
   - Probes `/health` to verify previous release is operational.
3. If all restored hosts verify cleanly, status is recorded as `FAILED_ROLLBACK_SUCCESS`.
4. If a restored host fails health verification, status becomes `FAILED_NEEDS_INTERVENTION` and journals remain locked to protect forensic state.

---

## 3. Manual Cluster Recovery via GitHub Actions

When a deployment halts with `FAILED_NEEDS_INTERVENTION` or runner termination leaves `pending.json` on any host, use the recovery workflow:

### Step 3.1: Navigate to Recovery Workflow
1. Open GitHub repository: **Actions** ➔ **Backend Production Recovery**.
2. Identify the failed deployment run:
   - Note `run_id` (e.g., `41674776379`)
   - Note `run_attempt` (e.g., `1`)
   - Note exact transaction ID (e.g., `prod-20261106-41674776379-a1`)

### Step 3.2: Inspect Mode (Read-Only)
Run with:
- `mode`: `inspect`
- `run_id`: `<FAILED_RUN_ID>`
- `run_attempt`: `<FAILED_ATTEMPT>`
- `transaction`: `<FAILED_TRANSACTION_ID>`
- `target`: `<FAILED_TRANSACTION_ID>`

*Inspect queries `/opt/handygo/host.json`, `pending.json`, and `stable.json` across VPS1, VPS2, VPS3, and VPS4 without modifying any state.*

### Step 3.3: Execute Recovery (`recover`)
Run with:
- `mode`: `recover`
- `confirmation`: `RECOVER_PRODUCTION`
- `run_id`: `<FAILED_RUN_ID>`
- `run_attempt`: `<FAILED_ATTEMPT>`
- `transaction`: `<FAILED_TRANSACTION_ID>`
- `target`: `<FAILED_TRANSACTION_ID>`

Outcome:
- Restores all 4 hosts to their previous stable manifests.
- Runs container verification and public smoke probes.
- Once all 4 hosts pass, clears locks (`pending.json` unlinked).

### Step 3.4: Abort Untouched Snapshots (`abort-untouched`)
If the failed deployment was aborted during preflight **before any container was restarted** (`touched: false` on all hosts):
- `mode`: `abort-untouched`
- `confirmation`: `ABORT_UNTOUCHED_SNAPSHOT`

Outcome:
- Observes containers twice over a 20-second window to assert zero restarts.
- Verifies public endpoints.
- Clears pending snapshot files without restarting any containers.

---

## 4. Emergency CLI Recovery via Bastion / Operator Host

If GitHub Actions is unavailable, execute recovery directly via SSH:

### 4.1 SSH into Cluster Lock Coordinator (VPS3) or VPS1
```bash
ssh deploy@10.77.0.1
cd /opt/handygo/releases/<CURRENT_RELEASE>
```

### 4.2 Inspect Cluster State
```bash
python3 recovery.py \
    --run-id 41674776379 \
    --attempt 1 \
    --transaction prod-20261106-41674776379-a1 \
    --target prod-20261106-41674776379-a1 \
    --domain handygo.duyaivy.id.vn
```

### 4.3 Trigger Active Recovery
```bash
python3 recovery.py \
    --run-id 41674776379 \
    --attempt 1 \
    --transaction prod-20261106-41674776379-a1 \
    --target prod-20261106-41674776379-a1 \
    --domain handygo.duyaivy.id.vn \
    --recover
```

---

## 5. Post-Recovery Invariants Verification

After recovery completes, verify:
1. `pending.json` is deleted on all 4 hosts:
   ```bash
   ssh deploy@10.77.0.1 "ls /opt/handygo/pending.json" # No such file
   ssh deploy@10.77.0.2 "ls /opt/handygo/pending.json" # No such file
   ssh deploy@10.77.0.3 "ls /opt/handygo/pending.json" # No such file
   ssh deploy@10.77.0.4 "ls /opt/handygo/pending.json" # No such file
   ```
2. Public API responds normally:
   ```bash
   curl -I https://handygo.duyaivy.id.vn/health
   ```
3. PostgreSQL connection pool shows healthy active sessions without pool exhaustion.
