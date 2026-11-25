# BÁO CÁO RÀ SOÁT MÃ NGUỒN HANDY GO

## Chức năng HG-92: Mời thợ gợi ý báo giá và xác nhận đề xuất

Ngày rà soát: 25/11/2026 (Asia/Ho_Chi_Minh).

Phiên bản được kiểm tra: `87bea8c2ffc8b73c79a16aa19d6511fd5a4cac61`.

Cập nhật khắc phục ngày 25/11/2026: các thay đổi README và test thông báo trong working tree trên phiên bản này, chưa commit.

Phương pháp: đọc diff, truy vết các thành phần liên quan, chạy kiểm thử tự động, kiểm tra kiểu và lint. Đây là báo cáo rà soát có hỗ trợ bằng công cụ, không thay thế biên bản nghiệm thu trên hệ thống triển khai thực tế.

## 1. Tóm tắt kết quả

HG-92 thay luồng chọn trực tiếp thợ gợi ý bằng lời mời báo giá. Khách hàng chỉ được tạo đề xuất khi thợ đã có báo giá và khách xác nhận mức giá, phiên bản báo giá. Luồng chat và thông báo được nối vào quy trình này.

Trong phạm vi kiểm tra, chưa xác nhận lỗi logic mới cần chặn phát hành ở luồng HG-92. Lần rà soát ban đầu có 263 kiểm thử đạt; kiểm tra kiểu backend và mobile đều đạt. Hai phát hiện ban đầu đã được xử lý: cập nhật liên kết hướng dẫn chạy trong hai README chính và bổ sung bốn test trực tiếp cho thao tác mở thông báo `quote_invitation.created`.

Kết luận bàn giao: hai phát hiện trong báo cáo đã được khắc phục và kiểm tra lại. Chưa đủ bằng chứng để kết luận hệ thống đã được nghiệm thu tích hợp hoặc sẵn sàng vận hành production.

## 2. Phạm vi và cơ sở đánh giá

Workspace sạch khi bắt đầu. Commit mới nhất `87bea8c2` chỉ xóa 60 file tài liệu, tổng cộng 10.125 dòng văn bản; không thay đổi mã nguồn giao diện mặc dù tên commit có nội dung “improve UI interactions”.

Để kiểm tra lại phần nghiệp vụ liên quan đến kết quả review trước, phạm vi mở rộng gồm ba commit HG-92:

| Commit | Nội dung |
| --- | --- |
| `89bf43cd` | Thêm lời mời báo giá cho thợ được gợi ý |
| `45575565` | Điều chỉnh tích hợp thông báo và tạo chat |
| `c95d8a3b` | Bắt buộc xác nhận phiên bản và giá báo trước khi tạo đề xuất |
| `87bea8c2` | Xóa tài liệu và tác động đến các liên kết còn tồn tại |

Diff mã nguồn được đối chiếu từ `19836cbc` đến HEAD, gồm 39 file thuộc backend/mobile, với 983 dòng thêm và 156 dòng xóa. Các thành phần liên quan được đọc thêm gồm gateway proxy, guard nhận diện người dùng, xác minh báo giá ở Bidding Service, xác minh gợi ý ở Matching Service, outbox publisher, topology RabbitMQ, payload push và màn hình thợ nhận requestId.

Đánh giá đồng thời giả định có nhiều người dùng và nhiều request API cùng lúc theo kiến trúc microservice hiện có. Đây là giả định để đọc cơ chế khóa và chống trùng, không phải kết quả đo tải. Không rà soát toàn bộ mọi chức năng của repository.

## 3. Kết quả truy vết nghiệp vụ

### 3.1. Khách hàng gửi lời mời báo giá

Luồng: radar → `QuoteInvitationModal` → `OrdersApi.createQuoteInvitation` → gateway → `QuoteInvitationsController` → `QuoteInvitationsService` → PostgreSQL/outbox.

- API kiểm tra UUID, kiểu lời nhắn và giới hạn 500 ký tự. Guard xác minh secret từ gateway và user ID hợp lệ.
- Service chỉ cho chủ yêu cầu gửi lời mời; từ chối tự mời chính mình; yêu cầu phải còn mở và chưa qua thời hạn nhận báo giá.
- Nguồn gợi ý được xác minh qua Matching Service. Lỗi mạng hoặc nguồn không đủ điều kiện dẫn đến từ chối thao tác.
- Transaction khóa dòng yêu cầu bằng `FOR UPDATE`, đọc lại trạng thái và matching revision trước khi ghi.
- Khóa duy nhất `(service_request_id, worker_user_id)` và kiểm tra bản ghi trước/sau khi khóa hỗ trợ gửi lại mà không tạo thêm lời mời.
- Lời mời và event được ghi trong cùng transaction. Lời nhắn được bỏ khoảng trắng đầu/cuối; chuỗi trống thành null.
- Khi đọc danh sách, chủ yêu cầu xem các lời mời của mình; người khác bị giới hạn theo worker ID của chính họ.

Các nhận định trên dựa trên mã nguồn và unit test. Chưa chạy hai transaction PostgreSQL thật đồng thời để xác nhận hành vi tranh chấp khóa của tính năng mới.

### 3.2. Thợ nhận thông báo và xem lời nhắn

Luồng: outbox `quote_invitation.created` → RabbitMQ → Notification Service → thông báo trong ứng dụng/push → `/worker?requestId=...` → modal báo giá.

- Outbox publisher cung cấp envelope có source `order-service`; Notification Service đăng ký routing key thông qua danh sách event dùng chung.
- Contract kiểm tra các ID của invitation, request, customer và worker; router chọn người nhận là thợ được mời.
- Chính sách mặc định của thông báo trong ứng dụng là mandatory; chính sách push mặc định là optional. Hai kênh có chính sách riêng, không thể suy từ việc tạo thông báo thành công rằng thiết bị chắc chắn nhận push.
- Payload push có requestId để điều hướng đúng yêu cầu. Mobile xử lý event mới ở cả màn hình thông báo và listener khi bấm thông báo hệ điều hành.
- Modal thợ đọc lời mời đúng worker hiện đăng nhập; request bị hủy khi effect kết thúc để tránh cập nhật từ phản hồi cũ.

Đã đọc nối luồng producer–consumer–mobile và chạy các test liên quan. Đợt khắc phục đã bổ sung test mobile trực tiếp cho event mới ở cả hai điểm mở thông báo. Chưa gửi push FCM thật tới thiết bị.

### 3.3. Khách xác nhận giá và tạo đề xuất

Luồng: chọn báo giá trên radar hoặc chat → hộp thoại xác nhận → `OrdersApi.createProposal` → `BookingProposalsService` → verifier của Bidding Service → transaction lưu proposal.

- Mobile bỏ cách tạo proposal trực tiếp từ recommendation và mức giá tự gán 200.000 đồng trong nhánh đó.
- Hai caller nghiệp vụ hiện tại của `OrdersApi.createProposal` là radar và chat; cả hai đều gửi `sourceBidId`, `expectedBidVersion` và giá đã xác nhận.
- Backend từ chối proposal mới có nguồn recommendation; kiểm tra version là số nguyên không âm và giá là số hữu hạn lớn hơn 0.
- Verifier so sánh phiên bản và số tiền với dữ liệu từ Bidding Service. Nếu khác, trả lỗi `BID_TERMS_CHANGED` để khách kiểm tra và xác nhận lại.
- Chat đọc lại báo giá trước khi gửi; nếu báo giá khác nội dung khách vừa xác nhận thì dừng thao tác. Radar làm mới dữ liệu khi gặp lỗi giá thay đổi.
- Proposal không tự trở thành order; vẫn cần thao tác chấp nhận độc lập của thợ.

Việc so khớp giá là bằng chứng tại thời điểm xác minh từ Bidding Service; báo cáo không khẳng định có transaction phân tán khóa đồng thời hai cơ sở dữ liệu.

### 3.4. Tạo chat khi event báo giá đến đồng thời

`MessageService.create` kiểm tra lại quyền một lần khi generation thay đổi trong lúc xác minh. Nếu quyền vẫn thay đổi hoặc quá hạn 2 giây, thao tác bị từ chối. Test xác minh cả trường hợp kiểm tra lại được cấp quyền và bị thu hồi quyền; trường hợp bị từ chối không ghi conversation.

Đăng ký dependency của Order Common Module cũng được kiểm tra: hai token publisher trỏ đến cùng `OrderOutboxPublisherService`, giữ đúng envelope của Order Service.

## 4. Phát hiện và kiến nghị

### 1. Đã khắc phục: liên kết hướng dẫn chạy trỏ tới file đã bị xóa

Mức độ: P2 — ảnh hưởng tài liệu vận hành và khả năng tái hiện demo, chưa phải lỗi runtime.

Vị trí: `backend/README.md:3`, `mobile/README.md:72`; file bị xóa là `docs/HUONG_DAN_BUILD_VA_CHAY.md` trong commit `87bea8c2`.

Tình huống xác nhận: người mới hoặc giảng viên bấm “hướng dẫn ngắn” trong một trong hai README sẽ mở đường dẫn không tồn tại. Cả hai README còn chỉ định tài liệu này để xử lý khác biệt giữa hướng dẫn cũ và quy trình mới, nên liên kết hỏng làm mất điểm tham chiếu được ưu tiên.

Sửa tối thiểu: khôi phục tài liệu nếu vẫn dùng làm hướng dẫn chuẩn, hoặc cập nhật cả hai README sang hướng dẫn thay thế thực sự tồn tại và đủ bước chạy. Cần kiểm tra các liên kết nội bộ bị ảnh hưởng trước khi chốt hồ sơ.

Nếu bỏ qua: người nhận có thể không tái hiện được quy trình chuẩn bị môi trường và demo từ hướng dẫn chính thức.

Kết quả khắc phục: cả hai README đã trỏ tới các mục cài đặt, cấu hình, Docker Compose và Metro trong README hiện có. Đã kiểm tra đủ 7 liên kết ở hai đoạn hướng dẫn, gồm đường dẫn file và tên mục đích. Không khôi phục hướng dẫn cũ đã bị xóa.

### 2. Đã khắc phục: thiếu test trực tiếp cho thao tác mở thông báo hỏi giá

Mức độ: khoảng trống kiểm thử; chưa xác nhận lỗi điều hướng đang xảy ra.

Vị trí code mới: `mobile/src/features/notifications/notification-lifecycle.tsx:66` và `mobile/src/features/notifications/notification-screen.tsx:64`.

Bằng chứng ban đầu: test lifecycle chỉ có tình huống điều hướng trực tiếp với `matching.eligible_workers.ready`; không có tình huống trực tiếp sử dụng `quote_invitation.created` trong hai bộ test thông báo. Test modal thợ đã kiểm tra hiển thị lời nhắn khi được mở, nhưng không chứng minh thao tác bấm event mới sẽ mở đúng yêu cầu.

Sửa tối thiểu: bổ sung test event `quote_invitation.created` cho listener hệ điều hành và mục thông báo trong ứng dụng; xác nhận route giữ đúng requestId. Ít nhất một tình huống cần dùng tài khoản có vai trò Worker nhưng đang ở chế độ Customer để kiểm tra chuyển chế độ.

Nếu bỏ qua: thay đổi sai event hoặc làm mất requestId trong hai handler có thể không bị phát hiện trước khi demo, dù test modal vẫn đạt.

Kết quả khắc phục: bổ sung 4 test. Hai test danh sách thông báo kiểm tra tài khoản có cả hai vai trò đang ở chế độ Customer/Worker; hai test listener hệ điều hành kiểm tra lấy chi tiết thành công và fallback khi offline từ chế độ Customer. Tất cả đều xác nhận chế độ cuối là Worker và route giữ requestId của yêu cầu thay vì dùng entityId của lời mời.

## 5. Bằng chứng kiểm thử thực thi

Môi trường công cụ: Node.js `v24.18.0`, pnpm `11.24.0`. Lệnh chạy trên dependency hiện có, không cài thêm hoặc cập nhật dependency.

| Hạng mục | Phạm vi | Kết quả |
| --- | --- | --- |
| Backend — lượt 1 | Booking proposals, source verifier, controller/DTO, quote invitations, DI publisher, chat regressions, notification contracts | 7 file, 146 test đạt |
| Backend — lượt 2 | Push policy, push payload, event consumer ACK/retry, Bidding Service | 4 file, 50 test đạt |
| Mobile — lượt 1 | Radar giá/sắp xếp, modal thợ/chat entry, chat deal bar, order D4 | 5 bộ, 52 test đạt |
| Mobile — lượt 2 | Notification lifecycle, notification screen, worker home/deep link | 3 bộ, 15 test đạt |
| Backend typecheck | Script `pnpm run typecheck`, gồm tsconfig.build và tsconfig.prisma | Đạt, exit code 0 |
| Mobile typecheck | `tsc --noEmit` | Đạt, exit code 0 |
| Backend lint | `pnpm run lint` | Exit code 0, còn 8 cảnh báo |
| Mobile lint | 8 file code nghiệp vụ thay đổi, liệt kê ở phụ lục | Đạt, không có output lỗi/cảnh báo |

Tổng đợt rà soát ban đầu: 263 test đạt trong 19 file/bộ kiểm thử; không dùng lại con số 158 của phản hồi trước. Backend typecheck đã chạy thành công, thay thế trạng thái “bị chặn bởi project references” trong kết quả trước.

Đợt khắc phục: chạy lại hai bộ test notification, 14/14 test đạt, gồm 10 test cũ và 4 test mới. Mobile typecheck và lint hai file test đã sửa đều đạt; 7 liên kết README được kiểm tra file đích và heading đích. Không cộng lại 10 test cũ vào tổng kiểm thử. Backend không thay đổi mã nguồn nên không chạy lại suite backend trong đợt khắc phục.

Tám cảnh báo lint backend nằm trong `message-optimization.spec.ts` (4), `broker.ts` (1), `runtime.spec.ts` (1), `benchmark-socket-ack.spec.ts` (2). Các file này không thuộc diff mã nguồn HG-92 đang xét; không tính chúng là lỗi mới của thay đổi.

Jest còn cảnh báo thiếu cấu hình Mapbox trong một số test và lỗi mạng ở fixture worker home; các assertion vẫn đạt. Các lượt chạy dùng `--forceExit`, nên kết quả không chứng minh ứng dụng không còn async handle chưa đóng. Không coi các cảnh báo đó là kiểm thử kết nối thật thành công.

## 6. Giới hạn kiểm chứng và công việc còn lại

- Chưa chạy toàn bộ test của repository, build APK/iOS hoặc kiểm tra thao tác trên thiết bị thật.
- Chưa chạy migration mới trên PostgreSQL thật; chưa kiểm tra rollback và tranh chấp lời mời bằng nhiều kết nối database thực.
- Chưa chạy end-to-end với gateway, Matching, Bidding, Order, RabbitMQ, Notification và FCM cùng hoạt động.
- Chưa kiểm thử tải, độ trễ push hoặc mô phỏng nhiều replica dưới tải thật.
- Chưa xác minh phần triển khai thực tế có đúng migration, secret và chính sách notification/push đã đọc trong mã nguồn hay không.
- Đợt khắc phục sửa hai README, hai file test và báo cáo; không thay đổi code nghiệp vụ, không commit, không triển khai và không gửi ra ngoài.

Hai phát hiện 1 và 2 đã xử lý. Trước buổi nghiệm thu còn cần chạy một kịch bản tích hợp thật: khách hỏi giá → thợ nhận/mở thông báo → xem lời nhắn → gửi báo giá → khách xác nhận → thử đổi giá trước khi gửi proposal → xác nhận lại → thợ chấp nhận → hình thành order. Lưu bằng chứng thao tác và log đã che thông tin nhạy cảm.

## Phụ lục: lệnh kiểm tra có thể chạy lại

Thực hiện tại thư mục `backend/`:

```sh
./node_modules/.bin/vitest run apps/order-service/src/booking-proposals apps/order-service/src/service-requests/quote-invitations.service.spec.ts apps/order-service/src/common/order-common.module.spec.ts apps/message-service/src/review-regressions.spec.ts apps/notification-service/src/events/events.spec.ts
./node_modules/.bin/vitest run apps/notification-service/src/push/push-policy.spec.ts apps/notification-service/src/push/push-payload.spec.ts apps/notification-service/src/events/event-consumer.service.spec.ts apps/bidding-service/src/bids/bids.service.spec.ts
pnpm run typecheck
pnpm run lint
```

Thực hiện tại thư mục `mobile/`:

```sh
./node_modules/.bin/jest --runInBand --forceExit --runTestsByPath src/app/customer/booking/__tests__/customer-booking-radar-bids-price.test.tsx src/app/customer/booking/__tests__/customer-booking-radar-bids-sorting.test.tsx src/features/bidding/__tests__/worker-chat-entry.test.tsx src/features/chat/__tests__/chat-deal-bar.test.tsx src/features/orders/__tests__/order-d4-integration.test.tsx
./node_modules/.bin/jest --runInBand --forceExit --runTestsByPath src/features/notifications/__tests__/notification-lifecycle.test.tsx src/features/notifications/__tests__/notification-screen.test.tsx src/features/home/worker/__tests__/worker-home-screen.test.tsx
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint src/app/customer/booking/radar.tsx src/features/bidding/components/worker-bid-modal.tsx src/features/chat/chat-deal-bar.tsx src/features/notifications/notification-lifecycle.tsx src/features/notifications/notification-screen.tsx src/features/orders/api/orders.api.ts src/features/orders/customer/quote-invitation-modal.tsx src/features/orders/types/order.types.ts
```

Ghi chú tái lập: lệnh backend lượt 2 thực tế có thêm một đường dẫn test Matching không tồn tại. Vitest chỉ chạy 4 file tồn tại nêu trên; báo cáo không tính bất kỳ test Matching nào từ lượt này. Lệnh ở phụ lục đã bỏ đường dẫn không tồn tại đó.
