# Code Review — HandyGo PR #62 (HG-63 Mobile Follow-up)

**PR:** https://github.com/duyaivy/HANDY_GO/pull/62  
**Branch:** `bugfix/HG-63-ui_mobile_app-followup` → `main`  
**Commit được review:** `ed0a15bcb89c2c1705608129253df0f69a8c7677`  
**Ngày review:** 06/11/2026  
**Kết luận:** **REQUEST CHANGES — Chưa merge**

> **Phạm vi PO đã xác nhận:** Payment Backend và Message Service hiện chưa hoàn thiện. **Không yêu cầu tích hợp Payment/Chat BE, không xem việc đang dùng mock/placeholder cho hai phần này là blocker của PR #62.** Chỉ review các vấn đề khác có ảnh hưởng thực tế đến dữ liệu, nghiệp vụ Mobile, an toàn khi thao tác và phạm vi thay đổi của PR.

## 1. Tình trạng PR / CI

- GitHub báo **mergeable: true** (không có merge conflict tại thời điểm kiểm tra).
- PR gồm **22 commits, 62 file thay đổi, +3.742 / −6.009 dòng**.
- **PR CI run #146 PASS**, bao gồm `Mobile CI` và `CI Gate`: https://github.com/duyaivy/HANDY_GO/actions/runs/42175544966
- Thông tin `493/494` tests trong mô tả PR là **kết quả cũ**, không còn phản ánh CI mới nhất.
- **Lưu ý:** CI pass không xác nhận các tình huống nghiệp vụ, race condition hoặc hành vi Android thực tế.

## 2. Blockers / cần sửa trước merge

### P1-01 — PR xóa 19 file tài liệu kỹ thuật ngoài phạm vi

**File:** `.gitignore`, `docs/**`  
**Mức độ:** P1 / Block merge  
**Bằng chứng:** Diff xoá 19 tài liệu (khoảng **5.623 dòng**), gồm `docs/HG47_TRACKING_SERVICE.md`, `docs/HG48_BIDDING_SERVICE.md`, `docs/MATCHING_SERVICE.md`, tài liệu Wallet/Payment/Order Service, báo cáo review và PDF Order Service. `.gitignore` còn loại bỏ các ngoại lệ cho `docs/reviews/**` và một số file docs.

**Rủi ro:** Mất tài liệu kiến trúc/triển khai không liên quan mục tiêu sửa giao diện Mobile; làm PR khó review và làm giảm khả năng tra cứu sau này.

**Yêu cầu sửa:**
- Khôi phục toàn bộ 19 file docs không chủ đích xóa so với `main`.
- Hoàn nguyên thay đổi `.gitignore` không liên quan Mobile.
- Nếu có chủ trương dọn docs, tách riêng PR và nêu rõ danh sách, lý do.

**Tiêu chí nghiệm thu:** `git diff main...HEAD -- docs .gitignore` không còn các xóa không được PO chấp thuận.

### P1-02 — Số điện thoại / điểm uy tín thợ mẫu bị trình bày như dữ liệu thật

**Files:**
- [`mobile/src/features/orders/components/order-worker-card.tsx`](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/features/orders/components/order-worker-card.tsx)
- [`mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx`](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx#L120-L137)
- [`mobile/src/features/orders/hooks/use-customer-orders.ts`](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/features/orders/hooks/use-customer-orders.ts#L248-L300)

**Mức độ:** P1 / Block merge  
**Bằng chứng:** Default `phoneNumber = '0901234567'`, `rating = 5.0`; thẻ thợ hiển thị cố định `98% hoàn thành`. Khi user bấm **Gọi điện**, số mặc định có thể được chuyển trực tiếp sang `tel:`. Các giá trị này không phải thông tin thật của worker.

**Yêu cầu sửa:**
- Không sử dụng số điện thoại mẫu làm fallback ở luồng đơn thật; nếu không có phone hợp lệ thì ẩn/vô hiệu hóa nút gọi, hiển thị trạng thái chưa có số.
- Rating, số đơn và tỷ lệ hoàn thành phải lấy từ API hoặc hiển thị `Chưa có đánh giá` / không hiển thị trường tương ứng.
- Giữ mock chỉ ở fixture/test hoặc màn demo được đánh dấu rõ; **không dùng dữ liệu giả trong UI production**.
- Thêm test: API không trả phone → không mở `tel:`; rating thiếu → không hiện `5.0`/`98%` giả.

**Tiêu chí nghiệm thu:** Với order thật thiếu worker metadata, không có số mẫu hoặc thông số uy tín giả xuất hiện.

### P1-03 — GPS có thể làm địa chỉ hiển thị khác tọa độ được lưu

**File:** [`mobile/src/app/customer/booking/select-address.tsx` (dòng 69–77)](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/app/customer/booking/select-address.tsx#L69-L77)  
**Mức độ:** P1 / Block merge

**Bằng chứng:** Khi GPS thành công, `setCurrentAddress()` chỉ chạy khi `showFeedback` hoặc input chưa có địa chỉ; nhưng `setCurrentCoords()` luôn chạy. Nếu đang có địa chỉ đã chọn, GPS tự động có thể đổi ghim sang vị trí mới trong khi tên địa chỉ vẫn là vị trí cũ. `handleBottomConfirm` sau đó lưu text cũ cùng coords mới.

**Yêu cầu sửa:**
- Chỉ tự cập nhật tọa độ GPS khi **chưa có địa chỉ do người dùng xác nhận**, hoặc khi họ chủ động chọn nút “Dùng vị trí hiện tại”.
- Mọi cập nhật vị trí phải giữ **địa chỉ và tọa độ nhất quán**.
- Thêm regression test: lưu sẵn địa chỉ A + coords A → mở màn hình, GPS trả B → không được tự đổi thành `address A + coords B`.

**Tiêu chí nghiệm thu:** Đặt thợ qua địa chỉ đã lưu không bị gửi tới địa điểm GPS khác.

### P1-04 — API lỗi nhưng UI vẫn báo thao tác thành công (lỗi đã có trước PR)

**File:** [`mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx` (dòng 192–220)](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx#L192-L220)  
**Mức độ:** P1 / Nên xử lý trước phát hành nếu nằm trong luồng nghiệm thu của PR

**Bằng chứng:** `handleConfirmCompletion`, `handleRequestRework`, `handleOpenDispute` đều có `catch` nhưng vẫn hiện alert diễn đạt thao tác đã hoàn thành/được ghi nhận. Dễ khiến khách hàng hiểu nhầm khi request thất bại. **Đây là lỗi tồn tại từ trước, không phải regression được PR #62 tạo mới.**

**Yêu cầu sửa:** Trong `catch`, hiển thị thông báo lỗi và gợi ý thử lại, không phát tín hiệu thành công; không tự chuyển trạng thái UI khi server chưa xác nhận. Bổ sung test rejection cho ba action.

**Tiêu chí nghiệm thu:** API trả 4xx/5xx hoặc mất mạng → người dùng chỉ thấy lỗi, không thấy alert thành công.

## 3. Các vấn đề P2 cần xử lý/đưa vào checklist QA

### P2-01 — Radar fallback coords khiến nút định vị khó lấy GPS thật

**File:** [`mobile/src/app/customer/booking/radar.tsx`](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/app/customer/booking/radar.tsx)

`radarCoords` luôn fallback về `DEFAULT_RADAR_CENTER` nếu thiếu tọa độ. `handleRecenter` ưu tiên nhánh `if (radarCoords)` nên nhánh lấy `DeviceLocationService.getDeviceLocationResult()` có thể không chạy. Nên tách **vị trí mặc định để render map** khỏi **vị trí hợp lệ được xác minh**; nút GPS phải chủ động lấy GPS khi cần. Test case: request không có coords, nhấn nút định vị → phải truy xuất GPS hoặc thông báo quyền GPS, không chỉ bay về default.

### P2-02 — Dừng polling ngay khi order ở `disputed`

**File:** [`mobile/src/features/orders/hooks/use-customer-orders.ts` (dòng 214–245)](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/features/orders/hooks/use-customer-orders.ts#L214-L245)

Khi admin giải quyết khiếu nại, order có thể chuyển trạng thái. Việc xem `disputed` như trạng thái terminal làm màn chi tiết có nguy cơ giữ trạng thái cũ tới khi refresh. Dùng polling chậm khi đang disputed, `refetchOnWindowFocus`/AppState hoặc invalidation theo sự kiện. Test: `disputed` → `in_progress`/`completed` sau admin resolve.

### P2-03 — Request geocoding đến muộn có thể ghi đè lựa chọn mới

**File:** [`mobile/src/app/customer/booking/select-address.tsx`](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/app/customer/booking/select-address.tsx)

Debounce timer chỉ ngăn **khởi chạy** lần tìm kiếm trước; không hủy/loại bỏ kết quả network request đang chạy. Forward/reverse geocode về muộn có thể cập nhật text/coords sau một lựa chọn mới. Dùng `AbortController` nếu API hỗ trợ hoặc sequence ID để chỉ áp dụng response mới nhất. Thêm test các Promise hoàn tất ngược thứ tự.

### P2-04 — Cần kiểm tra mapping hồ sơ thợ khi chọn bằng AI Recommendation

**File:** [`mobile/src/features/orders/hooks/use-customer-orders.ts`](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/features/orders/hooks/use-customer-orders.ts#L248-L300)

Hook mới tìm hồ sơ thợ qua `selectedBidId` hoặc `/requests/:id/bids`. Đơn hàng được chọn từ **recommendation** có thể không có bid. Nên lấy thông tin từ order API hoặc User Trust theo `workerUserId` (nếu đã có endpoint phù hợp); không tạo BE mới chỉ để sửa PR. Làm rõ trường hợp API thiếu profile và test cả `selectionSource = bid` lẫn `recommendation`.

### P2-05 — Nút nộp evidence chưa disable theo trạng thái đơn

**File:** [`mobile/src/features/orders/worker/screens/worker-job-complete-screen.tsx`](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/features/orders/worker/screens/worker-job-complete-screen.tsx)

UI đã có cảnh báo khi order không ở `in_progress`, nhưng nút nộp chỉ disable theo `isSubmitting || isUploadingAny`. Nên chặn submit trên FE khi trạng thái đã biết là không hợp lệ, đồng thời BE vẫn là nguồn kiểm tra cuối cùng. Test `confirmed`, `cancelled`, `completed`.

### P2-06 — Giá không hợp lệ bị quy về 0 khi sắp xếp bids

**File:** [`mobile/src/app/customer/booking/radar.tsx`](https://github.com/duyaivy/HANDY_GO/blob/ed0a15bcb89c2c1705608129253df0f69a8c7677/mobile/src/app/customer/booking/radar.tsx)

Comparator mới dùng `Number(value) || 0`. Giá thiếu/sai sẽ được coi là 0 và có thể xếp trên báo giá hợp lệ, nhận nhãn “Giá tốt nhất”. Nên lọc/đặt giá không hợp lệ cuối danh sách và chỉ hiển thị nhãn khi mức giá đầu tiên thật sự hợp lệ.

## 4. Những nội dung được PO xác nhận **ngoài phạm vi**

- **Payment BE chưa triển khai:** Không yêu cầu tích hợp checkout, Point/cash settlement, VNPay hay sửa BE. Các nhãn/phần demo thanh toán hiện tại có thể giữ theo chủ đích sản phẩm tạm thời; **không coi thiếu Payment API là lỗi chặn merge**.
- **Message Service chưa triển khai:** Không yêu cầu tích hợp Socket.IO, API chat hay sửa route placeholder; **không coi chat chưa hoạt động là lỗi chặn merge**.
- Không tự mở rộng sang Backend, kiến trúc thanh toán hoặc nhắn tin vì PR này ưu tiên Mobile follow-up.

## 5. Những thay đổi tốt — nên giữ

- Radar xử lý cold start Mapbox, zoom và truyền tên dịch vụ nhất quán.
- Sắp xếp báo giá tăng dần, đánh dấu báo giá rẻ nhất, hiển thị thông tin so sánh.
- Tách order detail thành component: trạng thái, thợ, dịch vụ, chi phí, gallery.
- Gallery ảnh nghiệm thu có modal phóng to.
- Worker evidence dùng camera/thư viện thật, upload, tiến độ, retry và validation tối thiểu một ảnh.
- Sửa nhánh submit evidence bị lỗi để báo lỗi thật, thay vì mặc nhiên báo thành công.
- CI mới nhất đã pass; test suite cho Mobile được bổ sung đáng kể.

## 6. Checklist trước khi request re-review

- [ ] Khôi phục 19 docs bị xóa và các thay đổi `.gitignore` ngoài phạm vi.
- [ ] Loại số điện thoại/đánh giá/tỷ lệ hoàn thành giả khỏi UI order thật.
- [ ] Sửa đồng bộ địa chỉ–tọa độ khi GPS tự động trả kết quả.
- [ ] Sửa các nhánh `catch` giả thành công của nghiệm thu/sửa lại/khiếu nại; đánh dấu là lỗi cũ.
- [ ] Fix hoặc có kế hoạch kiểm thử các P2 (Radar, disputed polling, geocoding, worker profile, evidence, bid sorting).
- [ ] Test happy path: chọn địa chỉ → tạo request → Radar → báo giá → chọn thợ → chi tiết đơn.
- [ ] Test error path: API 4xx/5xx, thiếu GPS, giá null/NaN, thiếu metadata thợ, upload evidence thất bại.
- [ ] Chạy lại Mobile lint/typecheck/tests và xác nhận PR CI Gate xanh.
- [ ] Smoke test trên Android thật cho map/GPS/upload/refresh/status updates.
- [ ] **Không mở rộng scope sang Payment BE / Message Service.**

## 7. Merge decision

**Chưa nên merge tại commit `ed0a15b`** dù CI xanh. Ưu tiên xử lý **P1-01 đến P1-03**, và **P1-04** trước khi phát hành/như một thay đổi nhỏ trong cùng PR nếu được team thống nhất. P2 nên được sửa nếu rủi ro tác động tới flow chính, hoặc có issue theo dõi và test bổ sung rõ ràng.

> **Ghi chú:** Review này dựa trên GitHub diff, mã nguồn liên quan và CI của commit nói trên. Chưa test runtime trên Android thật hoặc gọi backend production. Khi có commit mới, cần review lại đúng HEAD mới trước khi merge.
