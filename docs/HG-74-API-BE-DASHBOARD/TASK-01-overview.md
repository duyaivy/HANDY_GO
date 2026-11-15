# HG-74 / Task 01 — API tổng quan Dashboard

## Mục tiêu

Triển khai `GET /api/v1/admin/dashboard/overview` để cấp đúng bốn chỉ số trên Dashboard: tổng giá trị đơn hoàn thành, số đơn được tạo, số thợ hoạt động và tổng khách hàng tích lũy.

Nguồn nghiệp vụ: [tài liệu chốt](./TONG_HOP_CHOT_HG74_API_BE_DASHBOARD.md), mục 2, 3.1 và 4. Task này cũng đặt nền cho bộ lọc thời gian dùng chung ở cả năm API.

## Contract cần bàn giao cho frontend

- Quyền: Admin, xác thực qua Gateway theo cơ chế hiện tại.
- Query: `period=today|7days|30days|custom`; mặc định `30days`. Với `custom`, yêu cầu `startDate` và `endDate` dạng `YYYY-MM-DD`, ngày bắt đầu không sau ngày kết thúc, tối đa 365 ngày.
- Diễn giải ngày theo `Asia/Ho_Chi_Minh`. Chuẩn hóa thành khoảng truy vấn `[start, endExclusive)` để không bỏ sót bản ghi ở cuối ngày. Với kỳ chứa hôm nay, điểm cuối là thời điểm hiện tại.
- Giữ response envelope chuẩn của backend. Dữ liệu tối thiểu đề xuất:

```json
{
  "revenue": { "total": 125400000, "currency": "VND" },
  "orders": { "total": 1284 },
  "workers": { "activeInPeriod": 328 },
  "customers": { "totalCumulative": 2450 }
}
```

Chốt tên field thực tế trong Swagger/API contract khi triển khai. UI hiện không yêu cầu chỉ số `totalVerified` hay `newInPeriod`.

## Quy tắc tính

| Chỉ số | Nguồn và điều kiện |
| --- | --- |
| Doanh thu | `Order.agreedPrice` của các đơn `completed` có `completedAt` trong kỳ; cộng chính xác giá trị thập phân trước khi đưa về số VND. Không dùng `paymentState` để thay nghĩa của chỉ số này. |
| Tổng đơn hàng | Đếm `Order.id` có `createdAt` trong kỳ, mọi trạng thái. |
| Thợ hoạt động | Hợp nhất ID thợ đã gửi báo giá trong kỳ với ID thợ đã nhận ít nhất một đơn trong kỳ, rồi đếm ID duy nhất. Không dùng trạng thái online hay tổng thợ đã xác minh. |
| Khách hàng | Đếm khách đã đăng ký đến điểm cuối của kỳ; đây là số tích lũy, không lọc chỉ khách đăng ký trong kỳ. |

## Các bước thực hiện

1. Tạo DTO/logic chuẩn hóa bộ lọc thời gian dùng chung cho năm API; xử lý ngày không hợp lệ, thiếu ngày, kỳ vượt 365 ngày và ranh giới UTC/VN.
2. Dựa vào `backend/apps/order-service/prisma/schema.prisma`, viết truy vấn tổng giá trị đơn hoàn thành theo `completedAt` và số đơn theo `createdAt`.
3. Dựa vào `backend/apps/bidding-service/prisma/schema.prisma`, xác định nguồn thời điểm gửi báo giá (`Bid.submittedAt`, đồng thời kiểm tra luồng báo giá lại trong `BidRevision`). Xác định sự kiện/thời điểm thợ thực sự “nhận đơn” trong luồng Order/BookingProposal; không mặc nhiên lấy một mốc khác nghĩa. Tổng hợp và khử trùng lặp ID thợ giữa hai nguồn.
4. Xác định nguồn khách hàng chính xác giữa `auth-service` và `user-trust-service` (tài khoản/role hay `CustomerProfile`) để đếm một khách đúng một lần theo ngày đăng ký. Ghi rõ lựa chọn trong contract.
5. Kết nối các service bằng API/RPC hoặc cơ chế sẵn có; không import trực tiếp module nội bộ hay query database của service khác. Thêm tuyến Gateway và guard Admin theo mẫu `backend/apps/order-service/src/orders/admin-orders.controller.ts`.
6. Ghi Swagger/contract và ví dụ response thực tế cho frontend.

## Tiêu chí nghiệm thu

- [x] Chỉ Admin gọi được API; request không có quyền bị từ chối.
- [x] Cả bốn bộ lọc hoạt động và dữ liệu ở ranh giới ngày VN được tính đúng.
- [x] Doanh thu chỉ gồm đơn hoàn thành trong kỳ; không bị tính trùng và không làm tròn sớm.
- [x] Tổng đơn dùng ngày tạo và bao gồm cả đơn hủy/tranh chấp.
- [x] Một thợ gửi nhiều báo giá, nhận nhiều đơn hoặc làm cả hai chỉ được tính một lần.
- [x] Số khách là lũy kế đến cuối kỳ, kể cả khách đăng ký trước ngày bắt đầu.
- [x] Kỳ không có hoạt động trả doanh thu, số đơn và thợ hoạt động bằng `0`; khách hàng vẫn là số tích lũy đến cuối kỳ.
- [x] Contract ghi rõ nguồn và thời điểm dùng cho “gửi báo giá”, “nhận đơn”, “khách đăng ký”.

## Contract triển khai

`GET /api/v1/admin/dashboard/overview?period=30days` qua Gateway, Bearer token có role `ADMIN`. `period` mặc định `30days`; nhận `today`, `7days`, `30days`, `custom`. Với `custom`, bắt buộc `startDate`/`endDate` theo `YYYY-MM-DD`, tối đa 365 ngày. Các ngày được hiểu theo `Asia/Ho_Chi_Minh`; ngày kết thúc bao gồm cả ngày, nhưng kỳ chứa hôm nay dừng ở thời điểm request. Thời điểm truy vấn dùng khoảng nửa mở `[start, endExclusive)`.

Response dùng envelope `{ statusCode, message, data }` hiện hành. `data` có dạng:

```json
{
  "revenue": { "total": 125400000, "currency": "VND" },
  "orders": { "total": 1284 },
  "workers": { "activeInPeriod": 328 },
  "customers": { "totalCumulative": 2450 }
}
```

### Nguồn dữ liệu đã chọn

- `order-service.Order`: `agreedPrice`/`completedAt` của đơn `completed` cho doanh thu; `createdAt` cho số đơn và thợ đã nhận đơn. Trong luồng hiện tại, Order được tạo khi thợ **chấp nhận BookingProposal**, nên `Order.createdAt` là mốc thợ nhận đơn.
- `bidding-service.Bid.submittedAt` và `BidRevision.revisedAt`: hai mốc thợ gửi báo giá lần đầu hoặc báo giá lại. Endpoint nội bộ trả ID thợ duy nhất trong kỳ; Order Service hợp nhất với ID thợ nhận đơn rồi khử trùng lặp.
- `auth-service.Account.createdAt` cùng role `CUSTOMER` đã được gán trước điểm cuối kỳ: nguồn đăng ký tài khoản gốc. Đếm một Account một lần, không dùng ngày đồng bộ `CustomerProfile` của User Trust.
- Hai endpoint nội bộ `/api/v1/internal/admin/dashboard/workers-with-bids` và `/api/v1/internal/admin/dashboard/registered-customers` yêu cầu `x-internal-secret`. Nếu một nguồn không khả dụng, API trả lỗi thay vì hiển thị số 0 sai.
- Order Service cần `BIDDING_SERVICE_URL`, `AUTH_SERVICE_URL` và `INTERNAL_SERVICE_SECRET`. Compose phát triển đã cấu hình URL Auth; môi trường triển khai phải cung cấp URL nội bộ của hai service.

### Kiểm chứng

- Bộ lọc ngày, cộng số liệu và khử trùng lặp: unit tests trong `backend/apps/order-service/src/dashboard/`.
- Route HTTP, quyền Admin và response envelope: `dashboard-http.spec.ts`.
- Endpoint nội bộ Auth/Bidding: test controller tương ứng.
- TypeScript check riêng cho source HG-74 và build ba service đã chạy thành công. Prisma schema Order/Bidding đã được validate; migration thêm index cho các mốc thời gian được truy vấn.
- Chưa chạy kiểm thử tích hợp với PostgreSQL thật vì Docker daemon không hoạt động trong môi trường làm việc hiện tại.
