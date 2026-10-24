# HandyGo — Database Gap Analysis Report

**Date:** October 2026  
**Auditor:** Senior Backend Engineer & Software Architect  
**Scope:** Comparative Analysis between Reference DBMLs, Pre-existing Codebase State, and Final Implemented Database Schemas.

---

## 1. Overview of Comparative Scope

This document details the exact gaps discovered across the three service databases relevant to AI Matching:
1. `user_trust_service` (User & Trust Service)
2. `order_service` (Order Service)
3. `matching_service` (Matching Service)

The gap analysis evaluates:
- **Reference DBML:** Intended target architecture from `handygo_user_trust_service.dbml`, `handygo_order_service.dbml`, and `handygo_matching_service.dbml`.
- **Pre-existing Codebase:** Schemas, models, and migrations existing prior to Phase 1.
- **Implemented Schema:** Final production-ready Prisma schema and SQL migrations created in Phase 1.

---

## 2. User & Trust Service (`user_trust_service`)

### 2.1 Table-by-Table Comparison

| Table Name | DBML Reference | Pre-existing Codebase | Final Implemented State | Gap Analysis & Resolution |
|---|---|---|---|---|
| `users` | Defined | Implemented (Migration `20260930`) | Preserved unchanged | Matches DBML specification exactly. |
| `customer_profiles` | Defined | Implemented (Migration `20260930`) | Preserved unchanged | Matches DBML specification exactly. |
| `worker_profiles` | Defined | Implemented (Migration `20260930`) | Updated relation `serviceAreas` | Matches DBML specification. Added relation to `worker_service_areas`. |
| `user_bank_accounts` | Defined | Implemented (Migration `20260930`) | Preserved unchanged | Matches DBML specification. |
| `worker_service_offerings` | Defined | Implemented (Migration `20260930`) | Preserved unchanged | Matches DBML specification. Unique constraint `(worker_profile_id, service_id)` exists. |
| `worker_service_areas` | Missing in DBML | **MISSING** | **CREATED** (Migration `20261024000000_add_worker_service_areas`) | **Critical Gap Resolved:** Workers had no way to define their geographical work radius. Added table with coordinates, radius, and check constraints. |
| `kyc_cases` | Defined | Implemented (Migration `20260930`, updated `20261021`) | Preserved unchanged | Extended with operational async OCR fields from HG-23. |
| `worker_reviews` | Defined | Implemented (Migration `20260930`) | Preserved unchanged | Unique index on `order_id` preserved. |
| `complaints` | Defined | Implemented (Migration `20260930`) | Preserved unchanged | Matches DBML specification. |
| `complaint_evidence` | Defined | Implemented (Migration `20260930`) | Preserved unchanged | Matches DBML specification. |
| `ai_analysis_jobs` | Operational | Implemented (Migration `20261021`) | Preserved unchanged | Operational table for KYC OCR asynchronous processing. |
| `kyc_review_histories` | Operational | Implemented (Migration `20261021`) | Preserved unchanged | Operational table for KYC review audit log. |
| `event_inbox` | Operational | Implemented | Preserved unchanged | Operational table for inbound idempotency (`user.registered`). |
| `outbox_events` | Operational | Implemented (Migration `20261021`) | Preserved unchanged | Operational table for transactional outbox. |

### 2.2 Detailed Gap: `worker_service_areas` Table
- **Reason for Addition:** Matching requires checking whether a Service Request's geographical point `(latitude, longitude)` falls within a Worker's accepted operational radius.
- **Implemented Structure:**
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `worker_profile_id UUID NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE`
  - `latitude DECIMAL(9,6) NOT NULL CHECK (latitude >= -90.000000 AND latitude <= 90.000000)`
  - `longitude DECIMAL(9,6) NOT NULL CHECK (longitude >= -180.000000 AND longitude <= 180.000000)`
  - `radius_km DECIMAL(6,2) NOT NULL CHECK (radius_km > 0 AND radius_km <= 500.00)`
  - `is_active BOOLEAN NOT NULL DEFAULT true`
  - `created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP`
  - `updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP`
- **Indexes:**
  - `(worker_profile_id, is_active)`: Supports rapid candidate lookup by active worker.
  - `(latitude, longitude)`: Supports spatial proximity filtering.

---

## 3. Order Service (`order_service`)

### 3.1 Table-by-Table Comparison

| Table Name | DBML Reference | Pre-existing Codebase | Final Implemented State | Gap Analysis & Resolution |
|---|---|---|---|---|
| `service_requests` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_order_service`) | Complete schema created with `matching_revision`, price range checks, coordinates checks, and indexes. |
| `request_media` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_order_service`) | Media attachment table referencing `service_requests(id)` with CASCADE delete. |
| `booking_proposals` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_order_service`) | Proposal table with revision chaining (`supersedes_proposal_id`) and selection source XOR check. |
| `orders` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_order_service`) | Official order agreement table with immutable location snapshot, price checks, and 1-to-1 proposal reference. |
| `order_status_history` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_order_service`) | State machine transition audit log referencing `orders(id)`. |
| `outbox_events` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_order_service`) | Transactional outbox for publishing `service_request.published`, `order.created`, etc. |
| `consumed_events` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_order_service`) | Inbound idempotency tracking for payment and external events. |

### 3.2 Constraint & Business Invariant Alignment
- **Selection Source XOR Guard:**
  Enforced via database CHECK constraint on `booking_proposals` and `orders`:
  ```sql
  CHECK (
    (selection_source = 'bid' AND source_bid_id IS NOT NULL AND source_match_result_id IS NULL) OR
    (selection_source = 'recommendation' AND source_match_result_id IS NOT NULL AND source_bid_id IS NULL)
  )
  ```
- **Revision Conventions:**
  - `version`: Non-negative integer (`CHECK ("version" >= 0)`).
  - `matching_revision`: Non-negative integer (`CHECK ("matching_revision" >= 0)`). Default is `0` for draft requests. Initialized to `1` upon publication.

---

## 4. Matching Service (`matching_service`)

### 4.1 Table-by-Table Comparison

| Table Name | DBML Reference | Pre-existing Codebase | Final Implemented State | Gap Analysis & Resolution |
|---|---|---|---|---|
| `match_runs` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_matching_service`) | Supports historical runs, revision tracking, display limit default = 5, candidate & result counters. |
| `match_results` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_matching_service`) | Stores ranked workers (rank 1..20), normalized score (0..100), score breakdown JSONB. |
| `outbox_events` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_matching_service`) | Outbox table for `matching.completed` or `matching.failed` domain events. |
| `consumed_events` | Defined | **MISSING** | **CREATED** (Migration `20261024000000_init_matching_service`) | Inbound idempotency table for incoming `service_request.published` and `service_request.updated`. |

### 4.2 Key Adjustments Made During Implementation
1. **Display Limit Adjustment:**
   - Previous DBML draft: `display_limit DEFAULT 3`.
   - Updated requirement: API displays **Top 5** recommended workers.
   - Final state: `display_limit DEFAULT 5`.
2. **Top 20 Result Persistence:**
   - Rank boundary constraint: `CHECK ("rank" > 0 AND "rank" <= 20)`.
   - Score boundary constraint: `CHECK ("matching_score" >= 0.00 AND "matching_score" <= 100.00)`.
3. **Execution History Preservation:**
   - Unique constraint: `UNIQUE ("service_request_id", "request_revision", "run_number")`.
   - If run 1 fails, a retry creates `run_number = 2` without overwriting the historical audit record of run 1.

---

## 5. Cross-Service Identifier Mapping Reference

Strict microservice database boundaries dictate that no foreign keys cross service boundaries. The following table defines all logical links:

| Source Service | Source Field | Target Service | Target Table & Field | Semantics |
|---|---|---|---|---|
| `order_service` | `service_requests.customer_user_id` | `user_trust_service` | `users.id` | Customer creating the request |
| `order_service` | `service_requests.service_id` | `catalog_service` | `services.id` | Standard service requested |
| `order_service` | `booking_proposals.customer_user_id` | `user_trust_service` | `users.id` | Customer proposing agreement |
| `order_service` | `booking_proposals.worker_user_id` | `user_trust_service` | `users.id` | Worker recipient of proposal |
| `order_service` | `booking_proposals.source_bid_id` | `bidding_service` | `bids.id` | Originating bid (when source=bid) |
| `order_service` | `booking_proposals.source_match_result_id`| `matching_service` | `match_results.id` | Originating match result (when source=recommendation) |
| `order_service` | `orders.customer_user_id` | `user_trust_service` | `users.id` | Customer in finalized order |
| `order_service` | `orders.worker_user_id` | `user_trust_service` | `users.id` | Worker in finalized order |
| `order_service` | `orders.service_id` | `catalog_service` | `services.id` | Service in finalized order |
| `matching_service` | `match_runs.service_request_id` | `order_service` | `service_requests.id` | Request being evaluated |
| `matching_service` | `match_runs.service_id` | `catalog_service` | `services.id` | Service category being matched |
| `matching_service` | `match_results.worker_user_id` | `user_trust_service` | `users.id` | Recommended Worker |
| `user_trust_service`| `worker_service_offerings.service_id` | `catalog_service` | `services.id` | Service offered by Worker |
| `user_trust_service`| `worker_reviews.order_id` | `order_service` | `orders.id` | Completed Order evaluated |
