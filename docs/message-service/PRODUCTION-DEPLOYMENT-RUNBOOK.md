# Production Deployment Runbook — Message Service Phase 3
## Coordinated 4-Host Rollout Procedure

**Project:** HANDY_GO  
**Cluster Roles:** VPS1 (`10.77.0.1`), VPS2 (`10.77.0.2`), VPS3 (`10.77.0.3`), VPS4 (`10.77.0.4`)  
**Domain:** `https://handygo.duyaivy.id.vn`  
**Deployment Mode:** Transactional Multi-Host Rollout (`backend/deploy/production/orchestrate.py`)  

---

## 1. Safety Directives & Gate Policy

> [!IMPORTANT]
> **NO AUTOMATIC PRODUCTION MUTATION**
> A human operator must explicitly authorize:
> 1. Merging changes to the `release` branch.
> 2. Executing GitHub Actions workflow `backend-production.yml`.
> 3. Applying live database migrations to schema `message`.

---

## 2. Pre-Deployment Checklist

Complete these manual verifications before launching the rollout:

- [ ] **VPS4 Host Ready**: Completed [VPS4-PROVISIONING.md](VPS4-PROVISIONING.md).
- [ ] **WireGuard Mesh Active**: Verified `ping 10.77.0.4` from VPS1, VPS2, and VPS3.
- [ ] **PostgreSQL Backup**: Created full PostgreSQL snapshot/PITR recovery point on AWS RDS/Supabase before migration.
- [ ] **GitHub Secrets Registered**:
  - `VPS4_HOST` = `<VPS4_PUBLIC_IP>`
  - `VPS4_SSH_KEY` = Private SSH key for user `deploy` on VPS4.
- [ ] **Database Credentials Available**:
  - `DATABASE_URL_MESSAGE` (Direct or transactional pooler with search_path=message).
  - `DIRECT_URL_MESSAGE` (Direct session port 5432 for DDL Prisma migrations).
  - `DB_DDL_VERIFIED_MESSAGE=true`.
  - `DB_POOL_LIMIT_PRIMARY=16`.

---

## 3. Environment Variables Preparation

Ensure the following variables are merged into production's shared encrypted environment:

```ini
# --- Message Service Topology ---
AUTH_SERVICE_URL=http://10.77.0.1:3001
MEDIA_SERVICE_URL=http://10.77.0.1:3000
MESSAGE_SERVICE_URL=http://10.77.0.4:3009

# --- Database Pool Budget (Updated for 10 Services) ---
DB_POOL_LIMIT_PRIMARY=16
DB_POOL_RESERVE_PRIMARY=6

# --- Message Service Secrets ---
MESSAGE_INTERNAL_SECRET=<64-char-random-hex>
MESSAGE_CURSOR_SECRET=<64-char-random-hex>
MESSAGE_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
MESSAGE_JWT_ISSUER=handygo-auth
MESSAGE_JWT_AUDIENCE=handygo-apps

# --- Message Service Database & DDL ---
DATABASE_URL_MESSAGE=postgresql://postgres.tenant:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=message
DIRECT_URL_MESSAGE=postgresql://postgres.tenant:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=message
DB_DDL_VERIFIED_MESSAGE=true

# --- RabbitMQ Settings ---
RABBITMQ_URL=amqp://handygo:password@10.77.0.1:5672
```

---

## 4. Execution Workflow

### Step 4.1: Merge Implementation to `release` Branch
```bash
git checkout release
git merge --ff-only feature/HG-69-message_service
git push origin release
```

### Step 4.2: Trigger GitHub Actions Deployment
1. Navigate to GitHub Actions: **Actions** -> **Backend Production Deploy**.
2. Select branch `release`.
3. Enter inputs:
   - `run_migrations`: `true`
   - `rollout_timeout_minutes`: `30`
4. Click **Run workflow**.

---

## 5. Rollout Progression & Transaction Verification

The release orchestrator executes the following automated phases:

### Phase 1: Preflight & Cryptographic Proof
- Verifies admin dispatch authorization.
- Validates candidate `shared.env` against `database_plan.py` (checks primary pool limit 16 and all DDL flags).
- Inspects pending transactions across all 4 hosts (`vps1`, `vps2`, `vps3`, `vps4`). All hosts must be pristine (`pending.json` absent).

### Phase 2: Digest Pinning & Release Bundle Distribution
- Pins immutable Docker image digests (`ghcr.io/.../backend@sha256:...`).
- Builds encrypted tarball bundle containing `compose.production.yml`, `services.json`, `shared.env`, and Nginx configurations.
- Pushes release bundle to `/opt/handygo/releases/<RELEASE_ID>/` on all 4 hosts.

### Phase 3: Ordered Leaf-to-Edge Rollout
The coordinator executes rollout in exact reverse dependency order:
```text
Order: VPS4 ➔ VPS3 ➔ VPS2 ➔ VPS1
```

For each host:
1. `host.py begin <ROLE> <TRANSACTION>`:
   - Locks host transaction via `fcntl.flock`.
   - Records `pending.json` with status `SNAPSHOT`.
2. Database migration (VPS4 executes `prisma:migrate:message` for schema `message`).
3. `host.py apply <ROLE> <TRANSACTION>`:
   - Starts containers using `docker compose --profile <ROLE> up -d --remove-orphans`.
   - Verifies container health probes (`/health`).
   - Asserts restart count == 0 and created timestamp is strictly fresh.
4. Host marked `VERIFIED`.

### Phase 4: Cluster-Wide Two-Phase Commit
1. Public smoke tests probe edge endpoints on VPS1.
2. Coordinator executes `host.py commit` across `vps4`, `vps3`, `vps2`, `vps1`.
3. Stable pointers updated: `/opt/handygo/stable.json` points to `<RELEASE_ID>`.
4. Transaction journals cleared: `host.py finish` unlinks `pending.json`.

---

## 6. Post-Deployment Verification

### 6.1 Check Nginx Status on VPS1
```bash
ssh deploy@10.77.0.1
docker exec handygo-nginx nginx -t
docker exec handygo-nginx nginx -s reload
```

### 6.2 Check Message Service Container on VPS4
```bash
ssh deploy@10.77.0.4
docker ps --filter "name=message-service"
curl -i http://127.0.0.1:3009/health
```
Expected response:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok","info":{"uptime":...,"database":"healthy"}}
```

### 6.3 Test REST API through Public Domain
```bash
curl -i -X GET "https://handygo.duyaivy.id.vn/api/v1/conversations" \
     -H "Authorization: Bearer <VALID_CUSTOMER_OR_WORKER_JWT>"
```
Expected response:
```http
HTTP/2 200
content-type: application/json; charset=utf-8

{"statusCode":200,"message":"Success","data":{"conversations":[],"hasMore":false,"nextCursor":null}}
```

### 6.4 Test Socket.IO Handshake
```bash
curl -i "https://handygo.duyaivy.id.vn/api/v1/chat/socket.io/?EIO=4&transport=polling"
```
Expected response:
```http
HTTP/2 200
content-type: text/plain; charset=UTF-8

0{"sid":"...","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":20000,"maxPayload":16384}
```

If all checks return expected status codes, proceed to [PRODUCTION-SMOKE-TEST.md](PRODUCTION-SMOKE-TEST.md) for full interactive mobile verification.
