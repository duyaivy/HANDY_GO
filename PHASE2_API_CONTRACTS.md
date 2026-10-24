# HandyGo — Phase 2 Matching Service API Contracts

**Date:** October 2026  
**Status:** Authoritative API Specification  
**Base Path:** `/api/v1` (via API Gateway on port 3000 or directly on Matching Service port 3006)

---

## 1. Authentication & Security Model

| API Category | Authentication Mechanism | Allowed Roles / Callers | Headers Required |
|---|---|---|---|
| **Customer Recommendation API** | Bearer JWT | `Customer` (request owner) or `Admin` | `Authorization: Bearer <token>` |
| **Worker Matching Requests API** | Bearer JWT | `Worker` (verified KYC status) | `Authorization: Bearer <token>` |
| **Internal Top 20 Recommendations API** | Service Secret or Admin Bearer | API Gateway / BFF or `Admin` | `x-internal-secret: <INTERNAL_SERVICE_SECRET>` |
| **Internal Matching Eligibility API** | Service Secret or Admin Bearer | Order Service or `Admin` | `x-internal-secret: <INTERNAL_SERVICE_SECRET>` |

---

## 2. API Endpoints Specification

### 2.1 Customer Recommendations API

#### `GET /api/v1/matching/requests/:id/recommendations`
Retrieves the Top 5 recommended Workers for a specified Service Request.

- **URL Parameter:** `id` (UUID, required) — Service Request ID.
- **Authorization:** Only the Customer who created the request, or an Admin.

#### Success Response (200 OK)
```json
{
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requestRevision": 1,
  "status": "completed",
  "displayLimit": 5,
  "recommendations": [
    {
      "matchResultId": "d3b07384-d113-4c91-9e8a-02d6b38c227f",
      "workerUserId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "rank": 1,
      "matchingScore": 92.50
    },
    {
      "matchResultId": "c4a16273-c002-3b80-8d79-01c5a27b116e",
      "workerUserId": "b2c3d4e5-f6a7-8901-bcde-fa2345678901",
      "rank": 2,
      "matchingScore": 88.20
    }
  ],
  "generatedAt": "2026-10-25T00:30:00.000Z",
  "modelVersion": "mock-ai-v1.0"
}
```

#### Status Values
- `pending`: Work has been accepted and is waiting in the background queue.
- `processing`: Workers are currently being evaluated and ranked.
- `completed`: Results have been persisted and are available.
- `failed`: Processing encountered a terminal failure according to the retry policy.
- `cancelled` / `converted_to_order`: The request is closed. `recommendations` array is empty.

#### Error Responses
- `401 Unauthorized`: Missing or expired Bearer JWT.
- `403 Forbidden`: Authenticated user is not the owner of the request and does not possess the `Admin` role.

---

### 2.2 Internal Top 20 Recommendations API

#### `GET /api/v1/internal/matching/requests/:id/recommendations`
Used exclusively by the API Gateway/BFF layer to fetch up to Top 20 ranked candidates for candidate deduplication against incoming active Bids.

- **URL Parameter:** `id` (UUID, required) — Service Request ID.
- **Header:** `x-internal-secret: <INTERNAL_SERVICE_SECRET>`

#### Success Response (200 OK)
```json
{
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requestRevision": 1,
  "status": "completed",
  "candidateCount": 18,
  "resultCount": 18,
  "recommendations": [
    {
      "matchResultId": "d3b07384-d113-4c91-9e8a-02d6b38c227f",
      "workerUserId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "rank": 1,
      "matchingScore": 92.50,
      "scoreBreakdown": {
        "semanticScore": 88.50,
        "geoScore": 95.00,
        "ratingScore": 92.00,
        "experienceScore": 80.00,
        "completionScore": 90.00
      }
    }
  ],
  "generatedAt": "2026-10-25T00:30:00.000Z",
  "modelVersion": "mock-ai-v1.0"
}
```

---

### 2.3 Internal Matching Eligibility Verification API

#### `GET /api/v1/internal/matching/results/:id/eligibility`
Called by Order Service prior to transactionally creating Booking Proposals or Orders from an AI recommendation result.

- **URL Parameter:** `id` (UUID, required) — `match_results.id`.
- **Query Parameters:**
  - `serviceRequestId` (UUID, optional) — Verifies the result belongs to the expected request.
  - `workerUserId` (UUID, optional) — Verifies the result belongs to the expected worker.
- **Header:** `x-internal-secret: <INTERNAL_SERVICE_SECRET>`

#### Success Response — Eligible (200 OK)
```json
{
  "matchResultId": "d3b07384-d113-4c91-9e8a-02d6b38c227f",
  "isEligible": true,
  "reason": "Kết quả đề xuất hợp lệ và sẵn sàng để tạo Booking Proposal",
  "workerUserId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "serviceRequestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requestRevision": 1,
  "matchingScore": 92.50
}
```

#### Success Response — Ineligible / Stale (200 OK)
```json
{
  "matchResultId": "d3b07384-d113-4c91-9e8a-02d6b38c227f",
  "isEligible": false,
  "reason": "Kết quả thuộc revision 1 đã bị thay thế bởi revision 2",
  "workerUserId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "serviceRequestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requestRevision": 1
}
```

---

### 2.4 Worker Matching Requests API

#### `GET /api/v1/matching/me/requests`
Allows an authenticated professional Worker to discover open Service Requests matching their registered trade services and operational service areas.

- **Query Parameters:**
  - `page` (integer, default: 1)
  - `limit` (integer, default: 10, max: 50)
- **Authorization:** `Worker` role with verified profile and approved KYC.

#### Success Response (200 OK)
```json
{
  "items": [
    {
      "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "requestCode": "REQ-20261025-001",
      "serviceId": "c1d2e3f4-5678-90ab-cdef-1234567890ab",
      "description": "Sửa đường ống nước bồn rửa chén bị rò rỉ",
      "distanceKm": 3.42,
      "scheduledAt": "2026-10-26T09:00:00.000Z",
      "addressText": "Quận 1, TP. Hồ Chí Minh",
      "createdAt": "2026-10-25T00:15:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10
}
```

---

## 3. Swagger & OpenAPI Documentation

- **Swagger UI Path:** `http://localhost:3006/docs`
- **Swagger JSON Specification:** `http://localhost:3006/docs-json`
- **API Tags:**
  - `Matching Service (Customer & Worker)`
  - `Matching Service (Internal Service-to-Service)`
  - `Health`
