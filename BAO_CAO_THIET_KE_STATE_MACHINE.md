# HandyGo — Báo cáo State Machine & giao tiếp Microservices (v3.1)

> **Phạm vi:** Order (bao gồm Service Request và Booking Proposal), Bidding, Matching, Tracking. Đây là **hợp đồng thiết kế đề xuất cho team triển khai**, không phải API/event đã tồn tại. Chat **chưa triển khai**. Thay đổi v3.1: **Worker chấp nhận Proposal → tạo Order ngay**; bỏ bước Customer finalize lần hai.

## 1. Luồng nghiệp vụ đã chốt

```text
Customer tạo Service Request (draft) → Publish Request (open_for_bidding)
  ├─ Matching: xếp hạng và hiển thị TOP 3 mặc định
  └─ Bidding: nhận báo giá; Bid mới được cập nhật lên đầu UI
Customer chọn thợ từ Bid hoặc Recommendation để TRAO ĐỔI
  (Chat chưa triển khai; click không chốt, không tạo Order)
Customer gửi Booking Proposal: GIÁ + PHẠM VI + LỊCH làm
  ├─ Worker ĐỒNG Ý đúng Proposal/phiên bản hiện tại
  │    → Order Service tạo Order NGAY trong 1 PostgreSQL transaction
  │    → Request = converted_to_order; Proposal = finalized
  │    → phát order.created qua RabbitMQ; Tracking nhận event
  ├─ Worker YÊU CẦU CHỈNH SỬA
  │    → Proposal cũ = changes_requested (lưu lý do / nội dung cần sửa)
  │    → Customer tạo phiên bản Proposal MỚI thay thế, Worker duyệt lại
  └─ Không chốt được
       → Worker reject / Customer withdraw Proposal
       → Customer có thể thử thợ khác hoặc cancel Service Request
Sau khi có Order: thực hiện → báo hoàn thành → khách xác nhận hoàn thành.
```

**Không được gọi là “hủy Order” trước khi `orders` có bản ghi.** Thương lượng thất bại chỉ hủy/rút Proposal; nếu bỏ nhu cầu, hủy Request. Khi Order đã tồn tại và cần hủy, dùng `order.cancelled`. MVP giữ **1 Request → tối đa 1 Order** (`orders.service_request_id UNIQUE`); nếu Order đã bị hủy thì muốn thuê lại phải tạo Request mới.

## 2. State Machine & owner

| Aggregate (service sở hữu) | Chuyển trạng thái chính | Quy tắc quan trọng |
|---|---|---|
| **Request** (Order) | `draft → open_for_bidding → bidding_closed`; từ `open_for_bidding` hoặc `bidding_closed` → `converted_to_order` / `cancelled` / `expired` | `bidding_closed` chỉ ngừng Bid mới, không tự đóng thương lượng. `converted_to_order` chỉ được chuyển **trong transaction tạo Order**. |
| **Booking Proposal** (Order) | `proposed → finalized` **khi Worker accept và tạo Order cùng transaction**; hoặc `proposed → changes_requested / worker_rejected / withdrawn / expired / superseded` | Proposal đã gửi **bất biến** về giá/phạm vi/lịch. Worker yêu cầu sửa bằng lý do; Customer tạo Proposal mới (`supersedes_proposal_id`, `revision_no`) thay vì sửa đè. **Không cần `worker_accepted` trung gian**. |
| **Bidding Round** (Bidding) | `pending → open → closed / no_bid`; khi có `order.created` → `finalized` | Round kết thúc không kích hoạt AI. AI gợi ý mặc định khi Request publish. |
| **Bid** (Bidding) | `active → withdrawn / expired / selected / rejected` | `selected` **chỉ sau `order.created` có `selected_bid_id` tương ứng**. Click vào Bid để trao đổi không thay đổi trạng thái Bid. |
| **Matching Run** (Matching) | `pending → processing → completed / failed` | Chạy khi Request publish; lưu Top 5 và bảng xếp hạng. Không chờ `no_bid`. |
| **Order** (Order) | `created → confirmed → in_progress → awaiting_customer_confirmation → completed` (có thể `cancelled / disputed` theo guard) | `confirmed` nếu dùng chỉ là xác nhận sẵn sàng thực hiện, **không phải xác nhận lại Proposal**. |
| **Tracking** (Tracking) | Không có state machine chung | Chỉ append timeline theo `service_request_id` của Request, Matching, Bid, Proposal, Order; **không tự sửa trạng thái nghiệp vụ**. |

**Guard khi tạo phiên bản mới:** Proposal cũ phải thuộc cùng Request/Customer/Worker, đã `changes_requested`; `revision_no = previous.revision_no + 1`. Chỉ Customer có quyền gửi Proposal sửa đổi.

**Guard khi Worker chấp nhận:** Worker đúng người nhận; Proposal còn `proposed`, chưa hết hạn; tham số điều khoản đúng `proposalId/revision`; Request còn được phép chốt, chưa có Order; nguồn Bid/Recommendation hợp lệ. Trong **một transaction của Order Service**: lock Request (`SELECT ... FOR UPDATE`), khóa Proposal, tạo Order, cập nhật Request `converted_to_order`, Proposal `finalized`, các Proposal khác `superseded`, ghi audit + outbox. Lần accept trùng phải trả Order đã tạo hoặc conflict nhất quán, không nhân đôi Order.

## 3. Khi nào dùng REST API, khi nào dùng RabbitMQ?

- **REST API qua API Gateway**: client thực hiện command hoặc query **cần kết quả ngay**, ví dụ đăng Request, gửi Bid, gửi Proposal, Worker yêu cầu sửa / đồng ý, lấy Top 5, lấy Timeline.
- **Internal HTTP/RPC**: gọi **đồng bộ để kiểm tra điều kiện tại thời điểm quyết định**, ví dụ Order xác thực Bid thuộc Request/Worker hoặc Bidding kiểm tra Request còn mở. API nội bộ **không public ra client**.
- **RabbitMQ (topic exchange, event-driven)**: phát sự kiện **sau khi commit** để Matching, Bidding, Tracking, Notification/Gateway cập nhật độc lập. **RabbitMQ không dùng để quyết định đồng bộ việc tạo Order**; chính Order Service phải làm transaction và trả response cho Worker.
- **WebSocket tới frontend**: đẩy Bid mới/Matching hoàn tất; RabbitMQ là kênh **giữa backend services**, không phải kết nối trực tiếp với trình duyệt/mobile.

### 3.1. REST API do từng team sở hữu (đường dẫn đề xuất, tiền tố `/api/v1`)

| Team sở hữu | API (Method + Path) | Mục đích |
|---|---|---|
| **Order** | `POST /service-requests`, `POST /service-requests/:id/publish`, `POST /service-requests/:id/cancel` | Tạo, công bố, hủy Request khi chưa có Order. |
| **Matching** | `GET /matching/requests/:id/recommendations` | Top 5 phù hợp theo Request revision hiện tại. |
| **Bidding** | `POST /requests/:id/bids`, `GET /requests/:id/bids`, `PATCH /bids/:id`, `POST /bids/:id/withdraw` | Thợ gửi/sửa/rút Bid; khách xem danh sách Bid. |
| **Order** | `POST /booking-proposals`, `GET /booking-proposals/:id` | Tạo và xem điều khoản Proposal chính xác; Customer đề nghị giá/phạm vi/lịch, `selectionSource=bid|recommendation`; khi sửa gửi `supersedesProposalId`. |
| **Order** | `POST /booking-proposals/:id/request-changes` | Worker yêu cầu Customer sửa (body gồm `reason` / trường cần điều chỉnh); **chưa có Order**. |
| **Order** | `POST /booking-proposals/:id/accept` | Worker chấp nhận đúng phiên bản, **tạo Order ngay**, trả `orderId` trong response. |
| **Order** | `POST /booking-proposals/:id/reject`, `POST /booking-proposals/:id/withdraw` | Worker từ chối / Customer rút Proposal; **không hủy Order**. |
| **Order** | `GET /orders/:id`, `POST /orders/:id/start`, `POST /orders/:id/finish`, `POST /orders/:id/confirm-completion`, `POST /orders/:id/cancel` | Xem/vận hành/hủy Order sau khi đã tạo. |
| **Tracking** | `GET /tracking/requests/:id/timeline`, `GET /tracking/orders/:id/timeline` | Đọc timeline toàn luồng / phần Order. |
| **Gateway/BFF** | `GET /requests/:id/candidates` | Tổng hợp `bids[]` **ở trên** và `recommendations[]` **ở dưới**; không ghi DB của hai service. |

**Loại bỏ** API `POST /booking-proposals/:id/finalize` do Customer thực hiện. Phía frontend phải chuyển bước cuối sang **Worker accept**; trường hợp cần sửa thì **Customer submit phiên bản mới**, không cho Worker sửa trực tiếp điều khoản của Customer.

### 3.2. Internal API / service contract cần thống nhất trước khi chia việc

| Bên gọi → Bên nhận | API nội bộ đề xuất | Mục đích & thời điểm |
|---|---|---|
| **Bidding → Order** | `GET /internal/service-requests/:id/bidding-eligibility` | Trước khi nhận Bid: Request có đang mở, đúng thời hạn và được phép nhận báo giá? |
| **Order → Bidding** | `GET /internal/bids/:bidId/eligibility?requestId=&workerId=` | Khi tạo Proposal từ Bid: xác nhận Bid thuộc Request, do đúng Worker gửi, còn hợp lệ. |
| **Order → Matching** | `GET /internal/matching/results/:resultId/eligibility?requestId=&workerId=` | Khi tạo Proposal từ AI: xác thực Match Result và Worker thực sự nằm trong kết quả hợp lệ. |
| **Order/Matching → User & Trust** | Internal Worker eligibility (chốt route với team User & Trust) | Kiểm tra Worker/KYC/trạng thái tài khoản trước khi accept hoặc xếp hạng. |
| **Gateway/BFF → Bidding & Matching** | `GET` danh sách Bid / Recommendation ở bảng trên | Trả một response tổng hợp cho màn hình, tránh frontend gọi chéo các DB. |

Đây là **hợp đồng dự kiến**; team thống nhất DTO, mã lỗi và authentication của internal API trước khi code. Không có foreign key hoặc query SQL trực tiếp sang database service khác. Không dùng event eventual-consistent làm bằng chứng duy nhất cho thao tác cần chống chốt sai/chốt trùng.

### 3.3. RabbitMQ events giữa các module (bất đồng bộ)

| Event do service phát | Consumer / Team nhận | Tác dụng |
|---|---|---|
| **Order:** `service_request.created` | **Tracking** | Ghi bước tạo Request (kể cả draft). |
| **Order:** `service_request.published` | **Matching, Bidding, Tracking** | Matching tạo Top 5, Bidding mở round; Tracking ghi timeline. Hai tác vụ chạy **song song**. |
| **Order:** `service_request.cancelled` | **Bidding, Matching, Tracking** | Dừng nhận Bid/đề xuất; ghi lịch sử. |
| **Bidding:** `bid.submitted`, `bid.revised`, `bid.withdrawn` | **Tracking, Notification/Gateway** | Ghi timeline và đẩy cập nhật Bid qua WebSocket. Không tạo Order. |
| **Matching:** `matching.completed`, `matching.failed` | **Tracking, Notification/Gateway** | Ghi kết quả / trạng thái AI; frontend cập nhật Top 5. |
| **Order:** `booking_proposal.created`, `booking_proposal.changes_requested`, `booking_proposal.rejected`, `booking_proposal.withdrawn` | **Tracking, Notification** | Timeline và nhắc Customer/Worker xử lý; **chưa có Order**. |
| **Order:** `booking_proposal.finalized` + `order.created` | **Tracking; Bidding nhận `order.created`** | Chỉ phát sau transaction accept thành công. Bidding `finalized` round, đánh dấu Bid thắng (nếu từ Bid); Tracking liên kết `order_id`. |
| **Order:** `order.status.changed`, `order.completed`, `order.cancelled` | **Tracking, Notification; Payment/Review khi cần** | Cập nhật timeline và tác vụ hậu xử lý. |

**Quy ước RabbitMQ:** dùng topic exchange (ví dụ `handygo.domain.events`) và **queue riêng cho mỗi subscriber** (`matching.request-events`, `bidding.request-order-events`, `tracking.domain-events`, …); không cho hai service khác nhau tranh nhau consume cùng một queue nếu cả hai cần nhận sự kiện. Envelope thống nhất: `eventId`, `eventType`, `serviceRequestId`, `aggregateId`, `aggregateVersion`, `occurredAt`, `correlationId`, `actorUserId`, `payload`. Publisher ghi **transactional outbox**; consumer dedupe bằng `eventId`, ACK sau xử lý, có retry/DLQ. Event Tracking đến sai thứ tự vẫn phải ghép đúng flow. Không đưa thông tin nhạy cảm/toàn văn Chat vào event.

## 4. Trách nhiệm team và Definition of Done

| Team | Owns DB / logic | Không được làm |
|---|---|---|
| **Order** | `service_requests`, `booking_proposals`, `orders`; Worker accept **tạo Order atomically**; publish events | Không sửa Bid/Matching DB. |
| **Bidding** | `bidding_rounds`, `bids`, `bid_revisions`; nghe Request publish / Order created | Không tự tạo Order, không coi click chọn Bid là chốt. |
| **Matching** | `match_runs`, `match_results`; gợi ý Top 5 mặc định | Không chỉ chạy khi hết Bid và không tạo Order. |
| **Tracking** | `tracking_flows`, `tracking_events`; consume toàn bộ event flow | Không sở hữu hay chuyển state của Request/Bid/Order. |

**Cần cập nhật DBML Order v3 (đã đồng bộ trong gói đi kèm):** thêm `booking_proposal_status.changes_requested`, thêm `supersedes_proposal_id`, `revision_no`; bỏ trạng thái trung gian `worker_accepted` và API Customer finalize. Các enum còn lại và DBML Bidding/Matching/Tracking không đổi. Nếu đã có dữ liệu cũ, thiết kế migration riêng trước khi chạy thật.

**Kiểm thử tối thiểu:** (1) click Chat không tạo Order; (2) Worker yêu cầu sửa → Customer gửi Proposal v2 → Worker duyệt v2, không thể accept v1; (3) Worker accept tạo duy nhất một Order và trả `orderId`; (4) hai Worker accept song song cùng Request chỉ một thành công; (5) không chốt được thì chỉ cancel Request/Proposal; (6) RabbitMQ duplicate/reordered events không tạo trùng Order/Tracking; (7) Bid UI cập nhật realtime, Matching Top 5 vẫn tồn tại.

> **Ghi chú:** DBML mô tả schema, không tự enforce transition. Team Order cần thực thi State Machine guards bằng NestJS + PostgreSQL transaction; các service khác xử lý events theo contract thống nhất. Chưa kiểm chứng DBML bằng migration PostgreSQL thực tế.
