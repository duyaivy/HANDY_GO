# Các quyết định cần PO xác nhận — Payment Service

Danh sách câu hỏi cần chốt trước khi hoàn thiện và bật các luồng Payment. Tham khảo [checklist HG-51](./HG-51-PAYMENT-SERVICE-CHECKLIST.md) và [README Payment](../../backend/apps/payment-service/README.md).

## Câu hỏi gửi PO

1. **Commission mặc định**
   - Tỷ lệ commission mặc định là bao nhiêu?
   - Có hiệu lực từ thời điểm nào?
   - Ai được quyền tạo hoặc seed rule ban đầu?
   - Quy tắc version hóa và ngăn các rule có thời gian hiệu lực chồng lấn là gì?

2. **Commission 100%**
   - Có cho phép commission bằng 100%, khiến Worker nhận 0, không?
   - Wallet hiện chưa chấp nhận worker earning bằng 0. Có cần yêu cầu Wallet hỗ trợ hay sẽ giới hạn tỷ lệ commission?

3. **Quyền Admin**
   - Admin có được xem mọi Payment, quản lý commission và tạo/xem refund không?
   - Nếu có, các permission tương ứng là gì?

4. **Cash refund**
   - Ai có quyền xác nhận đã hoàn tiền mặt?
   - Quy trình và bằng chứng xác nhận là gì?
   - Trạng thái nào được xem là hoàn tất?

5. **Point refund**
   - Nếu Wallet không đủ nguồn để hoàn Point, ai có quyền duyệt nguồn bù hoặc điều chỉnh?
   - Có chuyển refund sang `needs_review` và chờ xử lý thủ công không?

6. **Partial refund**
   - Có hỗ trợ hoàn tiền một phần không?
   - Nếu có, Order và Notification cần nhận trạng thái/event nào để tương thích?

7. **Top-up VNPAY**
   - VNPAY sandbox đã được chọn; ai xác nhận contract IPN/response và quyền sử dụng credentials?
   - Có chấp thuận quy tắc chỉ hoàn tất top-up sau khi Wallet xác nhận đã cộng Point (ACK) không?

8. **Payout và bank snapshot**
   - Nguồn nào được phép cung cấp bank snapshot đã xác thực, khi event hiện chỉ có `bankAccountId`?
   - Ai duyệt cách mã hóa, che thông tin trong log và thời gian lưu dữ liệu ngân hàng?

9. **Vận hành, retry và lưu trữ**
   - Reconciliation chạy theo lịch nào?
   - Giới hạn retry là bao nhiêu?
   - Ai được quyền replay DLQ?
   - Audit/event cần được lưu trong bao lâu?

10. **Contract Wallet/RabbitMQ**
    - Event top-up sẽ có payload ở root hay được bọc trong `data`/`payload`?
    - Event ID có thể là chuỗi không phải UUID không?
    - Đề nghị xác nhận cùng đội Wallet/backend để bảo đảm producer và consumer dùng cùng contract.

## Ghi chú

- VNPAY sandbox đã được ghi nhận là lựa chọn cho top-up; việc chọn provider không đồng nghĩa adapter hoặc credentials đã được cấu hình.
- Các quyết định chưa được xác nhận không được tự đặt mặc định trong code.
- Những luồng tài chính phụ thuộc vào quyết định còn mở cần tiếp tục fail-closed hoặc chưa bật.
