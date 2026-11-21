# TASK-04: Sửa lỗi hủy yêu cầu/đơn - Không mở lại bid

- **Mục yêu cầu:** Mục 4 (HG-63)
- **Giai đoạn:** Giai đoạn 1 (Ưu tiên cao nhất)
- **Độ ưu tiên:** Tối khẩn cấp
- **Trạng thái:** Hoàn thành

---

## 1. Mục tiêu & Phạm vi

### Mục tiêu
Sửa dứt điểm lỗi nghiêm trọng: Khách hàng nhấn hủy yêu cầu tìm thợ hoặc hủy đơn hàng, giao diện báo hủy nhưng sau khi tải lại trang hoặc đăng nhập lại thì hệ thống vẫn tiếp tục mở phiên đấu thầu (bidding) hoặc đơn hàng vẫn ở trạng thái chờ. Đồng thời loại bỏ hoàn toàn các ID giả (fallback demo) và cơ chế báo thành công giả tạo (fake success notification) khi API thất bại.

### Phạm vi chốt
- **Bao gồm:**
  - Màn hình tìm thợ / Radar: `mobile/src/app/customer/booking/radar.tsx`.
  - Hộp thoại hủy đơn hàng: `mobile/src/features/orders/customer/screens/customer-order-cancel-dialog.tsx`.
  - Hook và API đồng bộ trạng thái đơn: `mobile/src/features/orders/hooks/use-customer-orders.ts`, `mobile/src/features/orders/api/orders.api.ts`.
  - Kiểm tra tính nhất quán với backend: transaction cập nhật request/proposal, outbox event hủy và bidding consumer đóng round.
- **Ngoại trừ:** Không tự ý viết lại toàn bộ kiến trúc sự kiện backend nếu kiểm thử không phát hiện lỗi trong handler nghiệp vụ hiện hữu.

---

## 2. Hiện trạng & Bằng chứng mã nguồn

### Bằng chứng 1: `mobile/src/app/customer/booking/radar.tsx`
1. **Bỏ qua lỗi API trong khối `catch` (Swallowed Error):**
   ```tsx
   // Dòng 158-168:
   try {
     if (activeRequestId && !activeRequestId.startsWith('req-mock')) {
       await OrdersApi.cancelRequest(activeRequestId);
     }
   }
   catch {
     // Bị rỗng! Lỗi bị nuốt chửng, không có thông báo cho người dùng
   }
   // VẪN TIẾP TỤC RESET DRAFT VÀ CHUYỂN TAB THÀNH CÔNG:
   useBookingDraftStore.getState().resetDraft();
   router.replace({ pathname: RouteNames.CUSTOMER_ORDERS, params: { tab: 'Cancelled' } });
   ```
   *Hậu quả:* Khi mạng chập chờn, API timeout hoặc backend trả về lỗi 500/400, ứng dụng vẫn tự động xóa draft và chuyển sang tab Cancelled, đánh lừa người dùng rằng đơn đã hủy!
2. **ID Fallback cứng:**
   Có sự xuất hiện của ID dự phòng như `'00225617'` hoặc tự động pick bừa yêu cầu gần nhất trong store/cache khi không có ID trên route.
3. **Chưa khóa click lặp (Double Submission):**
   Chưa có trạng thái `isCancelling` để disable nút, người dùng bấm nhiều lần gây race condition.

### Bằng chứng 2: `mobile/src/features/orders/customer/screens/customer-order-cancel-dialog.tsx`
1. **ID Fallback demo:**
   ```tsx
   // Dòng 18:
   const orderId = propOrderId || searchParams?.id || 'demo-001';
   ```
2. **Báo thành công giả khi API thất bại:**
   ```tsx
   // Dòng 33-36:
   catch {
     Alert.alert('Thông báo', 'Đã ghi nhận yêu cầu hủy đơn.', [
       { text: 'Đóng', onPress: () => router.back() },
     ]);
   }
   ```
   *Hậu quả:* Khi API trả lỗi 4xx/5xx, hệ thống lừa người dùng rằng "Đã ghi nhận yêu cầu hủy đơn" trong khi trên server đơn hàng vẫn hoàn toàn nguyên vẹn!

---

## 3. Thiết kế giải pháp kỹ thuật

### 3.1. Xử lý định danh ID rõ ràng tại Radar
1. **Ưu tiên lấy ID:** Lấy `requestId` từ route search params trước (`const { requestId } = useLocalSearchParams<{ requestId?: string }>()`). Nếu route không có mới lấy `createdRequestId` từ `useBookingDraftStore`.
2. **Tuyệt đối không dùng ID giả:** Xóa bỏ hoàn toàn fallback `'00225617'` và `'demo-001'`.
3. **Xử lý khi thiếu ID:**
   - Nếu cả route params và store đều không có ID hợp lệ: Chặn ngay việc mở dialog hủy hoặc gọi API.
   - Hiển thị thông báo rõ ràng: "Không tìm thấy mã yêu cầu dịch vụ. Vui lòng quay lại danh sách yêu cầu." kèm nút điều hướng về `CUSTOMER_ORDERS`.
4. **Tránh ghép nhầm dữ liệu:** Tải chi tiết request theo đúng ID từ server (`OrdersApi.getRequestById(requestId)`). Không lấy ID của yêu cầu mở lại ghép với dữ liệu draft đang dở dang của một yêu cầu khác.

### 3.2. Cải tiến quy trình hủy (Cancel Mutation & Error Handling)
1. **Chống click lặp:** Thêm state `isCancelling = true`, vô hiệu hóa nút bấm và hiển thị spinner/text "Đang xử lý hủy...".
2. **Gọi đúng API:**
   - Hủy yêu cầu tìm thợ (Service Request): Gọi `OrdersApi.cancelRequest(requestId, reason)`.
   - Hủy đơn hàng đã chốt (Order): Gọi `OrdersApi.cancelOrder(orderId, reason)`.
3. **Xử lý khi API thất bại:**
   - BẮT BUỘC giữ lại màn hình hiện tại và giữ nguyên thông tin draft/lý do.
   - Hiển thị Alert hoặc Toast thông báo lỗi tiếng Việt (ví dụ: "Không thể hủy yêu cầu lúc này. Vui lòng kiểm tra kết nối mạng và thử lại.").
   - KHÔNG gọi `resetDraft()` và KHÔNG chuyển tab khi chưa nhận xác nhận thành công từ server.
4. **Xử lý Timeout & Xung đột trạng thái (Conflict 409 / Network Timeout):**
   - Nếu request bị timeout hoặc trả về 409 Conflict: Tự động gọi GET chi tiết request/order để kiểm tra trạng thái thực tế trên server:
     - Nếu trạng thái đã là `CANCELLED`: Xử lý như một lượt hủy thành công.
     - Nếu trạng thái đã chuyển sang `IN_PROGRESS` (thợ đã chốt đơn cùng tích tắc): Thông báo cho khách "Yêu cầu đã được thợ tiếp nhận, không thể hủy tự động." và tải lại giao diện chi tiết mới.
     - Nếu vẫn ở trạng thái chờ mà API báo lỗi: Giữ nguyên giao diện cho khách thử lại.
5. **Đồng bộ Cache & Refetch:**
   - Khi hủy thành công:
     - Cập nhật trực tiếp cache React Query của chi tiết đơn sang trạng thái `CANCELLED`.
     - Invalidate query key `['customer-orders']` và `['customer-requests']`.
     - Reset draft trong store (`resetDraft()`).
     - **Tách biệt kết quả:** Nếu lệnh hủy thành công trên server nhưng sau đó việc refetch lại danh sách bị lỗi mạng, **vẫn phải ghi nhận là hủy thành công** và chuyển trang, chỉ hiển thị banner cảnh báo "Không thể cập nhật danh sách mới nhất, vui lòng vuốt để tải lại" kèm nút thử lại; **tuyệt đối không gửi lại lệnh hủy**.

### 3.3. Kiểm tra tính toàn vẹn Backend
Kiểm tra chu trình xử lý sự kiện phía backend theo tài liệu thiết kế:
1. Khi endpoint cancel request được gọi:
   - Database update: Cập nhật trạng thái `ServiceRequest` thành `CANCELLED` và các proposal liên quan thành `WITHDRAWN` trong cùng một Database Transaction.
   - Outbox Event: Ghi sự kiện `RequestCancelledEvent` vào bảng Outbox trong cùng transaction đó.
2. Bidding Consumer:
   - Nhận sự kiện hủy từ RabbitMQ/Event Bus -> đóng bidding round ngay lập tức, từ chối mọi lượt đặt giá (bid) đến sau.
   - Đảm bảo tính Idempotent: Khi nhận lại sự kiện hủy trùng lặp, không được mở lại round hoặc crash consumer.

---

## 4. Kế hoạch kiểm thử & Nghiệm thu

### Ca kiểm thử bắt buộc
1. **Hủy thành công:** Nhấn hủy -> API trả 200 OK -> Xóa draft -> Chuyển sang tab "Đã hủy" -> Reload lại app / đăng nhập lại -> Đơn vẫn ở trạng thái "Đã hủy", không hề mở lại bidding.
2. **API lỗi mạng / 500:** Bật chế độ máy bay hoặc mock 500 -> Báo lỗi tiếng Việt -> Draft vẫn còn nguyên -> Không chuyển tab.
3. **Thiếu Request ID:** Thử vào màn hình radar mà không có ID -> Chặn thao tác hủy, hiện thông báo điều hướng về danh sách đơn.
4. **Bấm liên tục (Double Click):** Bấm nút hủy nhiều lần thật nhanh -> Chỉ duy nhất 1 request HTTP được gửi đi.
5. **Xung đột khi server đã hủy nhưng response bị mất:** Mock timeout nhưng server thực chất đã cancel -> Cơ chế đối soát GET xác nhận đã `CANCELLED` -> Hiển thị hủy thành công.
6. **Lỗi tải lại danh sách sau khi hủy:** Giả lập API hủy 200 OK, nhưng API `getOrders` sau đó 500 -> Ứng dụng vẫn báo hủy thành công, không gửi lại request hủy lần 2.

### Lệnh chạy test liên quan
```bash
cd mobile
pnpm test customer-orders.test.tsx
pnpm test customer-order-cancel-dialog.test.tsx
```

---

## 5. Checklist thực hiện

- [x] Sửa `radar.tsx`: Ưu tiên lấy ID từ searchParams, xóa bỏ ID fallback cứng (`00225617`).
- [x] Sửa `radar.tsx`: Thêm `isCancelling`, khóa nút bấm khi đang gửi request.
- [x] Sửa `radar.tsx`: Xóa khối `catch` nuốt lỗi, xử lý hiển thị lỗi thật bằng tiếng Việt.
- [x] Sửa `customer-order-cancel-dialog.tsx`: Xóa fallback `demo-001`.
- [x] Sửa `customer-order-cancel-dialog.tsx`: Xóa thông báo giả "Đã ghi nhận yêu cầu", hiển thị lỗi thật.
- [x] Cài đặt cơ chế kiểm tra lại trạng thái (GET fallback) khi gặp lỗi timeout / 409 conflict.
- [x] Tách biệt kết quả hủy thành công với lỗi refetch danh sách.
- [x] Kiểm tra backend transaction và outbox event đóng bidding round.
- [x] Cập nhật unit test và integration test.
- [x] Chạy `pnpm test` và `pnpm typecheck`.

