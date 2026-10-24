# HandyGo — Phase 2 Matching Service Event Contracts

**Date:** October 2026  
**Status:** Authoritative Event-Driven Architecture Specification  
**Broker:** RabbitMQ (AMQP 0-9-1)  
**Topic Exchange:** `handy-go.events`  
**Service Consumer Queue:** `matching-service`  
**Dead Letter Queue (DLQ):** `handy-go.dlq`

---

## 1. AMQP Envelope Structure

All asynchronous domain events emitted and consumed adhere to the standard HandyGo `DomainEvent<T>` envelope:

```typescript
export interface DomainEvent<T> {
  eventId: string;        // UUIDv4 (deduplication identifier)
  eventVersion: number;   // Schema version (default: 1)
  occurredAt: Date;       // Timestamp of event creation
  producer: string;       // Originating microservice (e.g., 'order-service', 'matching-service')
  data: T;                // Strongly typed domain payload
}
```

---

## 2. Consumed Events

Matching Service consumes four domain events published by `order-service`:

### 2.1 `service_request.published`
- **Exchange:** `handy-go.events`
- **Routing Key:** `service_request.published`
- **Queue:** `matching-service`
- **Prefetch Count:** `10` (configurable via `MATCHING_CONSUMER_PREFETCH`)
- **Ack Mode:** Manual ACK (`noAck: false`), ACKed only after inbox commit and queue hand-off.
- **Responsibility:** Initiates the first Matching Run (`request_revision = 1, run_number = 1`) and populates the local read-model projection.

#### Payload Contract
```json
{
  "eventId": "e9b5f212-70b9-4a0f-90e1-7e3e78a4e8d1",
  "eventVersion": 1,
  "occurredAt": "2026-10-25T00:15:00.000Z",
  "producer": "order-service",
  "data": {
    "serviceRequestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "requestCode": "REQ-20261025-001",
    "customerUserId": "cust-1234-5678-90ab",
    "serviceId": "srv-elec-4321-abcd",
    "description": "Sửa chập điện cầu dao tổng gia đình",
    "scheduledAt": "2026-10-26T08:30:00.000Z",
    "addressText": "Quận 3, TP. Hồ Chí Minh",
    "latitude": 10.772000,
    "longitude": 106.698300,
    "matchingRevision": 1
  }
}
```

---

### 2.2 `service_request.matching_inputs_changed`
- **Exchange:** `handy-go.events`
- **Routing Key:** `service_request.matching_inputs_changed`
- **Queue:** `matching-service`
- **Responsibility:** Material changes to request coordinates, scope, or trade trigger a new Match Run for the incremented revision (`request_revision = N, run_number = 1`).

#### Payload Contract
```json
{
  "eventId": "d1c2b3a4-5678-90ab-cdef-1234567890ab",
  "eventVersion": 1,
  "occurredAt": "2026-10-25T00:25:00.000Z",
  "producer": "order-service",
  "data": {
    "serviceRequestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "customerUserId": "cust-1234-5678-90ab",
    "matchingRevision": 2,
    "serviceId": "srv-elec-4321-abcd",
    "description": "Sửa chập điện cầu dao tổng và thay dây nguồn",
    "scheduledAt": "2026-10-26T08:30:00.000Z",
    "latitude": 10.775000,
    "longitude": 106.700000
  }
}
```

---

### 2.3 `service_request.cancelled`
- **Exchange:** `handy-go.events`
- **Routing Key:** `service_request.cancelled`
- **Responsibility:** Immediately updates projection to `status = 'cancelled'`. Customer and internal recommendation APIs will decline exposing recommendations for this request.

---

### 2.4 `service_request.converted_to_order`
- **Exchange:** `handy-go.events`
- **Routing Key:** `service_request.converted_to_order`
- **Responsibility:** Closes matching and updates projection status to `converted_to_order`. Prevents new recommendation exposure.

---

## 3. Published Events

Matching Service reliably records domain events into `matching_service.outbox_events` and publishes them to `handy-go.events` via `MatchingOutboxPublisherService`:

### 3.1 `matching.started`
- **Routing Key:** `matching.started`
- **Trigger:** Background worker transitions MatchRun to `processing`.
- **Payload:**
```json
{
  "eventId": "uuid",
  "eventType": "matching.started",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requestRevision": 1,
  "matchRunId": "run-uuid",
  "occurredAt": "2026-10-25T00:30:00.000Z"
}
```

---

### 3.2 `matching.completed`
- **Routing Key:** `matching.completed`
- **Trigger:** Matching execution finishes, results are validated and committed to `match_results`.
- **Payload:**
```json
{
  "eventId": "uuid",
  "eventType": "matching.completed",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requestRevision": 1,
  "matchRunId": "run-uuid",
  "candidateCount": 14,
  "resultCount": 14,
  "rankingProvider": "mock",
  "modelVersion": "mock-ai-v1.0",
  "processingDurationMs": 42,
  "isStaleRevision": false,
  "occurredAt": "2026-10-25T00:30:01.000Z"
}
```

---

### 3.3 `matching.failed`
- **Routing Key:** `matching.failed`
- **Trigger:** Terminal execution failure after retries exhausted or unrecoverable error.
- **Payload:**
```json
{
  "eventId": "uuid",
  "eventType": "matching.failed",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requestRevision": 1,
  "matchRunId": "run-uuid",
  "error": "Upstream service timeout",
  "occurredAt": "2026-10-25T00:30:05.000Z"
}
```

---

## 4. Idempotency & Fault Tolerance

```
[ RabbitMQ Event ] 
        │
        ▼
[ ConsumedEventRepository (Inbox) ] 
        │
   Already consumed?
   ├── YES ──> ACK immediately and exit (No duplicate jobs)
   └── NO  ──> Mark consumed in DB & Enqueue to Bounded Queue ──> ACK message
```

1. **Transactional Inbox:** Table `consumed_events` stores `(event_id, event_type, consumed_at)`. Duplicate deliveries are acknowledged and discarded without re-triggering business logic.
2. **Transactional Outbox:** Outbox events are written in the same PostgreSQL transaction as `match_results` and `match_runs`. No event is emitted if database rollback occurs.
3. **Dead Letter Queue Routing:** Outbox events exceeding 5 retry attempts are routed to `handy-go.dlq`.
4. **Crash Recovery:** Run status tracking (`pending`, `processing`, `completed`, `failed`) ensures any crashed worker process can be inspected and safely retried without violating revision uniqueness constraints `(service_request_id, request_revision, run_number)`.
