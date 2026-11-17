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
- Order Service gom số đơn trong PostgreSQL rồi dùng `ORDER BY COUNT(*) DESC FETCH FIRST 5 ROWS WITH TIES` để chỉ trả các thợ có số đơn **bằng hoặc cao hơn vị trí thứ năm**. Những nhóm thấp hơn không được tải về ứng dụng.
- Order Service gửi toàn bộ ứng viên trong **một** lần `POST /api/v1/internal/workers/dashboard-ranking`, body `{ "candidates": [{ "workerUserId": "<UUID>", "completedOrderCount": 2 }] }`, yêu cầu `x-internal-secret`. User Trust dùng một tham số JSON trong truy vấn PostgreSQL, ghép hồ sơ của chính service, xếp số đơn giảm dần, điểm hiện tại giảm dần (`NULLS LAST`) rồi `workerUserId` tăng dần, và chỉ trả tối đa 5 hồ sơ. Không lọc trạng thái active hiện tại. Các endpoint summary cũ giữ nguyên hành vi.
- Không còn vòng lặp HTTP theo từng 100 ID. Số lượt gọi User Trust là một, kể cả khi có nhiều thợ đồng hạng; timeout upstream là 5 giây. JSON parser của User Trust cho phép tối đa 16 MiB để tiếp nhận tập ứng viên lớn; vượt giới hạn hoặc lỗi upstream sẽ trả 503 tại Dashboard, không cắt bớt ứng viên để đoán thứ hạng. Chi phí payload vẫn tăng theo số ứng viên hòa hạng.
- Nếu một thợ có đơn nhưng hồ sơ không còn trong User Trust, vẫn giữ số đơn: `fullName = "Thợ không còn hồ sơ"`, `avatarUrl = null`, `averageRating = null`; điểm `null` xếp sau mọi điểm có giá trị khi số đơn bằng nhau. Thợ chưa có đánh giá nhưng vẫn có hồ sơ dùng trực tiếp `WorkerProfile.averageRating = 0`.
- Nếu User Trust không khả dụng hoặc trả dữ liệu sai contract, API trả lỗi thay vì công bố thứ hạng với điểm đoán. Không trả `ratingCount`.

## Kiểm chứng

- Tests kiểm tra ngày hoàn thành, giữ hòa ở vị trí thứ năm tại PostgreSQL, một lần gọi với 10.000 ứng viên đồng hạng, hồ sơ thiếu, kỳ rỗng và lỗi upstream/response sai.
- Test PostgreSQL dùng dữ liệu CTE giả lập để kiểm tra xếp hạng 10.000 ứng viên, ưu tiên số đơn trước điểm, điểm 0 trước hồ sơ thiếu và thứ tự ID. Test chỉ chạy khi có `DATABASE_URL_USER_TRUST`, không đọc hay ghi bản ghi nghiệp vụ.
- HTTP tests kiểm tra quyền Admin, bộ lọc ngày và bảo vệ endpoint nội bộ bằng secret.
- TypeScript check riêng HG-74, build Order Service và User Trust Service, và kiểm tra cú pháp Compose đã chạy thành công.
- Bộ kiểm tra xếp hạng đã chạy trên PostgreSQL thật qua kết nối cấu hình local; Docker daemon chưa hoạt động nên chưa chạy lại toàn bộ môi trường Compose.

### Benchmark cho kỳ 365 ngày — 2026-11-18

- Harness: `backend/scripts/tests/dashboard-workers.benchmark.spec.ts`, dùng bộ lọc custom `2025-11-18` đến `2026-11-17` theo giờ Việt Nam.
- 10.000 thợ, mỗi thợ có 365 đơn hoàn thành: tổng 3.650.000 đơn và toàn bộ thợ hòa ở ranh giới Top 5.
- Chạy truy vấn gom nhóm thực tế, gửi HTTP thật qua controller/guard/validation User Trust, rồi chạy truy vấn xếp hạng trên PostgreSQL. Dữ liệu bảng được thay bằng CTE giả lập; không đọc/ghi đơn hay hồ sơ nghiệp vụ.
- Một lần đo: **5.734 ms**, **1 request HTTP**, **1 truy vấn hồ sơ**, payload **820.016 byte**, kết quả đúng 5 thợ theo điểm hiện tại và ID. Thời gian đo bao gồm hai truy vấn SQL và HTTP, không gồm khởi động ứng dụng test.
- Đây là số đo workload giả lập tại môi trường kiểm thử, không phải cam kết độ trễ production hoặc benchmark I/O trên bảng đơn đã lưu. Chi phí payload vẫn tăng theo số thợ hòa hạng; giới hạn JSON 16 MiB và phản hồi lỗi 503 được mô tả ở contract bên trên.
