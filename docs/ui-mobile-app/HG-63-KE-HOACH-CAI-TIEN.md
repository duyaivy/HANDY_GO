# HG-63 — Đánh giá và kế hoạch cải tiến

Ngày lập: 30/10/2026. Đây là kế hoạch, chưa thực hiện sửa lỗi.

## 1. Kết luận đánh giá

**Kế hoạch hiện tại đúng hướng và bao phủ đủ 8 yêu cầu, nhưng cần bổ sung trước khi giao triển khai.** Điểm tốt là ưu tiên lỗi hủy, không giả lập phần trăm upload và yêu cầu kiểm tra gesture trên thiết bị thật.

Nguồn đối chiếu: [kế hoạch ban đầu](./HG-63-KE-HOACH-SUA-LOI.md), [tài liệu yêu cầu HG-63](./HG-63-UI_MOBILE_APP.pdf) và mã nguồn hiện tại trong repository. Nội dung hai tài liệu được dùng làm nguồn đánh giá; phạm vi thực hiện theo các quyết định đã chốt với người dùng ở mục 2.

Các điểm cần sửa trong kế hoạch:

| Mức độ | Thiếu sót | Điều chỉnh cần thiết |
|---|---|---|
| Cao | Mới tập trung lỗi hủy tại radar. Dialog hủy đơn riêng cũng báo “Đã ghi nhận” khi API thất bại và có ID dự phòng `demo-001`. | Sửa cả hai luồng, dùng đúng API request/order và không báo thành công giả. |
| Cao | Chưa chốt cách xử lý khi hủy thành công nhưng refetch lỗi. | Kết quả hủy dựa trên server; lỗi đồng bộ danh sách không biến thành lỗi hủy. |
| Cao | Loading chuyển app chưa xử lý điều hướng trùng. `AppSwitchCard` vừa gọi callback của màn hình cha vừa tự `router.replace`; callback cũng điều hướng. | Gom thao tác chuyển mode và điều hướng vào một đầu mối. |
| Vừa | Chưa chỉ đúng component guest khách: `CustomerGuestOverview` dùng `View`, footer absolute và padding cuối cố định. | Sửa tại component thực sự render; tránh thêm safe area vào nhánh không chạy. |
| Vừa | Chưa cụ thể hóa cơ chế đóng bid và kiểm thử hiện có. | Kiểm tra transaction → outbox → bidding consumer; cập nhật test radar đang kỳ vọng tiếng Anh và nội dung placeholder. |

Bằng chứng chính trong mã nguồn (đường dẫn tính từ thư mục gốc repository):

- `mobile/src/app/customer/booking/radar.tsx`: ID dự phòng và xử lý hủy bỏ qua lỗi.
- `mobile/src/features/orders/customer/screens/customer-order-cancel-dialog.tsx`: ID demo và thông báo đã ghi nhận khi API lỗi.
- `mobile/src/features/profile/components/app-switch-card.tsx`: gọi callback chuyển mode rồi tự điều hướng thêm.

Đây là đánh giá từ tài liệu và mã nguồn; chưa tái hiện trên thiết bị hoặc chạy kiểm thử.

## 2. Phạm vi và quyết định đã chốt

- Tiến độ upload **chỉ áp dụng ảnh đặt việc**; KYC và ảnh minh chứng nằm ngoài đợt này theo lựa chọn của người dùng.
- Giữ nhận diện hiện tại: amber cho khách, blue cho thợ; cải thiện bố cục và tương tác, không thiết kế lại thương hiệu.
- Xử lý đủ tám mục HG-63. Sửa backend khi kiểm thử chứng minh lỗi trong luồng hủy hiện hữu; không mặc định viết lại transaction hoặc cơ chế sự kiện.
- Chia triển khai thành bốn phần: **hủy + tiếng Việt → safe area + radar → upload + chuyển app → chọn app + màu tương tác**.
- Đã phân tách thành 8 file task chi tiết để triển khai độc lập tại thư mục [`./tasks/`](./tasks/README.md).

## 3. Thay đổi triển khai

### A. Hủy yêu cầu/đơn và tiếng Việt — mục 4, 5
*(Chi tiết từng task: [TASK-04](./tasks/TASK-04-huy-yeu-cau-va-dong-bid.md), [TASK-05](./tasks/TASK-05-thong-nhat-tieng-viet-luong-huy.md))*

- Radar lấy ID từ route, sau đó mới dùng `createdRequestId` nếu route không có ID. Bỏ ID giả và cơ chế tự chọn yêu cầu gần nhất khi thực hiện thao tác. Thiếu ID thì chặn hủy/chọn thợ và dẫn về danh sách để chọn đúng yêu cầu.
- Tải chi tiết theo ID để xác định trạng thái, tọa độ và thông tin hiển thị. Không ghép ID của yêu cầu được mở lại với dữ liệu draft của yêu cầu khác.
- Dùng mutation hủy request riêng; dialog hủy order tái sử dụng mutation order hiện có. Khóa gửi lặp, giữ draft/lý do khi thất bại, chỉ dọn dữ liệu tương ứng sau khi xác nhận đã hủy.
- Khi timeout hoặc xung đột trạng thái, GET lại đúng đối tượng: nếu đã `cancelled`, xử lý như thành công; nếu đã chuyển trạng thái khác, cập nhật UI và giải thích bằng tiếng Việt; nếu chưa xác minh được, giữ dữ liệu và cho kiểm tra lại.
- Sau thành công, cập nhật cache chi tiết và invalidate nhóm `orders`. Nếu tải lại danh sách lỗi, vẫn ghi nhận hủy thành công và hiển thị lỗi tải danh sách có nút thử lại; không gửi lại lệnh hủy.
- Kiểm tra backend hiện có: trạng thái request và proposal cập nhật trong transaction, sự kiện hủy được ghi vào outbox, bidding consumer đóng round và xử lý bid. Kiểm tra phát lại sự kiện không mở lại phiên đã hủy.
- Việt hóa toàn bộ modal và nhánh hủy, gồm tiêu đề, chi phí, địa điểm, trạng thái chờ và lỗi. Ánh xạ từ `ApiError.code/kind`; không đưa raw message tiếng Anh lên UI.

### B. Safe area và bản đồ — mục 3, 6
*(Chi tiết từng task: [TASK-03](./tasks/TASK-03-safe-area-guest.md), [TASK-06](./tasks/TASK-06-khoa-tam-ban-do-radar.md))*

- Bọc guest khách bằng `Screen` có safe area; đặt footer thành phần tử cùng cấp sau `ScrollView`, bỏ absolute và padding `100` dùng để né footer.
- Guest thợ đã dùng `Screen safeArea`: kiểm tra thực tế trước khi sửa. Guest đang ẩn tab bar nên không cộng thêm chiều cao tab bar.
- Tận dụng `SafeAreaProvider` do Expo Router hiện có cung cấp; không thêm provider trùng hoặc thay mặc định toàn bộ màn hình.
- Mở rộng `HandyMap` với tùy chọn gesture riêng, mặc định kế thừa `interactive`. Radar tắt pan một ngón, pinch-pan, rotate và pitch; giữ pinch-zoom. SDK đang cài có `gestureSettings.pinchPanEnabled`, cần dùng cùng cấu hình pan.
- Thêm chế độ khóa tâm dành cho radar: tâm lấy từ chi tiết request, giữ zoom hiện tại khi hiệu chỉnh camera; bỏ qua sự kiện hiệu chỉnh của chính mình để tránh vòng lặp. Thiếu tọa độ thì báo chưa có vị trí, không hiển thị tọa độ mẫu như vị trí thật.
- Giữ vòng quét làm hiệu ứng trang trí và bỏ nhãn km cố định vì chúng không biểu diễn đúng khoảng cách khi zoom. Các overlay không chặn thao tác bản đồ.

### C. Tiến độ ảnh đặt việc — mục 1
*(Chi tiết task: [TASK-01](./tasks/TASK-01-tien-do-upload-anh.md))*

- Giữ `uploadImage` trả `Promise<string>`; bổ sung tham số options tùy chọn gồm callback tiến độ và `AbortSignal`, truyền qua cấu hình `ApiClient.post` hiện có.
- Quản lý từng ảnh bằng ID ổn định với trạng thái chờ, đang tải, đang xử lý và hoàn tất. Upload tuần tự; giới hạn tổng số ảnh ở mức 5, tính cả ảnh chờ tải.
- Hiển thị preview và vòng tiến độ ngay trên thumbnail. Có tổng byte hợp lệ thì hiện phần trăm; thiếu tổng thì dùng spinner. Khi gửi đủ byte nhưng chưa nhận URL, hiển thị “Đang xử lý”.
- Chỉ lưu URL thành công vào dữ liệu gửi booking. Chặn tiếp tục khi còn ảnh chờ/tải/xử lý; lỗi thì bỏ ảnh lỗi và thông báo tiếng Việt.
- Xóa ảnh hoặc rời màn hình phải hủy tác vụ tương ứng và bỏ qua callback đến muộn, tránh ghi URL vào draft mới. Giữ các URL đã tải thành công.

### D. Chuyển app, màn hình chọn app và màu tương tác — mục 7, 2, 8
*(Chi tiết từng task: [TASK-07](./tasks/TASK-07-loading-chuyen-app.md), [TASK-02](./tasks/TASK-02-man-hinh-welcome-chon-app.md), [TASK-08](./tasks/TASK-08-mau-tuong-tac-cai-dat.md))*

- Tạo một hàm chuyển mode dùng chung cho thẻ profile, màn hình xác nhận và chip chuyển guest. Hàm kiểm tra quyền, cập nhật mode và điều hướng đúng một lần. `AppSwitchCard` gọi callback, không tự điều hướng thêm.
- Đặt trạng thái chuyển và overlay ở root để tồn tại qua navigation; không persist trạng thái loading. Cho overlay xuất hiện trước khi bắt đầu chuyển.
- Hoàn tất khi màn hình đích đã focus và layout lần đầu; không chờ tất cả API tải xong. Màn hình đích tự xử lý loading/error dữ liệu.
- Lỗi điều hướng phải dọn trạng thái. Sau 10 giây chưa nhận tín hiệu đích, chuyển overlay sang thông báo lỗi với lựa chọn thử lại hoặc quay về mode trước; đây là giới hạn phát hiện lỗi, không phải timer giả lập thành công.
- Welcome giữ logo, hai thẻ Khách hàng/Thợ và nút tiếp tục; bố cục một cột, nội dung cuộn được, trạng thái chọn có viền và dấu chọn. Giữ cách nhớ vai trò hiện tại, hỗ trợ chữ lớn và vùng chạm tối thiểu 44.
- Các dòng cài đặt khách dùng amber nhạt khi hover/pressed và amber trầm ở dark mode; giữ riêng màu hành động nguy hiểm, disabled và focus. Cài đặt thợ hiện là placeholder, không mở rộng thành tính năng mới trong HG-63.

## 4. Kiểm thử và điều kiện nghiệm thu

| Nhóm | Tình huống bắt buộc |
|---|---|
| Hủy | Thành công; API lỗi; thiếu ID; route và draft khác ID; bấm lặp; server đã hủy nhưng response mất; refetch lỗi sau thành công; reload/đăng nhập lại; xung đột với tạo order. |
| Backend | Request đã hủy và proposal được rút; outbox được xử lý; bidding round đóng; sự kiện trùng hoặc publish đến muộn không mở lại round. |
| Upload | Một/nhiều ảnh; giới hạn 5; thiếu tổng byte; 100% trước response; lỗi giữa hàng đợi; xóa ảnh đang tải; rời màn hình; không gửi local URI. |
| Chuyển app | Hai chiều; guest/tài khoản đủ quyền; thiếu quyền; đúng một lần điều hướng; bấm liên tục; màn hình đích lỗi hoặc không sẵn sàng. |
| UI | Android gesture/3 nút, iPhone có home indicator; màn hình nhỏ, chữ lớn, sáng/tối; kéo và pinch zoom không lệch tâm; hover web và nhấn native. |

- Cập nhật các test booking/API, radar, dialog hủy, profile, guest, welcome và `HandyMap`; thay kỳ vọng tiếng Anh/placeholder bằng hành vi sản phẩm thực tế.
- Chạy lint, type-check và bộ test mobile. Nếu thay backend, chạy test service liên quan, typecheck và lint theo quy định repository.
- Kiểm thử gesture và animation trên native build; mock không đủ chứng minh hai hành vi này.
- Bàn giao bảng đối chiếu đủ 8 mục, kết quả test, thiết bị/OS và ảnh hoặc video trước–sau. Mục chưa kiểm tra trên thiết bị phải ghi rõ chưa nghiệm thu.
