# Payment Service

The service is not yet a working payment processor. Payment query routes are
implemented, but payment creation/charging, refund, top-up and payout are not.

The schema is based on `docs/dbml/payment-service-v2.dbml`. Wallet owns balances
and ledger entries. The user selected VNPAY sandbox for the future top-up
integration; the adapter and credentials are not yet configured. The default
commission rule remains pending and no financial rate is silently chosen.

## Prisma

Set `DATABASE_URL_PAYMENT` (or `DATABASE_URL`) before migration, status or
database-backed requests. Client generation does not require a database URL.
The Payment config always uses schema `payment_service`;
check the host and database carefully before applying a migration. Use a separate
test database for validation, never a shared or production database without approval.

```powershell
pnpm run prisma:generate:payment
pnpm run prisma:migrate:payment
pnpm run prisma:status:payment
```

Client generation is included in the aggregate `prisma:generate` command;
Payment migration and status remain separate until the integration is ready.
The initial migration contains PostgreSQL constraints beyond Prisma's
schema, including non-overlapping active commission rules. On 03/11/2026 it was
applied successfully to an isolated local PostgreSQL 16 test container; seven
integration tests checked schema isolation, uniqueness and selected constraints.
The test container was removed afterward. This does not verify financial workflows.

Run the integration tests only after migrating a dedicated local test database
named `handygo_hg51_payment_test`. Set `PAYMENT_TEST_DATABASE_URL` to that
database and set `DATABASE_URL_PAYMENT` to the same database, then run
`pnpm run test:integration:payment`. The tests reject other database names and
non-local hosts; schema tests roll back, and HTTP tests delete only their fixtures.

## Payment query

The following authenticated routes are available through the Gateway prefix
`/api/v1`: `GET /payments/me`, `GET /payments/:id`,
`GET /payments/order/:orderId` and `GET /payments/:id/attempts`. The service
revalidates the access token using the existing `JwtAuthGuard`; configure the
JWT public key as for other services. Only the payment's customer or worker can
read it; unrelated users receive 404. Amounts are decimal strings, and attempt
responses omit provider references and failure details.

Admin-wide access remains disabled until its permission contract is confirmed.
The Order eligibility client is implemented and tested but not yet used by a
payment-creation or charging endpoint.

## Contract notes

- Order eligibility returns `agreedPrice` as a decimal string. Only exact whole
  VND in the BIGINT range can be accepted; do not convert through JavaScript `number`.
- Wallet debit currently rejects zero worker earnings. A 100% commission is
  representable in the database but is not safe to activate until that difference
  is resolved with the Wallet contract.
- Wallet top-up and withdrawal event IDs can be non-UUID strings; the inbox uses
  string IDs. The Payment outbox includes retry fields required by `@app/common`.
- The schema does not default to a provider and there is no default commission
  seed. A missing rule must not become an implicit 0% commission in future code.
- The VNPAY sandbox selection is not a configured adapter or proof that a
  transaction or callback has been verified.

## Questions to carry into the PR

- Default commission rate, initial effective time and seed actor; do not assume 0%.
- Admin permission codes for payment queries, commission rules and refunds.
- Cash refund confirmation and authorized funding/approval for Point refunds.
- Order projection/event compatibility for partial refunds and event ordering.
- Wallet top-up consumer currently expects a flat event while the common outbox
  wraps business fields in `data`/`payload`; agree on and test one contract.
- `wallet.withdrawal.requested` contains a bank-account ID but no destination
  snapshot; agree on an authenticated source, encryption and retention.
- Reconciliation schedule, retry limits, DLQ replay authorization and retention.
