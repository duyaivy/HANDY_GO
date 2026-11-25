# AI Service Request Pricing Estimation (HG-91) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide dynamic, deterministic, and clean-currency reference price ranges (`aiRefPriceMin`, `aiRefPriceMax`) for customer booking drafts on Mobile by utilizing the in-memory `intfloat/multilingual-e5-small` embedding model in the AI Service against curated seed benchmarks and catalog base prices.

**Architecture:** 
1. **Catalog Domain:** Extend `catalog_service.services` with `base_price_min` and `base_price_max` to define baseline service boundaries.
2. **AI Inference Domain:** In Python FastAPI (`ai/app/domains/pricing`), use the pre-loaded `MultilingualE5Service` singleton to compute cosine similarity between customer request descriptions and pre-seeded service problem benchmarks, applying deterministic VND currency rounding (10,000 VND / 50,000 VND steps).
3. **Backend Orchestration:** `order-service` exposes `POST /api/v1/service-requests/estimate-price`, calls FastAPI internally with bounded timeout (2.5s) and gracefully falls back to catalog base prices if AI service is unavailable or unconfident.
4. **Mobile UX:** Mobile triggers background pre-fetching when the customer finishes entering problem details in `CustomerBookingScreen`, caching the estimated price range in `useBookingDraftStore` so that `CustomerBookingSummaryRoute` renders rounded prices instantly with zero perceived latency.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Python FastAPI, SentenceTransformers (`intfloat/multilingual-e5-small`), React Native / Expo, Zustand, Jest, Pytest.

**Spec:** [hg91-ai-pricing-brainstorming-report.md](file:///Users/apple/.local/state/magpie-agy-bridge/agy-home/antigravity-cli/brain/67de4520-7aa6-43dc-ace4-5b00c3bbfca3/hg91-ai-pricing-brainstorming-report.md)

---

## Global Constraints

- **Zero Fractional VND:** All prices returned must be integers divisible by step units (10,000 VND for amounts < 500,000 VND; 50,000 VND for amounts >= 500,000 VND; 100,000 VND for amounts >= 2,000,000 VND). Never return amounts with odd digits (e.g. `123,450đ`).
- **Strict Ordering & Minimum Spread:** `aiRefPriceMax` must strictly exceed `aiRefPriceMin` by at least 1 step unit (e.g. min 20,000 VND spread).
- **Hard Clamp Boundaries:** Estimated price range must stay within catalog floor (`base_price_min`) and ceiling (`base_price_max * 1.5`), defaulting to absolute safety bounds (50,000 VND floor, 20,000,000 VND ceiling).
- **Non-blocking Resilience:** The customer booking flow must never fail if the pricing service times out or errors. In all error/timeout cases, fallback to catalog service base prices or sensible defaults (`150,000đ - 350,000đ`).
- **Internal Security:** FastAPI `/internal/ai/pricing/estimate` must enforce the `x-internal-secret` header matching `INTERNAL_SERVICE_SECRET`.

---

## Review Focus

1. **Empty or Generic Descriptions:** When customer description is empty or generic (e.g. "cần thợ gấp"), cosine similarity is low (<0.50); engine must fall back to catalog base price range without error.
2. **Extreme/Outlier Price Inputs:** Ensure math edge cases (e.g. benchmark with 0 or negative values) are prevented via Pydantic validators and rounding guards.
3. **AI Service Downtime / Network Timeout:** If FastAPI service is down or responds > 2500ms, `order-service` aborts and returns catalog baseline with `isFallback: true`.
4. **Duplicate Quick Clicks / Race Conditions on Mobile:** Debounce or cancel pending estimate requests on mobile when the user edits problem description rapidly.
5. **Database Migration Backward Compatibility:** `base_price_min` and `base_price_max` in `catalog_service.services` must be nullable so existing queries and services never break.

---

### Task 1: Catalog Service - Base Price Columns & Baseline Seeds

**Files:**
- Modify: `backend/apps/catalog-service/prisma/schema.prisma:28-42`
- Create: `backend/apps/catalog-service/prisma/migrations/20261121000000_add_service_base_prices/migration.sql`
- Create: `backend/scripts/seed-catalog-base-prices.mjs`
- Test: `backend/apps/catalog-service/test/catalog-base-prices.spec.ts`

**Interfaces:**
- Produces in `catalog_service.services`:
  - `base_price_min`: `Decimal? @map("base_price_min") @db.Decimal(12, 2)`
  - `base_price_max`: `Decimal? @map("base_price_max") @db.Decimal(12, 2)`
- Script: `node backend/scripts/seed-catalog-base-prices.mjs` updates default base prices for known services (e.g. Sửa máy lạnh: 150,000 - 400,000; Sửa ống nước: 100,000 - 300,000).

- [x] **Step 1: Write failing test for catalog base prices**
Create `backend/apps/catalog-service/test/catalog-base-prices.spec.ts` testing that `Service` entity can store and return `basePriceMin` and `basePriceMax`.
- [x] **Step 2: Run test to verify it fails**
Run: `cd backend && pnpm --filter catalog-service test test/catalog-base-prices.spec.ts`
Expected: FAIL (field `basePriceMin` does not exist on Prisma Service model)
- [x] **Step 3: Update schema and add migration**
Edit `backend/apps/catalog-service/prisma/schema.prisma` adding `basePriceMin` and `basePriceMax`. Generate migration SQL:
`ALTER TABLE "catalog_service"."services" ADD COLUMN IF NOT EXISTS "base_price_min" DECIMAL(12,2), ADD COLUMN IF NOT EXISTS "base_price_max" DECIMAL(12,2);`
Create `backend/scripts/seed-catalog-base-prices.mjs` to update known services with clean baseline prices.
- [x] **Step 4: Run test to verify it passes**
Run: `cd backend && pnpm --filter catalog-service test test/catalog-base-prices.spec.ts`
Expected: PASS
- [x] **Step 5: Commit**
```bash
git add backend/apps/catalog-service/prisma backend/scripts/seed-catalog-base-prices.mjs backend/apps/catalog-service/test/catalog-base-prices.spec.ts
git commit -m "feat(catalog): add base price range columns to services with seed migration"
```

---

### Task 2: AI Service - Clean Currency Rounding Engine & Benchmark Data

**Files:**
- Create: `ai/app/domains/pricing/utils/rounding.py`
- Create: `ai/app/domains/pricing/data/pricing_benchmarks.json`
- Test: `ai/tests/domains/pricing/test_rounding.py`

**Interfaces:**
- Produces:
  ```python
  def round_to_clean_currency(amount: float) -> int:
      """
      Rounds amount to clean VND:
      - amount < 500,000: step = 10,000
      - 500,000 <= amount < 2,000,000: step = 50,000
      - amount >= 2,000,000: step = 100,000
      """
  def sanitize_price_range(min_price: float, max_price: float, floor: float = 50000, ceiling: float = 20000000) -> tuple[int, int]:
      """Clamps and enforces min_price < max_price with at least one step spread."""
  ```

- [x] **Step 1: Write failing unit test for clean currency rounding**
Create `ai/tests/domains/pricing/test_rounding.py` testing rounding cases:
`153250 -> 150000`, `278000 -> 280000`, `540000 -> 550000`, `2340000 -> 2300000`, and ensuring `min < max`.
- [x] **Step 2: Run test to verify it fails**
Run: `cd ai && pytest tests/domains/pricing/test_rounding.py -v`
Expected: FAIL (module not found)
- [x] **Step 3: Implement `rounding.py` and create `pricing_benchmarks.json`**
Implement rounding logic in `ai/app/domains/pricing/utils/rounding.py`.
Create `pricing_benchmarks.json` containing typical Vietnamese repair situations mapped by service keyword (e.g. Sửa máy lạnh: chảy nước, không lạnh, nghẹt gas, hư bo mạch; Sửa ống nước: rò rỉ van, vỡ ống âm tường, thay vòi sen).
- [x] **Step 4: Run test to verify it passes**
Run: `cd ai && pytest tests/domains/pricing/test_rounding.py -v`
Expected: PASS
- [x] **Step 5: Commit**
```bash
git add ai/app/domains/pricing/utils/rounding.py ai/app/domains/pricing/data/pricing_benchmarks.json ai/tests/domains/pricing/test_rounding.py
git commit -m "feat(ai-pricing): add clean currency rounding utility and seed benchmarks"
```

---

### Task 3: AI Service - Vector Matching Pricing Engine & Internal API

**Files:**
- Create: `ai/app/domains/pricing/schemas/pricing.py`
- Create: `ai/app/domains/pricing/services/pricing_engine.py`
- Create: `ai/app/domains/pricing/api/pricing.py`
- Modify: `ai/app/main.py:100-115`
- Test: `ai/tests/domains/pricing/test_pricing_engine.py`
- Test: `ai/tests/domains/pricing/test_pricing_api.py`

**Interfaces:**
- Consumes: `MultilingualE5Service.get_instance()` from `ai/app/domains/matching/services/embedding_service.py`
- Produces:
  - `POST /internal/ai/pricing/estimate`
  - Request: `{ "service_name": str, "description": str, "base_price_min": Optional[float], "base_price_max": Optional[float] }`
  - Response: `{ "status": "success", "ai_ref_price_min": int, "ai_ref_price_max": int, "matched_case": Optional[str], "confidence": float, "is_fallback": bool }`

- [x] **Step 1: Write failing unit and integration tests**
Create `ai/tests/domains/pricing/test_pricing_engine.py` and `ai/tests/domains/pricing/test_pricing_api.py` testing:
1. Normal description matching a specific benchmark case (e.g. "máy lạnh bị chảy nước ngập sàn") -> returns high confidence and clean rounded range.
2. Short/unrelated description -> returns fallback using base_price_min/max.
3. Auth header `x-internal-secret` validation (403 if invalid).
- [x] **Step 2: Run test to verify it fails**
Run: `cd ai && pytest tests/domains/pricing/test_pricing_api.py -v`
Expected: FAIL (endpoint 404 or module not found)
- [x] **Step 3: Implement `pricing_engine.py` and FastAPI router**
Implement `PricingEngineService` calculating cosine similarity against service benchmark embeddings.
Include router in `ai/app/main.py` under tag `Internal AI Pricing`.
- [x] **Step 4: Run test to verify it passes**
Run: `cd ai && pytest tests/domains/pricing/test_pricing_engine.py tests/domains/pricing/test_pricing_api.py -v`
Expected: PASS
- [x] **Step 5: Commit**
```bash
git add ai/app/domains/pricing ai/app/main.py ai/tests/domains/pricing
git commit -m "feat(ai-pricing): implement vector similarity pricing estimation endpoint"
```

---

### Task 4: Order Service - Pricing Estimation Service & HTTP Endpoint

**Files:**
- Create: `backend/apps/order-service/src/service-requests/dto/estimate-price.dto.ts`
- Create: `backend/apps/order-service/src/service-requests/services/pricing-estimator.service.ts`
- Modify: `backend/apps/order-service/src/service-requests/service-requests.controller.ts`
- Modify: `backend/apps/order-service/src/service-requests/service-requests.module.ts`
- Test: `backend/apps/order-service/src/service-requests/services/pricing-estimator.service.spec.ts`
- Test: `backend/apps/order-service/test/pricing-estimation.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `POST /api/v1/service-requests/estimate-price`
  - Request: `{ serviceId: string; description?: string }`
  - Response: `{ statusCode: number; message: string; data: { aiRefPriceMin: number; aiRefPriceMax: number; matchedReason?: string; isFallback: boolean } }`
- Fallback: If AI Service call throws or exceeds 2500ms timeout, query `catalog_service.services` for `base_price_min` and `base_price_max` (or default to 150000 - 350000 VND).

- [x] **Step 1: Write failing unit test for `PricingEstimatorService`**
Create `pricing-estimator.service.spec.ts` mocking AI Service HTTP responses (success, 500 error, and timeout) and asserting correct rounded prices and graceful fallback.
- [x] **Step 2: Run test to verify it fails**
Run: `cd backend && pnpm --filter order-service test src/service-requests/services/pricing-estimator.service.spec.ts`
Expected: FAIL
- [x] **Step 3: Implement `PricingEstimatorService` and add endpoint**
Implement service with 2500ms timeout controller, catalog baseline query, and controller route `POST /estimate-price` in `service-requests.controller.ts`.
- [x] **Step 4: Run test to verify it passes**
Run: `cd backend && pnpm --filter order-service test src/service-requests/services/pricing-estimator.service.spec.ts`
Expected: PASS
- [x] **Step 5: Commit**
```bash
git add backend/apps/order-service/src/service-requests backend/apps/order-service/test
git commit -m "feat(order-service): add pricing estimate endpoint with AI service integration and catalog fallback"
```

---

### Task 5: Mobile App - Pre-fetching, Draft Store Integration & Summary Display

**Files:**
- Modify: `mobile/src/features/orders/types/order.types.ts:45-60`
- Modify: `mobile/src/features/orders/api/orders.api.ts:30-45`
- Modify: `mobile/src/features/orders/stores/use-booking-draft-store.ts:10-55`
- Modify: `mobile/src/features/orders/customer/screens/customer-booking-screen.tsx:210-245`
- Modify: `mobile/src/app/customer/booking/summary.tsx:375-392`
- Test: `mobile/src/features/orders/__tests__/pricing-estimation-store.test.ts`
- Test: `mobile/src/app/customer/booking/__tests__/customer-booking-summary.test.tsx`

**Interfaces:**
- Produces:
  - `OrdersApi.estimatePrice(payload: { serviceId: string; description?: string })`
  - In `useBookingDraftStore`:
    - `isEstimatingPrice: boolean`
    - `priceEstimateReason: string | null`
    - `fetchEstimatedPrice: (serviceId: string, description?: string) => Promise<void>`
  - In `CustomerBookingScreen`: fires `fetchEstimatedPrice` in background when customer taps "Tiếp tục" or pauses typing description (debounce 800ms).
  - In `CustomerBookingSummaryRoute`: renders estimated price range with optional `priceEstimateReason` tag, without blocking the submit button.

- [x] **Step 1: Write failing unit test for `useBookingDraftStore` price estimation**
Create `mobile/src/features/orders/__tests__/pricing-estimation-store.test.ts` testing:
1. `fetchEstimatedPrice` calls `OrdersApi.estimatePrice` and updates `aiRefPriceMin` and `aiRefPriceMax`.
2. Safe fallback when API throws (preserves valid min/max).
- [x] **Step 2: Run test to verify it fails**
Run: `cd mobile && pnpm test src/features/orders/__tests__/pricing-estimation-store.test.ts`
Expected: FAIL
- [x] **Step 3: Implement mobile store action and UI integration**
Add `fetchEstimatedPrice` in `useBookingDraftStore`.
Call `fetchEstimatedPrice` on step transitions in `customer-booking-screen.tsx`.
Update `summary.tsx` to display formatted clean numbers and reason pill.
- [x] **Step 4: Run test to verify it passes**
Run: `cd mobile && pnpm test src/features/orders/__tests__/pricing-estimation-store.test.ts`
Run: `cd mobile && pnpm test src/app/customer/booking/__tests__/customer-booking-summary.test.tsx`
Expected: PASS
- [x] **Step 5: Commit**
```bash
git add mobile/src/features/orders mobile/src/app/customer/booking
git commit -m "feat(mobile): integrate dynamic AI pricing estimation into booking draft flow"
```

---

### Task 6: End-to-End Verification & Sanity Checks

**Files:**
- Test: `backend/scripts/test-order-service-e2e.mjs`
- Test: `ai/tests/domains/pricing/test_pricing_api.py`

- [x] **Step 1: Run AI service test suite**
Run: `cd ai && pytest tests/domains/pricing/ -v`
Expected: All pricing tests PASS.
- [x] **Step 2: Run backend order-service test suite**
Run: `cd backend && pnpm --filter order-service test`
Expected: All order-service tests PASS.
- [x] **Step 3: Run mobile test suite**
Run: `cd mobile && pnpm test src/features/orders/`
Expected: All mobile orders and booking tests PASS.
