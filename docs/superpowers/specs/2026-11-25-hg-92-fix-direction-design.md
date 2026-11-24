# HG-92 — Định hướng hoàn thiện luồng hỏi giá thợ gợi ý

- Ngày: 2026-11-25.
- Nhánh: `feature/HG-92-recommended-worker-quote-request`.
- Mốc code được đối chiếu: `45575565`.
- Trạng thái: **Người dùng yêu cầu triển khai ngày 2026-11-25; áp dụng B và quy tắc backend cho mọi đề xuất mới.**
- Cơ sở: [thiết kế HG-92 hiện tại](2026-11-21-hg-92-recommended-worker-quote-request-design.md) và [kế hoạch trước đó](../plans/2026-11-21-hg-92-implementation.md).

## 1. Mục tiêu và giới hạn

Khách xem thợ được gợi ý, hỏi giá và có thể trao đổi để làm rõ công việc trước khi gửi đề xuất đặt lịch. Giá chốt phải đến từ báo giá hợp lệ mà khách vừa xác nhận; giá AI chỉ để tham khảo. Thợ chấp nhận đề xuất thì hệ thống mới tạo đơn.

Giữ phương án B đã ghi trong thiết kế cũ làm cơ sở: khách gửi lời mời báo giá kèm câu hỏi một chiều; chat hai chiều chỉ mở sau báo giá hợp lệ. Việc viết tài liệu này không đồng nghĩa người dùng đã chấp thuận mọi thay đổi bổ sung bên dưới.

Không đổi thuật toán xếp hạng, tạo hệ thống chat thứ hai, sinh báo giá giả để mở chat, hoặc bắt khách phải gửi tin nhắn mới được đặt lịch. Không thay đổi quy tắc thanh toán hay vòng đời đơn hàng.

## 2. Các phương án

| Phương án | Trải nghiệm | Đánh đổi |
| --- | --- | --- |
| A. Mời báo giá không kèm câu hỏi | Khách mời thợ báo giá rồi mới trao đổi | Đơn giản nhưng thiếu thông tin đầu vào cho thợ; kém hơn chức năng đã có |
| B. Mời báo giá kèm lời nhắn — đề xuất tiếp tục | Khách gửi câu hỏi; thợ báo giá; hai bên chat và sửa giá trước khi chốt | Giữ business chat hiện tại; khách phải chờ báo giá mới trao đổi hai chiều |
| C. Chat trước báo giá | Khách và thợ trao đổi ngay từ lời mời | Cần thiết kế quyền chat theo lời mời, thời hạn, thu hồi quyền và chống spam; là thay đổi business riêng |

Tài liệu này định hướng hoàn thiện B. Nếu yêu cầu bắt buộc là **chat hai chiều trước báo giá**, cần chọn C và thiết kế lại quyền chat trước khi triển khai; chỉ đổi nút trên mobile không đáp ứng yêu cầu đó.

## 3. Hiện trạng đã xác minh từ code

- `mobile/src/app/customer/booking/radar.tsx`: thẻ AI đã bỏ giá riêng và hành động gửi đề xuất; nút “Trao đổi” mở modal hỏi giá. Khoảng giá tham khảo chung vẫn giữ.
- `mobile/src/features/orders/customer/quote-invitation-modal.tsx`: gửi lời nhắn tối đa 500 ký tự, giải thích chỉ nhắn tin sau khi thợ báo giá.
- `backend/apps/order-service/src/service-requests/quote-invitations.service.ts`: kiểm tra chủ yêu cầu, nguồn gợi ý, trạng thái nhận báo giá; lưu lời mời và outbox trong cùng transaction, chống gửi trùng theo yêu cầu–thợ.
- Notification đưa thợ đến luồng báo giá; `worker-bid-modal.tsx` tải và hiển thị lời nhắn.
- Gateway loại thợ đã báo giá khỏi nhóm gợi ý; radar hiển thị báo giá và nút “Nhắn tin” trong nhóm báo giá. Không cần nhân đôi thẻ thợ hoặc chat entry.
- Chat vẫn kiểm tra quyền theo báo giá và trạng thái yêu cầu/đơn; lời mời không tự mở chat.
- Chat deal bar có xác nhận trước khi gửi đề xuất. Radar gọi gửi đề xuất ngay khi nhấn “Chọn thợ”.
- Backend vẫn nhận đề xuất có `selectionSource=recommendation`. Với nguồn `bid`, so sánh giá/phiên bản chỉ được bật khi client truyền `expectedBidVersion`.

## 4. Các sửa đổi đề xuất

### 4.1. Gọi đúng tên hành động hỏi giá

Đổi “Trao đổi” trên thẻ AI thành **“Hỏi giá”**, tiêu đề modal thành **“Hỏi giá thợ …”**, trạng thái sau gửi thành **“Chờ thợ báo giá”**. Giữ giải thích: “Bạn có thể nhắn tin sau khi thợ gửi báo giá.” Khi yêu cầu đóng, trạng thái phải thể hiện đã hết thời gian hỏi giá.

Giữ nội dung lời nhắn, giới hạn độ dài, chống gửi lặp và xử lý lỗi hiện có. Cập nhật test tìm nút theo nhãn. Không đổi nhãn “Nhắn tin” của chat thật.

### 4.2. Xác nhận giá và phạm vi ở cả radar lẫn chat

Trước khi radar gửi đề xuất, hiển thị tên thợ, giá từ báo giá, phạm vi và lịch hẹn nếu có, với hai lựa chọn **“Quay lại”** và **“Gửi đề xuất”**. Dùng mẫu xác nhận hiện có trong chat; không thêm framework hoặc abstraction nếu chỉ cần một hộp xác nhận.

Payload phải dùng đúng giá, phiên bản và phạm vi đã hiển thị trong lần xác nhận. Nếu dữ liệu cập nhật trong lúc khách đang xem hộp xác nhận, không âm thầm gửi điều khoản mới. Backend từ chối bản cũ, mobile tải lại và yêu cầu xác nhận lại.

Hủy xác nhận không gọi API. Việc có chat là lựa chọn của khách; bước xác nhận điều khoản mới là điều kiện trước khi gửi đề xuất.

### 4.3. Cưỡng chế nguồn báo giá tại backend

Đề xuất business: API tạo đề xuất mới chỉ chấp nhận nguồn báo giá thật, có giá và phiên bản đã xác nhận. Không chỉ dựa vào việc mobile đã ẩn nút chọn từ gợi ý.

- Chặn tạo đề xuất mới trực tiếp từ `recommendation` với lỗi nghiệp vụ rõ ràng, yêu cầu lấy báo giá trước.
- Bắt buộc `expectedBidVersion` cho đề xuất mới từ `bid`; thiếu phiên bản phải thất bại trước khi ghi dữ liệu.
- Luôn kiểm tra báo giá thuộc đúng yêu cầu/thợ, còn hợp lệ, giá và phiên bản khớp; không chỉ kiểm tra giá dương.
- Giữ mã `BID_TERMS_CHANGED` cho điều khoản đã đổi để mobile tải lại và yêu cầu xác nhận lại.
- Giữ verifier của nguồn gợi ý vì việc tạo **lời mời hỏi giá** vẫn sử dụng nó. Không xóa enum/schema hoặc dữ liệu đề xuất lịch sử chỉ để chặn đường tạo mới.
- Không thay quy tắc thợ chấp nhận đề xuất rồi mới tạo đơn.

Đây là thay đổi hợp đồng API. Trước khi áp dụng phải rà tất cả caller, fixture và bài kiểm thử tạo đề xuất, bao gồm client cũ còn được hỗ trợ. Nếu client cũ không gửi phiên bản, cần thống nhất thứ tự cập nhật client/backend hoặc cơ chế phiên bản API. Không giữ một đường bỏ qua kiểm tra giá chỉ để làm test cũ pass.

## 5. Luồng đích

```text
Thẻ AI: thông tin thợ + Xem hồ sơ + Hỏi giá (không có giá riêng)
  → Nhập câu hỏi tùy chọn → Gửi hỏi giá → Chờ thợ báo giá
  → Thợ xem lời nhắn và gửi báo giá thật
  → Khách thấy thợ trong nhóm báo giá, có Nhắn tin
  → Có thể trao đổi và cập nhật báo giá theo quy tắc hiện hành
  → Khách xem và xác nhận giá/phạm vi/lịch hẹn
  → Gửi đề xuất → Thợ chấp nhận → Tạo đơn
```

Thợ đã có báo giá hợp lệ đi thẳng vào nhóm báo giá, không cần mời hỏi giá lại. Lời mời chưa được trả lời không tạo báo giá, hội thoại có quyền gửi, đề xuất hay đơn hàng.

## 6. Phạm vi triển khai và thứ tự

1. Rà caller tạo đề xuất và chốt tương thích client cũ; đối chiếu lại các rule trong spec cũ.
2. Sửa nhãn hỏi giá và thêm xác nhận ở radar; giữ hành vi chat hiện có.
3. Siết DTO/service tạo đề xuất và kiểm tra điều khoản; cập nhật caller, test, fixture và tài liệu API bị ảnh hưởng.
4. Chạy kiểm thử hồi quy, sau đó kiểm chứng hành trình khách–thợ qua các service.
5. Cập nhật spec/kế hoạch cũ sau khi hướng này được duyệt; ghi rõ phần nào đã chạy thật, phần nào dùng mock.

Các điểm sửa chính: radar, quote invitation modal, DTO/service booking proposals và test tương ứng. Verifier dùng chung, chat deal bar, notification, candidate aggregation và worker bid form cần được rà hồi quy; không mặc định phải viết lại các phần đang hoạt động.

## 7. Tiêu chí nghiệm thu

| Tình huống | Kết quả cần đạt |
| --- | --- |
| Thợ AI chưa báo giá | Không có giá riêng hoặc nút tạo đề xuất; có Hỏi giá |
| Gửi hỏi giá, gửi lặp hoặc gửi đồng thời | Một lời mời và một sự kiện thông báo; không tạo đề xuất/đơn |
| Sai chủ yêu cầu, sai nguồn gợi ý hoặc yêu cầu đóng | Không tạo lời mời mới; không phát thông báo mới |
| Người không liên quan đọc lời mời | Không thấy lời nhắn của người khác |
| Có lời mời nhưng chưa có báo giá hợp lệ | Không được mở quyền chat hai chiều |
| Thợ báo giá | Khách thấy báo giá và mở chat đúng cặp; không trùng thẻ gợi ý |
| Radar hoặc chat: hủy xác nhận | Không gọi API tạo đề xuất |
| Xác nhận đúng điều khoản | Gửi đúng giá/phạm vi/phiên bản đã xem; chờ thợ chấp nhận |
| Giá/phiên bản thay đổi hoặc báo giá hết hiệu lực | Không tạo đề xuất với điều khoản cũ; thông báo và tải lại phù hợp |
| Gọi API trực tiếp bằng nguồn gợi ý hoặc thiếu phiên bản | Bị từ chối theo hợp đồng mới, trước khi ghi dữ liệu |
| Đề xuất lịch sử và luồng sửa đổi đề xuất | Vẫn đọc và xử lý đúng quy tắc được giữ lại |
| Đơn kết thúc hoặc quyền chat bị thu hồi | Quy tắc chat hiện có vẫn được áp dụng |

Ưu tiên mở rộng các suite radar bids-price, chat-deal-bar, quote-invitations, booking-proposals và proposal-source-verifier. Test phải kiểm tra API không bị gọi khi hủy, dữ liệu không bị ghi khi từ chối và lỗi điều khoản cũ, thay vì chỉ kiểm tra nhãn.

Chạy typecheck mobile/backend và kiểm tra diff. Kiểm chứng tích hợp với hai tài khoản khách–thợ: hỏi giá → thông báo → báo giá → chat → sửa giá → xác nhận lại → chấp nhận → tạo đơn. Mock đơn lẻ không đủ chứng minh toàn bộ hành trình hoặc việc giao thông báo thực tế.

## 8. Quyết định triển khai ngày 2026-11-25

Người dùng yêu cầu triển khai tài liệu này: tiếp tục B, áp dụng quy tắc báo giá thật và phiên bản cho mọi đề xuất mới, bao gồm bản sửa đổi. Các mô tả “đề xuất/chưa phê duyệt” ở phần trên là ngữ cảnh tại thời điểm soạn bản định hướng.

Đã rà hai caller thực tế trong repo: radar và chat. Cập nhật fixture tạo đề xuất trong unit test, HTTP test và script mô phỏng. Mobile phát hành trước backend; client bên ngoài repo không gửi phiên bản phải nâng cấp, không giữ đường bỏ qua kiểm tra. Chưa có bằng chứng kiểm kê phiên bản client đang cài ngoài repo.

Xem kết quả chạy và giới hạn tại [kế hoạch triển khai](../plans/2026-11-21-hg-92-implementation.md). Các bằng chứng cũ không được tính là kết quả kiểm thử cho lần sửa này.
