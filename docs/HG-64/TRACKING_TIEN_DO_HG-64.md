# Bảng Theo dõi Tiến độ Hoàn thành (Progress Tracking Dashboard) - HG-64

> **Mã công việc:** HG-64  
> **Tiêu đề:** Tích hợp Tracking Service vào Order Service  
> **Nhánh Git:** `feature/HG-64-integrate-tracking-service-into-order-service`  
> **Khởi tạo:** 06/11/2026  
> **Cập nhật lần cuối:** 06/11/2026  
> **Trạng thái hiện tại:** 🟡 **IN PROGRESS (45% Hoàn thành)**  
> *(Nền tảng Backend Core và Giai đoạn 1 Rà soát & Gia cố Backend Edge Cases đã hoàn tất 100%)*

---

## 1. Dashboard Tổng quan Tiến độ (Progress Overview)

```
[█████████░░░░░░░░░░░] 45% Hoàn thành tổng thể
```

| Giai đoạn | Nội dung công việc | Ước lượng | Tỉ trọng | Trạng thái | Tiến độ |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **Core BE** | **Nền tảng Backend Core (PR #44)** | Đã merge | 35% | ✅ Đã hoàn tất | 100% |
| **Phase 1** | Rà soát & Gia cố Backend Edge Cases | 0.5 ngày | 10% | ✅ Đã hoàn tất | 100% |
| **Phase 2** | Xây dựng Client API & SSE trên Mobile | 1.0 ngày | 20% | ⏳ Sẵn sàng | 0% |
| **Phase 3** | Đấu nối Giao diện Khách hàng (Live Timeline) | 1.0 ngày | 15% | ⏳ Sẵn sàng | 0% |
| **Phase 4** | Đấu nối Giao diện Thợ (Rework & Completion Sync) | 0.5 ngày | 10% | ⏳ Sẵn sàng | 0% |
| **Phase 5** | Kiểm thử toàn trình (E2E) & Bàn giao | 1.0 ngày | 10% | ⏳ Sẵn sàng | 0% |
| **TỔNG CỘNG** | **Toàn bộ tiến trình tích hợp** | **4.0 ngày** | **100%** | 🟡 **Đang tiến hành** | **45%** |

---

## 2. Danh mục Checklist Chi tiết từng Task (Detailed Micro-tasks)

### 🔹 Nền tảng Backend Core (Đã hoàn thành trong PR #44)
- [x] **TASK-64-CORE-1:** Triển khai Database-per-service độc lập cho Tracking Service (`tracking_flows`, `tracking_events`, `pending_tracking_events`).
- [x] **TASK-64-CORE-2:** Thiết lập Transactional Outbox Pattern tại Order Service (`OrderOutboxRepository`, `OrderOutboxPublisherService`).
- [x] **TASK-64-CORE-3:** Đồng bộ sự kiện `service_request.created` vào Outbox khi tạo draft để khởi tạo flow tracking.
- [x] **TASK-64-CORE-4:** Chuẩn hóa payload contract `{ previousStatus, nextStatus }` cho sự kiện `order.status.changed` (commit `a3d7653`).
- [x] **TASK-64-CORE-5:** Xử lý sự kiện lệch thứ tự (Out-of-order tolerance) qua bộ đệm pending inbox buffer (commit `cff9acc`).
- [x] **TASK-64-CORE-6:** 100% Backend Unit tests và Consumer tests đạt trạng thái PASS.

---

### 🔹 Giai đoạn 1: Rà soát & Gia cố Backend Edge Cases
*Tài liệu hướng dẫn: [`docs/HG-64/GIAI_DOAN_1_BACKEND_EDGE_CASES.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_1_BACKEND_EDGE_CASES.md)*

- [x] **TASK-64-1.1:** Rà soát và bảo đảm phương thức `requestRework` phát sự kiện Outbox `order.status.changed` (`toStatus: in_progress`, kèm lý do sửa) và `order.rework_requested`.
- [x] **TASK-64-1.2:** Rà soát và bảo đảm phương thức `disputeOrder` phát sự kiện Outbox `order.disputed` và `order.status.changed` (`nextStatus: disputed`).
- [x] **TASK-64-1.3:** Rà soát và bảo đảm phương thức `resolveDispute` phát sự kiện Outbox cập nhật trạng thái sau khi Admin xử lý (`resume_previous_state`, `complete`, `cancel`).
- [x] **TASK-64-1.4:** Gia cố `SummaryService` của Tracking Service tính toán đúng phase `DISPUTED` và cập nhật milestone khi có rework.
- [x] **TASK-64-1.5:** Cập nhật whitelist trường an toàn (`safeKeys`) trong `sanitizeMetadata` bổ sung `reworkReason`, `disputeReason`, `resolution`.
- [x] **TASK-64-1.6:** Xác minh cấu hình API Gateway cho SSE (`chunked transfer`, `no-buffering`, chuyển tiếp đủ header bảo mật).

---

### 🔹 Giai đoạn 2: Xây dựng Module Client & Real-time SSE trên Mobile
*Tài liệu hướng dẫn: [`docs/HG-64/GIAI_DOAN_2_MOBILE_CLIENT_VA_SSE.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_2_MOBILE_CLIENT_VA_SSE.md)*

- [ ] **TASK-64-2.1:** Tạo tệp kiểu dữ liệu `mobile/src/features/tracking/types/tracking.types.ts` (`TrackingSummaryResponse`, `TrackingMilestone`, `TrackingEventItem`, ...).
- [ ] **TASK-64-2.2:** Xây dựng module `TrackingApi` (`getSummary`, `getTimeline`) tại `mobile/src/features/tracking/api/tracking.api.ts`.
- [ ] **TASK-64-2.3:** Phát triển `TrackingSseClient` tại `mobile/src/services/sse/tracking-sse-client.ts` (Auto-reconnect, Backoff lũy thừa, Last-Event-ID, Heartbeat timeout).
- [ ] **TASK-64-2.4:** Viết Custom Hook `useTrackingSummary` tích hợp React Query cache.
- [ ] **TASK-64-2.5:** Viết Custom Hook `useTrackingTimeline` hỗ trợ phân trang dòng sự kiện.
- [ ] **TASK-64-2.6:** Viết Custom Hook `useTrackingEvents` tự động invalidate cache và gọi callback khi có sự kiện thời gian thực.
- [ ] **TASK-64-2.7:** Viết Unit tests cho `TrackingSseClient` và các hook React Query mới tạo.

---

### 🔹 Giai đoạn 3: Đấu nối Giao diện Khách hàng (Customer Order Detail)
*Tài liệu hướng dẫn: [`docs/HG-64/GIAI_DOAN_3_DAU_NOI_GIAO_DIEN_KHACH_HANG.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_3_DAU_NOI_GIAO_DIEN_KHACH_HANG.md)*

- [ ] **TASK-64-3.1:** Xây dựng component `TrackingMilestoneItem` hiển thị từng cột mốc (icon, đường nối, màu trạng thái, nhãn thời gian).
- [ ] **TASK-64-3.2:** Xây dựng component `OrderTrackingTimeline` trực quan hóa 7 cột mốc chính và huy hiệu trạng thái Live SSE Indicator.
- [ ] **TASK-64-3.3:** Nhúng `useTrackingSummary` và `useTrackingEvents` vào [`customer-order-detail-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx).
- [ ] **TASK-64-3.4:** Thay thế khối stepper cũ bằng `OrderTrackingTimeline`.
- [ ] **TASK-64-3.5:** Cài đặt cơ chế phòng vệ **Graceful Fallback**: tự động rơi về hiển thị `statusHistory` tĩnh nếu API Tracking gặp lỗi.
- [ ] **TASK-64-3.6:** Viết Component test kiểm chứng giao diện Khách hàng tự nhảy mốc khi nhận sự kiện mock SSE.

---

### 🔹 Giai đoạn 4: Đấu nối Giao diện Thợ (Worker Job Detail)
*Tài liệu hướng dẫn: [`docs/HG-64/GIAI_DOAN_4_DAU_NOI_GIAO_DIEN_THO.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_4_DAU_NOI_GIAO_DIEN_THO.md)*

- [ ] **TASK-64-4.1:** Nhúng `OrderTrackingTimeline` vào [`worker-job-detail-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx).
- [ ] **TASK-64-4.2:** Viết hàm `handleWorkerRealtimeEvent` lắng nghe sự kiện từ `useTrackingEvents`.
- [ ] **TASK-64-4.3:** Xử lý bật Alert thông báo kèm lý do khi Khách hàng gửi yêu cầu làm lại (`rework`).
- [ ] **TASK-64-4.4:** Tự động mở lại nút cho phép thợ hoàn tất và chụp ảnh minh chứng lại khi có rework.
- [ ] **TASK-64-4.5:** Xử lý bật Alert chúc mừng khi Khách hàng bấm nghiệm thu (`completed`).
- [ ] **TASK-64-4.6:** Đảm bảo nguyên tắc bảo mật và Bid Shielding: Thợ chỉ xem được dòng thời gian đơn hàng mình phụ trách.

---

### 🔹 Giai đoạn 5: Kiểm thử Toàn trình (E2E), Tối ưu & Bàn giao
*Tài liệu hướng dẫn: [`docs/HG-64/GIAI_DOAN_5_KIEM_THU_TOAN_TRINH_VA_NGHIEM_THU.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/GIAI_DOAN_5_KIEM_THU_TOAN_TRINH_VA_NGHIEM_THU.md)*

- [ ] **TASK-64-5.1:** Thực hiện kịch bản Live E2E 8 bước trên 2 thiết bị thực tế (Khách hàng $\leftrightarrow$ Thợ).
- [ ] **TASK-64-5.2:** Kiểm thử rớt mạng (Airplane Mode 15s) trên thiết bị di động, xác minh cơ chế `Last-Event-ID` bù đắp mốc sự kiện.
- [ ] **TASK-64-5.3:** Kiểm thử tắt container Tracking Service trong Docker, xác minh Mobile App fallback êm dịu không bị trắng màn hình.
- [ ] **TASK-64-5.4:** Chạy toàn bộ test suite của Backend và Mobile (`pnpm test`), đảm bảo 100% test files pass.
- [ ] **TASK-64-5.5:** Cập nhật tài liệu [`backend/AGENTS.md`](file:///d:/SCHOOL/PBL6/backend/AGENTS.md) và [`docs/order-service/SMART_INTEROP_INTEGRATION_GUIDE.md`](file:///d:/SCHOOL/PBL6/docs/order-service/SMART_INTEROP_INTEGRATION_GUIDE.md).
- [ ] **TASK-64-5.6:** Hoàn tất báo cáo nghiệm thu và đóng ticket HG-64.

---

## 3. Nhật ký Công việc & Lịch sử Cập nhật (Work Log)

| Ngày | Kỹ sư / Agent | Task ID | Hành động thực hiện | Kết quả / Ghi chú |
| :---: | :---: | :---: | :--- | :--- |
| **04/11/2026** | Dev Team | PR #44 | Merge `feature/HG-47-tracking-service` vào `main`. | Đã tích hợp core backend qua RabbitMQ và Outbox. |
| **06/11/2026** | Antigravity AI | DOC-01 | Rà soát toàn diện mã nguồn backend & mobile; lập báo cáo hiện trạng. | Tạo file `BAO_CAO_KIEM_TRA_TICH_HOP_TRACKING_ORDER.md`. |
| **06/11/2026** | Antigravity AI | DOC-02 | Lập kế hoạch chi tiết 5 giai đoạn hoàn thiện 100% tích hợp. | Tạo file `KE_HOACH_CHI_TIET_HOAN_THANH_TICH_HOP.md`. |
| **06/11/2026** | Antigravity AI | DOC-03 | Soạn thảo trọn bộ 5 file hướng dẫn kỹ thuật cho từng giai đoạn. | Tạo các file `GIAI_DOAN_1_...` đến `GIAI_DOAN_5_...`. |
| **06/11/2026** | Antigravity AI | DOC-04 | Thiết lập Dashboard theo dõi tiến độ chi tiết ticket HG-64. | Tạo file `TRACKING_TIEN_DO_HG-64.md` (Hiện tại: 35%). |

---

## 4. Bảng Theo dõi Lỗi & Điểm nghẽn (Blockers & Issues Tracker)

| Issue ID | Giai đoạn | Mô tả vấn đề | Mức độ | Phương án xử lý | Trạng thái |
| :---: | :---: | :--- | :---: | :--- | :---: |
| *ISSUE-01* | P1 | Event `order.rework_requested` cần thống nhất payload với Tracking Service | Trung bình | Gửi `toStatus: 'in_progress'` kèm `reason` trong metadata | ⏳ Đang xử lý |
| *ISSUE-02* | P2 | Nền tảng React Native cần thư viện EventSource chuẩn tương thích cả iOS/Android | Thấp | Sử dụng `react-native-sse` đã có sẵn trong dự án | ✅ Đã có giải pháp |
| *ISSUE-03* | P3 | Khi mất mạng hoặc server lỗi, tránh crash màn hình khách | Cao | Triển khai Graceful Fallback về `statusHistory` | ✅ Đã thiết kế xong |

---

## 5. Tiêu chuẩn Nghiệm thu Đóng Ticket (Final Definition of Done)

Trước khi chuyển trạng thái HG-64 sang **COMPLETED (100%)**, cần tick đủ tất cả các điều kiện sau:
- [ ] Toàn bộ 5 Giai đoạn trên đều được đánh dấu hoàn thành 100%.
- [ ] Không còn blocker hoặc issue mở ở mức độ *Cao* hoặc *Nghiêm trọng*.
- [ ] Khách hàng và Thợ trải nghiệm được dòng thời gian cập nhật tức thời qua SSE, không cần pull-to-refresh thủ công.
- [ ] Code được format chuẩn Oxlint/Prettier, không vi phạm bất kỳ rule nào của dự án.
- [ ] Pull Request được review và phê duyệt bởi Tech Lead / Repository Maintainer.
