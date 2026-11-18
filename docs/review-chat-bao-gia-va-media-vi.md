# Review: Báo giá trong chat và media đánh giá

## Tổng quan

Bản thay đổi có thể gửi giá thỏa thuận đã cũ, bỏ sót thợ nằm ngoài trang ứng viên đầu tiên và có lỗi liên quan đến biên nhận tải lên cũng như quyền sở hữu ảnh.

Các bài kiểm thử backend và mobile tập trung vào phần thay đổi đã chạy thành công, nhưng chưa bao phủ các tình huống dưới đây.

## 1. [P1] Cập nhật dữ liệu báo giá khi người dùng đang mở chat

**Vị trí:** `mobile/src/features/chat/chat-deal-bar.tsx:42–45`

Khi thợ điều chỉnh giá trong lúc khách hàng vẫn ở màn hình chat, truy vấn danh sách ứng viên không tự cập nhật định kỳ và cũng chưa đăng ký nhận sự kiện qua `useBiddingEvents` hiện có.

Tin nhắn chat vẫn cập nhật, nhưng giá hiển thị và giá trị `agreedPrice` được gửi khi nhấn **“Chọn thợ này”** vẫn có thể là giá cũ. Thao tác kéo để tải lại chỉ làm mới dữ liệu chat nên không giải quyết được sự sai lệch này.

**Hướng khắc phục:** Đăng ký nhận sự kiện báo giá để làm mới bộ nhớ đệm truy vấn, hoặc đối soát lại dữ liệu báo giá trước khi chọn thợ.

## 2. [P2] Tìm báo giá của thợ trong cuộc trò chuyện ngoài trang ứng viên đầu tiên

**Vị trí:** `mobile/src/features/chat/chat-deal-bar.tsx:143–145`

`useCandidates` mặc định chỉ lấy trang 1 với 20 báo giá. Giao diện khách hàng chỉ tìm thợ đang trò chuyện trong tập kết quả này.

Nếu báo giá của thợ nằm ở trang tiếp theo, thanh báo giá sẽ biến mất dù báo giá vẫn còn hiệu lực, khiến khách hàng không thể chọn thợ từ chat.

**Hướng khắc phục:** Truy vấn trực tiếp báo giá của thợ đang trò chuyện, hoặc tìm tiếp ở các trang còn lại; không coi trang đầu tiên là toàn bộ danh sách.

## 3. [P2] Ký biên nhận theo public ID cuối cùng trên Cloudinary

**Vị trí:** `backend/libs/cloudinary/src/cloudinary.service.ts:204–209`

Đối với media đánh giá, `publicId` đã chứa `folder`, nhưng cả hai giá trị vẫn được đưa vào tham số tải lên có chữ ký. Cloudinary thêm `folder` vào trước `public_id`, khiến ID tài nguyên cuối cùng bị lặp thư mục.

Biên nhận lại được tính theo ID chưa bị lặp. Vì vậy, khi gửi URL tải lên được trả về cùng biên nhận, bước `validateReviewMedia` sẽ thất bại.

**Hướng khắc phục:** Chỉ dùng một cơ chế thêm tiền tố thư mục và tính biên nhận theo đúng ID tài nguyên cuối cùng.

## 4. [P2] Bắt buộc có bằng chứng xác nhận quyền sở hữu ảnh đánh giá

**Vị trí:** `backend/apps/user-trust-service/src/user-trust-service.service.ts:3309–3315`

Ảnh vượt qua bước xác thực quyền sở hữu nếu URL không khớp quy ước đặt tên dựa trên UUID đang được kiểm tra. Tuy nhiên, `uploadImage` lưu ảnh thông thường trong thư mục cấu hình với ID được sinh tự động, bao gồm cả ảnh do người dùng khác tải lên.

Do đó, khách hàng có thể đính kèm URL ảnh của người khác vào một đánh giá được công khai mà không cần bằng chứng sở hữu.

**Hướng khắc phục:** Lưu thông tin chủ sở hữu khi tải ảnh lên hoặc cấp biên nhận cho ảnh. Bắt buộc xác nhận ảnh thuộc về người dùng, thay vì chỉ từ chối các đường dẫn nhận diện được là của người khác.

---

Tài liệu này là bản dịch tiếng Việt của kết quả review được cung cấp; chưa xác minh lại các nhận xét và chưa áp dụng bản sửa.
