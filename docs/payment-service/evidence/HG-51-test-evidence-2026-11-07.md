# HG-51 Payment Service — test evidence (07/11/2026)

Các lệnh chạy từ `HANDY_GO/backend`, giờ ghi nhận theo Asia/Saigon. Đây là bằng chứng chạy thực tế trong workspace, không phải nghiệm thu tài chính production. [Evidence 05/11](HG-51-test-evidence-2026-11-05.md) được giữ nguyên như lịch sử, có ghi chú chính sách đã thay đổi.

## Phạm vi thay đổi

- Hoàn thiện code commission Admin/audit/migration đang viết dở. Rate API/service/DB 0–30%, seed ban đầu 10%, worker earning dương; giữ snapshot Payment cũ.
- Controlled seed bắt buộc rollout timestamp có timezone và actor UUID, không startup/default. Seed và Admin dùng cùng advisory lock; rule/audit cùng transaction. Chạy lại/cạnh tranh không thêm rule trùng; config mâu thuẫn bị từ chối.
- Admin read Payment có redaction; quyền cần cả JWT Admin và permission dấu `:` cụ thể.
- Customer/Admin tạo refund full/partial, cap có reservation và khóa parent Payment; Admin khác requester/Customer duyệt hoặc từ chối. Duyệt chỉ `needs_review`, không Wallet credit, không success event, không thay trạng thái Payment thành refunded.
- Replay DLQ có audit, giữ ID/payload; báo cáo snapshot nội bộ theo ngày Việt Nam; manual reconciliation có audit.
- VNPAY thêm kiểm tra merchant và transaction status; browser return handler chỉ hướng dẫn query, không settlement.
- Cập nhật README, checklist, PO decisions, DBML, env template và reusable registry. Không sửa Wallet, User Trust hoặc Gateway.

## Môi trường

```text
OS/shell: Windows / PowerShell
Node: v22.16.0
Vitest: v4.1.11
Prisma client: v7.10.0
DB: PostgreSQL 16 (postgres:16-alpine)
Container: handygo-payment-test
Database: handygo_hg51_payment_test
Schema: payment_service
Host: localhost:55433
Storage: tmpfs, throwaway test environment
```

Test từ chối host/database ngoài local `handygo_hg51_payment_test`. Docker cần chạy ngoài sandbox do quyền truy cập named pipe; đã chạy bằng quyền được cấp. PowerShell chặn `pnpm.ps1`, nên lệnh ngoài script dùng `pnpm.cmd`. Không đọc/ghi DB staging/production.

## Quality gate

| Check | Lệnh | Kết quả |
| --- | --- | --- |
| Generate Payment client | `pnpm.cmd run prisma:generate:payment` | PASS, Prisma 7.10.0 |
| Unit tests | `pnpm.cmd exec vitest run apps/payment-service/src` | **128 passed / 16 files**, vòng cuối 16:39:57 |
| Payment typecheck | `pnpm.cmd run typecheck:payment` | PASS, exit 0; gồm src, test và prisma scripts |
| Backend lint | `pnpm.cmd run lint` | PASS, exit 0, không findings |
| Build | `pnpm.cmd exec nest build payment-service` | PASS, Rspack compiled successfully |
| E2E DI | `pnpm.cmd exec vitest run --config vitest.config.e2e.ts apps/payment-service/test/app.e2e-spec.ts` | **1 passed / 1 file**, vòng cuối 16:40:05 |
| DB + HTTP integration | `pnpm.cmd run test:payment:docker` | **37 passed / 4 files**, vòng cuối 16:45:31, 8.06s |
| Backend typecheck | `pnpm.cmd run typecheck` | **BLOCKED ngoài Payment**: thiếu generated `@prisma/tracking-client`, kéo theo lỗi property/implicit-any trong Tracking; không sửa Tracking trong đợt này |
| Whitespace | `git diff --check` | PASS; chỉ có Git line-ending notices LF/CRLF |

Tóm tắt terminal của vòng DB cuối:

```text
3 migrations found in prisma/migrations
Applying migration `20261103000000_init_payment`
Applying migration `20261103120000_inbound_retry_and_payout_operation`
Applying migration `20261107000000_admin_audit_refund_approval`
All migrations have been successfully applied.
Test Files  4 passed (4)
     Tests  37 passed (37)
Start at  16:45:31
Duration  8.06s
Container handygo-payment-test Removed
Network handygo-payment-test_default Removed
```

Migration mới cũng áp dụng CHECK rate 0–30%, earning >0 và metadata quyết định refund. Không chỉnh hai migration cũ. Migration mới chỉ được triển khai vào DB test trong phiên này; rollout DB có legacy rate >30%/earning 0 phải có quyết định chuyển đổi riêng, không tự sửa snapshot.

## Integration coverage

| File | Số test | Phạm vi |
| --- | --- | --- |
| `schema.int-spec.ts` | 12 | Schema isolation, one-payment/order, allocation sum, overlap/adjacency, 0%/30% accepted, >30%/100% rejected, earning 0 rejected, top-up 1:1 và refund amount dương |
| `payment-query.int-spec.ts` | 6 | JWT, Customer/Worker visibility, unrelated-user denial, pagination/filter, exact BIGINT, redaction, UUID validation |
| `payment-flows.int-spec.ts` | 4 | Migration inbound/payout, duplicate Order creation + snapshot, completed không charge, Point double-click → một attempt/success event |
| `admin-refunds.int-spec.ts` | 15 | Seed/version concurrency, refund reservation/decision/rollback, HTTP permissions/validation, DLQ replay và local report |

Các ca mới đáng chú ý chạy trên PostgreSQL thật:

1. Hai seed đồng thời tạo cùng một rule và đúng một audit; seed lại không thêm dữ liệu.
2. Actor/ngày khác bị từ chối; Order trước rollout không được áp rule hồi tố.
3. Hai Admin tạo version cùng thời điểm chỉ một thành công; interval trước đóng liền kề, snapshot Payment đã có không đổi; seed gốc vẫn no-op sau khi interval được đóng.
4. Refund Cash và Point đều có destination Point; approval chỉ needs_review, không wallet transfer/refundedAt/success event, Payment vẫn succeeded.
5. Hai partial requests 60/100 đồng thời chỉ một được reserve; tổng không vượt amount.
6. Hai request cùng idempotency key/payload tạo một refund; đổi payload trả conflict.
7. Hai quyết định đối nghịch chỉ một thành công; rejection giải phóng reservation; replay quyết định giống hệt không thêm audit.
8. Người ngoài không tạo được refund; payment chưa settled bị từ chối; requester/Customer không được tự duyệt.
9. Audit persistence thất bại làm rollback approval và metadata trong transaction.
10. HTTP Admin APIs trả 401 khi thiếu JWT, 403 khi thiếu role hoặc permission; Admin read không lộ failure details.
11. HTTP từ chối rate >30%, rate quá hai decimal, timestamp thiếu timezone, fractional/nonpositive/out-of-range amount và approve không phải boolean.
12. Replay dead event giữ ID/payload, ghi audit và chỉ schedule một lần; payload nhạy cảm không xuất hiện trong danh sách DLQ.
13. Hai lần tạo report cùng ngày Việt Nam chỉ một row; report ghi `walletLedgerCompared:false`; manual reconciliation ghi audit.

Unit tests bổ sung kiểm tra config seed thiếu/không hợp lệ, timezone/calendar date, permission/actor checks, commission cap/half-up/BIGINT, return handler không gọi IPN và merchant/status VNPAY.

## Các điều chưa được chứng minh hoặc chưa bật

- Wallet/Order trong payment flow tests là mock. Manual reconciliation HTTP test mock runner để kiểm tra authorization/audit. Không có bằng chứng Wallet ledger đã chuyển tiền thật.
- Chưa chạy RabbitMQ thật/ACK crash recovery, Payment–Wallet–Order end-to-end, live top-up ACK hoặc withdrawal claim/cancel race.
- Chưa chạy VNPAY merchant sandbox với credentials thật hoặc xác minh Gateway callback routing. Return endpoint hiện tồn tại ở Payment, không chứng minh URL public đã chạy.
- Chưa có funded refund/reversal contract, commission reversal/rounding và consumer full/partial event compatibility. Refund dispatch/completion tiếp tục fail-closed; chưa hoàn Point thực tế.
- Chưa có User Trust verified bank snapshot API/encryption contract; payout vẫn không dispatch bằng dữ liệu giả.
- Daily report là snapshot unresolved trong Payment tại lần quét đầu tiên của ngày Việt Nam; chưa so khớp balances/provider/ledger và không backfill ngày service ngừng hoạt động.
- UUID seed trong integration là fixture chỉ thuộc DB test; chưa cấp hoặc xác minh Admin/actor thật cho staging/prod. Chưa cung cấp rollout time production và chưa seed production.
- Retention 90 ngày/10 năm còn là đề xuất; không triển khai auto-delete.

## Bàn giao

Hướng dẫn chạy seed/config/API tại [README](../../../backend/apps/payment-service/README.md). Task còn mở và owner tại [checklist](../HG-51-PAYMENT-SERVICE-CHECKLIST.md) và [PO decisions](../PO-DECISIONS.md). Đợt này không tạo commit/PR và không đánh dấu HG-51 hoàn thành toàn bộ.
