# HG-74 / Task 04 — API Top 5 thợ

## Mục tiêu

Triển khai `GET /api/v1/admin/dashboard/top-workers` trả tối đa 5 thợ có nhiều đơn hoàn thành nhất trong khoảng lọc.

Nguồn nghiệp vụ: [tài liệu chốt](./TONG_HOP_CHOT_HG74_API_BE_DASHBOARD.md), mục 2, 3.4 và 4.

## Contract cần bàn giao cho frontend

- Quyền: Admin qua Gateway.
- Dùng bộ lọc thời gian chung của Task 01; mặc định `30days`, custom tối đa 365 ngày.
- Danh sách phần tử tối thiểu: `workerUserId`, `fullName`, `avatarUrl` (có thể `null`), `completedOrderCount`, `averageRating`.
- Mục tiêu của widget là Top 5; nếu API hỗ trợ `limit`, mặc định 5 và không cho vượt 5 trong phạm vi task này. Không yêu cầu `ratingCount` hay trường thứ hạng riêng.

## Quy tắc tính

- Chỉ lấy đơn có `Order.status = completed` và `Order.completedAt` thuộc khoảng lọc. Đếm theo `Order.workerUserId`.
- Số đơn hoàn thành trong kỳ phải tính từ bảng Order; không dùng `WorkerProfile.completedOrderCount` vì đó là số tích lũy.
- Sắp xếp `completedOrderCount` giảm dần. Nếu bằng nhau, sắp xếp `WorkerProfile.averageRating` hiện tại giảm dần. Nếu vẫn bằng nhau, dùng `workerUserId` làm khóa phụ ổn định để kết quả không đổi thứ tự ngẫu nhiên.
- Họ tên và ảnh lấy từ hồ sơ người dùng hiện tại. Điểm đánh giá lấy trực tiếp từ `WorkerProfile.averageRating`, không lọc review theo ngày. Không trả số lượt đánh giá.
- Trả danh sách rỗng khi không có đơn hoàn thành trong kỳ.

## Các bước thực hiện

1. Trong `order-service`, gom nhóm đơn hoàn thành theo `workerUserId` với điều kiện `completedAt` thuộc kỳ đã chuẩn hóa.
2. Lấy tên, avatar, điểm đánh giá của các ID thợ qua API/RPC thuộc `user-trust-service` (schema có `User` và `WorkerProfile`). Kiểm tra khả năng dùng `internal/workers/batch-summary` hiện có; nếu thiếu field thì mở rộng contract nội bộ phù hợp, không truy vấn thẳng database của service khác.
3. Ghép dữ liệu, sắp xếp theo cả số đơn và điểm đánh giá **trước khi** lấy 5 phần tử. Nếu chỉ lấy 5 ID theo số đơn trước khi biết điểm, các ca đồng hạng ở ranh giới có thể bị chọn sai.
4. Quy định cách xử lý hồ sơ thợ không còn tồn tại hoặc không lấy được điểm, để API vẫn trả số liệu nhất quán; ghi rõ trong contract.
5. Thêm route Gateway, guard Admin, Swagger và ví dụ dữ liệu.

## Tiêu chí nghiệm thu

- [x] Chỉ Admin gọi được API; các kỳ lọc hoạt động đúng giờ Việt Nam.
- [x] Chỉ đếm đơn `completed` theo `completedAt`; đơn hoàn thành ngoài kỳ không được tính.
- [x] Mỗi thợ xuất hiện một lần, với số đơn đúng trong kỳ.
- [x] Thợ có số đơn bằng nhau được sắp theo điểm trung bình hiện tại; thứ tự ổn định khi vẫn hòa.
- [x] Trả tối đa 5 thợ; 0 thợ có đơn hoàn thành trả `[]`.
- [x] Tên, ảnh, điểm lấy từ hồ sơ hiện tại; không dùng điểm tính lại theo kỳ và không trả số lượt đánh giá.

## Contract triển khai

`GET /api/v1/admin/dashboard/top-workers` dùng Bearer token có role `ADMIN` qua Gateway. Bộ lọc `period`, `startDate`, `endDate` tái sử dụng từ Task 01: mặc định `30days`, kỳ tùy chỉnh tối đa 365 ngày và ranh giới theo `Asia/Ho_Chi_Minh`. Widget cố định tối đa 5 thợ, API không nhận tham số `limit`.

Response dùng envelope `{ statusCode, message, data }`; ví dụ `data`:

```json
[
  {
    "workerUserId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "fullName": "Nguyễn Văn An",
    "avatarUrl": null,
    "completedOrderCount": 58,
    "averageRating": 4.9
  }
]
```

- `completedOrderCount` đếm từ `order-service.Order`, lọc `status = completed` và `completedAt` trong khoảng `[start, endExclusive)`. Không dùng số đơn hoàn thành tích lũy trong hồ sơ thợ.
- Họ tên, ảnh và `WorkerProfile.averageRating` hiện tại lấy từ `user-trust-service` qua endpoint nội bộ `GET /api/v1/internal/workers/dashboard-summaries?ids=...`, yêu cầu `x-internal-secret`. Endpoint này nhận tối đa 100 ID/lần và không lọc thợ theo trạng thái active hiện tại, vì thợ không còn active vẫn có thể có đơn hoàn thành trong kỳ. Endpoint `batch-summary` cũ giữ nguyên hành vi.
- Order Service lấy đủ các thợ có số đơn **bằng hoặc cao hơn vị trí thứ năm**, tải hồ sơ theo lô tối đa 100 ID với tối đa 3 lô đồng thời, rồi mới xếp số đơn giảm dần, điểm hiện tại giảm dần và `workerUserId` tăng dần. Điều này xử lý đúng trường hợp nhiều thợ hòa ở ranh giới Top 5.
- Nếu một thợ có đơn nhưng hồ sơ không còn trong User Trust, vẫn giữ số đơn: `fullName = "Thợ không còn hồ sơ"`, `avatarUrl = null`, `averageRating = null`; điểm `null` xếp sau mọi điểm có giá trị khi số đơn bằng nhau. Thợ chưa có đánh giá nhưng vẫn có hồ sơ dùng trực tiếp `WorkerProfile.averageRating = 0`.
- Nếu User Trust không khả dụng hoặc trả dữ liệu sai contract, API trả lỗi thay vì công bố thứ hạng với điểm đoán. Không trả `ratingCount`.

## Kiểm chứng

- Unit tests kiểm tra ngày hoàn thành, số đơn, hòa ở vị trí thứ năm, điểm và ID khi hòa tiếp, hồ sơ thiếu, kỳ rỗng, chia lô hơn 100 ID và lỗi upstream.
- HTTP tests kiểm tra quyền Admin, bộ lọc ngày và bảo vệ endpoint nội bộ bằng secret.
- TypeScript check riêng HG-74, build Order Service và User Trust Service, và kiểm tra cú pháp Compose đã chạy thành công.
- Chưa kiểm thử tích hợp với PostgreSQL thật vì Docker daemon không hoạt động trong môi trường làm việc hiện tại.
