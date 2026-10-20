# Kiểm thử nhanh sự kiện Notification trên cloud/staging

Chạy sự kiện mô phỏng `order.created` từ thư mục gốc repository. Lệnh tự nạp các biến từ file `.env` ở thư mục gốc; biến đã export trong shell sẽ được ưu tiên:

```bash
pnpm run test:notification:cloud-event
```

Lệnh này gửi sự kiện đến topic exchange RabbitMQ cloud/staging đã cấu hình, sau đó đọc hai thông báo được tạo qua Notification API đã triển khai. Lệnh không kết nối trực tiếp PostgreSQL, không khởi động Docker, không tạo database local và không thay đổi cấu hình triển khai service. Chỉ dùng **môi trường development, test hoặc staging**, tuyệt đối không dùng production. Mỗi lần chạy sẽ tạo hai thông báo kiểm thử chưa đọc; hãy dùng tài khoản Customer và Worker dành riêng cho kiểm thử.

Cấu hình các biến môi trường trong shell hoặc secret manager trước khi chạy:

| Variable | Value |
| --- | --- |
| `NOTIFICATION_TEST_TARGET` | Tên môi trường chính xác: `development`, `test` hoặc `staging` |
| `NOTIFICATION_TEST_SEND_CONFIRM` | Nhập lại đúng giá trị của target. Cần xác nhận này trước khi gửi sự kiện. |
| `NOTIFICATION_TEST_RABBITMQ_URL` | URL broker của **test vhost** thuộc môi trường đó; kết nối từ xa phải dùng `amqps://` |
| `NOTIFICATION_TEST_EXCHANGE` | Topic exchange; mặc định là `handy-go.events` |
| `NOTIFICATION_TEST_API_URL` | HTTPS API Gateway URL kết thúc bằng `/api/v1/notifications` |
| `NOTIFICATION_TEST_CUSTOMER_ACCESS_TOKEN` | Access token staging còn hạn của tài khoản Customer kiểm thử; không commit hoặc in token này |
| `NOTIFICATION_TEST_WORKER_ACCESS_TOKEN` | Access token staging còn hạn của tài khoản Worker kiểm thử; không commit hoặc in token này |
| `NOTIFICATION_TEST_CUSTOMER_ID` | UUID tài khoản Customer tương ứng với token thứ nhất |
| `NOTIFICATION_TEST_WORKER_ID` | UUID khác, thuộc tài khoản Worker tương ứng với token thứ hai |
| `NOTIFICATION_TEST_TIMEOUT_SECONDS` | Thời gian chờ API tùy chọn; mặc định 30 giây, cho phép từ 10 đến 120 giây |

Hãy thiết lập các giá trị này bằng secret manager được nhóm phê duyệt rồi chạy lệnh. Script chặn tên môi trường production và hostname có vẻ là production, yêu cầu xác nhận target, dùng TLS cho RabbitMQ từ xa và HTTPS cho API từ xa, đồng thời che thông tin xác thực trong lỗi. Có thể dùng URL AMQP localhost khi kết nối qua SSH tunnel bảo mật. Sự kiện được gửi dưới dạng persistent message với cờ mandatory và publisher confirmation; nếu không có queue nhận sự kiện, script sẽ báo lỗi ngay.

Mỗi lần chạy, sự kiện có event ID UUID mới và order ID được tạo tự động. Payload chỉ chứa ID tài khoản kiểm thử đã cung cấp cùng các định danh giả lập. Script in event ID và notification ID trả về, không in Bearer token hoặc mật khẩu broker.

Trước khi chạy, Notification Service đã triển khai phải bật consumer Phase 2, kết nối cùng RabbitMQ vhost/exchange và có policy **non-production** được phê duyệt cho `order.created`, cho phép cả `customer` và `worker`. Không bật `NOTIFICATION_SIMULATED_POLICIES` trong deployment production. Nếu publisher xác nhận đã định tuyến nhưng API chờ quá thời gian, hãy kiểm tra log consumer staging và DLQ để tìm lỗi policy hoặc xử lý.

Đây là kiểm thử producer mô phỏng trên consumer, broker, database và API cloud thực tế. Kiểm thử này không xác nhận tích hợp với publisher Order Service thật.

## Về file compose local

`compose.events-test.yml` chỉ dùng cho bộ kiểm thử hồi quy local riêng. Lệnh `pnpm run test:notification:events` khởi động PostgreSQL/RabbitMQ tách biệt, chạy kiểm thử tự động của service rồi dọn stack sau đó. Lệnh cloud smoke ở trên không dùng file này. Hãy giữ file để có thể chạy lại kiểm thử hồi quy local; file không nằm trong luồng kiểm thử cloud.
