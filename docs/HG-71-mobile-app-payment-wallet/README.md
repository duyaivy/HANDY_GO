# HG-71: Mobile Payment & Wallet

Phạm vi: ví và thanh toán Customer/Worker, dữ liệu qua API Gateway và kiểm thử mobile; gồm xác minh ngân hàng nội bộ cho rút tiền và snapshot số dư trước/sau giao dịch ở backend. Snapshot đã có trên `main` qua PR #92; giữ nguyên nội dung đó trên HG-71.

Trạng thái và giới hạn mới nhất: [Báo cáo ngày 21/11/2026](./BAO-CAO-TIEN-DO-VA-LOI-CON-LAI-2026-11-21.md). Walkthrough và quality-gates ngày 20/11 là bằng chứng tại thời điểm ghi nhận. Maestro, bộ Docker/seed cá nhân và công cụ sửa dữ liệu sandbox không thuộc phần mã bàn giao; không yêu cầu đồng đội cài Maestro.

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
