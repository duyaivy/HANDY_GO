# HANDY_GO — PR #80 Code Review

**PR:** https://github.com/duyaivy/HANDY_GO/pull/80  
**Title:** Feature/hg 64 integrate tracking service into order service  
**Head SHA reviewed:** `82a27d62f763003a1af434753e749591c0f154dc`  
**Review date:** 2026-11-13  
**Scope:** Static review of GitHub changed files and related implementation; GitHub Actions status inspected. No local device/VPS production test was run.

## Overall recommendation

**REQUEST CHANGES — chưa nên merge để rollout nghiệp vụ**. GitHub reports no merge conflicts; PR CI passed (Backend CI, Mobile CI, HG64 Order-to-Tracking integration, CI Gate). Nevertheless there are correctness issues in the mobile representation of payment and the worker's live order state.

## Confirmed findings

### [P1] UI marks payment completed when only the order is completed

**Location:** [`mobile/src/features/tracking/types/tracking.types.ts` L240-L253](https://github.com/duyaivy/HANDY_GO/blob/82a27d62f763003a1af434753e749591c0f154dc/mobile/src/features/tracking/types/tracking.types.ts#L240-L253); related: [`backend/apps/tracking-service/src/summary/summary.service.ts` L460-L470](https://github.com/duyaivy/HANDY_GO/blob/82a27d62f763003a1af434753e749591c0f154dc/backend/apps/tracking-service/src/summary/summary.service.ts#L460-L470).

The mobile code sets `isPaymentCompleted = payment?.status === 'succeeded' || phase === 'COMPLETED'`. But backend returns `currentPhase: 'COMPLETED'` whenever the *order* is completed even if payment is pending or absent. Thus the payment milestone displays **"Đã thanh toán và hoàn tất dịch vụ"** without payment success.

**Fix:** Separate order completion from payment success. Consider payment successful only for explicit verified payment events (`succeeded`, `completed`, or `paid` where contract supports those states). Show `awaiting payment` or `pending settlement` for a completed order with no successful payment. If the domain needs a distinct current phase, add `PAYMENT_PENDING`/`ORDER_COMPLETED_AWAITING_PAYMENT` rather than overloading `COMPLETED`.

**Regression test:** `{ currentPhase: 'COMPLETED', order: {status:'completed'}, payment: {status:'pending'} }` must *not* display payment completed; also test `payment: undefined` and `payment: {status:'succeeded'}`.

### [P1] Local worker status can permanently override a newer authoritative status

**Location:** [`mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx` L97-L172](https://github.com/duyaivy/HANDY_GO/blob/82a27d62f763003a1af434753e749591c0f154dc/mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx#L97-L172).

The screen persists `localStatus` from SSE events and button actions; `currentStatus = localStatus || statusFromTracking || order?.status || 'created'` never clears the override. E.g. SSE sets `localStatus = 'disputed'`; admin resolves the dispute, Order API and Tracking summary now show `in_progress`, but `localStatus = 'disputed'` still wins. Worker remains stuck on a dispute view and cannot act until remount. Also, if Tracking lags the Order API, `statusFromTracking` wins over the authoritative `order.status`.

**Fix:** Use Order API status as source of truth for action buttons. If optimistic status is needed, scope it to one mutation/event, reconcile it on refetch, and clear it once a newer server version/status arrives. Handle *all* terminal and post-dispute transitions through a single state-reconciliation path, not only `rework/completed/disputed`.

**Regression test:** dispute SSE -> admin resolution `disputed -> in_progress` -> refetch, without remounting; action buttons should reflect `in_progress`. Also test `cancelled`, `completed` and stale Tracking projection after a successful API mutation.

### [P2] Admin dispute resolution is mistakenly announced as a customer rework request

**Location:** [`worker-job-detail-screen.tsx` L103-L120](https://github.com/duyaivy/HANDY_GO/blob/82a27d62f763003a1af434753e749591c0f154dc/mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx#L103-L120); producer [`orders.service.ts` L1261-L1271](https://github.com/duyaivy/HANDY_GO/blob/82a27d62f763003a1af434753e749591c0f154dc/backend/apps/order-service/src/orders/orders.service.ts#L1261-L1271).

Any `order.status.changed` event whose `toStatus` is `in_progress` and contains a `reason` triggers "Khách hàng yêu cầu chỉnh sửa". Admin's `resume_previous_state` from `disputed -> in_progress` includes `resolutionNote`/`reason`, so the client falsely attributes this action to the customer and shows a rework banner.

**Fix:** Require explicit `order.rework_requested`, `metadata.reworkReason`, or the exact transition `awaiting_customer_confirmation -> in_progress` with a rework-specific notification kind; do not infer rework from arbitrary reason + target status. Add admin resolution test.

### [P2] Duplicate dispute notifications from two outbox events

**Location:** [`worker-job-detail-screen.tsx` L133-L140](https://github.com/duyaivy/HANDY_GO/blob/82a27d62f763003a1af434753e749591c0f154dc/mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx#L133-L140); producer [`orders.service.ts` L1180-L1209](https://github.com/duyaivy/HANDY_GO/blob/82a27d62f763003a1af434753e749591c0f154dc/backend/apps/order-service/src/orders/orders.service.ts#L1180-L1209).

Disputing an order publishes **both** `order.disputed` and `order.status.changed` with destination `disputed`. Mobile shows `Alert.alert` for either condition, so the same business action can alert twice. Admin resolution to completed similarly emits `order.completed` and `order.status.changed` (cf. L1316-L1350), potentially duplicating the completion alert.

**Fix:** Deduplicate by `(orderId, transition/status)` over a short window or standardize a single canonical event for user-facing alerts. Test the actual two-event sequence.

### [P2] Generic Axios 429 retry also retries non-idempotent mutations

**Location:** [`mobile/src/services/api/api-client.ts` L242-L254](https://github.com/duyaivy/HANDY_GO/blob/82a27d62f763003a1af434753e749591c0f154dc/mobile/src/services/api/api-client.ts#L242-L254).

The interceptor transparently retries **every HTTP method** once on 429, including POST/PATCH/DELETE. This is generally fine for a gateway rate-limit rejection *before* work starts, but it is unsafe to assume every 429 from every service happened before any side effect. It can also hide rate limiting on payment/withdrawal operations.

**Fix:** Limit automatic retry to safe/idempotent requests (GET/HEAD and explicitly protected idempotent mutations). For actions such as payment, evidence upload, bids, and order transitions, rely on stable idempotency keys and/or let the caller decide. Honor `Retry-After` with a bounded delay and cancellation awareness.

## Existing issue to verify (outside this PR's changed lines)

### [Security/P1 conditional] Dual-role participants may see another worker's order/payment summary

**Location:** [`backend/apps/tracking-service/src/summary/summary.service.ts` L60-L79 and L259-L265](https://github.com/duyaivy/HANDY_GO/blob/82a27d62f763003a1af434753e749591c0f154dc/backend/apps/tracking-service/src/summary/summary.service.ts#L259-L265).

If HANDY_GO permits one account to have **both `Customer` and `Worker` roles**, a worker who participated in another customer's bidding passes the broad `isParticipatingWorker` gate. The later `isAuthorizedForOrderAndPayment = user.isAdmin || user.isCustomer || ...` treats the role `Customer` as ownership without checking `flow.customerId === user.userId`, potentially exposing order/payment summary data to a competing worker. This authorization expression predates PR #80; verify the dual-role model and fix if applicable.

**Fix:** Compute `isOwner` once, then use `isAuthorizedForOrderAndPayment = user.isAdmin || isOwner || (user.isWorker && isAssignedWorker)`; add a two-role competing-worker test.

## Compatibility checklist

- `order.confirmed`, `order.started`, and `order.finished` dedicated outbox publications are removed in favor of `order.status.changed`. Check external consumers/notifications/analytics before deploying this event contract change. The reviewed repo search did not show a definitive dependent runtime consumer; this is a compatibility risk, not a confirmed regression.
- Confirm Tracking migration `20261110000000_rejected_tracking_events` is deployed to the tracking database before shipping the new consumer, and verify `tracking-replay` admin runbook.
- Smoke test a production-like path with JWT + Nginx + Gateway + Tracking SSE + RabbitMQ/Redis + PostgreSQL, and both customer/worker roles. Passing CI alone does not confirm deployed SSE behavior.

## Acceptance tests before merge

1. Order completed while payment pending → payment milestone **not** completed.
2. Payment succeeded event → payment milestone completed.
3. Dispute -> admin resumes to `in_progress` on an already-open worker screen → actionable UI updates without remount.
4. Dispute emits paired events → exactly one user-facing alert.
5. Admin resume with `resolutionNote` → never misreported as customer rework.
6. API 429 for non-idempotent payment/order actions → no unsafe automatic retry.
7. If dual roles are possible: competing worker with `Customer`+`Worker` cannot view another order's payment summary.

## Final decision

**Do not merge for deployment yet.** Fix both P1 correctness findings at minimum, then address P2s and re-run CI + targeted mobile/API tests. PR code is promising and CI is green, but correctness of live status and money-related UI is important enough to require changes.
