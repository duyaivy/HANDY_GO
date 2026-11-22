# HG-74 / Task 03 — API trạng thái và hiệu suất đơn hàng

## Mục tiêu

Triển khai `GET /api/v1/admin/dashboard/order-status` phục vụ biểu đồ trạng thái và hai tỷ lệ hoàn thành/hủy.

Nguồn nghiệp vụ: [tài liệu chốt](./TONG_HOP_CHOT_HG74_API_BE_DASHBOARD.md), mục 2, 3.3 và 4.

## Contract cần bàn giao cho frontend

- Quyền: Admin qua Gateway.
- Dùng bộ lọc thời gian chung của Task 01; mặc định `30days`, custom tối đa 365 ngày.
- Dữ liệu tối thiểu đề xuất: `totalOrders`, bốn nhóm `completed`, `processing`, `cancelled`, `disputed` (mỗi nhóm có `count` và `percentage`), cùng `completionRate`, `cancellationRate`. Có thể trả chi tiết từng status nếu frontend cần, nhưng không thay bốn nhóm đã chốt.
- Tỷ lệ là số phần trăm, làm tròn một chữ số thập phân. Không gắn ký tự `%` trong field số.

## Quy tắc tính

1. Lấy tập đơn có `Order.createdAt` trong kỳ. `totalOrders` là kích thước tập này.
2. Phân nhóm theo **trạng thái hiện tại** của từng đơn:

   | Nhóm | `Order.status` |
   | --- | --- |
   | `completed` | `completed` |
   | `processing` | `created`, `confirmed`, `in_progress`, `awaiting_customer_confirmation` |
   | `cancelled` | `cancelled` |
   | `disputed` | `disputed` |

3. Mỗi đơn thuộc đúng một nhóm; tổng bốn nhóm phải bằng `totalOrders`.
4. `completionRate = completed.count / totalOrders * 100` và `cancellationRate = cancelled.count / totalOrders * 100`. Nếu `totalOrders = 0`, cả hai bằng `0`.
5. Phần trăm từng nhóm cũng dùng `totalOrders` làm mẫu số và làm tròn một chữ số. Do làm tròn độc lập, tổng phần trăm hiển thị có thể lệch `100` tối đa do sai số làm tròn; tổng số lượng phải luôn khớp.

## Các bước thực hiện

1. Dựa vào enum `OrderStatus` trong `backend/apps/order-service/prisma/schema.prisma` để viết ánh xạ đủ bảy trạng thái hiện có; nhóm `disputed` phải tách riêng.
2. Truy vấn số lượng theo status từ các đơn có `createdAt` trong khoảng lọc. Tránh lọc theo thời điểm chuyển trạng thái, vì yêu cầu là trạng thái hiện tại của các đơn được tạo trong kỳ.
3. Xử lý các nhóm không có đơn bằng `count: 0`, tỷ lệ bằng `0`; tính tỷ lệ sau khi có tổng không làm tròn trung gian.
4. Thêm route Gateway, guard Admin, Swagger và ví dụ response.

## Tiêu chí nghiệm thu

- [x] Chỉ Admin gọi được API; bộ lọc ngày dùng cùng cách hiểu với các API khác.
- [x] Tập đơn và `totalOrders` khớp API overview trong cùng kỳ: cả hai cùng dùng `Order.createdAt` và khoảng `[start, endExclusive)`.
- [x] `disputed` hiện thành nhóm riêng; đơn tranh chấp không nằm trong `processing`.
- [x] Tổng số lượng bốn nhóm bằng `totalOrders` cho mọi dữ liệu.
- [x] Tỷ lệ hoàn thành/hủy chính xác theo mẫu số đơn tạo trong kỳ và làm tròn một chữ số.
- [x] Kỳ không có đơn trả bốn nhóm 0 và hai tỷ lệ 0.
- [x] Đơn tạo trong kỳ nhưng chuyển trạng thái sau kỳ vẫn được phân nhóm theo trạng thái hiện tại.

## Contract triển khai

`GET /api/v1/admin/dashboard/order-status` dùng Bearer token có role `ADMIN` qua Gateway. Bộ lọc `period`, `startDate`, `endDate` tái sử dụng từ Task 01: mặc định `30days`, kỳ tùy chỉnh tối đa 365 ngày và ranh giới ngày theo `Asia/Ho_Chi_Minh`.

Response dùng envelope `{ statusCode, message, data }`; ví dụ `data`:

```json
{
  "totalOrders": 100,
  "groups": {
    "completed": { "count": 60, "percentage": 60 },
    "processing": { "count": 20, "percentage": 20 },
    "cancelled": { "count": 10, "percentage": 10 },
    "disputed": { "count": 10, "percentage": 10 }
  },
  "performance": {
    "completionRate": 60,
    "cancellationRate": 10
  }
}
```

- Truy vấn `Order` theo `createdAt` trong kỳ và nhóm theo `status` **hiện tại**. Không dùng thời gian chuyển trạng thái. Vì vậy đơn tạo trong kỳ nhưng đổi trạng thái sau kỳ vẫn được phản ánh theo trạng thái mới.
- `created`, `confirmed`, `in_progress`, `awaiting_customer_confirmation` thuộc `processing`; ba trạng thái `completed`, `cancelled`, `disputed` mỗi loại có nhóm riêng. Enum hiện tại được ánh xạ đầy đủ; nếu enum thêm trạng thái, TypeScript yêu cầu cập nhật ánh xạ.
- `totalOrders` là tổng số đếm của bốn nhóm. Mỗi `percentage`, `completionRate`, `cancellationRate` dùng `totalOrders` làm mẫu số và làm tròn độc lập đến một chữ số thập phân. Tổng phần trăm hiển thị có thể lệch 100 do làm tròn; tổng **số lượng** phải khớp tuyệt đối.
- Khi không có đơn, bốn nhóm và hai tỷ lệ đều bằng `0`. Field tỷ lệ là số, không gồm ký tự `%`.

## Kiểm chứng

- Unit tests kiểm tra đủ bảy trạng thái, nhóm tranh chấp độc lập, tổng nhóm, làm tròn và kỳ rỗng.
- Test service kiểm tra truy vấn dùng `createdAt` và trạng thái hiện tại; HTTP test kiểm tra route, quyền Admin, bộ lọc ngày và response envelope.
- TypeScript check riêng HG-74 và build Order Service đã chạy thành công.
- Chưa kiểm thử tích hợp với PostgreSQL thật vì Docker daemon không hoạt động trong môi trường làm việc hiện tại.
