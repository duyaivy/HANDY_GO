# HG-74 / Task 02 — API xu hướng đơn hàng

## Mục tiêu

Triển khai `GET /api/v1/admin/dashboard/order-trend` cung cấp chuỗi số đơn được tạo theo thời gian cho biểu đồ Dashboard.

Nguồn nghiệp vụ: [tài liệu chốt](./TONG_HOP_CHOT_HG74_API_BE_DASHBOARD.md), mục 2, 3.2 và 4.

## Contract cần bàn giao cho frontend

- Quyền: Admin qua Gateway.
- Dùng cùng bộ lọc `period`, `startDate`, `endDate` và cách tính ngày VN của Task 01. Mặc định `30days`; kỳ tùy chỉnh tối đa 365 ngày.
- Dữ liệu tối thiểu đề xuất: `granularity` (`hour|day|week|month`) và `timeline` gồm các phần tử `{ bucket, orderCount }` xếp tăng dần. Dùng định dạng bucket ổn định, ghi rõ múi giờ và ý nghĩa mốc tuần trong API contract.
- Backend chọn độ chi tiết phù hợp để biểu đồ dễ đọc. Mốc tham chiếu: hôm nay theo giờ; 7/30 ngày theo ngày; custom 1 ngày theo giờ, 2–31 ngày theo ngày, 32–90 ngày theo tuần, trên 90 ngày theo tháng. Nếu thay đổi ngưỡng, phải giữ đúng phạm vi ngày đã chọn và mô tả cho frontend.

## Quy tắc tính

- Chỉ đếm `Order.id` theo `Order.createdAt`, bất kể trạng thái hiện tại. Mỗi đơn tính đúng một lần.
- Mọi ranh giới giờ/ngày/tuần/tháng được xác định theo `Asia/Ho_Chi_Minh`, dù timestamp trong database lưu UTC.
- Mỗi bucket tương ứng một khoảng thời gian rõ ràng. Với tuần, xác định ngày đầu tuần là thứ Hai; bucket đầu/cuối có thể chỉ chứa phần nằm trong khoảng lọc.
- Trả đủ bucket trong khoảng hiển thị, kể cả bucket không có đơn (`orderCount: 0`); không trả bucket ngoài khoảng lọc.
- Với “Hôm nay”, không tính dữ liệu sau thời điểm request. Nếu UI dùng đủ 24 nhãn giờ, các giờ tương lai phải được mô tả rõ là 0 theo contract.

## Các bước thực hiện

1. Tái sử dụng bộ lọc thời gian và quyền Admin đã chuẩn hóa ở Task 01; tránh mỗi API hiểu khác nhau về ngày kết thúc.
2. Viết truy vấn gom nhóm trên `Order.createdAt` trong `order-service`, giới hạn bằng khoảng `[start, endExclusive)`. Kiểm tra cách database `date_trunc` và chuyển múi giờ để không chuyển đơn đầu ngày VN về ngày hôm trước.
3. Sinh danh sách bucket mong đợi từ khoảng lọc, ghép số đếm truy vấn vào và điền `0` cho bucket còn thiếu. Giữ thứ tự tăng dần.
4. Thêm route Gateway và controller/service tương ứng; tài liệu hóa Swagger cùng ví dụ `timeline` rỗng dữ liệu.

## Tiêu chí nghiệm thu

- [x] Chỉ Admin gọi được API; query ngày sai định dạng hoặc vượt 365 ngày bị từ chối.
- [x] Tổng `orderCount` trong các bucket bằng tổng số đơn tạo trong cùng kỳ của API overview: cả hai cùng dùng `Order.createdAt` và cùng khoảng `[start, endExclusive)`.
- [x] Đơn ở sát nửa đêm giờ Việt Nam thuộc đúng ngày; tuần/tháng chuyển mốc đúng.
- [x] Biểu đồ có đủ mốc không phát sinh đơn với giá trị 0 và được sắp xếp tăng dần.
- [x] Kỳ rỗng vẫn trả timeline đủ mốc và không lỗi chia nhóm.
- [x] Độ chi tiết và định dạng `bucket` được ghi rõ để frontend vẽ trục thời gian.

## Contract triển khai

`GET /api/v1/admin/dashboard/order-trend` dùng Bearer token có role `ADMIN` qua Gateway. Bộ lọc `period`, `startDate`, `endDate` tái sử dụng từ Task 01: mặc định `30days`, kỳ tùy chỉnh tối đa 365 ngày và mọi ranh giới ngày tính theo `Asia/Ho_Chi_Minh`.

Response dùng envelope `{ statusCode, message, data }`; ví dụ `data`:

```json
{
  "granularity": "day",
  "timeline": [
    { "bucket": "2026-11-14", "orderCount": 4 },
    { "bucket": "2026-11-15", "orderCount": 0 }
  ]
}
```

| `granularity` | Khi dùng | Định dạng `bucket` |
| --- | --- | --- |
| `hour` | Hôm nay; custom 1 ngày | `YYYY-MM-DDTHH:00+07:00` |
| `day` | 7 ngày, 30 ngày; custom 2–31 ngày | `YYYY-MM-DD` |
| `week` | Custom 32–90 ngày | `YYYY-MM-DD` của **thứ Hai** đầu tuần theo giờ Việt Nam |
| `month` | Custom 91–365 ngày | `YYYY-MM` |

- Bucket tuần/tháng đầu hoặc cuối có thể chỉ chứa một phần thời gian trong kỳ. Riêng nhãn tuần đầu có thể là ngày thứ Hai **trước** `startDate`; số đếm vẫn chỉ lấy các đơn trong khoảng lọc.
- Với kỳ chứa hôm nay, chỉ trả bucket đã bắt đầu trước thời điểm request; không tạo bucket của giờ/ngày tương lai. Ngay đúng 00:00, trả một bucket hiện tại với `orderCount: 0`.
- Mọi trạng thái đơn được tính, mỗi `Order.id` một lần theo `createdAt`. Truy vấn PostgreSQL nhóm thời gian bằng `AT TIME ZONE 'Asia/Ho_Chi_Minh'`; backend điền mốc thiếu bằng 0.
- Thứ tự `timeline` tăng dần theo bucket. Khi không có đơn, timeline vẫn có đầy đủ mốc với `orderCount: 0`.

## Kiểm chứng

- Unit tests kiểm tra ngưỡng giờ/ngày/tuần/tháng, ranh giới nửa đêm Việt Nam, tuần bắt đầu thứ Hai, tháng, điền mốc 0 và tổng số bucket.
- HTTP test kiểm tra route, quyền Admin, query sai và response envelope.
- TypeScript check riêng HG-74 và build Order Service đã chạy thành công.
- Chưa kiểm thử SQL trên PostgreSQL thật vì Docker daemon không hoạt động trong môi trường làm việc hiện tại.
