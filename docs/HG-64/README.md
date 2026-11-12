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
- [`README.md`](README.md): Tổng quan và trạng thái tiến độ tích hợp.
- [`TRACKING_TIEN_DO_HG-64.md`](TRACKING_TIEN_DO_HG-64.md): 📊 **Bảng theo dõi tiến độ hoàn thành (Progress Dashboard)**, checklist từng task và nhật ký công việc.
- [`BAO_CAO_KIEM_TRA_TICH_HOP_TRACKING_ORDER.md`](BAO_CAO_KIEM_TRA_TICH_HOP_TRACKING_ORDER.md): Báo cáo chi tiết rà soát hiện trạng tích hợp giữa Order Service và Tracking Service (Backend & Mobile).
- [`KE_HOACH_CHI_TIET_HOAN_THANH_TICH_HOP.md`](KE_HOACH_CHI_TIET_HOAN_THANH_TICH_HOP.md): Kế hoạch triển khai chi tiết 5 giai đoạn để hoàn thành 100% tích hợp từ Backend tới Mobile App.

### 📚 Tài liệu Hướng dẫn Thực hiện theo Từng Giai đoạn:
1. [`GIAI_DOAN_1_BACKEND_EDGE_CASES.md`](GIAI_DOAN_1_BACKEND_EDGE_CASES.md): Rà soát & gia cố các mốc sự kiện biên (`rework`, `dispute`), cấu hình API Gateway.
2. [`GIAI_DOAN_2_MOBILE_CLIENT_VA_SSE.md`](GIAI_DOAN_2_MOBILE_CLIENT_VA_SSE.md): Xây dựng DTO, `TrackingApi`, `TrackingSseClient` và React Query Hooks.
3. [`GIAI_DOAN_3_DAU_NOI_GIAO_DIEN_KHACH_HANG.md`](GIAI_DOAN_3_DAU_NOI_GIAO_DIEN_KHACH_HANG.md): Xây dựng Component `OrderTrackingTimeline` và tích hợp SSE vào màn hình Khách hàng.
4. [`GIAI_DOAN_4_DAU_NOI_GIAO_DIEN_THO.md`](GIAI_DOAN_4_DAU_NOI_GIAO_DIEN_THO.md): Tích hợp Timeline cho Thợ, đồng bộ sự kiện làm lại và nghiệm thu tức thời.
5. [`GIAI_DOAN_5_KIEM_THU_TOAN_TRINH_VA_NGHIEM_THU.md`](GIAI_DOAN_5_KIEM_THU_TOAN_TRINH_VA_NGHIEM_THU.md): Kịch bản kiểm thử 2 thiết bị thực tế, kiểm tra khả năng chịu lỗi và nghiệm thu bàn giao.

---

## 4. Các việc cần xử lý sau rà soát ngày 10/11/2026

1. [HG64-01 — Cache Redis có thể trả dữ liệu cũ](./HG64-01_CACHE_REDIS.md) (P1)
2. [HG64-02 — Thiếu sự kiện đóng nhận báo giá](./HG64-02_SU_KIEN_DONG_NHAN_BAO_GIA.md) (P2)
3. [HG64-03 — Contract các Order event chuyên biệt](./HG64-03_CONTRACT_ORDER_EVENTS.md) (P2/P3)
4. [HG64-04 — Payload không hợp lệ bị ACK](./HG64-04_PAYLOAD_KHONG_HOP_LE.md) (P2)
5. [HG64-05 — Kiểm thử xuyên suốt với dịch vụ thật](./HG64-05_KIEM_THU_XUYEN_SUOT.md) (P2)
6. [HG64-06 — Đồng bộ contract và tài liệu](./HG64-06_DONG_BO_CONTRACT_VA_TAI_LIEU.md) (P3)

Xem [bảng rà soát hoàn thành và hướng dẫn kiểm thử trực tiếp từng task](./KIEM_TRA_VA_KIEM_THU_TRUC_TIEP_HG64.md) để chạy lại trên máy và ghi nhận bằng chứng nghiệm thu.

## 5. Trạng thái kiểm chứng ngày 11/11/2026

- **Mã nguồn:** Order Service ghi event vào transactional outbox; Tracking Service nhận event qua RabbitMQ, lưu timeline, xử lý trùng lặp và phát SSE. Ba payload `order.created`, `order.status.changed`, `service_request.bidding_closed` dùng contract chung trong `@app/common`.
- **Kiểm thử tại checkout này:** Backend typecheck và các test liên quan đến Order/Tracking đã chạy thành công. Xem [HG64-05](./HG64-05_KIEM_THU_XUYEN_SUOT.md) và [HG64-06](./HG64-06_DONG_BO_CONTRACT_VA_TAI_LIEU.md) để biết phạm vi.
- **Nghiệm thu môi trường thật:** Chưa có bằng chứng pipeline PR xanh và chưa chạy suite Compose RabbitMQ/PostgreSQL/Redis tại máy rà soát. Chưa thể kết luận đạt điều kiện phát hành production. Các tỷ lệ hoàn thành và số test trong tài liệu giai đoạn trước là ghi nhận lịch sử, không phải kết quả kiểm thử của lần rà soát này.

