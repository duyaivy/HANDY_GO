# Review PR #63 — Payment Service

- PR: https://github.com/duyaivy/HANDY_GO/pull/63
- HEAD đã kiểm tra: `e490042dcf4fd2c73d638e2c05423f14e709096c` (10/11/2026)
- Phạm vi: đọc diff và mã liên quan ở Payment, Wallet, Order, Gateway; đối chiếu luồng và test hiện có. CI của chính HEAD này [thành công](https://github.com/duyaivy/HANDY_GO/actions/runs/42834316788). Chưa chạy lại test độc lập hoặc môi trường có PostgreSQL/RabbitMQ.

## Kết luận

**Đề nghị sửa trước khi merge.** Có một lỗi liveness ảnh hưởng xử lý tiền khi hàng đợi vượt giới hạn mỗi lượt và một lỗi bỏ sót sự kiện. CI xanh chưa bao phủ các tình huống bên dưới.

## 1. [P1] Bản ghi kẹt ở đầu danh sách chặn toàn bộ công việc đến sau

**Vị trí:** [PaymentOrdersService `resumeStaleAttempts()` và `collectDueCommissions()`](https://github.com/duyaivy/HANDY_GO/blob/e490042dcf4fd2c73d638e2c05423f14e709096c/backend/apps/payment-service/src/payment-orders/payment-orders.service.ts#L252-L274), [PayoutsService `processBatch()`](https://github.com/duyaivy/HANDY_GO/blob/e490042dcf4fd2c73d638e2c05423f14e709096c/backend/apps/payment-service/src/payouts/payouts.service.ts#L69-L75).

**Cơ chế:** Mỗi lượt luôn `orderBy` thời điểm tạo/attempt tăng dần rồi `take: 20` (Point, commission) hoặc `take: 10` (payout). Khi xử lý không có kết quả cuối, trạng thái và khóa sắp xếp không đổi. Lượt sau chọn lại đúng các bản ghi cũ đó.

**Cách tái hiện:**

1. Có 20 Point attempts cũ mà Wallet luôn trả kết quả chưa xác định, hoặc 20 khoản commission cũ mà ví Worker chưa đủ tiền.
2. Attempt/khoản commission thứ 21 gặp lỗi mạng ở lần gọi đầu, rồi Wallet hồi phục; bản ghi này cần sweep để hoàn tất. Job vẫn chỉ lấy 20 bản ghi đầu và không bao giờ chạm bản ghi thứ 21. Với payout, 10 bản ghi `pending` cũ có bank snapshot không lấy được sẽ chặn payout hợp lệ thứ 11.

**Tác động:** Payment mới có thể nằm `processing` vô thời hạn; hoa hồng chưa được thu sau khi Wallet hồi phục; payout mới không được claim/gửi dù đủ điều kiện. `collectCommission()` lúc xác nhận Cash có thể thử một lần, nhưng sau một lỗi tạm thời, khoản đó vẫn có thể bị kẹt trong sweep.

**Cách xử lý:** Thêm `nextRetryAt`/`lastAttemptAt` (và backoff) cho từng loại việc, chỉ chọn bản ghi đã đến hạn và đưa bản ghi chưa xử lý được ra sau hàng đợi. Với trạng thái không thể tự kết luận, chuyển sang hàng chờ xử lý thủ công nhưng giữ nguyên operation/hold; không tạo debit hay payout mới. Dùng cursor hoặc cơ chế phân phối công bằng để bảo đảm bản ghi sau giới hạn vẫn được thăm. Thêm test với số bản ghi lớn hơn `take`, trong đó nhóm đầu bị kẹt còn bản ghi cuối xử lý được.

## 2. [P2] Có thể mất vĩnh viễn sự kiện `payment.pending`

**Vị trí:** [PaymentOrdersService `open()`](https://github.com/duyaivy/HANDY_GO/blob/e490042dcf4fd2c73d638e2c05423f14e709096c/backend/apps/payment-service/src/payment-orders/payment-orders.service.ts#L47-L78), [OrderEventsService `onCompleted()`](https://github.com/duyaivy/HANDY_GO/blob/e490042dcf4fd2c73d638e2c05423f14e709096c/backend/apps/payment-service/src/order-events/order-events.service.ts#L91-L105).

**Cơ chế:** Sau khi Order hoàn tất nhưng trước khi event `order.completed` tới Payment, khách hàng gọi `POST /payments`. `open()` lấy eligibility trực tiếp từ Order và tự ghi `orderCompletedAt`, nhưng không ghi `payment.pending` vào outbox. Khi event đến, `onCompleted()` thấy `orderCompletedAt` đã có và return. Không nhánh nào phát `payment.pending`. Ngoài ra `open()` dùng thời gian nhận HTTP (`new Date()`) thay vì thời điểm hoàn tất thật của Order.

**Tác động:** Event stream thiếu `payment.pending` cho Order này; consumer tích hợp theo contract sẽ không nhận được thông báo. Hiện chưa thấy consumer của event này trong repository, nên tác động trực tiếp nằm ở tính đúng của contract. Mốc hoàn tất trong Payment cũng lệch so với Order. Test hiện tại chỉ bao phủ đường `order.completed` đến trước HTTP `open()`.

**Cách xử lý:** Để một thao tác duy nhất chịu trách nhiệm chuyển Payment sang trạng thái đã hoàn tất Order và ghi outbox trong cùng transaction. Nếu `open()` được phép mở sớm, nó phải ghi `payment.pending` khi thắng compare-and-set; `onCompleted()` phải dùng cùng điều kiện và tránh event trùng. Bổ sung `completedAt` vào eligibility contract hoặc chờ timestamp của event Order thay vì tự lấy giờ Payment. Test cả hai thứ tự HTTP/event và kiểm tra đúng một outbox event.

## Giới hạn đánh giá

Những phụ thuộc sản phẩm đã được PR nêu rõ (Cash refund production chờ Finance, VNPAY/bank payout thật, đối soát ledger/provider độc lập) không được tính là bug mới trong báo cáo này. Các phát hiện trên dựa vào đường thực thi mã nguồn tại HEAD nêu trên; chưa có test hồi quy mới chạy trực tiếp trên checkout review.
