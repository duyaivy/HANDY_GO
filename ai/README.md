# HandyGo AI Service (eKYC Identity Inference)

Dịch vụ AI (`identity` eKYC) được tổ chức độc lập tại thư mục `/ai`, cung cấp REST API (FastAPI) phục vụ nhận diện OCR Căn cước công dân (EasyOCR) và đối sánh khuôn mặt (InsightFace).

Dịch vụ hoạt động độc lập, được **User & Trust Service** (`user-trust-service`) của Backend gọi trực tiếp qua HTTP endpoint nội bộ `POST /internal/v1/identity/analyze`.

---

## 🚀 Hướng dẫn Khởi chạy (Docker Compose)

### 1. Chuẩn bị biến môi trường
Nếu chạy lần đầu hoặc môi trường mới, sao chép file cấu hình:
```bash
cd ai
cp .env.example .env
```
*(Tùy chỉnh `INTERNAL_SERVICE_SECRET` hoặc cổng `AI_SERVICE_PORT` nếu cần).*

### 2. Khởi động dịch vụ AI
```bash
docker compose up -d --build
```

### 3. Kiểm tra trạng thái & Logs
- Kiểm tra trạng thái container:
  ```bash
  docker compose ps
  ```
- Xem log hoạt động theo thời gian thực:
  ```bash
  docker compose logs -f ai-service
  ```

### 4. Tài liệu API & Health Check
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Health check**: [http://localhost:8000/health](http://localhost:8000/health)
- **Endpoint phân tích eKYC**: `POST http://localhost:8000/internal/v1/identity/analyze`  
  *(Yêu cầu Header `X-Internal-Secret: <INTERNAL_SERVICE_SECRET>`)*

---

## 🔗 Tích hợp với Backend HandyGo

Khi chạy toàn bộ hệ thống bằng Docker Compose:
- **AI Service**: Khởi chạy tại thư mục `/ai` (`http://localhost:8000`).
- **Backend Services**: Khởi chạy tại thư mục `/backend`. `user-trust-service` sẽ kết nối tới AI Service qua `http://host.docker.internal:8000`.

---

## 📦 Lưu ý về Model Weights & Bộ nhớ Cache

- **Lần chạy đầu tiên:** Service sẽ tự động tải các model weights của EasyOCR và InsightFace. Quá trình tải phụ thuộc vào tốc độ mạng.
- **Cache models:** Toàn bộ model weights được lưu trong Docker named volumes (`ai-face-models`, `ai-ocr-models`), đảm bảo không phải tải lại khi khởi động lại container.
- **Khuyến nghị tài nguyên máy chủ:**
  - Tối thiểu: 2 vCPU, 2GB–4GB RAM.
  - Khuyến nghị: 4 vCPU, 4GB–8GB RAM.
