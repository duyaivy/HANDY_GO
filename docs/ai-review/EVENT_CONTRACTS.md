# Hợp đồng Sự kiện Bất đồng bộ và Cấu trúc RabbitMQ trong HANDY_GO

## 1. Cấu trúc Broker và Phân vùng Hàng đợi

- **Hệ thống Message Broker**: RabbitMQ 3.13+.
- **Exchange Trung tâm**: Sử dụng duy nhất một Topic Exchange chính: `handygo.domain.events` (Bền bỉ - Durable, Kiểu Topic).
- **Quy chuẩn đặt tên Hàng đợi (Queue)**: Mỗi microservice tiêu thụ sở hữu một queue riêng biệt.
  - Định dạng tên: `<consumer-service>.<domain-topic>-events` (Ví dụ: `tracking.order-events`, `bidding.order-events`, `payment.order-events`).
  - **Nghiêm cấm** việc hai service khác nhau cùng tranh chấp lắng nghe (competing consumers) trên cùng một hàng đợi.
- **Hàng đợi Xử lý Lỗi (Dead Letter Queue - DLQ)**: Khi một message gặp lỗi quá 3 lần thử lại (retry), message sẽ tự động chuyển hướng về hàng đợi lỗi `<queue>.dlx`.

---

## 2. Chuẩn Đóng gói Sự kiện Domain (Domain Event Envelope)

Mọi sự kiện được xuất bản lên RabbitMQ bắt buộc phải tuân theo cấu trúc Envelope chuẩn được định nghĩa tại thư viện chung `@app/common`:

```typescript
export interface DomainEventEnvelope<T = any> {
  eventId: string;           // UUIDv4 duy nhất dùng để khử trùng lặp (deduplication)
  eventType: string;         // Hằng số định danh từ EVENT_PATTERNS
  aggregateId: string;       // ID thực thể chính (ví dụ: orderId, serviceRequestId)
  aggregateVersion: number;  // Phiên bản tăng dần của thực thể
  occurredAt: string;        // Thời gian phát sinh sự kiện chuẩn ISO-8601 UTC
  correlationId: string;     // Mã truy vết luồng phục vụ Distributed Tracing
  actorUserId?: string;      // ID người dùng khởi phát hành động (nếu có)
  payload: T;                // Dữ liệu chi tiết của sự kiện có định kiểu chặt chẽ
}
```

---

## 3. Danh mục Sự kiện Chính và Routing Keys

### 3.1 Vòng đời Yêu cầu & Đơn hàng (`order-service`)

| Tên Sự kiện (`eventType`) | Routing Key | Thời điểm Phát sinh | Các Service Tiêu thụ Chính |
|---|---|---|---|
| `service_request.created` | `service_request.created` | Khách hàng tạo mới yêu cầu tìm thợ | `tracking-service` |
| `service_request.published` | `service_request.published` | Khách hàng công khai yêu cầu để nhận báo giá | `matching-service`, `bidding-service`, `tracking-service` |
| `service_request.cancelled` | `service_request.cancelled` | Khách hàng hủy bỏ yêu cầu | `bidding-service`, `matching-service`, `tracking-service` |
| `booking_proposal.created` | `booking_proposal.created` | Khách hàng gửi bản đề xuất tới thợ | `notification-service`, `tracking-service` |
| `booking_proposal.changes_requested` | `booking_proposal.changes_requested` | Thợ yêu cầu điều chỉnh giá hoặc phạm vi | `notification-service`, `tracking-service` |
| `booking_proposal.finalized` | `booking_proposal.finalized` | Thợ chấp thuận đề xuất (nguyên tử cùng Order) | `tracking-service`, `bidding-service` |
| `order.created` | `order.created` | Đơn hàng chính thức được tạo lập | `tracking-service`, `bidding-service`, `payment-service` |
| `order.status.changed` | `order.status.changed` | Tiến độ đơn hàng thay đổi | `tracking-service`, `notification-service` |
| `order.completed` | `order.completed` | Khách hàng xác nhận công việc hoàn tất | `payment-service`, `user-trust-service`, `tracking-service` |
| `order.cancelled` | `order.cancelled` | Đơn hàng đang thực hiện bị hủy bỏ | `payment-service`, `tracking-service`, `notification-service` |

### 3.2 Vòng đời Đấu giá Báo giá (`bidding-service`)

| Tên Sự kiện (`eventType`) | Routing Key | Thời điểm Phát sinh | Các Service Tiêu thụ Chính |
|---|---|---|---|
| `bid.submitted` | `bid.submitted` | Thợ gửi một báo giá mới | `tracking-service`, `notification-service` |
| `bid.revised` | `bid.revised` | Thợ cập nhật báo giá trong thời gian cho phép | `tracking-service`, `notification-service` |
| `bid.withdrawn` | `bid.withdrawn` | Thợ chủ động rút lại báo giá | `tracking-service` |
| `bidding.round.closed` | `bidding.round.closed` | Hết thời gian nhận báo giá mà chưa có đơn | `notification-service` |
| `bidding.round.finalized` | `bidding.round.finalized` | Báo giá thắng thầu được xác định qua `order.created` | `notification-service` |

### 3.3 Vòng đời Thanh toán & Ví tiền (`payment-service`, `wallet-service`)

| Tên Sự kiện (`eventType`) | Routing Key | Thời điểm Phát sinh | Các Service Tiêu thụ Chính |
|---|---|---|---|
| `payment.succeeded` | `payment.succeeded` | Thanh toán được xác nhận thành công (IPN VNPAY hoặc trừ Point) | `order-service`, `notification-service`, `tracking-service` |
| `payment.failed` | `payment.failed` | Giao dịch thanh toán thất bại | `notification-service`, `tracking-service` |
| `payment.refund.requested` | `payment.refund.requested` | Yêu cầu hoàn tiền được khởi tạo, chờ Admin duyệt | `notification-service` (Dành cho Admin) |
| `payment.refund.completed` | `payment.refund.completed` | Admin đã duyệt và Point đã được cộng vào ví khách | `order-service`, `notification-service`, `tracking-service` |
| `wallet.updated` | `wallet.updated` | Bút toán biến động số dư ví đã ghi sổ | `notification-service` |

---

## 4. Cơ chế Đảm bảo Độ Tin cậy và Bất biến (Delivery Guarantees)

### 4.1 Mô hình Transactional Outbox (Phía Xuất bản)
1. Thao tác cập nhật cơ sở dữ liệu và thao tác lưu bản ghi sự kiện vào bảng `outbox` phải nằm trong **cùng một database transaction**:
   ```typescript
   await prisma.$transaction(async (tx) => {
     const order = await tx.order.create({ data: orderData });
     await tx.outbox.create({
       data: {
         eventId: randomUUID(),
         eventType: EVENT_PATTERNS.ORDER_CREATED,
         payload: { orderId: order.id, ... },
         status: 'PENDING',
       },
     });
   });
   ```
2. Worker `OutboxPublisherService` định kỳ quét các bản ghi `PENDING`, gửi lên RabbitMQ và chỉ đánh dấu `PUBLISHED` khi nhận được ACK từ broker.

### 4.2 Mô hình Xử lý Khử Trùng lặp (Inbox Pattern - Phía Tiêu thụ)
- Bên nhận sự kiện phải trích xuất `envelope.eventId` và kiểm tra xem đã từng xử lý sự kiện này chưa:
  ```typescript
  const existing = await this.inboxRepository.findById(envelope.eventId);
  if (existing) {
    this.logger.warn(`Bỏ qua sự kiện trùng lặp: ${envelope.eventId}`);
    return channel.ack(msg);
  }
  await this.processBusinessLogic(envelope);
  await this.inboxRepository.markProcessed(envelope.eventId);
  channel.ack(msg);
  ```
- Bất kỳ Pull Request nào thêm mới một consumer nhận sự kiện mà không có bước kiểm tra `eventId` khử trùng lặp đều phải bị cảnh báo lỗi.
