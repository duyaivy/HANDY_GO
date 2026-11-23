# TASK-07: Màn hình Radar - Sắp xếp thợ báo giá ưu tiên theo giá & Hiển thị số liệu so sánh

> **Trạng thái:** ✅ **Hoàn thành (Commit `a51f15c`)**

## 1. Mục tiêu & Hiện trạng
- **Hiện trạng:**
  - Tại màn hình Radar / Bidding (`/customer/booking/radar`), danh sách thợ gửi báo giá (`mappedBids` trong Section A: *Báo giá từ thợ*) trước đây hiển thị theo thứ tự mảng trả về ngẫu nhiên hoặc theo thời gian thợ gửi báo giá.
  - Danh sách **chưa được sắp xếp theo giá**, khiến khách hàng khó nắm bắt được ai đang báo mức giá tốt nhất, phải cuộn tìm kiếm thủ công giữa nhiều báo giá.
- **Yêu cầu đã thực hiện:**
  1. **Tự động sắp xếp danh sách báo giá theo giá tăng dần** (ưu tiên mức giá thấp nhất/tốt nhất hiển thị lên đầu danh sách):
     ```ts
     .sort((a, b) => a.amount - b.amount)
     ```
  2. **Hiển thị đầy đủ số liệu trực quan trên từng thẻ thợ để khách tự so sánh:**
     - Mức giá báo giá (nổi bật, rõ ràng bằng VND).
     - Đánh giá uy tín (`rating` ★).
     - Số lượng đơn đã hoàn thành (`totalOrders` đơn).
     - Khoảng cách thợ tới vị trí của khách (`distanceKm`).
     - Lời nhắn kèm theo báo giá (nếu thợ có nhập ghi chú).
     - Huy hiệu **"Giá tốt nhất"** cho thợ có mức giá thấp nhất.
  3. **Không cần tạo các bộ lọc sắp xếp riêng biệt:** Hệ thống mặc định ưu tiên tiêu chí giá; các số liệu được trình bày đầy đủ, minh bạch trên card để khách hàng tự đối chiếu và so sánh trực tiếp mà không cần nút dropdown/toggle lọc rườm rà.

*(Lưu ý: Nghiệp vụ xử lý khi thợ báo giá lại Re-bid trong lúc có đề xuất đang chờ đã được tách riêng vào [TASK-09](./TASK-09-xu-ly-tho-bao-gia-lai-re-bid.md) với trạng thái tạm chưa làm).*

---

## 2. Các file ảnh hưởng chính
- `mobile/src/app/customer/booking/radar.tsx`:
  - Hook tính toán `mappedBids`: Thêm `.sort((a, b) => a.amount - b.amount)`.
  - Component hiển thị từng thẻ thợ trong danh sách `mappedBids`: Đảm bảo hiển thị cân đối các chỉ số (Giá, Rating, Số đơn hoàn thành, Khoảng cách, Lời nhắn) và huy hiệu "Giá tốt nhất".
- `mobile/src/app/customer/booking/__tests__/customer-booking-radar-bids-sorting.test.tsx`:
  - Bộ test suite tự động kiểm chứng sắp xếp giá tăng dần và hiển thị đầy đủ số liệu so sánh.

---

## 3. Các bước thực hiện kỹ thuật đã hoàn tất
1. **Sắp xếp mảng `mappedBids`:**
   - Trong `mobile/src/app/customer/booking/radar.tsx`:
     ```tsx
     const mappedBids: DisplayWorkerCandidate[] = React.useMemo(() => {
       return [...bids]
         .filter((b: BidCandidate) => !b.status || b.status === 'active')
         .sort((a, b) => a.amount - b.amount) // Ưu tiên thợ báo giá tốt nhất lên trước
         .map((b: BidCandidate) => ({
           id: b.workerUserId,
           name: b.workerProfile?.fullName || 'Thợ đối tác',
           rating: b.workerProfile?.averageRating ?? 5.0,
           totalOrders: b.workerProfile?.completedOrderCount ?? 0,
           completionRate: 98,
           price: b.amount,
           priceText: `${b.amount.toLocaleString('vi-VN')}đ`,
           distance: typeof b.workerProfile?.distanceKm === 'number'
             ? `${b.workerProfile.distanceKm.toFixed(1)}km`
             : 'Gần bạn',
           avatarUrl: b.workerProfile?.avatarUrl || DEFAULT_AVATAR,
           selectionSource: 'bid' as const,
           sourceBidId: b.sourceBidId,
           message: b.message || undefined,
         }));
     }, [bids]);
     ```

2. **Rà soát & Tối ưu bố cục thẻ so sánh:**
   - Đảm bảo thẻ báo giá hiển thị nổi bật:
     - Dòng 1: Tên thợ + Huy hiệu điểm đánh giá (`★ 5.0`) + Số đơn (`0 đơn`) + Tỷ lệ hoàn thành (`98% hoàn thành`).
     - Dòng 2: Mức giá in đậm (`29.999đ`) + Huy hiệu xanh lá `Giá tốt nhất` (cho thợ rẻ nhất) + Khoảng cách (`Gần bạn`).
     - Cột phải: Nút hành động *"Chọn thợ"* và nút nhắn tin 💬.

---

## 4. Kịch bản kiểm thử (Test Cases)
- [x] Giả lập có 3 thợ gửi báo giá với các mức giá: 250.000đ, 150.000đ, 200.000đ.
- [x] Mở màn hình Radar, kiểm tra danh sách tự động sắp xếp theo thứ tự:
  1. Thợ 150.000đ (Đứng đầu tiên kèm nhãn "Giá tốt nhất")
  2. Thợ 200.000đ (Đứng thứ hai)
  3. Thợ 250.000đ (Đứng thứ ba)
- [x] Thẻ của từng thợ hiển thị đầy đủ: Giá tiền, Rating ★, Số đơn hoàn tất, Khoảng cách.
- [x] Bấm nút "Chọn thợ" tại bất kỳ thẻ nào vẫn gửi đề xuất kết nối (Proposal) bình thường và chuyển bước chính xác.
- [x] Chạy toàn bộ test suite `pnpm test` pass 100%.
