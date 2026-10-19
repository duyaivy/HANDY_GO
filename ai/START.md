# Hướng dẫn Khởi chạy HandyGo AI Service

Dịch vụ AI (`identity` eKYC) được tổ chức độc lập tại thư mục `/ai`, phục vụ cả REST API (FastAPI) và tác vụ hàng đợi bất đồng bộ (Celery Worker).

---

## Cách 1: Chạy độc lập (Standalone - Dành cho VPS riêng hoặc test riêng AI)

1. Sao chép cấu hình biến môi trường:
   ```bash
   cd ai
   cp .env.example .env
   # Cập nhật thông tin Cloudinary, ADMIN_API_KEY, REDIS_URL trong file .env
   ```

2. Khởi động dịch vụ AI (bao gồm `ai-redis`, `ai-service`, `ai-worker`):
   ```bash
   docker compose up --build -d
   ```

3. Kiểm tra logs và trạng thái:
   ```bash
   docker compose ps
   docker compose logs -f ai-service
   ```

4. Truy cập tài liệu API Swagger:
   - URL: `http://localhost:8000/docs`
   - Health check: `http://localhost:8000/health`

---

## Cách 2: Chạy tích hợp với Backend NestJS trong Local Dev

Từ thư mục `backend/`:
```bash
cd backend
docker compose up --build -d ai-service ai-worker api-gateway
```
API Gateway sẽ tự động định tuyến các request eKYC tới AI Service tại `http://ai-service:8000`.

---

## Lưu ý về Tài nguyên & Models Cache
- **Lần chạy đầu tiên:** Service sẽ tự động tải các model của EasyOCR và InsightFace về máy.
- **Cache models:** Toàn bộ model weights được lưu trong Docker named volumes (`ai-face-models`, `ai-ocr-models`), không bị mất khi restart container.
- **Khuyến nghị cấu hình máy chủ:**
  - Tối thiểu: 2 vCPU, 4GB RAM (chạy solo worker).
  - Khuyến nghị: 4 vCPU, 4GB–8GB RAM.