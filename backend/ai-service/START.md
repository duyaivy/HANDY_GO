1. Đảm bảo `backend/.env` có `AI_SERVICE_PORT=8000`, `INTERNAL_SERVICE_SECRET` và thông tin Cloudinary.
2. Từ thư mục `backend`, build và chạy AI-service cùng API Gateway:
    ```powershell
    docker compose up --build -d ai-service api-gateway
    ```
   Compose tự khởi động các service phụ thuộc và chờ AI healthcheck trước khi chạy gateway.
3. Kiểm tra trạng thái:
    ```powershell
    docker compose ps ai-service api-gateway
    docker compose logs -f ai-service
    ```
4. Mở swagger tại http://localhost:8000/docs. API Gateway gọi AI-service qua mạng Docker tại `http://ai-service:8000`.

Model OCR và face verification được tải trong lần chạy đầu; cache cùng dữ liệu kết quả được giữ trong named volumes sau khi container khởi động lại.