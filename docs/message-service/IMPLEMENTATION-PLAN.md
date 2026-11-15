# Message Service Phase 1 Implementation Plan

> For agentic workers: use Superpowers subagent-driven-development for independent tasks and executing-plans for coordinator work. No commits, pushes, merges, deployment, production migrations, or Phase 2 runtime handlers.

**Goal:** deliver an executable database foundation and portable contracts with a verified Backend/Mobile handoff.

**Architecture:** PostgreSQL `message` schema, independent Prisma history/client, existing common response and RabbitMQ conventions. Single-instance Socket.IO is specified only. Existing Cloudinary integration remains the upload provider.

**Tech stack:** existing Prisma 7.10, PostgreSQL, TypeScript, Vitest, class-validator, Nest Swagger.

**Spec:** approved HANDY_GO Phase 1 requirements in the task; architecture findings recorded in PHASE-1-ARCHITECTURE.md.

## Global constraints

- PostgreSQL schema `message`; no cross-service foreign keys or new infrastructure dependencies.
- Preserve existing files and unrelated behavior; no runtime Message Service, mobile UI, or routing deployment.
- Use UUID identity, sender-scoped idempotency, ordered history, participant isolation.
- Fail closed when eligibility or media ownership cannot be verified.
- Test only against a disposable local PostgreSQL container with explicit credentials.

## Review focus

- Concurrent retries must not duplicate messages or consume a committed sequence twice.
- Forged participants, attachment metadata and cross-conversation replies must fail.
- Reordered lifecycle events must never reopen closed permissions without authoritative verification.
- Unknown media privacy/ownership must not silently become trusted.
- Bigint cursors must survive JavaScript and JSON without precision loss.

## Tasks and ownership

### 1A: Architecture audit (read-only audit agent; coordinator documentation)

- [x] Trace Bidding/Order writes and actual emitted payloads, authentication, media and gateway.
- [x] Record all 15 investigation answers, ADR, integration gaps and decisions in PHASE-1-ARCHITECTURE.md.
      Acceptance: code references distinguish existing features from Phase 2 prerequisites.

### 1B: Database foundation (database implementer)

Files: backend/foundations/message-service/prisma/{schema.prisma,prisma.config.ts,migrations/**}; backend/scripts/test-message-database.mjs; docs/message-service/DATABASE-DESIGN.md.

- [x] Write SQL assertion/concurrency tests before constraints; observe failure against empty foundation.
- [x] Implement Conversation, Message, MessageAttachment, ConversationReadState and outbox; enforce participant, reply, sequence, attachment and read invariants.
- [x] Validate and generate Prisma; migrate disposable PostgreSQL; rerun database tests.
      Interfaces: snake_case SQL maps, UUID ids; bigint sequence transmitted as decimal strings. Conversation identity request/customer/worker; idempotency sender/clientMessageId. Safe allocation uses transaction row lock/counter.
      Acceptance: migration deploy repeat succeeds; duplicate, cross-reply, participant, media reference, monotonicity and concurrency tests pass.

### 1C/1D: Contracts and policy (contracts implementer after database interface settled)

Files: backend/libs/common/src/message-contracts/**; docs/message-service/{REST-API-CONTRACTS,SOCKET-IO-CONTRACTS,INTEGRATION-EVENTS,BUSINESS-RULES,SECURITY-DESIGN}.md; docs/message-service/openapi.json.

- [x] Write failing payload/policy tests then implement portable types and validators, Nest DTOs where useful, lifecycle policy.
- [x] Specify all REST and socket operations, ACKs, pagination, eligibility authority, media, retries and security.
      Interfaces: common ApiResponseEnvelope; contract eventVersion=1; no service imports. proposed integrations clearly labelled.
      Acceptance: unauthorized policy, lifecycle and malformed payload tests pass; contract TS compiles; OpenAPI is checked in and consistent.

### 1E: Integration, review and handoff (coordinator + independent reviewer)

Files: backend/package.json; backend/tsconfig.prisma.json; backend/AGENTS.md; docs/message-service/{README,PHASE-1-VERIFICATION,PHASE-2-HANDOFF}.md.

- [x] Add explicit opt-in Message scripts, contract export, documentation index; leave aggregate production migration unchanged.
- [x] Run pnpm test, pnpm run typecheck, pnpm run lint; targeted Prettier; Prisma validate/generate and disposable migration tests.
- [x] Independent full diff review; resolve important findings and rerun affected checks.
- [x] Record exact commands/results and unexecuted checks; report PARTIAL if a required check cannot run.
      Acceptance: evidence files and handoff cover every requirement, no Phase 2/3 runtime introduced.

## Execution ledger

- Initial git status clean. Working in place: additive foundation and no branch integration needed.
- Approved detailed design used without repeating product approval checkpoints, per explicit FULL_PHASE instruction.

## Integration and review ledger

- 1A: audit complete; committed bid is active; order.created confirms final selection; marketplace userId differs from account sub; current upload assets are public.
- 1B: database implementer completed seven Prisma models, SQL constraints/triggers and 27 disposable PostgreSQL checks, migration repeat, structural diff and runtime-role isolation. Relocation rerun passed all 27 checks.
- 1C/1D: contract implementer completed portable contracts, validators/policy, OpenAPI and five specifications; 43 targeted tests passed before review regression fix.
- 1E: backend typecheck/lint passed; full suite at integration checkpoint passed 1390 tests with118 skipped.
- Final review wave1: reviewer found enum coercion accepting JSON arrays; coordinator found production inventory automatically scans apps schemas. One fix implementer owns both regressions and path relocation; scoped re-review follows.
- Staging decision: keep the Phase1 database foundation outside apps to avoid altering production migration inventory. Phase2/3 must coordinate eventual app registration and schema location without changing migration history.

- Final fix wave1 complete: enum regression RED3/GREEN47; staged foundation relocation restores existing production inventory14/14 without production edits.
- Scoped independent re-review PASS for specification compliance and quality; no open important findings.
- Final verification: pnpm test1400passed/118skipped182files; backend typecheck, portable contracts typecheck and lint exit0; Prisma validate/generate pass; coordinator reran27SQLchecks/deploytwice/structuraldiff/grants; production database tests14pass.
- Final scope audit: no runtime chat handlers, mobile UI, gateway/Nginx/VPS changes, production migrations, secrets changes or Git commits/push/merge.
