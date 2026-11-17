# TASK-10: Sửa lỗi ô nhập vị trí / địa chỉ làm việc bị nhảy liên tục và tự đóng bàn phím

> **Trạng thái:** 📝 **Đã lập đặc tả kỹ thuật & Sẵn sàng triển khai**  
> **Mức độ ưu tiên:** 🔴 **Cao (Blocker trải nghiệm đặt việc)**  
> **Phạm vi ảnh hưởng:** Luồng đặt thợ khách hàng (`/customer/booking/select-address`)

---

## 1. Mục tiêu & Hiện tượng thực tế

### 1.1. Hiện tượng ghi nhận từ người dùng & QA
- Khi khách hàng tạo đơn đặt việc chuyển sang màn hình **Chọn địa chỉ làm việc** (`/customer/booking/select-address`):
  1. **Không thể điền địa chỉ thuận lợi:** Khi người dùng chạm vào ô `TextInput` "Địa chỉ làm việc" (`booking-address-input`) và bắt đầu gõ từng ký tự (ví dụ: gõ *"123 Nguyễn Lương Bằng, Hòa Khánh Bắc..."*), ô nhập liệu liên tục bị **giật, con trỏ nhảy lung tung** và các chữ vừa gõ bị biến mất hoặc bị ghi đè.
  2. **Bàn phím tự động sập xuống (Keyboard dismissed liên tục):** Người dùng đang gõ được 2-3 chữ thì bàn phím ảo tự động đóng lại, khiến người dùng phải chạm lại vào ô nhập, nhưng gõ tiếp thì bàn phím lại tự sập.
  3. **Xung đột hiển thị giữa bản đồ và chữ gõ (Ping-pong loop):** Khi gõ xong một từ, bản đồ di chuyển rồi kéo theo chuỗi địa chỉ trong ô input bị đổi ngược lại thành một địa chỉ đảo ngược do bản đồ tự sinh ra, khiến người dùng không thể hoàn thành việc nhập địa chỉ chính xác của mình.

### 1.2. Yêu cầu sau khi xử lý
- **Nhập liệu mượt mà, độc lập 100%:** Người dùng có thể gõ liên tục mọi nội dung địa chỉ mà không bao giờ bị giật, nhảy con trỏ hay bị ghi đè văn bản đang gõ.
- **Không tự động sập bàn phím:** Tuyệt đối không gọi lệnh đóng bàn phím (`Keyboard.dismiss()`) trong khi người dùng đang có focus và đang chủ động gõ phím trong ô địa chỉ.
- **Phân tách rạch ròi 2 luồng tương tác:**
  - *Luồng A (Người dùng gõ chữ vào input):* Bản đồ tự động `flyTo` đến tọa độ tìm được để định hướng trực quan, **nhưng cấm bản đồ ghi đè ngược lại chữ trong input**.
  - *Luồng B (Người dùng dùng tay vuốt/kéo bản đồ):* Khi người dùng chủ động kéo tâm bản đồ đến một địa điểm mới, hệ thống mới reverse geocode để cập nhật text vào ô địa chỉ.
- **Bảo toàn văn bản trước Cold-start GPS:** Quá trình quét GPS ngầm khi vừa vào màn hình không được ghi đè ô input nếu người dùng đã bắt đầu gõ.

---

## 2. Phân tích nguyên nhân gốc rễ kỹ thuật (Root Cause Analysis)

Mã nguồn tại [`mobile/src/app/customer/booking/select-address.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/app/customer/booking/select-address.tsx) đang gặp 3 điểm xung đột nghiêm trọng:

```
[Người dùng gõ chữ] ──► handleAddressInputChange(text)
                              │
                              ▼ (debounce 700ms)
                     MapboxService.forwardGeocode(text)
                              │
                              ▼
                     mapRef.current?.flyTo(coords, 16)
                              │
                              ▼ (Bản đồ di chuyển kích hoạt callback)
                     HandyMap: onRegionDidChange ──► handleRegionChange(coords)
                                                           │
                      ┌────────────────────────────────────┴────────────────────────────────────┐
                      ▼                                                                         ▼
             Keyboard.dismiss()                                                   debounce 500ms
        (Bàn phím bị sập ngay lập tức!)                                    MapboxService.reverseGeocode(coords)
                                                                                                │
                                                                                                ▼
                                                                                   setCurrentAddress(streetAddress)
                                                                            (Đè bẹp chuỗi người dùng đang gõ!)
```

### Chi tiết 3 lỗi mã nguồn cụ thể:

1. **Vòng lặp tương hỗ (Feedback Loop) giữa Forward và Reverse Geocoding:**
   - Trong `handleAddressInputChange`: Khi gõ được $\ge 3$ ký tự, timer `forwardGeocodeTimerRef` kích hoạt sau 700ms và gọi `mapRef.current?.flyTo(...)`.
   - Lệnh `flyTo` làm camera bản đồ chuyển động. Khi camera chuyển động xong, `HandyMap` bắn sự kiện `onRegionDidChange` gọi đến `handleRegionChange(coords)`.
   - Trong `handleRegionChange`, hàm này lại bật timer `debounceTimerRef` 500ms để gọi `MapboxService.reverseGeocode(coords)` và gọi **`setCurrentAddress(streetAddress)`**.
   - Chuỗi `streetAddress` từ vệ tinh trả về khác với chuỗi người dùng vừa gõ tay ➔ `currentAddress` bị thay thế đột ngột, kích hoạt re-render khiến chữ bị nhảy và lặp lại chu kỳ.

2. **Lệnh `Keyboard.dismiss()` đặt sai vị trí:**
   - Trong `handleRegionChange` (dòng 93):
     ```ts
     const handleRegionChange = React.useCallback(
       (coords: HandyCoordinates) => {
         setCurrentCoords(coords);
         Keyboard.dismiss(); // ❌ LỖI NGHIÊM TRỌNG: Gọi vô điều kiện mỗi khi bản đồ di chuyển
         ...
     ```
   - Vì `flyTo` của forward geocoding di chuyển bản đồ nên sự kiện này luôn kích hoạt `Keyboard.dismiss()`, làm bàn phím người dùng đang mở bị đóng sập lại giữa chừng.

3. **Hiện tượng giật con trỏ (Cursor Jump / Value Drift trong React Native Controlled Input):**
   - Ô `TextInput` sử dụng `value={currentAddress}`. Khi một giá trị chuỗi mới được gán từ kết quả bất đồng bộ (`setCurrentAddress(streetAddress)` hoặc từ GPS ngầm `fetchDeviceGpsLocation`), component render lại với giá trị mới làm con trỏ text bị reset về cuối chuỗi hoặc làm mất các ký tự vừa bấm.

---

## 3. Giải pháp kỹ thuật toàn diện (Solution Specification)

### 3.1. Phân biệt cờ trạng thái "Đang nhập liệu" (`isInputFocusedRef` / `isUserInteractingWithMapRef`)
- Khai báo Ref theo dõi nguồn tương tác:
  ```ts
  const isInputFocusedRef = React.useRef(false);
  const isProgrammaticMovingRef = React.useRef(false);
  ```
- Khi `TextInput` nhận focus (`onFocus`):
  `isInputFocusedRef.current = true;`
- Khi `TextInput` mất focus (`onBlur`):
  `isInputFocusedRef.current = false;`

### 3.2. Chặn `Keyboard.dismiss()` và Reverse Geocode khi bản đồ di chuyển bằng hiệu ứng tự động
- Khi gọi `forwardGeocode` thành công và chuẩn bị `flyTo`:
  ```ts
  isProgrammaticMovingRef.current = true;
  mapRef.current?.flyTo({ latitude: result.latitude, longitude: result.longitude }, 16);
  // Reset cờ sau khi animation bay kết thúc (khoảng 800ms - 1000ms)
  setTimeout(() => {
    isProgrammaticMovingRef.current = false;
  }, 1000);
  ```
- Trong `handleRegionChange`:
  ```ts
  const handleRegionChange = React.useCallback((coords: HandyCoordinates) => {
    setCurrentCoords(coords);

    // 1. Chỉ ẩn bàn phím nếu người dùng thực sự dùng ngón tay vuốt bản đồ,
    // TUYỆT ĐỐI không ẩn bàn phím nếu do input đang focus hoặc do map programmatic move
    if (!isInputFocusedRef.current && !isProgrammaticMovingRef.current) {
      Keyboard.dismiss();
    }

    // 2. Không reverse geocode đè lên input nếu người dùng đang chủ động gõ
    if (isInputFocusedRef.current || isProgrammaticMovingRef.current) {
      return;
    }

    // 3. Chỉ thực hiện reverse geocode khi người dùng chủ động kéo thả bản đồ bằng tay
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const streetAddress = await MapboxService.reverseGeocode(coords.latitude, coords.longitude);
        if (streetAddress && !isInputFocusedRef.current) {
          setCurrentAddress(streetAddress);
          setAddress(streetAddress, coords.latitude, coords.longitude);
        }
      } catch {
        // Giữ địa chỉ hiện tại nếu lỗi mạng
      }
    }, 500);
  }, [setAddress]);
  ```

### 3.3. Bảo vệ Cold-start GPS không ghi đè ô nhập
- Trong `fetchDeviceGpsLocation`:
  ```ts
  if (result.status === 'gps_success' && result.coordinates) {
    // Chỉ cập nhật nếu ô input chưa có text do người dùng đã gõ hoặc ô input đang không được focus
    if (!isInputFocusedRef.current && !currentAddress.trim()) {
      setCurrentAddress(result.coordinates.addressText);
    }
    setCurrentCoords({ latitude: result.coordinates.latitude, longitude: result.coordinates.longitude });
    setGpsStatus('success');
    mapRef.current?.flyTo({ latitude: result.coordinates.latitude, longitude: result.coordinates.longitude }, 16);
  }
  ```

### 3.4. Cải tiến UX Ô nhập địa chỉ
- Bổ sung `autoCapitalize="sentences"`, `autoCorrect={false}`.
- Giữ nút `✕` xóa nhanh địa chỉ hoạt động tin cậy để xóa trắng và đưa bản đồ về lại vị trí mặc định nếu muốn.

---

## 4. Các file ảnh hưởng chính

| File đường dẫn | Vai trò & Hạng mục can thiệp |
|:---|:---|
| [`mobile/src/app/customer/booking/select-address.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/app/customer/booking/select-address.tsx) | Bổ sung `isInputFocusedRef`, `isProgrammaticMovingRef`, xử lý ngắt vòng lặp giữa `forwardGeocode` và `handleRegionChange`, bảo vệ bàn phím. |
| [`mobile/src/components/map/handy-map.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/components/map/handy-map.tsx) | Đảm bảo callback `onRegionDidChange` trả về đầy đủ tọa độ và trạng thái tương tác mượt mà. |
| [`mobile/src/app/customer/__tests__/customer-flow-screens.test.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/app/customer/__tests__/customer-flow-screens.test.tsx) | Bổ sung test case kiểm tra gõ text vào `booking-address-input` không bị xóa chữ và không kích hoạt `Keyboard.dismiss`. |

---

## 5. Kịch bản kiểm thử & Tiêu chí nghiệm thu (Acceptance Criteria)

- [ ] **Kịch bản 1: Nhập địa chỉ thủ công không bị sập bàn phím**
  1. Mở màn hình Chọn địa chỉ làm việc (`/customer/booking/select-address`).
  2. Chạm vào ô nhập địa chỉ, bàn phím ảo hiển thị.
  3. Gõ liên tục một chuỗi địa chỉ dài (ví dụ: *"54 Nguyễn Lương Bằng, Hòa Khánh Bắc, Liên Chiểu"*).
  4. **Kỳ vọng:** Bàn phím giữ nguyên không bị đóng; từng ký tự xuất hiện mượt mà; con trỏ không bị nhảy lung tung; chữ vừa gõ không bị biến mất.
- [ ] **Kịch bản 2: Bản đồ cập nhật tương ứng mà không echo ngược**
  1. Sau khi gõ xong địa chỉ ở Kịch bản 1 và dừng lại khoảng 1 giây.
  2. **Kỳ vọng:** Bản đồ tự động chuyển camera (`flyTo`) đến vị trí tìm thấy; nội dung trong ô text vẫn giữ nguyên chính xác chuỗi người dùng đã nhập, không bị thay bằng chuỗi khác.
- [ ] **Kịch bản 3: Kéo thả bản đồ bằng tay vẫn cập nhật địa chỉ**
  1. Dùng ngón tay vuốt/kéo bản đồ sang một vị trí khác.
  2. Thả tay ra.
  3. **Kỳ vọng:** Sau 500ms, ô địa chỉ tự động hiển thị tên đường/địa chỉ mới tại tâm ghim bản đồ.
- [ ] **Kịch bản 4: Nhấn nút định vị GPS**
  1. Bấm vào nút định vị tròn GPS (Floating Action Button).
  2. **Kỳ vọng:** Bản đồ quay về tọa độ GPS của máy và cập nhật địa chỉ GPS tương ứng.

