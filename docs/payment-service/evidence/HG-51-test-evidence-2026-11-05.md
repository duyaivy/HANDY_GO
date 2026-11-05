# HG-51 Payment Service — test evidence (2026-11-05)

Raw results of the checks run on branch `feature/HG-51-payment-service` before opening the PR. All commands ran from `HANDY_GO/backend`. Wallet and Order were mocked; RabbitMQ and cross-service flows were **not** run.

## Environment

```text
handygo-payment-test postgres:16-alpine Up 10 minutes (healthy) 127.0.0.1:55433->5432/tcp
Database: handygo_hg51_payment_test (schema payment_service), migrations: 20261103000000_init_payment, 20261103120000_inbound_retry_and_payout_operation
```

## Summary

| Check | Command | Result |
|---|---|---|
| Unit tests | `pnpm exec vitest run apps/payment-service/src` | Test Files  13 passed (13); Tests  110 passed (110) |
| Integration (Docker PostgreSQL 16) | `pnpm run test:payment:docker` (`vitest.config.payment-integration.ts`) | Test Files  3 passed (3); Tests  17 passed (17) |
| E2E (module DI) | `pnpm exec vitest run --config vitest.config.e2e.ts apps/payment-service/test/app.e2e-spec.ts` | Test Files  1 passed (1); Tests  1 passed (1) |
| Lint | `pnpm exec oxlint apps/payment-service libs` | exit 0, no findings |
| Build | `pnpm exec nest build payment-service` | Rspack 2.2.5 compiled [1m[32msuccessfully[39m[22m in 97 ms |
| Typecheck | `pnpm exec tsc --noEmit -p tsconfig.build.json` | No errors in `apps/payment-service`; whole-backend `pnpm run typecheck` still fails on Tracking Service (missing generated `@prisma/tracking-client`, unrelated) |

## Integration tests (PostgreSQL, 17)

```text
payment-query.int-spec.ts › Payment query HTTP › requires a valid access token
payment-query.int-spec.ts › Payment query HTTP › allows the customer and worker and serializes BIGINT precisely
payment-query.int-spec.ts › Payment query HTTP › does not disclose a payment or attempts to an unrelated user
payment-query.int-spec.ts › Payment query HTTP › lists only the caller’s payments and validates pagination and filters
payment-query.int-spec.ts › Payment query HTTP › returns attempts without provider reference or failure details
payment-query.int-spec.ts › Payment query HTTP › finds a payment by order for the worker and rejects invalid UUIDs
payment-flows.int-spec.ts › Payment migrations › contains the inbound retry table and payout operation column
payment-flows.int-spec.ts › Order events and Point payment against PostgreSQL › creates one payment with the commission snapshot and ignores a duplicate delivery
payment-flows.int-spec.ts › Order events and Point payment against PostgreSQL › opens the payment on order.completed without charging
payment-flows.int-spec.ts › Order events and Point payment against PostgreSQL › serializes a double click: one attempt, one succeeded payment, one outbox event
schema.int-spec.ts › Payment migration › creates tables in payment_service, not public
schema.int-spec.ts › Payment migration › enforces one payment per order
schema.int-spec.ts › Payment migration › rejects allocations that do not sum to the gross amount
schema.int-spec.ts › Payment migration › rejects overlapping active commission rules
schema.int-spec.ts › Payment migration › allows adjacent commission rule intervals
schema.int-spec.ts › Payment migration › enforces one VND per point for top-ups
schema.int-spec.ts › Payment migration › rejects nonpositive refund amounts
```

## Unit tests (110)

```text
common/money/payment-money.spec.ts › payment money › parses exact whole VND 350000
common/money/payment-money.spec.ts › payment money › parses exact whole VND 350000.00
common/money/payment-money.spec.ts › payment money › parses exact whole VND 1.0000
common/money/payment-money.spec.ts › payment money › parses exact whole VND 9223372036854775807
common/money/payment-money.spec.ts › payment money › rejects invalid or non-integral amount 0
common/money/payment-money.spec.ts › payment money › rejects invalid or non-integral amount -1
common/money/payment-money.spec.ts › payment money › rejects invalid or non-integral amount 1.01
common/money/payment-money.spec.ts › payment money › rejects invalid or non-integral amount 1e3
common/money/payment-money.spec.ts › payment money › rejects invalid or non-integral amount .00
common/money/payment-money.spec.ts › payment money › rejects invalid or non-integral amount 01
common/money/payment-money.spec.ts › payment money › rejects invalid or non-integral amount 9223372036854775808
common/money/payment-money.spec.ts › payment money › rejects invalid or non-integral amount 
common/money/payment-money.spec.ts › payment money › allocates 100n VND at 5.00 percent
common/money/payment-money.spec.ts › payment money › allocates 10n VND at 5 percent
common/money/payment-money.spec.ts › payment money › allocates 1n VND at 49.99 percent
common/money/payment-money.spec.ts › payment money › allocates 1n VND at 50.00 percent
common/money/payment-money.spec.ts › payment money › allocates 9223372036854775807n VND at 100.00 percent
common/money/payment-money.spec.ts › payment money › allocates 250n VND at 0 percent
common/money/payment-money.spec.ts › payment money › rejects invalid commission rate -1
common/money/payment-money.spec.ts › payment money › rejects invalid commission rate 100.01
common/money/payment-money.spec.ts › payment money › rejects invalid commission rate 1.001
common/money/payment-money.spec.ts › payment money › rejects invalid commission rate 5e0
common/money/payment-money.spec.ts › payment money › rejects invalid commission rate 
common/money/payment-money.spec.ts › payment money › rejects invalid commission rate NaN
common/money/payment-money.spec.ts › payment money › rejects amount outside BIGINT range
common/money/payment-money.spec.ts › payment money › rejects amount outside BIGINT range
common/money/payment-money.spec.ts › payment money › rejects amount outside BIGINT range
common/clients/wallet-outcome.spec.ts › interpretWalletResult › treats only a completed operation as success
common/clients/wallet-outcome.spec.ts › interpretWalletResult › only treats definite 4xx refusals as failure
common/clients/wallet-outcome.spec.ts › interpretWalletResult › keeps timeouts and missing operations unresolved
topups/providers/vnpay-topup.provider.spec.ts › VnpayTopupProvider › is disabled until credentials are configured
topups/providers/vnpay-topup.provider.spec.ts › VnpayTopupProvider › builds a signed checkout URL with the amount multiplied by 100
topups/providers/vnpay-topup.provider.spec.ts › VnpayTopupProvider › accepts a correctly signed IPN and exposes whole-VND amounts
topups/providers/vnpay-topup.provider.spec.ts › VnpayTopupProvider › rejects tampered, unsigned or malformed notifications
topups/providers/vnpay-topup.provider.spec.ts › VnpayTopupProvider › does not treat provider failures or fractional amounts as success
commission-rules/commission-rule.service.spec.ts › CommissionRuleService › snapshots the effective rule with exact half-up allocation
commission-rules/commission-rule.service.spec.ts › CommissionRuleService › fails closed with a retryable error when no rule is effective
health/health.controller.spec.ts › HealthController › should be defined
payment-service.controller.spec.ts › PaymentServiceController › root › should return "Hello World!"
common/domain/payment-state.spec.ts › payment state machine › allows the documented payment paths
common/domain/payment-state.spec.ts › payment state machine › rejects regressions and terminal exits with 409
common/inbound/payment-inbox.service.spec.ts › unwrapInboundEvent › reads the shared envelope and flat payloads
common/inbound/payment-inbox.service.spec.ts › unwrapInboundEvent › rejects payloads without an event id
common/inbound/payment-inbox.service.spec.ts › PaymentInboxService › runs the handler once and marks the event consumed in the same transaction
common/inbound/payment-inbox.service.spec.ts › PaymentInboxService › skips duplicates without calling the handler
common/inbound/payment-inbox.service.spec.ts › PaymentInboxService › schedules a bounded retry for transient failures
common/inbound/payment-inbox.service.spec.ts › PaymentInboxService › parks permanent failures and exhausted retries as dead
common/inbound/payment-inbox.service.spec.ts › PaymentInboxService › does not leak raw error messages into stored errors
common/inbound/payment-inbox.service.spec.ts › PaymentInboxService › ACKs after persisting a failure and NACKs only when persistence itself fails
common/inbound/payment-inbox.service.spec.ts › PaymentInboxService › caps the retry delay with exponential backoff
common/inbound/payment-inbox.service.spec.ts › PaymentInboxService › replays due retrying events
order-events/order-events.service.spec.ts › parseOrderEvent › accepts exact whole VND and legacy id aliases
order-events/order-events.service.spec.ts › parseOrderEvent › rejects fractional VND, foreign currency and identical parties as permanent
order-events/order-events.service.spec.ts › OrderEventsService › registers the three order handlers
order-events/order-events.service.spec.ts › OrderEventsService › pre-creates the payment with the commission snapshot and does not charge
order-events/order-events.service.spec.ts › OrderEventsService › fails closed (retryable) while no commission rule exists
order-events/order-events.service.spec.ts › OrderEventsService › treats a replayed order.created as a no-op but rejects a contradicting one
order-events/order-events.service.spec.ts › OrderEventsService › opens the payment on order.completed and emits payment.pending once
order-events/order-events.service.spec.ts › OrderEventsService › waits (retryable) when order.completed arrives before order.created
order-events/order-events.service.spec.ts › OrderEventsService › cancels only open payments using compare-and-set
topups/topups.service.spec.ts › TopupsService.create › fails closed with 503 while the provider is not configured
topups/topups.service.spec.ts › TopupsService.create › creates an awaiting_payment top-up where 1 VND credits 1 Point
topups/topups.service.spec.ts › TopupsService.create › replays the same top-up for the same key and rejects a different payload
topups/topups.service.spec.ts › TopupsService.handleIpn › rejects invalid signatures without touching the database
topups/topups.service.spec.ts › TopupsService.handleIpn › answers 01 for unknown references and 04 for a mismatching amount
topups/topups.service.spec.ts › TopupsService.handleIpn › moves to credit_pending and emits payment.topup.succeeded only after a verified success
topups/topups.service.spec.ts › TopupsService.handleIpn › does not emit again for duplicate or already confirmed notifications
topups/topups.service.spec.ts › TopupsService.handleIpn › marks provider failures as failed and never emits a credit
topups/topups.service.spec.ts › TopupsService.handleIpn › still honours a verified payment that arrives after the checkout expired
topups/topups.service.spec.ts › TopupsService.onWalletCredited › completes only after the Wallet ACK for a provider-verified top-up
topups/topups.service.spec.ts › TopupsService.onWalletCredited › sends a credit without provider evidence to review instead of completing it
topups/topups.service.spec.ts › TopupsService.onWalletCredited › rejects contradicting or unknown credits as permanent and ignores replays
topups/topups.service.spec.ts › TopupsService.reconcile › expires unpaid checkouts and flags credits Wallet never acknowledged
payouts/payouts.service.spec.ts › PayoutsService.onWithdrawalRequested › stores the payout (simulated, unresolved snapshot) before any dispatch
payouts/payouts.service.spec.ts › PayoutsService.onWithdrawalRequested › is a no-op for a replay and permanent for a contradicting event
payouts/payouts.service.spec.ts › PayoutsService.onWithdrawalRequested › rejects malformed events
payouts/payouts.service.spec.ts › PayoutsService.advance › does nothing when the payout provider is disabled
payouts/payouts.service.spec.ts › PayoutsService.advance › never claims or dispatches without a validated bank snapshot
payouts/payouts.service.spec.ts › PayoutsService.advance › claims the withdrawal in Wallet before dispatching and then reports success
payouts/payouts.service.spec.ts › PayoutsService.advance › reports a simulated failure to Wallet so the hold can be released
payouts/payouts.service.spec.ts › PayoutsService.advance › keeps the hold and goes to review on an unknown provider outcome (no blind retry)
payouts/payouts.service.spec.ts › PayoutsService.advance › does not dispatch when the Wallet claim is rejected or unreachable
payouts/payouts.service.spec.ts › MockPayoutProvider › is disabled by default and in production, and always simulated
payouts/payouts.service.spec.ts › MockPayoutProvider › returns simulated outcomes controlled by configuration
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › uses the trusted internal endpoint and preserves the exact VND amount
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › does not duplicate the API prefix in configured URLs
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › fails closed on invalid Order response
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › fails closed on invalid Order response
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › fails closed on invalid Order response
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › fails closed on invalid Order response
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › fails closed on invalid Order response
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › fails closed on invalid Order response
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › fails closed on invalid Order response
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › preserves an explicit ineligible result without treating it as success
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › fails closed when the secret is missing, upstream errors or the response is malformed
common/clients/order-eligibility.client.spec.ts › OrderEligibilityClient › distinguishes an unknown order and rejects invalid input
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.open › hides payments from users other than the order customer
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.open › rejects orders that are not eligible or whose amount differs from the snapshot
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.open › switches the method of an open payment without charging
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.open › refuses to change the method while the payment is processing or settled with another method
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.confirmCash › only the order worker can confirm and records receivable without crediting the worker
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.confirmCash › is idempotent once succeeded and rejects non-cash or unopened payments
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.confirmCash › keeps the commission due when Wallet cannot collect it
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.payWithPoints › settles only after Wallet commits and uses a fixed operation id
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.payWithPoints › marks the payment failed on a definite Wallet refusal and allows a later new attempt
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.payWithPoints › never creates a new attempt or fails the payment when the outcome is unknown
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.payWithPoints › resolves an unknown debit by looking the operation up before giving up
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.payWithPoints › fails closed for other customers, non-point payments and zero worker earnings
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService.payWithPoints › does not touch Wallet again for an already succeeded point payment
payment-orders/payment-orders.service.spec.ts › PaymentOrdersService reconciliation › re-drives stale processing attempts with the same operation
```

## Not covered

- RabbitMQ delivery/ACK/NACK against a real broker.
- Real Payment–Wallet–Order integration (claim/cancel race, refund concurrency, top-up ACK).
- VNPAY sandbox contract (signature algorithm follows the public spec but was not verified against the real sandbox).
- Refund, Admin APIs and bank snapshot source (waiting for PO decisions, see `../PO-DECISIONS.md`).
