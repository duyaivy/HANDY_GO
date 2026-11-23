# TASK-09: Radar - Xử lý Thợ báo giá lại (Re-bid khi đang có đề xuất chờ)

> **Trạng thái:** ⏸️ **Tạm chưa làm (Để lại thực hiện sau theo yêu cầu)**

---

## 1. Mục tiêu & Hiện tượng

### 1.1. Hiện tượng thực tế:
1. Khách hàng bấm **"Chọn thợ"** gửi lời mời nhận việc (Booking Proposal) cho Thợ 1 với một mức giá ban đầu (ví dụ: `69.696đ`).
2. Nút của Thợ 1 chuyển sang trạng thái: **"Đang chờ thợ..."** (bị làm mờ / disabled).
3. Thợ 1 **chưa chấp nhận** lời mời nhận việc đó. Trong phiên đấu thầu, **Thợ 1 gửi lại một báo giá mới với mức giá thấp hơn** (ví dụ: giảm xuống còn `29.999đ`, hiển thị nhãn *"Giá tốt nhất"*).
4. Màn hình của khách hàng cập nhật giá mới `29.999đ` của Thợ 1, nhưng nút hành động của Thợ 1 **vẫn bị khóa cứng thành "Đang chờ thợ..."** (do hệ thống vẫn đang ghi nhận Thợ 1 nằm trong danh sách đề xuất pending).
5. **Hậu quả:** Khách hàng thấy thợ đã giảm giá tốt hơn nhưng **không thể bấm chấp nhận mức giá mới thấp hơn đó**, cũng không có nút để hủy lời mời cũ, dẫn đến luồng thương lượng bị tắc nghẽn.

---

## 2. Phân tích nguyên nhân kỹ thuật (Root Cause)

1. **Cơ chế kiểm tra `isWorkerProposed` quá cứng nhắc:**
   - Trong `mobile/src/app/customer/booking/radar.tsx`:
     ```tsx
     disabled={isSubmitting || isWorkerProposed(worker.id)}
     ```
   - `isWorkerProposed` được tính từ hook `usePendingProposals`, kiểm tra:
     ```ts
     const proposedWorkerIds = new Set(proposals.filter(p => p.status === 'proposed').map(p => p.workerUserId));
     ```
   - Bất kể thợ có gửi báo giá mới (`sourceBidId` mới hoặc giá `worker.price` thấp hơn), chừng nào proposal cũ còn ở trạng thái `status === 'proposed'`, `isWorkerProposed(worker.id)` luôn trả về `true` ➔ Nút bị vô hiệu hóa và cố định nhãn `"Đang chờ thợ..."`.
2. **Thiếu cơ chế ghi đè đề xuất (Proposal Supersede) trên giao diện:**
   - API Backend đã có sẵn trường `supersedesProposalId` trong payload `CreateBookingProposalPayload` để thay thế một đề xuất cũ bằng đề xuất mới.
   - Tuy nhiên, giao diện mobile chưa bắt sự kiện thợ re-bid để kích hoạt cơ chế `supersedesProposalId`.
3. **Thiếu tính năng "Rút lại lời mời" (Cancel Pending Proposal):**
   - Khách hàng không thể chủ động hủy bỏ một lời mời đang chờ phản hồi nếu thợ chần chừ hoặc báo giá lại.

---

## 3. Kế hoạch giải quyết toàn diện (Detailed Solution Architecture)

### 💡 Phương án kết hợp tối ưu (Hybrid Best Practice):

#### Bước 1: Nhận diện trạng thái "Thợ vừa báo giá lại" (Re-bid Detection)
- Trong component Radar, khi render từng thẻ thợ trong danh sách báo giá (`mappedBids`):
  - Tra cứu proposal đang chờ của thợ này:
    ```tsx
    const pendingProposal = requestProposals?.find(
      p => p.workerUserId === worker.id && p.status === 'proposed'
    );
    ```
  - Kiểm tra xem thợ có gửi báo giá mới khác với giá đang chờ hay không:
    ```tsx
    const hasNewerBid = Boolean(
      pendingProposal &&
      worker.sourceBidId &&
      (worker.price !== Number(pendingProposal.agreedPrice) || worker.sourceBidId !== pendingProposal.sourceBidId)
    );
    ```

#### Bước 2: Nâng cấp UX nút hành động tại Thẻ Thợ
- **Trường hợp A: Đang chờ thợ thông thường (Chưa có giá mới):**
  - Hiển thị: Nút xám `"Đang chờ thợ..."` kèm một nút nhỏ/icon phụ: **"Hủy lời mời"** (hoặc nút bấm *"Rút lại"*).
  - Khi bấm *"Hủy lời mời"*: Gọi API hủy proposal (`OrdersApi.cancelProposal(pendingProposal.id)`), giải phóng thợ về trạng thái có thể chọn lại.
- **Trường hợp B: Thợ đã báo giá lại với giá mới (Đặc biệt là khi giá thấp hơn):**
  - **Mở khóa nút bấm ngay lập tức!**
  - Nút chuyển sang màu xanh lá hoặc cam nổi bật với nhãn:
    👉 **"Nhận giá mới"** (hoặc **"Đổi sang 29.999đ"**).
  - Phía trên hiển thị thêm dòng badge sinh động: `⚡ Thợ vừa giảm giá!`.
  - Khách hàng bấm vào nút này sẽ mở hộp thoại xác nhận:
    *"Thợ Nguyễn Văn Một đã giảm giá xuống 29.999đ (trước đó là 69.696đ). Bạn có muốn cập nhật lời mời với giá mới này không?"*

#### Bước 3: Gửi Proposal mới với `supersedesProposalId`
- Khi khách hàng bấm **"Nhận giá mới"**:
  - Gọi API `OrdersApi.createProposal` với payload:
    ```tsx
    const proposalPayload: CreateBookingProposalPayload = {
      serviceRequestId: targetRequestId,
      workerUserId: worker.id,
      selectionSource: 'bid',
      sourceBidId: worker.sourceBidId,
      agreedPrice: worker.price, // Mức giá mới: 29.999đ
      agreedScope: serviceName || description || `Khách hàng chấp nhận giá mới ${worker.priceText} của thợ ${worker.name}`,
      scheduledAt: scheduledAt || undefined,
      supersedesProposalId: pendingProposal.id, // ID của proposal cũ cần ghi đè
    };
    ```
  - Backend tự động hủy proposal cũ và kích hoạt proposal mới với giá 29.999đ.
  - Client làm mới queries `request-proposals`, cập nhật trạng thái đồng bộ mượt mà.

---

## 4. Các file ảnh hưởng khi triển khai

1. `mobile/src/app/customer/booking/radar.tsx`:
   - Xác định `pendingProposal` và cờ `hasNewerBid` cho từng thẻ candidate.
   - Thêm nút / trạng thái UI:
     - Nút `"Nhận giá mới"` khi `hasNewerBid === true`.
     - Nút hủy/rút lại đề xuất đang chờ.
   - Truyền `supersedesProposalId` vào `handleSelectWorkerAndSendProposal`.
2. `mobile/src/features/orders/hooks/use-pending-proposals.ts`:
   - Cung cấp hàm `cancelPending(workerId)` hoặc cập nhật để không chặn khi thợ có re-bid mới.
3. `mobile/src/features/orders/api/orders.api.ts`:
   - Đảm bảo endpoint `cancelProposal` (nếu cần cho nút rút lại đề xuất) sẵn sàng.
4. `mobile/src/app/customer/booking/__tests__/customer-booking-radar-bids-sorting.test.tsx`:
   - Viết test case mô phỏng trường hợp thợ gửi báo giá mới khi đang có proposal pending.

---

## 5. Kịch bản kiểm thử (Test Cases khi kích hoạt triển khai)

- [ ] Khách gửi lời mời nhận việc cho Thợ 1 với giá ban đầu 69.696đ.
- [ ] Nút Thợ 1 chuyển sang "Đang chờ thợ...".
- [ ] Thợ 1 gửi báo giá mới trong cùng request với giá 29.999đ.
- [ ] Nút của Thợ 1 được mở khóa và chuyển thành **"Nhận giá mới"** (hoặc hiển thị rõ giá mới 29.999đ).
- [ ] Khách bấm "Nhận giá mới", hệ thống gửi thành công proposal mới ghi đè proposal cũ (`supersedesProposalId`).
- [ ] Nút chuyển sang "Đang chờ thợ..." với mức giá mới 29.999đ.

