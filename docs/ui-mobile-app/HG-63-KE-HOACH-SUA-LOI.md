# Kế hoạch xử lý HG-63 - UI mobile app

Nguồn: `HG-63-UI_MOBILE_APP.pdf`, gồm 8 yêu cầu. Đây là kế hoạch, chưa thực hiện sửa lỗi. Các nhận định về nguyên nhân cần xác nhận bằng cách tái hiện trên thiết bị và kiểm tra phản hồi API. Đường dẫn bên dưới tính từ thư mục gốc repository.

## Thứ tự thực hiện đề xuất

1. Tái hiện và sửa hủy yêu cầu (mục 4): tránh báo thành công sai và mất dữ liệu.
2. Safe area (3), bản đồ radar (6), tiếng Việt (5): xử lý hành vi dễ quan sát.
3. Upload ảnh (1), chuyển chế độ (7), màn hình chọn ứng dụng (2), màu tương tác (8).
4. Chạy kiểm tra chung và kiểm thử thực tế trên Android/iOS; xác nhận lại giao diện với người giao task nếu chưa có thiết kế mẫu.

## 1. Tiến độ tải ảnh ngay trên ảnh

**Hiện trạng:** `mobile/src/features/orders/customer/screens/customer-booking-screen.tsx` có `isUploading`, `uploadSingleImage`, thumbnail và chặn tiếp tục khi upload; `mobile/src/features/orders/api/orders.api.ts` có `uploadImage`. Luồng KYC (`mobile/src/services/identity/identity-api.ts`) và ảnh minh chứng (`mobile/src/features/orders/worker/screens/worker-job-complete-screen.tsx`) cũng có upload: cần xác nhận phạm vi thực tế, tối thiểu xử lý ảnh đặt việc.

**Cách làm:**
1. Tái hiện chọn nhiều ảnh/chụp ảnh, ghi nhận thứ tự upload, ảnh đang hiển thị và nút tiếp tục. Giữ nguyên hợp đồng URL trả về và hành vi xóa ảnh lỗi hiện có.
2. Cho `OrdersApi.uploadImage` nhận callback tiến độ tùy chọn, chuyển qua `onUploadProgress` của Axios; tính `loaded / total`, giới hạn 0–100 khi `total > 0`. Kiểm tra adapter React Native trên thiết bị: nếu không cung cấp tổng hoặc báo 100% trước khi server trả kết quả, dùng spinner vô định hoặc trạng thái “Đang xử lý”, không tự tạo phần trăm giả.
3. Trong màn hình booking lưu tiến độ theo URI/ID ảnh thay vì chỉ một boolean; đặt overlay vòng tròn và phần trăm trên đúng thumbnail, có nhãn truy cập. Chỉ đánh dấu hoàn tất khi API trả URL thành công; quản lý lần lượt từng ảnh theo hành vi hiện tại.
4. Khi thất bại hiển thị lỗi, bỏ ảnh local như hành vi hiện hành; bảo đảm thao tác xóa, rời màn hình và cập nhật sau unmount không gây trạng thái cũ. Không cho tiếp tục khi còn ảnh đang tải.
5. Nếu phạm vi bao gồm KYC/minh chứng, áp dụng cùng hợp đồng tiến độ vào từng luồng sau khi kiểm tra UI và API riêng, không coi chúng đã được xử lý mặc định.

**Nghiệm thu:** ảnh đang tải có vòng tròn và % đúng nếu đo được; trạng thái không xác định không hiển thị % giả; thành công thay URI bằng URL; lỗi không cho gửi ảnh lỗi; kiểm tra một/nhiều ảnh, mạng chậm, lỗi và hủy thao tác. Mở rộng `customer-orders.test.tsx`, `orders.api.test.ts` và kiểm thử thực tế trên hai nền tảng.

## 2. Sửa giao diện chọn ứng dụng ban đầu

**Vị trí:** `mobile/src/features/auth/screens/welcome-screen.tsx`, route `mobile/src/app/welcome.tsx`, kiểm thử `mobile/src/app/__tests__/welcome.test.tsx`. Màn hình đã có lựa chọn Customer/Worker và safe area.

**Cách làm:**
1. Chụp hiện trạng ở màn hình nhỏ/lớn, sáng/tối và xác định bất cập cụ thể; PDF không cung cấp thiết kế đích, vì vậy đề xuất bố cục hai thẻ Khách hàng / Thợ, tiêu đề rõ, trạng thái chọn nổi bật và nút tiếp tục dễ thấy; xác nhận thiết kế nếu có mẫu từ nhóm.
2. Điều chỉnh bố cục, cỡ chữ, khoảng cách, icon và tương phản trong `welcome-screen.tsx`; dùng scroll khi thiếu chiều cao, hỗ trợ font hệ thống lớn và safe area, tránh chiều cao cố định gây cắt nội dung.
3. Giữ logic `selectedRole` và điều hướng/guest hiện có; bổ sung nhãn accessibility, trạng thái selected và vùng chạm đủ lớn.

**Nghiệm thu:** hai lựa chọn phân biệt rõ, chọn đúng vai trò và đi đúng màn hình; không tràn/cắt trên thiết bị nhỏ, chế độ tối và chữ lớn. Cập nhật test welcome cho chọn từng vai trò và điều hướng; rà soát ảnh chụp thực tế.

## 3. Nội dung guest bị che bởi thanh hệ thống

**Vị trí:** `mobile/src/app/_layout.tsx`, `mobile/src/components/ui/` (component `Screen`), `mobile/src/app/customer/(tabs)/_layout.tsx`, `mobile/src/app/worker/(tabs)/_layout.tsx`, `mobile/src/features/home/customer/screens/customer-home-screen.tsx`, `mobile/src/features/home/worker/components/worker-guest-overview.tsx` và các màn hình guest liên quan.

**Cách làm:**
1. Tái hiện sau khi chọn từng app khi chưa đăng nhập trên Android có gesture/3 nút và iPhone có notch/home indicator; xác định cạnh nào bị che và màn hình/tab cụ thể.
2. Kiểm tra `SafeAreaProvider` và cách `Screen safeArea`/`SafeAreaView` áp dụng `edges` cùng inset của tab bar. Dùng `react-native-safe-area-context` và phân bổ inset một lần: nội dung/header tránh cạnh trên, tab bar/footer tránh cạnh dưới; không bọc chồng gây khoảng trắng kép. Với nội dung scroll, thêm padding cuối phù hợp chiều cao tab bar.
3. Kiểm tra màn hình có nền tràn cạnh thì chỉ để nền tràn, các nút và nội dung vẫn nằm trong vùng an toàn. Kiểm tra cả khi mở bàn phím và xoay màn hình nếu app hỗ trợ.

**Nghiệm thu:** status bar, notch, navigation bar không che chữ hoặc nút ở cả hai chế độ guest; không có khoảng trắng kép hoặc footer bị đẩy khỏi màn hình. Kiểm tra Android/iOS thực tế và thêm test bố cục với inset giả lập nếu có thể.

## 4. Hủy rồi tải lại vẫn mở bid

**Bằng chứng trong mã:** `mobile/src/app/customer/booking/radar.tsx` gọi `OrdersApi.cancelRequest`, nhưng `catch` bỏ qua lỗi, sau đó vẫn reset draft và chuyển sang tab đã hủy; ID còn có fallback cứng `00225617`. Vì thế UI có thể báo như đã hủy khi API thất bại. Đây là nguyên nhân có khả năng, chưa chứng minh nguyên nhân phía backend. `mobile/src/features/orders/hooks/use-customer-orders.ts` và `mobile/src/features/orders/api/orders.api.ts` liên quan danh sách/cache.

**Cách làm:**
1. Tái hiện với request thật: ghi request ID, response hủy và GET sau reload, trạng thái DB/server, các query key và thời điểm phản hồi; phân biệt **service request đang tìm thợ** với **order đã tạo** để gọi đúng endpoint. Kiểm tra route, quyền và chuyển trạng thái trong backend theo hướng dẫn `backend/AGENTS.md` nếu cần sửa backend.
2. Bỏ ID fallback giả trong luồng thực; khi chưa xác định được request ID, chặn hủy và hiển thị lỗi/đang tải. Không dùng ID của request khác khi điều hướng hoặc khôi phục draft.
3. Tạo trạng thái đang hủy, vô hiệu nút để tránh gửi lặp; chỉ reset draft và điều hướng sau khi API xác nhận thành công. Nếu thất bại, giữ màn hình/draft, hiển thị lỗi có thể thử lại. Xử lý trường hợp đã hủy, trạng thái xung đột và mất mạng theo hợp đồng API thực tế.
4. Sau thành công invalidate/refetch cả danh sách request, chi tiết, radar và các query liên quan theo key thực tế; kiểm tra lại logic tìm request gần nhất không chọn request đã hủy. Nếu GET hoặc DB vẫn trả trạng thái mở, sửa xử lý/transaction backend và kiểm tra luồng đóng bid theo quy tắc nghiệp vụ; không che lỗi server bằng cache local.
5. Kiểm tra đồng thời nhiều lần bấm và reload ngay sau hủy; bảo đảm không chuyển tab thành công khi invalidation hoặc mutation bị lỗi theo chính sách đã chọn.

**Nghiệm thu:** hủy thành công, reload/đăng nhập lại vẫn thấy trạng thái đã hủy và không mở bid; API lỗi không báo thành công hay mất draft; không có request ID thì không gọi API. Bổ sung test mutation thành công/lỗi, ID thiếu, query invalidation và integration backend cho trạng thái bền vững.

## 5. Thống nhất tiếng Việt trong luồng hủy

**Vị trí:** `mobile/src/app/customer/booking/radar.tsx` có nhãn `Cancel order`; kiểm tra thêm `mobile/src/features/orders/customer/screens/customer-order-cancel-dialog.tsx`, `customer-order-detail-screen.tsx`, route `mobile/src/app/customer/orders/[id]/cancel-dialog.tsx` và thông báo lỗi liên quan.

**Cách làm:**
1. Liệt kê toàn bộ text hiển thị trong các bước hủy request/order: nút, xác nhận, lý do, thành công, lỗi và accessibility label. Thay cụm tiếng Anh bằng tiếng Việt nhất quán như “Hủy đơn”, “Không”, “Xác nhận hủy”; phân biệt đơn đã đặt và yêu cầu tìm thợ nếu cần.
2. Kiểm tra thông báo lấy từ backend: ánh xạ mã lỗi sang thông điệp tiếng Việt; với lỗi không biết dùng thông báo chung, tránh hiện raw message tiếng Anh. Giữ mã trạng thái/API nội bộ nguyên vẹn.
3. Bảo đảm nội dung dài không tràn nút/modal, hỗ trợ chữ lớn và dark mode.

**Nghiệm thu:** toàn bộ các nhánh hủy từ radar và chi tiết đơn hiển thị tiếng Việt, kể cả lỗi và trạng thái chờ; test các nhánh thành công, lỗi, đóng dialog.

## 6. Khóa vị trí bản đồ radar, vẫn cho zoom

**Hiện trạng:** `mobile/src/components/map/handy-map.tsx` dùng một prop `interactive` chung cho `scrollEnabled`, `zoomEnabled`, `rotateEnabled`, `pitchEnabled`; không thể khóa pan mà vẫn zoom. Radar dùng `HandyMap` tại `mobile/src/app/customer/booking/radar.tsx`.

**Cách làm:**
1. Mở rộng `HandyMap` bằng các tùy chọn gesture riêng (mặc định kế thừa `interactive` để không làm đổi màn hình chọn địa chỉ và các nơi dùng khác). Ở radar tắt pan, rotate và pitch, giữ zoom.
2. Kiểm tra hành vi pinch zoom quanh vị trí ngón tay: nếu camera bị lệch tâm dù pan tắt, đồng bộ/giữ lại tọa độ trung tâm gốc với camera theo API Mapbox thực tế, tránh vòng lặp cập nhật và giật. Khi tọa độ request thay đổi hợp lệ, cập nhật tâm tương ứng; không luôn dùng fallback Đà Nẵng nếu có tọa độ thực.
3. Kiểm tra các lớp radar overlay không chặn cử chỉ zoom; vòng radar, vị trí trung tâm và marker phải tiếp tục trùng tâm bản đồ. Xác định rõ nhãn khoảng cách vòng radar khi zoom thay đổi để không gây hiểu nhầm nếu chúng chỉ là đồ họa cố định.

**Nghiệm thu:** kéo một/hai ngón không làm lệch vị trí gốc; pinch zoom hoạt động, không xoay/nghiêng; radar khớp tâm sau zoom. Test prop Mapbox và regression màn hình chọn địa chỉ; kiểm tra gesture trên thiết bị thật, vì mock không chứng minh được camera.

## 7. Loading khi chuyển giữa app khách và thợ

**Vị trí:** `mobile/src/features/profile/components/app-switch-card.tsx`, `mobile/src/features/profile/customer/screens/customer-profile-screen.tsx`, `mobile/src/features/profile/worker/screens/worker-profile-screen.tsx`, `mobile/src/features/profile/customer/screens/customer-switch-to-worker-screen.tsx`, `mobile/src/stores/use-auth-store.ts`, router/layout đích.

**Cách làm:**
1. Đo thời gian từ nhấn chuyển đến khi màn hình đích sẵn sàng; xác định chậm do navigation, render hay request. Rà soát tất cả điểm chuyển của guest và tài khoản đủ vai trò, giữ nguyên guard/quyền và lưu mode theo tài khoản.
2. Hiển thị overlay/loading có animation và thông báo “Đang chuyển ứng dụng…” ngay khi bắt đầu; khóa nút tránh nhấn lặp. Đặt trạng thái ở nơi còn tồn tại sau điều hướng, kết thúc khi màn hình đích đã mount/sẵn sàng hoặc khi điều hướng thất bại. Không che vô hạn nếu request thất bại: hiển thị lỗi và cho thử lại/quay lại; dọn trạng thái khi unmount.
3. Nếu render đồng bộ chặn animation, kiểm tra nguyên nhân và chia/hoãn phần nặng hợp lý; không chỉ thêm spinner bị đứng. Không dùng timeout cố định để giả lập hoàn thành.

**Nghiệm thu:** chuyển hai chiều cho guest và tài khoản hợp lệ có phản hồi ngay, không chạm lặp, loading biến mất khi đến đích hoặc lỗi; quyền, lưu mode và back navigation không hồi quy. Mở rộng test profile/mode switch hiện có và đo thực tế trên máy chậm.

## 8. Đổi màu hover/pressed trang cài đặt cá nhân

**Vị trí:** `mobile/src/features/profile/customer/screens/customer-settings-screen.tsx` dùng `active:bg-neutral-50` và `dark:active:bg-neutral-800/50`; rà soát màn hình cài đặt thợ/những thẻ tương tự để thống nhất. Cần phân biệt hover (web/chuột) và pressed (chạm) khi tái hiện.

**Cách làm:**
1. Xác định thẻ và trạng thái thực sự đổi xám trên từng nền tảng; đề xuất màu nhấn theo palette hiện hữu (ví dụ amber nhạt ở giao diện sáng, amber trầm ở tối), xác nhận với thiết kế nếu có.
2. Áp dụng màu nhất quán cho trạng thái hover và pressed có hỗ trợ, vẫn giữ rõ focus bàn phím và đủ tương phản với chữ/icon. Không thay màu trạng thái disabled hay nút nguy hiểm một cách máy móc.
3. Kiểm tra mọi dòng/thẻ liên quan, đảm bảo thao tác điều hướng không đổi.

**Nghiệm thu:** hover/nhấn có màu mới nhất quán, dễ nhìn ở sáng/tối; focus và disabled phân biệt; kiểm tra chạm Android/iOS và hover web nếu ứng dụng hỗ trợ.

## Kiểm thử và bàn giao chung

- Trong `mobile`: chạy `pnpm run lint`, `pnpm run type-check`, các test liên quan, rồi `pnpm run test` nếu môi trường cho phép. Nếu sửa backend, chạy bộ kiểm thử liên quan theo hướng dẫn của backend.
- Kiểm thử end-to-end với dữ liệu thật hoặc môi trường test: guest hai chế độ, chọn ảnh mạng chậm/lỗi, tạo request, hủy, reload, radar zoom, chuyển chế độ và cài đặt. Ghi thiết bị/OS, ảnh trước-sau, response và kết quả.
- Những điểm cần thống nhất trước khi chốt giao diện: mẫu màn hình chọn app, phạm vi tất cả luồng upload và màu nhấn mong muốn. Có thể tiến hành tái hiện và sửa lỗi hành vi độc lập trong lúc chờ.
