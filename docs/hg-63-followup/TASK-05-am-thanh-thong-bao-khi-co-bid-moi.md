# TASK-05: Âm thanh thông báo (Ting ting) khi có Thợ báo giá mới

## 1. Mục tiêu & Hiện tượng
- **Hiện trạng:**
  - Khi khách hàng tạo yêu cầu và đang theo dõi tại màn hình Radar / Bidding (`/customer/booking/radar`), danh sách báo giá (`bids`) được cập nhật realtime qua polling / SSE.
  - Tuy nhiên, khi có thợ mới gửi báo giá hoặc cập nhật mức giá mới, ứng dụng chỉ âm thầm thêm thẻ vào danh sách mà không có bất kỳ âm thanh hay hiệu ứng thông báo tức thời nào. Khách hàng đang đặt điện thoại xuống bàn hoặc không nhìn liên tục vào màn hình sẽ rất dễ bỏ lỡ báo giá tốt.
- **Yêu cầu:**
  - Tích hợp âm thanh phản hồi thông báo (tiếng "ting ting" / sound notification chime) ngay khi phát hiện có báo giá mới gửi đến từ thợ trong lúc khách hàng đang mở màn hình Radar.
  - Đảm bảo âm thanh phát mượt mà, không bị phát lặp lại liên tục khi danh sách chỉ refetch định kỳ mà không có báo giá mới.

---

## 2. Các phương án kỹ thuật khả thi
1. **Phương án 1 (Khuyên dùng - Không cần cài thêm native binary nặng):**
   - Sử dụng `expo-notifications`:
     - Khi số lượng `bids` tăng lên so với lần trước (hoặc có bid mới với ID chưa từng xuất hiện), gọi:
       ```ts
       import * as Notifications from 'expo-notifications';

       await Notifications.scheduleNotificationAsync({
         content: {
           title: '🔔 Có báo giá mới!',
           body: `${workerName || 'Một thợ'} vừa gửi báo giá: ${formatVND(bid.price)}`,
           sound: 'default', // Phát tiếng chuông mặc định của hệ điều hành
         },
         trigger: null, // Bắn ngay lập tức
       });
       ```
     - Ưu điểm: Đã có sẵn thư viện `expo-notifications` trong `package.json`, tương thích 100% Android & iOS, phát đúng âm thanh notification của thiết bị.

2. **Phương án 2 (Sử dụng module Audio trực tiếp):**
   - Tích hợp một file âm thanh ngắn `ting.mp3` trong `mobile/assets/sounds/ting.mp3`.
   - Sử dụng `expo-av` hoặc Web Audio API / Native Sound Player để phát âm thanh trực tiếp trong app mà không cần hiện banner push.

---

## 3. Các file ảnh hưởng chính
- `mobile/src/app/customer/booking/radar.tsx`:
  - Hook / effect theo dõi biến thiên của danh sách `bids`.
  - Lưu trữ `prevBidIdsRef` hoặc `prevBidsCountRef`.
  - Hàm `playNewBidSound()` kích hoạt âm thanh khi `currentBids.length > prevBids.length`.
- `mobile/src/services/sound/sound-notification-service.ts` (Tạo mới nếu cần module hóa):
  - Chịu trách nhiệm phát âm thanh hoặc rung nhẹ thiết bị.

---

## 4. Các bước thực hiện kỹ thuật
1. **Lập cơ chế phát hiện Báo giá mới (Detection Guard):**
   ```ts
   const prevBidIdsRef = React.useRef<Set<string>>(new Set());
   const isInitialMountRef = React.useRef(true);

   React.useEffect(() => {
     if (!bids || bids.length === 0) {
       return;
     }

     const currentBidIds = new Set(bids.map(b => b.id));

     if (isInitialMountRef.current) {
       // Lần nạp đầu tiên: ghi nhận danh sách hiện có, không kêu chuông
       prevBidIdsRef.current = currentBidIds;
       isInitialMountRef.current = false;
       return;
     }

     // Tìm các bid mới xuất hiện mà trước đó chưa có
     const newBids = bids.filter(b => !prevBidIdsRef.current.has(b.id));
     if (newBids.length > 0) {
       // Kích hoạt âm thanh ting ting
       playNewBidNotificationSound(newBids[0]);
     }

     prevBidIdsRef.current = currentBidIds;
   }, [bids]);
   ```

2. **Triển khai hàm phát âm thanh (`playNewBidNotificationSound`):**
   - Đảm bảo âm thanh có debounce (khoảng cách tối thiểu 1.5s giữa các lần kêu để tránh trường hợp nhiều thợ báo giá cùng 1 lúc làm rè âm thanh).
   - Có kiểm tra an toàn bằng `try/catch` để không ảnh hưởng đến luồng UI nếu thiết bị đang ở chế độ im lặng hoặc chưa cấp quyền.

---

## 5. Kịch bản kiểm thử (Test Cases)
- [ ] Mở màn hình Radar tạo yêu cầu mới.
- [ ] Lần đầu vào màn hình, các báo giá đã có sẵn không phát chuông.
- [ ] Dùng tài khoản thợ khác (hoặc giả lập nhận WebSocket/SSE báo giá mới):
  - Ứng dụng phát tiếng "ting ting" / thông báo âm thanh rõ ràng.
  - Thẻ báo giá mới xuất hiện ở đầu danh sách.
- [ ] Khi thợ chỉ sửa giá hoặc refetch lại cùng danh sách ID: Không phát chuông thừa.
