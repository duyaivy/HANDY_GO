# PR80-05 — Interceptor tự gửi lại mutation sau 429 (P2)

## Lỗi và tác động

`mobile/src/services/api/api-client.ts` tự retry một lần cho mọi HTTP method khi nhận 429. POST tạo payment, nộp bằng chứng, báo giá hoặc chuyển trạng thái Order có thể đã gây tác dụng phụ trước khi lỗi đi qua proxy/service. Tự gửi lại làm tăng nguy cơ thao tác trùng.

## Hướng sửa đã chọn

1. Chỉ tự retry với `GET` và `HEAD`. Trong nhánh 429, kiểm tra `originalRequest.method?.toUpperCase()` trước khi đánh dấu `_retry429`; `POST`, `PUT`, `PATCH`, `DELETE` trả `ApiError('RATE_LIMITED', ...)` cho caller, không tự gọi lại Axios.
2. Với `GET/HEAD`, đọc `Retry-After` dạng số giây; nếu không hợp lệ, dùng chờ mặc định 2 giây. Giới hạn chờ tối đa 10 giây; nếu `originalRequest.signal?.aborted` trước khi gửi lại thì hủy retry. `_retry429` vẫn chặn vòng lặp sau lần thử thứ hai.
3. Ở màn hình mutation, hiện lỗi rate limit rõ ràng và để người dùng tự thử lại sau khi kiểm tra trạng thái server. Riêng bằng chứng/Order tiếp tục dùng `clientEvidenceId` và trạng thái Order hiện tại để tránh gửi trùng; không thêm retry ngầm cho mutation.

## Kiểm thử và tiêu chí đạt

- Sửa test trong `mobile/src/services/api/__tests__/api-client-refresh.test.ts`: GET 429 rồi 200 → hai lần gọi adapter; POST/PATCH/DELETE 429 → đúng một lần gọi và trả `RATE_LIMITED`.
- GET 429 hai lần → dừng ở lần hai. `Retry-After` quá lớn bị chặn ở 10 giây; request bị hủy không gọi lại adapter. Dùng fake timers để không làm chậm suite.
- Chạy suite API, typecheck và kiểm tra thao tác nộp bằng chứng khi backend trả 429 không tạo yêu cầu thứ hai.
