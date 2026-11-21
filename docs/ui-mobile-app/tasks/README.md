# HG-63: Kế hoạch triển khai chi tiết từng Task

Tài liệu này phân tách 8 yêu cầu cải tiến giao diện và sửa lỗi từ [HG-63-KE-HOACH-CAI-TIEN.md](../HG-63-KE-HOACH-CAI-TIEN.md) thành **8 task độc lập**. Mỗi file chứa đầy đủ phạm vi, bằng chứng mã nguồn, các bước thực hiện kỹ thuật, ca kiểm thử và checklist nghiệm thu để có thể tiến hành và kiểm thử độc lập từng task.

---

## 1. Lộ trình thực hiện khuyến nghị (4 Giai đoạn)

Dựa trên mức độ ưu tiên kỹ thuật và tính phụ thuộc giữa các component, thứ tự thực hiện đề xuất như sau:

```
[Giai đoạn 1: Hủy & Tiếng Việt]
  ├── TASK-04: Sửa lỗi hủy yêu cầu/đơn (Không mở lại bid)
  └── TASK-05: Thống nhất tiếng Việt 100% trong luồng hủy
         │
         ▼
[Giai đoạn 2: Bố cục hệ thống & Bản đồ]
  ├── TASK-03: Xử lý Safe Area nội dung Guest
  └── TASK-06: Khóa tâm bản đồ radar (cho phép zoom)
         │
         ▼
[Giai đoạn 3: Tải ảnh & Điều hướng App]
  ├── TASK-01: Tiến độ tải ảnh đặt việc trên thumbnail
  └── TASK-07: Loading mượt mà khi chuyển đổi app Khách/Thợ
         │
         ▼
[Giai đoạn 4: Hoàn thiện UI & Tương tác]
  ├── TASK-02: Thiết kế màn hình Welcome chọn app ban đầu
  └── TASK-08: Chuẩn hóa màu hover/pressed cài đặt cá nhân
```

---

## 2. Danh mục chi tiết các Task

| Mã Task | Tên Task & Mục tiêu | Nhóm file ảnh hưởng chính | File chi tiết |
|---|---|---|---|
| **TASK-01** | **Tiến độ tải ảnh đặt việc ngay trên ảnh**<br>Quản lý upload tuần tự, hiển thị % hoặc spinner trên thumbnail, chặn tiếp tục khi đang tải, hủy request khi unmount. | `mobile/src/features/orders/api/orders.api.ts`<br>`mobile/src/features/orders/customer/screens/customer-booking-screen.tsx` | [TASK-01-tien-do-upload-anh.md](./TASK-01-tien-do-upload-anh.md) |
| **TASK-02** | **Sửa giao diện chọn ứng dụng ban đầu (Welcome)**<br>Bố cục 1 cột cuộn được, 2 thẻ Khách/Thợ rõ ràng, nút tiếp tục chuẩn touch target 44pt, hỗ trợ chữ lớn. | `mobile/src/features/auth/screens/welcome-screen.tsx`<br>`mobile/src/app/welcome.tsx` | [TASK-02-man-hinh-welcome-chon-app.md](./TASK-02-man-hinh-welcome-chon-app.md) |
| **TASK-03** | **Xử lý Safe Area nội dung Guest**<br>Sửa `CustomerGuestOverview` tránh bị che bởi thanh điều hướng và status bar; đưa footer về cùng cấp với ScrollView. | `mobile/src/features/home/customer/components/customer-guest-overview.tsx`<br>`mobile/src/features/home/worker/components/worker-guest-overview.tsx` | [TASK-03-safe-area-guest.md](./TASK-03-safe-area-guest.md) |
| **TASK-04** | **Sửa lỗi hủy yêu cầu/đơn - Không mở lại bid**<br>Loại bỏ ID giả, xử lý lỗi API thật, xử lý timeout/conflict, đồng bộ cache/refetch, kiểm tra transaction/outbox đóng bid. | `mobile/src/app/customer/booking/radar.tsx`<br>`mobile/src/features/orders/customer/screens/customer-order-cancel-dialog.tsx` | [TASK-04-huy-yeu-cau-va-dong-bid.md](./TASK-04-huy-yeu-cau-va-dong-bid.md) |
| **TASK-05** | **Thống nhất tiếng Việt trong toàn bộ luồng hủy**<br>Xóa sạch nhãn tiếng Anh (`Cancel order`, placeholder), ánh xạ mã lỗi backend sang thông báo tiếng Việt thân thiện. | `mobile/src/app/customer/booking/radar.tsx`<br>`mobile/src/features/orders/customer/screens/customer-order-cancel-dialog.tsx` | [TASK-05-thong-nhat-tieng-viet-luong-huy.md](./TASK-05-thong-nhat-tieng-viet-luong-huy.md) |
| **TASK-06** | **Khóa vị trí bản đồ radar, vẫn cho zoom**<br>Mở rộng gesture props trong `HandyMap`, tắt pan/rotate/pitch trong radar, khóa tâm theo vị trí thật, bỏ nhãn km cố định. | `mobile/src/components/map/handy-map.tsx`<br>`mobile/src/app/customer/booking/radar.tsx` | [TASK-06-khoa-tam-ban-do-radar.md](./TASK-06-khoa-tam-ban-do-radar.md) |
| **TASK-07** | **Loading mượt khi chuyển giữa app khách và thợ**<br>Gom điều hướng về một nơi (xóa điều hướng kép), hiển thị root overlay loading, cơ chế watchdog 10s chống treo. | `mobile/src/features/profile/components/app-switch-card.tsx`<br>`mobile/src/app/_layout.tsx` | [TASK-07-loading-chuyen-app.md](./TASK-07-loading-chuyen-app.md) |
| **TASK-08** | **Đổi màu hover/pressed trang cài đặt cá nhân**<br>Thay màu xám mặc định bằng amber nhạt (light) và amber trầm (dark); giữ riêng màu action cảnh báo và focus. | `mobile/src/features/profile/customer/screens/customer-settings-screen.tsx` | [TASK-08-mau-tuong-tac-cai-dat.md](./TASK-08-mau-tuong-tac-cai-dat.md) |

---

## 3. Các lệnh kiểm thử dùng chung

Trong quá trình làm từng task, sử dụng các lệnh kiểm thử sau (chạy từ thư mục `mobile`):

```bash
# Di chuyển vào thư mục mobile
cd mobile

# Chạy unit/integration test của task liên quan
pnpm test <ten-file-test>

# Kiểm tra TypeScript typecheck
pnpm typecheck

# Kiểm tra code style & linting
pnpm lint
```

Sau khi hoàn tất một task, tích chọn checklist trong từng file tương ứng trước khi chuyển sang task tiếp theo.

