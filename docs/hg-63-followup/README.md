# HG-63 Follow-up: Danh sách Task Sửa lỗi & Hoàn thiện

> 📊 **Báo cáo tổng hợp nghiệm thu:** [BÁO CÁO TỔNG HỢP HG-63 FOLLOW-UP](./BAO_CAO_TONG_HOP_HG_63_FOLLOWUP.md)  
> 🧪 **Hướng dẫn kiểm thử thực tế trên Mobile:** [HƯỚNG DẪN KIỂM THỬ MOBILE](./HUONG-DAN-KIEM-THU-MOBILE.md)  

Thư mục này quản lý toàn bộ các task sửa lỗi và hoàn thiện tiếp theo của nhánh `bugfix/HG-63-ui_mobile_app-followup` sau khi đã merge PR #56 vào `main`.

---

## 1. Thông tin nhánh & Ngữ cảnh
- **Branch:** `bugfix/HG-63-ui_mobile_app-followup`
- **Base:** `main` (commit sau khi merge PR #56)
- **PR gốc:** [PR #56](https://github.com/duyaivy/HANDY_GO/pull/56) (`bugfix/HG-63-ui_mobile_app`)
- **Tài liệu gốc:** [`docs/ui-mobile-app/`](../ui-mobile-app/)

---

## 2. Danh mục chi tiết 9 Task cần xử lý

| Mã Task | Tên công việc / Lỗi cần xử lý | File tài liệu chi tiết | Nhóm file code chính | Trạng thái |
|:---:|:---|:---:|:---|:---:|
| **TASK-01** | **Trang hoạt động: Xóa tab Đặt lại, Thêm tab Đang khiếu nại**<br>Loại bỏ tab `Reorder`, thêm tab `Disputed` (`Đang khiếu nại`), cập nhật bộ lọc đơn và UI card. | [TASK-01](./TASK-01-trang-hoat-dong-xoa-dat-lai-them-khieu-nai.md) | `mobile/src/features/orders/customer/screens/customer-orders-screen.tsx`<br>`mobile/src/features/orders/hooks/use-customer-orders.ts` | ✅ Hoàn thành |
| **TASK-02** | **Bản đồ Radar: Căn đúng tâm vị trí khách hàng ngay từ đầu**<br>Khắc phục lỗi bản đồ mở ra thấy toàn bộ Việt Nam; camera tự động `flyTo` vị trí khách hàng với mức zoom chuẩn ngay khi map sẵn sàng. | [TASK-02](./TASK-02-ban-do-radar-dinh-vi-ngay-tu-dau.md) | `mobile/src/app/customer/booking/radar.tsx`<br>`mobile/src/components/map/handy-map.tsx` | ✅ Hoàn thành |
| **TASK-03** | **Trang hồ sơ: Bỏ hẳn màu khi nhấn/giữ các tiện ích**<br>Xóa bỏ hoàn toàn màu nền khi active/pressed, giữ nguyên nền tự nhiên của thẻ khi người dùng chạm giữ. | [TASK-03](./TASK-03-trang-ho-so-mau-hover-pressed-tien-ich.md) | `mobile/src/features/profile/customer/screens/customer-profile-screen.tsx`<br>`mobile/src/features/profile/customer/screens/customer-settings-screen.tsx` | ✅ Hoàn thành |
| **TASK-04** | **Trang trạng thái đơn hàng: Đổi Header, Dữ liệu thợ thật, Dọn ảnh rỗng & Đồng bộ tên DV Radar**<br>Đổi header "Báo giá thợ" -> "Chi tiết đơn hàng", hiển thị thợ thật từ `order.workerUserId`, lọc sạch các khung ảnh rỗng; đồng bộ tên dịch vụ thật khi xem Radar (tránh fallback "Dịch vụ tiện ích"). | [TASK-04](./TASK-04-trang-thai-don-hang-header-mock-tho-anh-fake.md) | `mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx`<br>`mobile/src/app/customer/booking/radar.tsx` | ✅ Hoàn thành |
| **TASK-05** | **Bidding: Thêm âm thanh "ting ting" khi có thợ báo giá mới**<br>Phát chuông thông báo âm thanh tức thời khi thợ gửi báo giá mới trong lúc khách hàng đang xem màn hình Radar. *(Hiện tại tạm chưa làm)* | [TASK-05](./TASK-05-am-thanh-thong-bao-khi-co-bid-moi.md) | `mobile/src/app/customer/booking/radar.tsx` | ⏸️ Tạm chưa làm |
| **TASK-06** | **Màn hình đặt thợ: Sửa lỗi tự động đổi tên đơn hàng và ghi đè mô tả**<br>Bảo toàn tên dịch vụ đã chọn (không để bị fallback về "Dịch vụ tiện ích"), không xóa mô tả tự gõ khi bấm chip gợi ý. | [TASK-06](./TASK-06-man-hinh-dat-tho-tu-dong-doi-ten-va-mo-ta.md) | `mobile/src/features/orders/customer/screens/customer-booking-screen.tsx`<br>`mobile/src/features/orders/stores/use-booking-draft-store.ts` | ✅ Hoàn thành |
| **TASK-07** | **Radar: Sắp xếp thợ báo giá ưu tiên theo giá & Hiển thị số liệu so sánh**<br>Sắp xếp danh sách báo giá theo giá tăng dần (`sort by amount`), hiển thị đầy đủ thông số (giá, sao, đơn, khoảng cách) và huy hiệu "Giá tốt nhất". | [TASK-07](./TASK-07-sap-xep-bao-gia-theo-gia-va-so-lieu-so-sanh.md) | `mobile/src/app/customer/booking/radar.tsx` | ✅ Hoàn thành |
| **TASK-08** | **Trang chi tiết đơn hàng: Thiết kế lại toàn diện giao diện & trải nghiệm**<br>Bổ sung Hero Status Banner & Stepper tiến trình, nâng cấp Thẻ thợ (gọi điện/nhắn tin), bảng kê chi phí, xem ảnh nghiệm thu phóng to, Sticky Bottom Action Bar. | [TASK-08](./TASK-08-thiet-ke-lai-trang-chi-tiet-don-hang.md) | `mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx`<br>`mobile/src/features/orders/components/` | ✅ Hoàn thành |
| **TASK-09** | **Radar: Xử lý thợ báo giá lại (Re-bid) khi đang có đề xuất chờ**<br>Mở khóa nút "Nhận giá mới" khi thợ giảm giá (kích hoạt `supersedesProposalId`) và bổ sung nút hủy đề xuất cũ thay vì bị kẹt "Đang chờ thợ". *(Hiện tại tạm chưa làm)* | [TASK-09](./TASK-09-xu-ly-tho-bao-gia-lai-re-bid.md) | `mobile/src/app/customer/booking/radar.tsx`<br>`mobile/src/features/orders/hooks/use-pending-proposals.ts` | ⏸️ Tạm chưa làm |

---

## 3. Lộ trình thực hiện khuyến nghị
```
[Giai đoạn 1: UI Cài đặt & Danh sách Đơn]
  ├── TASK-03: Bỏ hẳn màu nhấn giữ trang hồ sơ (Độc lập, rủi ro thấp)
  └── TASK-01: Cập nhật tab Hoạt động (Xóa Đặt lại, Thêm Đang khiếu nại)
         │
         ▼
[Giai đoạn 2: Luồng Đặt thợ & Khởi tạo Đơn]
  └── TASK-06: Bảo toàn tên dịch vụ và mô tả khi đặt thợ
         │
         ▼
[Giai đoạn 3: Trải nghiệm Radar & Báo giá]
  ├── TASK-02: Bản đồ Radar định vị đúng ngay từ đầu
  └── TASK-07: Sắp xếp thợ báo giá ưu tiên theo giá & số liệu so sánh trực quan
         │
         ▼
[Giai đoạn 4: Chi tiết Đơn hàng & Nghiệm thu]
  ├── TASK-04: Đổi Header "Chi tiết đơn hàng", thợ thật và lọc sạch ảnh rỗng
  └── TASK-08: Thiết kế lại toàn diện Trang chi tiết đơn hàng (Hero Banner, Stepper, Sticky Bar)
         │
         ▼
[Giai đoạn 5: Nâng cao / Tùy chọn (Thực hiện sau)]
  ├── TASK-05: Âm thanh ting ting khi có báo giá mới
  └── TASK-09: Xử lý thợ báo giá lại (Re-bid) khi có đề xuất đang chờ
```

---

## 4. Hướng dẫn kiểm thử & Nghiệm thu
Xem tài liệu hướng dẫn chi tiết từng bước kiểm tra thực tế trên ứng dụng Mobile:
👉 **[Hướng Dẫn Kiểm Thử & Nghiệm Thu Mobile](./HUONG-DAN-KIEM-THU-MOBILE.md)**
