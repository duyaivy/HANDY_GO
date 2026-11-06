# HG-64: Tích hợp Tracking Service vào Order Service

## 1. Thông tin tổng quan
- **Ticket / Mã công việc:** HG-64
- **Tiêu đề:** Tích hợp Tracking Service vào Order Service
- **Nhánh phát triển:** `feature/HG-64-integrate-tracking-service-into-order-service`
- **Base Branch:** `main`
- **Dịch vụ liên quan:**
  - `backend/apps/order-service`
  - `backend/apps/tracking-service`
  - `backend/libs/common`
  - `frontend / mobile` (nếu cần hiển thị timeline)

---

## 2. Mục tiêu kỹ thuật
1. Đảm bảo toàn bộ vòng đời của Yêu cầu dịch vụ (Service Request) và Đơn hàng (Order) từ Order Service được phát đi (publish) qua Outbox Pattern hoặc Event Bus đến RabbitMQ đầy đủ, chính xác.
2. Kiểm tra và đồng bộ các Event Pattern giữa Order Service và Tracking Service:
   - `service_request.created`, `service_request.published`, `service_request.cancelled`, `service_request.expired`, `service_request.converted_to_order`
   - `booking_proposal.created`, `booking_proposal.changes_requested`, `booking_proposal.rejected`, `booking_proposal.withdrawn`, `booking_proposal.finalized`
   - `order.created`, `order.status_changed`, `order.completed`, `order.cancelled`
3. Đảm bảo tính nhất quán dữ liệu (idempotency, out-of-order tolerance, role-aware caching và bid shielding).
4. Viết và cập nhật unit/e2e test kiểm chứng tính năng tích hợp.

---

## 3. Cấu trúc thư mục tài liệu `docs/HG-64/`
- [`README.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/README.md): Tổng quan và trạng thái tiến độ tích hợp.
- [`TRACKING_TIEN_DO_HG-64.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/TRACKING_TIEN_DO_HG-64.md): 📊 **Bảng theo dõi tiến độ hoàn thành (Progress Dashboard)**, checklist từng task và nhật ký công việc.
- [`BAO_CAO_KIEM_TRA_TICH_HOP_TRACKING_ORDER.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/BAO_CAO_KIEM_TRA_TICH_HOP_TRACKING_ORDER.md): Báo cáo chi tiết rà soát hiện trạng tích hợp giữa Order Service và Tracking Service (Backend & Mobile).
- [`KE_HOACH_CHI_TIET_HOAN_THANH_TICH_HOP.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/KE_HOACH_CHI_TIET_HOAN_THANH_TICH_HOP.md): Kế hoạch triển khai chi tiết 5 giai đoạn để hoàn thành 100% tích hợp từ Backend tới Mobile App.

### 📚 Tài liệu Hướng dẫn Thực hiện theo Từng Giai đoạn:
1. [`GIAI_DOAN_1_BACKEND_EDGE_CASES.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_1_BACKEND_EDGE_CASES.md): Rà soát & gia cố các mốc sự kiện biên (`rework`, `dispute`), cấu hình API Gateway.
2. [`GIAI_DOAN_2_MOBILE_CLIENT_VA_SSE.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_2_MOBILE_CLIENT_VA_SSE.md): Xây dựng DTO, `TrackingApi`, `TrackingSseClient` và React Query Hooks.
3. [`GIAI_DOAN_3_DAU_NOI_GIAO_DIEN_KHACH_HANG.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_3_DAU_NOI_GIAO_DIEN_KHACH_HANG.md): Xây dựng Component `OrderTrackingTimeline` và tích hợp SSE vào màn hình Khách hàng.
4. [`GIAI_DOAN_4_DAU_NOI_GIAO_DIEN_THO.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_4_DAU_NOI_GIAO_DIEN_THO.md): Tích hợp Timeline cho Thợ, đồng bộ sự kiện làm lại và nghiệm thu tức thời.
5. [`GIAI_DOAN_5_KIEM_THU_TOAN_TRINH_VA_NGHIEM_THU.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_5_KIEM_THU_TOAN_TRINH_VA_NGHIEM_THU.md): Kịch bản kiểm thử 2 thiết bị thực tế, kiểm tra khả năng chịu lỗi và nghiệm thu bàn giao.

---

## 4. Trạng thái hiện tại: ✅ COMPLETED 100%
- **Backend:** Đã tích hợp hoàn tất 100% qua RabbitMQ Topic Exchange `handy-go.events` & Transactional Outbox Pattern, xử lý các sự kiện biên `rework`, `disputed` và cấu hình API Gateway SSE (đã test 28/28 files, 296 tests pass).
- **Mobile Client:** Đã đấu nối trọn vẹn cả 2 giao diện Khách hàng (`CustomerOrderDetailScreen`) và Thợ (`WorkerJobDetailScreen`) với dòng thời gian thời gian thực `OrderTrackingTimeline` qua `TrackingSseClient` và React Query hooks, hỗ trợ tự phục hồi khi rớt mạng và Graceful Fallback (đã test 67/67 suites, 516 tests pass).
- **Nghiệm thu toàn trình:** Đã hoàn thành 5/5 giai đoạn và sẵn sàng tạo Pull Request bàn giao.

