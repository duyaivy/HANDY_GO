# Async identity verification queue

## Các file được thêm/sửa
- `app/domains/identity/api/identity.py`: POST nhận ảnh, lưu input, enqueue Celery, trả HTTP 202; GET `/api/identity/jobs/{job_id}` để polling; GET kết quả yêu cầu `x-user-id`.
- `app/domains/identity/services/identity_verification_service.py`: business logic OCR + face verification + Cloudinary.
- `app/domains/identity/services/identity_job_store.py`: trạng thái job trong Redis/Upstash.
- `app/domains/identity/tasks/identity_tasks.py`: Celery worker task.
- `app/domains/identity/core/config.py`: cấu hình Redis/job.
- `requirements.txt`, `.env.example`: dependencies và biến môi trường.

## Cấu hình
Đặt `AI_REDIS_URL` trong `.env` của AI service, dùng credential Upstash ĐÃ rotate nếu secret cũ từng bị chia sẻ. Không commit `.env`.
Ví dụ: `AI_REDIS_URL=rediss://default:<PASSWORD_MOI>@<UPSTASH_HOST>:6379`

API service và worker phải dùng cùng `AI_REDIS_URL`, cùng image/code và cùng volume `/app/storage`, vì ảnh đầu vào tạm được ghi vào `storage/identity_jobs`.

## Chạy worker
Trong container AI image, chạy:
`celery -A app.domains.identity.tasks.identity_tasks:celery_app worker --loglevel=INFO --concurrency=1`

Worker phải chạy thành container riêng; không chạy lệnh worker bên trong tiến trình uvicorn. Đặt `--concurrency=1` ban đầu để hạn chế RAM/CPU do OCR/InsightFace.

## API
- `POST /api/identity/{user_id}/verify` (multipart `cccd_image`, `selfie_image`) trả `202` cùng `data.jobId` và `data.status=queued`.
- `GET /api/identity/jobs/{job_id}` trả trạng thái `queued`, `processing`, `completed` hoặc `failed`; khi completed có `result` và `result_id`.
- `GET /api/identity/verify/{result_id}` lấy kết quả đã lưu.

Mọi request vẫn phải đi qua Gateway, gửi `x-internal-secret` và `x-user-id` như flow hiện tại. Cần cấu hình Gateway route/proxy cho đường dẫn mới `/api/identity/jobs/:jobId`; phía mobile nên polling với khoảng nghỉ (ví dụ 2-3 giây), dừng khi completed/failed.

## Lưu ý
- Đây là thay đổi AI Service; không tự sửa NestJS Gateway hoặc docker-compose ở repository cha.
- Input files được xóa khi task kết thúc; trạng thái Redis hết hạn sau `IDENTITY_JOB_TTL_SECONDS`.
- Kiểm tra lỗi OCR/Cloudinary thực tế sau khi build. Đảm bảo worker và API dùng chung volume storage.
