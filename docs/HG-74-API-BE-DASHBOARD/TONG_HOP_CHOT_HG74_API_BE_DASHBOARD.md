# Tổng hợp nội dung đã chốt — HG-74 Backend API Admin Dashboard

> Tài liệu tổng hợp yêu cầu từ đặc tả Jira **HG-75 Web Admin dashboard** và phản hồi của Như về đề xuất điều chỉnh API cho HG-74. Nội dung nghiệp vụ dưới đây là căn cứ triển khai; phần thiết kế kỹ thuật được để linh hoạt theo kiến trúc backend hiện tại.

## 1. Mục tiêu

Xây dựng backend API cung cấp số liệu cho Admin Dashboard HandyGo. Dashboard có các khối:

1. Bốn chỉ số tổng quan: doanh thu, tổng đơn hàng, thợ hoạt động, khách hàng.
2. Xu hướng số đơn hàng theo thời gian.
3. Cơ cấu trạng thái đơn hàng.
4. Tỷ lệ hoàn thành và tỷ lệ hủy.
5. Tối đa 5 thợ có hiệu suất tốt nhất.
6. Tối đa 5 dịch vụ phổ biến nhất.

Các khối thống kê dùng chung khoảng thời gian được chọn.

## 2. Khoảng thời gian, múi giờ và biểu đồ

### Khoảng thời gian

- **Hôm nay:** từ 00:00 giờ Việt Nam đến thời điểm hiện tại.
- **7 ngày:** 7 ngày gần nhất, gồm hôm nay.
- **30 ngày:** 30 ngày gần nhất, gồm hôm nay; là lựa chọn mặc định trong đề xuất API.
- **Tùy chỉnh:** ngày bắt đầu và ngày kết thúc do Admin chọn; tối đa 365 ngày.

### Múi giờ và mốc biểu đồ

- Dùng múi giờ `Asia/Ho_Chi_Minh` (UTC+7) cho ranh giới ngày và thống kê.
- Độ chi tiết xu hướng có thể là giờ, ngày, tuần hoặc tháng. Đề xuất ban đầu: hôm nay theo giờ; 7/30 ngày theo ngày; tùy chỉnh tự chọn theo độ dài khoảng thời gian (1 ngày theo giờ, 2–31 ngày theo ngày, 32–90 ngày theo tuần, trên 90 ngày theo tháng).
- Có thể điều chỉnh cách chia mốc để biểu đồ dễ đọc, miễn dữ liệu vẫn bao phủ đúng khoảng lọc.
- Sắp xếp mốc thời gian tăng dần và trả về giá trị `0` cho mốc không có đơn.

## 3. Quy tắc nghiệp vụ đã chốt

### 3.1. Bốn thẻ tổng quan

- **Doanh thu:** tổng `agreedPrice` của các đơn có trạng thái `completed` và `completedAt` nằm trong khoảng lọc. Đây là tổng giá trị đơn hoàn thành, chưa khẳng định là doanh thu thực nhận của nền tảng.
- **Tổng đơn hàng:** số đơn có `createdAt` trong khoảng lọc, không phân biệt trạng thái.
- **Thợ hoạt động:** số thợ duy nhất trong khoảng lọc đã gửi ít nhất một báo giá **hoặc** nhận ít nhất một đơn. Một thợ chỉ tính một lần, dù có nhiều báo giá/đơn. Thợ đang hoạt động nhưng không có báo giá hoặc đơn trong kỳ không được tính.
- **Khách hàng:** tổng số khách đã đăng ký tính đến hết ngày kết thúc của khoảng lọc. Đây là số tích lũy, không phải chỉ số khách mới trong kỳ.

### 3.2. Xu hướng đơn hàng

- Đếm đơn theo `createdAt` trong khoảng lọc, bao gồm mọi trạng thái; mỗi đơn tính một lần.
- Gom theo độ chi tiết phù hợp với khoảng lọc, sắp xếp thời gian tăng dần và điền đủ các mốc không có đơn với số lượng `0`.

### 3.3. Trạng thái đơn và hiệu suất

Thống kê các đơn được tạo trong khoảng lọc, phân nhóm theo **trạng thái hiện tại**. Mỗi đơn thuộc đúng một nhóm:

| Nhóm hiển thị | Trạng thái |
| --- | --- |
| Hoàn thành | `completed` |
| Đang xử lý | `created`, `confirmed`, `in_progress`, `awaiting_customer_confirmation` |
| Đã hủy | `cancelled` |
| Tranh chấp | `disputed` |

- Tổng số đơn của bốn nhóm phải bằng tổng số đơn được thống kê trong kỳ.
- Tỷ lệ hoàn thành = số đơn hiện ở trạng thái hoàn thành / tổng số đơn được tạo trong kỳ × 100%.
- Tỷ lệ hủy = số đơn hiện ở trạng thái đã hủy / tổng số đơn được tạo trong kỳ × 100%.
- Làm tròn tỷ lệ đến một chữ số thập phân. Nếu kỳ không có đơn, các tỷ lệ bằng `0%`.
- Nhóm tranh chấp hiển thị riêng, không gộp vào đang xử lý.

### 3.4. Top 5 thợ

- Chỉ tính đơn hoàn thành có `completedAt` trong khoảng lọc, nhóm theo thợ.
- Xếp số đơn hoàn thành từ cao xuống thấp; nếu bằng nhau, thợ có điểm đánh giá trung bình cao hơn xếp trước.
- Điểm đánh giá lấy từ điểm trung bình hiện tại trong hồ sơ thợ (`WorkerProfile.averageRating`), không tính lại theo kỳ lọc. Khi `ratingCount = 0`, trả điểm `null` và xếp sau thợ có điểm khi số đơn bằng nhau.
- Trả tối đa 5 thợ. Mỗi thợ gồm định danh, họ tên, ảnh đại diện nếu có, số đơn hoàn thành và điểm đánh giá trung bình. Không cần trả số lượt đánh giá.

### 3.5. Top 5 dịch vụ

- Chỉ tính đơn hoàn thành có `completedAt` trong khoảng lọc, nhóm theo dịch vụ.
- Xếp theo số đơn hoàn thành giảm dần, trả tối đa 5 dịch vụ và mỗi dịch vụ chỉ xuất hiện một lần.
- Thông tin hiển thị gồm định danh, tên, hình/icon đại diện nếu có và số đơn hoàn thành. Không yêu cầu phần trăm.

## 4. API đề xuất

Phản hồi của Như đồng thuận với phương án chia 5 API theo các khu vực Dashboard. Các đường dẫn đề xuất:

| Endpoint | Nội dung |
| --- | --- |
| `GET /api/v1/admin/dashboard/overview` | Bốn chỉ số tổng quan |
| `GET /api/v1/admin/dashboard/order-trend` | Xu hướng đơn hàng |
| `GET /api/v1/admin/dashboard/order-status` | Bốn nhóm trạng thái và tỷ lệ hoàn thành/hủy |
| `GET /api/v1/admin/dashboard/top-workers` | Top thợ |
| `GET /api/v1/admin/dashboard/top-services` | Top dịch vụ |

Các API nhận chung bộ lọc thời gian. Có thể dùng `period=today|7days|30days|custom`, cùng `startDate` và `endDate` cho kỳ tùy chỉnh. Kỳ tùy chỉnh yêu cầu đủ hai ngày hợp lệ và không vượt 365 ngày. Quyền truy cập dành cho Admin.

Năm endpoint và đường dẫn là phương án đã thống nhất ở mức đặc tả. Backend có thể điều chỉnh cấu trúc response, cách tổ chức service và cách truy vấn để phù hợp kiến trúc hiện có, miễn đáp ứng đầy đủ quy tắc nghiệp vụ và frontend nhận dữ liệu nhất quán.

## 5. Tiêu chí hoàn thành

- [ ] Các bộ lọc Hôm nay, 7 ngày, 30 ngày và Tùy chỉnh hoạt động; kỳ tùy chỉnh tối đa 365 ngày.
- [ ] Ranh giới ngày và các số liệu dùng đúng múi giờ Việt Nam.
- [ ] Bốn chỉ số tổng quan tuân theo quy tắc ở mục 3.1.
- [ ] Xu hướng tính theo ngày tạo đơn, có đủ mốc và điền `0` khi không có đơn.
- [ ] Trạng thái có đủ bốn nhóm, gồm tranh chấp; tổng nhóm khớp tổng đơn.
- [ ] Tỷ lệ hoàn thành/hủy dùng mẫu số là tổng đơn tạo trong kỳ; kỳ rỗng trả `0%`.
- [ ] Top thợ và dịch vụ dựa trên ngày hoàn thành; Top thợ xử lý điểm hòa theo điểm trung bình hiện tại.
- [ ] API được bảo vệ bằng xác thực và phân quyền Admin theo cơ chế backend hiện hành.
- [ ] Cấu trúc response và API được ghi lại để frontend tích hợp.

## 6. Nguồn chốt và phạm vi quyết định kỹ thuật

- Đặc tả gốc: `API-BE-DASHBOARD.pdf` (HG-75 Web Admin dashboard).
- Phản hồi nghiệp vụ: `cmt-Nhu.pdf`.
- Khi có khác biệt về quy tắc nghiệp vụ, các điều chỉnh nêu trong phản hồi của Như được áp dụng cho bản tổng hợp này. Phương án 5 endpoint được giữ theo đề xuất đã phản hồi; backend vẫn chủ động chi tiết triển khai phù hợp kiến trúc.
