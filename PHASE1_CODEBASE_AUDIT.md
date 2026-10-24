# HandyGo — Phase 1 Codebase Audit Report

**Date:** October 2026  
**Auditor:** Senior Backend Engineer & Software Architect  
**Scope:** Phase 1: Codebase Audit, Database Schema Design & Migrations (User & Trust Service, Order Service, Matching Service)

---

## 1. Executive Summary

HandyGo is architected as an event-driven, distributed microservice marketplace platform. This audit evaluated the existing codebase structure, ORM conventions, database ownership boundaries, migration infrastructure, and the specific readiness of **User & Trust Service**, **Order Service**, and **Matching Service** in preparation for AI-powered Matching in Phase 2.

### Key Audit Conclusions:
1. **User & Trust Service:** Highly mature and active. Implements User management, Customer and Worker profiles, KYC verification workflows, reviews, bank accounts, and outbox event publishing. **Critical Gap Identified & Resolved:** No geographical operational zones were stored for Workers. Added `worker_service_areas` table with validation and coordinate indexes.
2. **Order Service:** Existing as an initial NestJS scaffolding application (`apps/order-service`). Business logic, request state machines, booking proposals, and order lifecycle management are intentionally not yet implemented. Prior to Phase 1, it lacked database schema definitions and migrations.
3. **Matching Service:** Existing as an initial NestJS scaffolding application (`apps/matching-service`). Prior to Phase 1, it lacked schema definitions and migrations for asynchronous recommendation runs, ranking persistence, and deduplication outbox/inbox.
4. **Architectural Consistency:** Strict microservice database boundary rules are maintained. Separate PostgreSQL schemas (`user_trust_service`, `order_service`, `matching_service`) are used, with zero cross-database foreign keys. All inter-service references are logical UUIDs.

---

## 2. Monorepo and Workspace Architecture

The HandyGo backend is organized as a NestJS monorepo managed with `pnpm` (`packageManager: pnpm@10.17.1`) and TypeScript project references.

```
backend/
├── apps/
│   ├── api-gateway/            # Reverse proxy, rate limiting, routing (port 3000)
│   ├── auth-service/           # Identity, credentials, JWT, OTP (port 3001)
│   ├── user-trust-service/     # Users, profiles, KYC, trust, service areas (port 3002)
│   ├── catalog-service/        # Categories & standard services (port 3003)
│   ├── order-service/          # Requests, proposals, orders (port 3004) - [Prepared in P1]
│   ├── bidding-service/        # Worker bidding & quotes (port 3005)
│   ├── matching-service/       # Recommendation engine & runs (port 3006) - [Prepared in P1]
│   ├── payment-service/        # Payment processing (port 3007)
│   ├── notification-service/   # Push/Email notifications (port 3008)
│   ├── wallet-service/         # User balances & escrow (port 3009)
│   └── tracking-service/       # Order tracking & audit timelines (port 3010)
├── libs/
│   ├── auth/                   # Shared JWT verification guards & permissions
│   ├── cloudinary/             # Media upload integration
│   ├── common/                 # Domain event types, constants, base DTOs
│   ├── config/                 # Environment validation
│   ├── database/               # Prisma client wrappers and database modules
│   ├── logger/                 # Pino structured logging
│   ├── rabbitmq/               # AMQP connection management & event bus
│   └── redis/                  # Distributed cache and rate limiting
```

---

## 3. Database Connection & ORM Architecture

### 3.1 ORM Framework
- **Prisma ORM 7.10.0** is standard across all database-backed microservices.
- Driven via modern Prisma configuration files (`prisma.config.ts`) using `defineConfig` from `'prisma/config'`.
- Database adapter: `@prisma/adapter-pg` with native connection pooling (`pg@8.23.0`).

### 3.2 Schema Isolation Pattern
A single cloud PostgreSQL instance (e.g., Supabase / AWS RDS) or local container is partitioned into independent database schemas:
- `auth_service`
- `user_trust_service`
- `catalog_service`
- `order_service` (new)
- `matching_service` (new)

Each service connects with its dedicated schema parameter (`?schema=<service_schema>`) configured via service-specific environment variables:
- `DATABASE_URL_USER_TRUST`
- `DATABASE_URL_ORDER`
- `DATABASE_URL_MATCHING`
- Fallback: `DATABASE_URL` with query string rewrite.

### 3.3 Prisma Client Generation Output
To prevent collision among multiple Prisma schemas in a monorepo, each schema compiles to a dedicated package in `node_modules/@prisma/`:
- `apps/user-trust-service` -> `@prisma/user-trust-client`
- `apps/auth-service` -> `@prisma/auth-client`
- `apps/order-service` -> `@prisma/order-client`
- `apps/matching-service` -> `@prisma/matching-client`

Shared database modules are centralized in `libs/database/src/`:
- `UserTrustPrismaService` (`UserTrustDatabaseModule`)
- `OrderPrismaService` (`OrderDatabaseModule`)
- `MatchingPrismaService` (`MatchingDatabaseModule`)

---

## 4. Current State of Relevant Services

| Service | Implemented Components | Previous DB Tables | Missing DB Structures (Prior to Phase 1) | Phase 1 Action |
|---|---|---|---|---|
| **User & Trust Service** | Profile management, KYC verification flow, review recording, bank account management, outbox/inbox | `users`, `customer_profiles`, `worker_profiles`, `user_bank_accounts`, `worker_service_offerings`, `kyc_cases`, `worker_reviews`, `complaints`, `complaint_evidence`, `ai_analysis_jobs`, `kyc_review_histories`, `event_inbox`, `outbox_events` | `worker_service_areas` | Added `worker_service_areas` with coordinates and radius check constraints and indexes. |
| **Order Service** | Scaffolding controller, module, service (`getHello`) | None | `service_requests`, `request_media`, `booking_proposals`, `orders`, `order_status_history`, `outbox_events`, `consumed_events` | Created complete Prisma schema, `prisma.config.ts`, initial SQL migration, and validation spec. |
| **Matching Service** | Scaffolding controller, module, service (`getHello`) | None | `match_runs`, `match_results`, `outbox_events`, `consumed_events` | Created complete Prisma schema, `prisma.config.ts`, initial SQL migration, and validation spec with Top 20 persistence & display limit 5. |
| **Catalog Service** | Categories & services repository and APIs | `categories`, `services`, `outbox_events` | None | Reused existing logical references (`services.id`). |
| **Bidding Service** | Quote submission & negotiation scaffolding | Separate domain | N/A | Preserved logical references (`bids.id`). |

---

## 5. Architectural Inconsistencies & Resolution

### 5.1 Service Request Revision vs Matching Request Revision
- **Inconsistency:** Order DBML defined `matching_revision INT DEFAULT 0`, while Matching DBML referenced `request_revision INT DEFAULT 1`.
- **Architectural Decision:**
  - When a Customer drafts a Service Request: `matching_revision = 0`.
  - When the Customer publishes the Request for the first time: Order Service emits `service_request.published` with `matching_revision = 1`.
  - Matching Service initiates its first match run with `request_revision = 1` and `run_number = 1`.
  - Any subsequent material update to the Request (e.g., coordinates, service ID, scope description) increments `matching_revision` (e.g., `2`), causing Matching Service to initiate `request_revision = 2, run_number = 1`.
  - Non-material changes (e.g., changes to `scheduled_at`, new bids received) **do not** increment `matching_revision`.

### 5.2 Display Limit vs Persisted Results Count
- **Inconsistency:** Earlier Matching DBML draft used `display_limit DEFAULT 3`.
- **Architectural Requirement:** Product requirements explicitly mandate presenting the **Top 5** recommended Workers to Customers, while persisting up to **Top 20** ranked candidates in `match_results` for deduplication with incoming bids.
- **Resolution:** Updated `display_limit` default to `5` in both the DBML and migration schema. Set `rank` CHECK constraint to `rank > 0 AND rank <= 20`.

### 5.3 Time Availability Scope Removal
- **Inconsistency:** Legacy architectures attempted to factor Worker schedule calendars, job duration estimates, and on-time performance into AI Matching.
- **Architectural Decision:** Time availability is strictly an Order Service booking negotiation concern. Matching Service evaluates Workers purely based on:
  1. Semantic expertise
  2. Geographical suitability
  3. Rating quality
  4. Service-specific experience
  5. Historical completion performance
- No calendar tables or availability checks are introduced into Matching Service.

---

## 6. External Dependencies and Blockers

1. **AI FastAPI Service (`ai-service` on port 8000):**
   - Matching Service in Phase 2 will invoke AI ranking via internal HTTP or gRPC. Phase 1 provides the exact data contract and feature expectations without calling the service.
2. **Order Service Business Implementation:**
   - Order Service business logic will be developed in future phases. The database foundation prepared in Phase 1 ensures that when Order Service logic is implemented, the schema, outbox, and matching revision triggers are already finalized.
3. **Catalog Data Availability:**
   - Cross-service validation of `service_id` requires seeded Catalog data in development environments.
