# Message Service — Phase 1

This directory is the entry point for the database foundation, API/event contracts, security decisions and Phase 2 handoff. It does not describe a deployed chat feature.

| Document                                        | Purpose                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Architecture and ADR](PHASE-1-ARCHITECTURE.md) | Actual ownership, lifecycle, identity, upload and database findings with code paths; decisions and conflicts |
| [Implementation plan](IMPLEMENTATION-PLAN.md)   | Phase 1A–1E files, acceptance criteria, ownership and execution ledger                                       |
| [Database design](DATABASE-DESIGN.md)           | Prisma models, SQL invariants, transactional ordering, least-privilege setup and disposable verification     |
| [REST contracts](REST-API-CONTRACTS.md)         | Routes, shared envelope, pagination, errors and idempotent bid-scoped creation                               |
| [OpenAPI](openapi.json)                         | Checked-in wire schemas and REST operations                                                                  |
| [Socket.IO contracts](SOCKET-IO-CONTRACTS.md)   | Events, ACKs, path/namespace/rooms, typing and reconnect semantics                                           |
| [Integration events](INTEGRATION-EVENTS.md)     | Existing producers versus proposed integrations, trusted authority, retries and ordering                     |
| [Business rules](BUSINESS-RULES.md)             | Eligibility, lifecycle, historical access and anti-circumvention                                             |
| [Security design](SECURITY-DESIGN.md)           | Authentication, authorization, media security, limits and logging                                            |
| [Verification](PHASE-1-VERIFICATION.md)         | Exact commands, actual outcomes and the boundary between executable tests and future runtime tests           |
| [Phase 2 handoff](PHASE-2-HANDOFF.md)           | Backend/Mobile work packages, dependencies and mock strategy                                                 |

Portable shared source: `backend/libs/common/src/message-contracts/index.ts`. Database: `backend/foundations/message-service/prisma`. Run backend commands from `backend/`. Message Prisma commands require an explicit `DATABASE_URL_MESSAGE` or `DIRECT_URL_MESSAGE`; there is no automatic `.env` loading/shared URL fallback for this new foundation. Never use real/production credentials for verification. `node scripts/test-message-database.mjs` owns a disposable PostgreSQL container and accepts no external database URL.

Public origin stays `https://handygo.duyaivy.id.vn`. Planned REST prefix is `/api/v1/conversations`; socket transport path is `/api/v1/chat/socket.io/`. Neither gateway nor Nginx routing is changed in Phase 1.
