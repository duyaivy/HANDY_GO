# PR #62 — P2 — Bid có giá không hợp lệ vẫn gửi được đề xuất

**Review:** [Comment gốc](https://github.com/duyaivy/HANDY_GO/pull/62#discussion_r4505627802)
**Nhánh:** `bugfix/HG-63-ui_mobile_app-followup` → `main`
**Commit được review:** `1052bca2a767495168b2f51ec6f7a174c5058468`
**Trạng thái:** Đã hoàn thành xử lý và kiểm chứng đầy đủ (09/11/2026).
- Thêm utility `isValidBidPrice(price)` tại `mobile/src/features/orders/utils/bid-price.ts`, quy định chặt chẽ: giá phải là số hữu hạn và lớn hơn 0 (> 0), loại trừ `null`, `undefined`, `''`, `boolean`, `NaN`, `<= 0`.
- Cập nhật mapping candidates trong `radar.tsx`: gắn cờ `isPriceValid`, hiển thị nhãn `Không có giá hợp lệ` (thay cho `Báo giá thỏa thuận`), subtitle `Báo giá không hợp lệ`, vô hiệu hóa nút chọn với nhãn `Không thể chọn` và visual cue mờ.
- Xếp các bid không hợp lệ về cuối danh sách và không bao giờ gắn tag `Giá tốt nhất`.
- Thêm lớp phòng thủ tại hàm `handleSelectWorkerAndSendProposal`: kiểm tra lại giá bid trước khi gửi đề xuất; nếu không hợp lệ sẽ bật Alert cảnh báo và ngắt sớm mà không gọi API `createProposal`.
- Backend (`order-service`): Cập nhật `@Min(1)` trên `CreateBookingProposalDto.agreedPrice` và runtime check ném `AppException(HttpStatus.BAD_REQUEST)` trong `BookingProposalsService.create()`.
- Kiểm thử: 100% test pass bao gồm 4 unit tests trong `bid-price.test.ts`, 2 integration tests trong `customer-booking-radar-bids-price.test.tsx`, cập nhật `customer-booking-radar-bids-sorting.test.tsx`, toàn bộ 29/29 tests radar, và 301/301 tests `apps/order-service`.

**Vị trí:** [`radar.tsx`](../../mobile/src/app/customer/booking/radar.tsx), mapping bid quanh dòng 668 và tạo proposal quanh dòng 736–746.
**Hiện trạng:** Giá `null`, `0`, `NaN` hoặc thiếu được map thành `price: 0`, nhưng luồng chọn bid vẫn đưa `worker.price` vào `agreedPrice`. Backend có thể từ chối đề xuất giá 0 sau khi người dùng đã thao tác chọn thợ.

**Hướng xử lý:**

1. Xác định bid có giá hợp lệ bằng một quy tắc dùng chung: giá là số hữu hạn và lớn hơn 0. Giữ trạng thái giá không hợp lệ tách biệt với giá thật, thay vì biến nó thành một giá có thể submit.
2. Hiển thị nhãn `Không có giá hợp lệ` cho bid lỗi và vô hiệu hóa chọn/gửi proposal (hoặc loại bid đó khỏi danh sách có thể chọn). Tránh nhãn `Báo giá thỏa thuận` nếu bid không được phép tiếp tục.
3. Kiểm tra lại giá ngay trong `handleSelectWorkerAndSendProposal()` trước khi gọi API; giữ validation ở backend như lớp bảo vệ cuối.

**Tiêu chí nghiệm thu:** Bid có `amount: null`, `0`, `NaN`, thiếu hoặc âm không tạo request `createProposal`; bid có giá dương hợp lệ gửi đúng `agreedPrice`. UI nêu rõ vì sao bid lỗi không thể chọn.
