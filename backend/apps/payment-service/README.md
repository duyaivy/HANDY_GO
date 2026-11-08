# Payment Service

Payment điều phối thanh toán; Wallet sở hữu balance, ledger và hold. VND/Point là số nguyên chính xác, **1 Point = 1 VND**. Cập nhật bàn giao: **08/11/2026**.

Nguồn chính sách: [PO đã chốt](../../../docs/HandyGo_PO_Decisions_Final_VI.md). Theo dõi [phạm vi sandbox hiện tại](../../../docs/payment-service/PO-DECISIONS.md) và [evidence 08/11](../../../docs/payment-service/evidence/HG-51-review-update-2026-11-08.md). Theo yêu cầu mới, top-up mô phỏng cổng thanh toán; Wallet, ledger và RabbitMQ chạy thật trong sandbox. Đợt này sửa Payment, Wallet, Gateway, Auth và cấu hình triển khai.

## Tính năng và giới hạn

| Feature | Hành vi hiện tại |
| --- | --- |
| `order-events/` | `order.created` pre-create/snapshot phí; `order.completed` mở thanh toán; không tự charge. |
| `commission-rules/` | Snapshot theo `[effective_from,effective_to)`; rate 0–30%, mặc định seed 10%, ROUND_HALF_UP bằng bigint. Admin tạo version tương lai, đóng version trước; DB exclusion chống overlap. Không sửa Payment lịch sử. |
| `payment-orders/` | Customer chủ động chọn method/xác nhận Point; Worker được giao xác nhận Cash. Point chỉ succeeded sau Wallet commit; timeout tra cứu/retry cùng operation. Cash không cộng Point cho Worker, ghi công nợ hoa hồng. |
| `payment-query/` | Owner/Worker tra cứu, phân trang và BIGINT string. Admin có permission riêng được đọc Payment toàn hệ thống bằng projection đã che provider details. |
| `refunds/` | Full/partial, chỉ hoàn Point, Admin độc lập và audit. Point thu hồi từ settlement gốc; Cash debit quỹ Platform có nguồn. Retry cùng operation, chỉ completed sau xác minh ledger Wallet; thiếu nguồn/timeout giữ needs_review. |
| `topups/` | TOPUP_MOCK_ENABLED=true bật provider mô phỏng ở non-production; owner xác nhận qua API có JWT. Credit qua outbox/RabbitMQ/Wallet thật. VNPAY adapter vẫn kiểm tra signature/merchant/amount/status. Chỉ Wallet ACK mới completed; browser return không settlement. |
| `payouts/` | Snapshot sandbox xác minh owner/active qua User Trust; claim trước mock send, Wallet capture/release thật. Unknown giữ hold, Admin resolve sandbox có audit, không gửi lại. Mock mặc định tắt và bị chặn ở production. |
| `common/inbound/`, `common/outbox/` | Inbox/outbox giao dịch, retry có giới hạn, ACK sau persist lỗi; event ID có thể là string không phải UUID. |
| `reconciliation/` | Sweep Point attempts, commission, top-up, payout; Admin có thể yêu cầu chạy và audit. DLQ replay chỉ đổi dead → retrying, giữ ID/payload để inbox xử lý. Báo cáo một snapshot mỗi ngày Việt Nam về các bản ghi chưa xử lý, **chưa so khớp ledger Wallet/provider**. |

## HTTP API

Mọi đường dẫn bên dưới nằm sau `API_PREFIX` (mặc định `/api/v1`) và qua Gateway. Các API riêng tư dùng JWT RS256; không tin header role/user từ client.

| Method | Path | Quyền |
| --- | --- | --- |
| POST | `/payments` | Customer của Order; chọn method, không charge |
| POST | `/payments/:id/pay-with-points` | Customer, body `{ "confirm": true }` |
| POST | `/payments/:id/confirm-cash` | Worker được giao |
| GET | `/payments/me`, `/payments/:id`, `/payments/order/:orderId`, `/payments/:id/attempts` | Customer/Worker liên quan |
| GET | `/payments/admin/records`, `/payments/admin/records/:id` | Admin + `payment:read:all` |
| GET, POST | `/payments/admin/commission-rules` | Admin + `commission:manage` |
| POST, GET | `/payments/:id/refunds` | Customer của Payment |
| POST | `/payments/admin/:id/refunds` | Admin + `refund:create` |
| GET | `/payments/admin/:id/refunds` | Admin + `refund:read:all` |
| POST | `/payments/admin/refunds/:id/decision` | Admin + `refund:approve`, không tự duyệt |
| GET | `/payments/admin/operations/dead-letters` | Admin + `payment:dlq:replay`; metadata, không trả payload |
| POST | `/payments/admin/operations/replay` | Admin + `payment:dlq:replay` |
| GET, POST | `/payments/admin/operations/reports` (GET), `/payments/admin/operations/reconcile` (POST) | Admin + `payment:reconcile` |
| POST, GET | `/payments/topups`, `/payments/topups/:id` (GET) | User sở hữu |
| GET | `/payments/topups/vnpay/ipn` | Public callback, xác minh chữ ký provider |
| GET | `/payments/topups/vnpay/return` | Public, JSON hướng dẫn tra cứu; không xác nhận credit |

Auth phải cấp các permission dấu `:` trên JWT; không tự cấp chỉ vì có role Admin. Tên này là lựa chọn kỹ thuật theo quy ước hiện có, không phải bộ tên PO ký riêng. `refund:confirm` được dự trù, **chưa có endpoint** để Admin tự đánh dấu completed.

Body tạo commission: `{ "ratePercent": "10.00", "effectiveFrom": "2090-01-01T00:00:00+07:00", "description": "Lý do" }`. Chỉ chấp nhận ngày tương lai và timezone, rate tối đa hai chữ số thập phân. Không PATCH/DELETE rule lịch sử.

Body refund: `{ "amount": "100000", "idempotencyKey": "unique-request-key", "reason": "Lý do và tham chiếu bằng chứng" }`. Key toàn cục: replay phải khớp actor/payment/amount/reason; payload khác trả 409. Tổng reservation tính cả `pending`, `processing`, `needs_review`, `completed`; rejection (`cancelled`) giải phóng reservation. Body decision: `{ "approve": true, "reason": "Kết luận duyệt" }`; `false` để từ chối. Replay quyết định giống hệt không thêm audit.

Body replay DLQ: `{ "eventId": "original:event:id", "reason": "Đã sửa dependency" }`. Replay event không còn dead trả 409; worker retry phải được bật để thực thi. Body reconcile: `{ "reason": "Lý do đối soát" }`.

## Migration và seed commission có kiểm soát

Chạy trong `backend/` với Node >=22.6 (seed dùng `--experimental-strip-types`). PowerShell bị chặn script execution có thể dùng `pnpm.cmd`.

```powershell
pnpm run prisma:generate:payment
pnpm run prisma:migrate:payment
pnpm run prisma:status:payment
# Cung cấp DATABASE_URL_PAYMENT trỏ đúng môi trường trước các lệnh migrate/seed.
# Hai biến sau phải do người triển khai cung cấp, không dùng giá trị ví dụ làm quyết định rollout:
$env:COMMISSION_SEED_EFFECTIVE_FROM = '<ISO timestamp with timezone approved for this environment>'
$env:COMMISSION_SEED_ACTOR_ID = '<UUID of existing authorized Admin or audited system actor>'
pnpm run seed:payment:commission
```

Seed **không chạy khi startup** và không tự nạp `.env`; export biến trong shell/deployment job. Thiếu ngày/actor/DB URL thì từ chối trước khi kết nối. Script chỉ bootstrap DB chưa có rule; transaction ghi rule 10% và audit `commission_rule.seeded` cùng commit. Dùng cùng advisory lock với API Admin. Chạy lại cùng ngày/actor/rate trả `created:false`, kể cả khi interval đã được Admin đóng sau đó. Actor/ngày khác hoặc DB có rule khác bị từ chối; không tự ghi đè/chèn lịch sử. Client DB cần quyền INSERT trên rule/audit và SELECT; không cần quyền sửa bảng Auth.

Người triển khai phải kiểm tra UUID thuộc Admin thật/actor hệ thống đã được cấp quyền và ghi bằng chứng vào deployment record. Payment chỉ kiểm tra định dạng, **không thể chứng minh actor tồn tại từ UUID** và không truy vấn chéo DB Auth. Dev dùng Admin thật trong DB dev; integration test dùng fixture identity chỉ trong DB test. Staging/prod chưa seed trong phiên này vì chưa được cấp rollout time và actor.

Migration `20261107000000_admin_audit_refund_approval` thêm audit, approval metadata, báo cáo nội bộ và CHECK rate 0–30%/worker earning >0. **Preflight trước rollout**: nếu dữ liệu cũ có rate >30% hoặc earning =0, migration sẽ từ chối; cần quyết định chuyển đổi riêng, không sửa snapshot hồi tố. Không sửa hai migration đã có. Bản migration mới chỉ được chạy trên Docker test trong phiên này.

Order trước rollout không có rule hiệu lực tiếp tục retry rồi dead theo giới hạn hiện tại; không dùng ngày nhận event thay ngày tạo Order, không backdate seed. Sau khi có quyết định cho Order lịch sử, operator có quyền mới replay event, giữ ID gốc.

## Cấu hình và các gate tích hợp

| Biến | Ý nghĩa |
| --- | --- |
| `DATABASE_URL_PAYMENT` hoặc `DATABASE_URL` | Database của Payment, schema `payment_service`. |
| `COMMISSION_SEED_EFFECTIVE_FROM`, `COMMISSION_SEED_ACTOR_ID` | Chỉ dùng cho deployment seed, không có mặc định. |
| `INTERNAL_SERVICE_SECRET`, `UPSTREAM_TIMEOUT_MS`, `ORDER_SERVICE_URL`, `WALLET_SERVICE_URL` | Internal calls có auth/timeout. |
| `RABBITMQ_URL`, `RABBITMQ_EXCHANGE` | Broker; queue Payment `payment-service`. |
| `PAYMENT_INBOUND_RETRY_ENABLED`, `PAYMENT_INBOUND_MAX_ATTEMPTS` | Retry mặc định bật, tối đa 8; tắt trong test. |
| `PAYMENT_RECONCILER_ENABLED`, `PAYMENT_RECONCILER_INTERVAL_MS` | Sweep hiện mặc định 15s; tắt trong test. Mốc 60s trong tài liệu PO là đề xuất, chưa tự thay cấu hình vận hành. |
| `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_RETURN_URL`, `VNPAY_PAY_URL` | VNPAY sandbox; chưa đủ config trả 503. Không ghi secrets vào tài liệu/log. |
| `VNPAY_IPN_URL` | Giá trị đăng ký với merchant, adapter không tự đăng ký/đọc biến này. |
| `TOPUP_MOCK_ENABLED` | Bật trên Payment và Wallet sandbox; mặc định false, luôn bị chặn ở production. Không dùng chung ví quy đổi thật. |
| `PAYOUT_MOCK_ENABLED`, `PAYOUT_MOCK_OUTCOME` | Mock chỉ dev/sandbox, vẫn cần bank snapshot hợp lệ. |

VNPAY production public base theo PO là `https://handygo.duyaivy.id.vn/api/v1`, local qua Gateway `http://localhost:3000/api/v1`. Callback thật local cần HTTPS tunnel tới Gateway và merchant chấp thuận URL. Return handler JSON hiện đã tồn tại ở Payment nhưng **Gateway routes, cấu hình merchant và credentials chưa được xác minh**. Không public trực tiếp port 3007. Return handler không redirect tới URL do client đưa vào; người dùng phải query top-up của mình bằng JWT.

Refund đã nối Wallet qua funded contract và lookup ledger. Xem quyết định sandbox Cash compensation/commission tại [PO-DECISIONS.md](../../../docs/payment-service/PO-DECISIONS.md); cần Finance duyệt riêng trước khi dùng tiền thật.

User Trust sở hữu bank account verified. Snapshot cho mock chỉ lưu ID và kết quả xác minh, không lưu bank secret. Không tự xóa audit/event; retention vẫn cần quyết định riêng.

## Kiểm thử

```powershell
pnpm exec vitest run apps/payment-service/src
pnpm run typecheck:payment
pnpm run lint
pnpm exec nest build payment-service
pnpm exec vitest run --config vitest.config.e2e.ts apps/payment-service/test/app.e2e-spec.ts
pnpm run test:payment:docker
```

Docker test dùng PostgreSQL 16 (port 55433, DB handygo_hg51_payment_test, schema Payment/Wallet/Order riêng) và RabbitMQ (port 56674); tự teardown, -KeepRunning để debug. Suite mới chạy controller/client HTTP thật qua Gateway, JWT RS256, broker thật, funded refund và withdrawal thật. Một số suite cũ vẫn dùng mocks; xem evidence 08/11 để phân biệt.

## Questions to carry into the PR

Các phần còn mở và ranh giới nghiệm thu nằm tại [PO-DECISIONS.md](../../../docs/payment-service/PO-DECISIONS.md) và evidence 08/11. Không có deployment hoặc giao dịch ngân hàng thật trong đợt này.
