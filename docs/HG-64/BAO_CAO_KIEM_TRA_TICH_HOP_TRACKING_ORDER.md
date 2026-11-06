# Báo cáo Kiểm tra Hiện trạng: Tích hợp Tracking Service vào Order Service

> **Mã công việc:** HG-64  
> **Ngày thực hiện:** 06/11/2026  
> **Người kiểm tra:** Antigravity AI  
> **Trạng thái tổng quát:** 
> - **Backend (Microservices & RabbitMQ):** ✅ **ĐÃ TÍCH HỢP HOÀN TẤT & ĐÃ MERGE VÀO MAIN** (Pull Request #44).
> - **Mobile App / Frontend Client:** ⏳ **CHƯA ĐẤU NỐI API/SSE CỦA TRACKING SERVICE** (Đang dùng Fallback `statusHistory` từ Order Service).

---

## 1. Tóm tắt kết quả kiểm tra (Executive Summary)

Dự án đặt câu hỏi: *"Tích hợp Tracking Service vào Order Service đã được tích hợp chưa?"*

Sau khi rà soát toàn bộ mã nguồn backend, lịch sử git, tài liệu kiến trúc và ứng dụng di động, kết quả như sau:

| Tầng hệ thống | Trạng thái | Chi tiết kỹ thuật |
| :--- | :---: | :--- |
| **Backend Architecture** | ✅ Hoàn thành | Thiết kế theo kiến trúc vi dịch vụ độc lập (*Database-per-service*). Hai service không gọi đồng bộ (HTTP/RPC) mà tích hợp lỏng (*loose coupling*) qua RabbitMQ Topic Exchange `handy-go.events`. |
| **Order Service (Publisher)** | ✅ Hoàn thành | Đã triển khai Transactional Outbox Pattern (`OrderOutboxRepository`, `OrderOutboxPublisherService`). Đầy đủ các domain event của `service_request.*`, `booking_proposal.*`, `order.*`. Bổ sung event `service_request.created` từ PR #44 để tracking bắt đầu ngay từ khi tạo draft. |
| **Tracking Service (Consumer)** | ✅ Hoàn thành | Đã subscribe đầy đủ các routing key từ Order Service. Đảm bảo Idempotency 2 tầng, bộ đệm xử lý đến lệch thứ tự (`pending_tracking_events`), cache Redis tự động hủy và SSE Stream phát real-time. |
| **Kiểm thử tự động (CI/Tests)** | ✅ Hoàn thành | 100% Unit test & E2E test của cả `order-service` và `tracking-service` đều PASS. |
| **Mobile App (Frontend Client)** | ⏳ Chưa đấu nối | Màn hình [`customer-order-detail-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx) hiện đang hiển thị `statusHistory` tĩnh từ Order Service (`GET /orders/:id`). Chưa gọi endpoint Timeline hoặc SSE Stream của Tracking Service. |

---

## 2. Kiến trúc và Ranh giới nghiệp vụ (System Architecture)

### 2.1. Ranh giới dịch vụ
* **`order-service` (Port 3004):** Là dịch vụ có thẩm quyền tối cao (*Authoritative Source-of-Truth*) quản lý vòng đời Yêu cầu dịch vụ (Service Request), Báo giá chấp thuận (Booking Proposal) và Đơn hàng (Order). Nắm giữ State Machine và bảng lịch sử giao dịch trạng thái `order_status_history`.
* **`tracking-service` (Port 3010):** Là dịch vụ báo cáo và tổng hợp dòng thời gian (*Read-model / Append-only Event Sourcing*). Thu thập chuỗi sự kiện lịch sử từ nhiều service (Order, Matching, Bidding, Payment) thành một luồng duy nhất cho khách hàng, thợ và quản trị viên theo dõi.

### 2.2. Sơ đồ tương tác dữ liệu

```mermaid
flowchart LR
    subgraph OrderService["Order Service (:3004)"]
        SR["Service Requests / Orders"]
        Outbox["Order Outbox Table"]
        Publisher["Outbox Publisher (Poll 3s)"]
        SR -->|ACID Transaction| Outbox
        Outbox --> Publisher
    end

    subgraph RabbitMQ["RabbitMQ Message Broker"]
        Exchange{{"handy-go.events (Topic Exchange)"}}
        Queue[("tracking-service Queue")]
        Exchange -->|Routing Patterns| Queue
    end

    subgraph TrackingService["Tracking Service (:3010)"]
        Consumer["TrackingEventsConsumer"]
        Service["TrackingEventsService"]
        Pending["Pending Inbox Buffer"]
        DB[("tracking_flows & tracking_events")]
        SSE["TimelineStreamService (SSE /live)"]
        
        Consumer --> Service
        Service --> DB
        Service --> Pending
        Service --> SSE
    end

    Publisher -->|emit event| Exchange
    Queue -->|consume event| Consumer
```

---

## 3. Phân tích chi tiết tầng Backend

### 3.1. Phía Order Service (Publisher)
Tại [`backend/apps/order-service`](file:///d:/SCHOOL/PBL6/backend/apps/order-service), toàn bộ biến động trạng thái đều được ghi nhận vào Outbox trong cùng một Transaction nghiệp vụ:
1. **Tạo yêu cầu:** Khi tạo bản nháp yêu cầu ([`service-requests.service.ts`](file:///d:/SCHOOL/PBL6/backend/apps/order-service/src/service-requests/service-requests.service.ts#L70-L92)), outbox phát `service_request.created` kèm `serviceRequestId`, `requestCode`, `customerUserId`.
2. **Xuất bản & Hết hạn:** Phát `service_request.published`, `service_request.bidding_closed`, `service_request.expired`, `service_request.cancelled`.
3. **Đề xuất đặt thợ:** Phát `booking_proposal.created`, `booking_proposal.changes_requested`, `booking_proposal.rejected`.
4. **Tạo đơn hàng:** Khi thợ nhận việc, phát `order.created` chứa cả `orderId`, `serviceRequestId`, `customerId`, `workerId`.
5. **Tiến trình đơn hàng:** Hàm `emitOrderStatusChangedEvent` ([`orders.service.ts`](file:///d:/SCHOOL/PBL6/backend/apps/order-service/src/orders/orders.service.ts#L1614-L1641)) phát `order.status.changed` với payload chuẩn `{ previousStatus, nextStatus, customerId, workerId, ... }` mỗi khi đơn chuyển trạng thái (`confirmed`, `in_progress`, `finished`, `disputed`).
6. **Hoàn thành / Hủy:** Phát `order.completed`, `order.cancelled`.

### 3.2. Phía Tracking Service (Consumer)
Tại [`backend/apps/tracking-service`](file:///d:/SCHOOL/PBL6/backend/apps/tracking-service):
1. **Tiêu thụ sự kiện:** [`TrackingEventsConsumer`](file:///d:/SCHOOL/PBL6/backend/apps/tracking-service/src/events/tracking-events.consumer.ts) subscribe toàn bộ các pattern sự kiện phát ra từ `order-service`.
2. **Khử trùng lặp (Idempotency):** [`TrackingEventsService`](file:///d:/SCHOOL/PBL6/backend/apps/tracking-service/src/events/tracking-events.service.ts) ghi nhận `eventId` vào bảng `consumed_events` và khóa phân tán `pg_advisory_xact_lock` để bảo đảm không xử lý trùng khi mạng chập chờn.
3. **Xử lý sự kiện lệch thứ tự (Out-of-order tolerance):** 
   - Nếu sự kiện trạng thái đơn hàng đến trước khi `order.created` hoặc `service_request.created` được ghi nhận, sự kiện được lưu tạm vào bảng `pending_tracking_events`.
   - Ngay khi `order.created` tới hoặc định kỳ qua [`TrackingReconciliationScheduler`](file:///d:/SCHOOL/PBL6/backend/apps/tracking-service/src/events/tracking-reconciliation.scheduler.ts), hệ thống tự động flush toàn bộ sự kiện chờ để ráp vào dòng thời gian.
4. **Tương thích Payload (Commit `a3d7653`):** Tracking Service đã map chuẩn xác các trường `nextStatus` / `previousStatus` từ Order Service sang `toStatus` / `fromStatus` trên Timeline.
5. **Real-time SSE:** Ngay khi ghi nhận event vào bảng `tracking_events`, [`TimelineStreamService`](file:///d:/SCHOOL/PBL6/backend/apps/tracking-service/src/common/stream/timeline-stream.service.ts) phát trực tiếp qua Server-Sent Events đến các client đang theo dõi `/api/v1/tracking/requests/:id/live`.

---

## 4. Ma trận đồng bộ Event giữa hai dịch vụ

| Tên sự kiện (Routing Key) | Bên phát (Order Service) | Bên nhận (Tracking Service) | Mục đích trong Timeline |
| :--- | :---: | :---: | :--- |
| `service_request.created` | ✅ | ✅ | Khởi tạo `tracking_flows`, mốc tạo yêu cầu dịch vụ |
| `service_request.published` | ✅ | ✅ | Mốc yêu cầu bắt đầu mở nhận báo giá/tìm thợ |
| `service_request.bidding_closed` | ✅ | ✅ | Mốc kết thúc nhận báo giá |
| `service_request.expired` | ✅ | ✅ | Mốc yêu cầu quá hạn chọn thợ |
| `service_request.cancelled` | ✅ | ✅ | Mốc khách hủy yêu cầu |
| `booking_proposal.created` | ✅ | ✅ | Mốc gửi đề xuất thỏa thuận công việc |
| `booking_proposal.changes_requested` | ✅ | ✅ | Mốc khách yêu cầu sửa đổi đề xuất |
| `booking_proposal.rejected` | ✅ | ✅ | Mốc từ chối đề xuất |
| `order.created` | ✅ | ✅ | Mốc chính thức tạo đơn hàng, gắn `orderId` vào luồng |
| `order.status.changed` | ✅ | ✅ | Cập nhật tiến độ: `confirmed` $\to$ `in_progress` $\to$ `finished` $\to$ `disputed` |
| `order.completed` | ✅ | ✅ | Mốc nghiệm thu thành công đơn hàng |
| `order.cancelled` | ✅ | ✅ | Mốc hủy đơn hàng |

---

## 5. Kết quả kiểm thử thực tế

Tất cả các bộ test kiểm tra tích hợp giữa hai dịch vụ đều đã được thực thi và đạt kết quả tuyệt đối:

```bash
# 1. Kiểm tra Tracking Event Consumer & Service
✓ apps/tracking-service/src/events/tracking-events.service.spec.ts (19 tests) - PASS
✓ apps/tracking-service/src/events/tracking-events.consumer.spec.ts (10 tests) - PASS

# 2. Kiểm tra Order Service Outbox & State Transitions
✓ apps/order-service/src/orders/orders.service.spec.ts (43 tests) - PASS
✓ apps/order-service/src/service-requests/service-requests.service.spec.ts (35 tests) - PASS
```

---

## 6. Hiện trạng ở Mobile App & Hướng dẫn hoàn thiện

### 6.1. Hiện trạng
Tại giao diện chi tiết đơn hàng khách hàng ([`customer-order-detail-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx#L292-L315)), ứng dụng đang hiển thị các bước của đơn hàng dựa trên trường `statusHistory` nhận về từ API `GET /api/v1/orders/:id`:

```typescript
// Lấy trực tiếp từ Order Service
const { data: order } = useCustomerOrder(orderId);
const statusHistory = order?.statusHistory;
```

Đây là cơ chế *Smart Interop Fallback* giúp luồng màn hình chạy được độc lập mà không bị gián đoạn khi Tracking Service đang phát triển.

### 6.2. Hướng dẫn đấu nối tiếp theo (Đưa vào Mobile)
Để hoàn thiện trọn vẹn trải nghiệm real-time cho người dùng cuối:
1. **Thay thế API lấy Timeline:** Đổi từ việc hiển thị `statusHistory` của đơn hàng sang gọi endpoint `GET /api/v1/tracking/requests/:serviceRequestId/timeline` hoặc `GET /api/v1/tracking/requests/:serviceRequestId/summary`.
2. **Kích hoạt SSE Streaming:** Kết nối vào `GET /api/v1/tracking/requests/:serviceRequestId/live` bằng thư viện SSE (như `react-native-sse`) theo hướng dẫn tại Mục 11 của [`docs/HG47_TRACKING_SERVICE.md`](file:///d:/SCHOOL/PBL6/docs/HG47_TRACKING_SERVICE.md).
3. **Lưu ý về GPS:** Theo chuẩn thiết kế cơ sở dữ liệu `tracking-service-v2.dbml`, Tracking Service là **Business Timeline Service**, không lưu tọa độ GPS thời gian thực. Các tính năng bản đồ nếu có sẽ đi qua dịch vụ Location/Map riêng.

---

## 7. Kết luận cho Ticket HG-64

* **Về phía Backend:** Việc tích hợp Tracking Service vào Order Service **đã hoàn thành 100%**, mã nguồn đã được merge vào nhánh chính `main` tại PR #44 và sẵn sàng hoạt động trong môi trường Docker / Microservices.
* **Về phía Toàn trình (End-to-End):** Cần thực hiện tiếp việc tích hợp ở tầng Mobile App để người dùng có thể nhận được dữ liệu thời gian thực từ Tracking Service thay vì cơ chế fallback hiện tại.
