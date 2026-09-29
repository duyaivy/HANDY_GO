# HANDY GO — PBL6

Ứng dụng dịch vụ tiện ích, gồm backend NestJS, mobile React Native / Expo và frontend Next.js.

## Bắt đầu cho đồng nghiệp

Đọc **[Chạy HANDY GO trên điện thoại bằng Metro](docs/HUONG_DAN_CHAY_TEST.md)**. Máy đã cài đặt làm phần 1; máy mới làm phần 2 trước.

Quy trình: bật hạ tầng Docker → chạy ba service backend → nối điện thoại USB → mở Metro → đăng nhập hoặc nhận OTP qua Mailpit.

## Các ứng dụng

| Thư mục | Vai trò |
| --- | --- |
| [backend](backend/) | API Gateway, Auth, User & Trust, các service khác và hạ tầng Docker |
| [mobile](mobile/) | Android/iOS bằng React Native và Expo Development Build |
| [frontend](frontend/) | Web Next.js; chưa thuộc phạm vi xác nhận E2E Auth/mobile |

Các README chuyên môn vẫn hữu ích để đọc cấu trúc source. Khi chạy luồng Login/Register hiện tại, ưu tiên hướng dẫn bàn giao ở trên; một số tài liệu cũ còn mô tả scaffold/mock.
