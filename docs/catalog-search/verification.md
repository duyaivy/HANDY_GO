# Backend accent-insensitive Catalog search verification

Date: 2026-11-06. Implemented locally under explicit user authorization. Historical multi-category/frontend work was excluded. No production migration, deployment or push. A local Git commit was subsequently authorized by the user.

## Reproduction and behavior

Against a disposable PostgreSQL 16 database, both existing `findAll({ search: 'cat tia' })` implementations returned zero rows for `Cắt tỉa cảnh`. The same fixture matched `cắt tỉa`. The first regression run had 2 failures and 2 passing accented controls; this preceded implementation.

Search now folds accents on stored name/description and the bound pattern through schema-qualified PostgreSQL `unaccent`, after NFC normalization. It preserves case-insensitive substring matching, existing `%`/`_` wildcard and backslash escape behavior, and existing whitespace semantics. Values are SQL parameters; only table/order fragments are allowlisted. Status and parent/category filters apply before count and pagination. One SQL statement supplies page IDs and count; a RepeatableRead transaction now covers both that statement and Prisma relation hydration, so concurrent admin updates cannot mix row versions. Prisma hydrates only those IDs and retains their order. No-search calls retain the ORM path.

Both list cache keys use structured v2 identities, preserving 300-second TTL and `catalog:categories:*` / `catalog:services:*` write invalidation. Two additional tests first failed against seeded old empty list caches, then passed with the versioned keys.

## Evidence

- Full backend unit suite: `pnpm test`: 181 files passed, 7 skipped; 1357 tests passed, 114 skipped. Existing error-path tests emit expected application log messages.
- Explicit PostgreSQL/HTTP suite: 50 tests passed (after the user-requested second review fix). Covers concurrent admin updates between selection/hydration, migration idempotence and conflicting extension schema, accent/case/NFD, đ/Đ, name/description, no matches, false status, parent/scalar category restrictions, ordering, counts, page beyond results, hydration, cold/warm cache, stale cache bypass, quotes/injection strings and pattern characters. HTTP tests use real controllers/services/PostgreSQL with production-equivalent ValidationPipe and existing envelopes.
- `pnpm run typecheck` and `pnpm run lint`: exit 0.
- Redis is a deterministic in-memory test double; no live Redis, gateway deployment, RabbitMQ, production request, production extension state or production performance was verified.
- Postman CLI `postman status` is unsupported in the installed CLI. Source DTO/Swagger and executable local HTTP tests are the contract evidence; no Postman setup or publication was needed.

The unit runner excludes `.e2e-spec.ts` files. To reproduce the database suite, start a **fresh empty local disposable** PostgreSQL 16 database named `catalog_search_test`, then run from `backend/`:

```sh
CATALOG_SEARCH_TEST_DATABASE_URL=postgresql://postgres:catalog-test@127.0.0.1:55439/catalog_search_test \
  ./node_modules/.bin/vitest run --config vitest.config.e2e.ts apps/catalog-service/test/catalog-search.e2e-spec.ts
```

The test refuses missing/nonlocal/other database names, creates its own Catalog schema using the real migrations, and removes that schema only after its own creation succeeded. It never uses application database environment variables. An existing Catalog schema causes setup to fail rather than clearing shared fixtures.

## Deployment prerequisites (not executed)

The additive migration `20261106000000_catalog_unaccent` must precede application rollout. Confirm PostgreSQL supports `unaccent`, the migration role can install it, the runtime role can use `catalog_service` and execute its function, and database encoding is UTF8 for PostgreSQL `normalize`. The function and dictionary are both pinned to `catalog_service`.

If `unaccent` already exists in another schema, the migration intentionally fails with an explicit prerequisite error rather than silently relocating an extension shared with other services. An operator must assess and resolve that placement separately. Verify on staging before any production migration. No backfill or index is introduced; measure substring-search performance on representative data before proposing indexes. Pre-existing tied-name ordering remains unchanged.

Local plan/scratch evidence remains in `.superpowers/sdd/implementation-plan/` from the original no-commit execution. This verification report is explicitly included in the authorized commit despite the existing `docs/*` ignore rule; historical plan/audit files remain local.

## Final review

The initial independent review reported no blocking issues. A second independent review explicitly requested by the user found one Important P2: search ID selection and hydration previously used different snapshots, allowing a concurrent rename/status/category change to produce and cache a row that violated the original filters.

Two real PostgreSQL regressions deterministically commit updates through a second connection between selection and hydration. Both failed before the fix (2 failed / 48 passed). Search and relation hydration now run in one RepeatableRead transaction; no-search requests retain their existing ORM path. All 50 PostgreSQL/HTTP tests pass after the fix. TypeScript checks and lint pass. No other concrete findings or deferred minors.

No production migration, deployment or push. A local Git commit was subsequently authorized by the user. Production compatibility, runtime/migration credentials and endpoint alignment, live Redis/gateway and representative performance remain unverified.

Final post-fix full backend suite: 181 files passed / 7 skipped; 1357 tests passed / 114 skipped. The temporary review PostgreSQL container was stopped and removed after verification.
