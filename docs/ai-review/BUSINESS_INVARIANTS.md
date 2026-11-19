# Các Quy tắc Nghiệp vụ Bất biến Cốt lõi của HANDY_GO

Các quy tắc nghiệp vụ này đã được chốt và phê duyệt bởi Product Owner, Kiến trúc sư hệ thống và Lead Engineer. Mọi Pull Request vi phạm bất kỳ điều khoản nào dưới đây đều phải bị AI gắn cờ là lỗi nghiêm trọng (**CRITICAL**) hoặc rất nghiêm trọng (**HIGH**).

---

## 1. Vòng đời Yêu cầu, Đề xuất (Proposal) & Đơn hàng (Order)

### 1.1 Quan hệ Bản số giữa Service Request và Order
- **Quy tắc bất biến**: Mỗi Yêu cầu tìm thợ (`ServiceRequest`) chỉ được chuyển đổi thành **tối đa duy nhất một Đơn hàng** (`orders.service_request_id` có ràng buộc `UNIQUE`).
- **Quy định**: Nếu quá trình đàm phán thất bại, đề xuất bị từ chối hoặc rút lui. Nếu đơn hàng đã được tạo mà sau đó bị hủy, khách hàng bắt buộc phải tạo một Service Request mới để thuê thợ khác; không tái sử dụng request cũ.
- **Quy định**: Không được gọi là "hủy Order" khi chưa có bản ghi trong bảng `orders`. Trước khi có Order, thao tác chỉ là "hủy ServiceRequest" hoặc "rút/từ chối BookingProposal".

### 1.2 Tính Bất biến của Đề xuất (Proposal) & Cơ chế Chuỗi Phiên bản
- **Quy tắc bất biến**: Bản ghi `BookingProposal` là **bất biến tuyệt đối** sau khi gửi đi. Không bên nào được phép sửa đè giá tiền, phạm vi công việc hay lịch hẹn lên bản ghi hiện tại.
- **Quy định**: Nếu cần điều chỉnh, Thợ gửi yêu cầu sửa đổi (`changes_requested` kèm lý do cụ thể). Khách hàng sau đó tạo một **phiên bản đề xuất mới** kế thừa từ phiên bản cũ (`supersedes_proposal_id`, `revision_no = previous.revision_no + 1`).
- **Quy định**: Chỉ Khách hàng mới có quyền tạo và gửi đề xuất sửa đổi. Thợ chỉ có quyền chấp thuận (accept), từ chối (reject) hoặc yêu cầu chỉnh sửa (request changes).

### 1.3 Tạo Đơn hàng Nguyên tử (Kiến trúc v3.1 đã chốt)
- **Quy tắc bất biến**: Khi Thợ bấm đồng ý một Đề xuất hợp lệ, Đơn hàng phải được tạo ra ngay lập tức và Yêu cầu được đánh dấu hoàn thành trong **cùng một transaction PostgreSQL duy nhất**.
- **Quy định**: Trong transaction có khóa bản ghi (`SELECT ... FOR UPDATE`):
  1. Khóa và kiểm tra `ServiceRequest` còn đang mở và chưa có đơn hàng nào khác gắn vào.
  2. Khóa và kiểm tra `BookingProposal` đang ở trạng thái `proposed`, còn hạn và đúng phiên bản.
  3. Tạo bản ghi mới trong bảng `orders`.
  4. Đổi trạng thái `BookingProposal` sang `finalized`.
  5. Đổi trạng thái `ServiceRequest` sang `converted_to_order`.
  6. Ghi sự kiện `order.created` vào bảng `outbox`.
- **Hành vi nghiêm cấm**: Bắt Khách hàng phải bấm xác nhận thêm lần thứ hai (loại bỏ hoàn toàn bước Customer finalize sau khi Worker đã accept).

### 1.4 Hành vi Báo giá (Bidding) và Gợi ý Thợ (Matching)
- **Quy định**: Việc bấm chọn Thợ từ danh sách Báo giá hoặc Gợi ý AI để mở cửa sổ trò chuyện/đàm phán **không làm thay đổi trạng thái của Báo giá và không tự động tạo đơn hàng**.
- **Quy định**: Một Báo giá (`Bid`) chỉ chuyển sang trạng thái `selected` khi nhận được sự kiện `order.created` mang theo đúng `selected_bid_id`.

---

## 2. Quy tắc Tài chính, Hoa hồng & Sổ cái Ví tiền

### 2.1 Đơn vị Tiền tệ & Độ chính xác Tuyệt đối
- **Quy tắc bất biến**: **1 Point = 1 VND**.
- **Quy định**: Toàn bộ số tiền, số dư ví, phí hoa hồng và tiền hoàn lại phải được lưu trữ và tính toán bằng **số nguyên chính xác** (`BigInt` hoặc `Int`). Nghiêm cấm sử dụng kiểu số thực (`Float`, `Double`) trong bất kỳ đoạn mã tài chính nào để tránh lỗi sai số dấu phẩy động.

### 2.2 Tính toán & Snapshot Hoa hồng (Commission)
- **Quy tắc bất biến**: Tỷ lệ hoa hồng áp dụng cho đơn hàng được chụp (snapshot) ngay tại thời điểm nhận sự kiện `order.created` và **không bao giờ được thay đổi hồi tố**.
- **Quy định**: Mức hoa hồng mặc định là **10,00%** (Admin có thể cấu hình từ 0,00% đến 30,00%).
- **Quy định**: Cách tính phí sàn làm tròn theo chuẩn **ROUND_HALF_UP** tới hàng đơn vị VND:
  $$\text{platform\_fee} = \text{round}(\text{gross\_amount} \times \text{commission\_rate})$$
  $$\text{worker\_earning} = \text{gross\_amount} - \text{platform\_fee}$$

### 2.3 Điều kiện Kích hoạt Thanh toán & Giữ tiền
- **Quy tắc bất biến**: Đơn hàng chỉ được phép thanh toán **sau khi Khách hàng bấm xác nhận hoàn thành công việc** (`order.completed`).
- **Quy định**: Sự kiện `order.created` chỉ khởi tạo bản ghi Payment ở trạng thái chờ và snapshot tỷ lệ hoa hồng; **tuyệt đối không được tự động trừ tiền trong ví của Khách hàng**.
- **Quy định**: Thanh toán bằng Point phải do Khách hàng chủ động xác nhận. Thanh toán bằng Tiền mặt chỉ có Thợ được giao đơn mới có quyền xác nhận đã nhận tiền ngoài thực tế.

### 2.4 Chính sách Hoàn tiền (Chính sách Bắt buộc của PO)
- **Quy tắc bất biến**: **Mọi khoản hoàn tiền được duyệt, dù ban đầu thanh toán bằng Tiền mặt hay Point, đều chỉ được hoàn dưới dạng POINT vào ví HandyGo của Khách hàng.**
- **Quy định**: Tuyệt đối không hoàn lại bằng tiền mặt hay chuyển khoản ngân hàng.
- **Quy định**: Mọi yêu cầu hoàn tiền bắt buộc phải có sự phê duyệt của Quản trị viên (`refund.approve`). Khách hàng không có quyền tự duyệt hoàn tiền cho chính mình.
- **Quy định**: Hỗ trợ cả hoàn toàn phần (full refund) và hoàn một phần (partial refund).
- **Quy định**: Nếu hệ thống chưa xác định được nguồn tiền bù đắp hợp lệ (đặc biệt với các đơn tiền mặt do thợ đã cầm tiền), trạng thái hoàn tiền phải chuyển sang `needs_review`; **tuyệt đối không tự ý phát hành (mint) điểm khống khi không có nguồn bảo đảm**.

### 2.5 Tính Toàn vẹn của Sổ cái Ví (Ledger Integrity)
- **Quy tắc bất biến**: Mọi biến động số dư ví phải tuân thủ nguyên tắc ghi sổ kép kế toán.
- **Quy định**: Mỗi giao dịch cộng hoặc trừ điểm phải đi kèm một mã định danh bất biến, không lặp lại (`operationId` / `transactionId`).
- **Quy định**: Không bao giờ được dùng lệnh SQL cập nhật thẳng trường số dư (`UPDATE wallet SET balance = ...`) mà không ghi nhận bản ghi chi tiết vào sổ cái.

---

## 3. Quy tắc Bảo mật & Kiểm soát Quyền hạn Người tham gia

### 3.1 Xác thực Header Cổng API (`TrustedGatewayGuard`)
- **Quy tắc bất biến**: Các microservice phía sau Gateway không bao giờ tin tưởng mù quáng các header danh tính (`x-user-id`, `x-user-roles`) nếu không kiểm tra mã bí mật `x-gateway-secret`.

### 3.2 Kiểm soát Thẩm quyền Truy cập Phòng Chat
- **Quy tắc bất biến**: Cuộc trò chuyện đàm phán đơn hàng chỉ dành riêng cho đúng 2 người: Khách hàng tạo yêu cầu và Thợ được chỉ định.
- **Quy định**: Mọi yêu cầu từ người dùng thứ ba hoặc thợ chưa được ghép nối đều phải bị từ chối với lỗi 403 Forbidden.
- **Quy định**: Tệp đính kèm và hình ảnh gửi trong tin nhắn phải được xác minh quyền sở hữu trước khi hiển thị.
