# Hướng dẫn Kỹ thuật Giai đoạn 5: Kiểm thử Toàn trình (E2E), Tối ưu & Bàn giao

> **Mã công việc:** HG-64  
> **Giai đoạn:** 5/5  
> **Tên giai đoạn:** Kiểm thử Toàn trình (End-to-End), Kiểm thử Phục hồi sự cố (Resilience) & Nghiệm thu Bàn giao  
> **Thời lượng ước tính:** 1.0 ngày  
> **Trạng thái:** ✅ Đã hoàn thành  

---

## 1. Mục tiêu giai đoạn

1. Thực hiện đầy đủ các tầng kiểm thử: Kiểm thử đơn vị (Unit Tests), Kiểm thử thành phần giao diện (Component Tests), Kiểm thử tích hợp đa dịch vụ (Multi-service Integration Tests).
2. Kiểm chứng kịch bản thực tế 2 người dùng (Khách hàng $\leftrightarrow$ Thợ) trên 2 thiết bị di động thật/máy ảo qua kết nối mạng.
3. Kiểm tra khả năng chịu lỗi và tự phục hồi (*Fault-tolerance & Resilience*): mất mạng đột ngột, Tracking Service bảo trì tạm thời, sự kiện đến lộn xộn.
4. Hoàn thiện tài liệu nghiệm thu kỹ thuật và đóng ticket HG-64.

---

## 2. Kịch bản Kiểm thử Toàn trình (E2E Live Test Scenario)

Thực hiện kịch bản 8 bước với 2 thiết bị độc lập:
* **Thiết bị A (Máy Khách hàng):** Đăng nhập tài khoản Customer.
* **Thiết bị B (Máy Thợ):** Đăng nhập tài khoản Worker đã được KYC xác thực.

| Bước | Người thao tác | Hành động | Kết quả mong đợi trên Thiết bị A (Khách) | Kết quả mong đợi trên Thiết bị B (Thợ) |
| :---: | :---: | :--- | :--- | :--- |
| **1** | Khách (Máy A) | Tạo yêu cầu sửa chữa $\to$ Bấm "Xuất bản yêu cầu" | Cột mốc "Đã gửi yêu cầu" sáng xanh. Huy hiệu hiển thị `Trực tiếp 🟢`. | Nhận thông báo có việc mới trong khu vực. |
| **2** | Thợ (Máy B) | Báo giá dịch vụ | Thấy số lượng thợ báo giá cập nhật. | Trạng thái báo giá: "Đã gửi báo giá". |
| **3** | Khách (Máy A) | Chấp nhận báo giá $\to$ Tạo đề xuất | Trạng thái: "Đang chờ thợ xác nhận". | Nhận được đề xuất đặt việc từ Khách. |
| **4** | Thợ (Máy B) | Bấm "Chấp nhận đề xuất" | Màn hình Khách **tự động nhảy sang Đơn hàng mới** mà không cần vuốt. Cột mốc "Đã tạo đơn" sáng xanh. | Chuyển sang màn hình Chi tiết Công việc. Nút "Bắt đầu làm" sẵn sàng. |
| **5** | Thợ (Máy B) | Bấm "Bắt đầu làm việc" (`order.status.changed`: `confirmed` → `in_progress`) | Mốc **"Thợ đang làm việc" sáng xanh trong vòng < 1 giây** qua SSE. | Nút chuyển sang "Báo hoàn tất công việc". |
| **6** | Thợ (Máy B) | Chụp ảnh minh chứng $\to$ Báo xong việc (`order.status.changed`: `in_progress` → `awaiting_customer_confirmation`) | Màn hình hiện thông báo: "Thợ đã làm xong! Vui lòng nghiệm thu". | Màn hình hiển thị: "Đang chờ khách nghiệm thu". |
| **7** | Khách (Máy A) | Bấm "Yêu cầu làm lại" (`request-rework`) | Cột mốc quay lại màu xanh dương kèm lý do yêu cầu sửa. | **Máy B lập tức bật Alert thông báo lý do sửa**, nút hoàn tất được mở lại. |
| **8** | Khách (Máy A) | Thợ làm lại xong $\to$ Khách bấm "Nghiệm thu hoàn tất" (`order.completed`) | Cột mốc "Hoàn tất" sáng xanh. | **Máy B bật thông báo chúc mừng**, công việc hoàn thành 100%. |

---

## 3. Kiểm thử Khả năng Phục hồi & Phòng vệ (Resilience Testing)

### 3.1. Kịch bản Mất mạng đột ngột (Network Drop & Reconnect)
1. Trên Thiết bị A, bật Chế độ máy bay (Airplane Mode) trong vòng 15 giây khi đang xem màn hình tiến trình đơn hàng.
2. Thiết bị B thực hiện chuyển trạng thái (bấm "Bắt đầu làm việc").
3. Tắt Chế độ máy bay trên Thiết bị A:
   - **Xác minh:** Huy hiệu chuyển từ `Đang kết nối lại... 🟡` sang `Trực tiếp 🟢`.
   - Client tự động gửi header `Last-Event-ID` lên server.
   - Server bù đắp sự kiện bị lỡ và giao diện máy A tự động cập nhật mốc mới mà không cần thao tác thủ công.

### 3.2. Kịch bản Tracking Service ngừng hoạt động tạm thời (Graceful Fallback)
1. Tạm dừng container của Tracking Service trong Docker:
   ```bash
   docker stop handygo-tracking-service
   ```
2. Mở màn hình chi tiết đơn hàng trên Thiết bị A:
   - **Xác minh:** Ứng dụng **không bị crash hay màn hình trắng**.
   - Giao diện tự động chuyển sang hiển thị bảng lịch sử dự phòng `statusHistory` từ Order Service.

---

## 4. Lệnh kiểm thử tự động toàn diện (Automation Test Suite)

Chạy toàn bộ test suites của hệ thống trước khi mở Pull Request:

```bash
# ==========================================
# 1. KIỂM THỬ BACKEND (Tất cả Service liên quan)
# ==========================================
cd backend

# Chạy test Tracking Service
pnpm vitest run apps/tracking-service/

# Chạy test Order Service
pnpm vitest run apps/order-service/

# ==========================================
# 2. KIỂM THỬ MOBILE CLIENT
# ==========================================
cd ../mobile

# Chạy test SSE Client và Tracking API
pnpm test src/services/sse/__tests__/tracking-sse-client.test.ts
pnpm test src/features/orders/customer/__tests__/customer-order-detail-screen.test.tsx
pnpm test src/features/orders/worker/__tests__/worker-job-detail-screen.test.tsx

# Chạy test toàn trình Live E2E & Resilience Suite
pnpm test src/features/tracking/__tests__/tracking-e2e-resilience.test.tsx
```

---

## 5. Danh mục Bàn giao & Nghiệm thu (Sign-off Deliverables)

Khi hoàn tất cả 5 giai đoạn, thực hiện cập nhật các tài liệu kỹ thuật sau:

1. **Cập nhật [`backend/AGENTS.md`](file:///d:/SCHOOL/PBL6/backend/AGENTS.md):**
   - Đánh dấu hoàn tất việc tích hợp dòng thời gian SSE của Tracking Service với Order Service.
2. **Cập nhật [`docs/order-service/SMART_INTEROP_INTEGRATION_GUIDE.md`](file:///d:/SCHOOL/PBL6/docs/order-service/SMART_INTEROP_INTEGRATION_GUIDE.md):**
   - Đổi trạng thái mục `Tracking / Map Service` từ "Smart Interop Fallback" thành "Live Production SSE".
3. **Cập nhật [`docs/HG-64/README.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/README.md):**
   - Chuyển trạng thái Ticket HG-64 từ `In Progress` sang `✅ COMPLETED 100%`.
4. **Cập nhật [`docs/HG-64/TRACKING_TIEN_DO_HG-64.md`](file:///d:/SCHOOL/PBL6/docs/HG-64/TRACKING_TIEN_DO_HG-64.md):**
   - Đánh dấu 100% các tiêu chí Definition of Done và toàn bộ 5/5 giai đoạn.

---

## 6. Tiêu chuẩn hoàn thành Giai đoạn 5 (Sign-off Checklist)

- [x] Kịch bản E2E toàn trình 8 bước giữa Khách hàng và Thợ được tự động hóa và chạy PASS trong `tracking-e2e-resilience.test.tsx`.
- [x] Cơ chế bù đắp sự kiện `Last-Event-ID` và tự động kết nối lại khi rớt mạng đạt chuẩn.
- [x] Cơ chế Graceful Fallback hiển thị `statusHistory` tĩnh khi server Tracking ngừng hoạt động chạy ổn định, không lỗi trắng màn hình.
- [x] 100% test suites của Backend (`order-service`, `tracking-service`) và Mobile (`tracking`, `customer`, `worker`) đều PASS.
- [x] Toàn bộ tài liệu kỹ thuật và checklist nghiệm thu đã được hoàn tất và ký duyệt bàn giao.

---

## 7. Kết luận

Với việc hoàn thành Giai đoạn 5, tính năng tích hợp giữa **Order Service** và **Tracking Service** chính thức đạt tiêu chuẩn hoàn thiện 100%, sẵn sàng bàn giao cho người dùng cuối trên môi trường Staging và Production.
