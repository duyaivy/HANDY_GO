# HG-45: Quy trình Tích hợp User & Trust Service và AI Identity Service

Tài liệu này mô tả chi tiết kiến trúc, vòng đời sự kiện, danh mục API và các bước chạy thực tế cho luồng định danh điện tử (eKYC) giữa **AI Identity Service** và **User & Trust Service** trong hệ thống HandyGo.

---

## 1. Tổng quan Kiến trúc và Phân chia Trách nhiệm

```
+-----------------------------------------------------------------------------------------------------+
|                                            API GATEWAY (Port 3000)                                  |
|   - Định tuyến prefix: /api/v1/identity/* -> ai-service:8000                                        |
|   - Xác thực JWT Access Token của User & Admin                                                      |
|   - Chèn header nội bộ: x-internal-secret, x-user-id, x-user-roles, x-user-permissions               |
+--------------------------------------------------+--------------------------------------------------+
                                                   |
                        +--------------------------+--------------------------+
                        |                                                     |
                        v                                                     v
       +---------------------------------+                   +---------------------------------+
       |       AI IDENTITY SERVICE       |                   |       USER & TRUST SERVICE      |
       |           (Port 8000)           |                   |           (Port 3002)           |
       |---------------------------------|                   |---------------------------------|
       | - FastAPI + Celery Worker       |                   | - NestJS + Prisma ORM           |
       | - Tiền xử lý & OCR CCCD         |                   | - Database: postgres-user-trust |
       | - InsightFace trích xuất khuôn  |                   | - Quản lý WorkerProfile/KycCase |
       |   mặt và tính độ tương đồng     |                   | - Lắng nghe domain event từ RMQ |
       | - Lưu JSON chi tiết:            |                   |   để cập nhật trạng thái Worker |
       |   storage/identity_results/*.json|                   +----------------+----------------+
       | - Admin Review API              |                                    ^
       +----------------+----------------+                                    |
                        |                                                     |
                        |                 RabbitMQ Topic Exchange             |
                        +------------> [ handy-go.events ] -------------------+
                                         - kyc.pending
                                         - kyc.submitted
                                         - kyc.reviewing
                                         - kyc.completed
                                         - kyc.failed
```

### Phân công trách nhiệm:
1. **AI Identity Service (`ai-service` + `ai-worker`)**:
   - Tiếp nhận ảnh CCCD mặt trước và ảnh selfie chân dung trực tiếp từ client.
   - Celery worker chạy bất đồng bộ pipeline: Kiểm tra ảnh $\rightarrow$ Đọc mã QR $\rightarrow$ OCR thông tin CCCD $\rightarrow$ Cắt khuôn mặt chân dung $\rightarrow$ So khớp khuôn mặt (Cosine Similarity) $\rightarrow$ Tải ảnh trích xuất lên Cloudinary.
   - Lưu trữ toàn bộ kết quả bóc tách và URL ảnh vào file JSON cục bộ (`storage/identity_results/{result_id}.json`).
   - Cung cấp toàn bộ API Admin để lấy danh sách hồ sơ chờ duyệt (`/pending`), xem chi tiết hồ sơ (`/{result_id}`), phê duyệt (`/approve`), từ chối (`/reject`).
   - Phát các sự kiện `kyc.*` tương ứng sang RabbitMQ.

2. **User & Trust Service (`user-trust-service`)**:
   - Quản lý hồ sơ pháp lý và quyền hạn của thợ (`WorkerProfile` và `KycCase`) trong PostgreSQL.
   - **Đã loại bỏ các API quản trị KYC riêng** (như `GET /users/admin/kyc-cases`) để tránh lưu trữ phân mảnh và trùng lặp; giao toàn quyền duyệt hồ sơ AI cho `ai-service`.
   - Đóng vai trò **Event Consumer**: Lắng nghe các sự kiện từ RabbitMQ để tự động đồng bộ trạng thái `WorkerStatus` và `KycStatus`.

---

## 2. Vòng đời Trạng thái & Ma trận Sự kiện (State Machine)

| Giai đoạn | Thao tác thực tế | Event RabbitMQ | Trạng thái WorkerProfile | Trạng thái KycCase | Trạng thái AI JSON Store |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Khởi tạo** | Người dùng nhấn gửi yêu cầu xác thực | `kyc.pending` | `pending_kyc` | `draft` | `queued` (Job store) |
| **2. Tiếp nhận** | Hệ thống lưu job vào hàng đợi thành công | `kyc.submitted` | `pending_kyc` | `submitted` | `processing` |
| **3. Xử lý AI** | AI chạy xong OCR & so khớp khuôn mặt | `kyc.reviewing` | `under_review` | `reviewing` | `review_status: pending` |
| **4. Admin Duyệt**| Admin bấm Phê duyệt (Approve) | `kyc.completed` | `verified` | `approved` | `review_status: verified` |
| **5. Admin Từ chối**| Admin bấm Từ chối (Reject) hoặc AI lỗi nặng | `kyc.failed` | `rejected` | `rejected` | `review_status: failed` |

---

## 3. Sơ đồ Tuần tự Chi tiết (Sequence Flow)

```mermaid
sequenceDiagram
    autonumber
    actor Worker as Người dùng (Worker)
    participant Gateway as API Gateway (:3000)
    participant AI_API as AI Service (:8000)
    participant Worker_Task as Celery AI Worker
    participant Cloudinary as Cloudinary Storage
    participant RMQ as RabbitMQ (handy-go.events)
    participant UTS as User-Trust-Service (:3002)
    actor Admin as Quản trị viên (Admin)

    %% Giai đoạn 1 & 2: Submit
    Worker->>Gateway: POST /api/v1/identity/verify (form-data: cccd_image, selfie_image)<br/>Authorization: Bearer <User_JWT>
    Gateway->>AI_API: Chuyển tiếp request + Header (x-internal-secret, x-user-id)
    AI_API-->>RMQ: Phát event "kyc.pending" (userId, jobId)
    UTS-->>UTS: Ghi nhận Worker: pending_kyc, Case: draft
    AI_API->>AI_API: Lưu tạm file nhị phân & tạo Job ID
    AI_API-->>RMQ: Phát event "kyc.submitted" (userId, jobId)
    UTS-->>UTS: Cập nhật Case: submitted
    AI_API-->>Worker: HTTP 202 Accepted { "jobId": "...", "status": "queued" }

    %% Giai đoạn 3: AI Processing
    Worker_Task->>Worker_Task: Đọc ảnh, chạy EasyOCR bóc tách thông tin
    Worker_Task->>Worker_Task: InsightFace cắt khuôn mặt CCCD & so sánh với Selfie
    Worker_Task->>Cloudinary: Tải ảnh selfie + ảnh cắt CCCD (crop_cccd) lên Cloud
    Worker_Task->>AI_API: Lưu kết quả vào storage/identity_results/{result_id}.json
    Worker_Task-->>RMQ: Phát event "kyc.reviewing" (kèm OCR, FaceVerification, Similarity)
    UTS-->>UTS: Cập nhật Worker: under_review, Case: reviewing (lưu điểm tương đồng)

    %% Giai đoạn 4: Admin Review
    Admin->>Gateway: GET /api/v1/admin/identity/pending<br/>Authorization: Bearer <Admin_JWT>
    Gateway->>AI_API: Chuyển tiếp kèm header (x-user-roles: Admin)
    AI_API-->>Admin: HTTP 200 OK: Danh sách hồ sơ đang chờ duyệt
    Admin->>Gateway: POST /api/v1/admin/identity/{result_id}/approve
    Gateway->>AI_API: Chuyển tiếp lệnh phê duyệt
    AI_API->>AI_API: Cập nhật JSON: review_status = "verified"
    AI_API-->>RMQ: Phát event "kyc.completed" (userId, resultId, decision: approved)
    UTS-->>UTS: Cập nhật Worker: verified, Case: approved (Kích hoạt tài khoản nhận việc)
```

---

## 4. Danh mục API Endpoints

### 4.1. Dành cho Người dùng (Worker)

#### 1. Gửi ảnh CCCD và Selfie để xác minh
* **Endpoint:** `POST /api/v1/identity/verify`
* **Môi trường:** Gọi qua API Gateway cổng `3000` (hoặc trực tiếp cổng `8000` trong môi trường debug).
* **Headers:**
  ```http
  Authorization: Bearer <ACCESS_TOKEN_CỦA_USER>
  Content-Type: multipart/form-data
  ```
* **Body Form-Data:**
  - `cccd_image`: File ảnh mặt trước CCCD (`.jpg`, `.jpeg`, `.png`, tối đa 10MB).
  - `selfie_image`: File ảnh chân dung selfie (`.jpg`, `.jpeg`, `.png`, tối đa 10MB).
* **Response (HTTP 202 Accepted):**
  ```json
  {
    "success": true,
    "message": "Yêu cầu xác minh đã được tiếp nhận.",
    "data": {
      "jobId": "d3b07384d113edec49eaa6238ad5ff00",
      "status": "queued",
      "statusUrl": "/api/v1/identity/jobs/d3b07384d113edec49eaa6238ad5ff00"
    }
  }
  ```

#### 2. Kiểm tra tiến độ xử lý của AI (Polling)
* **Endpoint:** `GET /api/v1/identity/jobs/{job_id}`
* **Response khi hoàn thành:**
  ```json
  {
    "success": true,
    "data": {
      "jobId": "d3b07384d113edec49eaa6238ad5ff00",
      "status": "completed",
      "resultId": "ee8cddf35660417899b989c33bf9de61"
    }
  }
  ```

---

### 4.2. Dành cho Quản trị viên (Admin Review)

> [!NOTE]
> **Cơ chế xác thực kép linh hoạt cho Admin:**
> - **Cách 1 (Khuyên dùng):** Đăng nhập tài khoản Admin trên hệ thống $\rightarrow$ gửi `Authorization: Bearer <ADMIN_JWT_TOKEN>` qua cổng `3000`. Gateway tự động xác thực và chuyển tiếp role `Admin`.
> - **Cách 2 (Swagger / Trực tiếp):** Gửi `Authorization: Bearer <ADMIN_API_KEY>` hoặc header `x-admin-key: <ADMIN_API_KEY>` (Mặc định: `handy-go-admin-secret-key-12345`).

#### 1. Lấy danh sách hồ sơ KYC đang chờ duyệt
* **Endpoint:** `GET /api/v1/admin/identity/pending`
* **Headers:** `Authorization: Bearer <ADMIN_JWT_HOẶC_ADMIN_API_KEY>`
* **Response (HTTP 200 OK):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "ee8cddf35660417899b989c33bf9de61",
        "user_id": "31efac5f-6c66-46b6-9aa9-13e7cf9a804c",
        "ocr": {
          "idNumber": "042205013116",
          "fullName": "NGUYỄN VĂN A",
          "dateOfBirth": "02/09/2000",
          "gender": "Nam",
          "placeOfResidence": "Hà Nội"
        },
        "face_verification": {
          "cropfromCCCD": "https://res.cloudinary.com/.../crop_cccd.jpg",
          "selfie_image": "https://res.cloudinary.com/.../selfie.jpg",
          "similarity": 0.865,
          "is_match": true,
          "needs_review": false,
          "status": "match"
        },
        "review_status": "pending",
        "reviewed_at": null
      }
    ]
  }
  ```

#### 2. Xem chi tiết một hồ sơ KYC
* **Endpoint:** `GET /api/v1/admin/identity/{result_id}`

#### 3. Phê duyệt hồ sơ KYC
* **Endpoint:** `POST /api/v1/admin/identity/{result_id}/approve`
* **Body JSON:**
  ```json
  {
    "note": "Thông tin hợp lệ và khuôn mặt khớp chuẩn xác."
  }
  ```
* **Hành vi ngầm:** Cập nhật file JSON thành `review_status: verified` và bắn event `kyc.completed` $\rightarrow$ `user-trust-service` chuyển `WorkerProfile` thành `verified`.

#### 4. Từ chối hồ sơ KYC
* **Endpoint:** `POST /api/v1/admin/identity/{result_id}/reject`
* **Body JSON:**
  ```json
  {
    "note": "Ảnh selfie bị mờ, vui lòng chụp lại rõ nét hơn."
  }
  ```
* **Hành vi ngầm:** Cập nhật file JSON thành `review_status: failed`, dọn dẹp ảnh trên Cloudinary và bắn event `kyc.failed` $\rightarrow$ `user-trust-service` chuyển `WorkerProfile` thành `rejected`.

---

## 5. Hướng dẫn Các bước Chạy và Kiểm thử Thực tế

### Bước 1: Khởi động các container backend
Từ thư mục gốc `backend/`, đảm bảo các dịch vụ đang chạy ở trạng thái healthy:
```bash
docker compose ps
```
Cần đảm bảo các container sau đang chạy:
- `handy-go-backend-api-gateway-1` (:3000)
- `handy-go-backend-ai-service-1` (:8000)
- `handy-go-backend-ai-worker-1`
- `handy-go-backend-user-trust-service-1` (:3002)
- `handy-go-backend-rabbitmq-1` (:5672, :15672)

---

### Bước 2: Đăng nhập tài khoản Worker để lấy Token
Gọi API đăng nhập của `auth-service` để lấy JWT Token của thợ:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier": "worker@example.com", "password": "Password123@"}'
```
Lưu lại `accessToken` nhận được từ phản hồi.

---

### Bước 3: Gửi yêu cầu eKYC (Nộp ảnh)
Dùng cURL gửi 2 file ảnh thật (CCCD mặt trước và Selfie):
```bash
curl -X POST http://localhost:3000/api/v1/identity/verify \
  -H "Authorization: Bearer <WORKER_ACCESS_TOKEN>" \
  -F "cccd_image=@/duong/dan/anh/cccd_front.jpg" \
  -F "selfie_image=@/duong/dan/anh/selfie.jpg"
```
Kết quả trả về:
```json
{
  "success": true,
  "message": "Yêu cầu xác minh đã được tiếp nhận.",
  "data": {
    "jobId": "f1883d650eb1408db0507ef17a94ee22",
    "status": "queued",
    "statusUrl": "/api/v1/identity/jobs/f1883d650eb1408db0507ef17a94ee22"
  }
}
```

---

### Bước 4: Kiểm tra trạng thái AI nhận diện
Polling endpoint kiểm tra trạng thái:
```bash
curl -X GET http://localhost:3000/api/v1/identity/jobs/f1883d650eb1408db0507ef17a94ee22 \
  -H "Authorization: Bearer <WORKER_ACCESS_TOKEN>"
```
Khi trạng thái chuyển sang `completed`, AI đã xử lý xong và phát event `kyc.reviewing`. Lúc này:
- Bên `user-trust-service`: Bảng `worker_profiles` có trạng thái `under_review`, bảng `kyc_cases` có trạng thái `reviewing`.

---

### Bước 5: Admin kiểm tra danh sách chờ duyệt
Admin đăng nhập tài khoản Admin (hoặc sử dụng `ADMIN_API_KEY`):
```bash
curl -X GET http://localhost:3000/api/v1/admin/identity/pending \
  -H "Authorization: Bearer handy-go-admin-secret-key-12345"
```
Bạn sẽ thấy hồ sơ vừa nộp xuất hiện kèm đầy đủ:
- Thông tin OCR bóc tách (Họ tên, số CCCD, ngày sinh, quê quán, thường trú).
- Điểm đối sánh tương đồng khuôn mặt `similarity` (Ví dụ: `0.85`).
- Link ảnh `selfie_image` và `cropfromCCCD` từ Cloudinary.

---

### Bước 6: Admin Phê duyệt hồ sơ
Admin thực hiện phê duyệt hồ sơ:
```bash
curl -X POST http://localhost:3000/api/v1/admin/identity/<RESULT_ID>/approve \
  -H "Authorization: Bearer handy-go-admin-secret-key-12345" \
  -H "Content-Type: application/json" \
  -d '{"note": "Hồ sơ chính chủ, thông tin rõ ràng."}'
```
Ngay sau lệnh này:
- Event `kyc.completed` được phát qua RabbitMQ.
- `user-trust-service` cập nhật `WorkerProfile.status = 'verified'`. Thợ chính thức được phép nhận việc trên hệ thống HandyGo.

---

## 6. Các điểm cần lưu ý khi vận hành (Best Practices)

1. **Bảo mật và Quyền riêng tư (Data Privacy)**:
   - Hệ thống **không** lưu trữ ảnh CCCD nguyên bản lên Cloudinary.
   - File nhị phân tạm thời tại thư mục `storage/identity_jobs/{job_id}/` trên đĩa cứng sẽ được lệnh `shutil.rmtree` xóa sạch ngay sau khi pipeline AI xử lý xong (kể cả khi thành công hay thất bại).
   - Chỉ có ảnh khuôn mặt đã được cắt nhỏ (`crop_cccd.jpg`) và ảnh selfie được tải lên Cloudinary để phục vụ Admin thẩm định.

2. **Xử lý Bộ nhớ AI trên Celery Worker**:
   - Sau mỗi lượt xử lý AI model (PyTorch, InsightFace), worker tự động gọi `gc.collect()`, `malloc_trim(0)` và `torch.cuda.empty_cache()` để giải phóng triệt để RAM, ngăn ngừa tình trạng OOM (Out-Of-Memory) khi chạy trên VPS/Docker.
