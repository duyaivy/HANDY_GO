# Kế hoạch sửa lỗi báo giá chat và media review

> **For agentic workers:** Use superpowers:executing-plans for implementation and superpowers:dispatching-parallel-agents for the independent mobile/backend workstreams. Track completed steps below.

**Goal:** Sửa đủ bốn nhận xét trong review: giá cũ trong chat, thiếu thợ ở trang sau, public ID video sai và ảnh thiếu bằng chứng sở hữu.

**Architecture:** Mobile dùng truy vấn báo giá của thợ trong cuộc trò chuyện dưới cùng tiền tố cache candidates, tìm qua các trang khi cần, nhận invalidation từ SSE và kiểm tra lại báo giá trước khi gửi đề xuất. Backend dùng một cơ chế gắn thư mục cho video và yêu cầu bằng chứng quyền sở hữu ảnh, giữ luồng multipart phía server hoạt động.

**Tech Stack:** React Native, TanStack Query, SSE, NestJS, Cloudinary, Jest, Vitest.

**Spec:** `docs/review-chat-bao-gia-va-media-vi.md`.

## Ràng buộc chung

- Không thay đổi giao diện web ngoài phạm vi sửa contract media nếu thực sự cần.
- Không dùng secret dự phòng để xác thực quyền sở hữu; từ chối khi không có bằng chứng hợp lệ.
- Không thêm dependency hoặc migration nếu có thể dùng contract upload hiện có.
- Giữ các thay đổi hiện có của người dùng; không tự push.

## Trọng tâm kiểm tra

- Giá đổi trong lúc hộp xác nhận đang mở: không gửi giá cũ hoặc tự động chấp nhận giá mới thay khách hàng.
- Báo giá bị rút hoặc không tải được: không tạo đề xuất từ dữ liệu cũ.
- Thợ ở trang 2 trở đi; phân trang rỗng hoặc dữ liệu bidding bị lỗi một phần.
- Receipt gắn đúng public ID cuối cùng; receipt sai người hoặc sai asset phải bị từ chối.
- Ảnh có ID sinh tự động, URL giả mạo và multipart hợp lệ phải được xử lý đúng.

## Task 1–2: Báo giá chat mobile

**Files:** `mobile/src/features/chat/chat-deal-bar.tsx`, hook mới trong `mobile/src/features/candidates/hooks/`, các test tương ứng.

- [x] Viết test hồi quy tìm thợ ở trang tiếp theo, làm mới qua invalidation, giá đổi trước lúc xác nhận, báo giá bị rút và lỗi tải.
- [x] Chạy test để xác nhận các tình huống chưa được hỗ trợ.
- [x] Thêm truy vấn tìm đúng thợ, dùng metadata phân trang hiện có và AbortSignal; đặt query key dưới `candidateQueryKeys.byRequest(requestId)`.
- [x] Đăng ký `useBiddingEvents` khi khách hàng đang thương lượng; kiểm tra lại báo giá trước lúc xác nhận/gửi, yêu cầu khách xác nhận lại nếu giá đã đổi.
- [x] Chạy test liên quan, toàn bộ mobile suite, TypeScript và lint phần thay đổi.

**Điều chỉnh sau review:** Lần xác minh trước khi gửi gọi `fetchConversationBid` trực tiếp với AbortController riêng. Không dùng kết quả `refetch` của observer làm bằng chứng mới vì TanStack Query có thể trả cache khi hủy. Test rời màn hình trong lúc xác minh đã tái hiện lỗi trước bản sửa và chạy thành công sau bản sửa.

## Task 3: Public ID và biên nhận video

**Files:** `backend/libs/cloudinary/src/cloudinary.service.ts`, test Cloudinary hiện có.

- [x] Test mô phỏng public ID cuối cùng theo tham số upload, xác minh receipt khớp asset cuối cùng.
- [x] Chạy test đỏ; sửa để thư mục chỉ xuất hiện một lần trong upload và receipt.
- [x] Kiểm tra tương thích client direct-upload và các intent chat/review/thông thường.

## Task 4: Quyền sở hữu ảnh review

**Files:** `backend/apps/user-trust-service/src/user-trust-service.service.ts`, test service; Cloudinary/upload DTO và caller chỉ khi cần thiết.

- [x] Test từ chối URL ảnh không có bằng chứng sở hữu, ảnh người khác, receipt sai; chấp nhận upload hợp lệ và multipart.
- [x] Chạy test đỏ; chọn bằng chứng quyền sở hữu có thể xác minh từ luồng upload hiện tại, không dựa riêng vào việc URL không khớp regex.
- [x] Bảo toàn luồng upload ảnh review thực tế; đọc các caller trước khi thay contract.
- [x] Khi chỉnh sửa, cho phép giữ đúng bộ media/thumbnail có sẵn của đánh giá đã xác thực chủ sở hữu; yêu cầu receipt cho asset mới hoặc thumbnail thay đổi.
- [x] Chạy backend suite và typecheck phù hợp; báo rõ các lỗi môi trường hoặc có sẵn.

## Hoàn tất

- [x] Đọc lại diff hai nhóm, kiểm tra không có thay đổi ngoài phạm vi.
- [x] Cập nhật trạng thái kế hoạch và tổng hợp bằng chứng kiểm thử, giới hạn xác minh.

## Kết quả kiểm tra

### Mobile

- `cd mobile && ./node_modules/.bin/jest --runInBand --forceExit --silent`: **101 suites, 777 tests thành công**.
- `cd mobile && ./node_modules/.bin/tsc --noEmit`: thành công.
- ESLint trên 6 file mobile thay đổi/thêm mới: thành công.
- Review độc lập: đã sửa trường hợp hủy truy vấn trả cache cũ; không còn phát hiện cần xử lý ở phần mobile.

### Contract media

- Receipt mới gắn với `ownerId:mediaType:publicId`, được ký bằng secret Cloudinary đã cấu hình; không dùng secret mặc định hoặc tên đường dẫn làm bằng chứng sở hữu.
- Upload ảnh công khai qua gateway trả thêm `uploadReceipt`; gửi receipt cùng media URL khi tạo review.
- Thumbnail tải riêng cần `thumbnailUploadReceipt`; thumbnail trích từ chính video đã xác minh dùng cùng public ID qua resource `video/upload` và đuôi ảnh.
- Receipt cũ không có ràng buộc loại media phải được cấp lại trước khi dùng để thêm media mới. Đánh giá đã lưu không bị thay đổi bởi bản sửa.

### Backend

- Bộ test tập trung: `cd backend && ./node_modules/.bin/vitest run libs/cloudinary/src apps/user-trust-service/test/user-review-flow.spec.ts apps/user-trust-service/src/user-trust-service.service.spec.ts apps/api-gateway/src/uploads`: **8 file, 228 tests thành công**.
- Toàn bộ suite: `cd backend && ./node_modules/.bin/vitest run --silent`: **229 file thành công, 14 file bỏ qua; 1971 tests thành công, 153 bỏ qua; không có test thất bại**, exit 0.
- Các test HTTP cần chạy ngoài sandbox để mở cổng localhost. Lần chạy sandbox ban đầu gặp `EPERM`; kết quả trên là lần chạy lại đầy đủ sau khi cấp quyền chạy ngoài sandbox và sửa fixture receipt cũ.
- `./node_modules/.bin/tsc --noEmit -p tsconfig.build.json` và `./node_modules/.bin/tsc --noEmit -p tsconfig.prisma.json`: thành công sau khi generate lại Prisma client local; không sửa schema hoặc thêm migration.
- Oxlint trên 9 file backend thay đổi/thêm mới: thành công.
- Review độc lập: đã sửa hồi quy giữ ảnh multipart khi edit; không còn phát hiện cần xử lý.

### Giới hạn xác minh

- Chưa upload asset thực lên Cloudinary; test kiểm tra tham số ký, ID cuối cùng và receipt theo contract SDK. Cloudinary quy định `folder` được thêm vào trước `public_id`: https://cloudinary.com/documentation/image_upload_api_reference.
- Các test tích hợp được cấu hình bỏ qua trong suite vẫn chưa chạy; không suy diễn kết quả thành xác nhận triển khai production.
