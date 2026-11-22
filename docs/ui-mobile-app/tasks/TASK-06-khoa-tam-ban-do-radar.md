# TASK-06: Khóa vị trí bản đồ radar, vẫn cho zoom

- **Mục yêu cầu:** Mục 6 (HG-63)
- **Giai đoạn:** Giai đoạn 2
- **Độ ưu tiên:** Cao
- **Trạng thái:** Hoàn thành

---

## 1. Mục tiêu & Phạm vi

### Mục tiêu
Trên màn hình Radar tìm thợ (`radar.tsx`), bản đồ phải được cố định tâm (center-locked) tại đúng vị trí đặt việc của khách hàng. Người dùng chỉ được phép phóng to / thu nhỏ (pinch-to-zoom) để quan sát thợ xung quanh; bị vô hiệu hóa hoàn toàn cử chỉ kéo trượt (pan), xoay (rotate) hoặc nghiêng bản đồ (pitch) để tránh làm lệch tâm tìm kiếm.

### Phạm vi chốt
- **Bao gồm:**
  - Mở rộng component bản đồ dùng chung: `mobile/src/components/map/handy-map.tsx`.
  - Cập nhật cấu hình và logic camera trong màn hình Radar: `mobile/src/app/customer/booking/radar.tsx`.
  - Cập nhật test `handy-map.test.tsx`.
- **Ngoại trừ:** Không làm ảnh hưởng đến các màn hình khác đang dùng `HandyMap` (như màn hình chọn địa chỉ đặt dịch vụ - nơi vẫn cần đầy đủ tính năng pan, zoom, click).

---

## 2. Hiện trạng & Bằng chứng mã nguồn

1. **`mobile/src/components/map/handy-map.tsx`**:
   - Hiện chỉ có 1 prop boolean duy nhất là `interactive?: boolean`.
   - Prop này được gán đồng loạt cho tất cả các hành vi của Mapbox MapView:
     ```tsx
     scrollEnabled={interactive}
     zoomEnabled={interactive}
     rotateEnabled={interactive}
     pitchEnabled={interactive}
     ```
   - Do đó, nếu `interactive = true`, người dùng vừa zoom vừa có thể kéo lệch bản đồ đi nơi khác. Nếu `interactive = false`, người dùng bị khóa cứng hoàn toàn, không thể zoom để xem các thợ ở gần/xa.
2. **`mobile/src/app/customer/booking/radar.tsx`**:
   - Tọa độ trung tâm: Có trường hợp fallback cứng về tọa độ mặc định (Đà Nẵng) thay vì lấy tọa độ thực tế của yêu cầu dịch vụ.
   - Khi người dùng pinch zoom bằng hai ngón tay trên màn hình cảm ứng, nếu không khóa `pinchPanEnabled`, tâm camera của Mapbox sẽ tự động bị trượt theo trọng tâm của hai ngón tay.
   - Vòng tròn quét radar hiện đang có các nhãn khoảng cách cố định (như 1km, 3km, 5km). Khi người dùng zoom bản đồ, tỉ lệ bản đồ thay đổi nhưng vòng tròn tĩnh vẫn giữ nguyên kích thước pixel, gây sai lệch trực quan nghiêm trọng.
   - Các View lớp phủ (radar overlay) có thể vô tình chặn cử chỉ chạm (touch gesture) của bản đồ bên dưới nếu không đặt `pointerEvents="box-none"`.

---

## 3. Thiết kế giải pháp kỹ thuật

### 3.1. Mở rộng props của `HandyMap`
Bổ sung các props điều khiển cử chỉ chi tiết vào interface `HandyMapProps`:

```typescript
export interface HandyMapProps {
  // ... các props hiện hữu ...
  interactive?: boolean; // Mặc định là true
  // Cử chỉ tùy biến nâng cao (nếu không truyền sẽ lấy theo giá trị của interactive):
  panEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  pinchPanEnabled?: boolean; // Dành riêng cho gestureSettings của Mapbox
}
```

Trong phần render của `HandyMap`:
```tsx
const isPan = panEnabled ?? interactive ?? true;
const isZoom = zoomEnabled ?? interactive ?? true;
const isRotate = rotateEnabled ?? interactive ?? true;
const isPitch = pitchEnabled ?? interactive ?? true;
const isPinchPan = pinchPanEnabled ?? isPan;

<MapView
  scrollEnabled={isPan}
  zoomEnabled={isZoom}
  rotateEnabled={isRotate}
  pitchEnabled={isPitch}
  // Cấu hình gestureSettings của SDK Mapbox:
  gestureSettings={{
    pinchPanEnabled: isPinchPan,
    panEnabled: isPan,
    pinchZoomEnabled: isZoom,
  }}
  // ...
/>
```
*Lợi ích:* Đảm bảo tính tương thích ngược 100% với các màn hình hiện tại.

### 3.2. Cấu hình tại màn hình Radar (`radar.tsx`)
1. **Khóa cử chỉ:**
   ```tsx
   <HandyMap
     center={orderLocation} // Tọa độ thực của yêu cầu
     interactive={true}
     panEnabled={false}       // Tắt kéo 1 ngón
     pinchPanEnabled={false}  // Tắt kéo 2 ngón khi zoom
     rotateEnabled={false}    // Tắt xoay bản đồ
     pitchEnabled={false}     // Tắt nghiêng 3D
     zoomEnabled={true}       // CHỈ GIỮ LẠI ZOOM
     // ...
   />
   ```
2. **Khóa tâm camera (Camera Center Locking):**
   - Lấy tọa độ trung tâm `centerCoordinate` trực tiếp từ dữ liệu request thật (`request.location.latitude`, `request.location.longitude`).
   - Nếu chưa có tọa độ hợp lệ: Hiển thị thông báo "Đang tải vị trí yêu cầu..." hoặc "Chưa xác định được vị trí", **tuyệt đối không hiển thị tọa độ mẫu Đà Nẵng như thể đó là vị trí thật của khách hàng**.
   - Khi Mapbox kích hoạt sự kiện camera change do người dùng zoom: Giữ nguyên `centerCoordinate` tại vị trí đặt việc, chỉ cập nhật `zoomLevel`.
   - **Chống lặp camera vô hạn (Camera Loop Prevention):** Sử dụng cờ `isInternalCameraUpdate = useRef(false)` khi cập nhật camera từ code để bỏ qua việc xử lý lại sự kiện onCameraChanged từ SDK.
3. **Cải tiến đồ họa Radar:**
   - Giữ nguyên hiệu ứng sóng quét radar làm trang trí trực quan.
   - **Loại bỏ các nhãn km cố định** (1km, 3km...) trên vòng tròn vì vòng tròn hiển thị theo đơn vị pixel màn hình cố định, không co giãn theo tỷ lệ địa lý thực tế khi zoom bản đồ.
   - Đảm bảo thẻ View chứa hiệu ứng radar có `pointerEvents="box-none"` để cử chỉ pinch-zoom của người dùng truyền xuyên qua xuống lớp bản đồ.

---

## 4. Kế hoạch kiểm thử & Nghiệm thu

### Ca kiểm thử bắt buộc
1. **Thử nghiệm kéo bản đồ (Pan gesture):**
   - Dùng 1 ngón tay vuốt ngang/dọc trên bản đồ radar -> Bản đồ đứng yên hoàn toàn, không bị trượt khỏi tâm.
2. **Thử nghiệm phóng to / thu nhỏ (Pinch-to-zoom):**
   - Dùng 2 ngón tay chụm lại hoặc kéo ra -> Bản đồ phóng to/thu nhỏ mượt mà.
   - Sau khi zoom, vị trí ghim (marker) của khách hàng vẫn nằm chính xác ở tâm giữa màn hình.
3. **Thử nghiệm xoay / nghiêng (Rotate & Pitch):**
   - Dùng 2 ngón tay xoay tròn -> Bản đồ giữ nguyên hướng Bắc (không bị xoay góc nghiêng).
4. **Kiểm tra lớp phủ không chặn cảm ứng:**
   - Đặt 2 ngón tay lên chính giữa vòng sóng radar để zoom -> Thao tác zoom vẫn nhận bình thường.
5. **Kiểm tra màn hình Chọn địa chỉ (Regression Test):**
   - Mở màn hình chọn địa chỉ đặt việc -> Vẫn kéo bản đồ, di chuyển ghim và tìm kiếm bình thường (không bị khóa pan nhầm).
6. **Kiểm thử trên thiết bị thật (Native Build):**
   - Bắt buộc kiểm tra thao tác cảm ứng trên máy thật Android/iOS (vì môi trường test mock không mô phỏng được hành vi cử chỉ của Mapbox SDK).

### Lệnh chạy test liên quan
```bash
cd mobile
pnpm test handy-map.test.tsx
```

---

## 5. Checklist thực hiện

- [x] Mở rộng interface `HandyMapProps` với `panEnabled`, `zoomEnabled`, `rotateEnabled`, `pitchEnabled`, `pinchPanEnabled`.
- [x] Áp dụng các prop mới vào `MapView` và `gestureSettings` trong `handy-map.tsx`.
- [x] Cập nhật `radar.tsx`: tắt pan, tắt rotate, tắt pitch, bật zoom.
- [x] Xử lý khóa tâm camera theo tọa độ request thật, bỏ tọa độ demo.
- [x] Đặt `pointerEvents="box-none"` trên các container lớp phủ radar.
- [x] Xóa bỏ các nhãn khoảng cách km cố định trên vòng quét radar.
- [x] Chạy unit test `pnpm test handy-map.test.tsx`.
- [x] Kiểm tra thực tế trên thiết bị vật lý.

