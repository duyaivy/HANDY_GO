# HG-92 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the tasks in order.

**Goal:** Let customers use **Trao đổi** to request a quote from a recommended worker and attach a short note.

**Architecture:** Order owns the request-scoped invitation and records a notification event in its outbox. Bidding and Chat retain their existing authorities. Mobile reads the invitation from Radar and the worker bid form and uses the existing bid and chat entry points.

**Tech Stack:** NestJS, Prisma, PostgreSQL, RabbitMQ, Expo, React Query.

**Spec:** docs/superpowers/specs/2026-11-21-hg-92-recommended-worker-quote-request-design.md

## Global Constraints

- Use **Trao đổi** on the AI card and omit its per-worker price.
- Keep the request-level reference estimate, worker ranking, and chat authorization rules.
- Require a real bid and current terms to confirm a bid-backed proposal. Order creation still requires worker acceptance.

## Review Focus

- Unauthorized customer and expired requests must fail before writing an invitation.
- Concurrent submissions must create one invitation and one notification.
- Worker reads must return only invitations addressed to the caller.
- An existing active bid takes precedence over an AI recommendation.
- Revised or expired bids must fail stale confirmation.

### Task 1 — Order and notification

- [x] Add a Prisma invitation keyed by request and worker, with a note and timestamp.
- [x] Add authenticated POST/GET endpoints under service-requests/:id/quote-invitations. POST verifies request ownership and matching eligibility, locks and rechecks the request, and saves the invitation and outbox event together. GET scopes results to the request owner or invited worker.
- [x] Add a worker-directed quote invitation notification with request ID and route it to the existing worker bidding screen.
- [x] Run Order and notification checks for authorization, deadline and deduplication.

### Task 2 — Radar and worker form

- [x] Add OrdersApi invitation methods and render a note form from **Trao đổi**. Load persisted status and show the worker note in the existing bid form.
- [x] Route valid bid holders to the existing bid card and chat entry. Keep quote revisions in the worker bidding form and remove synthetic recommendation prices and proposal actions.
- [x] Pass the observed bid version and amount when confirming a proposal. Compare with Bidding eligibility proof and return a conflict on stale terms.
- [x] Run targeted Jest and Vitest suites and type checks.

## Verification

- The Order SQL migration applied to disposable PostgreSQL. The unique constraint prevented a duplicate and the foreign key removed the invitation when its test request was deleted.
- The mobile type check and the targeted Radar, Bidding, Chat and Notifications suites passed. Gateway candidate and Notification contract/policy tests passed.
- The backend type check, build, and Order, Bidding, Message, and Notification service suites passed after generating the clients with the pinned Prisma JavaScript generator from npm. The standard Prisma CLI still received HTTP 403 from the native engine checksum host.
- A local smoke test ran Gateway, Order, Bidding, Message, and Notification with PostgreSQL and RabbitMQ. It verified concurrent invitation deduplication, worker-only notification, sending and reading a chat message after a valid bid, stale quote rejection, and order creation after worker acceptance. Matching, worker-profile eligibility, and Auth session responses were fixtures. Mobile behavior was verified in Jest.
- The smoke test exposed duplicate Order outbox publishers that could emit different source fields. Order now uses its own publisher for both injection tokens. Message Service refreshes eligibility once within the original deadline if an event invalidates the in-flight conversation check.

The Radar shows the actual quote directly in the existing bid section once the worker has submitted a bid. Bid price revisions follow the existing round deadline and proposal revisions follow the existing booking proposal flow.
