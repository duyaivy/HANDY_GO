# HANDY_GO — Điều tra và sửa incident PostgreSQL, 04/11/2026

Release cần điều tra: `prod-20261103-41694703128-a1`.

Đã sửa working tree local; không push, SSH, deploy, chạy migration production hay sửa journal production. Báo cáo dựa trên source hiện có, lỗi người dùng cung cấp và kiểm thử local. Không có log đầy đủ, Docker inspect hoặc ENV thực tế của release này. Nội dung nguyên văn của prompt `ROOT_CAUSE_FIX_AND_VERIFY` trước đó không có trong phiên này; giữ nguyên các safeguard và kiểm thử recovery đã có trong repository.

> Cập nhật chính sách ENV: yêu cầu bắt buộc DIRECT_URL_* trong báo cáo lịch sử này đã được thay bằng [optional override + effective URL validation](OPTIONAL-ENVIRONMENT.md). DDL verification/session semantics vẫn bắt buộc khi chạy migrations.

## Matching gọi User Trust qua WireGuard

Cùng ENV dùng chung cho cả ba VPS trước đây đặt `USER_TRUST_SERVICE_URL=http://user-trust-service:3002`. Docker Compose service DNS chỉ phân giải trong cùng Docker host; Matching ở VPS2 và Wallet ở VPS3 không thể dùng tên container User Trust tại VPS1. Đã đổi production example sang `http://10.77.0.1:3002` (WireGuard address VPS1), bind container port 3002 duy nhất trên WireGuard host IP (không public) và thêm preflight fail-closed nếu production ENV không trỏ đúng IP/port. Firewall cloud cần cho peer WireGuard truy cập TCP 3002. Local `.env.example` vẫn dùng localhost/service DNS để chạy phát triển.

Rà tiếp toàn bộ HTTP clients: Gateway gọi Auth, User Trust, Catalog, Order, Bidding, Matching, Payment, Notification, Wallet, Tracking và AI; Bidding gọi Order/User Trust; Order gọi Bidding/Matching; Wallet gọi User Trust; Matching gọi User Trust/AI; User Trust gọi AI. Các RPC Auth/Notification đi qua RabbitMQ cloud, không dùng tên container peer. Đã đăng ký HTTP caller/URL/cổng expose trong `services.json`, kiểm tra khi tạo release và ENV refresh, đồng thời kiểm tra dependency của từng app lúc startup production. CI quét code để phát hiện URL/caller chưa đăng ký. ENV refresh bundle cũ dùng host/port thực trong bundle, bổ sung metadata caller từ coordinator; recovery immutable bundle không bị áp guard ENV mới.

Mẫu production đã có đúng IP/cổng cho các target VPS2/VPS3. Auth (`auth-service:3001`) và Notification (`notification-service:3008`) chỉ có Gateway cùng VPS1 gọi và không publish cổng host, nên tiếp tục dùng Docker DNS. User Trust dùng `10.77.0.1:3002`; Order/Bidding/Matching/Tracking dùng `10.77.0.2:3004/3005/3006/3010`; Catalog/Payment/Wallet dùng `10.77.0.3:3003/3007/3009`.

Phát hiện thiếu `AI_SERVICE_URL` trong production example: Gateway yêu cầu biến này, Matching và KYC trước đó có fallback localhost. Đã thêm placeholder FQDN Azure và timeout; startup production yêu cầu external HTTPS origin, không credentials/path/query. Operator cần điền FQDN Azure thật hoặc custom domain HTTPS vào shared ENV. Chưa đọc ENV production/kiểm tra firewall hay gọi HTTP giữa VPS thật. URL phải là origin; client tự nối API path.

## Kết luận có bằng chứng

1. **Thiếu migration owner là lỗi xác nhận trong source:** `MIGRATIONS['vps2']` rỗng dù Order, Bidding, Matching, Tracking đều có schema, SQL migration và script `prisma:migrate:*`. Đã thêm đủ bốn owner, mỗi service chỉ chạy trên host sở hữu, trước startup và chỉ trong forward release được phép migration. Migration lỗi vẫn chặn startup; restore không chạy lại migration.
2. **Ngân sách kết nối thiếu là lỗi xác nhận trong source:** tất cả adapter runtime chỉ nhận connectionString, không đặt `pg.Pool.max`. Prisma v7 giao pooling cho driver; mặc định pg là 10 kết nối/pool. Chín service, mỗi service một process/pool, có thể yêu cầu 90 kết nối **nếu cùng thuộc một nhóm giới hạn**. Chỉ hai pool tối đa 10 cũng có thể vượt 15. Đây là trần cấu hình, không phải số kết nối thực tế đã quan sát. Không có cơ sở kết luận cả chín service production dùng cùng pool.
3. **Đường gây crash có trong Order:** timer gọi `void publishPendingEvents()`, trong khi lỗi từ `findPendingEvents()` chỉ đi qua `finally` rồi reject. Deadline scheduler cũng có đường tương tự. Startup Prisma của Order bắt lỗi và chỉ warn, nên tiến trình có thể tiếp tục tới timer rồi gặp rejection. Đây là cơ chế phù hợp với incident, **chưa phải kết luận nguyên nhân restart thực tế**; cần log fatal, image digest, exit/OOM và timestamp.
4. **Verifier từ chối container đã restart là hành vi bảo vệ đúng.** Giữ nguyên gate `RestartCount > 0`, health, image, các probe và verify nhiều vòng. Bổ sung log chọn lọc release/container/restart count/StartedAt/FinishedAt/ExitCode/OOMKilled/created_at; Docker application logs thêm timestamps. Không tự recreate hoặc bỏ qua counter.

Tài liệu tham chiếu: [Prisma v7 connection pool](https://docs.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/databases-connections/connection-pool), [node-postgres Pool](https://node-postgres.com/apis/pool). Đã kiểm tra thêm mã adapter-pg 7.10.0 được cài local: adapter tạo pool nội bộ, đăng ký idle-error handler và gọi `pool.end()` khi dispose. Vì vậy không quy kết riêng idle pool error là nguyên nhân crash.

## Audit toàn bộ Prisma runtime

| Service | URL ưu tiên (sau đó DATABASE_URL) | Provider/module runtime | Owner migration |
|---|---|---|---|
| Auth | DATABASE_URL_AUTH | AuthPrismaService / AuthDatabaseModule | VPS1 |
| User Trust | DATABASE_URL_USER_TRUST | UserTrustPrismaService / UserTrustDatabaseModule | VPS1 |
| Notification | DATABASE_URL_NOTIFICATION | NotificationPrismaService / NotificationCommonModule | VPS1 |
| Order | DATABASE_URL_ORDER | PrismaService / PrismaModule trong app Order | VPS2 |
| Bidding | DATABASE_URL_BIDDING | PrismaService / PrismaModule trong app Bidding | VPS2 |
| Matching | DATABASE_URL_MATCHING | MatchingPrismaService / MatchingDatabaseModule | VPS2 |
| Tracking | DATABASE_URL_TRACKING | PrismaService / TrackingCommonModule | VPS2 |
| Wallet | DATABASE_URL_WALLET | WalletPrismaService / WalletLedgerModule | VPS3 |
| Catalog | DATABASE_URL_CATALOG | PrismaService / PrismaModule trong app Catalog | VPS3 |

Catalog trước đây bỏ qua DATABASE_URL_CATALOG; đã đồng bộ runtime, migration resolver và SQL probe để override có hiệu lực. ENV preflight bổ sung Tracking và Catalog. Notification vẫn dùng resolver runtime hiện có để thay schema của shared URL khi fallback.

Các provider dùng singleton scope mặc định của Nest; không thấy Prisma client tạo mỗi request hay REQUEST/TRANSIENT scope. Mỗi provider sở hữu pool riêng; không chia sẻ pool giữa process/container dù URL giống nhau. `OrderPrismaService` trong libs còn tồn tại nhưng app Order hiện dùng provider riêng trong app; không tính thành hai pool đang chạy. Cả provider này cũng được cấu hình budget để tránh lỗ hổng khi được dùng về sau. Gateway và Payment không có Prisma schema/runtime client hiện tại. Các script/test tạo client riêng không thuộc runtime; nếu operator chạy chúng trên DB chung thì phải tính vào reserve.

Tất cả provider có `$disconnect()` trong shutdown lifecycle; bootstrap bật shutdown hooks. Không dùng external Pool nên adapter sở hữu việc đóng pool. Test DB thật xác nhận dispose hết kết nối và reconnect được. Shutdown đột ngột vẫn có thể xảy ra giữa broker publish và DB mark; giữ bảo đảm at-least-once và dedupe theo event ID, không tuyên bố exactly-once.

Background load: các Outbox đọc batch tối đa 20 và publish tuần tự; Order deadline đọc tối đa 50 mỗi nhóm; Bidding expiration batch 50; các scheduler có guard chống overlap trong process. Matching worker mặc định concurrency 5 và consumer prefetch 10, có retry/timeout; Notification prefetch được validate 1–50 và push worker có guard/batch. Các consumer thông thường dùng prefetch mặc định 10. Chúng dùng cùng Prisma provider với HTTP, không tạo pool khác nhưng có thể tạo hàng đợi chờ kết nối. Budget nhỏ phải đi kèm theo dõi latency, backlog và điều chỉnh concurrency phù hợp; chưa thực hiện load test production.

## Cấu hình budget và DDL

`databasePoolConfig(url, service)` áp dụng cho toàn bộ runtime adapter:

- Production bắt buộc `DB_POOL_MAX` hoặc `DB_POOL_MAX_<SERVICE>`; số nguyên 1–100. Local mặc định 1.
- `DB_POOL_TIMEOUT_MS=5000`, giới hạn 1–60000; `DB_POOL_IDLE_MS=10000`, giới hạn 1–300000. Timeout acquisition không phải timeout cho mọi SQL/transaction.
- `application_name=handygo-<service>`, callback idle error không log URL/password/SQL.
- Từ chối URL chứa `connection_limit`/`pool_timeout` để tránh hiểu nhầm chúng cấu hình pg adapter.

Bundle validator yêu cầu cho từng service: `DB_POOL_GROUP_<SERVICE>` là tên nhóm do operator kiểm chứng; `DB_POOL_REPLICAS_<SERVICE>` là số process cao điểm kể cả overlap. Từng group phải có `DB_POOL_LIMIT_<GROUP>` và `DB_POOL_RESERVE_<GROUP>`. Điều kiện:

`sum(max_connections_per_process × peak_processes) + reserve <= verified_group_limit`

Endpoint được đối chiếu theo hostname/port/user/database, bỏ schema vì schema không tạo pool độc lập. Cùng endpoint không được chia thành nhiều group để né giới hạn. Endpoint khác nhau có thể cùng một group nếu provider dùng chung quota; alias DNS/tenant routing cần operator xác nhận. Manifest chỉ ghi tổng budget, không ghi credentials. Validator offline không chứng minh ENV phản ánh đúng giới hạn provider hoặc số replica thực chạy.

Ví dụ trong production.env.example: nếu đã xác nhận cả chín service dùng chung session pool 15, mỗi service một process và max=1 thì demand=9, reserve=6. **Không sao chép giả định group này sang production chưa kiểm chứng.** Reserve phải bao gồm probe, admin, tác vụ ngoài ứng dụng và tài nguyên migration nếu chung quota. Không tăng max hoặc đổi pooling mode tự động. Giữ nguyên mode từ URL hiện tại; port không đủ để chứng minh session/transaction mode. Muốn chuyển transaction mode cần kiểm thử provider/phiên bản, transaction, prepared statements, schema/search_path, session state và locking trước.

Mọi migration config dùng resolver `scripts/migration-url.ts`. Khi chạy migration production, bắt buộc `DIRECT_URL_AUTH`, `DIRECT_URL_USER_TRUST`, `DIRECT_URL_CATALOG`, `DIRECT_URL_ORDER`, `DIRECT_URL_BIDDING`, `DIRECT_URL_MATCHING`, `DIRECT_URL_TRACKING`, `DIRECT_URL_NOTIFICATION`, `DIRECT_URL_WALLET`. Schema canonical được gắn rõ; direct URL chỉ định schema khác bị chặn. Không fallback sang pooler ứng dụng trong production migration. `DB_DDL_VERIFIED_<SERVICE>=true` là xác nhận của operator rằng endpoint đó trỏ cùng database đích và hỗ trợ quyền DDL/advisory locking; template để false để tránh chấp nhận mặc định. Biến có tên DIRECT_URL tự nó không chứng minh là endpoint direct: cần xác minh provider và quyền thực tế.

ENV refresh của release có metadata database_budget được kiểm tra lại budget. Release cũ không có metadata này được giữ cơ chế recovery cũ; **không được coi thêm DB_POOL_MAX vào ENV là đủ sửa image cũ**, vì image cũ không đọc biến đó.

## Outbox và scheduler

Đã bổ sung outer catch cho Order Outbox và deadline scheduler; nâng lỗi scan của shared/Matching Outbox từ debug sang error có hướng xử lý. Cooldown exponential 3/6/12/24/48 giây cộng jitter, trần 60 giây; scheduler interval có thể làm lần chạy thực tế muộn hơn. Timer và trigger thủ công dùng chung cooldown và guard, không tạo vòng retry nóng. Batch tuần tự, concurrency mỗi publisher là 1; ngừng nhận lượt mới khi destroy. Matching broker failure cũng dùng cooldown thay vì quét lại cố định mỗi 3 giây.

Nếu publish broker đã thành công nhưng markPublished lỗi, dừng cycle, giữ row chưa published và event ID; không tăng delivery retry count hay chuyển DLQ chỉ vì DB lỗi. Nhánh DLQ retry cũng không đổi trạng thái chỉ vì đánh dấu DB lỗi sau khi gửi. Lỗi update lịch retry được outer catch ghi nhận và backoff; không xóa row. Existing broker retries/DLQ vẫn giữ nguyên. Sau sự cố có thể phát lại cùng event: consumer phải tiếp tục dedupe. Chống overlap hiện là trong process; nhiều replica publisher vẫn có thể giao trùng (bảo đảm hiện có là at-least-once).

## Migration, schema compatibility và hash

Không thêm/chỉnh SQL migration trong đợt sửa này. Migration `20261104123000_add_service_request_cancelled_at` đã có trong checkout trước sửa. Toàn bộ SQL hiện có được deploy hai lần trên PostgreSQL 16 dùng một lần; query findFirst mọi Prisma model ở cả chín service thành công. Wallet upgrade test còn kiểm tra dữ liệu cũ, insert contract cũ và startup upsert sau migration.

`prisma migrate diff` cho thấy drift đã tồn tại ở Auth, Catalog, Matching, Tracking, User Trust, Wallet: SQL có UUID/now defaults bổ sung, tên index khác, index dư và FK/action khác metadata Prisma. Không thấy thiếu bảng/cột trong các model-read checks. Không chạy SQL diff để bỏ các default/index/FK. Danh sách chính xác nằm trong `scripts/tests/migration-drift.expected.json`; regression so sánh nguyên baseline và chặn mọi khác biệt mới. Đây là kiểm tra chống drift mới, **không chứng minh schema hoàn toàn đồng nhất hoặc mọi write contract tương thích**. FK/action khác vẫn cần review riêng trước schema-generation/destructive migrations.

Thêm VPS2 owner làm đổi migration hash dù SQL không đổi, đúng với thiết kế safeguard:

- Hash tính trên SQL checkout hiện tại + owner tại HEAD trước sửa: `cefbb717b17b2cd5bea6b6b398090ea8f675aadea12afce29ea7e94c24a0be36`.
- Hash working tree sau thêm owners: `0da4f19fd2a578a605dd1044d91b35e80610221097a11d8081a45d9607032f36`.

Đây không phải hash đã đọc từ production. Không được thay hash của immutable manifest cũ cho trùng hash mới. Bundle mới yêu cầu reviewed run_migrations nếu hash khác stable. Recovery touched transaction vẫn chặn khi hash target/previous khác hoặc rollback_compatible không hợp lệ. Tests hiện có kiểm tra automatic/manual restore, bootstrap, commit một phần và hash mismatch đều được giữ. CI discovery mới so sánh toàn bộ Prisma schemas, owner duy nhất/đúng host, script deploy/config, có SQL và inventory budget; thêm service mới mà bỏ sót một danh sách sẽ fail.

## Kết quả kiểm thử local

- `pnpm run prisma:generate`: thành công cho toàn bộ Prisma client trong lượt trước.
- `pnpm run typecheck` (exit 0), `pnpm run lint` (exit 0), `pnpm run build` (exit 0).
- `pnpm test` (exit 0): 179 test files passed, 7 skipped; 1,332 passed, 114 skipped.
- `python3 -m unittest discover -s deploy/production/tests -v` (exit 0): 181 tests, 2 skipped.
- `node --test deploy/production/tests/env-preflight.test.mjs` (exit 0): 10 passed.
- `/tmp/production-validation/bin/python scripts/check-production-config.py` (exit 0), `/tmp/production-validation/bin/python scripts/validate-production-compose.py` (exit 0), và `python3 deploy/production/database_plan.py` (exit 0): hợp đồng production, bộ service/ENV/memory cho cả ba profile, cùng inventory chín migration owners hợp lệ.
- `python3 -m unittest deploy.production.tests.test_ci_proof -v` (exit 0): 27 workflow/CI proof tests.
- PostgreSQL 16 disposable: cả chín migration chains chạy lặp lại; đọc mọi model; pool max=1, acquisition timeout, recovery, disconnect/reconnect; server connection limit phát SQLSTATE 53300 rồi phục hồi. Kết quả nằm trong `/tmp/handygo-pg-final.log`. Provider-specific XX000/EMAXCONNSESSION được fault-inject vào regression Outbox; không tuyên bố đã tái tạo Supavisor/session pool production.
- `git diff --check` (exit 0). Container PostgreSQL dùng cho test local đã được xóa sau khi kiểm tra.
- PostgreSQL 16 disposable: cả chín migration chains chạy lặp lại; đọc mọi model; pool max=1, acquisition timeout, recovery, disconnect/reconnect; server connection limit phát SQLSTATE 53300 rồi phục hồi. Provider-specific XX000/EMAXCONNSESSION được fault-inject vào regression Outbox; không tuyên bố đã tái tạo Supavisor/session pool production.
- Wallet upgrade regression: passed (fresh schema, dữ liệu cũ, deploy lặp, old writes, upsert).

Ban đầu pnpm không xác minh/download được phiên bản trong sandbox; đã chạy lại với quyền network phù hợp, không tắt signature check. Prisma Tracking client local ban đầu chưa sinh, đã generate rồi chạy lại. Docker Desktop local được bật cho DB dùng một lần. Production journal/log thực tế của transaction không có trong checkout, artifact local hay `/tmp`, và tôi không SSH production; phần phân loại nguyên nhân restart và trạng thái transaction cụ thể vì vậy phải chờ operator lấy inspect/read-only recovery evidence.

## Recovery được khuyến nghị, chưa thực hiện

1. Với release `prod-20261103-41694703128-a1`, lưu artifact/journal/immutable manifest và ảnh chụp trạng thái cả ba host trước mọi thay đổi. Dùng workflow recovery ở mode inspect; không sửa/xóa pending, fence, stable hay migration hash để vượt chặn.
2. Operator thu Docker container ID/image digest/RestartCount/StartedAt/FinishedAt/ExitCode/OOMKilled; log ứng dụng có UTC timestamp và Docker events trong khoảng transaction. Đối chiếu coordinator apply/verify/rollback timestamps. ExitCode/OOMKilled sau restart thành công có thể chỉ phản ánh state hiện tại; cần log/events cũ. Phân biệt Node unhandled rejection, OOM, SIGTERM/deploy stop và lỗi khác. Không suy từ healthy hiện tại rằng release ổn định.
3. Xác minh từng runtime endpoint thực, tenant/user/database, pool mode, pool_size=15 áp dụng cho nhóm nào và mọi client ngoài cluster. Tính cả image cũ còn chạy trong quá trình rollout: chúng vẫn có max=10, nên budget trạng thái cuối 9 không bảo đảm giai đoạn chuyển tiếp an toàn. Lập maintenance/staged stop có kiểm soát nếu cần; không tự tăng quota hay đổi mode.
4. Xác minh DIRECT_URL từng service, schema/DB đích, quyền DDL và migration ledger hiện có bằng tài khoản được phép. Có backup/PITR đã kiểm chứng. Nếu DB từng db-push/manual-create mà chưa có ledger, deploy init migration có thể fail; không tự baseline/resolve-applied, cần so sánh schema và phê duyệt từng migration.
5. Đối chiếu hash manifest target/previous thực tế. Nếu touched và hash khác, giữ MANUAL_INTERVENTION_REQUIRED; review schema tương thích và lập kế hoạch forward-fix/rollback cụ thể. Không sửa workflow để cho qua. Khôi phục/hoàn tất transaction cũ theo state machine trước khi tạo transaction release mới.
6. Sau review, đưa code qua CI rồi tạo release mới theo quy trình hiện hành, migrations bật có chủ đích; không rerun immutable release cũ với mã/ENV mới. Giữ restart gate và nhiều vòng verify. Theo dõi DB connections, acquisition timeouts, OOM/restarts, Outbox oldest pending/count/retry/DLQ, broker backlog và HTTP latency. Chưa có căn cứ để chấp nhận production chỉ dựa trên kết quả local này.

Rà soát riêng sau implementation đã kiểm tra các đường lỗi, quyền sở hữu pool, discovery/migration/hash invariants, workflow ENV refresh, và backward compatibility của recovery với manifest verifier cũ. Qua lượt này đã sửa hai lỗi trong validator/test fixture và giữ nguyên fail-closed behavior cho release cũ. Không có reviewer agent độc lập khả dụng; lượt review code cuối được thực hiện trong cùng phiên. CI GitHub Actions thực tế chưa chạy, vì không push/dispatch theo yêu cầu.
