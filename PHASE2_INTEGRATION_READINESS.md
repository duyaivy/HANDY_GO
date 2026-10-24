# HandyGo — Phase 2 Integration Readiness Report

**Date:** October 2026  
**Status:** Architecture Integration Assessment  
**Target:** Monorepo Microservices & External Services

---

## 1. Upstream & Downstream Integration Status Matrix

| Microservice | Integration Status | Implemented Mechanism | Available Interfaces | Missing / Blocked Interfaces | Phase 2 Solution | Follow-up Required in Later Phases |
|---|---|---|---|---|---|---|
| **User & Trust Service** | `IMPLEMENTED & VERIFIED` | Internal HTTP REST & RabbitMQ RPC | `GET /internal/v1/workers/candidates`<br>`GET /internal/v1/workers/:id/matching-profile`<br>`@MessagePattern('workers.find-candidates')` | None for Phase 2 | Added minimal internal endpoints in `UserTrustServiceController` adhering to schema boundaries | None. Ready for production. |
| **Order Service** | `PARTIALLY IMPLEMENTED (BLOCKED BY UPSTREAM)` | Event Contracts + Test Adapters + Read-Model Projection | Event schema contracts defined (`service_request.published`, `service_request.matching_inputs_changed`, `service_request.cancelled`, `service_request.converted_to_order`) | Order business logic and state machine are not yet implemented in `order-service` | Created event contracts, inbox idempotency, and local `service_request_projections` table | Once Order Service implements business logic, wire real event emission from Order's transactional outbox. |
| **Catalog Service** | `VERIFIED` | Logical UUID reference | `services.id` validated against catalog schema | None | Reused existing logical UUID references | None. |
| **Bidding Service** | `BLOCKED BY UPSTREAM (BY DESIGN INDEPENDENT)` | Architectural Separation | None (Bidding logic intentionally not implemented yet) | Bidding quotation lifecycle and worker quotes | Matching operates completely independently. No dependency on Bidding exists. | Gateway/BFF will compose Bids + Recommendations in a future phase. |
| **API Gateway / BFF** | `READY FOR COMPOSITION` | Reverse Proxy & Internal API | Gateway proxy routes configured (`/api/v1/matching`). Matching exposes internal Top 20 API (`GET /internal/matching/requests/:id/recommendations`) | Gateway candidate composition endpoint (`GET /api/v1/requests/:id/candidates`) deferred until Bidding Service is ready | Matching provides independent recommendation API (Top 5) and internal Top 20 API | Implement Gateway deduplication algorithm once Bidding Service is built. |
| **Notification Service** | `VERIFIED COMPATIBLE` | Outbox Event Emission | `matching.completed`, `matching.failed`, `matching.started` published via RabbitMQ | Downstream consumer in notification-service | Outbox publisher emits to `handy-go.events` topic exchange | Notification Service can subscribe to `matching.completed` to notify workers or customers. |
| **FastAPI AI Service** | `READY FOR PHASE 3` | Mock AI Provider conforming to production schema | Interface `IRankingProvider`, deterministic mock scoring, score breakdown, simulation options | Real Sentence Transformers neural network execution (Phase 3 scope) | `MockAiRankingProvider` and `RuleBasedFallbackRanker` | In Phase 3, implement `FastApiAiRankingProvider` calling `POST /internal/ai/matching/rank`. |

---

## 2. Important Architectural Statement: Matching & Bidding Independence

1. **Independent Workflows:**
   - **Matching Service** and **Bidding Service** operate as independent, decoupled microservices.
   - Matching automatically executes when a Service Request is published to recommend suitable Workers.
   - Bidding allows Workers to actively submit price quotations.
   - Matching **never** waits for Bidding to finish.
   - Matching **must not** be treated as a fallback for unsuccessful Bidding.
2. **Zero Recalculation on Bids:**
   - When a Worker submits or updates a Bid, Matching Service **does not** recalculate or re-run AI inference.
3. **Gateway / BFF Candidate Composition (Future Phase):**
   - The future Gateway endpoint `GET /api/v1/requests/:requestId/candidates` will combine both datasets:
     1. Display valid **Bids** first (Workers who actively quoted).
     2. Deduplicate: exclude Workers already shown in Bids from the recommendation list.
     3. Refill the **Recommendations** section up to Top 5 using candidates from Matching's internal Top 20 interface.
   - Matching Service does not manage Bid state, does not store quotes, and does not duplicate Bidding Service responsibilities.

---

## 3. Classification of Implemented Components

- `IMPLEMENTED & VERIFIED`:
  - Matching Module Architecture (`apps/matching-service`).
  - Worker Candidate Discovery (`UserTrustCandidateProvider`).
  - Hard Eligibility Filtering (`EligibilityService`).
  - Geographic Haversine Calculation (`haversine.util.ts`).
  - 5-Dimension Feature Preprocessing & Bayesian Smoothing (`FeatureBuilderService`).
  - Deterministic Mock AI Ranking Provider (`MockAiRankingProvider`).
  - Fallback Ranker (`RuleBasedFallbackRanker`).
  - Output Invariant Validation (`RankingValidatorService`).
  - Transactional Result Persistence (Top 20) & Revision Management (`MatchRunRepository`).
  - Transactional Inbox Idempotency (`ConsumedEventRepository`).
  - Transactional Outbox Publishing (`MatchingOutboxPublisherService`).
  - Bounded Concurrency Queue with Retries & Timeouts (`MatchingJobQueueService`).
  - Customer Recommendations API (`CustomerMatchingController`).
  - Worker Job Discovery API (`CustomerMatchingController`).
  - Internal Recommendations API (`InternalMatchingController`).
  - Internal Matching Eligibility API (`InternalMatchingController`).
  - Swagger/OpenAPI Documentation.

- `SIMULATED FOR TEST ISOLATION`:
  - Upstream `order-service` event emission (simulated using event contracts).
  - Upstream `user-trust-service` offline mode (covered by `TestCandidateAdapter`).

- `DEFERRED TO FUTURE PHASES (EXPLICIT SCOPE)`:
  - Real Sentence Transformers and LightGBM model inference (Phase 3).
  - Gateway/BFF candidate composition endpoint (Phase 4 / BFF implementation).
  - Real-time GPS tracking or Worker schedule calendars (Explicitly excluded by architecture).
