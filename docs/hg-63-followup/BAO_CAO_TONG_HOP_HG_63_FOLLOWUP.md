# Báo Cáo Tổng Hợp Kết Quả Thực Hiện Nhánh HG-63 Follow-up

> **Nhánh phát triển:** `bugfix/HG-63-ui_mobile_app-followup`  
> **Thời điểm cập nhật:** 05/11/2026  
> **Người thực hiện:** Antigravity Pairing Assistant  
> **Trạng thái nhánh:** ✅ Sẵn sàng nghiệm thu & mở PR review  

---

## 1. Tổng Quan Kết Quả Thực Hiện

Trong đợt xử lý follow-up cho UI Mobile App (sau khi merge PR #56 vào `main`), toàn bộ các yêu cầu cốt lõi đã được hoàn thành, kiểm thử tự động đạt **65/65 test suites (493/493 tests PASS)**, linting và type-checking đạt 0 lỗi.

### Bảng Trạng Thái Chi Tiết 9 Task

| Mã Task | Tên công việc & Mục tiêu xử lý | Trạng thái | Commit chính | Ghi chú & Kết quả nghiệm thu |
|:---:|:---|:---:|:---:|:---|
| **TASK-01** | **Trang hoạt động: Xóa tab Đặt lại, Thêm tab Đang khiếu nại** | ✅ Hoàn thành | `4688a22` | Gỡ bỏ tab `Reorder`, thêm tab `Disputed`, lọc đúng các đơn có tranh chấp. |
| **TASK-02** | **Bản đồ Radar: Căn tâm vị trí khách hàng ngay từ đầu** | ✅ Hoàn thành | `84d591e`<br>`e29f01c` | Khắc phục lỗi góc nhìn toàn quốc, cố định camera zoom 14.5, chống race condition ở cold start. |
| **TASK-03** | **Trang hồ sơ: Bỏ hẳn màu khi nhấn/giữ các tiện ích** | ✅ Hoàn thành | `cab1118` | Giữ nguyên nền trắng sáng tự nhiên khi long press / touch active, bỏ nền xám. |
| **TASK-04** | **Trang trạng thái đơn: Sửa Header, Thợ thật, Dọn ảnh rỗng & Đồng bộ tên DV Radar** | ✅ Hoàn thành | `8359280`<br>`4bafb94`<br>`6e633fa`<br>`41c48fc` | Đổi Header "Chi tiết đơn hàng", kết nối thợ thật, mở rộng nhận diện tên dịch vụ đa tầng cho toàn bộ dịch vụ. |
| **TASK-05** | **Bidding: Thêm âm thanh "ting ting" khi có thợ báo giá mới** | ⏸️ Tạm chưa làm | - | Hoãn lại theo yêu cầu của khách hàng. |
| **TASK-06** | **Màn hình đặt thợ: Sửa lỗi tự động đổi tên & ghi đè mô tả** | ✅ Hoàn thành | `162f266` | Giữ nguyên tên dịch vụ đã chọn, chip gợi ý chỉ nối thêm text vào mô tả tự gõ. |
| **TASK-07** | **Radar: Sắp xếp báo giá ưu tiên theo giá & Hiển thị số liệu so sánh** | ✅ Hoàn thành | `a51f15c` | Tự động sắp xếp tăng dần theo giá, gắn badge "Giá tốt nhất", hiển thị 4 chỉ số (giá, sao, đơn, khoảng cách). |
| **TASK-08** | **Trang chi tiết đơn hàng: Thiết kế lại toàn diện giao diện & trải nghiệm** | ✅ Hoàn thành | `5727675`<br>`d9cdcbd` | Hero Stepper 5 bước, Thẻ thợ gọi điện/nhắn tin, Lightbox phóng to ảnh, Sticky Action Bar cố định đáy. Sửa dứt điểm vòng lặp icon refresh và lỗi tràn chữ khiếu nại. |
| **TASK-09** | **Radar: Xử lý thợ báo giá lại (Re-bid) khi có đề xuất đang chờ** | ⏸️ Tạm chưa làm | - | Đã soạn thảo đặc tả kỹ thuật chi tiết; tạm chưa làm theo yêu cầu. |

---

## 2. Chi Tiết Các Cải Tiến & Bản Vá Đột Phá

### 1. Khắc phục triệt để lỗi Radar Mapbox Zoom toàn quốc ở lần mở đầu tiên (TASK-02 & TASK-04)
- **Nguyên nhân gốc rễ:** Native Mapbox SDK phát ra sự kiện máy ảnh cold-start (`onCameraChanged`, `onMapIdle`) với mức zoom mặc định chưa khởi tạo (mức 3-4, toàn cảnh Việt Nam) và ghi đè lên biến lưu trữ zoom trước khi animation kịp chạy. Kết hợp với việc mở từ tab Hoạt động trước đó không truyền tọa độ nên map bị rơi vào camera mặc định.
- **Giải pháp:**
  - Gia cố [`handy-map.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/components/map/handy-map.tsx): Khóa không cho các sự kiện cold-start ghi đè `currentZoomRef` cho đến khi map hoàn tất layout và zoom $\ge 6$. Ép buộc mức zoom mục tiêu `14.5` trong `handleDidFinishLoadingMap`.
  - Cập nhật [`customer-orders-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/customer/screens/customer-orders-screen.tsx): Truyền trực tiếp `latitude`, `longitude` qua route params khi nhấn *"Xem Radar thợ →"*.
  - Trong [`radar.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/app/customer/booking/radar.tsx): Bổ sung bộ timer đa tầng (0ms, 150ms, 600ms) và gọi `flyTo` ngay khi API chi tiết yêu cầu phản hồi tọa độ.

### 2. Thuật toán phân giải & Bảo toàn tên dịch vụ Đa Tầng 100% (TASK-04 & TASK-06)
- **Nguyên nhân:** Khi khách thoát app hoặc mở từ danh sách đơn, `useBookingDraftStore` bị reset về `'Dịch vụ tiện ích'`, trong khi database của backend chỉ lưu `service_id` mà không lưu chuỗi chữ tên tiếng Việt.
- **Giải pháp:**
  - Xây dựng cơ chế phân giải 5 tầng tại [`services.ts`](file:///d:/SCHOOL/PBL6/mobile/src/constants/services.ts):
    1. Ưu tiên tên trực tiếp từ server (`serverRequest.service.name` / `serviceName`).
    2. Tham số điều hướng (`searchParams.serviceName`).
    3. Bảng tra cứu 40+ mã UUID Catalog chính thức của toàn bộ 7 nhóm ngành.
    4. Nhận diện từ khóa ID/slug cho mọi danh mục (Điện, Nước, Máy lạnh, Giặt, Tủ lạnh, Khóa, Cửa cuốn, Xe cộ, Mẹ và bé, Dọn dẹp, Sơn nhà,...).
    5. Nhận diện thông minh từ câu mô tả khách hàng nhập.
  - Tự động đồng bộ ngược lại vào store khi mở Radar.

### 3. Thiết kế lại toàn diện Trang chi tiết đơn hàng (TASK-08)
- Thay thế hoàn toàn giao diện cũ đơn điệu bằng thiết kế công thái học chuẩn di động:
  - **Hero Status Banner & Stepper:** Màu sắc phân biệt trực quan cho 5 trạng thái (`created`, `confirmed`, `in_progress`, `awaiting_customer_confirmation`, `completed`, `cancelled`, `disputed`).
  - **Thẻ thợ Pro:** Kết nối dữ liệu thợ thật từ `getBidDetail` (`fullName`, `avatarUrl`, rating, completed jobs), hỗ trợ 1-chạm gọi điện trực tiếp và chuyển sang khung chat.
  - **Lightbox Modal:** Bấm vào bất kỳ ảnh bằng chứng nào để phóng to, vuốt xem ảnh gốc chất lượng cao.
  - **Sticky Bottom Action Bar:** Thanh nút cố định ở đáy màn hình (Nghiệm thu, Yêu cầu sửa lại, Khiếu nại, Hủy đơn) không bao giờ bị cuộn che lấp.
  - **Sửa lỗi Live-Polling Refresh:** Tách riêng state `isManualRefreshing` giúp spinner không còn tự động bung ra màn hình mỗi 3 giây.

---

## 3. Danh Mục Các Commit Trên Nhánh

```text
e29f01c fix(mobile): fix initial cold-start whole-country map zoom on radar screen (TASK-04)
41c48fc fix(mobile): forward serviceName when navigating from summary to radar (TASK-04)
6e633fa feat(mobile): expand service resolution keywords across all service categories (TASK-04)
d9cdcbd fix(mobile): resolve real worker data, fix pull-to-refresh spinner loop and status banner overflow (TASK-08)
7aec7b6 docs(hg-63): mark TASK-08 complete and update QA testing guide
5727675 feat(mobile): redesign customer order detail screen with hero stepper, worker card, evidence gallery, and sticky action bar (TASK-08)
4bafb94 fix(mobile): preserve and resolve exact service name on radar screen (TASK-04)
8359280 feat(mobile): update order detail header, worker info, and clean empty evidence images (TASK-04)
a51f15c feat(mobile): sort worker bid candidates by amount ascending with best price badge (TASK-07)
162f266 fix(mobile): preserve selected service name and append issue chips to custom description (TASK-06)
cab1118 fix(mobile): remove pressed and active background styling on customer profile utilities (TASK-03)
84d591e fix(mobile): radar map flyTo customer coordinates with zoom level 14.5 on open (TASK-02)
4688a22 feat(mobile): remove reorder tab and add disputed tab with order filtering in customer orders (TASK-01)
```

---

## 4. Tài Liệu Hướng Dẫn Kiểm Thử (QA / Test Guide)

Toàn bộ các bước kiểm tra thực tế trên thiết bị di động, ảnh minh họa và kịch bản từng bước được trình bày chi tiết tại:
👉 **[HƯỚNG DẪN KIỂM THỬ & NGHIỆM THU MOBILE (HUONG-DAN-KIEM-THU-MOBILE.md)](./HUONG-DAN-KIEM-THU-MOBILE.md)**

Danh mục file tài liệu đặc tả từng task:
- [TASK-01: Trang hoạt động - Xóa Đặt lại, Thêm Khiếu nại](./TASK-01-trang-hoat-dong-xoa-dat-lai-them-khieu-nai.md)
- [TASK-02: Bản đồ Radar căn tâm vị trí khách](./TASK-02-ban-do-radar-dinh-vi-ngay-tu-dau.md)
- [TASK-03: Trang hồ sơ bỏ màu nền nhấn giữ tiện ích](./TASK-03-trang-ho-so-mau-hover-pressed-tien-ich.md)
- [TASK-04: Chi tiết đơn hàng & Đồng bộ tên DV Radar](./TASK-04-trang-thai-don-hang-header-mock-tho-anh-fake.md)
- [TASK-06: Màn hình đặt thợ giữ tên DV & nối mô tả](./TASK-06-man-hinh-dat-tho-tu-dong-doi-ten-va-mo-ta.md)
- [TASK-07: Sắp xếp báo giá ưu tiên theo giá & số liệu](./TASK-07-sap-xep-bao-gia-theo-gia-va-so-lieu-so-sanh.md)
- [TASK-08: Thiết kế lại toàn diện trang chi tiết đơn hàng](./TASK-08-thiet-ke-lai-trang-chi-tiet-don-hang.md)
- [TASK-09: Đặc tả luồng xử lý thợ báo giá lại (Re-bid)](./TASK-09-xu-ly-tho-bao-gia-lai-re-bid.md)
