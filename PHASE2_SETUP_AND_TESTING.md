# HandyGo — Phase 2 Setup and Testing Guide

**Date:** October 2026  
**Audience:** Backend Engineers, QA Engineers, DevOps  
**Target:** Local Development, Docker, CI/CD

---

## 1. Environment Configuration

Create or update `.env` in `backend/` with the following variables:

```ini
# Core Service Settings
PORT=3006
API_PREFIX=api/v1
SERVICE_NAME=matching-service
NODE_ENV=development

# Database Connections (PostgreSQL schema isolation)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/handygo?schema=matching_service
DATABASE_URL_MATCHING=postgresql://postgres:postgres@localhost:5432/handygo?schema=matching_service
DATABASE_URL_USER_TRUST=postgresql://postgres:postgres@localhost:5432/handygo?schema=user_trust_service
DATABASE_URL_ORDER=postgresql://postgres:postgres@localhost:5432/handygo?schema=order_service

# RabbitMQ Event Bus
RABBITMQ_URL=amqp://handygo:handygo@localhost:5672
RABBITMQ_EXCHANGE=handy-go.events

# Matching Processing & Concurrency Limits
MATCHING_CONSUMER_PREFETCH=10
MATCHING_WORKER_CONCURRENCY=5
MATCHING_JOB_TIMEOUT_MS=30000
MATCHING_MAX_RETRY_ATTEMPTS=5
MATCHING_RESULT_LIMIT=20
MATCHING_DISPLAY_LIMIT=5

# Upstream Service URLs
USER_TRUST_SERVICE_URL=http://localhost:3002
INTERNAL_SERVICE_SECRET=handygo-internal-super-secret-key-2026

# JWT Secret for Local Token Verification
JWT_SECRET=handygo-dev-jwt-secret-key-for-local-development
```

---

## 2. Database Migrations

Generate Prisma client and apply the additive migration:

```bash
cd backend

# Generate Prisma clients for all services
pnpm run prisma:generate

# Deploy Matching Service migrations
pnpm run prisma:migrate:matching
```

Migration applied:
`backend/apps/matching-service/prisma/migrations/20261025000000_add_service_request_projections/migration.sql`

---

## 3. Starting Services

### 3.1 Start Matching Service (HTTP & RabbitMQ Consumer)
```bash
cd backend
pnpm exec nest start matching-service --watch
```
Output confirms:
- RabbitMQ microservice connected to exchange `handy-go.events` and queue `matching-service`.
- In-process background queue worker initialized with max concurrency 5.
- Outbox publisher polling every 3 seconds.
- HTTP server listening on port `3006`.

### 3.2 Access Swagger UI
Open your browser to:
`http://localhost:3006/docs`

---

## 4. Running Automated Tests

### 4.1 Run All Matching Service Tests
```bash
cd backend
pnpm test apps/matching-service
```
Executes all 10 test suites (63 tests) covering:
- Unit tests: Haversine distance, coordinate validation, 7 Hard Eligibility rules.
- Feature tests: Bayesian rating smoothing, cold-start priors, feature weights normalization.
- Ranking tests: Deterministic Mock AI ranker, fallback ranker, output validator.
- Consumer tests: RabbitMQ event handling, inbox idempotency, cancellation, order conversion.
- Concurrency tests: Bounded concurrency queue (20 jobs), timeout handling.
- API tests: Customer Top 5, Worker discovery, Internal Top 20, Order Service eligibility check.

### 4.2 Typecheck Monorepo
```bash
cd backend
pnpm run typecheck
```

---

## 5. Simulating Workflow Events via cURL / CLI

### 5.1 Query Recommendations (Customer)
```bash
curl -X GET "http://localhost:3006/api/v1/matching/requests/f47ac10b-58cc-4372-a567-0e02b2c3d479/recommendations" \
  -H "Authorization: Bearer <CUSTOMER_JWT_TOKEN>"
```

### 5.2 Query Top 20 for Gateway/BFF (Internal)
```bash
curl -X GET "http://localhost:3006/api/v1/internal/matching/requests/f47ac10b-58cc-4372-a567-0e02b2c3d479/recommendations" \
  -H "x-internal-secret: handygo-internal-super-secret-key-2026"
```

### 5.3 Verify Result Eligibility for Order Service (Internal)
```bash
curl -X GET "http://localhost:3006/api/v1/internal/matching/results/d3b07384-d113-4c91-9e8a-02d6b38c227f/eligibility?serviceRequestId=f47ac10b-58cc-4372-a567-0e02b2c3d479&workerUserId=a1b2c3d4-e5f6-7890-abcd-ef1234567890" \
  -H "x-internal-secret: handygo-internal-super-secret-key-2026"
```

### 5.4 Worker Job Discovery
```bash
curl -X GET "http://localhost:3006/api/v1/matching/me/requests?page=1&limit=10" \
  -H "Authorization: Bearer <WORKER_JWT_TOKEN>"
```
