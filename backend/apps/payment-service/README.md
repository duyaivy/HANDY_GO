# Payment Service

Payment orchestrates Order payments, top-ups and payouts. Wallet owns balances, ledger and
holds; Payment never mutates a balance itself. VND and Point are whole numbers (1 Point = 1 VND).

Schema: `docs/dbml/payment-service-v2.dbml`. Status of every item and the evidence behind it:
`docs/payment-service/HG-51-PAYMENT-SERVICE-CHECKLIST.md`. Decisions that still need the PO:
`docs/payment-service/PO-DECISIONS.md`.

## Implemented features

| Folder | What it does |
| --- | --- |
| `common/inbound/` | Transactional inbox (`consumed_events`), bounded retry with backoff (`failed_inbound_events`), `dead` parking, ACK after the failure is persisted. |
| `common/outbox/` | Outbox rows written in the business transaction and published by the shared `OutboxPublisherService`. |
| `order-events/` | Consumes `order.created` (pre-create payment + commission snapshot, never charges), `order.completed` (opens payment, emits `payment.pending`), `order.cancelled`. |
| `commission-rules/` | Resolves the versioned rule effective at order creation. No rule means fail-closed (retry), never an implicit 0%. |
| `payment-orders/` | `POST /payments` (select method), `POST /payments/:id/confirm-cash` (only the order's worker), `POST /payments/:id/pay-with-points` (customer must send `{ "confirm": true }`). |
| `payment-query/` | `GET /payments/me`, `/:id`, `/order/:orderId`, `/:id/attempts` for the customer/worker. |
| `topups/` | `POST/GET /payments/topups`, VNPAY IPN `GET /payments/topups/vnpay/ipn`, completion only after `wallet.topup.credited`. |
| `payouts/` | Consumes `wallet.withdrawal.requested`, claims in Wallet before dispatch, mock provider only. |
| `reconciliation/` | Periodic sweep: unresolved Point attempts, due commissions, expired/stuck top-ups, pending payouts. |

### Safety rules

- Point payment: one fixed attempt/operation (`paymentId:attemptId`). Timeout or any non-definite answer
  looks the Wallet operation up and otherwise stays `processing`; the same operation is re-driven
  (Wallet is idempotent), no new attempt is created. Only a definite 4xx refusal marks it `failed`
  (401/403/408/429 are inconclusive). Payments with a zero worker earning are refused for Points until
  the Wallet contract accepts zero earnings.
- Cash: no Point is credited to the worker. The platform commission becomes a receivable that is
  collected from the worker's Wallet when it can cover it; a shortfall keeps it `due`.
- Top-up: the signed provider IPN is the only proof of payment; the return URL is never trusted. The
  top-up is `credit_pending` until the Wallet ACK arrives; a credit without provider evidence goes to
  `needs_review`.
- Payout: a payout is stored first, needs a validated bank snapshot, is claimed in Wallet before the
  provider is called, and an unknown provider outcome goes to `needs_review` with the hold kept.

### Disabled until a decision/configuration exists (independent of the rest)

| Capability | Why it is off |
| --- | --- |
| Refunds (`/payments/:id/refunds`), partial refund | Needs PO decisions on Cash refund, Point funding and downstream compatibility. Not implemented. |
| Admin payment access and commission-rule management | Admin permission contract not decided. Not implemented; rules are read-only from the DB. |
| VNPAY top-up | Needs `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`; otherwise `POST /payments/topups` returns 503. The IPN/response contract must still be verified against the sandbox. |
| Payout dispatch | Needs `PAYOUT_MOCK_ENABLED=true` (never in production) **and** an approved bank snapshot source. The default `BankSnapshotProvider` returns nothing, so payouts stay `pending`. |

The default commission rate is not seeded. Without an effective active rule, `order.created`
events are retried and then parked as `dead`.

## Prisma

Set `DATABASE_URL_PAYMENT` (or `DATABASE_URL`) before migration, status or database-backed
requests. Client generation does not require a database URL. The Payment config always uses schema
`payment_service`; check the host and database carefully before applying a migration. Use a separate
test database for validation, never a shared or production database without approval.

```powershell
pnpm run prisma:generate:payment
pnpm run prisma:migrate:payment
pnpm run prisma:status:payment
```

Run the integration tests against the throwaway Docker database (container `handygo-payment-test`,
PostgreSQL 16, database `handygo_hg51_payment_test` on `127.0.0.1:55433`, data in tmpfs):

```powershell
pnpm run test:payment:docker                 # up + migrate + test, then tear down
pnpm run test:payment:docker -KeepRunning    # keep the container afterwards
pnpm run test:payment:up / test:payment:down # manage the container only
```

To use another local database instead, migrate a database named `handygo_hg51_payment_test`, set
`PAYMENT_TEST_DATABASE_URL` and `DATABASE_URL_PAYMENT` to it and run
`pnpm run test:integration:payment`. The tests reject other database names and non-local hosts.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `INTERNAL_SERVICE_SECRET`, `UPSTREAM_TIMEOUT_MS`, `ORDER_SERVICE_URL`, `WALLET_SERVICE_URL` | Authenticated internal calls to Order and Wallet. |
| `RABBITMQ_URL`, `RABBITMQ_EXCHANGE` | Event bus. Payment listens on queue `payment-service`. |
| `PAYMENT_INBOUND_RETRY_ENABLED`, `PAYMENT_INBOUND_MAX_ATTEMPTS` | Inbound retry sweep (default on, 8 attempts). |
| `PAYMENT_RECONCILER_ENABLED`, `PAYMENT_RECONCILER_INTERVAL_MS` | Reconciliation sweep (default on, 15 s). Both background jobs are off when `NODE_ENV=test`. |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`, `VNPAY_PAY_URL` | VNPAY sandbox adapter. Never commit values. |
| `PAYOUT_MOCK_ENABLED`, `PAYOUT_MOCK_OUTCOME` | Simulated payout controls. |

The provider IPN route needs its own Gateway exposure with signature-only authentication; the
Gateway currently proxies `/api/v1/payments` generally. Do not expose internal APIs.

## Contract notes

- Order eligibility returns `agreedPrice` as a decimal string. Only exact whole VND in the BIGINT
  range is accepted; never convert through JavaScript `number`.
- Wallet debit rejects zero worker earnings, so a 100% commission cannot be paid in Points.
- Wallet event IDs can be non-UUID strings; the inbox uses string IDs and accepts both the shared
  `data`/`payload` envelope and flat payloads.
- `payment.topup.succeeded` keeps both the flat fields Wallet reads and the `data` envelope.
- `wallet.withdrawal.requested` carries only `bankAccountId`; the destination snapshot has to come
  from an approved source (see PO decisions).

## Questions to carry into the PR

See `docs/payment-service/PO-DECISIONS.md` for the full list (commission, Admin, refunds, VNPAY,
bank snapshot, retry/DLQ/retention, event contract).
