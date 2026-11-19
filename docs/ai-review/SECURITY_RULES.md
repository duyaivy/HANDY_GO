# Tiêu chuẩn Bảo mật và Danh mục Điểm Kiểm tra Lỗ hổng trong HANDY_GO

Tài liệu này xác lập các tiêu chuẩn an toàn thông tin bắt buộc khi thực hiện rà soát mã nguồn tự động trên mọi dịch vụ của HANDY_GO. Mọi Pull Request vi phạm các quy tắc này đều phải bị gắn cờ cảnh báo.

---

## 1. Kiểm soát Xác thực và Phân quyền

### 1.1 Xác thực Header Tin cậy từ Gateway (`TrustedGatewayGuard`)
- **Quy tắc**: Toàn bộ các microservice nội bộ nằm sau API Gateway phải kiểm tra tính hợp lệ của header bí mật `x-gateway-secret`.
- **Nguy cơ**: Kẻ tấn công hoặc một container trong mạng nội bộ có thể gọi trực tiếp tới cổng mạng `3301–3311` mà bỏ qua tầng xác thực token ở Gateway.
- **Biện pháp**: Toàn bộ Controller nội bộ phải được bảo vệ bởi `TrustedGatewayGuard` hoặc guard chuyên biệt của service.

### 1.2 Lỗ hổng BOLA / IDOR (Broken Object Level Authorization)
- **Quy tắc**: Người dùng chỉ được phép đọc hoặc sửa đổi tài nguyên nếu họ là chủ sở hữu hợp pháp, là bên tham gia được chỉ định, hoặc là Quản trị viên (Admin).
  - Đối với `Order`: Bắt buộc kiểm tra `order.customerId === userId` HOẶC `order.workerId === userId`.
  - Đối với `Wallet`: Bắt buộc kiểm tra `wallet.userId === userId`.
  - Đối với `ServiceRequest` và `BookingProposal`: Phải kiểm tra đúng quyền người tạo hoặc người nhận.
  - Đối với `MessageService`: Phải xác minh `userId` thực sự là thành viên của phòng chat.
- **Hành vi nghiêm cấm**: Tin tưởng hoàn toàn vào `userId` do client truyền lên qua query param hoặc body mà không đối chiếu với danh tính đã xác thực từ token (`CurrentUserId()`).

### 1.3 Phân quyền Theo vai trò (RBAC)
- **Quy tắc**: Các tác vụ quản trị nhạy cảm (duyệt hoàn tiền, tạo danh mục gốc, duyệt hồ sơ eKYC thợ, khóa tài khoản) bắt buộc phải có decorator `@Roles(UserRole.ADMIN)` và guard `AdminGuard`.

---

## 2. Bảo vệ Dữ liệu Nhạy cảm và Bí mật (Secrets)

### 2.1 Chống Lộ lọt Mật khẩu và Token
- **Quy tắc**: Mật khẩu, chuỗi băm (hash), Refresh Token, Private Key JWT, chuỗi bí mật của cổng thanh toán (`vnp_HashSecret`) và webhook secret tuyệt đối không được phép ghi vào log hoặc trả về trong DTO phản hồi của API.
- **Triển khai**: Các câu truy vấn Prisma trả về thông tin User phải loại trừ trường `passwordHash`, `refreshTokenHash` và `salt` (sử dụng Prisma `select` hoặc decorator `@Exclude()` của class-transformer).
- **Làm sạch Log**: Logger của NestJS và interceptor phải loại bỏ các header Authorization và các trường nhạy cảm trong payload trước khi ghi ra file log hoặc stdout.

### 2.2 Phân giải Địa chỉ IP Khách hàng
- **Quy tắc**: Tuyệt đối không đọc trực tiếp header `x-forwarded-for` từ các kết nối chưa được xác thực nhằm ngăn chặn tấn công giả mạo địa chỉ IP (IP Spoofing).
- **Triển khai**: Sử dụng tiện ích `resolveClientIp` trong `@app/common`, tiện ích này chỉ chấp nhận IP từ header forwarded khi request đến từ API Gateway đã được xác thực mã bí mật.

---

## 3. An toàn Giao dịch Tài chính & Xung đột Đồng thời (Concurrency)

### 3.1 Chống Tấn công Chi tiêu Kép (Race Conditions & Double-Spending)
- **Quy tắc**: Mọi thao tác trừ số dư ví, chuyển điểm, hoặc chấp thuận đề xuất hợp đồng phải được bao bọc trong transaction có cơ chế khóa (`SELECT ... FOR UPDATE` hoặc Prisma `$transaction` với kiểm soát phiên bản lạc quan).
- **Quy tắc**: Mọi giao dịch tài chính phải đi kèm mã khóa bất biến `idempotencyKey` / `operationId` để ngăn chặn tấn công gửi lại (replay attack) hoặc bấm đúp nút thanh toán.

### 3.2 Nghiêm cấm Số thực trong Phép tính Tiền tệ
- **Quy tắc**: Các phép toán tài chính tuyệt đối không được dùng kiểu `Number` số thực của JavaScript (`0.1 + 0.2`).
- **Triển khai**: Sử dụng phép toán số nguyên chính xác (VND / Point) hoặc các thư viện Decimal chuyên dụng với quy tắc làm tròn rõ ràng (`ROUND_HALF_UP`).

---

## 4. An toàn Cơ sở Dữ liệu & Tệp tin Tải lên

### 4.1 Ngăn chặn Lỗ hổng SQL Injection
- **Quy tắc**: Chỉ sử dụng câu lệnh Prisma Type-safe hoặc `$queryRaw` với cú pháp template literal an toàn. Nghiêm cấm tuyệt đối việc ghép chuỗi trực tiếp (`$queryRawUnsafe(...)`) với các biến do người dùng nhập vào.

### 4.2 Kiểm duyệt File Tải lên
- **Quy tắc**: Các tệp tin ảnh và video (ảnh căn cước công dân eKYC, ảnh đại diện, video nghiệm thu công trình) bắt buộc phải:
  1. Kiểm tra mã định danh magic bytes / MIME type thực tế của file (không chỉ dựa vào đuôi file `.png`, `.jpg`).
  2. Giới hạn dung lượng tối đa.
  3. Xác thực quyền sở hữu của người dùng trước khi liên kết tệp vào đơn hàng hay đánh giá.
