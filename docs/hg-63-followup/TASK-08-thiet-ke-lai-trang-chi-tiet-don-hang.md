# TASK-08: Thiết kế lại toàn diện Trang Chi Tiết Đơn Hàng (Customer Order Detail Screen)

## 1. Mục tiêu & Hiện trạng

### Hiện trạng
- Màn hình **Chi tiết đơn hàng của Khách hàng** (`mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx`) hiện tại là bản giao diện sơ khai, các khối nội dung xếp rời rạc và chưa đạt chuẩn trải nghiệm người dùng (UX/UI) cho một ứng dụng dịch vụ cao cấp:
  1. **Trạng thái đơn hàng đơn điệu:** Chỉ có 1 dòng text nhỏ `Trạng thái: Thợ đã sẵn sàng / Đang thi công...`, khách hàng khó hình dung tiến trình thực hiện đơn hàng đang ở giai đoạn nào.
  2. **Thẻ thông tin thợ sơ sài:** Chỉ hiển thị tên thợ và nút `"Worker profile"` bằng tiếng Anh thô kệch; thiếu avatar, đánh giá sao, số điện thoại và đặc biệt **thiếu nút gọi điện / nhắn tin nhanh** cho thợ khi đơn đang chạy.
  3. **Địa chỉ & dịch vụ bị thu hẹp:** Địa chỉ bị cắt cụt (`numberOfLines={1}`), không hiển thị rõ ràng thông tin liên hệ và mô tả công việc.
  4. **Bảng kê chi phí chưa chuẩn hóa:** Chưa có khối chi tiết thanh toán chuyên nghiệp (giá thỏa thuận, phụ phí nếu có, tổng thanh toán, phương thức thanh toán).
  5. **Bằng chứng nghiệm thu (Evidence) còn hạn chế:** Chỉ cuộn ngang danh sách ảnh nhỏ, chưa hỗ trợ chạm để phóng to xem chi tiết ảnh trước khi bấm nghiệm thu.
  6. **Nút hành động nằm trôi nổi:** Các nút quan trọng (*Nghiệm thu hoàn tất*, *Yêu cầu sửa lại*, *Khiếu nại*, *Hủy đơn*) nằm rải rác giữa ScrollView, người dùng phải cuộn màn hình mới thấy thay vì có thanh nút cố định ở đáy (Sticky Bottom Action Bar).
  7. **Vẫn còn text placeholder thừa:** Ở cuối màn hình vẫn còn dòng chữ `"Chức năng đang được phát triển"` gây mất tính chuyên nghiệp.

### Mục tiêu thiết kế lại
- Tái cấu trúc và thiết kế mới giao diện trang chi tiết đơn hàng chuẩn mực, hiện đại, thân thiện và đáp ứng đầy đủ nghiệp vụ:
  - **Hero Status Banner kèm Tiến trình Stepper:** Trực quan hóa tiến độ đơn hàng (Đã tạo ➔ Thợ nhận việc ➔ Đang thi công ➔ Chờ nghiệm thu ➔ Hoàn tất).
  - **Thẻ Thợ Phụ Trách Cao Cấp (Worker Card Pro):** Avatar, tên thợ, đánh giá ⭐, số đơn hoàn thành, nút gọi điện nhanh 📞 và nhắn tin 💬 trực tiếp.
  - **Khối Thông Tin Dịch Vụ & Địa Điểm Thi Công:** Trình bày rõ ràng tên dịch vụ, icon ghim vị trí 📍, địa chỉ đầy đủ, thời gian tạo và ghi chú chi tiết công việc.
  - **Bảng Kê Chi Phí & Thanh Toán (Invoice Breakdown):** Hiển thị rõ giá thỏa thuận, tổng tiền nổi bật (VND), phương thức thanh toán.
  - **Khu Vực Bằng Chứng Nghiệm Thu (Evidence Viewer):** Lưới ảnh thợ nộp bằng chứng hoàn thành, chạm vào để mở modal xem ảnh phóng to.
  - **Sticky Bottom Action Bar:** Thanh nút hành động ghim cố định ở đáy màn hình theo ngữ cảnh trạng thái đơn hàng (Nghiệm thu / Sửa lại / Khiếu nại / Hủy đơn / Đánh giá).
  - **Dọn dẹp code rác & Bảo toàn logic:** Bỏ dòng text placeholder, giữ nguyên 100% logic API mutations (`confirmCompletion`, `requestRework`, `openDispute`, `cancelOrder`) và các `testID` để đảm bảo hệ thống automated tests tiếp tục pass 100%.

---

## 2. Các file ảnh hưởng chính

- `mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx`: Tái cấu trúc toàn bộ màn hình chính.
- `mobile/src/features/orders/components/`:
  - `order-status-stepper.tsx` *(mới hoặc tích hợp)*: Hiển thị thanh tiến trình các bước thực hiện đơn hàng.
  - `order-worker-card.tsx` *(mới hoặc tích hợp)*: Thẻ thợ phụ trách kèm nút gọi điện / nhắn tin / xem hồ sơ.
  - `order-payment-card.tsx` *(mới hoặc tích hợp)*: Thẻ bảng kê chi phí và phương thức thanh toán.
  - `order-evidence-gallery.tsx` *(mới hoặc tích hợp)*: Thư viện hiển thị ảnh bằng chứng kèm chức năng phóng to ảnh.
- `mobile/src/features/orders/customer/__tests__/customer-order-detail-screen.test.tsx`: Bổ sung và cập nhật test suites để kiểm chứng giao diện và hành vi mới.

---

## 3. Chi tiết thiết kế mới theo từng phân vùng (Wireframe & Specification)

```
┌──────────────────────────────────────────────┐
│  [<]  Chi tiết đơn hàng      #ORD-123456     │  <- AppBar
├──────────────────────────────────────────────┤
│  HERO STATUS BANNER                          │
│  [Icon] Thợ đã hoàn thành công việc          │  <- Banner trạng thái & hướng dẫn
│  Vui lòng kiểm tra hiện trường & nghiệm thu   │
│                                              │
│  (●)───────(●)───────(●)───────[●]───────(○)  │  <- Stepper tiến trình (5 bước)
│ Đã đặt   Nhận việc  Thi công  Nghiệm thu Xong│
├──────────────────────────────────────────────┤
│  THẺ THỢ PHỤ TRÁCH                           │
│  [Avatar]  Nguyễn Văn Thợ           [⭐ 4.9] │
│            Chuyên điện nước • 120 đơn        │
│                                              │
│  [📞 Gọi điện]   [💬 Nhắn tin]   [Xem hồ sơ] │  <- Action buttons tương tác thợ
├──────────────────────────────────────────────┤
│  THÔNG TIN CÔNG VIỆC                         │
│  🛠️ Sửa chữa rò rỉ đường ống nước            │
│  📍 123 Nguyễn Lương Bằng, Hòa Khánh, ĐN    │
│  🕒 14:30 - 05/11/2026                       │
│  📝 Ghi chú: Ống nước bồn rửa chén bị rò rỉ  │
├──────────────────────────────────────────────┤
│  BẰNG CHỨNG THI CÔNG (EVIDENCE)              │
│  📷 Thợ đã chụp 2 ảnh hiện trường:           │
│  [ Ảnh 1 ]  [ Ảnh 2 ]  (Chạm để phóng to)   │
├──────────────────────────────────────────────┤
│  CHI PHÍ & THANH TOÁN                        │
│  Giá dịch vụ thỏa thuận:          250.000 đ  │
│  Phương thức thanh toán:           Tiền mặt  │
│  ──────────────────────────────────────────  │
│  TỔNG THANH TOÁN:                 250.000 đ  │
├──────────────────────────────────────────────┤
│  LỊCH SỬ TRẠNG THÁI (TIMELINE)               │
│  • 15:45 - Thợ nộp bằng chứng nghiệm thu     │
│  • 14:40 - Thợ bắt đầu thi công              │
│  • 14:32 - Thợ đã nhận đơn                   │
│  • 14:30 - Khách hàng tạo đơn                │
├──────────────────────────────────────────────┤
│  (Khoảng trống cuộn nội dung không bị che)   │
├──────────────────────────────────────────────┤
│  STICKY BOTTOM ACTION BAR (Cố định ở đáy)    │
│  [ Yêu cầu sửa lại ]   [ 🎉 Nghiệm thu ngay ]│  <- Các nút theo trạng thái đơn
└──────────────────────────────────────────────┘
```

### Chi tiết các khối nghiệp vụ:

#### 1. Hero Status Banner & Stepper:
- Màu sắc và thông điệp tương ứng từng trạng thái:
  - `created`: Màu xanh dương nhạt (Info) — *"Đang điều phối thợ quanh bạn..."*
  - `confirmed`: Màu vàng hổ phách (Amber) — *"Thợ đã nhận đơn và chuẩn bị đến nơi."*
  - `in_progress`: Màu cam (Orange) — *"Thợ đang tiến hành thi công tại hiện trường."*
  - `awaiting_customer_confirmation`: Màu xanh lá cây (Emerald) — *"Công việc đã hoàn thành. Hãy kiểm tra & nghiệm thu."*
  - `completed`: Màu xanh ngọc (Teal) — *"Đơn hàng hoàn tất. Cảm ơn bạn đã sử dụng dịch vụ!"*
  - `cancelled`: Màu xám/đỏ nhạt (Rose) — *"Đơn hàng đã được hủy."* kèm lý do và thời gian hủy.
  - `disputed`: Màu đỏ cam (Warning) — *"Đơn hàng đang trong quá trình khiếu nại."*
- Stepper 5 bước: Đã tạo ➔ Nhận việc ➔ Thi công ➔ Nghiệm thu ➔ Hoàn tất.

#### 2. Thẻ thợ phụ trách (Worker Card Pro):
- Hiển thị đầy đủ Avatar, Tên thợ, Đánh giá sao ⭐, Số đơn hoàn thành.
- **Nút tương tác tức thì:**
  - 📞 **Gọi điện:** Mở `Linking.openURL('tel:...')` với số điện thoại thật của thợ.
  - 💬 **Nhắn tin:** Mở kênh chat trực tiếp với thợ trong ứng dụng (`RouteNames.CHAT` hoặc tương đương).
  - 👤 **Xem hồ sơ:** Điều hướng đến trang thông tin chi tiết của thợ bằng tiếng Việt rõ ràng.

#### 3. Khối Chi Phí & Thanh Toán (Invoice Breakdown):
- Hiển thị bảng kê chi tiết có đường nét phân tách mềm mại (`border-t border-dashed`).
- Tổng tiền in to, đậm với màu thương hiệu nổi bật (`text-primary text-base font-extrabold`).
- Trạng thái thanh toán minh bạch (Đã thanh toán / Thanh toán khi hoàn tất).

#### 4. Thư Viện Ảnh Nghiệm Thu (Evidence Gallery with Modal Zoom):
- Hiển thị thumbnail ảnh sắc nét với bo góc `rounded-xl`.
- Khi người dùng chạm vào ảnh, mở modal phóng to toàn màn hình (Fullscreen Lightbox) để xem kỹ chi tiết trước khi xác nhận nghiệm thu.

#### 5. Sticky Bottom Action Bar (Cố định ở đáy màn hình):
- Nằm cố định ở đáy, có đổ bóng nhẹ (`shadow-lg`) và nền trắng để tách biệt với nội dung cuộn.
- Phù hợp với vùng ngón tay cái dễ bấm nhất trên thiết bị di động:
  - Trạng thái `awaiting_customer_confirmation`:
    - Nút chính (Full width hoặc 60%): `🎉 Nghiệm Thu & Thanh Toán` (Màu xanh Emerald, nổi bật nhất).
    - Nút phụ (40%): `Yêu Cầu Sửa Lại` (Màu viền cam).
  - Trạng thái `in_progress`:
    - Nút `Khiếu Nại / Cần Hỗ Trợ` (Màu đỏ viền) + Nút `Liên Hệ Thợ`.
  - Trạng thái `created` / `confirmed`:
    - Nút `Hủy Đơn Hàng` (Có hộp thoại xác nhận hủy an toàn).
  - Trạng thái `completed`:
    - Nút `⭐ Đánh Giá Thợ` + Nút `Đặt Lại Dịch Vụ`.

---

## 4. Kịch bản kiểm thử (Test Cases)

- [x] **Kiểm thử hiển thị Hero Banner & Stepper:**
  - Chuyển đổi qua các trạng thái (`created`, `confirmed`, `in_progress`, `awaiting_customer_confirmation`, `completed`, `cancelled`, `disputed`), banner và stepper hiển thị đúng màu và đúng bước.
- [x] **Kiểm thử Thẻ thợ:**
  - Hiển thị đầy đủ tên thật, avatar, rating của thợ.
  - Bấm nút Gọi điện mở trình quay số thiết bị.
  - Bấm nút Xem hồ sơ mở đúng trang hồ sơ thợ.
- [x] **Kiểm thử Bằng chứng nghiệm thu & Phóng to ảnh:**
  - Đơn có ảnh: Thumbnail hiển thị đẹp, bấm vào ảnh mở modal xem phóng to.
  - Đơn không có ảnh: Không bị lỗi layout hoặc hiển thị khung rỗng.
- [x] **Kiểm thử Sticky Bottom Action Bar:**
  - Cuộn màn hình lên xuống, thanh nút hành động luôn cố định ở đáy và không che khuất nội dung cuối trang.
  - Ở trạng thái chờ nghiệm thu, bấm nút "Nghiệm Thu" gọi đúng mutation `confirmCompletion`.
  - Bấm "Yêu Cầu Sửa Lại" gọi đúng mutation `requestRework`.
  - Bấm "Khiếu Nại" mở modal/gọi đúng `openDispute`.
- [x] **Kiểm thử hồi quy (Regression Test):**
  - Tất cả các `testID` cũ tiếp tục tồn tại và toàn bộ bộ unit test `pnpm test` chạy pass 100%.

