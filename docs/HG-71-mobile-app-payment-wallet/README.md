# HG-71: Mobile Payment & Wallet

Phạm vi: giao diện Customer và Worker, dữ liệu qua API Gateway và kiểm thử mobile. Không sửa mã backend.

## 📑 Danh mục Tài liệu Kế hoạch & Nghiệm thu

- 🌟 [Quy tắc nghiệp vụ chung (PO Approved)](./BUSINESS-RULES.md)
- 👷‍♂️ [**Kế hoạch triển khai phía THỢ (Worker Wallet & Payment Plan)**](./WORKER-WALLET-PAYMENT-PLAN.md)
- 🚀 [Báo cáo nghiệm thu & Walkthrough](./WALKTHROUGH.md) | [Bằng chứng quality-gates.json](./evidence/quality-gates.json)

| Phần (Customer) | Nội dung | Commit triển khai | Bằng chứng |
| --- | --- | --- | --- |
| [1](./PHAN-1-DATA-AND-API-CONTRACTS.md) | DTO, API, tiền tệ chính xác | `eff84c9` | API/formatter tests |
| [2](./PHAN-2-HOOKS-AND-STATE-MANAGEMENT.md) | Query, polling, retry/idempotency | `767ed6f` | Hook tests |
| [3](./PHAN-3-WALLET-BALANCE-AND-TOPUP-UI.md) | Thẻ ví, riêng tư, nạp VNPAY/sandbox | `1115b6c` | Card/modal/screen tests |
| [4](./PHAN-4-TRANSACTION-HISTORY-AND-FILTERS.md) | Lịch sử, bộ lọc, chi tiết | `62c31c4` | History/filter/detail tests |
| [5](./PHAN-5-PAYMENT-METHODS-SCREEN.md) | Phương thức và mặc định theo tài khoản | `1b1e0f9` | Methods screen tests |
| [6](./PHAN-6-ORDER-PAYMENT-INTEGRATION.md) | Nghiệm thu, thanh toán, nạp bù | `9540845` | Order/modal/card/hook tests |
| [7](./PHAN-7-E2E-TESTING-AND-POLISH.md) | Hồi quy toàn app, rà rules, bàn giao | Commit chứa tài liệu này | [Walkthrough](./WALKTHROUGH.md), [evidence](./evidence/quality-gates.json) |

[Quy tắc nghiệp vụ](./BUSINESS-RULES.md) và contract Phần 1 mô tả phương thức `point | cash`, số tiền nguyên dạng chuỗi, idempotency theo từng API. Khi có khác biệt trong các bản thiết kế ban đầu, mục “Triển khai theo API hiện tại” của từng phần ghi rõ cách đối chiếu.

Kiểm thử automated dùng API mock và runtime Jest. Các bước native trên thiết bị, VNPAY thật và backend đang phục vụ được tách rõ trong walkthrough; không coi kết quả Jest là nghiệm thu thiết bị.
