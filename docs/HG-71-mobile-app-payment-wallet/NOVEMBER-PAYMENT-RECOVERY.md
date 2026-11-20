# Khôi phục thanh toán sandbox cho đơn từ tháng 11/2026

Ngày kiểm chứng: **20/11/2026**, múi giờ Việt Nam (UTC+7).

## Nguyên nhân và thay đổi

Payment không được tạo vì rule hoa hồng đầu tiên chỉ có hiệu lực từ 01/12/2026. Các sự kiện `order.created` / `order.completed` đã chuyển sang dead letter sau khi hết lượt retry.

Theo yêu cầu của người dùng, bổ sung một rule **10.00%** cho khoảng **[01/11/2026 00:00, 01/12/2026 00:00)** UTC+7. Hai mốc lưu DB là `2026-10-31T17:00:00.000Z` và `2026-11-30T17:00:00.000Z`. Các rule tháng 12 và tháng 01/2027 được giữ nguyên.

Script `.github/scripts/hg71-november-payment-repair.mjs`:

- Chỉ chạy trong runtime development với payout mock và VNPAY sandbox.
- Khóa transaction cùng cơ chế quản lý commission hiện có; từ chối rule chồng lấn hoặc lịch tháng 12 khác bản đã kiểm tra.
- Ghi audit cho rule và mỗi sự kiện được đưa vào retry. Audit lưu tài khoản test yêu cầu sửa cùng GitHub operator/run thực hiện.
- Giữ nguyên ID/payload của sự kiện, chỉ khôi phục các lỗi thiếu rule/thiếu payment thuộc đơn tạo trong tháng 11.
- Không tạo settlement hay bút toán ví trực tiếp. Payment được tạo bởi inbox handler bình thường; khách thực hiện thanh toán trên app.
- Chế độ plan thực hiện SQL rồi rollback. Chạy lặp dùng lại rule tháng 11 đã tồn tại.

Rule mới: `6b854917-077a-4cbd-914e-3946efa12961`.

Đã khôi phục **8 sự kiện của 5 đơn**. Sau xử lý, Payment có 5 payment records, 5 `order.created` và 3 `order.completed` đã được consume; danh sách failed inbound events trống tại lần kiểm chứng.

## Bằng chứng deploy và SQL

| Kiểm tra | Kết quả |
|---|---|
| Node repair tests | 4/4 PASS: sandbox guard, dry-run/apply, rollback khi xung đột/audit lỗi, chạy lặp |
| Workflow actionlint và Python AST | PASS |
| [Plan với rollback](https://github.com/duyaivy/HANDY_GO/actions/runs/44771046723) | PASS, `applied: false`, 8 sự kiện |
| [Áp dụng sửa sandbox](https://github.com/duyaivy/HANDY_GO/actions/runs/44771193411) | PASS, `applied: true` |
| [Chẩn đoán sau sửa](https://github.com/duyaivy/HANDY_GO/actions/runs/44771492338) | PASS: runtime development, retry/reconciler bật, rule đúng khoảng ngày, không còn failed inbound |

Các thay đổi vận hành đã có trên nhánh release: `03cf47c403ccf2521bc91993cb673ffdb9a2bd36`, `ee71bd768dd5ec94ed34edb82784d4192e83e55b`.

## Thanh toán thực tế trên Android

Đơn **ORD-20261120-D38M** (`6ea60c9d-3e44-43e9-b579-720a743dd9e9`) đã hoàn thành trước khi thử thanh toán. Customer chạy trên `emulator-5554`; Worker trên `emulator-5556`. Cả hai dùng Gateway deploy `https://handygo.duyaivy.id.vn/api/v1` và số dư test.

Maestro mở màn hình thanh toán Customer, chọn ví HandyGo và bấm xác nhận **555.555đ**. App đã hiện “Thanh toán thành công! Đơn hàng đã hoàn tất.”

| Đối chiếu | Trước | Sau |
|---|---:|---:|
| Ví Customer | 5.000.000đ | **4.444.445đ** |
| Ví Worker | 5.200.000đ | **5.699.999đ** |
| Order paymentState | unpaid | **paid** |
| Payment | Chưa tồn tại → pending sau replay | **succeeded / point** |

- Payment ID: `3bc25f00-12e6-4426-a633-88a487b876ac`.
- Phí sàn: **55.556đ**; thu nhập thợ: **499.999đ**. BE làm tròn phí theo half-up, tổng phân bổ đúng 555.555đ.
- Sổ cái khách: đúng **1** `payment_debit` 555.555đ, ID `e98e8280-0ba0-4bc5-92c9-6974942f8522`.
- Sổ cái thợ: đúng **1** `worker_earning` 499.999đ, ID `30173e93-1e99-4c07-be31-f98d49a84c3f`.
- Cả hai bút toán `completed`, cùng reference payment ID. Không có khoản tạm giữ.

Hai flow kiểm chứng sau thanh toán đã **PASS**:

1. `verify-settled-payment.yaml`: Customer thấy **Đã thanh toán**, nút thanh toán lại không xuất hiện.
2. `verify-worker-earning.yaml`: Worker thấy **5.699.999đ**, mở được giao dịch thu nhập **499.999đ**.

Lần chạy flow thao tác thanh toán đầu tiên dừng tại assertion cuối vì nhãn “Đã thanh toán” nằm ngoài vùng cuộn; bước charge và hộp thoại thành công đã hoàn tất. Đã bổ sung scroll cho flow và kiểm chứng trạng thái bằng hai flow chỉ đọc phía trên, tránh lặp thao tác thanh toán của đơn đã trả tiền.

## Chạy lại kiểm tra trạng thái

Trong `mobile/`, với Maestro trong PATH và app đã đăng nhập đúng vai trò:

```powershell
maestro --device emulator-5554 test -e APP_ID=com.handygo -e ORDER_ID=6ea60c9d-3e44-43e9-b579-720a743dd9e9 .maestro/worker-wallet/verify-settled-payment.yaml
maestro --device emulator-5556 test -e APP_ID=com.handygo .maestro/worker-wallet/verify-worker-earning.yaml
```

`customer-pay-points.yaml` là flow thao tác trả tiền cho đơn test chưa thanh toán, có assertion tổng 555.555đ. Đơn trong báo cáo này đã thanh toán xong.

Artifacts cục bộ (không chứa token/mật khẩu, không đưa vào Git):

- `mobile/coverage/hg71-november-payment-before.json`
- `mobile/coverage/hg71-november-payment-ready.json`
- `mobile/coverage/hg71-november-payment-after.json`
- `mobile/coverage/maestro-worker/november-points-payment/`
- `mobile/coverage/maestro-worker/november-customer-paid/`
- `mobile/coverage/maestro-worker/november-worker-earning/`

Sandbox payment/wallet vẫn được bật theo yêu cầu. Để trở về cấu hình runtime gốc, chạy workflow ENV với mode `sandbox-disable`, ref `release`, confirm `SANDBOX_ONLY`. Thao tác này không xóa rule/audit/giao dịch đã thực hiện.
