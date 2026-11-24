# HG-92 — Hỏi giá thợ được gợi ý

## Mục tiêu

Khách có thể hỏi giá một thợ được AI gợi ý và gửi kèm lời nhắn ngắn. Thợ gửi báo giá ban đầu, hai bên trao đổi trong chat và thợ có thể cập nhật báo giá trước khi khách gửi đề xuất đặt lịch.

## Phương án

- **A — Mời báo giá:** Ít thay đổi hơn, nhưng khách phải chờ báo giá mới gửi được câu hỏi.
- **B — Mời báo giá kèm lời nhắn một chiều (đã chọn):** Khách cung cấp ngữ cảnh ngay. Báo giá hợp lệ mở luồng chat hiện có.
- **C — Mời chat trước báo giá:** Hữu ích khi cần trao đổi dài trước khi định giá, đồng thời cần mở rộng chính sách chat và vòng đời quyền gửi.

## Luồng thực hiện

1. Thẻ gợi ý AI giữ thông tin thợ, bỏ giá riêng và đổi nút **Chọn thợ** thành **Hỏi giá**. Giữ khoảng giá chung với nhãn **Chi phí ước tính tham khảo**.
2. Khách xem tên thợ và yêu cầu, nhập lời nhắn văn bản ngắn tùy chọn, rồi bấm **Gửi hỏi giá**. Backend lưu lời mời gắn với yêu cầu và thợ. Lời mời không tạo báo giá, đề xuất đặt lịch hay đơn hàng.
3. Thợ nhận thông báo, mở lời mời và xem lời nhắn trong ngữ cảnh yêu cầu. Thợ có thể bỏ qua hoặc gửi báo giá ban đầu qua nghiệp vụ báo giá hiện có. Khách thấy **Chờ thợ báo giá** trong thời gian chờ.
4. Khi có báo giá hợp lệ, khách thấy **Xem báo giá** và **Nhắn tin**. Nếu thợ đã có báo giá hợp lệ lúc khách xem thẻ, hiển thị các hành động này ngay. Lời nhắn ban đầu nằm trong lời mời, quyền chat tiếp tục được xác minh theo báo giá và trạng thái đơn hiện hành.
5. Khi trao đổi, thợ cập nhật báo giá bằng luồng nghiệp vụ báo giá. Khách xác nhận giá và phạm vi cụ thể trước khi gửi đề xuất đặt lịch. Backend đối chiếu phiên bản báo giá khách vừa xác nhận. Nếu giá đổi hoặc báo giá mất hiệu lực, app tải lại và yêu cầu khách xác nhận lại. Thợ chấp nhận đề xuất thì đơn mới được tạo. Nếu đã có đề xuất chờ xác nhận và điều khoản cần đổi, dùng luồng sửa đổi đề xuất hiện có.

## Ràng buộc

- Backend kiểm tra khách sở hữu yêu cầu, cặp yêu cầu–thợ có gợi ý hợp lệ, yêu cầu còn nhận báo giá và thợ còn đủ điều kiện. Chỉ các bên liên quan được xem lời mời.
- Một lời mời đang chờ cho mỗi cặp yêu cầu–thợ. Gửi lại cùng thao tác trả kết quả hiện có và không phát thông báo trùng. Lời mời đang chờ hết hiệu lực khi yêu cầu ngừng nhận báo giá.
- Giá dùng để chốt đến từ báo giá đã được khách xác nhận. Điểm AI, giá tham khảo và lời nhắn không quyết định giá chốt.
- Phạm vi gồm thẻ gợi ý, lời mời và liên kết tới báo giá/chat. Giữ thuật toán xếp hạng, luồng báo giá thông thường và chính sách chat hiện có.

## Kiểm chứng

Kiểm tra chủ yêu cầu gửi lời mời có hoặc không có lời nhắn, gửi trùng, truy cập sai người và yêu cầu đóng. Xác minh lời mời chưa mở chat, báo giá hợp lệ mở chat đúng cặp, thợ cập nhật giá và khách phải xác nhận lại nếu đang xem giá cũ. Xác minh đơn chỉ được tạo sau khi thợ chấp nhận đề xuất.


## Bổ sung được yêu cầu triển khai ngày 2026-11-25

Theo [định hướng hoàn thiện](2026-11-25-hg-92-fix-direction-design.md), tiếp tục B. Radar và chat phải xác nhận điều khoản trước khi tạo đề xuất; payload giữ giá, phiên bản, phạm vi và lịch hẹn đã xem. Backend chỉ tạo đề xuất từ báo giá thật, bắt buộc phiên bản và đối chiếu giá. Quy tắc này áp dụng cả đề xuất sửa đổi; dữ liệu lịch sử và verifier nguồn gợi ý cho lời mời được giữ lại.

Cập nhật mobile trước backend. Client cũ thiếu phiên bản phải nâng cấp; chưa kiểm kê các bản cài đặt ngoài repo.
