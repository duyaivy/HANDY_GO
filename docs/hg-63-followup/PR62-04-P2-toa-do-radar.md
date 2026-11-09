# PR #62 — P2 — Radar dùng tọa độ cũ hoặc tọa độ mặc định như tọa độ xác thực

**Review:** [Comment gốc](https://github.com/duyaivy/HANDY_GO/pull/62#discussion_r4505627800)
**Nhánh:** `bugfix/HG-63-ui_mobile_app-followup` → `main`
**Commit được review:** `1052bca2a767495168b2f51ec6f7a174c5058468`
**Trạng thái khi ghi nhận (09/11/2026):** Thread chưa resolve; hướng xử lý dưới đây chưa được triển khai.

**Vị trí:** [`radar.tsx`](../../mobile/src/app/customer/booking/radar.tsx), phần `verifiedCoords` quanh dòng 173 và effect tải request quanh dòng 209–223.
**Hiện trạng:** `verifiedCoords` ưu tiên route params rồi draft store, chưa ưu tiên `serverRequest.latitude/longitude`. Khi response thiếu tọa độ hợp lệ, effect vẫn ghi tọa độ dự phòng Đà Nẵng qua `setAddress()`, khiến lần render sau hiểu đó là tọa độ đã xác thực. Dữ liệu của request trước cũng có thể còn trong state khi đổi request.

**Hướng xử lý:**

1. Ràng buộc dữ liệu server với `activeRequestId`. Khi response của đúng request đã về, dùng tọa độ server hợp lệ làm nguồn ưu tiên; chỉ dùng route params/draft trước khi có response, với điều kiện chúng thuộc request hiện tại.
2. Dùng `DEFAULT_RADAR_CENTER` chỉ để dựng bản đồ. Khi backend thiếu tọa độ, không ghi tâm mặc định vào draft như địa chỉ/tọa độ đã xác thực; để `verifiedCoords` là `null` và xử lý trạng thái thiếu vị trí rõ ràng.
3. Khi `activeRequestId` đổi, xóa hoặc gắn định danh cho state request cũ; bỏ qua response đến muộn của request trước. Kiểm tra tọa độ hữu hạn và nằm trong miền vĩ độ/kinh độ hợp lệ trước khi dùng.

**Tiêu chí nghiệm thu:** Request B mở sau request A luôn dùng tọa độ của B; response A đến muộn không ghi đè B. Khi B không có tọa độ, bản đồ có thể dùng tâm hiển thị mặc định nhưng không xem đó là vị trí đã xác thực. Kiểm tra thêm route params cũ và thao tác định vị lại bằng GPS.
