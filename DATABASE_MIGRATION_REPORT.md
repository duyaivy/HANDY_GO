# HandyGo — Database Migration Report

**Date:** October 2026  
**Auditor:** Senior Backend Engineer & Software Architect  
**Scope:** Phase 1 Schema Migrations, Invariant Verification, and Safety Analysis.

---

## 1. Migration Identifiers & Execution Sequence

All migrations follow the monotonic timestamp naming convention (`YYYYMMDDHHMMSS_<name>`) and Prisma 7 migration directory conventions.

```
Execution Sequence:
1. user-trust-service: 20260927000000_init_user_trust           (Already applied in dev)
2. user-trust-service: 20260930000000_align_hg23_user_trust_design (Already applied in dev)
3. user-trust-service: 20261021000000_add_kyc_jobs_and_outbox   (Already applied in dev)
4. user-trust-service: 20261024000000_add_worker_service_areas   [NEW - Phase 1]
5. order-service:      20261024000000_init_order_service         [NEW - Phase 1]
6. matching-service:   20261024000000_init_matching_service      [NEW - Phase 1]
```

---

## 2. Inventory of Files Created and Modified

### 2.1 User & Trust Service
- **Modified:** `backend/apps/user-trust-service/prisma/schema.prisma`
  - Added `WorkerServiceArea` model.
  - Added relation `serviceAreas WorkerServiceArea[]` to `WorkerProfile`.
- **Created:** `backend/apps/user-trust-service/prisma/migrations/20261024000000_add_worker_service_areas/migration.sql`
  - Creates table `worker_service_areas`.
  - Defines check constraints: `latitude` `[-90, 90]`, `longitude` `[-180, 180]`, `radius_km` `(0, 500]`.
  - Defines foreign key `worker_profile_id` referencing `worker_profiles(id)` `ON DELETE CASCADE`.
  - Defines lookup indexes: `(worker_profile_id, is_active)` and `(latitude, longitude)`.
- **Created Test:** `backend/apps/user-trust-service/test/worker-service-areas.spec.ts`

### 2.2 Order Service
- **Created:** `backend/apps/order-service/prisma/prisma.config.ts`
  - Configures Prisma 7 `defineConfig` pointing to `order_service` database schema.
- **Created:** `backend/apps/order-service/prisma/schema.prisma`
  - Enums: `RequestStatus`, `BookingProposalStatus`, `WorkerSelectionSource`, `OrderStatus`, `PaymentState`.
  - Models: `ServiceRequest`, `RequestMedia`, `BookingProposal`, `Order`, `OrderStatusHistory`, `OutboxEvent`, `ConsumedEvent`.
  - Output client: `@prisma/order-client`.
- **Created:** `backend/apps/order-service/prisma/migrations/migration_lock.toml`
- **Created:** `backend/apps/order-service/prisma/migrations/20261024000000_init_order_service/migration.sql`
  - Initial SQL DDL defining tables, foreign keys, price/version checks, selection source XOR checks, and status history indexes.
- **Created Test:** `backend/apps/order-service/test/order-schema-validation.spec.ts`

### 2.3 Matching Service
- **Created:** `backend/apps/matching-service/prisma/prisma.config.ts`
  - Configures Prisma 7 `defineConfig` pointing to `matching_service` database schema.
- **Created:** `backend/apps/matching-service/prisma/schema.prisma`
  - Enum: `MatchRunStatus`.
  - Models: `MatchRun` (displayLimit: 5 default), `MatchResult` (rank 1..20), `OutboxEvent`, `ConsumedEvent`.
  - Output client: `@prisma/matching-client`.
- **Created:** `backend/apps/matching-service/prisma/migrations/migration_lock.toml`
- **Created:** `backend/apps/matching-service/prisma/migrations/20261024000000_init_matching_service/migration.sql`
  - Initial SQL DDL defining execution runs, historical retry uniqueness `(service_request_id, request_revision, run_number)`, score range checks `[0.00, 100.00]`, rank bounds `[1, 20]`.
- **Created Test:** `backend/apps/matching-service/test/matching-schema-validation.spec.ts`

### 2.4 Shared Database Libraries & Workspace Config
- **Created:** `backend/libs/database/src/order.prisma.service.ts`
- **Created:** `backend/libs/database/src/matching.prisma.service.ts`
- **Modified:** `backend/libs/database/src/database.module.ts` (added `OrderDatabaseModule`, `MatchingDatabaseModule`)
- **Modified:** `backend/libs/database/src/index.ts` (exported `OrderPrismaService`, `MatchingPrismaService`)
- **Modified:** `backend/package.json`
  - Added scripts: `prisma:generate:order`, `prisma:generate:matching`, `prisma:migrate:order`, `prisma:migrate:matching`, `prisma:status:order`, `prisma:status:matching`.
  - Updated aggregated commands `prisma:generate`, `prisma:migrate`, `prisma:status`.
- **Modified:** `backend/tsconfig.prisma.json`
  - Included `apps/order-service/prisma/prisma.config.ts` and `apps/matching-service/prisma/prisma.config.ts`.
- **Created Updated DBML References in Repository:**
  - `docs/dbml/handygo_user_trust_service.dbml`
  - `docs/dbml/handygo_order_service.dbml`
  - `docs/dbml/handygo_matching_service.dbml`

---

## 3. Database Constraints and Indexes Summary

### 3.1 `worker_service_areas`
- **Primary Key:** `id UUID`
- **Foreign Key:** `worker_profile_id -> worker_profiles(id) ON DELETE CASCADE`
- **CHECK (`latitude`):** `>= -90.000000 AND <= 90.000000`
- **CHECK (`longitude`):** `>= -180.000000 AND <= 180.000000`
- **CHECK (`radius_km`):** `> 0.00 AND <= 500.00`
- **Indexes:**
  - `worker_service_areas_worker_profile_id_is_active_idx` ON `("worker_profile_id", "is_active")`
  - `worker_service_areas_latitude_longitude_idx` ON `("latitude", "longitude")`

### 3.2 `order_service` Tables
- **`service_requests`:**
  - `CHECK ("version" >= 0)`
  - `CHECK ("matching_revision" >= 0)`
  - `CHECK ("latitude" IS NULL OR ("latitude" >= -90.000000 AND "latitude" <= 90.000000))`
  - `CHECK ("longitude" IS NULL OR ("longitude" >= -180.000000 AND "longitude" <= 180.000000))`
  - `CHECK ("ai_reference_price_min" >= 0 AND "ai_reference_price_max" >= "ai_reference_price_min")`
  - `CHECK ("selection_expires_at" >= "bidding_closes_at")`
  - `UNIQUE ("request_code")`
  - `INDEX ("customer_user_id", "status", "created_at")`
  - `INDEX ("service_id", "status")`
- **`booking_proposals`:**
  - `CHECK ("agreed_price" > 0)`
  - `CHECK ("revision_no" >= 1)`
  - `CHECK ("selection_source" XOR condition)`
  - `UNIQUE ("supersedes_proposal_id")`
  - `INDEX ("service_request_id", "status")`
  - `INDEX ("worker_user_id", "status")`
- **`orders`:**
  - `CHECK ("agreed_price" > 0)`
  - `CHECK ("version" >= 0)`
  - `CHECK ("latitude" >= -90.000000 AND "latitude" <= 90.000000)`
  - `CHECK ("longitude" >= -180.000000 AND "longitude" <= 180.000000)`
  - `CHECK ("selection_source" XOR condition)`
  - `UNIQUE ("order_code")`
  - `UNIQUE ("service_request_id")` (1-to-1 max one order per request)
  - `UNIQUE ("booking_proposal_id")`
  - `INDEX ("customer_user_id", "status", "created_at")`
  - `INDEX ("worker_user_id", "status", "created_at")`

### 3.3 `matching_service` Tables
- **`match_runs`:**
  - `CHECK ("request_revision" > 0)`
  - `CHECK ("run_number" > 0)`
  - `CHECK ("candidate_count" >= 0)`
  - `CHECK ("result_count" >= 0)`
  - `CHECK ("display_limit" > 0)`
  - `UNIQUE ("service_request_id", "request_revision", "run_number")`
  - `INDEX ("service_request_id", "status", "created_at")`
- **`match_results`:**
  - `CHECK ("rank" > 0 AND "rank" <= 20)`
  - `CHECK ("matching_score" >= 0.00 AND "matching_score" <= 100.00)`
  - `UNIQUE ("match_run_id", "worker_user_id")`
  - `UNIQUE ("match_run_id", "rank")`

---

## 4. Migration Execution Commands

In deployment or CI/CD pipelines, execute:

```bash
# Generate clients:
pnpm run prisma:generate

# Deploy migrations to each database schema:
pnpm run prisma:migrate:user-trust
pnpm run prisma:migrate:order
pnpm run prisma:migrate:matching

# Verify migration status:
pnpm run prisma:status
```

---

## 5. Verification & Testing

### Test Suite Execution
Unit test suites were authored and validated against existing repository test conventions using Vitest:

1. **`worker-service-areas.spec.ts`:**
   - Validated migration SQL structure, table creation, column precision.
   - Validated coordinate boundaries: accepted `(16.0544, 108.2022)`, rejected `(91.0, 108.0)`, rejected `(-90.5, 0)`, rejected `(0, 180.5)`.
   - Validated radius boundaries: accepted `10 km`, rejected `0 km`, rejected `-5 km`, rejected `600 km`.
   - Verified worker profile 1-to-N relation support.

2. **`order-schema-validation.spec.ts`:**
   - Validated creation of all 5 enums and 7 tables.
   - Validated selection source XOR guard: accepted bid with `source_bid_id`, accepted recommendation with `source_match_result_id`, rejected invalid co-presence or missing references.
   - Validated revision convention: Draft (`0`) -> Published (`1`) -> Location update (`2`), while schedule changes keep matching revision intact.

3. **`matching-schema-validation.spec.ts`:**
   - Validated `display_limit = 5` default.
   - Validated Top 20 rank constraint (`rank > 0 AND rank <= 20`) and score constraint (`0.00` to `100.00`).
   - Validated historical retry execution isolation (`run_number` increment without row overwrite).
   - Validated slice logic for customer presentation (Top 5 display vs Top 20 persistence).

---

## 6. Deployment Considerations and Migration Risks

1. **Additive Forward Compatibility:**
   - The migration `20261024000000_add_worker_service_areas` in `user-trust-service` is strictly additive. It creates a new independent table referencing `worker_profiles`. No existing table columns are dropped or altered. Zero downtime and zero disruption to currently registered Workers.
2. **Backfill Recommendation:**
   - Workers currently verified in production have no registered service areas. Until they register service areas, their candidate status for geographical filtering will be evaluated according to Phase 2 fallback rules (e.g. prompt Worker to set their service zone in mobile UI).
3. **Database Schema Creation:**
   - For fresh databases, ensure PostgreSQL schemas `order_service` and `matching_service` exist or are created during database provisioning (`CREATE SCHEMA IF NOT EXISTS order_service; CREATE SCHEMA IF NOT EXISTS matching_service;`).
