# HG-74 / Task 05 — API Top 5 dịch vụ

## Mục tiêu

Triển khai `GET /api/v1/admin/dashboard/top-services` trả tối đa 5 dịch vụ có nhiều đơn hoàn thành nhất trong khoảng lọc.

Nguồn nghiệp vụ: [tài liệu chốt](./TONG_HOP_CHOT_HG74_API_BE_DASHBOARD.md), mục 2, 3.5 và 4.

## Contract cần bàn giao cho frontend

- Quyền: Admin qua Gateway.
- Dùng bộ lọc thời gian chung của Task 01; mặc định `30days`, custom tối đa 365 ngày.
- Danh sách phần tử tối thiểu: `serviceId`, `name`, `iconUrl` (có thể `null`), `completedOrderCount`.
- Mục tiêu của widget là Top 5; nếu API hỗ trợ `limit`, mặc định 5 và không cho vượt 5 trong phạm vi task này. Không yêu cầu phần trăm.

## Quy tắc tính

- Chỉ lấy đơn `completed` có `completedAt` trong kỳ, nhóm theo `Order.serviceId`; mỗi đơn tính một lần cho dịch vụ của nó.
- Sắp xếp `completedOrderCount` giảm dần. Nếu bằng nhau, dùng `serviceId` làm khóa phụ ổn định; đây là quy tắc kỹ thuật, không thay tiêu chí xếp hạng chính.
- Tên và icon lấy từ dữ liệu dịch vụ hiện có của `catalog-service`; dịch vụ không còn active vẫn có thể có đơn lịch sử, nên không tự loại khỏi thống kê nếu không có yêu cầu nghiệp vụ khác.
- Trả danh sách rỗng khi không có đơn hoàn thành trong kỳ.

## Các bước thực hiện

1. Trong `order-service`, gom nhóm các `Order.serviceId` theo số đơn `completed` và `completedAt` trong kỳ.
2. Lấy `Service.name`, `Service.iconUrl` từ `catalog-service` qua API/RPC; đánh giá nhu cầu batch lookup để tránh một request cho mỗi dịch vụ. Không truy vấn trực tiếp database của catalog từ service khác.
3. Chọn Top 5 theo số lượng, ghép tên/icon và quy định cách xử lý dịch vụ cũ không còn hồ sơ catalog. Không làm mất số đơn do trạng thái `isActive` hiện tại.
4. Thêm route Gateway, guard Admin, Swagger và ví dụ dữ liệu cho frontend.

## Tiêu chí nghiệm thu

- [x] Chỉ Admin gọi được API; bộ lọc thời gian dùng đúng ngày giờ Việt Nam.
- [x] Chỉ đếm đơn hoàn thành theo `completedAt`; đơn tạo trong kỳ nhưng hoàn thành sau kỳ không được tính.
- [x] Mỗi dịch vụ xuất hiện một lần; số đơn và thứ tự giảm dần chính xác.
- [x] Trả tối đa 5 dịch vụ, có tên và icon nếu dữ liệu tồn tại; kỳ rỗng trả `[]`.
- [x] Không tự loại dịch vụ có đơn lịch sử chỉ vì hiện tại `isActive = false`.
- [x] Response không chứa phần trăm không được yêu cầu.

## Contract triển khai cho frontend

`GET /api/v1/admin/dashboard/top-services` yêu cầu Bearer token có role `ADMIN` qua Gateway. Dùng chung `period=today|7days|30days|custom`, `startDate`, `endDate` của Task 01. Mặc định `30days`; custom tối đa 365 ngày. Ranh giới ngày tính theo `Asia/Ho_Chi_Minh`. API luôn trả nhiều nhất 5 phần tử, không có tham số `limit`.

Response dùng envelope `{ statusCode, message, data }`; ví dụ:

```json
{
  "statusCode": 200,
  "message": "Thao tác thành công",
  "data": [
    {
      "serviceId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "name": "Vệ sinh nhà cửa",
      "iconUrl": null,
      "completedOrderCount": 58
    }
  ]
}
```

- Số đơn lấy từ `order-service`: `status = completed`, `completedAt` thuộc `[start, endExclusive)`, `groupBy(serviceId)`. Sắp xếp theo số đơn giảm dần, rồi `serviceId` tăng dần để thứ tự ổn định; lấy tối đa 5.
- `name` và `iconUrl` lấy từ `catalog-service` qua `GET /api/v1/internal/services/dashboard-summaries?ids=<UUID,...>`, dùng `x-internal-secret`. API nội bộ nhận tối đa 100 ID và không lọc `isActive`, nên dịch vụ đã ngừng hoạt động vẫn có trong thống kê.
- Dịch vụ đã bị xóa hẳn khỏi catalog vẫn giữ số đơn lịch sử; phần tử dùng `name: "Dịch vụ không còn hồ sơ"` và `iconUrl: null`. Nếu Catalog Service không khả dụng hoặc trả dữ liệu sai dạng, API trả lỗi 503 thay vì coi đó là hồ sơ đã xóa.
- Kỳ không có đơn hoàn thành trả `data: []`, không gọi Catalog Service. Response không có phần trăm.

## Kiểm chứng

- Test service kiểm tra truy vấn theo `completedAt`, trạng thái completed, `groupBy`, thứ tự hòa, giới hạn 5, cách ghép hồ sơ, kỳ rỗng, hồ sơ đã xóa và lỗi upstream.
- HTTP test kiểm tra route Admin, response envelope và xác thực ngày; Catalog test kiểm tra secret, UUID, giới hạn batch, projection tên/icon và không lọc `isActive`.
- TypeScript check riêng HG-74, test liên quan và build Order/Catalog Service đã chạy thành công.
- Chưa kiểm thử tích hợp với PostgreSQL thật vì Docker daemon không hoạt động trong môi trường làm việc.
