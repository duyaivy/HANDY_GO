# 🎯 HandyGo — Matching Service & AI Ranking System Architecture

Tài liệu đặc tả toàn diện về **Kiến trúc Hệ thống**, **Giải thuật Xếp hạng Trí tuệ Nhân tạo (Hybrid AI Ranking)**, **Mô hình Dữ liệu**, **Hàng đợi Xử lý Bất đồng bộ** và **Hướng dẫn Triển khai** của **Matching Subsystem** trong nền tảng HandyGo.

Tài liệu được chuẩn hóa phục vụ mục đích báo cáo kỹ thuật đồ án (PBL6), bàn giao kiến trúc phần mềm và hướng dẫn vận hành production.

---

## 📑 Mục lục
1. [Tổng quan hệ thống & Đặt bài toán](#1-tổng-quan-hệ-thống--đặt-bài-toán)
2. [Kiến trúc tổng thể & Phân rã Microservices](#2-kiến-trúc-tổng-thể--phân-rã-microservices)
3. [Cơ chế Lọc cứng Ứng viên (Hard Worker Eligibility Gates)](#3-cơ-chế-lọc-cứng-ứng-viên-hard-worker-eligibility-gates)
4. [Động cơ Trí tuệ Nhân tạo & Thuật toán Xếp hạng Kết hợp (Hybrid AI Ranking Engine)](#4-động-cơ-trí-tuệ-nhân-tạo--thuật-toán-xếp-hạng-kết-hợp-hybrid-ai-ranking-engine)
   - [4.1. Multilingual Transformer Embedding](#41-multilingual-transformer-embedding)
   - [4.2. Hiệu chuẩn Điểm ngữ nghĩa (Semantic Calibration)](#42-hiệu-chuẩn-điểm-ngữ-nghĩa-semantic-calibration)
   - [4.3. Công thức Xếp hạng Kết hợp 5 Chiều](#43-công-thức-xếp-hạng-kết-hợp-5-chiều)
   - [4.4. Xử lý bài toán Khởi động lạnh (Cold-Start & Missing Data)](#44-xử-lý-bài-toán-khởi-động-lạnh-cold-start--missing-data)
   - [4.5. Giải thuật Phá vỡ Hòa điểm Tất định (Deterministic Tie-Breaking)](#45-giải-thuật-phá-vỡ-hòa-điểm-tất-định-deterministic-tie-breaking)
5. [Cơ chế Hàng đợi Bất đồng bộ, Tính Bền vững & Fallback](#5-cơ-chế-hàng-đợi-bất-đồng-bộ-tính-bền-vững--fallback)
   - [5.1. Bounded Concurrency Queue & Prefetch](#51-bounded-concurrency-queue--prefetch)
   - [5.2. Chống lặp và bảo vệ phiên bản (Idempotency & Revision Protection)](#52-chống-lặp-và-bảo-vệ-phiên-bản-idempotency--revision-protection)
   - [5.3. Heuristic Fallback Ranker & Invariant Validation](#53-heuristic-fallback-ranker--invariant-validation)
6. [Mô hình Cơ sở Dữ liệu & Read-Model Projection](#6-mô-hình-cơ-sở-dữ-liệu--read-model-projection)
7. [Danh mục API Endpoints & Hợp đồng Tích hợp Wire Format](#7-danh-mục-api-endpoints--hợp-đồng-tích-hợp-wire-format)
8. [Đánh giá Thực nghiệm & Đo lường Hiệu năng (Benchmark & Metrics)](#8-đánh-giá-thực-nghiệm--đo-lường-hiệu-năng-benchmark--metrics)
9. [Hướng dẫn Cấu hình, Triển khai & Vận hành](#9-hướng-dẫn-cấu-hình-triển-khai--vận-hành)

---

## 1. Tổng quan hệ thống & Đặt bài toán

Trong nền tảng kết nối dịch vụ việc làm gia đình **HandyGo**, khi khách hàng (Customer) đăng tải một yêu cầu dịch vụ (Service Request) — ví dụ: *"Máy lạnh Daikin 1.5HP bị chảy nước ở dàn lạnh và kém mát"*, hệ thống cần tự động tìm kiếm, sàng lọc và đề xuất danh sách các Thợ (Worker) phù hợp nhất.

### Thách thức cốt lõi:
1. **Rào cản Ngữ nghĩa Tự nhiên (Semantic Gap)**: Khách hàng thường mô tả sự cố theo ngôn ngữ dân dã, trong khi thợ đăng ký dịch vụ theo tên chuyên ngành. So khớp từ khóa truyền thống (Keyword Match/SQL LIKE) hoàn toàn thất bại.
2. **Ràng buộc Địa lý & Bán kính (Geo Proximity)**: Thợ chỉ phục vụ trong bán kính hoạt động cố định ($R$). Thợ ở quá xa sẽ không khả thi về thời gian di chuyển.
3. **Chất lượng & Độ tin cậy (Trust & Reputation)**: Cần cân bằng giữa thợ có rating cao với số lượng đánh giá thực tế, tránh thiên vị thợ mới có 1 đánh giá 5 sao tuyệt đối.
4. **Vấn đề Khởi động lạnh (Cold-Start Problem)**: Hệ thống mới đưa vào vận hành chưa có dữ liệu hoàn thành đơn hàng trong quá khứ (`historicalCompletionRate`), cần cơ chế thích ứng để không làm tê liệt giải thuật.
5. **Hiệu năng & Độ trễ (Sub-second Latency)**: Quy trình đề xuất phải phản hồi nhanh, không nghẽn tài nguyên và chịu tải tốt.

---

## 2. Kiến trúc tổng thể & Phân rã Microservices

Hệ thống Matching tuân thủ nghiêm ngặt nguyên tắc **Single Responsibility** và **Database-per-Service**, phân chia rõ rệt giữa:
- **NestJS Matching Service (Cổng điều phối & Quản lý trạng thái nghiệp vụ)**: Quản lý hàng đợi, transactional inbox/outbox, lọc điều kiện cứng, lưu kết quả PostgreSQL và cung cấp REST API.
- **Python FastAPI AI Service (Động cơ tính toán Stateless thuần túy)**: Đảm nhiệm tính toán embedding transformer và xếp hạng toán học, **không** chạm database, **không** lắng nghe message broker.

```mermaid
flowchart TD
    subgraph ClientLayer ["📱 Mobile Client & Web Application"]
        Customer["Khách hàng (Customer)"]
        Worker["Thợ (Worker)"]
    end

    subgraph GatewayLayer ["🌐 API Gateway :3000"]
        APIGateway["NestJS API Gateway"]
    end

    subgraph EventBroker ["📨 Message Broker (RabbitMQ)"]
        RMQ["Exchange: handy-go.events\nTopic Routing"]
    end

    subgraph OrderDomain ["📦 Order Service :3004"]
        OrderService["Order Service\n(service_request.published)"]
    end

    subgraph UserTrustDomain ["🛡️ User & Trust Service :3002"]
        UserTrustDB[("PostgreSQL\nschema: user_trust_service")]
        UserTrustRPC["Candidate Provider\n(RPC / HTTP Internal)"]
    end

    subgraph MatchingDomain ["🎯 Matching Service :3006"]
        MEC["MatchingEventConsumer\n(RabbitMQ Consumer)"]
        InboxRepo[("Inbox Table\nconsumed_events")]
        BQueue["Bounded Job Queue\n(Concurrency: 5, Timeout: 15s)"]
        Orchestrator["Matching Orchestrator"]
        Eligibility["7 Hard Eligibility Gates\n(Haversine & Status)"]
        Fallback["Rule-Based Fallback Ranker\n(Heuristic Backup)"]
        Validator["Ranking Invariant Validator"]
        MatchingDB[("PostgreSQL\nschema: matching_service\n- match_runs\n- match_results\n- service_request_projections")]
        OutboxPub["Transactional Outbox Publisher"]
    end

    subgraph AIDomain ["🧠 AI Service :8000 (Python / FastAPI)"]
        FastAPIServer["FastAPI Server"]
        E5Model["intfloat/multilingual-e5-small\n(Lifespan Preload 384-dim)"]
        LRUCache["Bounded LRU Vector Cache\n(SHA-256 Key, Cap: 10,000)"]
        Semaphore["asyncio.Semaphore(4)"]
        HybridRanker["5-Dimension Hybrid Ranking Engine\n(Bayesian Smoothing & Scaling)"]
    end

    %% Flow connections
    Customer -->|1. Tạo & Đăng yêu cầu| APIGateway
    APIGateway --> OrderService
    OrderService -->|2. Phát sự kiện domain| RMQ
    RMQ -->|service_request.published| MEC

    MEC -->|3. Idempotency Check| InboxRepo
    MEC -->|4. Đẩy job| BQueue
    BQueue --> Orchestrator

    Orchestrator -->|5. Lấy danh sách thợ khả dụng| UserTrustRPC
    UserTrustRPC --> UserTrustDB
    Orchestrator -->|6. Lọc 7 điều kiện cứng| Eligibility

    Orchestrator -->|7. POST /internal/ai/matching/rank\nx-internal-secret| FastAPIServer
    FastAPIServer --> Semaphore --> E5Model --> LRUCache --> HybridRanker

    FastAPIServer -.->|Fallback nếu AI timeout/lỗi| Fallback
    FastAPIServer -->|8. Trả kết quả xếp hạng| Validator
    Validator --> Orchestrator

    Orchestrator -->|9. Lưu Top 20 kết quả| MatchingDB
    Orchestrator -->|10. Ghi sự kiện| OutboxPub
    OutboxPub -->|matching.completed| RMQ

    Customer -->|11. Xem Top 5 đề xuất| APIGateway --> MatchingDB
    Worker -->|12. Xem yêu cầu quanh khu vực| APIGateway --> MatchingDB
```

---

## 3. Cơ chế Lọc cứng Ứng viên (Hard Worker Eligibility Gates)

Trước khi chuyển dữ liệu sang AI Service nhằm tiết kiệm chi phí tính toán, NestJS Matching Service thực hiện **7 rào chắn nhị phân (Pass/Fail)** thông qua [`EligibilityService`](file:///Users/apple/QUOCDUY/PBL6/backend/apps/matching-service/src/eligibility/eligibility.service.ts):

| STT | Rào chắn kiểm tra (Gate) | Tiêu chuẩn vượt qua | Hành vi nếu thất bại |
| :---: | :--- | :--- | :--- |
| **1** | **User Account Status** | `user.status == 'ACTIVE'` | Loại bỏ lập tức |
| **2** | **Worker Profile Verification** | `worker_profile.verified_at != null` | Loại bỏ lập tức |
| **3** | **eKYC Status** | `worker_profile.kyc_status == 'APPROVED'` | Loại bỏ lập tức |
| **4** | **Matching Service Offering** | Thợ có dịch vụ kích hoạt tương ứng `service_id` | Loại bỏ lập tức |
| **5** | **Vùng phục vụ Địa lý (Haversine)** | Khoảng cách $d \le R$ (với $R$ là bán kính đăng ký) | Loại bỏ (ngoài phạm vi phục vụ) |
| **6** | **Chống tự đề xuất (Anti-Self-Matching)** | `worker.user_id != customer.user_id` | Loại bỏ (tránh gian lận) |
| **7** | **Hạn chế Nghiệp vụ** | Không bị khóa tài khoản hoặc có khiếu nại cấm hoạt động | Loại bỏ lập tức |

### Giải thuật tính khoảng cách Haversine:
Được tính toán chính xác trên bề mặt cong Trái Đất (bán kính $R_{\text{earth}} = 6371.0088 \text{ km}$):
$$\Delta \phi = \text{lat}_2 - \text{lat}_1, \quad \Delta \lambda = \text{lon}_2 - \text{lon}_1$$
$$a = \sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\text{lat}_1)\cos(\text{lat}_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)$$
$$d = 2 \cdot R_{\text{earth}} \cdot \arcsin\left(\min(1.0, \sqrt{a})\right)$$

---

## 4. Động cơ Trí tuệ Nhân tạo & Thuật toán Xếp hạng Kết hợp (Hybrid AI Ranking Engine)

### 4.1. Multilingual Transformer Embedding
Hệ thống sử dụng mô hình mã hóa đa ngôn ngữ trọng lượng nhẹ **`intfloat/multilingual-e5-small`** (kích thước vector dense $D = 384$), được nạp trực tiếp vào bộ nhớ RAM khi khởi động container FastAPI.

- **Định dạng tiền tố chuẩn của họ mô hình E5**:
  - Đối với yêu cầu khách hàng (Asymmetric Query): `query: <request_text>`
  - Đối với dịch vụ thợ (Passage/Document): `passage: <offering_title>. <offering_description>`
- **Chuẩn hóa vector L2 Norm**:
  Mọi vector nhúng $\mathbf{v}$ đều được chuẩn hóa $\|\mathbf{v}\|_2 = 1$, giúp phép tính khoảng cách Cosine tương đương với tích vô hướng (Dot-Product):
  $$\text{cosine\_similarity}(\mathbf{q}, \mathbf{p}) = \mathbf{q} \cdot \mathbf{p}$$

### 4.2. Hiệu chuẩn Điểm ngữ nghĩa (Semantic Calibration)
Các mô hình Transformer đa ngôn ngữ thường có dải điểm Cosine thực tế tập trung trong đoạn hẹp $[0.70, 0.95]$. Nếu không chuẩn hóa, sự chênh lệch nhỏ sẽ bị triệt tiêu khi đưa vào hàm tổng. Hệ thống áp dụng hàm hiệu chuẩn tuyến tính có chặn:

$$S_{\text{semantic}} = \min\left(100.0, \max\left(0.0, \frac{\text{sim} - C_{\min}}{C_{\max} - C_{\min}} \times 100.0\right)\right)$$
*Với $C_{\min} = 0.75$ (ngưỡng tương đồng tối thiểu) và $C_{\max} = 0.90$ (ngưỡng tương đồng hoàn hảo).*

### 4.3. Công thức Xếp hạng Kết hợp 5 Chiều
Điểm xếp hạng tổng hợp $S_{\text{composite}} \in [0.0, 100.0]$ được cấu thành từ 5 khía cạnh độc lập:

$$S_{\text{composite}} = w_{\text{sem}} S_{\text{sem}} + w_{\text{geo}} S_{\text{geo}} + w_{\text{rat}} S_{\text{rat}} + w_{\text{exp}} S_{\text{exp}} + w_{\text{com}} S_{\text{com}}$$

```
+----------------------------------------------------------------------------------------------------+
| Chiều đặc trưng         | Ký hiệu | Trọng số chuẩn | Công thức chuẩn hóa thang điểm [0, 100]        |
+-------------------------+---------+----------------+------------------------------------------------+
| Tương đồng Ngữ nghĩa    | S_sem   | 30% (w=0.30)   | Calibrated Cosine Similarity                   |
| Mức độ Gần vị trí       | S_geo   | 25% (w=0.25)   | max(0, min(100, (1 - d / R) * 100))            |
| Chất lượng Đánh giá     | S_rat   | 20% (w=0.20)   | Bayesian Smoothed Rating * 20                  |
| Kinh nghiệm Dịch vụ     | S_exp   | 15% (w=0.15)   | min(100, (ExperienceYears / 10) * 100)        |
| Tỷ lệ Hoàn thành Đơn    | S_com   | 10% (w=0.10)   | HistoricalCompletionRate * 100 (hoặc 80.0 prior)|
+----------------------------------------------------------------------------------------------------+
```

### 4.4. Xử lý bài toán Khởi động lạnh (Cold-Start & Missing Data)
1. **Làm mượt đánh giá bằng Trung bình Bayes (Bayesian Rating Smoothing)**:
   Để thợ mới có 1 đánh giá 5 sao không vượt mặt thợ uy tín lâu năm có 100 đánh giá 4.8 sao, hệ thống áp dụng công thức:
   $$R_{\text{bayes}} = \frac{C \cdot m + \sum r_i}{C + n}$$
   *Trong đó:*
   - $m = 4.5$: Điểm đánh giá kỳ vọng tiên nghiệm toàn hệ thống (Prior Mean).
   - $C = 5.0$: Trọng số tin cậy tối thiểu (tương đương 5 lượt đánh giá giả định).
   - $n$: Số lượng đánh giá thực tế của thợ.
   - Thợ hoàn toàn mới ($n = 0$) sẽ nhận điểm khởi điểm tự nhiên $R_{\text{bayes}} = 4.375$ ($87.5 / 100$).

2. **Tự động Tái chuẩn hóa Trọng số khi thiếu Dữ liệu Lịch sử (Weight Renormalization)**:
   Ở giai đoạn nền tảng mới khởi chạy, Order Service chưa có lịch sử tỷ lệ hoàn thành (`completionRate` là `null` trên toàn hệ sinh thái). Thuật toán tự động phát hiện, triệt tiêu $w_{\text{com}}$ và co giãn các trọng số còn lại sao cho tổng luôn bằng $1.0$:
   $$w'_i = \frac{w_i}{\sum_{k \in \text{Active}} w_k} \implies w'_{\text{sem}} = 0.3333, \; w'_{\text{geo}} = 0.2778, \; w'_{\text{rat}} = 0.2222, \; w'_{\text{exp}} = 0.1667$$

### 4.5. Giải thuật Phá vỡ Hòa điểm Tất định (Deterministic Tie-Breaking)
Khi hai ứng viên có điểm tổng tương đương, thứ hạng được quyết định tuần tự:
1. `matchingScore` giảm dần (DESC)
2. `distanceKm` tăng dần (ASC - ưu tiên thợ gần hơn)
3. `workerUserId` tăng dần theo bảng chữ cái (ASC - bảo đảm kết quả ổn định tuyệt đối giữa các lần gọi)

---

## 5. Cơ chế Hàng đợi Bất đồng bộ, Tính Bền vững & Fallback

### 5.1. Bounded Concurrency Queue & Prefetch
- Hàng đợi nội bộ [`MatchingJobQueueService`](file:///Users/apple/QUOCDUY/PBL6/backend/apps/matching-service/src/queue/matching-job-queue.service.ts) giới hạn số luồng xử lý đồng thời $N \le 5$ nhằm bảo vệ tài nguyên CPU.
- RabbitMQ Channel kích hoạt `prefetchCount = 10` bảo đảm không bị tràn bộ nhớ khi có hàng ngàn yêu cầu gửi đến cùng lúc.
- Mỗi Matching Run có cấu hình giới hạn thời gian (Timeout 15 giây) và hỗ trợ Retry với Exponential Backoff.

### 5.2. Chống lặp và bảo vệ phiên bản (Idempotency & Revision Protection)
- **Transactional Inbox Pattern**: Mọi sự kiện nhận từ RabbitMQ đều lưu `message_id` vào bảng `consumed_events` trong transaction. Sự kiện trùng lặp lập tức được ACK và bỏ qua.
- **Revision Suppression**: Mỗi khi khách hàng sửa đổi phạm vi hoặc tọa độ yêu cầu, Order Service tăng `matching_revision` ($1 \to 2$). Nếu tiến trình của Revision 1 hoàn thành sau Revision 2, Matching Service sẽ tự động hủy ghi đè kết quả của Revision 1.

### 5.3. Heuristic Fallback Ranker & Invariant Validation
- **Tự phục hồi (Fault Tolerance)**: Khi FastAPI AI Service gặp sự cố (Network Partition, OOM, Timeout quá 5s), NestJS không để quy trình thất bại mà kích hoạt ngay [`RuleBasedFallbackRanker`](file:///Users/apple/QUOCDUY/PBL6/backend/apps/matching-service/src/ranking/rule-based-fallback.ranker.ts). Ranker phụ này sử dụng khoảng cách địa lý và đánh giá Bayes để tính điểm, gắn cờ `providerType: 'fallback'`.
- **Thẩm định tính bất biến ([RankingValidatorService](file:///Users/apple/QUOCDUY/PBL6/backend/apps/matching-service/src/ranking/ranking-validator.service.ts))**: Kiểm tra kết quả từ AI trước khi ghi nhận: danh sách trả về phải là tập con của các ứng viên hợp lệ, thứ hạng rank từ $1 \dots N$ không gián đoạn, điểm số hợp lệ $[0.0, 100.0]$.

---

## 6. Mô hình Cơ sở Dữ liệu & Read-Model Projection

Matching Service quản lý schema riêng biệt `matching_service` trên PostgreSQL (qua Prisma ORM 7):

```sql
-- Bảng quản lý tiến trình matching
CREATE TABLE "matching_service"."match_runs" (
  "id" UUID NOT NULL PRIMARY KEY,
  "service_request_id" UUID NOT NULL,
  "request_revision" INTEGER NOT NULL DEFAULT 1,
  "run_number" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(20) NOT NULL, -- pending, processing, completed, failed
  "model_version" VARCHAR(100),
  "provider_type" VARCHAR(20) NOT NULL, -- real_ai, fallback, mock
  "candidate_count" INTEGER NOT NULL DEFAULT 0,
  "eligible_count" INTEGER NOT NULL DEFAULT 0,
  "matched_count" INTEGER NOT NULL DEFAULT 0,
  "execution_duration_ms" INTEGER,
  "display_limit" INTEGER NOT NULL DEFAULT 5,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_runs_req_rev_run_unique" UNIQUE ("service_request_id", "request_revision", "run_number")
);

-- Bảng lưu trữ Top 20 ứng viên được xếp hạng
CREATE TABLE "matching_service"."match_results" (
  "id" UUID NOT NULL PRIMARY KEY,
  "match_run_id" UUID NOT NULL REFERENCES "matching_service"."match_runs"("id") ON DELETE CASCADE,
  "worker_user_id" UUID NOT NULL,
  "rank" INTEGER NOT NULL CHECK ("rank" > 0 AND "rank" <= 20),
  "matching_score" DECIMAL(5, 2) NOT NULL CHECK ("matching_score" >= 0.00 AND "matching_score" <= 100.00),
  "score_breakdown" JSONB NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "match_results_run_worker_unique" UNIQUE ("match_run_id", "worker_user_id"),
  CONSTRAINT "match_results_run_rank_unique" UNIQUE ("match_run_id", "rank")
);

-- Bảng read-model phục vụ thợ tìm kiếm yêu cầu mở gần vị trí (Event-driven projection)
CREATE TABLE "matching_service"."service_request_projections" (
  "id" UUID NOT NULL PRIMARY KEY,
  "request_code" VARCHAR(30) NOT NULL,
  "customer_user_id" UUID NOT NULL,
  "service_id" UUID NOT NULL,
  "description" TEXT,
  "scheduled_at" TIMESTAMPTZ(6),
  "address_text" VARCHAR(500),
  "latitude" DECIMAL(9, 6) NOT NULL,
  "longitude" DECIMAL(9, 6) NOT NULL,
  "status" VARCHAR(50) NOT NULL,
  "matching_revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

> **Quy tắc Nghiệp vụ**: Hệ thống **lưu trữ Top 20** ứng viên xuất sắc nhất vào bảng `match_results` để đối soát với các đề xuất báo giá (Bids) sau này, nhưng chỉ **trả về Top 5** thợ tối ưu nhất trên giao diện của Khách hàng (`display_limit = 5`).

---

## 7. Danh mục API Endpoints & Hợp đồng Tích hợp Wire Format

### 7.1. REST APIs (NestJS Matching Service - Cổng 3006)
- `GET /matching/requests/:id/recommendations`: Dành cho Khách hàng xem Top 5 thợ được AI đề xuất cho yêu cầu của mình.
- `GET /matching/me/requests`: Dành cho Thợ khám phá các yêu cầu dịch vụ mở phù hợp với vị trí và tay nghề của thợ.
- `GET /internal/v1/matching/requests/:id/recommendations`: Internal API dành cho Gateway/BFF lấy đầy đủ danh sách Top 20 đề xuất kèm `scoreBreakdown`.
- `POST /internal/v1/matching/check-eligibility`: Dành cho Order Service kiểm tra tính hợp lệ của thợ trước khi cho phép chốt đơn.

### 7.2. FastAPI Wire Contract (`POST /internal/ai/matching/rank`)
- **Headers**: `Content-Type: application/json`, `x-internal-secret: <SECRET>`
- **Request Payload**:
```json
{
  "serviceRequestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "requestRevision": 1,
  "serviceId": "srv-elec-4321-abcd",
  "requestDescription": "Sửa chữa hệ thống điện chập cháy tại nhà bếp",
  "requestLatitude": 10.772000,
  "requestLongitude": 106.698300,
  "topN": 20,
  "candidates": [
    {
      "workerUserId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "offeringTitle": "Thợ điện dân dụng",
      "offeringDescription": "Khắc phục sự cố điện, chập cháy, thay aptomat",
      "distanceKm": 1.45,
      "radiusKm": 10.0,
      "averageRating": 4.85,
      "ratingCount": 42,
      "experienceYears": 7,
      "historicalCompletionRate": 0.98
    }
  ]
}
```
- **Response Payload**:
```json
{
  "modelVersion": "intfloat/multilingual-e5-small-hybrid-v1.0",
  "providerType": "real_ai",
  "generatedAt": "2026-10-25T04:10:00.000Z",
  "rankedWorkers": [
    {
      "workerUserId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "rank": 1,
      "matchingScore": 89.42,
      "scoreBreakdown": {
        "semanticScore": 91.20,
        "geoScore": 85.50,
        "ratingScore": 95.80,
        "experienceScore": 70.00,
        "completionScore": 98.00
      },
      "metadata": {
        "rawSemanticSimilarity": 0.8868,
        "distanceKm": 1.45,
        "renormalizedWeights": false
      }
    }
  ]
}
```

---

## 8. Đánh giá Thực nghiệm & Đo lường Hiệu năng (Benchmark & Metrics)

Thực nghiệm đo lường trên môi trường Apple Silicon M-series (CPU Execution Provider):

### 8.1. Chất lượng Xếp hạng trên Bộ dữ liệu Tiếng Việt
Đánh giá trên tập benchmark gồm 4 nhóm dịch vụ thực tế (Sửa điện lạnh, Thông tắc vệ sinh, Hàn sắt cửa kính, Sửa điện dân dụng):
- **NDCG@5 (Normalized Discounted Cumulative Gain)**: Đạt **0.9699** (Vượt xa mục tiêu tối thiểu $\ge 0.85$).
- **MRR (Mean Reciprocal Rank)**: Đạt **1.0000** (Ứng viên chuyên môn chính xác nhất luôn đứng ở vị trí đầu tiên Top 1 trong 100% kịch bản).
- **Precision@3**: Đạt **1.0000** (Tất cả Top 3 thợ được gợi ý đều đúng chuyên ngành).

### 8.2. Độ trễ Xử lý (Inference Latency)
```
+--------------------------------------+---------------------+-----------------------+
| Kịch bản đánh giá                    | Tổng thời gian      | Thời gian / Ứng viên  |
+--------------------------------------+---------------------+-----------------------+
| Model Startup Preload (Lifespan)     | 3.79 giây           | Chỉ nạp 1 lần duy nhất|
| 1 Yêu cầu với 5 Ứng viên             | 7.82 ms             | 1.56 ms / ứng viên    |
| 1 Yêu cầu với 20 Ứng viên            | 9.15 ms             | 0.46 ms / ứng viên    |
| 1 Yêu cầu với 100 Ứng viên           | 10.17 ms            | 0.10 ms / ứng viên    |
| 5 Yêu cầu Đồng thời (100 ứng viên)   | 29.31 ms            | 5.86 ms / request     |
+--------------------------------------+---------------------+-----------------------+
```

### 8.3. Phân tích Độ nhạy Trọng số (Spearman Rank Correlation)
Kiểm tra tính bền vững của thứ tự xếp hạng khi biến thiên các trọng số (sử dụng hệ số tương quan thứ hạng Spearman $\rho$):
- **So sánh Baseline vs Ưu tiên Gần vị trí (Hyper-Local)**: $\rho = 0.8556$ ($\ge 0.70$).
- **So sánh Baseline vs Ưu tiên Thợ uy tín cao (High-Trust)**: $\rho = 0.9684$ ($\ge 0.70$).
Thứ tự xếp hạng biến thiên mượt mà, không xảy ra hiện tượng đảo lộn phi lý.

---

## 9. Hướng dẫn Cấu hình, Triển khai & Vận hành

### 9.1. Thiết lập Biến môi trường

#### Phía NestJS Backend (`backend/.env`):
```ini
PORT_MATCHING_SERVICE=3006
DATABASE_URL_MATCHING="postgresql://user:pass@host:5432/postgres?schema=matching_service"
RABBITMQ_URI="amqp://guest:guest@localhost:5672"
RABBITMQ_QUEUE_MATCHING="matching-service"

# Chọn ranking provider: 'real_ai' (FastAPI AI) hoặc 'mock' (Dành cho test cô lập)
MATCHING_RANKING_PROVIDER=real_ai
AI_SERVICE_URL="http://localhost:8000"
AI_SERVICE_TIMEOUT_MS=5000
INTERNAL_SERVICE_SECRET="handy-go-internal-service-secret-key-12345"
```

#### Phía Python AI Service (`ai/.env`):
```ini
APP_NAME="HandyGo AI Service"
PORT=8000
AI_INTERNAL_SECRET="handy-go-internal-service-secret-key-12345"
MATCHING_MODEL_NAME="intfloat/multilingual-e5-small"
MATCHING_MAX_CONCURRENT_INFERENCES=4
MATCHING_EMBEDDING_CACHE_SIZE=10000
```

### 9.2. Khởi chạy bằng Docker Compose
Hệ thống sử dụng Docker Volume để cache trọng số mô hình HuggingFace, không tốn thời gian tải lại mô hình khi khởi động container:

```bash
# Khởi động riêng AI Service (Port 8000)
cd ai
docker compose up -d

# Khởi động Backend Matching Service (Port 3006)
cd ../backend
pnpm run start:dev matching-service
```

### 9.3. Các lệnh Kiểm thử & Nghiệm thu
```bash
# 1. Kiểm tra liveness và model readiness của AI Service
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/ready

# 2. Chạy toàn bộ test suite của AI Service
cd ai
.venv/bin/pytest -v -s tests/

# 3. Chạy toàn bộ test suite của NestJS Matching Service
cd ../backend
pnpm test apps/matching-service
```
