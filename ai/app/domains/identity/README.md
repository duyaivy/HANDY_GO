# Identity Domain v14.1.0

Domain xử lý **Identity Verification** cho CCCD/CMND, bao gồm OCR thông tin CCCD, trích xuất chân dung từ CCCD và đối chiếu khuôn mặt 1:1 với ảnh selfie.

> **Lưu ý:** Domain hiện tại dùng FastAPI và được thiết kế theo flow one-shot: client gửi ảnh CCCD mặt trước + selfie trong cùng một request.

---

## 1. Chức năng chính

Identity Domain v14 hiện có các thành phần chính:

- **CCCD OCR**
  - Đọc thông tin trên CCCD.
  - Tạo portrait crop từ ảnh CCCD.
  - Chạy xử lý trong workspace tạm.
- **Face Detection / Embedding**
  - Sử dụng InsightFace.
  - Tạo face embedding.
  - Lấy bounding box, detection score, landmarks và pose.
- **Face Quality Validation**
  - Kiểm tra kích thước khuôn mặt.
  - Độ nét / sharpness.
  - Độ sáng / brightness.
  - Vị trí khuôn mặt.
  - Yaw / pitch / roll.
- **Face Verification 1:1**
  - So sánh portrait trên CCCD với selfie.
  - Tính cosine similarity.
  - Phân loại:
    - `match`
    - `review`
    - `not_match`
- **Identity Result Storage**
  - Lưu verification result dưới dạng JSON.
  - Mặc định tại `storage/identity_results`.
- **Admin Review**
  - Liệt kê kết quả chờ duyệt.
  - Approve / reject verification.
- **Cloudinary**
  - Sau khi verification hoàn tất, lưu `crop_cccd` và `selfie`.
  - Không upload ảnh CCCD gốc trong one-shot verification flow.
- **Swagger / OpenAPI**
  - FastAPI tự sinh tài liệu API tại `/docs`.

---

## 2. Luồng xử lý Identity Verification

```text
Client
  │
  │  CCCD image + Selfie
  ▼
POST /api/identity/{user_id}/verify
  │
  ├── Validate file type / size
  │
  ├── Input image quality check
  │
  ├── OCR CCCD
  │      │
  │      └── Portrait extraction
  │
  ├── Face Verification
  │      │
  │      ├── CCCD portrait embedding
  │      ├── Selfie face embedding
  │      ├── Face quality validation
  │      └── Cosine similarity
  │
  ├── MATCH / REVIEW / NOT_MATCH
  │
  ├── Upload portrait + selfie → Cloudinary
  │
  └── Save verification result → JSON
```

### Quy tắc trạng thái

| Status | Ý nghĩa |
|---|---|
| `match` | Similarity đạt ngưỡng match |
| `review` | Kết quả nằm trong vùng cần Admin review |
| `not_match` | Similarity không đạt ngưỡng review |

Hai ngưỡng được cấu hình trong `FaceVerificationService`:

```python
match_threshold = 0.70
review_threshold = 0.50
```

Trong đó `review_threshold` phải nhỏ hơn `match_threshold`.

---

## 3. API (Chưa có JWT)

### 3.1. Identity Verification (Chưa có JWT)

```http
POST /api/identity/{user_id}/verify
```

Request sử dụng `multipart/form-data`:

```text
cccd_image   = <CCCD mặt trước>
selfie_image = <ảnh selfie>
```

Response chứa các thông tin chính:

```json
{
  "success": true,
  "message": "OCR CCCD và đối chiếu khuôn mặt hoàn tất.",
  "data": {
    "id": "verification-result-id",
    "user_id": "user-123",
    "ocr": {},
    "face_verification": {
      "selfie_image": "https://...",
      "cropfromCCCD": "https://...",
      "status": "match",
      "is_match": true,
      "needs_review": false,
      "similarity": 0.72
    }
  }
}
```

---

### 3.2. Lấy kết quả Verification

```http
GET /api/identity/verify/{result_id}
```
---

## 4. Admin Review API (Chưa có JWT)

Admin API được bảo vệ bằng header:

```http
X-Admin-Key: <ADMIN_API_KEY>
```

### Danh sách pending

```http
GET /api/admin/identity/pending
```

### Xem một verification result

```http
GET /api/admin/identity/{result_id}
```

### Approve

```http
POST /api/admin/identity/{result_id}/approve
```

Body tùy chọn:

```json
{
  "note": "Verified manually."
}
```

### Reject

```http
POST /api/admin/identity/{result_id}/reject
```

Body tùy chọn:

```json
{
  "note": "Face does not match."
}
```

Khi reject, service cố gắng xóa các ảnh biometric tương ứng trên Cloudinary. Verification JSON vẫn được giữ để phục vụ audit.

---

## 5. Face Verification

Module chính nằm tại:

```text
app/domains/identity/modules/face_verification/
```

### Face Embedding

Default model:

```text
InsightFace / buffalo_l
```

Embedding được normalize trước khi tính cosine similarity.

### Face Quality

Có policy riêng cho:

```text
CCCD
Selfie
```

Các yếu tố được kiểm tra gồm:

- face size
- sharpness
- brightness
- face position
- yaw
- pitch
- roll

Kết quả quality có:

```text
pass
warning
fail
```

### Portrait Extraction

CCCD portrait extractor có khả năng:

1. Tìm khuôn mặt trong vùng portrait.
2. Fallback tìm trên toàn ảnh CCCD.
3. Thử các orientation/rotation phù hợp.
4. Crop portrait.
5. Giữ lại embedding/detection information.

---

## 6. OCR

OCR pipeline nằm tại:

```text
app/domains/identity/services/ocr_pipeline.py
```

và các module hỗ trợ trong:

```text
app/domains/identity/modules/
```

Endpoint OCR độc lập được định nghĩa là:

```http
POST /ocr/cccd
```

Request:

```text
multipart/form-data
file=<CCCD image>
```

> Trong `app/main.py` hiện tại, application chính include `health`, `identity` và `admin_identity`. Router OCR độc lập nằm trong `app/router.py`; nếu muốn expose `/ocr/cccd` trực tiếp từ application hiện tại, cần include `ocr.router` vào `create_app()`.

---

## 7. Storage

Verification records được lưu dạng JSON tại:

```text
storage/identity_results/
```

Mỗi record chứa thông tin như:

```text
result id
user id
OCR result
face verification result
Cloudinary metadata nội bộ
review status
admin note (nếu có)
```

### Privacy

Trong one-shot verification flow:

- Ảnh CCCD gốc không được upload lên Cloudinary.
- Portrait crop được upload sau khi verification hoàn tất.
- Selfie được upload sau khi verification hoàn tất.
- Cloudinary `public_id` được giữ trong metadata nội bộ.
- Client không nhận `public_id` nội bộ.

---

## 8. Cài đặt

### Yêu cầu

Khuyến nghị sử dụng Python phiên bản tương thích với các package trong:

```text
requirements.txt
```

Cài dependencies:

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

Linux/macOS:

```bash
source .venv/bin/activate
```

Sau đó:

```bash
pip install -r requirements.txt
```

---

## 9. Environment Variables

Copy:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Các biến quan trọng:

```env
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
CLOUDINARY_FOLDER=identity_verifications
CLOUDINARY_DELIVERY_TYPE=upload

ADMIN_API_KEY=change-this-to-a-long-random-secret
```

**Không commit `.env` lên Git.**

---

## 10. Chạy service

Từ thư mục project:

```bash
uvicorn app.main:app --reload
```

Mặc định service chạy tại:

```text
http://localhost:8000
```

Swagger:

```text
http://localhost:8000/docs
```

OpenAPI JSON:

```text
http://localhost:8000/openapi.json
```

---

## 11. Health Check

```http
GET /health
```

Ví dụ:

```bash
curl http://localhost:8000/health
```

---

## 12. Cấu trúc project

```text
ai-service/
│
├── app/
│   ├── main.py
│   ├── router.py
│   │
│   └── domains/
│       ├── identity/
│       |   ├── api/
│       |   │   ├── identity.py
│       |   │   ├── admin_identity.py
│       |   │   ├── ocr.py
│       |   │   └── health.py
│       |   │
│       |   ├── core/
│       |   │   ├── config.py
│       |   │   ├── exceptions.py
│       |   │   ├── exception_handlers.py
│       |   │   ├── face_verification_provider.py
│       |   │   └── logger.py
│       |   │
│       |   ├── modules/
│       |   │   ├── face_verification/
│       |   │   ├── card_detection/
│       |   │   └── ...
│       |   │
│       |   ├── services/
│       |   │   ├── face_verification_pipeline.py
│       |   │   ├── identity_result_store.py
│       |   │   ├── cloudinary_image_store.py
│       |   │   └── ocr_pipeline.py
│       |   │
│       |   ├── schemas/
│       |   ├── utils/
│       |   └── README.IDENTITY.md
|       |
|       ├── matching/
|       └── price-recommend/
├── storage/
│   └── identity_results/
│
├── .env.example
├── .gitignore
├── requirements.txt
└── START.md
```

---

## 13. Error Handling

Domain có cơ chế xử lý lỗi theo từng stage.

Một số nhóm lỗi:

```text
INVALID_USER_ID
UNSUPPORTED_IMAGE_TYPE
MISSING_FILE_NAME
INPUT_QUALITY
OCR_FAILED
OCR_PORTRAIT_NOT_CREATED
OCR_PORTRAIT_IMAGE_MISSING
CCCD_FACE_NOT_FOUND
SELFIE_FACE_NOT_FOUND
MULTIPLE_SELFIE_FACES
FACE_QUALITY_FAILED
IDENTITY_IMAGE_STORAGE_FAILED
```

Face verification sử dụng `FaceVerificationError` để truyền:

```text
error_code
message
status_code
details
suggestion
```

---

## 14. Tích hợp Backend

Backend gọi:

```http
POST /api/identity/{user_id}/verify
```

với:

```text
cccd_image
selfie_image
```

Sau khi nhận response:

```text
match
review
not_match
```

Backend nên xử lý tương ứng:

```text
match, review
  → chờ Admin review

not_match
  → thông báo verification không đạt theo business rule
```

---

## 15. API Documentation

Sau khi chạy service, mở Swagger/OpenAPI:

```text
http://localhost:8000/docs
```

---

## 16. Version

```text
Identity Domain: v14.1.0
```
