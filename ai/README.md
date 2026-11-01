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

## 🐳 Khởi chạy bằng Docker Compose

```bash
cd ai
docker compose up -d --build
```

Kiểm tra container logs:
```bash
docker compose logs -f ai-service
```

Named volumes được mount để cache trọng số mô hình:
- `ai-face-models`: Trọng số InsightFace.
- `ai-ocr-models`: Trọng số EasyOCR.
- `ai-hf-models`: Trọng số Hugging Face Sentence Transformers (`intfloat/multilingual-e5-small`).

---

## 🧪 Chạy Kiểm thử Tự động (Automated Tests)

Chạy toàn bộ test suite bao gồm Embedding Service, Ranking Algorithm, API Auth, Benchmark & Sensitivity Analysis:
```bash
cd ai
.venv/bin/pytest -v -s tests/
```
Các bài kiểm thử chính:
1. `tests/test_embedding_service.py`: Kiểm thử chuẩn hóa tiếng Việt, E5 query/passage prefixing, cosine similarity, LRU cache.
2. `tests/test_ranking_service.py`: Kiểm thử 5 chiều scoring, Bayesian rating prior cho thợ mới (cold-start), renormalize trọng số khi thiếu dữ liệu đơn hàng lịch sử.
3. `tests/test_matching_api.py`: Kiểm thử xác thực `x-internal-secret`, mã lỗi 403 khi thiếu/sai secret, xử lý payload 0 ứng viên.
4. `tests/test_evaluation.py`: Đánh giá chất lượng ranking tiếng Việt qua 4 danh mục (Điện lạnh, Ống nước, Sửa điện, Vệ sinh), đo lường NDCG@5, MRR, Precision@5.
5. `tests/test_benchmark_and_sensitivity.py`: Benchmark độ trễ với 5, 20, 100 ứng viên, request đồng thời và phân tích độ nhạy trọng số (Spearman $\rho \ge 0.70$).
