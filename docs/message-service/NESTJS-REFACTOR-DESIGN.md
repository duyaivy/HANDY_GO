# Message Service NestJS refactor: audit and proposed design

Date: 2026-11-06. Status: approved and implemented; see NESTJS-REFACTOR-REPORT.md for verified results and the pre-existing exact Docker build blocker.

## Intent and constraints

Make dependency ownership and application lifecycle understandable and reusable through Nest modules and providers. Preserve domain behavior, public REST and Socket.IO contracts, Prisma generated client, existing tests, NodeNext ESM imports, TypeScript compilation, and production artifact paths. Keep raw Socket.IO and `createMessageApp(options)`. No commits, pushes, deployments, production infrastructure edits, or build-tool changes.

## Audit

- `application.ts` contains the controller, exception filter, an unexported module declared inside the factory, service construction, transport attachment, broker startup, reconciliation timer, and shutdown closure. Nest resolves three preconstructed `useValue` services; the dependency graph itself lives outside Nest.
- `main.ts` validates configuration, constructs dependencies, connects Prisma, creates the app, and listens. Its failure path disconnects Prisma but does not close an already created app after a listen failure.
- Factory construction immediately attaches Socket.IO and starts optional broker and reconciliation work, before Nest initialization/listening. A string-token provider delegates shutdown to a mutable closure. Cleanup is sequential; a broker close rejection skips transport and database cleanup.
- `MessageRealtime` directly owns Socket.IO, session-expiry timers, a one-second typing timer, and domain callbacks. Authentication occurs at admission, per acknowledged operation, and before delivery. It uses user and conversation rooms, requires acknowledgments before executing events, disconnects unauthorized sessions, aggregates typing across devices with a five-second TTL, and emits typing only to other users who joined. Preserve this implementation rather than introducing a gateway adapter.
- `MessageBroker` owns its connection, consumer, publisher, and three-second outbox poll. It is also instantiated directly by broker integration tests. Preserve direct construction and public `start`, `close`, and `publishPending` APIs.
- `MessageService`, `IdentityService`, `AuthorityClient`, cursor encoding, and rate limits are plain classes. Nest factory providers can wire these classes without coupling domain logic to decorators or changing their constructors.
- Neighboring Notification modules export explicit modules with controllers and providers and use Nest lifecycle hooks for dependency ownership. The common bootstrap helper additionally installs validation, error handling, route prefix, Swagger, and CORS behavior that differ from Message; adopting it wholesale would risk contract drift.
- `build:message` uses `tsc` with NodeNext/ES2023 and emits `dist/message-runtime`; production Docker explicitly builds and copies that artifact. Generated `@prisma/message-client` is preserved through production pruning. `nest-cli.json` registration is unnecessary for this change.
- Vitest uses SWC, aliases, and decorator metadata. Runtime/broker tests skip without explicit disposable database/broker URLs. Existing scripts create and remove their own PostgreSQL/RabbitMQ containers and avoid loading `.env`.

## Approaches

1. **Approved: explicit module and providers with a lifecycle coordinator.** Extract controller/filter, export `MessageModule.register(options)` (the user specified the final module name), use class and factory providers for the dependency graph, and let a dedicated provider coordinate transport attachment, broker/reconciliation startup, and cleanup. Retains plain domain classes and raw transport; adds only service-specific composition structure.
2. Decorate every class and split infrastructure into many Nest modules. More conventional in appearance but introduces unnecessary framework coupling and module/configuration overhead for this graph.
3. Convert transport to `@WebSocketGateway()` and adopt shared bootstrap/build defaults. Larger behavioral surface with no benefit required by this request; not proposed.

## Proposed boundaries

- `message.module.ts`: exported dynamic root module; registers supplied database, authority and verifier, cursor/rate providers, domain service factories, runtime provider, controller and exception filter.
- `message.options.ts`: exported factory/module options contract and injection token, preserving current option fields and optional broker URL.
- `message.controller.ts`, `chat-exception.filter.ts`: extracted HTTP contract implementations; preserve routes, statuses, validation order, envelopes and retry headers. Register the filter through Nest DI.
- `message-runtime.service.ts`: injectable owner of HTTP-server attachment through Nest's HTTP adapter, raw Socket.IO instance, optional broker and reconciliation timer. Explicit lifecycle hooks start once and close resources in order while attempting all cleanup even when one operation fails.
- `application.ts`: reusable factory creates the registered module, retains Message-specific parser, logger, CORS and signal hooks, and returns a Nest application. Close partial applications on setup failure where possible.
- `main.ts`: retain explicit runtime configuration and Prisma connection; ensure an app created before a listen failure is closed. Do not change database schema/client or environment-variable precedence.

The implementer should settle exact provider names and hook choice after tests establish factory-before-init and close-before-listen behavior. Preserve external dependency ownership: a database supplied to the factory is disconnected on app close, matching existing behavior; do not add an automatic connection requirement to test doubles.

## Tests and verification

First add failing tests proving real Nest provider resolution, two isolated factory instances, optional broker handling, and cleanup on normal close, pre-listen close and setup/listen failure. Pin startup timing explicitly. Add transport integration cases for admission errors, join/leave room effects, missing acknowledgments, disconnect cleanup and public error responses; retain existing typing TTL/authentication/idempotency tests.

Run the full backend Vitest suite, Message runtime PostgreSQL runner, database constraints runner, broker integration runner, relevant typechecks/lint and `build:message`. Build the existing production Dockerfile through its runtime target, preserving the registered services and production dependency pruning. Smoke-check the compiled ESM artifact and generated client in the resulting local image. Use disposable dependencies only; never start production Compose or use production credentials.

Document exact verification results, skips, any baseline failures and behavioral differences. Intended wire behavior changes: none. Lifecycle timing/cleanup differences must be called out rather than hidden as implementation details.

## Baseline evidence

- Existing local Vitest binary: 190 files passed, 10 skipped; 1,456 tests passed, 128 skipped.
- Message source/contracts subset: 4 files, 53 tests passed.
- `node scripts/test-message-runtime.mjs`, with Docker permission: 7 tests passed against disposable PostgreSQL with both migrations applied.
- Initial sandbox Docker runner could not access the Docker socket; elevated retry passed.
- Initial `pnpm exec vitest run` could not verify/download the pinned pnpm release in the sandbox. Elevated retry passed: 190 files passed, 10 skipped; 1,456 tests passed, 128 skipped.
- No implementation files changed at audit/design time.
