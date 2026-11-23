# PR #30 — Task cần sửa và phần giữ nguyên mock

## 1. Task Backend cần sửa

Các đường dẫn dưới đây tính từ `backend/apps/order-service/src/`, trừ khi ghi rõ đường dẫn đầy đủ.

| Mã | Task cần sửa | File chính |
| --- | --- | --- |
| BE-01 | Chặn khách dùng `autoAccept` để chấp nhận proposal thay thợ. API accept phải lấy danh tính thợ từ phiên đăng nhập; demo tự động chỉ dùng fixture/dev path riêng, không mở trên API thật. | `booking-proposals/booking-proposals.controller.ts`; `booking-proposals/dto/create-booking-proposal.dto.ts` |
| BE-02 | Kiểm tra quyền Admin trước khi gọi API danh sách Order toàn hệ thống. Customer/Worker phải nhận 403. | `orders/admin-orders.controller.ts`; `orders/orders.service.ts` nếu đặt kiểm tra ở service |
| BE-03 | Thống nhất contract eligibility với Bidding trên main: Order trả `isEligible` nhưng Bidding đọc `eligible`. Ưu tiên sửa response Order và DTO cho khớp consumer hiện có. | `internal/internal-order.service.ts`; `internal/dto/bidding-eligibility-response.dto.ts` |
| BE-04 | Kết nối RMQ listener khi khởi động Order để các handler `payment.succeeded/failed` thực sự nhận event. Tái sử dụng helper RabbitMQ và queue Order đang có. | `backend/apps/order-service/src/main.ts` |
| BE-05 | Đưa ghi inbox và cập nhật paymentState vào cùng transaction; ACK sau commit, rollback cả hai khi lỗi. Dùng event ID ổn định, không thay ID thiếu bằng `Date.now()`. | `consumers/payment-events.consumer.ts`; `common/inbox/consumed-event.repository.ts` nếu cần thay API transaction |
| BE-06 | Bọc event bằng envelope đúng contract Notification: eventId từ outbox, eventType, eventVersion, source, occurredAt và payload. Giữ nguyên eventId qua retry. | `common/outbox/order-outbox-publisher.service.ts` |
| BE-07 | Bổ sung `selectedBidId` vào `order.created` và thống nhất worker field với Bidding, tránh bid được chọn bị xử lý như recommendation rồi reject. | `orders/orders.service.ts`; phối hợp `backend/apps/bidding-service/src/events/bidding-events.consumer.ts` nếu sửa alias phía nhận |
| BE-08 | Chống race condition trong chuyển trạng thái Order bằng khóa + kiểm tra trong transaction hoặc CAS status/version. Chỉ ghi history/outbox khi transition thành công; hai lệnh nghiệm thu đồng thời chỉ phát một event hoàn tất. Đồng bộ kiểm tra/xóa evidence với finish. | `orders/orders.service.ts` |
| BE-09 | Scheduler phải kiểm tra lại trạng thái trước khi đóng/hết hạn request; không ghi đè request đã chuyển thành Order. Áp dụng cùng quy tắc cho request/proposal khi đua với accept. | `service-requests/workers/order-deadline-scheduler.service.ts`; `service-requests/service-requests.service.ts`; `booking-proposals/booking-proposals.service.ts`; `orders/orders.service.ts` |
| BE-10 | Kiểm tra XOR nguồn bid/recommendation và xác minh nguồn thuộc đúng request, worker, trạng thái hợp lệ khi chạy thật. Phối hợp verifier internal với Bidding/Matching; mock verifier chỉ dùng dev/test. Không ép giá proposal bằng giá bid nếu cho phép thương lượng. | `booking-proposals/booking-proposals.service.ts`; `booking-proposals/dto/create-booking-proposal.dto.ts`; client/verifier internal và module đăng ký tương ứng |
| BE-11 | Ghi outbox cùng transaction cho `booking_proposal.created/changes_requested/rejected`. Phát `order.status.changed` đúng contract Notification cho tiến trình đơn; tránh thông báo đôi với completed/cancelled. | `booking-proposals/booking-proposals.service.ts`; `booking-proposals/booking-proposals.module.ts` nếu cần; `orders/orders.service.ts`; `common/constants/order.constants.ts` |
| BE-12 | Lọc dữ liệu chi tiết request theo quyền: chủ/Admin xem toàn bộ proposal; worker chỉ xem proposal của mình. Không trả thương lượng riêng của thợ khác cho người biết request ID. | `service-requests/service-requests.service.ts`; `service-requests/dto/service-request-response.dto.ts` nếu thay response |

**Phối hợp Bidding/Notification:**

- BE-03 và BE-07 là sửa contract backend, không chờ realtime mobile.
- Notification đã hỗ trợ alias `customerUserId/workerUserId`; giữ nguyên khả năng này, sửa envelope phía Order.
- BE-10 áp dụng cho đường chạy thật; không yêu cầu bỏ mock báo giá mobile ngay.
- Mỗi task bổ sung regression test ở file `.spec.ts` tương ứng; concurrency và consumer cần kiểm tra tích hợp DB/broker.
- Nếu thêm component reusable, cập nhật `backend/AGENTS.md` theo quy định repo.

## 2. Task Mobile P2 cần sửa

| Mã | Task cần sửa | File chính |
| --- | --- | --- |
| MOB-01 | Thêm filter server và phân trang/tải tiếp cho request, order, proposal. Không chỉ lấy 10 bản ghi trang đầu rồi lọc tab tại client. Đưa filter vào query key và nối UI tải tiếp. | `mobile/src/features/orders/hooks/use-customer-orders.ts`; `mobile/src/features/orders/hooks/use-worker-jobs.ts`; `mobile/src/features/orders/hooks/orders-query-keys.ts`; `mobile/src/features/orders/customer/screens/customer-orders-screen.tsx`; `mobile/src/features/orders/worker/screens/worker-jobs-screen.tsx`; `mobile/src/features/orders/api/orders.api.ts` nếu cần chuẩn hóa params |
| MOB-02 | Phân biệt GPS thành công với fallback/lỗi. Tọa độ mặc định chỉ làm tâm bản đồ, không âm thầm lưu như vị trí GPS thật; yêu cầu người dùng chọn/xác nhận địa chỉ. | `mobile/src/services/location/device-location.ts`; `mobile/src/app/customer/booking/select-address.tsx` |

## 3. Giữ nguyên mock / giao Bidding làm sau

| Phần | Task hiện tại | Phụ trách sau |
| --- | --- | --- |
| Danh sách thợ, bid, giá và thông tin hiển thị mẫu trên Radar | Giữ nguyên mock ở `mobile/src/app/customer/booking/radar.tsx`; chưa yêu cầu thay bằng dữ liệu thật trong đợt sửa Order. | Bidding/mobile integration |
| Cập nhật báo giá realtime | Chưa triển khai trong đợt sửa Order; người làm Bidding chọn cơ chế và nối dữ liệu thật sau. | Bidding |
| Dữ liệu phục vụ demo luồng booking | Giữ fixture/mock trong môi trường demo/dev/test; không dùng để bỏ kiểm tra quyền và nguồn dữ liệu trên backend thật. | Order phối hợp Bidding khi tích hợp |

## 4. Mobile P1 hoãn sửa theo phạm vi đã chốt

Các mục này giữ nguyên trong đợt hiện tại, không tính là đã fix:

| Phần | File chính |
| --- | --- |
| Ảnh evidence mẫu | `mobile/src/features/orders/worker/screens/worker-job-complete-screen.tsx` |
| Các nhánh catch thông báo thành công dù API lỗi | Các màn nhận việc, thi công, hoàn thành, nghiệm thu, khiếu nại và hủy đơn trong `mobile/src/features/orders/` |
| Create/publish request lỗi vẫn chuyển sang Radar | `mobile/src/app/customer/booking/summary.tsx`; `mobile/src/app/customer/booking/radar.tsx` |
| Payload hủy Order dùng `cancelReason` thay vì `reason` | `mobile/src/features/orders/api/orders.api.ts` |
| UI gửi `autoAccept` | `mobile/src/app/customer/booking/radar.tsx`; không giao sửa mobile đợt này. Backend vẫn phải xử lý BE-01; demo cũ cần fixture/dev path phù hợp sau khi backend chặn auto-accept thật. |

