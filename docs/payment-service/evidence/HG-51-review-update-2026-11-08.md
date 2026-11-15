# HG-51 — evidence cập nhật theo review, 08/11/2026

Workspace dựa trên commit `41f8fbfd436d57508bf1ea1dc8f2a891824ea135` cùng thay đổi local chưa commit. Kết quả được chạy trực tiếp trong phiên này, ngày 08/11/2026, múi giờ Asia/Saigon. `pnpm-lock.yaml` đã được sửa từ trước phiên; không ghi đè thay đổi của người dùng.

## Phạm vi nghiệm thu đã thay đổi

Người dùng yêu cầu **mô phỏng thay vì VNPAY thật**. Vì vậy bằng chứng top-up dưới đây là mô phỏng xác nhận provider, không phải giao dịch merchant sandbox hoặc giao dịch ngân hàng thật. Review gốc và evidence 05/11, 07/11 được giữ nguyên để đối chiếu.

DB/HTTP/Wallet/ledger/hold và RabbitMQ chạy thật trong sandbox. Provider nạp và bank send được mô phỏng có marker rõ ràng, chỉ bật có chủ đích ở non-production. Bank ownership dùng fixture sandbox có quản lý trong test; adapter runtime gọi User Trust thật.

## Kết quả kiểm tra

| Lệnh/kiểm tra | Kết quả quan sát |
| --- | --- |
| `pnpm exec vitest run --silent` (toàn bộ default suite) | 197 file pass, 8 file skip; 1.491 test pass, 118 skip. Các test yêu cầu hạ tầng riêng vẫn skip theo cấu hình sẵn có. |
| `pnpm exec vitest run apps/payment-service/src/payouts/payouts.service.spec.ts` sau bổ sung 2 test phản hồi Wallet không xác nhận | 13/13 pass. Hai test mới được chạy riêng sau lần default suite phía trên. |
| `pnpm run test:integration:payment` | **51/51 pass, 6 file** trên PostgreSQL và RabbitMQ Docker thật. |
| `pnpm run typecheck` | Pass, gồm build TS và Prisma configs. Generated Tracking client bị thiếu ban đầu; đã generate local bằng script sẵn có, sau đó typecheck toàn backend pass. |
| `pnpm run typecheck:payment`, `pnpm run typecheck:wallet` | Pass. |
| `pnpm run lint` | Pass. |
| `pnpm run build` | Pass toàn bộ ứng dụng Nest. |
| `node --test deploy/production/tests/env-preflight.test.mjs` | 13/13 pass. |
| Migration inventory + budget validation | 10 service có migration; PRIMARY: 10 application connections + reserve 5 = limit 15. |
| Workflow YAML parse, `git diff --check` | Pass. |

## Bằng chứng liên service mới

`cross-service-transport.int-spec.ts` có 10 test sử dụng controller/client production, JWT RS256 test, Gateway auth/proxy thật, RabbitMQ thật và các schema DB riêng cho Payment/Wallet/Order:

- Top-up mock được tạo/confirm qua Gateway. Chỉ owner có JWT mới confirm; production trả 403, mock failure không có credit; public VNPAY callback không thể xác nhận mock.
- Success chỉ ở `credit_pending` trước khi Wallet ghi ledger và ACK. Duplicate confirm không cộng thêm Point.
- Dừng Wallet consumer trước khi publish: Payment giữ pending, broker giữ message. Khởi động consumer lại và gửi duplicate: đúng một ledger top-up, ACK đưa Payment về completed.
- Point thanh toán qua Wallet HTTP thật; Customer debit, Worker + Platform credit. Cash chỉ thu commission, không cộng Point thu nhập Worker. Success event qua RabbitMQ cập nhật Order paid; replay sau paid trả Payment cũ.
- Cả Point/Cash tạo hai partial refunds 40/60 qua Gateway, Admin JWT approve, Wallet credit thật, trạng thái cuối refunded. Approval replay không tạo thêm success event.
- Withdrawal qua Gateway, xác minh bank fixture qua HTTP, Wallet hold thật, event qua broker, Payment claim trước mock send, capture/release thật với success/failed/unknown. Unknown giữ hold; Admin resolve-sandbox có audit, không gửi lại.
- Cancel trước claim không có payout attempt. Cancel và claim chạy đồng thời ba lượt: mỗi withdrawal chỉ có một kết quả tiền cuối cùng, hold không âm và không send hai lần.

`funded-wallet-refunds.int-spec.ts` có 4 test dùng Payment/Wallet DB và internal HTTP thật:

- Point/Cash full bằng hai partial, balance tổng được bảo toàn, success outbox đúng một lần cho mỗi refund, replay không credit lặp.
- Wallet đã commit nhưng response bị mất: Payment giữ needs_review; lần reconcile tiếp theo lookup cùng operation và hoàn tất mà không credit lại.
- Cash thiếu quỹ: không credit. Sau khi fixture cấp nguồn sandbox, retry cùng refundId hoàn tất đúng một lần.

37 test cũ còn lại kiểm tra schema, query, payment flow, Admin/RBAC/commission/reservations; một số dùng Wallet/Order mocks. Không dùng các test đó thay cho bằng chứng transport thật nêu trên.

## Cấu hình chạy lại

Từ `backend/`, Windows:

```powershell
pnpm.cmd run test:payment:docker
# Hoặc giữ hạ tầng để debug:
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/payment-test-run.ps1 -KeepRunning
```

Docker Compose dùng file env test riêng, không tự đọc `.env` ứng dụng đang có lỗi định dạng. Database `handygo_hg51_payment_test`, port 55433, dữ liệu tmpfs; broker port 56674. Scripts đặt cả runtime URL và direct migration URL vào DB test local, không dùng direct URL của môi trường thật. `test:payment:docker` tự teardown; môi trường dựng thủ công trong phiên cũng được teardown sau kiểm tra.

Chạy demo top-up không cần VNPAY credentials:

1. Chỉ dùng DB/broker sandbox và cấu hình `TOPUP_MOCK_ENABLED=true` trên Payment lẫn Wallet; `NODE_ENV` phải khác production.
2. Customer gọi `POST /api/v1/payments/topups` với `amountVnd` là số nguyên và `idempotencyKey`.
3. Dùng ID nhận được để gọi `POST /api/v1/payments/topups/:id/simulate`, body `{ "outcome": "succeeded", "confirmSimulated": true }`, cùng JWT Customer.
4. Query trạng thái tới completed sau Wallet ACK. Kiểm tra balance và ledger có mô tả MOCK. `mock://` là marker, không phải trang checkout ngân hàng.

## CI và các giới hạn còn lại

- Đã đọc log run `42361870243`: lần chạy được quan sát ngày 08/11 có Detect Changes success, Backend CI failure ở `Migration owner classification missing or invalid: payment-service`. Đã sửa registry, schema/config CLI, script migrate/status, budget và topology callers; bổ sung bước integration Docker vào PR CI. Chưa push hoặc rerun GitHub Actions với thay đổi local, nên không báo remote CI xanh.
- Các test deployment Python import `fcntl` không chạy trên Windows. Yêu cầu chạy container Python Linux bị từ chối cấp quyền; không coi chúng đã pass. Inventory/budget độc lập và Node env-preflight đã chạy local; CI Linux sẽ chạy toàn bộ deployment suite.
- Broker/HTTP test phát cảnh báo MaxListeners của Node trong process test; các assert nghiệp vụ vẫn pass. Các log needs_review trong test failure/unknown/cancel là kết quả được kiểm tra, không phải giao dịch thành công giả.
- Không có merchant VNPAY thật, bank payout thật, production migration/seed hoặc cấp quyền trên hệ thống thật. Commission seed production vẫn cần actor và rollout timestamp được cung cấp rõ ràng.
- Cash refund sandbox dùng quỹ PLATFORM_FEES có nguồn, giữ commission receivable/snapshot; Finance cần duyệt chính sách đó trước khi dùng tiền thật. Không tự nạp quỹ trong runtime.
- Báo cáo reconciliation vẫn ghi `walletLedgerCompared=false`; chưa triển khai báo cáo tài chính độc lập so provider/ledger hoặc kiểm chứng restart cả cụm production.
