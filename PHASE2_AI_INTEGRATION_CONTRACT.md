# HandyGo — Phase 2 to Phase 3 AI Integration Contract
## Blueprint for Replacing Mock Ranking Provider with Real FastAPI Ranking Service

**Date:** October 2026  
**Status:** Mandatory Contract for Phase 3 Implementation  
**Intended Upstream Service:** FastAPI AI Microservice (`ai-service` on port 8000)  
**Intended Endpoint:** `POST /internal/ai/matching/rank` (or `/internal/v1/ranking/score`)

---

## 1. Context and Objective

In Phase 2, Matching Service implemented a **deterministic Mock AI Ranking Provider** (`MockAiRankingProvider`) that conforms strictly to the schema, validation rules, and error contracts planned for the production Machine Learning model.

In Phase 3, a Python FastAPI microservice will introduce:
1. Sentence Transformers embedding generation (`sentence-transformers/multilingual-e5-base`).
2. Semantic similarity vector cosine calculation.
3. LightGBM or composite weighted ranking inference.

**The core NestJS Matching Orchestrator must not be rewritten in Phase 3.**  
The transition must require only implementing an `HttpFastApiRankingProvider` implementing `IRankingProvider` and switching the dependency injection token in `matching-service.module.ts`.

---

## 2. Ranking Provider Interface Abstraction

The interface abstraction in `apps/matching-service/src/ranking/ranking-provider.interface.ts`:

```typescript
export const RANKING_PROVIDER = 'RANKING_PROVIDER';

export interface IRankingProvider {
  readonly providerType: 'mock' | 'fallback' | 'real_ai';
  readonly modelVersion: string;

  rank(request: RankingRequestDto): Promise<RankingResponseDto>;
}
```

In Phase 2:
```typescript
{
  provide: RANKING_PROVIDER,
  useClass: MockAiRankingProvider,
}
```

In Phase 3:
```typescript
{
  provide: RANKING_PROVIDER,
  useClass: FastApiAiRankingProvider,
}
```

---

## 3. Wire Format Specification

### 3.1 HTTP Request: `POST /internal/ai/matching/rank`
- **Content-Type:** `application/json`
- **Timeout Expectation:** Must respond within `5000ms` (configurable via `AI_RANKING_TIMEOUT_MS`).

#### Request Schema
```json
{
  "serviceRequestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requestRevision": 1,
  "serviceId": "srv-elec-4321-abcd",
  "requestDescription": "Sửa chữa hệ thống điện chập cháy tại nhà bếp",
  "requestLatitude": 10.772000,
  "requestLongitude": 106.698300,
  "topN": 20,
  "candidates": [
    {
      "workerUserId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "offeringTitle": "Thợ điện dân dụng",
      "offeringDescription": "Khắc phục sự cố điện, nhảy aptomat, chập cháy",
      "distanceKm": 1.45,
      "radiusKm": 10.0,
      "averageRating": 4.85,
      "ratingCount": 42,
      "experienceYears": 7,
      "historicalCompletionRate": 0.98
    }
  ]
}
```

### 3.2 HTTP Response
- **Status:** `200 OK`
- **Output Validation Rules:**
  1. `rankedWorkers` must contain only workers present in `candidates`.
  2. Zero duplicate `workerUserId` entries.
  3. `rank` must be sequential integers $1, 2, \dots, N$ where $N \le 20$.
  4. `matchingScore` must be a finite number between $0.00$ and $100.00$.
  5. `providerType` must report `'real_ai'`.

#### Response Schema
```json
{
  "modelVersion": "sentence-transformers-e5-v1.0",
  "providerType": "real_ai",
  "generatedAt": "2026-10-25T00:30:00.000Z",
  "rankedWorkers": [
    {
      "workerUserId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "rank": 1,
      "matchingScore": 94.60,
      "scoreBreakdown": {
        "semanticScore": 96.00,
        "geoScore": 85.50,
        "ratingScore": 95.00,
        "experienceScore": 70.00,
        "completionScore": 98.00
      },
      "metadata": {
        "embeddingDimension": 768,
        "inferenceDurationMs": 28
      }
    }
  ]
}
```

---

## 4. The Five Feature Dimensions and Weight Contracts

| Feature ($i$) | Dimension | Baseline Weight ($w_i$) | Raw Metric Range | Normalized Score $s_i \in [0, 100]$ |
|---|---|---|---|---|
| 1 | **Semantic Expertise** | **30%** (0.30) | Cosine similarity between request and offering text embeddings $\in [-1.0, 1.0]$ | $\max(0, \cos(\theta)) \times 100$ |
| 2 | **Geographical Suitability** | **25%** (0.25) | Haversine distance $d$ relative to area radius $R$ | $\max(0, (1 - \frac{d}{R})) \times 100$ |
| 3 | **Customer Rating Quality** | **20%** (0.20) | Bayesian smoothed rating $R_{\text{adj}} \in [1.0, 5.0]$ ($m=4.5, C=5$) | $\frac{R_{\text{adj}} - 1.0}{4.0} \times 100$ |
| 4 | **Service Experience** | **15%** (0.15) | Registered trade experience years $Y \ge 0$ | $\min(100, \frac{Y}{10} \times 100)$ (caps at 10 years) |
| 5 | **Historical Completion** | **10%** (0.10) | Completed orders / (Completed + Fault Cancelled) | $\text{Rate} \times 100$ |

### Missing Feature Policy
- If `historicalCompletionRate` is missing for all candidates, Feature 5 is excluded and weights renormalize proportionally ($w'_1 \approx 33.3\%, w'_2 \approx 27.8\%, w'_3 \approx 22.2\%, w'_4 \approx 16.7\%$).
- If an individual worker lacks history, the AI service must apply a neutral baseline prior (e.g. 80.0) rather than penalizing with 0.0.

---

## 5. Resilience & Fallback Behavior

When the FastAPI AI Service fails, times out, or returns a 5xx response:
1. NestJS Matching Service does **not** crash.
2. The orchestrator automatically falls back to `RuleBasedFallbackRanker`.
3. Output is persisted with `providerType = 'fallback'`.
4. Domain event `matching.completed` is emitted with `rankingProvider = 'fallback'`.
5. Error metrics and logs are captured for observability.

---

## 6. Checklist for Phase 3 Engineers

- [ ] Implement `POST /internal/ai/matching/rank` in FastAPI.
- [ ] Load `multilingual-e5-base` or equivalent embeddings model.
- [ ] Implement cosine similarity between `requestDescription` and `offeringTitle + ': ' + offeringDescription`.
- [ ] Validate response adheres to `RankedWorkerOutput` schema.
- [ ] In NestJS `apps/matching-service`, create `FastApiAiRankingProvider implements IRankingProvider`.
- [ ] Update `RANKING_PROVIDER` provider in `matching-service.module.ts`.
- [ ] Run `pnpm test apps/matching-service` to confirm all validation tests pass against the new provider.
