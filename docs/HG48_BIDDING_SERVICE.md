# HG-48: Phân tích & Triển khai Bidding Service (Hệ thống Quản lý Báo giá & Vòng Đấu thầu)

Tài liệu này tổng hợp toàn diện kiến trúc kỹ thuật, lý thuyết cốt lõi, mô hình dữ liệu (Database Schema), các máy trạng thái (State Machines), danh mục API RESTful/Internal, giao thức sự kiện RabbitMQ, các cơ chế kiểm soát đồng thời (Concurrency Control) và bảo đảm khả năng chịu lỗi (Fault-Tolerance) cho **Bidding Service** trong hệ sinh thái vi dịch vụ HandyGo.

---

## 1. Tổng quan & Vị trí Kiến trúc (Architecture Overview)

Bidding Service là vi dịch vụ chịu trách nhiệm vận hành toàn bộ cơ chế đấu thầu kín (Sealed Bidding) và kết nối báo giá giữa Khách hàng (Customer) và Thợ (Worker) cho các yêu cầu dịch vụ được công khai (`service_request.published`).

```
+---------------------------------------------------------------------------------------------------+
|                                      API GATEWAY (Port 3000)                                      |
|  - Định tuyến prefix: /api/v1/bids/*, /api/v1/requests/* -> bidding-service:3005                   |
|  - Xác thực JWT RS256, tiêm Header: x-internal-secret, x-user-id, x-user-roles                    |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
                     +----------------------------------------------------------+
                     |                 BIDDING SERVICE (Port 3005)              |
                     |  - NestJS v12 (Modular Feature-based Architecture)       |
                     |  - Prisma Client (@prisma/bidding-client) + PostgreSQL   |
                     |  - Schema cô lập: bidding_service                        |
                     |  - Transactional Outbox (Lease-based Claim)              |
                     |  - Inbound Idempotency Consumer (Inbox Pattern)          |
                     |  - REST Controllers: RoundsController, BidsController    |
                     |  - Event Consumers: BiddingEventsConsumer                |
                     |  - Background Scheduler: RoundExpirationSchedulerService |
                     +--------------+----------------------------+--------------+
                                    |                            |
                 HTTP (Internal)    |                            | RabbitMQ Topic Exchange
                 x-internal-secret  |                            | [ handy-go.events ]
                                    v                            v
  +-------------------------------------+  +--------------------------------------------------------+
  |            ORDER SERVICE            |  | SỰ KIỆN PHÁT RA (PUBLISH):                             |
  |             (Port 3004)             |  |  - bidding.round.opened                                |
  |                                     |  |  - bidding.round.extended (Anti-sniping)               |
  | GET /internal/bids/:id/eligibility  |  |  - bidding.round.closed / no_bid                       |
  |   (Xác thực điều kiện tạo Proposal) |  |  - bidding.round.finalized / cancelled                 |
  |                                     |  |  - bid.submitted / bid.revised / bid.withdrawn         |
  | GET /internal/service-requests/     |  |                                                        |
  |   :id/bidding-eligibility           |  | SỰ KIỆN LẮNG NGHE (CONSUME):                           |
  |   (Fail-Closed check trước khi Bid) |  |  - service_request.published                           |
  +-------------------------------------+  |  - service_request.cancelled                           |
                                           |  - order.created                                       |
                                           |  - bidding.round.expire_check                          |
                                           +--------------------------------------------------------+
```

---

## 2. Lý thuyết Cứng & Các Nguyên tắc Bất biến (Hard Invariants & Core Principles)

Hệ thống Bidding Service được thiết kế tuân thủ nghiêm ngặt 11 nguyên tắc lý thuyết kỹ thuật bất biến:

### 2.1. Bất biến 1: Không tự tạo Đơn hàng (Order Invariant)
Bidding Service chỉ quản lý vòng đấu thầu (`bidding_rounds`), danh sách báo giá (`bids`), và lịch sử sửa đổi báo giá (`bid_revisions`). Tuyệt đối **không tự tạo bản ghi đơn hàng (`orders`)**. Quyền sở hữu và tạo đơn hàng thuộc duy nhất về `order-service`.

### 2.2. Bất biến 2: Click-to-Chat không làm thay đổi trạng thái Báo giá (Click-to-Chat Invariant)
Khi khách hàng bấm vào một báo giá để trò chuyện, trao đổi hoặc thương lượng với thợ, hành động này **tuyệt đối không chuyển `bid.status` sang `selected`**. Trạng thái `selected` chỉ được cập nhật duy nhất khi Bidding Service nhận được sự kiện `order.created` chính thức phát ra từ `order-service`.

### 2.3. Bất biến 3: Mỗi Thợ chỉ có tối đa 1 Báo giá cho 1 Phiên (Single Bid Invariant)
Mỗi thợ (`worker_id`) chỉ được nộp duy nhất một báo giá cho một phiên đấu thầu (`UNIQUE(bidding_round_id, worker_id)`). Mọi nỗ lực nộp thêm báo giá mới trong cùng một phiên sẽ bị từ chối với mã lỗi `409 Conflict`. Khi muốn cập nhật giá hoặc nội dung, thợ bắt buộc phải sử dụng API điều chỉnh (`PATCH /api/v1/bids/:id`).

### 2.4. Bất biến 4: Khóa lạc quan nguyên tử (Optimistic Concurrency Control - CAS)
Mọi thao tác cập nhật báo giá (`PATCH /api/v1/bids/:id`) và rút báo giá (`POST /api/v1/bids/:id/withdraw`) đều sử dụng kỹ thuật **Atomic Compare-And-Swap (CAS)** trực tiếp tại mức cơ sở dữ liệu:
```sql
UPDATE "bidding_service"."bids"
SET amount = :newAmount,
    message = :newMessage,
    version = version + 1,
    updated_at = :now
WHERE id = :bidId
  AND worker_id = :workerId
  AND version = :expectedVersion
  AND status = 'active';
```
Nếu có 2 request đồng thời gửi lên cùng một `version`, chỉ có duy nhất 1 request cập nhật thành công (`count = 1`), request còn lại nhận `count = 0` và bị từ chối ngay lập tức với lỗi `409 Conflict` (Optimistic lock mismatch), ngăn ngừa triệt để lỗi mất dữ liệu do ghi đè (Lost Update).

### 2.5. Bất biến 5: Transactional Outbox & Inbound Idempotent Inbox Pattern
- **Transactional Outbox:** Mọi thao tác ghi dữ liệu nghiệp vụ (tạo bid, sửa bid, rút bid, mở/đóng round) đều ghi kèm một sự kiện tương ứng vào bảng `outbox_events` trong **cùng một transaction ACID**. Một worker định kỳ quét và phát tán sự kiện ra RabbitMQ, đảm bảo tính chất **At-Least-Once Delivery**.
- **Inbound Idempotent Inbox:** Mọi sự kiện tiêu thụ từ RabbitMQ (`service_request.published`, `service_request.cancelled`, `order.created`) đều được kiểm tra tính trùng lặp qua bảng `consumed_events` với khóa chính `event_id`. Nếu sự kiện bị broker gửi lại nhiều lần (duplicate delivery), consumer nhận diện ngay lập tức và bỏ qua idempotently, không gây tác dụng phụ trùng lặp.

### 2.6. Bất biến 6: Cơ chế Tự động gia hạn chống đầu cơ giây cuối (Anti-Sniping Mechanism)
Nhằm triệt tiêu hành vi tiêu cực của thợ cố tình đợi những giây cuối cùng để chốt giá rẻ hơn đối thủ mà không cho đối thủ cơ hội phản ứng:
- **Cửa sổ kích hoạt (`Trigger Window`):** 30 giây cuối cùng trước khi phiên đóng (`closes_at - now <= 30s`).
- **Thời gian gia hạn (`Extension Duration`):** Tự động cộng thêm **2 phút** (`closes_at = closes_at + 2m`).
- **Giới hạn số lần (`Max Extensions`):** Tối đa **3 lần** gia hạn cho một phiên (tổng thời gian gia hạn tối đa 6 phút).
- Khi Anti-Sniping kích hoạt, hệ thống cập nhật `closes_at` và bắn sự kiện `bidding.round.extended` ra RabbitMQ để các client mobile cập nhật lại đồng hồ đếm ngược theo thời gian thực.

### 2.7. Bất biến 7: Kiểm soát chống lạm dụng điều chỉnh giá (Anti-Abuse Controls)
- **Giới hạn số lần sửa (`MAX_BID_REVISIONS`):** Thợ chỉ được phép sửa báo giá tối đa **5 lần** cho một yêu cầu. Vượt quá 5 lần sẽ bị từ chối với lỗi `400 Bad Request`.
- **Khoảng cách thời gian tối thiểu giữa 2 lần sửa (`MIN_REVISION_INTERVAL_MS`):** Thợ phải đợi tối thiểu **2 phút** giữa hai lần sửa giá liên tiếp. Hệ thống tính toán dựa trên `revised_at` của lần sửa gần nhất và trả về số giây còn phải chờ nếu thợ gửi quá nhanh.
- **Bảo toàn lịch sử:** Mọi lần sửa đổi đều tạo một bản ghi bất biến trong `bid_revisions` lưu vết `previous_amount`, `new_amount`, `previous_message`, `new_message`, và `revision_no`.

### 2.8. Bất biến 8: Cơ chế Đấu thầu Kín (Sealed Bidding / Blind Bidding & Data Masking)
Nhằm tạo môi trường cạnh tranh lành mạnh và công bằng:
- **Thợ đối thủ (Competitor Workers) và Người dùng vãng lai:** Khi truy vấn danh sách báo giá (`GET /api/v1/requests/:id/bids`), toàn bộ thông tin nhạy cảm của các thợ khác sẽ bị che mờ (`isMasked = true`, `amount = 0`, `message = '[Báo giá kín - Chỉ khách hàng sở hữu yêu cầu mới có quyền xem]'`, `workerProfile = null`). Thợ chỉ thấy được số lượng báo giá đang cạnh tranh mà không biết đối thủ ra giá bao nhiêu.
- **Khách hàng sở hữu yêu cầu (Request Owner Customer):** Được xem toàn bộ danh sách báo giá với giá thực, lời nhắn, thông tin chi tiết và hồ sơ thợ đã được làm giàu uy tín (`averageRating`, `completedOrderCount`, `distanceKm`).
- **Thợ chính chủ (Bid Owner Worker):** Xem được đầy đủ thông tin báo giá của chính mình.
- **Admin / Operator:** Có quyền xem toàn bộ dữ liệu minh bạch phục vụ kiểm duyệt và đối soát.

### 2.9. Bất biến 9: Xác minh Điều kiện Tham gia Đấu thầu theo nguyên tắc Fail-Closed
Trước khi cho phép thợ nộp báo giá, Bidding Service gọi sang `order-service` qua API nội bộ (`GET /api/v1/internal/service-requests/:id/bidding-eligibility?workerId=:workerId`):
- Xác nhận yêu cầu dịch vụ thực sự tồn tại, đang ở trạng thái nhận báo giá (`published`), và thợ nằm trong danh sách được phép đấu thầu.
- **Nguyên tắc Fail-Closed (R02/F04):** Nếu `order-service` gặp sự cố (mạng lỗi, DNS sập, timeout 3s, hoặc trả lỗi 5xx), Bidding Service **chặn ngay lập tức** và trả về `503 Service Unavailable`, tuyệt đối không cho phép nộp báo giá mập mờ.

### 2.10. Bất biến 10: Kiến trúc Dead-Letter Không Mất Dữ Liệu (Zero Message Loss)
- Khi consumer xử lý sự kiện thất bại do lỗi tạm thời (Transient error như DB lock, mạng), hệ thống nack có requeue với bounded retry tối đa 3 lần.
- Sau 3 lần thất bại hoặc khi gặp lỗi hợp đồng cố định (Permanent error), consumer gọi `persistDeadLetter` để ghi lại bản ghi chết vào `outbox_events` với `status = 'failed'` và `aggregateType = 'dead_letter'`.
- **Bảo vệ toàn vẹn tuyệt đối:** Consumer chỉ thực hiện `channel.nack(..., requeue=false)` khi và chỉ khi DB đã xác nhận lưu thành công (`persisted === true`). Nếu DB chính bị sự cố không thể ghi dead-letter, consumer kích hoạt chế độ dự phòng `requeue = true`, delay 2s và yêu cầu RabbitMQ giữ lại message trong hàng đợi cho đến khi DB phục hồi, tuyệt đối không vứt bỏ message vào hư vô.
- **Content Hashing:** Sử dụng SHA-256 fingerprint trên nội dung message khi `eventId` bị thiếu, giúp consumer theo dõi số lần thử chính xác xuyên suốt các lần redelivery dù broker cấp `deliveryTag` mới.

### 2.11. Bất biến 11: Xử lý Sự kiện Đến Ngược Thứ Tự bằng Tombstone (Out-of-Order Tombstones)
Trong hệ thống phân tán, sự kiện huỷ (`service_request.cancelled`) hoặc sự kiện chốt đơn (`order.created`) có thể đến trước sự kiện mở phiên (`service_request.published`):
- Nếu nhận được `cancelled` hoặc `order.created` khi chưa có bản ghi round tương ứng trong DB, Bidding Service tự động tạo một bản ghi **Tombstone** với trạng thái `cancelled` hoặc `finalized`.
- Khi sự kiện `service_request.published` đến muộn sau đó, consumer kiểm tra thấy round đã tồn tại ở trạng thái kết thúc (terminal state) sẽ bỏ qua ngay lập tức, không mở lại phiên đã huỷ.

---

## 3. Mô hình Dữ liệu Chi tiết (Database Schema & PostgreSQL Models)

Tất cả bảng dữ liệu của Bidding Service được đặt trong schema riêng biệt: `bidding_service`.

### 3.1. Sơ đồ Quan hệ Thực thể (ERD Diagram)

```mermaid
erDiagram
    bidding_rounds ||--o{ bids : "chứa các báo giá"
    bids ||--o{ bid_revisions : "chứa lịch sử sửa đổi"
    
    bidding_rounds {
        uuid id PK
        uuid service_request_id UK "Unique 1:1 với Request"
        uuid customer_id "Khách hàng sở hữu yêu cầu"
        bidding_round_status status "open, closed, no_bid, finalized, cancelled"
        timestamptz opens_at "Thời điểm bắt đầu mở phiên"
        timestamptz closes_at "Thời điểm kết thúc phiên"
        int bid_count "Số lượng báo giá đã nộp"
        timestamptz created_at
        timestamptz updated_at
    }

    bids {
        uuid id PK
        uuid bidding_round_id FK "Thuộc vòng đấu thầu"
        uuid service_request_id "Mã yêu cầu dịch vụ"
        uuid worker_id "Mã thợ nộp báo giá"
        decimal amount "Mức giá báo (12, 2)"
        text message "Lời nhắn / cam kết của thợ"
        timestamptz valid_until "Thời hạn hiệu lực của báo giá"
        bid_status status "active, withdrawn, expired, selected, rejected"
        int version "Phiên bản khóa lạc quan (OCC)"
        timestamptz submitted_at "Thời điểm gửi báo giá lần đầu"
        timestamptz created_at
        timestamptz updated_at
    }

    bid_revisions {
        uuid id PK
        uuid bid_id FK "Thuộc báo giá"
        int revision_no "Số thứ tự lần sửa (1..5)"
        decimal previous_amount "Giá cũ"
        decimal new_amount "Giá mới"
        text previous_message "Lời nhắn cũ"
        text new_message "Lời nhắn mới"
        timestamptz revised_at "Thời điểm thực hiện sửa"
    }

    outbox_events {
        uuid id PK
        varchar aggregate_type "bid, bidding_round, dead_letter"
        uuid aggregate_id "Mã thực thể liên quan"
        varchar event_type "Tên sự kiện phát ra"
        int event_version "Phiên bản schema sự kiện"
        jsonb payload "Dữ liệu sự kiện"
        varchar status "pending, published, failed, dlq_retry"
        int retry_count "Số lần thử phát tán"
        text last_error "Lỗi gần nhất nếu có"
        timestamptz next_retry_at "Thời điểm quét lại tiếp theo"
        timestamptz created_at
        timestamptz published_at
    }

    consumed_events {
        varchar event_id PK "Mã định danh duy nhất của event"
        varchar event_type "Loại sự kiện đã xử lý"
        timestamptz consumed_at "Thời điểm tiêu thụ"
    }
```

### 3.2. Chi tiết các Kiểu Liệt kê (Enums)

#### Enum `bidding_round_status`
| Giá trị | Ý nghĩa nghiệp vụ |
|---|---|
| `pending` | Phiên đã tạo nhưng chưa đến thời điểm mở (`now < opens_at`). |
| `open` | Phiên đang mở, thợ có thể nộp và sửa báo giá (`opens_at <= now < closes_at`). |
| `closed` | Phiên kết thúc đúng hạn và có ít nhất 1 báo giá hợp lệ đang active. |
| `no_bid` | Phiên kết thúc đúng hạn nhưng không có báo giá hợp lệ nào (`activeBidCount = 0`). |
| `finalized` | Khách hàng đã chốt đơn hàng (`order.created`) chọn thợ thắng cuộc. Trạng thái kết thúc (Terminal). |
| `cancelled` | Yêu cầu dịch vụ bị hủy (`service_request.cancelled`). Trạng thái kết thúc (Terminal). |

#### Enum `bid_status`
| Giá trị | Ý nghĩa nghiệp vụ |
|---|---|
| `active` | Báo giá hợp lệ đang có hiệu lực, khách hàng có thể chọn. |
| `withdrawn` | Thợ chủ động rút báo giá khi phiên còn mở. |
| `expired` | Báo giá hết hạn hiệu lực do vượt quá `valid_until`. |
| `selected` | Báo giá được khách hàng lựa chọn thành công qua đơn hàng chính thức. |
| `rejected` | Báo giá không được chọn (bị từ chối tự động khi phiên kết thúc chọn thợ khác hoặc phiên bị huỷ). |

### 3.3. Danh mục Ràng buộc & Chỉ mục Hiệu năng (Indexes & Constraints)
1. `UNIQUE(bidding_rounds.service_request_id)`: Đảm bảo quan hệ 1:1 nghiêm ngặt giữa Service Request và Bidding Round.
2. `INDEX(bidding_rounds.status, bidding_rounds.closes_at)`: Tối ưu hóa truy vấn của `RoundExpirationSchedulerService` để quét các phiên hết hạn định kỳ mà không cần scan toàn bộ bảng.
3. `UNIQUE(bids.bidding_round_id, bids.worker_id)`: Đảm bảo bất biến mỗi thợ chỉ có tối đa 1 báo giá trong 1 phiên.
4. `INDEX(bids.service_request_id, bids.status)`: Tối ưu hóa truy vấn lọc danh sách báo giá của khách hàng theo trạng thái.
5. `INDEX(bids.worker_id)`: Tối ưu hóa truy vấn lấy danh sách báo giá của tôi (`/bids/me`).
6. `UNIQUE(bid_revisions.bid_id, bid_revisions.revision_no)`: Đảm bảo số thứ tự bản sửa đổi tăng dần đều, không trùng lặp.
7. `INDEX(outbox_events.status, outbox_events.next_retry_at)`: Tối ưu hóa truy vấn của Outbox Publisher khi quét các sự kiện đang chờ (`pending`, `dlq_retry`).

---

## 4. Máy Trạng thái & Vòng đời Nghiệp vụ (State Machines)

### 4.1. Vòng đời Phiên Đấu thầu (Bidding Round State Machine)

```mermaid
stateDiagram-v2
    [*] --> pending : opens_at > now
    [*] --> open : opens_at <= now
    
    pending --> open : Kích hoạt khi đến giờ mở (on-the-fly / scheduler)
    pending --> cancelled : service_request.cancelled
    
    open --> open : Anti-sniping gia hạn closes_at (+2m)
    open --> closed : closes_at <= now (active bids > 0)
    open --> no_bid : closes_at <= now (active bids = 0)
    open --> cancelled : service_request.cancelled
    open --> finalized : order.created (khách chốt sớm)
    
    closed --> finalized : order.created (chốt thợ thắng)
    closed --> cancelled : service_request.cancelled
    
    no_bid --> cancelled : service_request.cancelled
    
    finalized --> [*] : Trạng thái đóng băng (Terminal)
    cancelled --> [*] : Trạng thái đóng băng (Terminal)
```

### 4.2. Vòng đời Báo giá (Bid State Machine)

```mermaid
stateDiagram-v2
    [*] --> active : submitBid (version = 1)
    
    active --> active : reviseBid (CAS: version++, revisionNo++)
    active --> withdrawn : withdrawBid (CAS: version++, thợ tự rút)
    active --> expired : now >= valid_until (tự động hết hạn)
    active --> selected : order.created khớp selectedBidId
    active --> rejected : order.created chọn thợ khác HOẶC round cancelled
    
    withdrawn --> [*]
    expired --> [*]
    selected --> [*]
    rejected --> [*]
```

---

## 5. Các Sơ đồ Tuần tự Chi tiết (Sequence Diagrams)

### 5.1. Mở Phiên Đấu thầu từ Sự kiện RabbitMQ

```mermaid
sequenceDiagram
    autonumber
    actor Broker as RabbitMQ Topic Exchange
    participant Consumer as BiddingEventsConsumer
    participant Inbox as consumed_events Table
    participant Rounds as RoundsService
    participant DB as PostgreSQL (bidding_rounds)
    participant Outbox as outbox_events Table

    Broker->>Consumer: Event: service_request.published
    Consumer->>Inbox: findUnique({ eventId })
    alt Event đã tiêu thụ trước đó (Duplicate)
        Inbox-->>Consumer: Bản ghi tồn tại
        Consumer->>Broker: channel.ack(msg)
    else Event mới
        Consumer->>Rounds: openRound(params)
        Rounds->>DB: findUnique({ serviceRequestId })
        alt Đã có Tombstone Cancelled / Finalized
            DB-->>Rounds: Status = cancelled / finalized
            Rounds-->>Consumer: Giữ nguyên Tombstone
        else Chưa có round
            Rounds->>DB: CREATE bidding_round (status=open/pending)
            Rounds->>Inbox: CREATE consumed_event
            Rounds->>Outbox: CREATE outbox_event (bidding.round.opened)
        end
        Consumer->>Broker: channel.ack(msg)
    end
```

### 5.2. Nộp Báo giá (`submitBid`) kèm Anti-Sniping & Fail-Closed Check

```mermaid
sequenceDiagram
    autonumber
    actor Worker as Thợ (Mobile App)
    participant Gateway as API Gateway
    participant Controller as BidsController
    participant Verifier as RequestEligibilityVerifierService
    participant OrderSvc as Order Service (Internal)
    participant BidsSvc as BidsService
    participant DB as PostgreSQL
    participant Outbox as outbox_events Table

    Worker->>Gateway: POST /api/v1/requests/:id/bids { amount, message, validUntil }
    Gateway->>Controller: Forward kèm x-internal-secret, x-user-id, x-user-roles
    Controller->>Controller: assertTrustedGateway() & extractWorkerIdentity()
    Controller->>BidsSvc: submitBid(workerId, serviceRequestId, dto)
    
    BidsSvc->>Verifier: verifyEligibility(serviceRequestId, workerId)
    Verifier->>OrderSvc: GET /api/v1/internal/service-requests/:id/bidding-eligibility
    alt Order Service Timeout / 5xx / Network Down
        OrderSvc-->>Verifier: Lỗi kết nối
        Verifier-->>BidsSvc: Ném 503 ServiceUnavailableException (Fail-Closed)
        BidsSvc-->>Worker: HTTP 503 (Không cho phép bid khi chưa xác minh)
    else Worker không đủ điều kiện
        OrderSvc-->>Verifier: eligible = false
        Verifier-->>BidsSvc: Ném 403 ForbiddenException
        BidsSvc-->>Worker: HTTP 403 Forbidden
    else Đủ điều kiện
        OrderSvc-->>Verifier: eligible = true
    end

    BidsSvc->>DB: BEGIN TRANSACTION
    BidsSvc->>DB: Lock round & verify status = 'open'
    alt Nộp trong 30 giây cuối (Anti-sniping kích hoạt)
        BidsSvc->>DB: closes_at = closes_at + 2 phút
        BidsSvc->>Outbox: CREATE outbox_event (bidding.round.extended)
    end
    BidsSvc->>DB: UPDATE bidding_rounds SET bid_count = bid_count + 1
    BidsSvc->>DB: INSERT INTO bids (amount, version=1, status='active')
    BidsSvc->>Outbox: CREATE outbox_event (bid.submitted)
    BidsSvc->>DB: COMMIT TRANSACTION
    BidsSvc-->>Worker: HTTP 201 Created (BidResponseDto)
```

### 5.3. Điều chỉnh Báo giá (`reviseBid`) với Atomic CAS & Cooldown

```mermaid
sequenceDiagram
    autonumber
    actor Worker as Thợ (Mobile App)
    participant Controller as BidsController
    participant BidsSvc as BidsService
    participant DB as PostgreSQL
    participant Outbox as outbox_events Table

    Worker->>Controller: PATCH /api/v1/bids/:id { version: 1, amount: 220000, message }
    Controller->>BidsSvc: reviseBid(workerId, bidId, dto)
    
    BidsSvc->>DB: findUnique(bidId)
    BidsSvc->>BidsSvc: Kiểm tra quyền sở hữu (bid.workerId == workerId)
    BidsSvc->>BidsSvc: Kiểm tra số lần sửa (revisions.length < 5)
    BidsSvc->>BidsSvc: Kiểm tra cooldown 2 phút kể từ lần sửa trước
    BidsSvc->>BidsSvc: Fail-fast: bid.version == dto.version (1 == 1)

    BidsSvc->>DB: BEGIN TRANSACTION
    BidsSvc->>DB: INSERT INTO bid_revisions (revision_no=1, previous_amount, new_amount)
    BidsSvc->>DB: UPDATE bids SET amount=:newAmount, version=version+1 WHERE id=:id AND version=1
    alt Xung đột phiên bản (Đã có request khác sửa trước)
        DB-->>BidsSvc: updateCount = 0
        BidsSvc->>DB: ROLLBACK TRANSACTION
        BidsSvc-->>Worker: HTTP 409 Conflict (Optimistic Lock Mismatch)
    else Cập nhật CAS thành công
        DB-->>BidsSvc: updateCount = 1 (version -> 2)
        BidsSvc->>Outbox: CREATE outbox_event (bid.revised)
        BidsSvc->>DB: COMMIT TRANSACTION
        BidsSvc-->>Worker: HTTP 200 OK (BidResponseDto với version=2)
    end
```

### 5.4. Khách hàng Xem Danh sách Báo giá (Sealed-Bid Masking & Profile Enrichment)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Người dùng (App / Web)
    participant Controller as BidsController
    participant BidsSvc as BidsService
    participant DB as PostgreSQL
    participant Enricher as WorkerProfileEnricherService
    participant UserTrust as User-Trust Service (Port 3002)

    Client->>Controller: GET /api/v1/requests/:id/bids
    Controller->>BidsSvc: getBidsForRequest(serviceRequestId, query, userId, userRoles, secret)
    BidsSvc->>DB: Lấy danh sách bids (order by submittedAt DESC) & customerId của round
    
    BidsSvc->>BidsSvc: Xác định vai trò: isRequestOwnerCustomer / isOwnerWorker / isAdmin
    
    BidsSvc->>Enricher: enrichWorkerProfiles(workerIds)
    Enricher->>Enricher: Kiểm tra In-Memory Cache (TTL 60s)
    alt Có workerId chưa cache
        Enricher->>UserTrust: GET /api/v1/internal/workers/batch-summary?ids=...
        UserTrust-->>Enricher: Trả về rating, avatarUrl, completedOrders
        Enricher->>Enricher: Lưu cache bộ nhớ
    end
    
    loop Duyệt từng Bid
        alt canSeeRealPrice (Khách hàng chính chủ / Thợ sở hữu bid / Admin)
            BidsSvc->>BidsSvc: Trả về amount thật, message thật, workerProfile đầy đủ
        else Thợ đối thủ / Khách hàng khác
            BidsSvc->>BidsSvc: Che mờ (isMasked=true, amount=0, message='[Báo giá kín]', workerProfile=null)
        end
    end
    
    BidsSvc-->>Client: HTTP 200 OK (BidListResponseDto)
```

### 5.5. Chốt Đơn Hàng (`order.created`) & Finalize Phiên Đấu Thầu

```mermaid
sequenceDiagram
    autonumber
    actor Broker as RabbitMQ Topic Exchange
    participant Consumer as BiddingEventsConsumer
    participant Rounds as RoundsService
    participant DB as PostgreSQL
    participant Outbox as outbox_events Table

    Broker->>Consumer: Event: order.created (selectedBidId, workerId, orderId)
    Consumer->>Rounds: finalizeRound(params)
    
    Rounds->>DB: BEGIN TRANSACTION
    Rounds->>DB: Kiểm tra inbox chống trùng lặp (consumed_events)
    Rounds->>DB: UPDATE bidding_rounds SET status = 'finalized' WHERE id = :roundId
    Rounds->>DB: UPDATE bids SET status = 'selected' WHERE id = :selectedBidId
    Rounds->>DB: UPDATE bids SET status = 'rejected' WHERE bidding_round_id = :roundId AND id != :selectedBidId AND status = 'active'
    Rounds->>Outbox: CREATE outbox_event (bidding.round.finalized)
    Rounds->>DB: COMMIT TRANSACTION
    Consumer->>Broker: channel.ack(msg)
```

### 5.6. Phân phối Sự kiện Outbox Publisher với Phân bổ Lease Phân tán

```mermaid
sequenceDiagram
    autonumber
    participant Publisher as OutboxPublisherService
    participant Repo as BiddingOutboxRepository
    participant DB as PostgreSQL (outbox_events)
    participant RabbitMQ as RabbitMQ Exchange

    loop Định kỳ mỗi 3 giây
        Publisher->>Repo: findPendingEvents(limit=20, now)
        Repo->>DB: BEGIN TRANSACTION
        Repo->>DB: SELECT candidate events (status IN ['pending', 'dlq_retry'] AND nextRetryAt <= now)
        Repo->>DB: UPDATE outbox_events SET nextRetryAt = now + 15s WHERE id IN (:candidateIds)
        Repo->>DB: COMMIT TRANSACTION (Giành quyền lease tạm thời, chống race condition giữa các replica)
        
        loop Từng Event
            Publisher->>Publisher: Kiểm tra isAlreadyEnveloped (Auth vs Bidding)
            alt Payload là Raw Bidding Data
                Publisher->>Publisher: Đóng gói chuẩn CloudEvent envelope (source='bidding-service', customerId, requestId)
            else Payload đã là DomainEvent (Auth)
                Publisher->>Publisher: Giữ nguyên cấu trúc cấp ngoài, không bọc lồng 2 lớp data
            end
            
            Publisher->>RabbitMQ: emit(eventType, envelope)
            alt Phát tán thành công
                Publisher->>DB: markPublished(eventId, publishedAt=now)
            else RabbitMQ Lỗi kết nối
                alt retryCount < 5
                    Publisher->>DB: scheduleRetry(nextRetryAt = now + 2^retryCount, retryCount++)
                else retryCount >= 5 (Đạt ngưỡng tối đa)
                    Publisher->>RabbitMQ: emit('handy-go.dlq', dlqPayload)
                    Publisher->>DB: markFailed(eventId, 'Routing to DLQ completed')
                end
            end
        end
    end
```

---

## 6. Danh mục API RESTful & Internal Contracts (API Specifications)

Mọi API ghi (`POST`, `PATCH`) và API truy vấn thông tin cá nhân (`/me`) đều bắt buộc xác thực cổng bảo mật nội bộ qua hàm `assertTrustedGateway(x-internal-secret)` và xác thực danh tính thợ qua `extractWorkerIdentity(x-user-id, x-user-roles)`.

### 6.1. Tổng hợp Danh mục Endpoint

| Phương thức | Đường dẫn (Path) | Mục đích nghiệp vụ | Quyền hạn (Role) | Header bắt buộc |
|---|---|---|---|---|
| `POST` | `/api/v1/requests/:id/bids` | Thợ nộp báo giá cho yêu cầu | `Worker` | `x-internal-secret`, `x-user-id`, `x-user-roles` |
| `PATCH` | `/api/v1/bids/:id` | Thợ điều chỉnh giá/nội dung báo giá | `Worker` | `x-internal-secret`, `x-user-id`, `x-user-roles` |
| `POST` | `/api/v1/bids/:id/withdraw` | Thợ rút lại báo giá đã gửi | `Worker` | `x-internal-secret`, `x-user-id`, `x-user-roles` |
| `GET` | `/api/v1/requests/:id/bids` | Khách xem danh sách báo giá (Sealed-bid) | `Public` / `Customer` / `Worker` / `Admin` | `x-internal-secret` (tuỳ chọn), `x-user-id`, `x-user-roles` |
| `GET` | `/api/v1/bids/requests/:id` | Alias route của lấy danh sách báo giá | `Public` | Giống trên |
| `GET` | `/api/v1/bids/me` | Lấy danh sách toàn bộ báo giá của tôi | `Worker` | `x-internal-secret`, `x-user-id`, `x-user-roles` |
| `GET` | `/api/v1/bids/:id` | Lấy chi tiết báo giá kèm lịch sử sửa | `Public` (Áp dụng che giá) | `x-internal-secret` (tuỳ chọn), `x-user-id` |
| `GET` | `/api/v1/requests/:id/bidding-status` | Lấy trạng thái vòng đấu thầu & đếm ngược | `Public` | Không |
| `GET` | `/api/v1/bids/requests/:id/bidding-status` | Alias route lấy trạng thái vòng đấu thầu | `Public` | Không |
| `GET` | `/api/v1/internal/bids/:bidId/eligibility` | Xác thực báo giá cho Order Service | `Internal Service` | `x-internal-secret` |

---

### 6.2. Chi tiết Đặc tả Yêu cầu & Dữ liệu API

#### 1. Nộp Báo Giá (`POST /api/v1/requests/:id/bids`)
- **Headers:** `x-internal-secret: <string>`, `x-user-id: <uuid>`, `x-user-roles: worker`
- **Body:**
```json
{
  "amount": 250000,
  "message": "Báo giá trọn gói bao gồm vật tư cơ bản và bảo hành 30 ngày.",
  "validUntil": "2026-10-30T12:00:00.000Z"
}
```
- **Phản hồi Thành công (201 Created):**
```json
{
  "success": true,
  "statusCode": 201,
  "message": "Nộp báo giá thành công",
  "data": {
    "id": "e4b6c31a-5f33-4f51-b842-123456789abc",
    "biddingRoundId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "serviceRequestId": "7b8a9c0d-1e2f-3a4b-5c6d-7e8f9a0b1c2d",
    "workerId": "worker-uuid-001",
    "amount": 250000,
    "message": "Báo giá trọn gói bao gồm vật tư cơ bản và bảo hành 30 ngày.",
    "validUntil": "2026-10-30T12:00:00.000Z",
    "status": "active",
    "version": 1,
    "submittedAt": "2026-10-26T14:00:00.000Z",
    "revisionsCount": 0
  }
}
```

#### 2. Điều chỉnh Báo Giá (`PATCH /api/v1/bids/:id`)
- **Headers:** `x-internal-secret: <string>`, `x-user-id: <uuid>`, `x-user-roles: worker`
- **Body:**
```json
{
  "version": 1,
  "amount": 220000,
  "message": "Giảm 30k do khoảng cách thực tế gần nhà.",
  "validUntil": "2026-10-31T18:00:00.000Z"
}
```
- **Phản hồi Thành công (200 OK):** `version` tăng lên 2, `revisionsCount` tăng lên 1, bản ghi mới được bổ sung vào `revisions`.
- **Phản hồi Xung đột (409 Conflict):** Nếu `version` gửi lên khác với `version` hiện tại trong DB.

#### 3. Rút Báo Giá (`POST /api/v1/bids/:id/withdraw`)
- **Body:**
```json
{
  "version": 2,
  "reason": "Bận việc đột xuất không thể nhận làm vào khung giờ này."
}
```
- **Phản hồi Thành công (200 OK):** Trạng thái chuyển thành `withdrawn`, `version` tăng lên 3.

#### 4. Danh sách Báo giá cho Khách hàng (`GET /api/v1/requests/:id/bids`)
- **Query Params:** `page=1&limit=10&status=active`
- **Phản hồi đối với Khách hàng chính chủ (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Lấy danh sách báo giá thành công",
  "data": {
    "items": [
      {
        "id": "bid-uuid-001",
        "biddingRoundId": "round-uuid-001",
        "serviceRequestId": "req-uuid-001",
        "workerId": "worker-uuid-001",
        "amount": 220000,
        "message": "Đã khảo sát và báo giá hoàn chỉnh.",
        "status": "active",
        "version": 2,
        "isMasked": false,
        "workerProfile": {
          "fullName": "Nguyễn Văn Thợ",
          "avatarUrl": "https://cdn.handygo.vn/avatars/worker-1.jpg",
          "averageRating": 4.9,
          "ratingCount": 48,
          "completedOrderCount": 45,
          "distanceKm": 1.8
        },
        "submittedAt": "2026-10-26T14:00:00.000Z",
        "revisionsCount": 1
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10
  }
}
```
- **Phản hồi đối với Thợ đối thủ (Sealed-Bid Masking):**
```json
{
  "id": "bid-uuid-001",
  "amount": 0,
  "message": "[Báo giá kín - Chỉ khách hàng sở hữu yêu cầu mới có quyền xem]",
  "isMasked": true,
  "workerProfile": null,
  "status": "active"
}
```

#### 5. Trạng thái Vòng Đấu Thầu (`GET /api/v1/requests/:id/bidding-status`)
- **Phản hồi Thành công (200 OK):**
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "roundId": "round-uuid-001",
    "serviceRequestId": "req-uuid-001",
    "status": "open",
    "opensAt": "2026-10-26T10:00:00.000Z",
    "closesAt": "2026-10-27T10:00:00.000Z",
    "bidCount": 4,
    "activeBidCount": 3,
    "timeRemainingSeconds": 72450,
    "isExpired": false
  }
}
```

#### 6. Internal API Kiểm tra Điều kiện tạo Đơn hàng (`GET /api/v1/internal/bids/:bidId/eligibility`)
- **Gọi bởi:** `order-service` khi khách hàng bấm tạo Booking Proposal.
- **Query:** `requestId=<uuid>&workerId=<uuid>`
- **Phản hồi Thành công (200 OK):**
```json
{
  "success": true,
  "data": {
    "eligible": true,
    "bid": {
      "id": "bid-uuid-001",
      "serviceRequestId": "req-uuid-001",
      "workerId": "worker-uuid-001",
      "amount": 220000,
      "status": "active",
      "version": 2,
      "validUntil": "2026-10-31T18:00:00.000Z"
    }
  }
}
```

---

## 7. Giao thức Sự kiện RabbitMQ (Event Contracts)

Tất cả các microservices giao tiếp qua RabbitMQ Topic Exchange: `handy-go.events`.

### 7.1. Bảng Sự kiện Lắng nghe (Inbound Events)

| Tên sự kiện (Routing Key) | Nguồn phát | Mục đích xử lý trong Bidding Service | Idempotency Key |
|---|---|---|---|
| `service_request.published` | `order-service` | Mở vòng đấu thầu mới hoặc kích hoạt round | `eventId` |
| `service_request.cancelled` | `order-service` | Hủy vòng đấu thầu, từ chối toàn bộ bid active | `eventId` |
| `order.created` | `order-service` | Chốt phiên, chọn thợ thắng cuộc (`selected`) | `eventId` |
| `bidding.round.expire_check` | Scheduler / Self | Kiểm tra hết hạn và tự động chuyển sang `closed`/`no_bid` | `roundId` |

### 7.2. Bảng Sự kiện Phát ra (Outbound Events)

| Tên sự kiện | Schema Envelope | Mục đích & Consumer tiêu thụ |
|---|---|---|
| `bidding.round.opened` | CloudEvent Envelope | Thông báo phiên đấu thầu đã mở cho Matching & Worker |
| `bidding.round.extended` | CloudEvent Envelope | Kích hoạt Anti-sniping, cập nhật đồng hồ đếm ngược mobile |
| `bidding.round.closed` | CloudEvent Envelope | Phiên đóng thành công, thông báo khách hàng chọn thợ |
| `bidding.round.cancelled` | CloudEvent Envelope | Phiên bị huỷ do yêu cầu dịch vụ bị huỷ |
| `bidding.round.finalized` | CloudEvent Envelope | Phiên chốt thợ thắng, đồng bộ trạng thái hệ thống |
| `bid.submitted` | CloudEvent Envelope | Thợ nộp báo giá $\rightarrow$ `notification-service` gửi Push cho khách hàng |
| `bid.revised` | CloudEvent Envelope | Thợ sửa giá $\rightarrow$ `notification-service` cập nhật khách hàng |
| `bid.withdrawn` | CloudEvent Envelope | Thợ rút giá $\rightarrow$ thông báo khách hàng |
| `bidding.dead_letter` | Outbox Dead-Letter Record | Lưu vết message hỏng vĩnh viễn phục vụ đối soát và redrive |

---

## 8. Bảo mật, Độ tin cậy & Khả năng Chịu lỗi (Security & Fault-Tolerance)

1. **Bảo mật Cổng vào (Zero-Trust Gateway Guard):**
   - Mọi request ghi bắt buộc mang header `x-internal-secret`.
   - Sử dụng hàm kiểm tra chống Timing Attack: `crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected))` trong `security.util.ts`.
   - Nếu secret sai hoặc vắng mặt, toàn bộ thông tin định danh `x-user-id`, `x-user-roles` bị vô hiệu hóa hoàn toàn.

2. **Khóa Thuê Phân tán Tránh Trùng lặp Outbox (Distributed Lease Claiming):**
   - Khi có nhiều replica của Bidding Service cùng chạy, mỗi replica giành quyền xử lý batch bằng câu lệnh `UPDATE outbox_events SET nextRetryAt = now + 15s WHERE id IN (:candidateIds) AND nextRetryAt <= now`.
   - Chỉ replica nào cập nhật thành công mới được phát tán các bản ghi đó ra RabbitMQ, loại bỏ hoàn toàn hiện tượng bắn đúp message (duplicate publish).

3. **In-Memory Cache & Graceful Degradation cho Worker Profile:**
   - Bộ nhớ đệm trong RAM với TTL 60 giây và cơ chế tự động dọn dẹp khi cache vượt quá 200 phần tử.
   - Nếu `user-trust-service` không phản hồi hoặc timeout 3s, hệ thống tự động trả về profile fallback mặc định (`fullName: 'Thợ đối tác HandyGo'`, `averageRating: null`), không làm gián đoạn API của khách hàng.

4. **Bảo toàn Envelope Xuyên Service (DomainEvent Preservation):**
   - Shared `OutboxPublisherService` tự động nhận diện nếu payload đã là một `DomainEvent` hợp lệ (như `user.registered` version 3 của `auth-service` chứa `data: { userId, accountId, roles }`).
   - Giữ nguyên cấu trúc cấp ngoài, không bọc lồng `data.data`, bảo vệ 100% tính tương thích provisioning của `user-trust-service`.

---

## 9. Chiến lược Kiểm thử & Xác minh (Testing & Verification)

Hệ thống Bidding Service được trang bị bộ kiểm thử tự động toàn diện với tỷ lệ bao phủ cao:

```
backend/apps/bidding-service/
├── src/
│   ├── bids/
│   │   ├── bids.controller.spec.ts           # Kiểm thử controller, auth headers, guards
│   │   ├── bids.service.spec.ts              # Kiểm thử nghiệp vụ nộp, sửa, rút, sealed-bid
│   │   └── services/
│   │       └── worker-profile-enricher.service.spec.ts  # Kiểm thử cache & fallback enricher
│   ├── rounds/
│   │   ├── rounds.controller.spec.ts         # Kiểm thử API trạng thái vòng đấu thầu
│   │   ├── rounds.service.spec.ts            # Kiểm thử mở, kích hoạt, hết hạn, chốt round
│   │   └── round-expiration.scheduler.spec.ts# Kiểm thử scheduler quét định kỳ
│   ├── events/
│   │   └── bidding-events.consumer.spec.ts   # Kiểm thử consumer, retry, zero-loss dead-letter
│   └── common/
│       └── outbox/
│           └── bidding-outbox.repository.spec.ts # Kiểm thử atomic lease claim
└── test/
    ├── bidding-review-verification.spec.ts   # Kiểm thử tích hợp 8 yêu cầu kiểm định cốt lõi
    ├── real-db.spec.ts                       # Kiểm thử cơ sở dữ liệu thật với PostgreSQL
    └── reliability-rabbitmq.spec.ts          # Kiểm thử độ bền với RabbitMQ thật
```

### 9.1. Lệnh Thực thi Kiểm thử

```bash
# 1. Chạy toàn bộ Unit Tests của Bidding Service
npx vitest run apps/bidding-service

# 2. Chạy Kiểm thử Tích hợp Xuyên Service (Bidding + Auth + User-Trust + Notification + Common)
npx vitest run apps/auth-service apps/user-trust-service apps/bidding-service apps/notification-service libs/common

# 3. Kiểm tra Tính toàn vẹn Kiểu dữ liệu (Typecheck)
npx tsc --noEmit

# 4. Kiểm tra Chuẩn mã nguồn (Linter)
npm run lint
```

---

## 10. Danh mục Biến Môi trường (Environment Variables)

| Tên biến | Bắt buộc | Giá trị mẫu | Mô tả chi tiết |
|---|---|---|---|
| `PORT` | Không | `3005` | Cổng HTTP lắng nghe của Bidding Service |
| `DATABASE_URL_BIDDING` | **Có** | `postgresql://user:pass@localhost:5432/handygo?schema=bidding_service` | Chuỗi kết nối PostgreSQL đến schema `bidding_service` |
| `DATABASE_URL_TEST` | Không | `postgresql://user:pass@localhost:5432/handygo_test?schema=bidding_service` | Chuỗi kết nối database dùng riêng cho test integration |
| `RABBITMQ_URL` | **Có** | `amqp://guest:guest@localhost:5672` | URL kết nối RabbitMQ Broker |
| `RABBITMQ_QUEUE_BIDDING` | Không | `handy-go.bidding.queue` | Hàng đợi RabbitMQ cho Bidding Service |
| `INTERNAL_SERVICE_SECRET` | **Có** | `handy-go-internal-service-secret-key-12345` | Khóa bí mật giao tiếp nội bộ giữa Gateway và các Service |
| `ORDER_SERVICE_URL` | **Có** | `http://order-service:3004` | URL nội bộ của Order Service để xác minh điều kiện nộp bid |
| `USER_TRUST_SERVICE_URL` | Không | `http://user-trust-service:3002` | URL nội bộ của User-Trust Service để lấy hồ sơ và uy tín thợ |
| `BID_REVISION_COOLDOWN_MS` | Không | `120000` | Thời gian giãn cách tối thiểu giữa 2 lần sửa giá (mặc định 2 phút) |
| `NODE_ENV` | Không | `production` / `development` / `test` | Môi trường thực thi của ứng dụng |
