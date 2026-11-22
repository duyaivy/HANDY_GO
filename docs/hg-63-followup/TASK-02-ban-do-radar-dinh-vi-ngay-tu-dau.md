# TASK-02: Bản đồ Radar - Khởi tạo đúng vị trí ngay từ đầu

## 1. Mục tiêu & Hiện tượng
- **Hiện trạng:**
  - Khi khách hàng tạo yêu cầu và chuyển sang màn hình tìm kiếm thợ / Radar (`/customer/booking/radar`), bản đồ Mapbox hiển thị góc nhìn bao quát toàn bộ bản đồ Việt Nam (hoặc tọa độ mặc định mức zoom rất xa).
  - Khách hàng bắt buộc phải nhấn vào nút định vị hiện tại ("Vị trí của tôi") hoặc tự thao tác zoom/chạm bản đồ thì camera mới nhảy về đúng vị trí thực tế của khách hàng.
- **Yêu cầu:**
  - Ngay khi màn hình Radar mở ra, bản đồ phải **tự động căn đúng tâm vị trí khách hàng đã chọn** với mức zoom khu vực phù hợp (street/neighborhood level, khoảng 14 - 15) mà người dùng không cần phải bấm bất kỳ nút nào.

---

## 2. Nguyên nhân gốc (Root Cause)
1. **Timing của Mapbox Camera Native:**
   - Trong `@rnmapbox/maps`, component `<Mapbox.Camera>` sử dụng thuộc tính `defaultSettings`. Giá trị này chỉ được native module đọc 1 lần duy nhất khi native map vừa khởi tạo.
   - Khi component `HandyMap` vừa mount, tọa độ `radarCoords` có thể đang được tính toán hoặc lấy từ `useBookingDraftStore` / API (`OrdersApi.getRequestDetail`), dẫn tới lúc đầu map nhận `targetCenter` mặc định hoặc camera native chưa kịp áp dụng trước khi map sẵn sàng.
2. **Thiếu trigger căn tâm tự động sau khi map load:**
   - `HandyMap` chỉ gọi `setCamera` trong `useEffect` khi prop `center` thay đổi, nhưng tại thời điểm `useEffect` chạy lần đầu, `cameraRef.current` có thể chưa sẵn sàng (chưa liên kết với native view).
   - Chưa tận dụng callback `onDidFinishLoadingMap` hoặc `onMapIdle` để chủ động định vị camera về `targetCenter` một lần nữa.
3. **Mức zoom mặc định trong Radar:**
   - `zoomLevel` đang truyền vào `HandyMap` trong `radar.tsx` là `11.5` (mức zoom cấp tỉnh/thành phố rộng), chưa đủ gần để thấy rõ khu phố/vị trí thợ xung quanh.

---

## 3. Các file ảnh hưởng chính
- `mobile/src/app/customer/booking/radar.tsx`:
  - Component `<HandyMap ref={mapRef} ... />`.
  - Mức `zoomLevel` khởi tạo.
  - Tự động gọi `mapRef.current?.flyTo(radarCoords, 14.5)` ngay khi `radarCoords` sẵn sàng hoặc map hoàn tất nạp.
- `mobile/src/components/map/handy-map.tsx`:
  - Hook đồng bộ camera khi map vừa load xong (`onDidFinishLoadingMap` / callback native).
  - Đảm bảo `cameraRef.current.setCamera` được gọi an toàn khi native view đã attach.

---

## 4. Các bước thực hiện kỹ thuật
1. **Nâng cấp `HandyMap` hỗ trợ khởi tạo camera chắc chắn:**
   - Thêm cờ `hasInitialAnimatedRef` để khi bản đồ báo sẵn sàng (`onMapIdle` hoặc `onDidFinishLoadingMap`), nếu camera chưa ở đúng `targetCenter`, tự động điều hướng nhẹ nhàng tới `targetCenter` với `zoomLevel` mong muốn.
2. **Tinh chỉnh màn hình Radar (`radar.tsx`):**
   - Đổi `zoomLevel` khởi tạo từ `11.5` lên `14.5` (mức zoom tối ưu cho bán kính quét 2 - 5km).
   - Thêm `useEffect` quan sát `radarCoords`: khi `radarCoords` có giá trị hợp lệ, gọi `mapRef.current?.flyTo(radarCoords, 14.5)` sau một khoảng delay ngắn (~100-200ms) để đảm bảo camera native đã mount.
3. **Fallback tọa độ:**
   - Nếu `useBookingDraftStore` có tọa độ hợp lệ (`latitude`, `longitude`), dùng ngay lập tức cho `initialCenter` của `HandyMap`, tránh truyền tọa độ rỗng hoặc [0, 0].

---

## 5. Kịch bản kiểm thử (Test Cases)
- [x] Vào đặt việc từ màn hình chính -> chọn địa chỉ -> đến màn hình Radar.
- [x] Bản đồ xuất hiện lập tức căn giữa tại địa chỉ đã chọn (ví dụ: Đà Nẵng / địa chỉ đã nhập), không còn nhìn thấy toàn bộ bản đồ Việt Nam.
- [x] Không cần bấm nút vị trí hoặc thao tác tay, radar scanner hiển thị ngay trên khu vực thực tế.
- [x] Bấm nút định vị hiện tại vẫn hoạt động bình thường mượt mà.

