# TASK-04: Trang trạng thái đơn hàng - Sửa Header, Hiển thị Thợ thật, Xử lý ảnh Fake rỗng & Đồng bộ Tên dịch vụ Radar

> **Trạng thái:** ✅ **Hoàn thành (Commit `8359280` & `4bafb94`)**

## 1. Mục tiêu & Hiện tượng

- **Hiện trạng:**
  - **Lỗi 1 (Header chi tiết đơn):** Tại trang chi tiết/trạng thái đơn hàng (`/customer/orders/[id]`), thanh tiêu đề trên cùng (Header / AppBar) từng bị hiển thị nhầm là **"Báo giá thợ"** (`pageTitle = 'Báo giá thợ'`), gây nhầm lẫn với màn hình nhận báo giá của luồng đặt thợ. *(Đã xử lý cơ bản)*
  - **Lỗi 2 (Data Thợ bị mock cứng):** Trong khối thông tin thợ nhận việc (`worker-quote-section`), tên thợ từng bị gắn cứng là `"A CẢNH VĂN"` hoặc `"Nguyễn Văn Thợ"` và đường dẫn xem hồ sơ thợ trỏ cố định vào `RouteNames.CUSTOMER_WORKER_DETAIL('a-canh-van')`, thay vì lấy thông tin thợ thực tế từ `order.workerUserId` hoặc dữ liệu chi tiết của đơn hàng. *(Đã xử lý cơ bản)*
  - **Lỗi 3 (Ảnh fake rỗng):** Trong một số trạng thái đơn hàng hoặc bằng chứng hoàn thành (evidences/media), giao diện render ra các ô ảnh rỗng (khung ảnh màu xám không có hình ảnh hoặc url rỗng/null/undefined). *(Đã xử lý cơ bản)*
  - **Lỗi 4 (MỚI PHÁT SINH - Cần sửa): Sai tên dịch vụ khi xem Radar từ đơn hàng / yêu cầu thực tế:**
    - **Hiện tượng thực tế:** Khách hàng đặt một dịch vụ cụ thể (ví dụ: **"Chăm sóc mẹ và em bé"** hoặc các dịch vụ khác ngoài sửa điện nước), nhưng khi bấm xem màn hình **Radar thợ** (`/customer/booking/radar?requestId=REQ-...`), thanh Header Pill trên cùng của Radar lại hiển thị là **"Dịch vụ tiện ích"** (kèm mã `#REQ-20261105-UHCM`) thay vì hiển thị đúng tên dịch vụ **"Chăm sóc mẹ và em bé"**.
    - **Nguyên nhân gốc rễ (Root Cause):**
      1. Trong `useBookingDraftStore`, giá trị mặc định của `serviceName` là `'Dịch vụ tiện ích'`. Khi người dùng mở Radar từ một yêu cầu đã có hoặc qua deep-link/navigation param, `useBookingDraftStore` không được nạp lại đúng tên dịch vụ thực tế của đơn hàng.
      2. Màn hình Radar (`mobile/src/app/customer/booking/radar.tsx`) khi tải thông tin yêu cầu thực tế từ server qua `OrdersApi.getRequestDetail(activeRequestId)` chỉ đồng bộ địa chỉ, tọa độ, mô tả và lịch hẹn, mà **chưa đồng bộ tên dịch vụ** (`req.service?.name`, `req.serviceName`, hoặc `resolveServiceName(req.serviceId)`).
      3. Ở phần render tiêu đề Header Pill của Radar:
         ```tsx
         <Text className="text-base font-extrabold text-neutral-900 dark:text-white" numberOfLines={1}>
           {serviceName || 'Sửa ống nước'}
         </Text>
         ```
         Code chỉ đọc `serviceName` từ local draft store (vốn đang giữ giá trị mặc định `'Dịch vụ tiện ích'`), không ưu tiên đọc từ dữ liệu server trả về (`serverRequest?.service?.name` hoặc `resolveServiceName(serverRequest?.serviceId)`).

- **Yêu cầu cần xử lý:**
  1. Đổi tiêu đề Header thành **"Chi tiết đơn hàng"** (hoặc **"Trạng thái đơn hàng"**), hiển thị rõ mã đơn hàng ở dòng phụ đề. *(Đã làm)*
  2. Kết nối và hiển thị đúng thông tin của thợ thật từ dữ liệu đơn hàng (tên thợ, ảnh đại diện, mã thợ, link đến đúng ID thợ nhận việc). *(Đã làm)*
  3. Lọc sạch các url ảnh rỗng/lỗi, thêm placeholder hoặc ẩn khối ảnh nếu không có ảnh thực tế hợp lệ. *(Đã làm)*
  4. **[CẦN SỬA] Bảo toàn & Phân giải tên dịch vụ thật trên Radar:**
     - Khi mở Radar từ bất kỳ yêu cầu (`requestId`) hoặc đơn hàng nào, Header Pill phải hiển thị đúng tên dịch vụ đã đặt (ví dụ: *"Chăm sóc mẹ và em bé"*), tuyệt đối không để rơi về tên mặc định *"Dịch vụ tiện ích"*.

---

## 2. Các file ảnh hưởng chính

- `mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx`:
  - `pageTitle`: Đổi `'Báo giá thợ'` -> `'Chi tiết đơn hàng'`.
  - Khối `worker-quote-section`: Đọc từ `order?.worker` hoặc gọi API lấy profile thợ dựa theo `order?.workerUserId`.
  - Khối `order?.evidences`: Thêm bộ lọc `ev.mediaUrl && ev.mediaUrl.trim() !== ''`.
- `mobile/src/app/customer/_layout.tsx`:
  - Header title của route `orders/[id]`: Đổi từ `'Báo giá thợ'` -> `'Chi tiết đơn hàng'`.
- `mobile/src/app/customer/booking/radar.tsx` *(File cần sửa cho Lỗi 4)*:
  - Hàm `useEffect` tải `OrdersApi.getRequestDetail(activeRequestId)`: Đồng bộ `serviceName` vào `useBookingDraftStore` hoặc lưu state `resolvedServiceName`.
  - Khối Header Pill (`mx-2.5 flex-1`):
    - Đổi logic lấy tên dịch vụ: Ưu tiên `serverRequest?.service?.name || serverRequest?.serviceName || resolveServiceName(serverRequest?.serviceId) || serviceName`.
    - Đảm bảo khi `serviceName === 'Dịch vụ tiện ích'`, phải tiếp tục tra cứu theo `serverRequest.serviceId` qua bảng tra cứu `resolveServiceName()` để lấy tên tiếng Việt chuẩn xác.
- `mobile/src/constants/services.ts`:
  - Bổ sung mapping đầy đủ cho mã dịch vụ chăm sóc mẹ & bé (`cham-soc-me-be`, `me-va-be`, `care-mom-baby`, v.v.) nếu server trả về dạng slug hoặc ID.

---

## 3. Các bước thực hiện kỹ thuật chi tiết

### 1. Đã hoàn thành trước đó:
- Đã sửa Header AppBar tại `customer-order-detail-screen.tsx` thành "Chi tiết đơn hàng".
- Đã kết nối hiển thị tên thợ thật qua `displayWorkerName` và `displayWorkerId`.
- Đã lọc ảnh rỗng qua `validEvidences`.

### 2. [DANH SÁCH VIỆC CẦN SỬA] Cho Lỗi 4 (Tên dịch vụ trên Radar):
1. **Tại `mobile/src/app/customer/booking/radar.tsx`:**
   - Trong `useEffect` đồng bộ dữ liệu từ `OrdersApi.getRequestDetail(activeRequestId)`:
     ```tsx
     // Khi nhận được dữ liệu req từ server:
     const realServiceName = req.service?.name 
       || req.serviceName 
       || (req.serviceId ? resolveServiceName(req.serviceId) : undefined);

     if (realServiceName && realServiceName !== 'Dịch vụ tiện ích') {
       useBookingDraftStore.getState().setServiceName(realServiceName);
     }
     ```
   - Tại khối hiển thị Header Pill:
     ```tsx
     // Xác định tên dịch vụ hiển thị ưu tiên:
     const displayServiceName = serverRequest?.service?.name
       || serverRequest?.serviceName
       || (serverRequest?.serviceId ? resolveServiceName(serverRequest?.serviceId) : undefined)
       || (serviceName && serviceName !== 'Dịch vụ tiện ích' ? serviceName : undefined)
       || resolveServiceName(searchParams?.serviceId as string)
       || serviceName
       || 'Dịch vụ tiện ích';

     <Text className="text-base font-extrabold text-neutral-900 dark:text-white" numberOfLines={1}>
       {displayServiceName}
     </Text>
     ```
2. **Tại `mobile/src/constants/services.ts`:**
   - Kiểm tra và đảm bảo các mã dịch vụ về chăm sóc mẹ và bé (ví dụ: `cham-soc-me-va-be`, `me-va-be`, `cham-soc-sau-sinh`) được map chính xác thành `"Chăm sóc mẹ và em bé"`.
3. **Tại các kịch bản test Radar:**
   - Viết test case giả lập mở radar với `requestId` có `serviceId = 'cham-soc-me-be'` hoặc `service.name = 'Chăm sóc mẹ và em bé'` và kiểm tra text hiển thị trên Header Pill đúng là `"Chăm sóc mẹ và em bé"`.

---

## 4. Kịch bản kiểm thử (Test Cases)

- [x] Mở một đơn hàng thực tế từ tab Hoạt động:
  - Header hiển thị chính xác **"Chi tiết đơn hàng"**, không còn hiển thị "Báo giá thợ".
  - Phụ đề hiển thị đúng mã đơn `#...`.
- [x] Kiểm tra phần thợ:
  - Hiển thị đúng thợ đã được chọn từ phiên bidding / khớp việc (hoặc hiển thị fallback thân thiện "Thợ phụ trách").
  - Bấm vào "Xem hồ sơ" trỏ đến đúng trang thợ tương ứng.
- [x] Đơn hàng không có ảnh: Không xuất hiện các ô ảnh rỗng màu xám.
- [x] **Kiểm tra tên dịch vụ trên màn hình Radar (Đã hoàn thành - Commit `4bafb94`):**
  - Khách hàng tạo hoặc mở yêu cầu dịch vụ **"Chăm sóc mẹ và em bé"** (ví dụ: `#REQ-20261105-UHCM`).
  - Mở màn hình Radar tìm thợ (`/customer/booking/radar?requestId=...`).
  - **Kết quả mong đợi:** Khối Header Pill phía trên cùng hiển thị đúng tên **"Chăm sóc mẹ và em bé"**, **KHÔNG** bị fallback thành *"Dịch vụ tiện ích"*.
  - Bộ test suite `customer-booking-radar-service-name.test.tsx` tự động kiểm thử toàn bộ các nhánh phân giải tên dịch vụ pass 100%.
