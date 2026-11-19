# Ranh giới Trách nhiệm giữa các Dịch vụ trong HANDY_GO

## 1. Các Quy tắc Bất biến về Ranh giới Kiến trúc

Trong hệ thống microservices của HANDY_GO, các nguyên tắc ranh giới sau là bắt buộc:
1. **Cô lập Schema Cơ sở Dữ liệu**: Mỗi microservice sở hữu toàn quyền một schema PostgreSQL riêng biệt. Nghiêm cấm thực hiện câu lệnh SQL trực tiếp, join dữ liệu, hoặc tạo ràng buộc foreign key vật lý xuyên qua schema của service khác.
2. **Đóng gói Mã nguồn**: Mã nguồn dùng chung được tập trung tại `backend/libs/*` (`@app/common`, `@app/auth`, `@app/database`, ...). Mã nguồn trong thư mục của một service (`backend/apps/<service-a>`) tuyệt đối không được import sang service khác (`backend/apps/<service-b>`).
3. **Hợp đồng Đồng bộ**: Mọi lệnh gọi API nội bộ giữa các service phải đi qua các endpoint nội bộ được bảo vệ bởi `InternalServiceGuard` và header bảo mật `x-gateway-secret`.
4. **Hợp đồng Bất đồng bộ**: Mọi tương tác truyền tin giữa các service phải sử dụng Domain Events qua RabbitMQ Topic Exchange kết hợp với mô hình Transactional Outbox và Inbox Deduplication.

---

## 2. Ma trận Trách nhiệm của Từng Microservice

### 2.1 API Gateway (`apps/api-gateway`)
- **Cổng mạng**: `3300`
- **Phạm vi sở hữu**:
  - Định tuyến biên (Edge routing), Reverse Proxy, cân bằng tải, và giới hạn tần suất (Rate Limiting).
  - Xác thực token JWT của người dùng và trích xuất danh tính (`userId`, `role`).
  - Đính kèm các header danh tính tin cậy (`x-user-id`, `x-user-roles`, `x-gateway-secret`) khi chuyển tiếp request vào mạng nội bộ.
  - Phân giải và kiểm soát tính xác thực của địa chỉ IP khách hàng (`resolveClientIp`).
- **Hành vi nghiêm cấm**:
  - Không chứa logic nghiệp vụ cốt lõi hoặc thao tác ghi/đọc cơ sở dữ liệu nghiệp vụ.

### 2.2 Auth Service (`apps/auth-service`)
- **Cổng mạng**: `3301` | **Schema DB**: `auth_service`
- **Phạm vi sở hữu**:
  - Quản lý tài khoản, thông tin định danh, mật khẩu (băm bằng Bcrypt) và phiên đăng nhập.
  - Quản lý Refresh Token và quy trình xác thực mã OTP.
  - Tiếp nhận hồ sơ đăng ký tài khoản Khách hàng, Thợ và lưu trữ hồ sơ eKYC ban đầu.
- **Hành vi nghiêm cấm**:
  - Không quản lý điểm số đánh giá, xếp hạng thợ hay số dư ví tiền.

### 2.3 Catalog Service (`apps/catalog-service`)
- **Cổng mạng**: `3302` | **Schema DB**: `catalog_service`
- **Phạm vi sở hữu**:
  - Danh mục ngành nghề, nhóm dịch vụ và loại công việc sửa chữa.
  - Tìm kiếm danh mục không phân biệt dấu tiếng Việt bằng PostgreSQL (`searchCatalogPage`).
- **Hành vi nghiêm cấm**:
  - Không quản lý giá cả thỏa thuận của đơn hàng hay thông tin báo giá của thợ.

### 2.4 User & Trust Service (`apps/user-trust-service`)
- **Cổng mạng**: `3303` | **Schema DB**: `user_trust_service`
- **Phạm vi sở hữu**:
  - Hồ sơ năng lực chuyên môn của Thợ, chứng chỉ hành nghề đã được xác minh.
  - Đánh giá, chấm điểm sao, tỷ lệ hoàn thành công việc và ghi nhận các vi phạm chính sách.
- **Hành vi nghiêm cấm**:
  - Không quản lý thông tin đăng nhập/mật khẩu và không trực tiếp thay đổi số dư ví.

### 2.5 Order Service (`apps/order-service`)
- **Cổng mạng**: `3304` | **Schema DB**: `order_service`
- **Phạm vi sở hữu**:
  - Quản lý thực thể `ServiceRequest` (Yêu cầu tìm thợ: `draft` $\rightarrow$ `open_for_bidding` $\rightarrow$ `converted_to_order` / `cancelled` / `expired`).
  - Quản lý thực thể `BookingProposal` (Đề xuất dịch vụ: `proposed` $\rightarrow$ `changes_requested` / `finalized` / `rejected` / `withdrawn`).
  - Quản lý thực thể `Order` (Đơn hàng chính thức: `created` $\rightarrow$ `confirmed` $\rightarrow$ `in_progress` $\rightarrow$ `awaiting_customer_confirmation` $\rightarrow$ `completed`).
  - **Chuyển đổi nguyên tử**: Khi Thợ chấp thuận Proposal, Order phải được tạo và ServiceRequest chuyển trạng thái trong **cùng 1 transaction PostgreSQL duy nhất**.
- **Hành vi nghiêm cấm**:
  - Không chỉnh sửa bảng giá đấu thầu trong Bidding Service hay trực tiếp trừ tiền ví của người dùng.

### 2.6 Bidding Service (`apps/bidding-service`)
- **Cổng mạng**: `3305` | **Schema DB**: `bidding_service`
- **Phạm vi sở hữu**:
  - Các phiên nhận báo giá cho các yêu cầu đã đăng (`pending` $\rightarrow$ `open` $\rightarrow$ `closed` / `finalized`).
  - Báo giá (`bids`) do Thợ gửi lên (`active` $\rightarrow$ `withdrawn` / `selected` / `rejected`).
  - Lịch sử điều chỉnh giá và thời gian giãn cách giữa các lần báo giá lại (cooldown).
- **Hành vi nghiêm cấm**:
  - Không tự ý tạo hoặc cập nhật trạng thái bảng `orders`.

### 2.7 Matching Service (`apps/matching-service`)
- **Cổng mạng**: `3306` | **Schema DB**: `matching_service`
- **Phạm vi sở hữu**:
  - Động cơ tính điểm và gợi ý danh sách Top 3 / Top 5 Thợ phù hợp nhất dựa trên khoảng cách, xếp hạng, kỹ năng và lịch làm việc.
- **Hành vi nghiêm cấm**:
  - Không can thiệp vào dữ liệu đấu thầu trực tiếp hoặc luồng thanh toán.

### 2.8 Tracking Service (`apps/tracking-service`)
- **Cổng mạng**: `3307` | **Schema DB**: `tracking_service`
- **Phạm vi sở hữu**:
  - Lưu trữ lịch sử tiến độ dạng chỉ ghi (Append-only timeline) theo `serviceRequestId` và `orderId`.
  - Tiếp nhận tọa độ GPS thời gian thực khi thợ di chuyển.
  - Phục vụ luồng dữ liệu Server-Sent Events (SSE) cho ứng dụng di động theo dõi lộ trình.
- **Hành vi nghiêm cấm**:
  - Tuyệt đối không can thiệp thay đổi trạng thái nghiệp vụ trong Order, Bidding hay Payment. Tracking chỉ đóng vai trò lắng nghe và ghi nhận sự kiện.

### 2.9 Notification Service (`apps/notification-service`)
- **Cổng mạng**: `3308` | **Schema DB**: `notification_service`
- **Phạm vi sở hữu**:
  - Gửi thông báo đẩy qua Firebase Cloud Messaging (FCM).
  - Quản lý danh sách thông báo in-app có phân trang dạng con trỏ (cursor pagination).
  - Phát thông báo thời gian thực qua WebSockets.
- **Hành vi nghiêm cấm**:
  - Không lưu trữ dữ liệu giao dịch tài chính hay đơn hàng.

### 2.10 Message Service (`apps/message-service`)
- **Cổng mạng**: `3309` | **Schema DB**: `message_service`
- **Phạm vi sở hữu**:
  - Cuộc trò chuyện, tin nhắn đàm phán, tệp đính kèm và thanh thỏa thuận nhanh (Deal Bar).
  - Kiểm tra thẩm quyền truy cập phòng chat (chỉ Khách hàng và Thợ được chỉ định mới có quyền vào phòng).
  - Vận chuyển tin nhắn tức thời qua Socket.IO kết nối Redis Adapter.
- **Hành vi nghiêm cấm**:
  - Không tự ý chốt đơn hàng hoặc chuyển khoản nếu chưa có lệnh gọi sang Order/Payment Service.

### 2.11 Payment Service (`apps/payment-service`)
- **Cổng mạng**: `3310` | **Schema DB**: `payment_service`
- **Phạm vi sở hữu**:
  - Điều phối quy trình thanh toán đơn hàng (`pending` $\rightarrow$ `succeeded` / `failed` / `partially_refunded` / `refunded`).
  - Xử lý webhook IPN từ cổng thanh toán VNPAY.
  - Lưu giữ mức hoa hồng (Commission Snapshot) tại thời điểm nhận sự kiện `order.created` (mặc định 10%, dải cho phép 0%–30%).
  - Quy trình phê duyệt hoàn tiền của Quản trị viên (`refund.approve`).
- **Hành vi nghiêm cấm**:
  - Không trực tiếp quản lý bảng số dư ví. Mọi thao tác biến động số dư phải điều phối qua Wallet Service.
  - Không tự ý giải ngân hoàn tiền nếu chưa có nguồn bảo đảm hoặc chưa được Admin phê duyệt.

### 2.12 Wallet Service (`apps/wallet-service`)
- **Cổng mạng**: `3311` | **Schema DB**: `wallet_service`
- **Phạm vi sở hữu**:
  - Sổ cái số dư Point (quy ước 1 Point = 1 VND, biểu diễn dạng số nguyên).
  - Ghi nhận các bút toán kép kế toán, các khoản đóng băng tạm giữ (balance hold).
  - Đảm bảo tính bất biến và khử trùng lặp cho các giao dịch nạp/rút/trừ điểm thông qua `operationId`.
- **Hành vi nghiêm cấm**:
  - Không tự ý tạo thêm Point khống không có nguồn nạp đảm bảo.
  - Không tự ý kích hoạt hoàn tiền mà không có chỉ thị từ Payment Service.
