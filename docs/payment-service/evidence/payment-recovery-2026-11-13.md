# Payment recovery / Wallet terminal failure — 2026-11-13

## Phạm vi

Thực thi hai phần còn mở trong review PR #63: recovery dữ liệu lịch sử thiếu `payment.pending` và lưu kết quả Wallet debit thiếu tiền. Nền trước thay đổi là commit `8964472` trên `feature/HG-51-payment-service`.

Không thêm migration: tận dụng `WalletTransfer.status = failed` và metadata. Giữ các fix retry fairness, row lock completion/outbox trong commit `8b6610c`. Payment đã có finalization/reuse attempt dưới row lock nên không cần sửa `PaymentOrdersService`; bổ sung đọc mã lỗi Wallet và kiểm chứng bằng integration thật.

## Môi trường local

- PostgreSQL 16 trong container Wallet test hiện có, host `127.0.0.1:55432`.
- Tạo database riêng `handygo_hg51_payment_test`; áp dụng thành công toàn bộ migration Payment (5), Wallet (6), Order (3), gồm `fair_reconciliation`.
- Wallet suite dùng database `handygo_wallet_test` riêng; áp dụng 6 migration Wallet trước test.
- RabbitMQ 3.13 test trên cổng 56672. Suite transport cho phép `PAYMENT_TEST_RABBITMQ_URL` có guard localhost và cổng test, thay vì bắt buộc bật broker thứ hai trên 56674.
- Node 22.16.0; dependencies đã có trong workspace. Không xóa volume hoặc teardown các container người dùng đã bật. Ledger fixture append-only của Payment suite giữ trong database test.

## Kết quả xác minh cuối

| Kiểm tra | Kết quả |
| --- | --- |
| Unit/service Payment, Wallet, internal Order và common outbox, `--maxWorkers=4` | **41 file, 237/237 pass** |
| Toàn bộ Payment integration, PostgreSQL/HTTP/RabbitMQ thật | **9 file, 72/72 pass** |
| Toàn bộ Wallet integration | **7 file, 77/77 pass** |
| `typecheck:payment`, `typecheck:wallet` | Pass |
| `nest build payment-service`, `nest build wallet-service` | Pass |
| Backend lint | Exit 0; 10 warning có sẵn tại User Trust/Message, không thuộc các file sửa |
| Lint riêng CLI/helper recovery | Pass |
| `git diff --check` | Pass |

Lệnh unit:

```powershell
pnpm.cmd exec vitest run apps/payment-service/src apps/wallet-service/src apps/order-service/src/internal libs/common/src/outbox --maxWorkers=4
```

Payment suite chạy `pnpm.cmd run test:integration:payment` sau khi export các URL Payment/Wallet/Order tới **database Payment test riêng**, `PAYMENT_TEST_RABBITMQ_URL` và `RABBITMQ_URL` tới broker test 56672. Wallet suite chạy `pnpm.cmd run test:integration:wallet` với `scripts/wallet-test-env.ps1`. Xem [runbook](../payment-recovery-runbook.md) để phân biệt các môi trường.

## Bằng chứng cho từng phần

`payment-pending-backfill.int-spec.ts` có 8 test:

- Chạy CLI thật ở dry-run/apply/replay; từ chối report đã tồn tại trước khi ghi DB.
- Dry-run không sửa Payment/outbox/audit; apply yêu cầu manifest có bằng chứng downstream.
- 6 backfill đồng thời và chạy lại chỉ tạo **1 event + 1 audit**, payload bằng `paymentPendingEvent()` v1; không thay đổi Payment.
- Không tạo lại pending event đã published/pending/retry/failed; bỏ qua terminal, settlement settled và attempt đang xử lý.
- Backfill đợi row lock rồi thấy settlement đồng thời đã thành công nên không ghi pending.
- Audit lỗi làm outbox rollback; batch có cursor tiếp tục đúng ID.

`point-debit-recovery.int-spec.ts` có 9 test:

- Thiếu số dư khả dụng do reserved balance: operation failed được lưu/tra cứu qua HTTP, không có posting/event và số dư không đổi.
- Thiếu tiền → Payment/attempt failed → nạp thêm → replay operation cũ vẫn failed → 6 xác nhận đồng thời chỉ tạo 1 attempt mới thành công và 1 debit.
- Timeout HTTP thật được tạo bằng trì hoãn response **sau khi Wallet đã commit**, kiểm chứng cả failed và completed; GET operation chốt đúng kết quả và replay không debit thêm.
- Lỗi DB khi ghi posting làm rollback transfer/số dư/ledger; Payment giữ processing, thử lại đúng attempt sau khi dependency hồi phục.
- Kết quả chưa rõ/GET missing giữ operation ID cũ; reconciliation và HTTP cùng chạy không double debit.
- 6 request cùng operation thiếu tiền đọc cùng failure đã lưu; payload khác không được dùng lại ID.
- Commission thiếu tiền không bị lưu terminal failure và có thể retry đúng ID sau khi đủ tiền.
- Refund chỉ chọn debit completed sau một attempt failed; attempt Point failed không cản refund Cash sandbox khi sau đó chọn Cash.

Wallet test double spend cũ được cập nhật theo contract mới: hai debit khác operation cạnh tranh cùng số dư trả **1 completed + 1 failed**, failure tra cứu được và không có posting; số dư không âm, chỉ một debit và tổng Point bảo toàn.

## Kiểm kê dữ liệu local đang sử dụng

Đã chạy CLI dry-run trên `handygo_payment_local`, cổng **55434**, tách biệt database test:

- Run ID: `42e8fd74-fbba-426b-bab1-ae38e98fc9e1`.
- Cutoff: `2026-11-13T08:29:09.181Z`.
- Scanned: **0 Payment có orderCompletedAt** trong phạm vi; counts rỗng, không còn batch tiếp.
- Không có dữ liệu local đủ điều kiện để apply; không thay đổi dữ liệu ở database này.
- Report gốc lưu local tại `backend/.tmp/payment-pending-local-inventory-2026-11-13.json` (không commit dữ liệu vận hành).

Backfill thực tế có mutation chỉ chạy trên fixture của database test, với manifest/audit. Chưa kiểm kê hoặc sửa dữ liệu staging/production. Recovery production cần inventory và bằng chứng downstream của chính môi trường đó; các Payment terminal xử lý riêng theo trạng thái hiện tại, không phát pending cũ.

## Giới hạn xác minh

Đã thử suite unit toàn backend: **1.743 passed, 1 failed, 120 skipped; 12 file failed, 213 passed, 9 skipped**. Các file Message không import được vì workspace thiếu `@prisma/message-client`, `socket.io` và `socket.io-client`; một test common outbox timeout khi chạy toàn bộ song song. Test common outbox sau đó pass trong lượt 237 test có giới hạn 4 worker. Không đổi dependency hay mã Message trong task này, không khẳng định toàn backend xanh.

Suite transport có cảnh báo socket MaxListenersExceededWarning nhưng hoàn tất với exit 0. Test lỗi posting cố ý phát sinh log lỗi DB để chứng minh rollback; đây không phải test thất bại.

Provider top-up/payout vẫn sandbox/mô phỏng; không kiểm chứng VNPay hoặc ngân hàng thật. Row lock bảo vệ transaction tại Payment; broker không bảo đảm thứ tự đến toàn hệ thống. Subscriber/inbox/retention của môi trường đích phải được đối chiếu trước khi duyệt manifest. CLI không tự xác minh actor qua Auth và không tự sửa projection downstream của bản ghi terminal.
