# Hướng dẫn & Giải thích Kiến trúc: Chuyển đổi RabbitMQ Local trong Môi trường Development

Tài liệu này giải thích chi tiết nguyên nhân kỹ thuật, giải pháp và cách vận hành khi bổ sung container RabbitMQ vào môi trường phát triển local (`docker-compose.yml`), giúp giải quyết triệt để lỗi kết nối và xung đột message giữa các thành viên.

---

## 1. Tóm tắt nhanh cho Team (TL;DR)

* **Vấn đề gặp phải:** Gói CloudAMQP miễn phí có giới hạn cứng **tối đa 20 kết nối đồng thời (connections)**. Dự án có 11 microservices; khi server Azure và các máy dev cùng chạy, số kết nối đạt 20/20, khiến CloudAMQP từ chối kết nối mới (`<ConnectionClose channel:0>`). Hậu quả là `notification-service` bị ngắt kết nối và API Gateway trả về lỗi **`502 Bad Gateway`**.
* **Giải pháp:** Bổ sung container RabbitMQ local (`rabbitmq:3-management-alpine`) vào [backend/docker-compose.yml](file:///D:/SCHOOL/PBL6/backend/docker-compose.yml). Mỗi máy dev sẽ có một broker độc lập, nhẹ (~40MB RAM), không phụ thuộc internet và không lo hết quota.
* **Không ảnh hưởng Production:** Code microservices tuân thủ nguyên tắc **12-Factor App**, toàn bộ cấu hình broker phụ thuộc vào biến môi trường `RABBITMQ_URL`. Khi deploy lên server/staging, chỉ cần giữ nguyên biến môi trường trỏ tới Cloud broker.

---

## 2. Nguyên nhân gốc rễ (Root Cause Analysis)

### 2.1. Giới hạn cứng của CloudAMQP Free Tier
* Instance CloudAMQP miễn phí (`armadillo.rmq.cloudamqp.com`) chỉ hỗ trợ:
  * **Tối đa 20 connections**.
  * **Tối đa 100 queues/channels**.
* Mỗi microservice (auth, user-trust, order, bidding, matching, notification, wallet,...) khi khởi động sẽ mở từ 1 đến 2 kết nối AMQP (connection + channel wrapper).
* Khi hệ thống chạy trên Azure hoặc có từ 2 lập trình viên cùng bật hệ thống ở máy cá nhân, tổng kết nối lập tức vượt ngưỡng 20. Khi đó broker sẽ gửi gói tin TCP `ConnectionClose` để hủy kết nối mới.

### 2.2. Tranh chấp message giữa các môi trường (Message Stealing)
Nếu tất cả môi trường (Dev của dev A, Dev của dev B, Staging trên Cloud) cùng trỏ về 1 CloudAMQP chung:
* Khi Dev A tạo một đơn hàng hoặc trigger notification để test trên máy mình, event được bắn lên queue chung.
* Service của Dev B hoặc Staging Server có thể "nhặt" (consume) mất message đó trước.
* Kết quả: Dev A không thấy thông báo xuất hiện trên app của mình, dẫn đến việc debug rất khó khăn và sai lệch dữ liệu thử nghiệm.

---

## 3. Kiến trúc giải pháp (Architecture Solution)

### 3.1. Phân tách rõ ràng giữa các môi trường

```
[Máy Dev Cá Nhân]               [Máy Dev Đồng Đội]              [Staging / Production (Azure)]
┌──────────────────────┐        ┌──────────────────────┐        ┌────────────────────────────┐
│ • API Gateway        │        │ • API Gateway        │        │ • API Gateway              │
│ • Microservices      │        │ • Microservices      │        │ • Microservices            │
│          ▼           │        │          ▼           │        │             ▼              │
│ [RabbitMQ Local]     │        │ [RabbitMQ Local]     │        │ [CloudAMQP / Managed RMQ]  │
│ (container riêng)    │        │ (container riêng)    │        │ (Dedicated Production)     │
└──────────────────────┘        └──────────────────────┘        └────────────────────────────┘
```

### 3.2. Cấu hình container RabbitMQ trong `docker-compose.yml`

```yaml
  rabbitmq:
    image: rabbitmq:3-management-alpine
    container_name: handy-go-rabbitmq
    restart: unless-stopped
    ports:
      - '5672:5672'      # AMQP protocol
      - '15672:15672'    # Management Dashboard UI
    environment:
      RABBITMQ_DEFAULT_USER: handygo
      RABBITMQ_DEFAULT_PASS: handygo
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "-q", "ping"]
      interval: 5s
      timeout: 10s
      retries: 10
      start_period: 15s
```

* **AMQP Port `5672`:** Dành cho các microservice kết nối gửi/nhận message.
* **Management UI Port `15672`:** Giao diện trực quan để kiểm tra queues, exchanges, connections.
* **Tài khoản mặc định:** `handygo` / `handygo`.

---

## 4. Bảng so sánh biến môi trường (`RABBITMQ_URL`)

| Môi trường | Nơi cấu hình | Giá trị `RABBITMQ_URL` |
| :--- | :--- | :--- |
| **Local (chạy full Docker Compose)** | `backend/.env` | `amqp://handygo:handygo@rabbitmq:5672` |
| **Local (service chạy trực tiếp bằng Node ngoài host)** | `backend/.env` | `amqp://handygo:handygo@localhost:5672` |
| **Staging / Production (Azure)** | App Service / Container App Environment | `amqps://<user>:<password>@<host>/<vhost>` (CloudAMQP) |

> [!NOTE]
> Microservices hoàn toàn không hardcode chuỗi kết nối. Mọi service đều đọc từ `process.env.RABBITMQ_URL`. Vì vậy, thay đổi ở file `docker-compose.yml` chỉ phục vụ việc chạy độc lập ở local mà không ảnh hưởng tới pipeline CI/CD hay deployment server.

---

## 5. Hướng dẫn dành cho thành viên trong team khi pull code

Sau khi pull code mới có bổ sung RabbitMQ, thành viên chỉ cần thực hiện 2 bước đơn giản:

### Bước 1: Cập nhật file `backend/.env`
Đảm bảo dòng `RABBITMQ_URL` được trỏ về container local:
```env
# RabbitMQ Local (Khuyên dùng khi dev máy cá nhân)
RABBITMQ_URL=amqp://handygo:handygo@rabbitmq:5672

# CloudAMQP (Chỉ dùng khi cần test tích hợp riêng biệt nếu có quota)
# RABBITMQ_URL=amqps://cgfdshfo:uaKKnD2FQ7AbprsbaktLHWggWuqiqbSF@armadillo.rmq.cloudamqp.com/cgfdshfo
```

### Bước 2: Khởi động hệ thống
Từ thư mục `backend/`:
```bash
docker compose up -d
```

### Bước 3: Kiểm tra Dashboard quản trị (Tùy chọn)
* Truy cập trình duyệt: `http://localhost:15672`
* Đăng nhập: Username `handygo`, Password `handygo`.
* Tại đây có thể thấy toàn bộ các queue như `notification-service.events.v1`, `wallet-service-events`, `order-service` đang hoạt động bình thường.

---

## 6. Câu hỏi thường gặp (FAQ)

**Q: Chạy thêm container RabbitMQ có làm nặng máy không?**  
*A:* Image sử dụng là `rabbitmq:3-management-alpine` tối ưu hóa, mức tiêu thụ RAM thực tế chỉ khoảng **35MB - 50MB**, nhẹ hơn rất nhiều so với một microservice Node.js thông thường.

**Q: Có cần migrate hay tạo lại queues/exchanges bằng tay không?**  
*A:* Không. Mỗi khi microservice khởi động, cơ chế `assertEventTopology` trong code sẽ tự động khai báo exchange, queue và routing keys tương ứng trên RabbitMQ nếu chưa tồn tại.

**Q: Khi đẩy code lên nhánh `main` / `staging`, server có bị lỗi không?**  
*A:* Không. Trên server Azure/Staging, các biến môi trường được cấu hình riêng thông qua Portal/Secret Manager nên server vẫn sẽ kết nối tới Cloud broker như thường lệ.
