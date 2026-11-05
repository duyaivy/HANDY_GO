# Hướng Dẫn Kiểm Thử & Nghiệm Thu Mobile (HG-63 Follow-up)

Tài liệu này hướng dẫn chi tiết từng bước (Step-by-Step) để đội ngũ Tester, QA hoặc Developer có thể kiểm tra trực tiếp trên thiết bị di động (Android / iOS / Simulator) toàn bộ các tính năng và bản sửa lỗi thuộc nhánh `bugfix/HG-63-ui_mobile_app-followup`.

---

## 🛠️ Chuẩn Bị Môi Trường Kiểm Thử

1. **Khởi động ứng dụng Mobile:**
   ```bash
   cd mobile
   pnpm install
   pnpm start
   # Nhấn 'a' để mở Android Emulator hoặc 'i' để mở iOS Simulator
   ```
2. **Tài khoản kiểm thử:**
   - Sử dụng tài khoản vai trò **Khách hàng (Customer)** đã có sẵn trong hệ thống (hoặc đăng ký mới).
   - Đảm bảo thiết bị đã bật quyền truy cập vị trí (GPS) để kiểm tra tính năng bản đồ và radar.

---

## 📱 Chi Tiết Hướng Dẫn Kiểm Thử Từng Task

---

### 1. TASK-01: Trang Hoạt Động (Xóa tab Đặt lại, Thêm tab Đang khiếu nại)

* **Commit liên quan:** `4688a22`
* **Màn hình kiểm tra:** Màn hình **Hoạt động** (Tab thứ 2 trên thanh điều hướng dưới: `Khách hàng` ➔ `Hoạt động`).

#### Các bước thực hiện:
1. Mở ứng dụng, đăng nhập tài khoản Khách hàng.
2. Nhấn vào tab **Hoạt động** trên thanh Bottom Navigation Bar.
3. Quan sát thanh chuyển Tab (Tab bar) phía trên cùng của màn hình.
4. Nhấn chuyển lần lượt qua từng tab: **Tất cả** ➔ **Đang thực hiện** ➔ **Hoàn thành** ➔ **Đang khiếu nại**.

#### Kết quả mong đợi:
* ✅ **Không còn tab "Đặt lại"**: Tab này đã được gỡ bỏ hoàn toàn.
* ✅ **Xuất hiện tab "Đang khiếu nại"**: Nằm ở vị trí thứ 4.
* ✅ **Lọc đơn hàng đúng**:
  * Khi nhấn vào tab **Đang khiếu nại**, danh sách chỉ hiển thị các đơn có trạng thái tranh chấp (`DISPUTED`) hoặc yêu cầu khiếu nại.
  * Nếu không có đơn khiếu nại nào, hiển thị màn hình trống với thông điệp rõ ràng, không báo lỗi màn hình.
* ✅ **Badge trạng thái đơn**: Các đơn khiếu nại hiển thị nhãn màu cảnh báo nổi bật: `Đang khiếu nại`.

---

### 2. TASK-02: Bản Đồ Radar Căn Đúng Tâm Vị Trí Khách Hàng Ngay Từ Đầu

* **Commit liên quan:** `84d591e`
* **Màn hình kiểm tra:** Màn hình **Radar tìm thợ** (`/customer/booking/radar?orderId=...`).

#### Các bước thực hiện:
1. Từ màn hình Trang chủ khách hàng, chọn một dịch vụ và nhấn **Tiếp tục** để tạo đơn đặt thợ.
2. Hoàn tất việc tạo đơn để ứng dụng tự động điều hướng sang màn hình **Radar quét tìm thợ quanh đây**.
3. Quan sát góc nhìn bản đồ (camera) ngay trong 1-2 giây đầu tiên khi màn hình vừa tải xong.

#### Kết quả mong đợi:
* ✅ **Không bị góc nhìn toàn quốc**: Bản đồ **không** bị mở ra ở tầm nhìn bao quát toàn bộ bản đồ Việt Nam.
* ✅ **Tự động căn tâm**: Camera bản đồ tự động căn đúng vào vị trí địa chỉ mà khách hàng đã chọn đặt đơn (hoặc vị trí GPS hiện tại của khách hàng).
* ✅ **Mức zoom chuẩn (14.5)**: Mức phóng to hiển thị rõ đường phố, khu phố và vòng quét radar xung quanh vị trí khách hàng.

---

### 3. TASK-03: Trang Hồ Sơ (Bỏ Màu Nền Khi Nhấn/Giữ Các Tiện Ích)

* **Commit liên quan:** `cab1118`
* **Màn hình kiểm tra:**
  1. Màn hình **Hồ sơ** (Tab cuối cùng trên thanh điều hướng dưới: `Khách hàng` ➔ `Hồ sơ`).
  2. Màn hình **Cài đặt** (`Hồ sơ` ➔ `Cài đặt tài khoản`).

#### Các bước thực hiện:
1. Vào tab **Hồ sơ**, quan sát các thẻ mục: *Thông tin cá nhân*, *Địa chỉ đã lưu*, *Phương thức thanh toán*, *Lịch sử*, v.v.
2. Dùng ngón tay **chạm và giữ (long press / press state)** vào một thẻ tiện ích bất kỳ mà chưa thả tay ra.
3. Tiếp tục nhấn vào nút **Cài đặt** (Settings) để chuyển sang màn hình Cài đặt và thực hiện thao tác nhấn giữ tương tự trên các dòng cài đặt.

#### Kết quả mong đợi:
* ✅ **Không bị đổi màu nền đậm/xám**: Khi nhấn giữ, thẻ không bị đổi sang màu xám đen hoặc xanh xám bất thường.
* ✅ **Hiệu ứng nhấn tự nhiên**: Chỉ có hiệu ứng giảm nhẹ độ mờ (opacity) hoặc gợn sóng (ripple) tự nhiên, giữ nguyên màu nền trắng/sáng của thẻ.
* ✅ Khi thả tay ra, màn hình tương ứng vẫn được mở bình thường và mượt mà.

---

### 4. TASK-04: Chi Tiết Đơn Hàng & Tên Dịch Vụ Radar

* **Commit liên quan:** `8359280` *(Phần tên dịch vụ Radar đang chờ cập nhật)*
* **Màn hình kiểm tra:**
  1. Màn hình **Chi tiết đơn hàng** của khách hàng (Nhấn vào bất kỳ đơn hàng nào từ danh sách Hoạt động).
  2. Màn hình **Radar tìm thợ** (`/customer/booking/radar?requestId=...`).

#### Các bước thực hiện:
1. Từ tab **Hoạt động**, nhấn chọn một đơn hàng để xem chi tiết.
2. Quan sát thanh Header ở cạnh trên cùng của màn hình.
3. Chọn một đơn hàng đã có thợ nhận việc và cuộn đến phần thông tin thợ.
4. Kiểm tra mục **Hình ảnh hiện trường / Hình ảnh đính kèm** của đơn hàng.
5. Mở màn hình Radar tìm thợ từ một yêu cầu hoặc đơn hàng cụ thể (ví dụ dịch vụ **"Chăm sóc mẹ và em bé"** `#REQ-20261105-UHCM`).
6. Quan sát thanh tiêu đề Header Pill trên cùng của màn hình Radar.

#### Kết quả mong đợi:
* ✅ **Tiêu đề Header Chi tiết đơn**: Thanh header hiển thị đúng chữ **"Chi tiết đơn hàng"** (không còn bị hiển thị nhầm là *"Báo giá thợ"*).
* ✅ **Thông tin thợ thật**: Tên thợ, Avatar, số điện thoại hiển thị đúng theo thông tin của thợ nhận đơn (`workerUserId`).
* ✅ **Lọc sạch ảnh rỗng**: Không còn khung xám placeholder rỗng khi không có ảnh.
* ✅ **Tên dịch vụ trên Radar**: Khối Header Pill phía trên Radar hiển thị chính xác tên dịch vụ gốc (ví dụ: *"Chăm sóc mẹ và em bé"*), không bị fallback về *"Dịch vụ tiện ích"*. Tự động đồng bộ từ API request thật và router params.

---

### 5. TASK-05: Âm Thanh "Ting Ting" Khi Có Báo Giá Mới

* **Trạng thái:** ⏸️ **Tạm chưa làm** (Giữ nguyên theo lộ trình phê duyệt của dự án).
* **Ghi chú:** Chưa cần thực hiện kiểm thử cho tính năng âm thanh này ở thời điểm hiện tại.

---

### 6. TASK-06: Màn Hình Đặt Thợ (Giữ Tên Dịch Vụ & Không Ghi Đè Mô Tả)

* **Commit liên quan:** `162f266`
* **Màn hình kiểm tra:** Màn hình **Đặt thợ** (`/customer/booking/new`).

#### Các bước thực hiện:
1. Tại Trang chủ khách hàng, nhấn chọn một dịch vụ cụ thể (Ví dụ: **"Sửa điện gia dụng"** hoặc **"Sửa ống nước"**).
2. Quan sát ô chọn dịch vụ / tiêu đề tại màn hình đặt thợ.
3. Nhập một đoạn mô tả tự do vào ô nhập văn bản (Ví dụ: `Cần sửa gấp trong chiều nay`).
4. Nhấn vào một trong các chip gợi ý sự cố có sẵn bên dưới (Ví dụ bấm chip: `Thay cầu chì`).

#### Kết quả mong đợi:
* ✅ **Giữ đúng tên dịch vụ**: Ô dịch vụ giữ nguyên tên dịch vụ đã bấm chọn ban đầu (không bị tự động nhảy về tên mặc định *"Dịch vụ tiện ích"*).
* ✅ **Không xóa mô tả tự gõ**:
  * Đoạn text đã gõ ban đầu (`Cần sửa gấp trong chiều nay`) vẫn được giữ nguyên vẹn.
  * Nội dung của chip gợi ý được **nối thêm vào phía sau** (kèm dấu phẩy ngăn cách):
    `Cần sửa gấp trong chiều nay, Thay cầu chì`.

---

### 7. TASK-07: Sắp Xếp Báo Giá Theo Giá & Hiển Thị Số Liệu So Sánh

* **Commit liên quan:** `a51f15c`
* **Màn hình kiểm tra:** Màn hình **Radar tìm thợ** khi đã có các thợ gửi báo giá (bids).

#### Các bước thực hiện:
1. Ở màn hình Radar, khi có từ 2 báo giá của thợ gửi về (hoặc dùng tài khoản thợ gửi 2 báo giá với mức giá khác nhau, ví dụ: 250.000đ và 150.000đ).
2. Quan sát thứ tự hiển thị của các thẻ báo giá ở danh sách phía dưới bản đồ.
3. Quan sát các nhãn và thông số trên từng thẻ báo giá.

#### Kết quả mong đợi:
* ✅ **Thứ tự sắp xếp**: Báo giá có mức giá thấp hơn được tự động ưu tiên xếp lên trên cùng (Sắp xếp tăng dần theo `amount`: 150.000đ nằm trước 250.000đ).
* ✅ **Huy hiệu "Giá tốt nhất"**: Thẻ báo giá có mức giá thấp nhất hiển thị huy hiệu nổi bật **"Giá tốt nhất"** màu xanh lá.
* ✅ **Đầy đủ 4 chỉ số so sánh trực quan**:
  1. **Giá tiền** (VND rõ ràng).
  2. **Đánh giá sao** (Ví dụ: `⭐ 4.9`).
  3. **Số đơn hoàn thành** (Ví dụ: `120 đơn`).
  4. **Khoảng cách** (Ví dụ: `1.2 km`).

---

### 8. TASK-08: Thiết Kế Lại Toàn Diện Trang Chi Tiết Đơn Hàng

* **Commit liên quan:** `5727675`
* **File tài liệu đặc tả:** [`TASK-08-thiet-ke-lai-trang-chi-tiet-don-hang.md`](./TASK-08-thiet-ke-lai-trang-chi-tiet-don-hang.md)
* **Màn hình kiểm tra:** Màn hình **Chi tiết đơn hàng** của khách hàng (`/customer/orders/[id]`).

#### Các bước thực hiện:
1. Từ danh sách đơn hàng ở tab Hoạt động, bấm vào xem một đơn hàng cụ thể ở các trạng thái khác nhau (Chờ xác nhận, Đang thi công, Chờ nghiệm thu, Hoàn tất, Hủy).
2. Quan sát phần trên cùng: Hero Status Banner và Stepper tiến trình (5 bước).
3. Quan sát Thẻ thợ phụ trách: Kiểm tra avatar, sao đánh giá, nút gọi điện 📞, nút nhắn tin 💬 và nút xem hồ sơ.
4. Bấm vào các ảnh trong mục Bằng chứng thi công để kiểm tra tính năng mở modal phóng to ảnh (Lightbox).
5. Cuộn trang lên xuống để kiểm tra thanh Sticky Bottom Action Bar cố định ở đáy màn hình.

#### Kết quả mong đợi:
* ✅ **Hero Banner & Stepper**: Hiển thị màu sắc và thông điệp tương ứng trạng thái đơn; Stepper đánh dấu trực quan vị trí bước hiện tại.
* ✅ **Thẻ thợ đầy đủ tương tác**: Có avatar, rating; bấm nút gọi điện mở trình quay số, bấm xem hồ sơ mở trang chi tiết thợ.
* ✅ **Bằng chứng thi công**: Chạm vào ảnh thumbnail mở modal phóng to xem rõ nét.
* ✅ **Sticky Bottom Action Bar**: Thanh nút hành động luôn ghim cố định ở đáy màn hình không bị che lấp khi cuộn, các nút hành động (Nghiệm thu / Khiếu nại / Hủy đơn) hoạt động chính xác.
* ✅ **Dọn sạch text thừa**: Không còn dòng chữ placeholder *"Chức năng đang được phát triển"*.

---

### 9. TASK-09: Xử Lý Thợ Báo Giá Lại (Re-bid) Khi Có Đề Xuất Đang Chờ

* **File tài liệu đặc tả:** [`TASK-09-xu-ly-tho-bao-gia-lai-re-bid.md`](./TASK-09-xu-ly-tho-bao-gia-lai-re-bid.md)
* **Trạng thái:** ⏸️ **Tạm chưa làm (Để lại làm sau)**
* **Ghi chú:** Chưa cần thực hiện kiểm thử cho luồng Re-bid này ở thời điểm hiện tại.

---

## 📋 Bảng Checklist Nghiệm Thu Nhanh (QA Sign-off)

| Mã Task | Hạng mục kiểm tra | Người kiểm tra | Kết quả (Pass / Fail) | Ghi chú |
|:---:|:---|:---:|:---|:---:|
| **TASK-01** | Bỏ tab Đặt lại, có tab Đang khiếu nại, lọc đơn tranh chấp chuẩn | | 🔲 Pass / 🔲 Fail | |
| **TASK-02** | Bản đồ Radar căn tâm vị trí khách với zoom 14.5 ngay khi vào | | 🔲 Pass / 🔲 Fail | |
| **TASK-03** | Thao tác nhấn giữ menu tiện ích Profile/Settings không đổi màu xám | | 🔲 Pass / 🔲 Fail | |
| **TASK-04** | Header "Chi tiết đơn hàng", thợ thật, sạch ảnh rỗng & tên DV Radar | | 🔲 Pass / 🔲 Fail | |
| **TASK-05** | *(Tạm chưa làm theo kế hoạch - Âm thanh ting ting)* | - | ⏸️ Bỏ qua | |
| **TASK-06** | Giữ tên dịch vụ, bấm chip gợi ý chỉ nối thêm text vào mô tả | | 🔲 Pass / 🔲 Fail | |
| **TASK-07** | Báo giá sắp xếp theo giá tăng dần, có badge "Giá tốt nhất" & 4 chỉ số | | 🔲 Pass / 🔲 Fail | |
| **TASK-08** | Thiết kế lại trang chi tiết đơn: Hero Stepper, thẻ thợ pro, sticky bar | | 🔲 Pass / 🔲 Fail | |
| **TASK-09** | *(Tạm chưa làm theo kế hoạch - Thợ Re-bid)* | - | ⏸️ Bỏ qua | |

