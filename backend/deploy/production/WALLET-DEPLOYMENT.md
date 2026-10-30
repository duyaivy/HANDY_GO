# Wallet P2021: audit và triển khai bản sửa

## Kết luận từ repository

- `host.py` trước bản sửa chỉ migrate Catalog trên VPS3, dù Wallet cũng được deploy ở đó. Đây là lỗ hổng xác định được trong pipeline, phù hợp với P2021 khi provisioning gọi `wallet.upsert`. Chưa kiểm tra trực tiếp DB/log production nên chưa loại trừ cấu hình trỏ nhầm database.
- Migration `20261022000000_init_wallet` tạo `wallets` đã được commit trong `8b22d180`. Cả sáu migration Wallet và lock PostgreSQL đều được Git theo dõi. Không thiếu migration, không tạo lại hoặc chỉnh sửa migration lịch sử.
- `Wallet` dùng `@@map("wallets")`. Không có `@@schema`: đây là cấu hình single-schema, Prisma CLI lấy schema từ URL, adapter runtime nhận `{ schema }`. Cả hai ưu tiên `DATABASE_URL_WALLET`, fallback `DATABASE_URL`, thêm `wallet_service` khi URL không có schema. Nếu URL có schema khác, cả hai giữ nguyên giá trị đó: operator phải xác minh cấu hình thực tế. `DIRECT_URL` không được dùng trong Wallet config; đặt biến đó riêng sẽ không đổi kết nối migration.
- SQL khởi tạo dùng tên bảng/type không qualified; kiểm chứng bằng Prisma migrate deploy trên PostgreSQL tạm xác nhận các bảng vào `wallet_service`, không vào `public`.
- `WalletProvisioningService.onModuleInit()` await provisioning và truyền lỗi ra ngoài. Giữ nguyên hành vi fail-fast; test bổ sung xác nhận P2021/P1001 không bị bỏ qua.
- `FAILED_ROLLBACK_SUCCESS` nghĩa là rollout thất bại nhưng ứng dụng cũ được khôi phục qua probes của coordinator; không chứng minh migration Wallet đã chạy.

## Bản sửa và tính tương thích

VPS3 chạy Catalog rồi Wallet, tuần tự, trước `compose up`. VPS1/VPS2 không chạy migration Wallet. GitHub Actions dùng concurrency `backend-production`, `cancel-in-progress: false`; host executor dùng khóa transaction. Không thêm migration vào startup hay replica. Prisma migration history khiến các lần deploy sau bỏ qua SQL đã áp dụng; không tuyên bố exactly-once khi thao tác thủ công ngoài pipeline.

Hash migration nay gồm SQL và danh sách owner. Lần đầu triển khai bản sửa phải bật `run_migrations`, dù SQL không đổi. Không dùng việc hash SQL không đổi làm bằng chứng DB đã được migrate. Không tắt Prisma advisory locking hoặc chạy thêm job migration trên VPS khác.

Không có thay đổi nghiệp vụ Wallet/Payment hoặc SQL production mới. Migration hiện có bổ sung bảng/index và cột payout; `payout_operation_id` backfill rồi có default DB để release cũ vẫn insert được khi bỏ qua cột mới. Test giữ nguyên balance/dữ liệu cũ, kiểm tra insert theo contract cũ sau upgrade và upsert platform wallet lặp lại. Unique index topup có thể thất bại nếu dữ liệu cũ trùng; cần kiểm tra trước, không tự xóa dữ liệu trùng. Tính tương thích toàn bộ ứng dụng rollback vẫn cần đối chiếu release/image đích thực tế.

## Runbook production (operator thực hiện)

1. Kiểm tra execution artifact, release cũ đang stable và pending lock của cả ba VPS. Không gỡ khóa nếu chưa xác minh transaction trước đã kết thúc. Xác nhận backup/PITR và maintenance window vì executor stop nhóm service trên host trước migration.
2. Trong môi trường bảo mật, xác minh URL hiệu lực của Wallet trỏ đúng DB và `schema=wallet_service`. Không echo URL/secrets. Migration và runtime phải dùng cùng DB/schema; nếu endpoint pooler không hỗ trợ migration, cần cấu hình kết nối phù hợp theo nhà cung cấp trước khi tiếp tục. Bản sửa không tự đổi secrets hay thêm DIRECT_URL.
3. Dùng migration image của release đã review với ENV hiện hành để chạy lệnh chỉ đọc `pnpm run prisma:status:wallet`. Operator có thể kiểm tra `SELECT to_regclass('wallet_service.wallets');` và, nếu tồn tại, lịch sử `wallet_service._prisma_migrations`. Không dùng `db push`, reset, hoặc đánh dấu applied chỉ để vượt lỗi. Nếu có migration failed/drift, dừng và xử lý theo bằng chứng trước khi rollout.
4. Merge qua PR CI rồi promote sang release, giữ ancestry theo README. Chạy **workflow mới ở commit chứa bản sửa**, `run_migrations=true`, `rollback_release` trống. Không re-run workflow commit cũ. VPS3 phải có log `migrate wallet` thành công trước khi start Wallet. Pipeline gọi `pnpm run prisma:migrate:wallet`, tức `prisma migrate deploy` với Wallet config.
5. Xác nhận sáu migration đã applied, bảng đúng schema, Wallet ổn định không restart/P2021 và coordinator báo `STABLE`. Không in dữ liệu ví hoặc credentials vào artifact.
6. Nếu rollout lỗi, auto rollback chỉ khôi phục app/config, giữ nguyên DB. Manual rollback qua workflow vẫn chặn hash khác nhau: do hash mới bao gồm owner, rollback sang manifest cũ cần review/runbook riêng; không bypass guard hoặc down-migrate. Giữ backup và release cũ cho đến khi xác nhận thành công.

## Kiểm chứng cục bộ và CI

PR CI chạy `scripts/tests/wallet-migrations.mjs` với PostgreSQL dùng một lần, database `wallet_migration_test`, chỉ chấp nhận localhost. Test deploy năm migration đầu trên DB rỗng, thêm dữ liệu theo contract cũ, deploy phần còn lại, deploy lặp lại và kiểm tra dữ liệu/Prisma upsert. CI cũng chạy test Python deployment (owner duy nhất, migration trước startup, lỗi chặn startup, hash cần review, rollback bỏ qua migration). Không sử dụng production ENV.
