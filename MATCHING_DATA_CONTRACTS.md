# HandyGo — Matching Data Contracts & Feature Requirements

**Date:** October 2026  
**Auditor:** Senior Backend Engineer & Software Architect  
**Status:** Architectural Specification for Phase 2 Implementation

---

## 1. Microservice Data Ownership Boundaries

In adherence to strict domain-driven microservice isolation:
- No database joins across service boundaries are permitted.
- Matching Service has no direct read/write access to PostgreSQL tables owned by User & Trust Service or Order Service.
- All inter-service identifiers are logical UUID references.
- Future cross-service data retrieval must use internal HTTP/gRPC contracts, domain events, or cached read models.

```
+-----------------------------------------------------------------------------------+
|                              MICROSERVICE OWNERSHIP                               |
+--------------------------+--------------------------+-----------------------------+
|   User & Trust Service   |      Order Service       |      Matching Service       |
| (user_trust_service)     | (order_service)          | (matching_service)          |
+--------------------------+--------------------------+-----------------------------+
| • users                  | • service_requests       | • match_runs                |
| • customer_profiles      | • request_media          | • match_results             |
| • worker_profiles        | • booking_proposals      | • outbox_events             |
| • worker_service_areas   | • orders                 | • consumed_events           |
| • worker_service_offrings| • order_status_history   |                             |
| • user_bank_accounts     | • outbox_events          |                             |
| • kyc_cases              | • consumed_events        |                             |
| • worker_reviews         |                          |                             |
| • complaints             |                          |                             |
+--------------------------+--------------------------+-----------------------------+
```

---

## 2. Cross-Service Identifier Mapping Reference

Understanding the distinct roles of `users.id`, `worker_profiles.id`, and `worker_user_id` is critical to prevent mismatched entity relations:

```
[ User & Trust Service ]
     users.id  <======== 1 : 1 ========>  worker_profiles.id (user_id = users.id)
        ^                                         |
        |                                         | 1 : N
        |                                         v
        |                           worker_service_offerings
        |                           worker_service_areas
        |
        | (logical reference)
        v
[ Order Service ]
     orders.worker_user_id (references users.id)
     booking_proposals.worker_user_id (references users.id)

[ Matching Service ]
     match_results.worker_user_id (references users.id)
```

- `users.id`: The primary identity of the account throughout HandyGo.
- `worker_profiles.id`: Internal profile ID within User & Trust Service.
- `worker_service_areas.worker_profile_id`: References `worker_profiles.id`.
- `worker_service_offerings.worker_profile_id`: References `worker_profiles.id`.
- `match_results.worker_user_id`: Stores `users.id` so that downstream services (BFF, Gateway, Chat, Booking Proposal) can address the worker user directly without resolving internal profile IDs.

---

## 3. Hard Worker Eligibility Filtering (Pre-Scoring)

Before any AI scoring or ranking is performed, candidate Workers must satisfy **mandatory eligibility conditions**. Hard conditions are binary gates; an AI score **cannot** override an eligibility failure.

| Eligibility Rule | Source Microservice & Table | Condition Required | Rationale |
|---|---|---|---|
| **Active User Account** | `user_trust_service.users` | `status = 'active'` | Suspended or deleted users cannot be recommended. |
| **Verified Worker Profile** | `user_trust_service.worker_profiles` | `status = 'verified'` | Only identity-verified workers may receive customer leads. |
| **Approved KYC** | `user_trust_service.kyc_cases` | `status = 'approved'` | Mandatory legal and safety compliance. |
| **Active Service Offering** | `user_trust_service.worker_service_offerings` | `service_id = request.service_id AND is_active = true` | Worker must explicitly offer the requested service category. |
| **Geographical Area Match** | `user_trust_service.worker_service_areas` | `is_active = true AND haversine_distance(request.point, area.center) <= area.radius_km` | Job site must fall within at least one active registered service area of the worker. |
| **Anti-Self-Matching** | Order & User context | `worker_user_id != request.customer_user_id` | A customer cannot be recommended to perform their own service request. |

Workers failing any of these conditions are discarded immediately from the candidate pool and never sent to AI ranking.

---

## 4. The Five AI Ranking Features & Data Sources

The ranking phase evaluates eligible workers across exactly five feature dimensions:

| Feature Dimension | Baseline Weight | Data Source Microservice | Specific Database Fields |
|---|---|---|---|
| **1. Semantic Expertise** | 30% | `order_service` + `user_trust_service` | `service_requests.description`<br>`worker_service_offerings.title`<br>`worker_service_offerings.description` |
| **2. Geographical Suitability** | 25% | `order_service` + `user_trust_service` | `service_requests.latitude`<br>`service_requests.longitude`<br>`worker_service_areas.latitude`<br>`worker_service_areas.longitude`<br>`worker_service_areas.radius_km` |
| **3. Customer Rating Quality** | 20% | `user_trust_service` | `worker_profiles.average_rating` (0.00 to 5.00)<br>`worker_profiles.rating_count` |
| **4. Service-Specific Experience**| 15% | `user_trust_service` + `order_service` | `worker_service_offerings.experience_years`<br>Historical completed orders for matching `service_id` |
| **5. Completion Performance** | 10% | `order_service` | `orders.status`<br>`order_status_history.from_status` / `to_status`<br>`orders.cancelled_at`<br>`orders.cancel_reason` |

---

## 5. Scope Boundaries: Explicit Exclusion of Time Availability

The following factors are **explicitly excluded** from the HandyGo Matching Service:
- Real-time GPS location tracking or live worker breadcrumbs.
- Worker calendar availability or schedule booking conflict detection.
- Job duration estimation or calendar gap filling.
- On-time arrival rate (`onTimeRate`).
- Real-time traffic or dynamic travel time estimates.

**Architectural Rationale:** Service Requests on HandyGo represent open marketplace requests. Specific timing and execution hours are finalized during bilateral proposal negotiation between Customer and Worker (via `booking_proposals.scheduled_at`). Injecting calendar locking into recommendation introduces severe race conditions, stale locks, and unnecessary distributed transaction complexity.

---

## 6. Missing Data and Cold-Start Strategies

In early stages or for newly onboarded Workers, complete historical data may not exist:

1. **Global Absence of Order History (Platform Cold-Start):**
   - When Order Service has no completed orders in production, Feature 5 (Completion Performance) is globally uncomputable.
   - **Strategy:** Temporarily omit Feature 5 and renormalize the remaining 4 feature weights proportionally:
     - Semantic Expertise: $30 / 90 \approx 33.3\%$
     - Geographical Suitability: $25 / 90 \approx 27.8\%$
     - Rating Quality: $20 / 90 \approx 22.2\%$
     - Service Experience: $15 / 90 \approx 16.7\%$
2. **Individual Worker Cold-Start (New Worker):**
   - When a newly verified Worker has `rating_count = 0`:
     - Do not assign 0.0 rating. Use Bayesian prior smoothing:
       $$R_{adjusted} = \frac{C \cdot m + \sum \text{ratings}}{C + n}$$
       where $m$ is platform prior mean (e.g. 4.5) and $C$ is prior weight constant (e.g. 5).
   - When experience years is null or zero: use neutral default score based on verified KYC baseline.
3. **No Production Data Fabrication:**
   - Under no circumstances should test mocks or synthetic data be injected into production feature pipelines.

---

## 7. Proposed Internal API Contract (For Phase 2 Implementation)

### 7.1 Batch Worker Candidate Extraction Contract
*Exposed by User & Trust Service for Matching Service:*

```typescript
// GET /internal/v1/workers/candidates?serviceId={uuid}&lat={dec}&lon={dec}
export interface WorkerCandidateDto {
  workerUserId: string;        // users.id
  workerProfileId: string;     // worker_profiles.id
  offeringTitle: string;
  offeringDescription: string;
  experienceYears: number;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  distanceKm: number;
  averageRating: number;
  ratingCount: number;
  completedOrderCount: number;
}
```

### 7.2 AI Ranking Service Request Contract
*Invoked by Matching Service against FastAPI AI Service:*

```typescript
// POST /internal/v1/ranking/score
export interface AiRankingRequestPayload {
  serviceRequestId: string;
  requestRevision: number;
  serviceId: string;
  requestDescription: string;
  requestLatitude: number;
  requestLongitude: number;
  candidates: Array<{
    workerUserId: string;
    offeringTitle: string;
    offeringDescription: string;
    experienceYears: number;
    distanceKm: number;
    radiusKm: number;
    averageRating: number;
    ratingCount: number;
    historicalCompletionRate?: number;
  }>;
}

export interface AiRankingResponsePayload {
  modelVersion: string;
  rankedWorkers: Array<{
    workerUserId: string;
    rank: number;              // 1 to 20
    matchingScore: number;     // 0.00 to 100.00
    scoreBreakdown: {
      semanticScore: number;
      geoScore: number;
      ratingScore: number;
      experienceScore: number;
      completionScore: number;
    };
  }>;
}
```
