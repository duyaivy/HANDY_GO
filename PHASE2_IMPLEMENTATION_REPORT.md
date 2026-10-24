# HandyGo — Phase 2 Implementation Report
## NestJS Backend, Event-Driven Processing & Mock AI Integration

**Date:** October 2026  
**Author:** Senior Backend Engineer & Software Architect  
**Scope:** Phase 2: Matching Service Implementation, RabbitMQ Event-Driven Background Processing, Worker Eligibility, 5-Dimension Feature Normalization, Deterministic Mock AI Ranking, Results Persistence, and REST APIs.

---

## 1. Executive Summary

In Phase 2 of the HandyGo platform, the **Matching Service** (`apps/matching-service`) was developed from initial scaffolding into a fully operational, asynchronously event-driven microservice. The service automatically evaluates, filters, and ranks qualified professional Workers when Customers publish or update Service Requests.

The implementation strictly maintains microservice isolation boundaries, relies exclusively on RabbitMQ for asynchronous domain messaging, incorporates Transactional Inbox and Outbox patterns for idempotency and at-least-once reliability, implements bounded concurrency, provides a deterministic Mock AI Ranking Provider, and exposes authenticated Customer, Worker, and Internal REST APIs accompanied by complete Swagger/OpenAPI documentation.

### Core Architecture Highlights
1. **Asynchronous Non-Blocking Execution:** Matching operations are decoupled from HTTP transactions. Work begins exclusively upon receipt of `service_request.published` or `service_request.matching_inputs_changed` events via RabbitMQ.
2. **Strict Microservice Database Boundaries:** Matching Service has zero cross-database queries or foreign keys to `user_trust_service` or `order_service`. Inter-service candidate extraction is performed via authenticated internal endpoints and RPC adapters.
3. **Hard Worker Eligibility Filtering:** 7 mandatory non-negotiable gates (Active account, Verified profile, Approved KYC, Active matching service offering, Haversine geographic boundary match, Anti-self-matching, and Business restrictions) filter out unqualified workers prior to any ranking computation.
4. **5-Dimension Feature Preprocessing:** Normalizes Semantic expertise, Geographical suitability ($1 - d/R$), Customer rating quality (Bayesian smoothing with neutral prior), Service-specific experience ($\min(100, Y/10 \times 100)$), and Historical completion performance.
5. **Cold-Start Weight Renormalization:** When completion data is globally absent during platform cold-start, the feature is disabled and remaining weights ($30\%, 25\%, 20\%, 15\%$) are dynamically renormalized to sum to $1.0$. Individual cold-start workers receive Bayesian smoothed priors rather than zero scores.
6. **Deterministic Mock AI Provider:** Implements `IRankingProvider` contract identical to the future Phase 3 FastAPI AI Service (`POST /internal/ai/matching/rank`), ensuring stable, repeatable ranking without external Machine Learning dependencies. Includes an automated rule-based fallback provider.
7. **Revision and Concurrency Protection:** Atomic run state transitions (`pending` -> `processing` -> `completed` / `failed`), bounded worker queue concurrency ($N \le 5$), prefetch throttling, and stale revision suppression ensuring older delayed executions cannot overwrite newer completed revisions.

---

## 2. Directory Structure and Modules Implemented

```
backend/apps/matching-service/
├── prisma/
│   ├── schema.prisma                                     # Updated Prisma schema (MatchRun, MatchResult, OutboxEvent, ConsumedEvent, ServiceRequestProjection)
│   ├── prisma.config.ts                                  # Prisma 7 schema configuration
│   └── migrations/
│       ├── 20261024000000_init_matching_service/         # Phase 1 initial migration
│       └── 20261025000000_add_service_request_projections/ # [NEW - Phase 2] Read-model projection migration
├── src/
│   ├── main.ts                                           # Microservice bootstrap with RabbitMQ prefetch
│   ├── matching-service.module.ts                        # Root module assembling DI container
│   ├── orchestrator/
│   │   └── matching-orchestrator.service.ts              # Core workflow coordinator
│   ├── candidates/
│   │   ├── candidate.dto.ts                              # Inter-service candidate DTOs
│   │   ├── candidate.provider.interface.ts               # ICandidateProvider DI contract
│   │   ├── user-trust-candidate.provider.ts              # Upstream HTTP/RPC client to User & Trust
│   │   └── test-candidate.adapter.ts                     # In-memory test fixture adapter
│   ├── eligibility/
│   │   ├── haversine.util.ts                             # Haversine distance & coordinate validation
│   │   ├── eligibility.types.ts                          # Hard eligibility input/output types
│   │   └── eligibility.service.ts                        # 7 mandatory binary eligibility gates
│   ├── features/
│   │   ├── bayesian-rating.util.ts                       # Bayesian rating smoothing (prior mean 4.5, C=5)
│   │   ├── feature.types.ts                              # Feature weights & normalization contracts
│   │   └── feature-builder.service.ts                    # Feature transformation & weight renormalization
│   ├── ranking/
│   │   ├── ranking.dto.ts                                # Ranking input/output contracts
│   │   ├── ranking-provider.interface.ts                 # IRankingProvider abstraction
│   │   ├── mock-ai-ranking.provider.ts                   # Deterministic Mock AI ranker
│   │   ├── rule-based-fallback.ranker.ts                 # Resilient heuristic fallback ranker
│   │   └── ranking-validator.service.ts                  # Ranking output invariant validation
│   ├── persistence/
│   │   ├── match-run.repository.ts                       # MatchRun & MatchResult transactional repo
│   │   ├── consumed-event.repository.ts                  # Transactional Inbox deduplication repo
│   │   └── matching-outbox.repository.ts                 # Outbox persistence repo
│   ├── queue/
│   │   ├── matching-job.types.ts                         # Background job payload definitions
│   │   └── matching-job-queue.service.ts                 # Bounded concurrency queue with retries & timeouts
│   ├── outbox/
│   │   └── matching-outbox-publisher.service.ts          # Scheduled & triggered Outbox event publisher
│   ├── projections/
│   │   ├── service-request-projection.dto.ts             # Projection DTOs
│   │   └── service-request-projection.service.ts         # Event-driven read model for Worker discovery
│   ├── guards/
│   │   └── internal-service.guard.ts                     # Inter-service authentication guard
│   └── controllers/
│       ├── customer-matching.controller.ts               # Customer Top 5 & Worker discovery APIs
│       ├── internal-matching.controller.ts               # Internal Top 20 & Eligibility verification APIs
│       └── dto/
│           ├── customer-recommendation-response.dto.ts
│           ├── internal-recommendation-response.dto.ts
│           ├── internal-eligibility-response.dto.ts
│           └── worker-request-discovery-response.dto.ts
└── test/
    ├── eligibility.spec.ts                               # Unit tests for Haversine & Hard Eligibility
    ├── features.spec.ts                                  # Unit tests for Bayesian rating & Normalization
    ├── ranking.spec.ts                                   # Unit tests for Mock AI, Fallback, & Validator
    ├── matching-orchestrator.spec.ts                     # Workflow integration tests
    ├── matching-event-consumer.spec.ts                   # Idempotency & consumer lifecycle tests
    ├── matching-concurrency.spec.ts                      # Bounded concurrency & timeout stress tests
    └── matching-api.spec.ts                              # REST API controller & authorization tests
```

---

## 3. Database Changes and Invariants

To support Worker matching discovery (`GET /matching/me/requests`) without querying Order Service's private database, an additive, backward-compatible migration was introduced:

- **Migration:** `20261025000000_add_service_request_projections`
- **Table:** `service_request_projections`
- **Schema:** `matching_service`

```sql
CREATE TABLE IF NOT EXISTS "service_request_projections" (
  "id" UUID NOT NULL,
  "request_code" VARCHAR(30) NOT NULL,
  "customer_user_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "description" TEXT,
  "scheduled_at" TIMESTAMPTZ(6),
  "address_text" VARCHAR(500),
  "latitude" DECIMAL(9, 6) NOT NULL,
  "longitude" DECIMAL(9, 6) NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  "matching_revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "service_request_projections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "service_request_projections_service_id_status_idx" ON "service_request_projections"("service_id", "status");
CREATE INDEX IF NOT EXISTS "service_request_projections_customer_user_id_idx" ON "service_request_projections"("customer_user_id");
```

---

## 4. Upstream Integration with User & Trust Service

In adherence to Section 8.1, the minimal necessary internal discovery endpoint and RabbitMQ RPC handler were implemented in `User & Trust Service` (`apps/user-trust-service`):
1. **REST Endpoint:** `GET /internal/v1/workers/candidates?serviceId={uuid}&latitude={dec}&longitude={dec}&customerUserId={uuid}`
2. **RabbitMQ RPC:** `@MessagePattern('workers.find-candidates')`
3. **Matching Profile Endpoint:** `GET /internal/v1/workers/:id/matching-profile`
4. **Matching Profile RPC:** `@MessagePattern('workers.get-matching-profile')`

---

## 5. Summary of Executed Verification Tests

| Test Suite | File | Tests Run | Result | Key Coverage |
|---|---|---|---|---|
| Hard Eligibility & Distance | `test/eligibility.spec.ts` | 14 | PASSED (4ms) | Haversine accuracy, coordinate validation, 7 binary gates, anti-self-matching, multi-area min distance selection |
| Feature Normalization | `test/features.spec.ts` | 9 | PASSED (3ms) | Bayesian smoothing, cold-start non-zero rating, geo score ($1 - d/R$), experience score capping at 10y, weight renormalization (sum = 1.0) |
| Ranking & Validation | `test/ranking.spec.ts` | 11 | PASSED (5ms) | Deterministic scoring, synthetic metadata flag, top 20 bounding, simulation options (timeout, error, empty), fallback ranker, output invariant validator |
| Workflow Orchestration | `test/matching-orchestrator.spec.ts` | 4 | PASSED (6ms) | Happy path, zero candidates run completion, automatic fallback activation on AI error, unrecoverable failure outbox emission |
| Consumer & Idempotency | `test/matching-event-consumer.spec.ts` | 5 | PASSED (6ms) | Published event processing, duplicate event ACK without re-queueing, revision 2 triggering, cancellation, order conversion |
| Bounded Concurrency | `test/matching-concurrency.spec.ts` | 2 | PASSED (522ms) | 20 simultaneous requests bounded to 5 active workers, 100ms timeout handling |
| REST APIs & Security | `test/matching-api.spec.ts` | 12 | PASSED (5ms) | Customer Top 5 restriction, non-owner 403, Admin override, cancelled request suppression, Worker discovery, Internal Top 20 retrieval, Order Service eligibility check |
| Schema Invariants | `test/matching-schema-validation.spec.ts` | 4 | PASSED (3ms) | Table checks, rank range [1, 20], score range [0.00, 100.00], display limit default 5 |
| Health Check | `src/health/health.controller.spec.ts` | 1 | PASSED (110ms) | Terminus database health indicator |
| Info Controller | `src/matching-service.controller.spec.ts` | 1 | PASSED (105ms) | Root status verification |
| **TOTAL** | **10 Test Files** | **63 Tests** | **ALL PASSED (0 failures)** | **Execution Duration: 876ms** |

---

## 6. Known Limitations & Blockers

1. **Order Service Business Implementation:** Order Service has not yet implemented business logic. The `service_request.published` and `service_request.matching_inputs_changed` events were verified using simulated contract events.
2. **FastAPI AI Model:** Phase 2 deliberately utilizes `MockAiRankingProvider`. No neural network embeddings or vector databases are executed in this phase.
3. **Bidding Service:** Bidding Service is not implemented. Candidate composition in the API Gateway/BFF is deferred to when Bidding Service becomes operational. Matching Service exposes the internal Top 20 endpoint prepared for this future integration.
