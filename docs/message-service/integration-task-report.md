# Upstream Message integration implementation

Status: DONE_WITH_CONCERNS (live provider verification remains NOT_RUN). No commits.

Implemented existing-owner APIs with common response envelopes and configured timing-safe internal credentials:

- GET `/api/v1/internal/bids/:bidId/chat-eligibility`: actual committed bid + round, active eligibility including deadline and cancellation. Selected status retained for Order continuity policy.
- GET `/api/v1/internal/bids/chat-lookup?requestId=&workerId=`: authoritative original pair lookup; avoids adding bidId to Message schema.
- GET `/api/v1/internal/service-requests/:id/chat-state`: request/order in repeatable-read transaction, actual persisted versions (both already exist), customer/selected worker and completion time.
- POST `/api/v1/internal/auth/chat-session`: `{accountId,userId,sid}` checks live bound, unrevoked, unexpired session with absolute seven-day lifetime, active Auth account and strict active/provisioned User Trust RPC. RPC uses RxJS timeout cancellation; chat deadline1.5seconds, legacy default10seconds.
- POST `/api/v1/internal/media/chat/verify`: `{storageKey,ownerId,mediaType}` queries authenticated Cloudinary asset with1.5second provider timeout; verifies resource identity/type, allowed actual provider format/bytes and owner intent receipt; returns trusted media metadata and private_download_url expiring within5minutes.

Existing image upload accepts multipart intent=chat; existing video init accepts intent:'chat'. New chat assets use Cloudinary authenticated delivery, owner context with HMAC(ownerId:resourceType:storageKey), and overwrite:false. HMAC receipt is persisted as provider custom context and included in signed upload parameters. This avoids new upload infrastructure and untrusted arbitrary URL ownership claims. Private video init returns type/context/overwrite for client to submit verbatim; folder empty and full publicId avoid double folder prefix. Nonchat upload contracts preserve existing argument behavior.

Exact internal media POST bypasses Gateway JWT middleware only because it authenticates service credentials in its controller. All adjacent paths/methods retain normal JWT middleware. Actual HTTP test caught incorrect global-prefix inclusion in Nest middleware exclusion; fixed by using internal/media/chat/verify (Nest adds api/v1).

Notification is owned by coordinator; untouched by this task.

## Verification evidence

- RED: chat-authority6 assertions failed missing methods; session2 failed missing method; media6 failed absent verifier/private signature behavior.
- PASS: `./node_modules/.bin/vitest run apps/order-service/src/internal/chat-authority.spec.ts`6tests.
- PASS: `./node_modules/.bin/vitest run apps/auth-service/src/internal/chat-session.spec.ts`2tests.
- PASS: media tests grew to7 including forged HMAC receipt, wrong owner, public type, oversized and disallowed formats.
- PASS: `./node_modules/.bin/vitest run apps/order-service/src/internal/chat-endpoints.spec.ts`11 actual Nest HTTP tests: missing secret, common envelope on all5routes, DTO rejects forged fields. Persistence/provider boundaries use test doubles; this is NOT full real cross-service E2E.
- PASS: `./node_modules/.bin/vitest run apps/api-gateway/src/uploads/chat-media-http.spec.ts`3 tests invoke actual ApiGatewayModule middleware registration: valid internal POST without JWT, missing secret rejection, adjacent GET JWT requirement.
- PASS final affected suite: `./node_modules/.bin/vitest run apps/order-service/src/internal apps/bidding-service/src/bids apps/auth-service/src/internal apps/auth-service/src/common/session libs/cloudinary/src apps/api-gateway/src/uploads`14files/134tests. Initial sandbox run denied HTTP listen14errors; elevated repeat passed134tests.
- PASS: `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json`.
- PASS: `./node_modules/.bin/oxlint apps/ libs/ *.ts`.
- PASS: Prettier write over all20 task-owned source/test files.
- NOT_RUN: real Cloudinary upload/Admin lookup/private delivery; provider credentials/network fixture unavailable. Official SDK API confirmed against https://cloudinary.com/documentation/control_access_to_media (authenticated type supported by private_download_url with expires_at).
- NOT_RUN in this task: production routing, deployment and real account services/database startup. Coordinator owns whole-repo/Message/PostgreSQL checks.

## Review notes and remaining risks

- Chat media fail closed for any provider ownership/privacy/receipt mismatch; legacy public assets cannot be attached.
- HMAC receipt rotates with CLOUDINARY_API_SECRET; production credential rotation requires receipt migration or accepting old verification secret during a bounded rotation. Do not rotate without planned recovery for existing media.
- Media filter does not inspect text within image/video; no OCR moderation claim.
- Auth RPC unavailable blocks introspection; no stale positive identity cache introduced.
- No production proxy/workflow edits; adding internal resolver route requires Phase3 network ACL/Nginx deny rules.
- Existing image FileInterceptor buffers content before shared uploader validates size (preexisting API behavior); ingress request-size limits remain required in Phase3.

## Independent review fix wave

Addressed both Medium findings in upstream-review.md without changing shared bootstrap:

1. Provider actual bytes now use `Math.min(chatCap, configuredImageOrVideoCap)` and reject missing/nonfinite/nonpositive configured caps. Regression covers5MiB configured image/6MiB actual,50MiB configured video/75MiB actual, invalid settings, and an initializer accepting1MiB declaration followed by provider-confirmed75MiB upload rejection under50MiB configuration.
2. Auth introspection body, internal media body and Bidding pair-lookup query now have unknown/Object metatypes, so shared global whitelist-only validation does not remove evidence of unknown keys. Their handlers explicitly transform through strict DTO validation. Exact existing endpoints elsewhere retain current behavior. HTTP tests now match actual bootstrap whitelist:true/transform:true (no global forbidNonWhitelisted) and reject forged senderId, arbitrary URL and hasBid query fields.

RED observed10 failing assertions (7 cap checks,3 raw-key rejection checks). GREEN final command `./node_modules/.bin/vitest run libs/cloudinary/src/chat-media.spec.ts apps/order-service/src/internal/chat-endpoints.spec.ts apps/api-gateway/src/uploads/chat-media-http.spec.ts`:3files31tests passed. `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json`:exit0. `./node_modules/.bin/oxlint apps/ libs/ *.ts`:exit0. Prettier over6 affected files:exit0. Live Cloudinary remains NOT_RUN.
