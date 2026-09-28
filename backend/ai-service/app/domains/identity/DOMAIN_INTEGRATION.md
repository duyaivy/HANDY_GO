# Identity Domain v14

## Luồng chính

`POST /api/identity/{user_id}/verify` nhận đúng 2 file trong một request và gắn verification record với `user_id`:

- `cccd_image`: ảnh CCCD mặt trước.
- `selfie_image`: ảnh selfie.

Ví dụ: `POST /api/identity/user-123/verify`

Pipeline:

1. Validate input.
2. OCR CCCD trong workspace tạm của OS.
3. OCR tạo portrait crop từ CCCD.
4. Face Verification bắt buộc dùng portrait crop đó làm reference và so với selfie.
5. Nếu bước verify hoàn tất, chỉ upload `crop_cccd` và `selfie` lên Cloudinary.
6. Lưu kết quả JSON với trạng thái `pending` để Admin review.
7. Không tạo hoặc lưu session trung gian, không có session TTL.

Ảnh CCCD gốc không được upload lên Cloudinary bởi endpoint one-shot.

## Admin Review

Các endpoint Admin được bảo vệ bằng header `X-Admin-Key`:

- `GET /api/admin/identity/pending`
- `GET /api/admin/identity/{result_id}`
- `POST /api/admin/identity/{result_id}/approve`
- `POST /api/admin/identity/{result_id}/reject`

Khi reject, service cố gắng xóa hai ảnh biometric tương ứng trên Cloudinary. JSON review record vẫn được giữ để audit.

## Persistence

v14 dùng JSON tại `storage/identity_results` cho verification records. Record không tự hết hạn theo 30 phút; vòng đời được quyết định bởi quy trình Admin hoặc chính sách retention bên ngoài.

## Public verification response

Response chứa `result_id`, `user_id`, OCR fields cần thiết và các trường face verification cần thiết. Cloudinary `public_id` được giữ trong metadata nội bộ để Admin cleanup và không trả về client.
