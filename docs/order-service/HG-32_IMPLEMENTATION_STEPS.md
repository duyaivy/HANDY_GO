# Lộ Trình Triển Khai Chi Tiết: Order Service (HG-32)

> **Ticket:** `[HG-32] Order SERVICE` (Sprint 4)  
> **Tài liệu nguồn:** [`HG-32-Order_Service.pdf`](file:///d:/SCHOOL/PBL6/docs/order-service/HG-32-Order_Service.pdf)  
> **Đặc tả kỹ thuật:** [`PLAN_ORDER_SERVICE.md`](file:///d:/SCHOOL/PBL6/docs/order-service/PLAN_ORDER_SERVICE.md)  
> **Tóm tắt kế hoạch:** [`order_service_implementation_plan.md`](file:///d:/SCHOOL/PBL6/docs/order-service/order_service_implementation_plan.md)  
> **Ngày lập:** 23/10/2026  

---

## 📌 Các Nguyên Tắc & Giả Định Cốt Lõi Đã Chốt

1. **Ranh giới Settlement (Quyết toán):**
   - Event `order.completed` là **yêu cầu Payment Service quyết toán khoản tiền đã tạm giữ trước đó**, KHÔNG phải lệnh Order Service tự thu tiền hay chuyển tiền cho Thợ.
   - Endpoint `GET /internal/orders/:orderId/payment-eligibility`: Cung cấp cho Payment Service xác minh điều kiện hoàn tất và lấy giá chốt `agreedPrice` dưới dạng **chuỗi Decimal chính xác** (tuyệt đối không dùng số thực floating-point).
   - Với hình thức **Point**: Payment/Wallet tạm giữ tiền của khách trước khi làm việc, rồi phân bổ từ khoản giữ sang ví Thợ khi nhận `order.completed`.
   - Với hình thức **Tiền mặt (Cash)**: Khách trả trực tiếp cho Thợ; Payment Service chỉ ghi nhận nợ hoa hồng sàn (`commission_receivables`), không chuyển thêm tiền cho Thợ.
2. **Quy tắc Escrow và Guard `start`:**
   - Order Service **KHÔNG chặn bước `start`** để chờ tín hiệu đã tạm giữ; việc đảm bảo Point được giữ thuộc trách nhiệm của luồng Payment/Checkout bên ngoài Order Service.
3. **Chuẩn hóa Event Contract:**
   - Sự kiện thanh toán thành công chuẩn là `payment.succeeded`. Order Service lắng nghe idempotent và chỉ cập nhật projection `payment_state` (`paid` / `failed`). Order Service KHÔNG gọi Wallet Service và KHÔNG tính toán `platform_fee`.
4. **Thời hạn (Deadlines) & Background Scheduler:**
   - Đóng nhận báo giá: `bidding_closes_at = published_at + 24h`.
   - Hạn chót Khách chọn Thợ: `selection_expires_at = bidding_closes_at + 24h` (tổng 48h từ khi publish).
   - Proposal `expires_at` không được vượt quá `selection_expires_at`.
   - Scheduler Worker quét định kỳ tự động chuyển `bidding_closed` và `expired` (vô hiệu hóa proposal mở).
5. **Quy trình Xử lý Tranh chấp (Dispute):**
   - Khách hoặc Thợ mở tranh chấp (`disputed`) khi Order ở `in_progress` hoặc `awaiting_customer_confirmation`.
   - Admin giải quyết tranh chấp bắt buộc có lý do và chọn 1 trong 3 hành động: tiếp tục trạng thái cũ (`resume_previous_state`), hủy đơn (`cancel`), hoặc hoàn tất (`complete`). Nếu chọn `complete`, phát đúng **duy nhất 1 event `order.completed`**.

---

## 🚀 7 Bước Triển Khai Cụ Thể (Checklist)

### 🟢 Bước 1: Nền tảng Database, Prisma Schema & Outbox Infrastructure (ORD-01)
- [x] Tạo thư mục `apps/order-service/prisma/` và viết file `schema.prisma`:
  - Khai báo schema tách biệt: `@@schema("order_service")`.
  - Các bảng: `service_requests`, `request_media`, `booking_proposals`, `orders`, `order_evidences`, `order_status_history`, `outbox_events`, `consumed_events`.
  - Bổ sung các trường lưu vết tranh chấp vào `Order`: `disputed_at`, `dispute_reason`, `dispute_previous_status`, `dispute_resolved_at`, `dispute_resolution_note`.
- [x] Cấu hình script trong `backend/package.json`:
  - `prisma:generate:order`: `prisma generate --schema=apps/order-service/prisma/schema.prisma`
  - `prisma:migrate:order`: `prisma migrate deploy --schema=apps/order-service/prisma/schema.prisma`
  - Thêm vào scripts tổng hợp `prisma:generate` và `prisma:migrate`.
- [x] Tạo `apps/order-service/src/common/database/`:
  - `order-prisma.service.ts`: Kế thừa `PrismaClient` với PostgreSQL pool adapter.
  - `order-outbox.repository.ts`: Thao tác lưu sự kiện outbox trong cùng transaction.

---

### 🟢 Bước 2: Domain Service Request & Quản lý Deadline 24h+24h (ORD-02, ORD-03)
- [x] Xây dựng Feature Module `apps/order-service/src/service-requests/`:
  - DTO: `create-service-request.dto.ts`, `update-service-request.dto.ts`, `query-service-request.dto.ts`.
  - Service Requests Controller & Service.
- [x] Nhận mảng media upload từ Gateway:
  - `POST /api/v1/service-requests`: Tạo draft kèm mảng `media: [{ mediaUrl, mediaType }]`.
  - `PATCH /api/v1/service-requests/:id`: Sửa draft khi còn `draft`.
- [x] Triển khai Xuất bản & Hủy yêu cầu:
  - `POST /api/v1/service-requests/:id/publish`: Validate dịch vụ catalog, tọa độ GPS, lịch hẹn; thiết lập hạn 24h bid + 48h chọn; ghi event `service_request.published` vào outbox.
  - `POST /api/v1/service-requests/:id/cancel`: Khách hủy request khi chưa có Order.
- [x] Triển khai Worker nền quét Deadline:
  - `order-deadline-scheduler.service.ts` (`@Cron('*/1 * * * *')`):
    - Quá `bidding_closes_at` $\to$ chuyển `bidding_closed`.
    - Quá `selection_expires_at` $\to$ chuyển `expired` và vô hiệu hóa proposal đang mở.

---

### 🟢 Bước 3: Domain Booking Proposal & Đàm Phán Bất Biến (ORD-04, ORD-05)
- [x] Xây dựng Feature Module `apps/order-service/src/booking-proposals/`:
  - DTO: `create-booking-proposal.dto.ts`, `request-changes-proposal.dto.ts`.
  - Proposals Controller & Service.
- [x] Tạo Proposal từ Bid hoặc AI Matching:
  - `POST /api/v1/booking-proposals`: Validate nguồn (Bid/Matching); kiểm tra hạn không vượt quá `selection_expires_at`.
- [x] Cơ chế Đàm phán Bất biến (Immutable Revision):
  - `POST /:id/request-changes`: Thợ xin sửa điều khoản kèm `response_note` $\to$ chuyển `changes_requested`.
  - Tạo Revision mới từ Khách: Gửi `POST /booking-proposals` kèm `supersedes_proposal_id`, tăng `revision_no`, giữ nguyên lịch sử cũ.
  - `POST /:id/reject`: Thợ từ chối nhận việc.
  - `POST /:id/withdraw`: Khách rút lại đề xuất.
  - Tra cứu danh sách proposal của request hoặc gửi đến Worker (`/me`).

---

### 🟢 Bước 4: Chốt Hợp Đồng & Tạo Order Nguyên Tử (ORD-06)
- [x] Xây dựng API `POST /api/v1/booking-proposals/:id/accept` (Thợ đồng ý đề xuất):
  - Chạy trong giao dịch ACID nguyên tử duy nhất (`prisma.$transaction`).
  - Khóa bi quan chống double-order (`SELECT ... FOR UPDATE` trên request/proposal).
  - Snapshot bất biến địa chỉ và tọa độ GPS từ Service Request.
  - Tạo bản ghi `Order` với trạng thái ban đầu `created`, `payment_state = unpaid`.
  - Chuyển proposal được chọn thành `finalized`.
  - Chuyển toàn bộ các proposal khác cùng request thành `superseded`.
  - Chuyển request thành `converted_to_order`.
  - Ghi bản ghi lịch sử `order_status_history`.
  - Ghi sự kiện `order.created` vào outbox.

---

### 🟢 Bước 5: Vòng Đời Thi Công, Evidence, Hủy Đơn & Tranh Chấp (ORD-07, ORD-08, ORD-10)
- [x] Xây dựng Feature Module `apps/order-service/src/orders/`:
  - `POST /:id/confirm-readiness`: Thợ báo sẵn sàng (`confirmed`).
  - `POST /:id/start`: Thợ bắt đầu làm việc (`in_progress`, không chặn chờ hold tiền).
  - `POST /:id/finish`: Thợ báo hoàn thành (kiểm tra bắt buộc đã có evidence).
  - `POST /:id/confirm-completion`: Khách nghiệm thu (`completed` $\to$ phát `order.completed`).
  - `POST /:id/request-rework`: Khách yêu cầu sửa lại kèm lý do $\to$ quay lại `in_progress`.
  - `POST /:id/cancel`: Hủy đơn theo chính sách.
- [x] Quản lý Evidence Minh chứng hoàn thành (ORD-10):
  - `POST /:id/evidence`: Lưu link media ảnh/video upload từ Gateway vào `order_evidences`.
  - `GET /:id/evidence`: Xem danh sách bằng chứng.
  - `DELETE /:id/evidence/:evidenceId`: Xóa bằng chứng trước khi finish.
- [x] Quản lý Khiếu nại Tranh chấp (Dispute Flow):
  - `POST /:id/dispute`: Khách hoặc Thợ mở khiếu nại kèm `disputeReason` $\to$ chuyển `disputed`.
  - `POST /api/v1/admin/orders/:id/resolve-dispute`: Admin giải quyết với lý do bắt buộc và chọn hành động:
    * `resume_previous_state`: Trở về trạng thái trước tranh chấp.
    * `cancel`: Hủy đơn (`cancelled`).
    * `complete`: Hoàn tất (`completed`) $\to$ phát đúng 1 event `order.completed`.
- [x] Tra cứu đơn hàng:
  - `GET /api/v1/orders`: Danh sách đơn của tôi (lọc `status`, `payment_state`, phân trang).
  - `GET /api/v1/orders/:id`: Chi tiết đơn kèm request, proposal, evidence.
  - `GET /api/v1/orders/:id/status-history`: Dòng thời gian lịch sử trạng thái.
  - `GET /api/v1/admin/orders`: Toàn quyền tra cứu cho Admin.

---

### 🟢 Bước 6: Tích Hợp Liên Service, RabbitMQ & API Gateway (ORD-09)
- [x] Cung cấp Internal REST APIs:
  - `GET /internal/service-requests/:id/bidding-eligibility`: Cung cấp cho Bidding Service.
  - `GET /internal/orders/:orderId/payment-eligibility`: Cung cấp cho Payment Service xác minh quyết toán (giá `agreedPrice` chuỗi decimal chính xác).
  - Bảo vệ bằng timing-safe comparison `x-internal-secret`.
- [x] Outbox Poller nền & RabbitMQ Publisher:
  - Đọc event `pending` trong `outbox_events` phát lên Exchange `handy-go.events` (`service_request.published`, `order.created`, `order.completed`, `order.cancelled`).
- [x] Payment Consumer (Idempotent Inbox):
  - Lắng nghe sự kiện `payment.succeeded` và `payment.failed`.
  - Sử dụng bảng `consumed_events` chống trùng lặp.
  - Cập nhật projection `payment_state` (`paid` / `failed`).
- [x] Cấu hình API Gateway Proxy:
  - Cập nhật `apps/api-gateway/src/proxy/proxy.constants.ts` khai báo prefix `/api/v1/service-requests`, `/api/v1/booking-proposals`, `/api/v1/orders`, `/api/v1/admin/orders`.

---

### 🟢 Bước 7: Kiểm Thử Toàn Diện & Quality Gate (Verification)
- [x] Chạy bộ kiểm thử đơn vị:
  ```bash
  pnpm test apps/order-service
  ```
- [x] Kiểm tra kiểu tĩnh TypeScript:
  ```bash
  pnpm run typecheck
  ```
- [x] Kiểm tra linting với Oxlint:
  ```bash
  pnpm run lint
  ```
- [x] Cập nhật tài liệu đăng ký tài nguyên dùng chung trong `backend/AGENTS.md`.

---

## 🎯 Bắt Đầu Từ Đâu?
👉 **Bắt đầu ngay tại Bước 1 (ORD-01)**: Tạo `apps/order-service/prisma/schema.prisma`, cấu hình scripts `prisma:generate:order` và `prisma:migrate:order`.
