# Payment reconciliation and completion regression checks

Ngày kiểm tra: 10/11/2026 (Asia/Saigon).

## Kết quả

- `pnpm exec vitest run apps/payment-service/src/payment-reconciliation-regression.spec.ts`: **5/5 pass**.
- `pnpm run test:payment:docker`: **7 suite, 55/55 integration tests pass**, exit code 0.
- Migration `20261110160000_fair_reconciliation` được áp dụng thành công vào PostgreSQL test trước khi chạy suite.
- Script đã dừng và xóa container/network test sau khi hoàn tất.

## Phạm vi kiểm chứng

- Mô phỏng: Point/commission thứ 21 và payout thứ 11 được sweep thăm dù nhóm đầu chưa xử lý được; retry sau restart giữ operation ID; mất quyền claim thì không gọi Wallet.
- PostgreSQL thật: hai sweep đồng thời xử lý đủ 21 attempt chưa rõ kết quả, mỗi attempt được claim một lần trong cửa sổ retry.
- PostgreSQL thật: HTTP open chạy đồng thời với xử lý order.completed chỉ ghi một payment.pending; giữ timestamp gốc từ Order.
- PostgreSQL thật: outbox lỗi khiến cập nhật completion rollback.
- Suite cross-service chạy HTTP qua Gateway/JWT, các service tài chính và RabbitMQ thật; kiểm tra credit một lần, khôi phục khi consumer offline, withdrawal và race cancel/claim. Một số suite khác vẫn mock dependency.

Hạ tầng cô lập: PostgreSQL 16 tại localhost:55433, database handygo_hg51_payment_test; RabbitMQ tại localhost:56674. Không dùng database ứng dụng trong .env.

Provider top-up/payout trong suite vẫn mô phỏng. Kết quả này không chứng minh kết nối VNPay sandbox/production hoặc chuyển khoản ngân hàng thật, và không khẳng định đã kiểm thử mọi endpoint của hai service.

Log có MaxListenersExceededWarning từ kết nối socket; warning không làm suite thất bại. Các log needs_review/unknown xuất hiện trong những ca kiểm thử kết quả chưa rõ hoặc bị từ chối.
