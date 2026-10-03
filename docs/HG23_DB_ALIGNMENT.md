# HG-23: Đồng bộ Auth và User & Trust với thiết kế DB của nhóm

Phạm vi thay đổi là Login/Register, xác thực email, refresh/logout tương thích và hai database Auth/User & Trust. Không thay đổi schema của chín service còn lại; không triển khai forgot/reset password của HG-31.

## Contract dữ liệu

- Sáu bảng domain Auth (`accounts`, `roles`, `permissions`, `account_roles`, `permission_roles`, `refresh_sessions`) và chín bảng domain User & Trust khớp với hai file SQL thiết kế ban đầu. Enum, kiểu UUID, nullable, giá trị mặc định, composite key, unique index và foreign key của các bảng domain được giữ nguyên.
- `accounts.id` là định danh tài khoản Auth; `accounts.user_id` là một UUID khác, tham chiếu logic tới `users.id`. JWT `sub` giữ `accountId`, còn claim `userId` và API `user.id` dùng `accounts.user_id`.
- Email/phone/password chỉ nằm ở Auth. Event `user.registered` phiên bản 2 gồm `accountId`, `userId`, `fullName`, `role`; không đưa email/phone sang User & Trust.
- Customer tạo `CustomerProfile`; Worker tạo **chỉ** `WorkerProfile` trạng thái `draft`. Worker draft vẫn đăng nhập được, nhưng chưa đồng nghĩa đã được duyệt KYC/nhận việc.
- `otp_challenges`, `outbox_events`, `rate_limits` và `event_inbox` là bảng vận hành bắt buộc cho flow hiện có, nằm ngoài số bảng domain trong bản thiết kế. `otp_purpose` thuộc schema thiết kế được dùng cho OTP table vận hành.
- Roles và permissions được seed idempotent khi Auth khởi động. Request đăng ký chỉ tra role đã seed; không tạo role đồng thời trong request.
- Thời hạn tuyệt đối 7 ngày của refresh session được tính từ `refresh_sessions.created_at`; bảng thiết kế không có cột `absolute_expires_at`.

## Áp dụng migration

**Không chạy hai migration HG-23 trên database cũ còn dữ liệu.** Chúng chủ động báo lỗi trước khi thay bảng domain. Không dùng `prisma migrate reset`, `db push` hoặc xóa Docker volume để vượt qua lỗi này. Với dữ liệu thật, cần backup và viết migration chuyển dữ liệu riêng, bao gồm ánh xạ UUID cũ, tài khoản/profiles, OTP, outbox, session và event đã publish.

Cho môi trường local *mới và rỗng*:

1. Chuẩn bị hai PostgreSQL database Auth/User & Trust riêng và cấu hình `DATABASE_URL_AUTH`, `DATABASE_URL_USER_TRUST` trỏ đúng chúng.
2. Từ thư mục `backend`, chạy `pnpm run db:setup`. Lệnh này generate Prisma clients rồi deploy migration của cả hai service.
3. Khởi động User & Trust, Auth và RabbitMQ; Auth sẽ seed `CUSTOMER`, `WORKER`, `ADMIN` cùng permissions.
4. Đăng ký Customer và Worker, xác nhận outbox publish/consumer tạo đúng profile. Trước khi event được xử lý, login/verify có thể trả `PROFILE_NOT_READY` (425) và cần thử lại.
5. Kiểm tra login, JWT `sub`/`userId`, refresh, logout. Không trộn event `user.registered` phiên bản 1 còn trên queue với contract phiên bản 2; xử lý queue cũ theo kế hoạch chuyển dữ liệu trước cutover.

Để kiểm tra schema sau deploy, chạy `prisma migrate diff --from-config-datasource --to-schema=<schema.prisma> --config=<prisma.config.ts> --exit-code` cho từng service. Kết quả đúng là `No difference detected`.
