# PR #30 — Bốn yêu cầu sau re-review

Nguồn: [review tại commit `d55d312`](https://github.com/duyaivy/HANDY_GO/pull/30#pullrequestreview-5676749171). Reviewer nhận xét phần lớn lỗi cũ đã được sửa đúng hướng và nêu bốn vấn đề sau. Ưu tiên RECHECK-01 trước khi merge.

## RECHECK-01 — P1: Validate draft sau khi khóa, trước khi publish

[Comment gốc](https://github.com/duyaivy/HANDY_GO/pull/30#discussion_r4396076261) · `backend/apps/order-service/src/service-requests/service-requests.service.ts`

**Vấn đề:** `publish()` đọc và validate các trường bắt buộc trước transaction. Sau khi khóa row, code chỉ kiểm tra request vẫn là `draft`. Nếu `updateDraft()` xóa hoặc thay đổi service, mô tả, địa chỉ hoặc lịch hẹn giữa hai bước, request có thể được publish và event được tạo từ dữ liệu mới chưa được validate. Reviewer đã tái hiện event có `serviceId=null` và description rỗng.

**Yêu cầu:** Khóa row, đọc lại request và validate toàn bộ dữ liệu cần publish trong cùng transaction; hoặc dùng CAS theo version đã validate và từ chối khi version thay đổi. Chỉ ghi history/outbox sau khi dữ liệu hiện tại hợp lệ.

**Regression test:** Publish đọc draft hợp lệ → `updateDraft()` làm dữ liệu không hợp lệ → publish tiếp tục phải bị từ chối, không phát `service_request.published`. Kiểm tra concurrency trên PostgreSQL thật.

## RECHECK-02 — P2: Đồng bộ addMedia/deleteMedia với publish

[Comment gốc](https://github.com/duyaivy/HANDY_GO/pull/30#discussion_r4396076263) · `backend/apps/order-service/src/service-requests/service-requests.service.ts`

**Vấn đề:** `addMedia()` và `deleteMedia()` kiểm tra `status=draft` rồi thực hiện create/delete riêng. Nếu publish chuyển request sang `open_for_bidding` giữa hai bước, thao tác media vẫn có thể hoàn tất sau khi request không còn là draft.

**Yêu cầu:** Trong mỗi thao tác media, khóa cùng row ServiceRequest, đọc lại và kiểm tra trạng thái rồi ghi media trong một transaction. Thống nhất thứ tự khóa với publish và updateDraft.

**Regression test:** Khi publish thắng trước, thao tác thêm/xóa media phải bị từ chối. Khi thao tác media thắng trước, publish phải thấy dữ liệu media đã commit. Kiểm tra cạnh tranh trên PostgreSQL thật.

## RECHECK-03 — P2: Lưu tọa độ đang chọn thay vì tọa độ draft cũ

[Comment gốc](https://github.com/duyaivy/HANDY_GO/pull/30#discussion_r4396076267) · `mobile/src/app/customer/booking/select-address.tsx`

**Vấn đề:** GPS thành công cập nhật `currentAddress/currentCoords`, nhưng nút xác nhận đọc latitude/longitude từ Zustand draft cũ. Nếu reverse geocoding chưa cập nhật store, đang chờ hoặc bị lỗi, địa chỉ mới có thể được lưu cùng tọa độ cũ hoặc mặc định.

**Yêu cầu:** Xác nhận và lưu cặp địa chỉ/tọa độ hiện đang chọn, dùng `currentCoords` và bảo đảm hai giá trị khớp nhau; không phụ thuộc geocoding cập nhật store trước. Nếu chưa có địa chỉ/vị trí hợp lệ, yêu cầu người dùng chọn hoặc xác nhận; không thay địa chỉ rỗng bằng chuỗi hardcode.

**Regression test:** GPS trả tọa độ khác draft → bấm xác nhận → store chứa tọa độ GPS mới và địa chỉ tương ứng. Kiểm tra thêm trường hợp map/geocoding lỗi hoặc đang chờ.

## RECHECK-04 — P2: Validate kiểu và từng giá trị status

[Comment gốc](https://github.com/duyaivy/HANDY_GO/pull/30#discussion_r4396076272) · `backend/apps/order-service/src/service-requests/dto/query-service-request.dto.ts`

**Vấn đề:** `status` chưa kiểm tra kiểu chuỗi và giá trị enum. Query lặp như `?status=draft&status=open_for_bidding` có thể trở thành mảng, lọt qua DTO rồi gây lỗi `.split()` và trả HTTP 500. Token enum sai cũng có thể được đưa tới Prisma mà chưa kiểm tra runtime.

**Yêu cầu:** Validate `status` là chuỗi và từng token trong danh sách phân cách bằng dấu phẩy thuộc enum tương ứng. Áp dụng cho query ServiceRequest, Order và BookingProposal; chỉ `IsString` là chưa đủ.

**Regression test HTTP:** Danh sách nhiều status hợp lệ được chấp nhận; array/object, token không hợp lệ và chuỗi chỉ chứa dấu phẩy hoặc khoảng trắng trả HTTP 400, không đẩy lỗi validation xuống database.

## Phạm vi và nghiệm thu

- Giữ mock báo giá/thợ trên mobile; realtime báo giá thuộc phần Bidding. Không yêu cầu sửa các Mobile P1 đã hoãn.
- Bổ sung regression test cho cả bốn mục; test concurrency dùng PostgreSQL thật. Các kiểm chứng cô lập không thay thế E2E PostgreSQL/RabbitMQ.
- Ghi rõ kiểm thử nào đã chạy, kết quả và phần chưa kiểm chứng; không coi review là approve hoặc xác nhận đã merge.
