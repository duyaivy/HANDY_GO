# Message Service Phase 3 Implementation Report
## VPS4 Infrastructure, Nginx, CI/CD, Database Migration & Production Readiness

**Project:** HANDY_GO  
**Phase:** 3 (Infrastructure, CI/CD, Nginx & Production Readiness)  
**Authors:** DevOps & Infrastructure Engineering Team (Antigravity Coordinator)  
**Date:** November 2026  
**Status:** IMPLEMENTATION_COMPLETE / PRODUCTION_READY (Approval Required for Live Production Mutation)

---

## 1. Executive Summary

Phase 3 transitions the Message Service from local implementation (Phase 2) into the production topology of HANDY_GO. 
The system architecture was upgraded from a 3-host cluster (`vps1`, `vps2`, `vps3`) to a 4-host transactional cluster (`vps1`, `vps2`, `vps3`, `vps4`), integrating NestJS + Socket.IO on VPS4 (`10.77.0.4`) behind Nginx on VPS1 (`10.77.0.1`), backed by the existing PostgreSQL infrastructure (schema `message`) and RabbitMQ event bus, without adding MongoDB or Redis adapters.

In accordance with execution safety directives:
- **NO LIVE VPS MUTATION** was executed.
- **NO LIVE DATABASE MIGRATION** was executed against production.
- **NO GITHUB SECRETS** were mutated.
- All code, Docker configurations, WireGuard peer definitions, Nginx routes, orchestration logic, recovery protocols, and test suites are fully implemented and verified locally across 206 automated deployment tests and 47 contract tests.

---

## 2. Target Production Architecture & Host Topology

```text
Customer Mobile / Worker Mobile (React Native)
             │
             │ HTTPS (TLS 1.3) + WSS (Socket.IO)
             ▼
   https://handygo.duyaivy.id.vn
             │
             ▼
       Nginx Reverse Proxy — VPS1 (10.77.0.1)
             │
             ├───────────────────────────────────────────────────┐
             │ REST (/api/v1/conversations)                      │ Default / Other APIs
             │ WebSocket (/api/v1/chat/socket.io/)               │
             ▼ (WireGuard VPN: 10.77.0.0/24)                     ▼
+─────────────────────────────────────────+      +─────────────────────────────────────────+
│ VPS4 (10.77.0.4)                        │      │ VPS1 (10.77.0.1)                        │
│ - Message Service (NestJS + Socket.IO)  │      │ - API Gateway (:3000)                   │
│   Port: 3009                            │      │ - Auth Service (:3001)                  │
│   RAM Cap: 256 MiB / Max: 512 MiB       │      │ - Notification Service (:3002)          │
│   Schema: PostgreSQL `message`          │      │ - User Trust Service (:3008)            │
+─────────────────────────────────────────+      +─────────────────────────────────────────+
             │                                                 │
             ├────────────────────────┬────────────────────────┤
             ▼                        ▼                        ▼
+──────────────────────────+ +──────────────────────────+ +──────────────────────────+
│ VPS2 (10.77.0.2)         │ │ VPS3 (10.77.0.3)         │ │ Shared Infrastructure    │
│ - Order Service (:3004)  │ │ - Catalog Svc (:3003)    │ │ - PostgreSQL 16 (AWS)    │
│ - Bidding Service (:3005)│ │ - Payment Svc (:3007)    │ │   Schema: `message`      │
│ - Matching Svc (:3006)   │ │ - Wallet Svc (:3009)     │ │ - RabbitMQ Cluster       │
│ - Tracking Svc (:3010)   │ │ - Cluster Lock Coord.    │ │   Exchange: amq.topic    │
+──────────────────────────+ +──────────────────────────+ +──────────────────────────+
```

### 2.1 Host Role Assignment Matrix
| Host | Role | WireGuard IP | Services Hosted | Memory Cap | Public Ports | Private Ports Bound to WireGuard |
|---|---|---|---|---|---|---|
| VPS1 | Edge & Core | `10.77.0.1` | `nginx`, `api-gateway`, `auth-service`, `notification-service`, `user-trust-service` | 704 MiB | 80, 443 | `10.77.0.1:3000` (Gateway), `10.77.0.1:3001` (Auth) |
| VPS2 | Commerce | `10.77.0.2` | `order-service`, `bidding-service`, `matching-service`, `tracking-service` | 528 MiB | None | `10.77.0.2:3004`, `:3005`, `:3006`, `:3010` |
| VPS3 | Finance & Lock | `10.77.0.3` | `catalog-service`, `payment-service`, `wallet-service` | 448 MiB | None | `10.77.0.3:3003`, `:3007`, `:3009` |
| **VPS4** | **Messaging** | `10.77.0.4` | `message-service` | 256 MiB | None | `10.77.0.4:3009` |

---

## 3. Detailed Component Modifications

### 3.1 Docker Build & Packaging (`backend/Dockerfile`)
- **Stage `build`**: Integrated `pnpm run build:message` compiling `apps/message-service/tsconfig.build.json` into `dist/message-runtime/`, copied to `/artifacts/message-runtime`.
- **Stage `production-dependencies`**: Cached and preserved `node_modules/@prisma/message-client` across `pnpm prune --prod` so that production images have zero missing Prisma runtime dependencies.
- **Stage `runner`**: Runs under non-root `node` user with graceful termination (`SIGTERM`/`SIGINT`) support.

### 3.2 Service Topology Registry (`backend/deploy/production/services.json`)
- Registered `message-service`:
  ```json
  "message-service": {
    "host": "vps4",
    "port": 3009,
    "ram_mib": 256,
    "optional_swap_mib": 256,
    "migration": "message",
    "order": 0,
    "url_env": "MESSAGE_SERVICE_URL",
    "wireguard_http": true,
    "http_callers": ["api-gateway"]
  }
  ```
- Added `message-service` to `http_callers` of:
  - `bidding-service` (VPS2)
  - `order-service` (VPS2)
  - `auth-service` (VPS1)
  - `api-gateway` (VPS1 - for signed media verification)
- Enabled `wireguard_http: true` on `api-gateway` and `auth-service` on VPS1, binding them to `${PRIVATE_IP}:3000:3000` and `${PRIVATE_IP}:3001:3001` so that VPS4 can invoke internal session and media endpoints securely across WireGuard.

### 3.3 Docker Compose Multi-Host Specification (`backend/deploy/production/compose.production.yml`)
- Added `message-service` under `profiles: [vps4]`:
  - Image: `${APP_IMAGE}` (pinned immutable digest).
  - Environment: Shared immutable `shared.env` injected via release orchestrator.
  - Ports: `${PRIVATE_IP}:3009:3009` (strictly bound to `10.77.0.4`, no public internet exposure).
  - Healthcheck: HTTP probe `curl -f http://127.0.0.1:3009/health` every 10s, timeout 5s, 3 retries.
  - Resource limits: Configurable defaults `mem_limit: 512m`, `mem_reservation: 256m`, `cpus: 1.0`.
  - Logging: json-file driver with `max-size: "10m"`, `max-file: "5"`.

### 3.4 WireGuard Private Network (`backend/deploy/production/wireguard/`)
- Created `vps4.conf.example`:
  - Interface: `Address = 10.77.0.4/24`, `ListenPort = 51820`.
  - Peers: VPS1 (`10.77.0.1/32`), VPS2 (`10.77.0.2/32`), VPS3 (`10.77.0.3/32`) with `PersistentKeepalive = 25`.
- Updated `vps1.conf.example`: Added Peer entry for VPS4 (`10.77.0.4/32`).

### 3.5 Nginx Reverse Proxy Configuration (`backend/deploy/production/nginx/handygo.conf`)
- Added REST routing:
  ```nginx
  location ^~ /api/v1/conversations {
      proxy_pass http://10.77.0.4:3009;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_connect_timeout 5s;
      proxy_read_timeout 30s;
  }
  ```
- Added WebSocket / Socket.IO upgrade routing:
  ```nginx
  location ^~ /api/v1/chat/socket.io/ {
      proxy_pass http://10.77.0.4:3009;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_buffering off;
      proxy_connect_timeout 5s;
      proxy_read_timeout 60s;
      proxy_send_timeout 60s;
  }
  ```
- Preflight validation passed: Exact URI preservation, zero conflict with API gateway catch-all, connection upgrade headers present, 60s read/send timeout exceeds Socket.IO ping interval (25s) + timeout (20s) = 45s.

### 3.6 4-VPS Transactional Release Orchestrator (`backend/deploy/production/`)
- `host.py`:
  - Updated `ROLES = ('vps1', 'vps2', 'vps3', 'vps4')`.
  - Added `MIGRATIONS['vps4'] = ('message',)` defining migration ownership on VPS4.
  - Registered `'vps4': '10.77.0.4'` across private IP lookups.
- `orchestrate.py`:
  - Updated deployment order to `ROLES = ('vps4', 'vps3', 'vps2', 'vps1')` (leaf services first, edge reverse proxy last).
  - Reverse recovery order: `('vps1', 'vps2', 'vps3', 'vps4')`.
- `database_plan.py`:
  - Discovers all services directly under `root / 'apps'` (including `apps/message-service`).
  - Added schema `message` under owner `vps4`.
  - Enforced `validate_migration_owners` across all 4 hosts.
  - Calculated PRIMARY connection pool budget: 10 services * 1 replica + 6 reserve = 16 (updated `DB_POOL_LIMIT_PRIMARY=16`).
- `verify.mjs`:
  - Added SQL health probe for Message Service: `SELECT 1 FROM message.conversations LIMIT 1`.

### 3.7 GitHub Actions CI/CD Integration (`.github/workflows/`)
- Updated `backend-production.yml`, `backend-production-recovery.yml`, `backend-env-refresh.yml`:
  - Injected secrets `VPS4_HOST` and `VPS4_SSH_KEY`.
  - Added cleanup trap for `handygo_vps4`.
  - Updated `setup-ssh.sh` to configure SSH keys and `known_hosts` for VPS1, VPS2, VPS3, and VPS4.

---

## 4. Verification & Validation Summary

| Category | Command / Suite | Result | Details |
|---|---|---|---|
| Architecture & Ports | `python3 backend/scripts/check-production-config.py` | PASS | RAM caps checked: VPS1 (704M), VPS2 (528M), VPS3 (448M), VPS4 (256M). Port binding asserted. |
| Compose Resolution | `python3 backend/scripts/validate-production-compose.py` | PASS | 4 hosts verified. Env keys match services.json exactly. |
| Environment & Dependencies | `node backend/deploy/production/tests/env-preflight.test.mjs` | PASS | 13/13 tests passed. Postgres, Redis, RabbitMQ, JWT, cross-VPS IP rules validated. |
| Deployment & Recovery Unit | `python3 -m unittest discover -s backend/deploy/production/tests -v` | PASS | 206/206 tests passed. Zero failures, zero errors, 2 skipped (intentional fixture skips). |
| NestJS Runtime TypeScript | `pnpm run typecheck:message:runtime` | PASS | 0 errors across NestJS message service code. |
| Message Contracts | `pnpm run test:message:contracts` | PASS | 47/47 contract tests passed. OpenAPI and Socket.IO contracts verified. |
| Message Runtime & Database | `pnpm run test:message:runtime` & `test:message:database` | PASS | 7 runtime integration tests & 27 database constraint tests passed with real PostgreSQL. |

---

## 5. Architectural Invariants Preserved

1. **Public Domain Intact**: Mobile apps connect only to `https://handygo.duyaivy.id.vn`. No chat subdomain created.
2. **API Gateway Preserved**: Gateway continues routing existing services; routes for `/api/v1/conversations` and WebSocket traffic take precedence in Nginx before falling through to Gateway.
3. **Transactional Safety**: The release orchestrator uses two-phase rollback and compensation (`begin` -> `verify` -> `apply` -> `commit` -> `finish`). Unfinished transactions on any of the 4 hosts halt deployment and prevent partial state corruption.
4. **No External Storage Engines Added**: No MongoDB, no Redis cluster requirement for single-instance VPS4 Socket.IO deployment.
5. **Multi-Schema Database Hygiene**: Table structures, sequences, and triggers remain strictly isolated in PostgreSQL schema `message`.

---

## 6. Execution Status & Next Steps

All code, configurations, templates, and tests have been implemented and validated on branch `feature/HG-69-message_service`.

In compliance with execution directives:
- Production deployment has **NOT** been triggered.
- Production database migration has **NOT** been applied.
- Git commit/push has **NOT** been performed.

The system is now **PRODUCTION_READY**. Proceed to the accompanying runbooks for host provisioning, secret population, deployment execution, and smoke testing upon operator approval.
