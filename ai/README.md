# HandyGo AI Service (eKYC Identity & Matching AI Ranking)

Dịch vụ AI được tổ chức độc lập tại thư mục `/ai`, xây dựng trên nền tảng **Python & FastAPI**. Dịch vụ cung cấp 2 domain inference cốt lõi:
1. **Identity & eKYC (`identity`)**: Nhận diện OCR CCCD (EasyOCR) và đối sánh khuôn mặt sinh trắc học (InsightFace ArcFace 512-D).
2. **Matching & Ranking (`matching`)**: Xếp hạng ứng viên thợ cho yêu cầu dịch vụ sử dụng mô hình multilingual embedding **`intfloat/multilingual-e5-small`** kết hợp thuật toán **Hybrid 5 chiều** (Semantic, Proximity, Bayesian Rating, Experience, Order Reliability).

Dịch vụ hoạt động hoàn toàn độc lập, tách biệt khỏi mã nguồn NestJS Backend và cơ sở dữ liệu PostgreSQL. Các microservice Backend kết nối tới AI Service thông qua HTTP calls nội bộ được bảo vệ bằng secret token `x-internal-secret`.

---

## 🚀 Hướng dẫn Khởi chạy Local Development

### 1. Chuẩn bị môi trường Python (Python 3.11 hoặc 3.12)
Sử dụng công cụ quản lý package siêu nhanh `uv` (hoặc `python -m venv` truyền thống):
```bash
cd ai

# Tạo virtual environment
uv venv --python 3.12 .venv
source .venv/bin/activate

# Cài đặt dependencies
uv pip install -r requirements.txt
```

### 2. Cấu hình biến môi trường
Sao chép file cấu hình mẫu nếu chưa có:
```bash
cp .env.example .env
```
Các biến môi trường chính cho Matching AI:
- `AI_SERVICE_PORT`: Cổng dịch vụ HTTP (mặc định `8000`).
- `INTERNAL_SERVICE_SECRET`: Khóa bí mật chia sẻ giữa Backend và AI Service (`handy-go-internal-service-secret-key-12345`).
- `DEBUG`: Bật/tắt chế độ debug (mặc định `false`).

### 3. Khởi chạy HTTP Server
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Khi khởi động, service sẽ tự động preload mô hình `intfloat/multilingual-e5-small` vào bộ nhớ RAM để đảm bảo request ranking đầu tiên không bị spike latency.

### 4. Kiểm tra sức khỏe & Readiness
- **Liveness probe**: `GET http://localhost:8000/health`
- **Readiness probe** (xác nhận model đã nạp vào RAM): `GET http://localhost:8000/ready`
- **Swagger OpenAPI docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🛠️ API Endpoints Chính

| Phương thức | Endpoint | Domain | Quyền truy cập | Mô tả |
|---|---|---|---|---|
| `GET` | `/health` | Core | Public | Kiểm tra tiến trình hoạt động |
| `GET` | `/ready` | Core / Matching | Public | Kiểm tra mô hình embedding đã nạp vào RAM |
| `POST` | `/internal/ai/matching/rank` | Matching | `x-internal-secret` | Xếp hạng ứng viên thợ dựa trên semantic embedding & hybrid score |
| `POST` | `/internal/v1/identity/analyze` | Identity | `x-internal-secret` | OCR thẻ CCCD và đối sánh khuôn mặt |

---

## 📦 Lưu ý về Model Weights & Triển khai Cloud (Azure Container Apps)

- **Đóng gói sẵn (Pre-baked Models):** Toàn bộ model weights của EasyOCR (`vi`, `en`) và InsightFace (`buffalo_l`) đã được nạp trực tiếp vào Docker image thông qua `warmup_models.py` trong quá trình `docker build`.
- **Azure Container Apps (Serverless Scale-to-Zero):**
  - Workflow CI/CD được đặt tại `.github/workflows/ai-azure-container-apps.yml`.
  - Hỗ trợ scale-to-zero ($0 chi phí khi nhàn rỗi) và khởi động lại tức thì (2–3 giây) mà không cần tải lại model từ internet.
- **Khuyến nghị tài nguyên máy chủ:**
  - Tối thiểu: 2 vCPU, 2GB–4GB RAM.
  - Khuyến nghị: 2 vCPU, 4GB RAM (chuẩn Azure Container Apps).
