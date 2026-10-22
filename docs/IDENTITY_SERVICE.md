# 🪪 Handy Go — Identity Domain & eKYC System Architecture

Tài liệu chi tiết về toàn bộ kiến trúc, chức năng, giải thuật và tích hợp của **Identity Service (eKYC)** trong hệ sinh thái Handy Go.

---

## 📑 Mục lục
1. [Tổng quan hệ thống](#1-tổng-quan-hệ-thống)
2. [Kiến trúc tổng thể & Luồng dữ liệu](#2-kiến-trúc-tổng-thể--luồng-dữ-liệu)
3. [Các module tính năng cốt lõi](#3-các-module-tính-năng-cốt-lõi)
   - [3.1. Card Detection & Tiền xử lý ảnh](#31-card-detection--tiền-xử-lý-ảnh)
   - [3.2. Động cơ OCR & Bóc tách thông tin tiếng Việt](#32-động-cơ-ocr--bóc-tách-thông-tin-tiếng-việt)
   - [3.3. Giải mã QR Code & Đối soát chéo (QR-OCR Fusion)](#33-giải-mã-qr-code--đối-soát-chéo-qr-ocr-fusion)
   - [3.4. Nhận diện & Đối soát khuôn mặt 1:1 (Face Verification)](#34-nhận-diện--đối-soát-khuôn-mặt-11-face-verification)
   - [3.5. Đánh giá chất lượng khuôn mặt (Face Quality Validation)](#35-đánh-giá-chất-lượng-khuôn-mặt-face-quality-validation)
4. [Tối ưu Trải nghiệm Chụp ảnh trên Ứng dụng Di động (Mobile Camera UX)](#4-tối-ưu-trải-nghiệm-chụp-ảnh-trên-ứng-dụng-di-động-mobile-camera-ux)
   - [4.1. Camera Sau: Chụp CCCD Mặt trước](#41-camera-sau-chụp-cccd-mặt-trước)
   - [4.2. Camera Trước: Chụp Chân dung (Selfie)](#42-camera-trước-chụp-chân-dung-selfie)
5. [Cơ chế Hàng đợi Bất đồng bộ (Async Queue & Worker)](#5-cơ-chế-hàng-đợi-bất-đồng-bộ-async-queue--worker)
6. [Tích hợp Hệ sinh thái Microservices](#6-tích-hợp-hệ-sinh-thái-microservices)
   - [6.1. RabbitMQ Event-Driven](#61-rabbitmq-event-driven)
   - [6.2. Cloudinary Media Storage](#62-cloudinary-media-storage)
   - [6.3. User & Trust Service RPC](#63-user--trust-service-rpc)
7. [Danh mục API Endpoints](#7-danh-mục-api-endpoints)
8. [Cơ chế Chống tràn RAM & Bảo vệ tài nguyên hệ thống](#8-cơ-chế-chống-tràn-ram--bảo-vệ-tài-nguyên-hệ-thống)

---

## 1. Tổng quan hệ thống

**Identity Domain** là dịch vụ trí tuệ nhân tạo (AI / Computer Vision) chuyên biệt, chịu trách nhiệm tự động hóa quy trình **định danh điện tử (eKYC)** cho cả khách hàng (customer) và thợ (worker) trên nền tảng Handy Go.

### Mục tiêu chính
* **Tự động trích xuất thông tin** từ thẻ Căn cước công dân (CCCD gắn chip / mã vạch) với độ chính xác cao đối với tiếng Việt có dấu.
* **Xác thực chân dung 1:1**: Kiểm tra người thực hiện đăng ký và người trên giấy tờ tùy thân có phải là một người hay không.
* **Chống gian lận & Giảm tải duyệt thủ công**: Phân loại tự động theo 3 cấp độ (`match`, `review`, `not_match`), chỉ chuyển lên Admin duyệt khi có dấu hiệu nghi vấn.
* **Bất đồng bộ hóa (Asynchronous)**: Xử lý các mô hình Deep Learning nặng (InsightFace, EasyOCR) qua hàng đợi Celery, không làm nghẽn HTTP request của người dùng di động.

---

## 2. Kiến trúc tổng thể & Luồng dữ liệu

```mermaid
flowchart TD
    subgraph Client ["📱 Client Application (React Native / Expo)"]
        MobileApp["Mobile App (Customer / Worker)"]
    end

    subgraph Gateway ["🌐 API Gateway (NestJS)"]
        APIGateway["API Gateway :3000"]
    end

    subgraph IdentityDomain ["🧠 AI Service & Worker"]
        AIServer["AI FastAPI Web Server :8000"]
        RedisQueue[("Redis Broker / Job Store")]
        CeleryWorker["AI Celery Worker (Pool Solo)"]
        
        subgraph Pipeline ["AI Processing Pipeline"]
            CardPreprocess["1. Card Detection & Perspective Transform"]
            QRDecode["2. QR Code Decoding"]
            FieldOCR["3. Field-based EasyOCR + Glyph Matcher"]
            ResultFusion["4. QR-OCR Result Fuser"]
            PortraitCrop["5. High-Res Portrait Crop & Unsharp Enhancement"]
            FaceQuality["6. Face Quality & Pose Check"]
            FaceMatching["7. ArcFace Embedding & Cosine Similarity"]
        end
    end

    subgraph StorageServices ["☁️ External & Integration Services"]
        Cloudinary[("Cloudinary Storage")]
        RabbitMQ[("RabbitMQ Exchange: handy-go.events")]
        UserTrust["User & Trust Service :3002"]
        Postgres[("PostgreSQL DB")]
    end

    MobileApp -->|"POST /api/v1/identity/:userId/verify (CCCD + Selfie)"| APIGateway
    APIGateway -->|"Proxy HTTP (x-internal-secret)"| AIServer
    AIServer -->|"1. Lưu ảnh vào storage/identity_jobs"| AIServer
    AIServer -->|"2. Lưu trạng thái queued vào Redis"| RedisQueue
    AIServer -->|"3. Enqueue task"| RedisQueue
    AIServer -->>|"4. Trả HTTP 202 Accepted { jobId }"| APIGateway
    APIGateway -->>|"HTTP 202 Accepted { jobId }"| MobileApp

    RedisQueue -->|"Fetch task"| CeleryWorker
    CeleryWorker --> Pipeline
    Pipeline -->|"Upload portrait & selfie"| Cloudinary
    Pipeline -->|"Emit event: kyc.submitted / kyc.failed"| RabbitMQ
    RabbitMQ -->|"Consume event"| UserTrust
    UserTrust -->|"Cập nhật trạng thái KYC"| Postgres

    MobileApp -.->|"Polling GET /api/v1/identity/jobs/:jobId"| APIGateway
    APIGateway -.->|"Proxy GET /api/identity/jobs/:jobId"| AIServer
    AIServer -.->|"Đọc trạng thái từ Redis"| RedisQueue
```

---

## 3. Các module tính năng cốt lõi

### 3.1. Card Detection & Tiền xử lý ảnh
*Nằm tại thư mục:* `app/domains/identity/modules/card_detection/`
* **Nhận diện viền thẻ (`detector.py`, `contour_detector.py`, `edge_detector.py`)**:
  - Dùng thuật toán Canny Edge Detection và phân tích hình thái học (morphological operations) để tìm 4 góc của thẻ CCCD ngay cả khi người dùng chụp trên nền bàn nhiều vật cản.
* **Hiệu chỉnh góc nghiêng (`geometry_refiner.py`)**:
  - Tự động đo góc xiên của thẻ và xoay thẳng góc phẳng.
* **Nắn phối cảnh 4 điểm (`perspective_transformer.py`)**:
  - Chiếu phối cảnh (Perspective Transform) biến bức ảnh thẻ chụp nghiêng thành ảnh phẳng chuẩn tỷ lệ thẻ ISO 7810 ID-1 (85.6mm × 53.98mm) với độ phân giải cao lên tới 1800px.
* **Tự động xoay chiều (`fast_orientation.py`)**:
  - Nhận diện thẻ bị lộn ngược (180°) hoặc xoay dọc (90°, 270°) dựa vào vị trí quốc huy và tiêu đề "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" để tự động xoay về chiều chuẩn (0°).
* **Tăng cường chất lượng (`adaptive_quality_enhancer.py`, `image_enhancer.py`)**:
  - Áp dụng CLAHE (Contrast Limited Adaptive Histogram Equalization) để cân bằng ánh sáng đối với ảnh chụp quá tối hoặc bị lóa sáng cục bộ (anti-glare).

---

### 3.2. Động cơ OCR & Bóc tách thông tin tiếng Việt
*Nằm tại thư mục:* `app/domains/identity/modules/ocr/`
* **Động cơ OCR kép**:
  - **EasyOCR Engine** (`easyocr_engine.py`): CRAFT Detector + CRNN với từ điển tiếng Việt chuyên biệt.
  - Hỗ trợ fallback **PaddleOCR Engine** (`paddle_engine.py`).
* **Bóc tách theo vùng chuyên biệt (Field-based Cropping - `field_cropper.py`, `field_ocr_service.py`)**:
  - Tính toán tọa độ tương đối theo chuẩn mẫu CCCD để cắt riêng từng trường:
    1. Số CCCD (12 số).
    2. Họ và tên.
    3. Ngày tháng năm sinh.
    4. Giới tính.
    5. Quốc tịch.
    6. Quê quán (Tỉnh/Thành, Quận/Huyện, Xã/Phường).
    7. Nơi thường trú.
    8. Ngày hết hạn.
* **Bộ sửa lỗi Glyph tiếng Việt (`glyph_matcher.py` & `vietnamese_glyph_templates.npz`)**:
  - Tránh nhầm lẫn giữa chữ `Đ` và `D`.
  - Phân biệt chính xác giữa `O`, `Ô`, `Ơ` và các tổ hợp dấu thanh (`?`, `~`, `.`).
* **Bộ Parser thông minh bằng Regex & Ngữ pháp (`parser/`)**:
  - Chuẩn hóa ngày tháng theo ISO-8601 (`YYYY-MM-DD`).
  - Kiểm tra tính hợp lệ của 12 số CCCD (mã tỉnh, thế kỷ/giới tính, năm sinh, số định danh ngẫu nhiên).
  - Chuẩn hóa địa giới hành chính Việt Nam theo cấp Xã/Phường, Quận/Huyện, Tỉnh/Thành phố.

---

### 3.3. Giải mã QR Code & Đối soát chéo (QR-OCR Fusion)
*Nằm tại thư mục:* `app/domains/identity/modules/qr/`
* **CCCD QR Code Decoder (`cccd_qr_decoder.py`, `cccd_qr_parser.py`)**:
  - Tự động phát hiện và giải mã mã QR ở góc trên bên phải thẻ CCCD chip.
  - Cấu trúc chuỗi QR chuẩn của Bộ Công An:
    `Số CCCD | Số CMND cũ | Họ và tên | Ngày sinh | Giới tính | Địa chỉ thường trú | Ngày cấp`
* **Cơ chế Hợp nhất QR - OCR (`qr_ocr_fuser.py`, `result_fuser.py`)**:
  - Dữ liệu từ QR Code có tính toàn vẹn tuyệt đối (100% không sai ký tự).
  - Hệ thống sử dụng dữ liệu QR làm nguồn chuẩn (Ground Truth), sau đó bù trừ chéo vào kết quả OCR để đạt độ chính xác tối đa ngay cả khi thẻ bị xước hoặc mờ chữ.

---

### 3.4. Nhận diện & Đối soát khuôn mặt 1:1 (Face Verification)
*Nằm tại thư mục:* `app/domains/identity/modules/face_verification/`
* **Trích xuất ảnh chân dung CCCD độ nét cao (High-Res Portrait Crop)**:
  - Thay vì crop từ bản thẻ thu nhỏ 1000px làm mờ mặt (chỉ đạt 290×345px), hệ thống tính toán tỷ lệ tương đối và **cắt trực tiếp từ ảnh CCCD độ nét cao gốc** (đạt kích thước hơn **550×650px**).
  - **Tăng cường độ nét khuôn mặt (Facial Unsharp Masking & CLAHE)**: Cân bằng kênh sáng L và làm nổi bật các đường nét viền mắt, sống mũi, khóe miệng trên ảnh chân dung trước khi đưa vào mô hình nhận diện.
* **Trích xuất đặc trưng khuôn mặt (`detector.py`, `embedding.py`)**:
  - Sử dụng **InsightFace (RetinaFace Detector + ArcFace Recognizer)**.
  - Tạo vector đặc trưng khuôn mặt 512 chiều (512-D Face Embedding vector).
* **So khớp 1:1 & Phân ngưỡng (`matcher.py`, `verification_service.py`)**:
  - Tính toán độ tương đồng Cosine (Cosine Similarity) giữa vector chân dung CCCD và vector selfie:
    $$\text{Similarity} = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \|\mathbf{v}\|}$$
  - **Quy tắc phân ngưỡng**:
    - **`match` (Similarity $\ge$ 0.70)**: Khuôn mặt trùng khớp hoàn toàn ➔ Tự động thông qua.
    - **`review` (0.50 $\le$ Similarity < 0.70)**: Nghi ngờ hoặc ảnh chụp selfie góc lệch, ánh sáng yếu ➔ Chuyển sang hàng đợi cho Admin duyệt thủ công.
    - **`not_match` (Similarity < 0.50)**: Không trùng khớp người ➔ Từ chối ngay lập tức, trả lỗi `FACE_VERIFICATION_NOT_MATCH`.

---

### 3.5. Đánh giá chất lượng khuôn mặt (Face Quality Validation)
*Nằm tại file:* `app/domains/identity/modules/face_verification/quality.py`
Trước khi đưa vào so khớp, ảnh selfie phải vượt qua các bài kiểm tra chất lượng chống giả mạo cơ bản:
* **Độ sắc nét (Laplacian Blur Detection)**: Loại bỏ ảnh bị rung tay, nhòe mờ.
* **Độ sáng (Brightness & Contrast Check)**: Phát hiện ảnh bị tối đen hoặc chói sáng.
* **Kích thước khuôn mặt tối thiểu**: Khuôn mặt phải chiếm đủ tỷ lệ trong khung hình selfie (tránh chụp quá xa).
* **Góc quay đầu (Head Pose Estimation - Yaw, Pitch, Roll)**:
  - Yaw (quay trái/phải): $\le 30^\circ$
  - Pitch (ngửa/cúi): $\le 25^\circ$
  - Roll (nghiêng đầu): $\le 20^\circ$

---

## 4. Tối ưu Trải nghiệm Chụp ảnh trên Ứng dụng Di động (Mobile Camera UX)

### 4.1. Camera Sau: Chụp CCCD Mặt trước
*(Tệp: `mobile/src/features/profile-detail/shared/screens/account-verification-id-front-screen.tsx`)*

* **Khung ngắm toàn màn hình (Full-screen Viewfinder)**:
  - `CameraView` mở rộng toàn màn hình (`StyleSheet.absoluteFillObject`) với camera sau tiêu chuẩn (`facing="back"`), kèm lớp phủ mờ chuẩn tỷ lệ CCCD (1.586 : 1) với 4 góc bo phản quang xanh ngọc nổi bật.
* **Bật/Tắt Đèn Trợ Sáng (Flash / Torch)**:
  - Nút điều khiển đèn pin phần cứng (`enableTorch`) ở góc phải thanh tiêu đề giúp trợ sáng rõ nét khi chụp trong môi trường thiếu sáng.
* **Giữ trọn độ phân giải gốc (`quality: 1.0`, `skipProcessing: false`)**:
  - Không nén mất nét, ảnh nguyên bản được chuyển thẳng lên backend để `CardDetector` nắn góc và nhận diện OCR.


### 4.2. Camera Trước: Chụp Chân dung (Selfie)
*(Tệp: `mobile/src/features/profile-detail/shared/screens/account-verification-selfie-screen.tsx`)*

* **Chất lượng ảnh tối đa (`quality: 1.0`)**:
  - Không nén mất nét chân dung, giữ trọn vẹn đặc trưng khuôn mặt cho mô hình InsightFace.
* **Tính năng Trợ sáng màn hình (Screen Fill Light)**:
  - Khi chụp trong phòng tối, bật nút trợ sáng sẽ biến nền ngoài khung oval thành màu trắng sáng rực (`bg-amber-50/90`), đóng vai trò như đèn hắt sáng (Softbox) rọi sáng khuôn mặt tự nhiên, không bị bóng đen dưới hốc mắt hay cằm.
* **Khung Oval thông minh & Shutter Feedback**:
  - Khung oval bo tròn ôm sát khuôn mặt người dùng kèm chỉ dẫn trực quan. Nút chụp hiển thị spinner trạng thái để người dùng giữ yên máy trong tích tắc, chống hiện tượng rung nhòe (motion blur).

---

## 5. Cơ chế Hàng đợi Bất đồng bộ (Async Queue & Worker)

Để tránh tình trạng HTTP Request bị timeout khi điện thoại di động gửi ảnh lên, hệ thống tách biệt luồng nhận việc và xử lý:

1. **Client gửi request**:
   - `POST /api/v1/identity/{user_id}/verify` nhận ảnh qua multipart-formdata.
2. **AI Web Service tiếp nhận**:
   - Ghi ảnh tạm thời vào thư mục chia sẻ `storage/identity_jobs/{job_id}/`.
   - Tạo trạng thái `queued` trong Redis Job Store.
   - Bắn task `identity.process_verification` vào hàng đợi Celery.
   - **Trả ngay mã `HTTP 202 Accepted` kèm `jobId` trong vòng < 200ms**.
3. **AI Celery Worker xử lý**:
   - Worker nhận task, cập nhật trạng thái job thành `processing`.
   - Chạy pipeline: Tiền xử lý ➔ QR ➔ OCR ➔ Face Match ➔ Upload Cloudinary.
   - Cập nhật kết quả vào Redis và phát sự kiện sang RabbitMQ.
   - Tự động xóa sạch file ảnh tạm trong thư mục `storage/identity_jobs/{job_id}/`.
4. **Client kiểm tra kết quả (Polling)**:
   - Client gọi `GET /api/v1/identity/jobs/{job_id}` mỗi 2-3 giây để nhận trạng thái (`queued` ➔ `processing` ➔ `completed` / `failed`).

---

## 6. Tích hợp Hệ sinh thái Microservices

### 6.1. RabbitMQ Event-Driven
Identity Worker phát các sự kiện nghiệp vụ qua RabbitMQ Exchange `handy-go.events`:
* **`kyc.submitted`**: Phát ra khi hoàn tất eKYC thành công (status `completed` với `aiStatus` là `match` hoặc `review`). Chứa đầy đủ thông tin bóc tách CCCD, độ tương đồng khuôn mặt, URL ảnh Cloudinary.
* **`kyc.failed`**: Phát ra khi xác minh thất bại (ảnh không hợp lệ, mặt không khớp `not_match`, lỗi bóc tách).

Các service tiêu thụ:
* **`user-trust-service`**: Lắng nghe `kyc.submitted` và `kyc.failed` để lưu hồ sơ định danh, kích hoạt trạng thái tài khoản người dùng hoặc đưa vào danh sách Admin Review.

### 6.2. Cloudinary Media Storage
* Chỉ upload ảnh chân dung trích xuất (`crop_cccd`) và ảnh `selfie`.
* **Không lưu trữ ảnh CCCD gốc** lên đám mây vì lý do bảo mật và quyền riêng tư (Privacy & Data Protection).
* Sử dụng delivery URL bảo mật và quản lý theo thư mục định danh `identity_verifications/{user_id}/`.

---

## 7. Danh mục API Endpoints

Tất cả các endpoint công khai đều được bảo vệ qua **API Gateway** với xác thực JWT và header nội bộ `x-internal-secret`.

| Phương thức | Đường dẫn | Quyền hạn | Mô tả |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/identity/{user_id}/verify` | User / Worker | Gửi ảnh CCCD + Selfie bắt đầu quy trình eKYC (Trả về `202 Accepted` + `jobId`) |
| `GET` | `/api/v1/identity/jobs/{job_id}` | Owner (`x-user-id`) | Polling kiểm tra tiến độ xử lý của job |
| `GET` | `/api/v1/identity/verify/{result_id}` | Owner / Admin | Xem chi tiết kết quả xác minh đã lưu |
| `GET` | `/api/v1/admin/identity/pending` | Admin (`ADMIN_API_KEY`) | Danh sách hồ sơ KYC đang ở trạng thái `review` chờ duyệt thủ công |
| `POST` | `/api/v1/admin/identity/{result_id}/review` | Admin (`ADMIN_API_KEY`) | Admin phê duyệt (`approved`) hoặc từ chối (`rejected`) hồ sơ |
| `GET` | `/api/v1/identity/health` | Public | Kiểm tra trạng thái hoạt động của AI Service |

---

## 8. Cơ chế Chống tràn RAM & Bảo vệ tài nguyên hệ thống

Do các mô hình Deep Learning (PyTorch, EasyOCR, InsightFace) tiêu thụ lượng tài nguyên lớn, hệ thống áp dụng các quy chuẩn bảo vệ bộ nhớ nghiêm ngặt:

1. **Celery Solo Pool (`--pool=solo`)**:
   - Loại bỏ việc tạo tiến trình con (`prefork`), ngăn hiện tượng nhân bản bộ nhớ (Copy-on-Write memory explosion) của PyTorch và OpenCV.
2. **Tối ưu hóa EasyOCR Canvas Size & Inference Mode**:
   - Trong `field_mode`, kích thước canvas giới hạn ở **800px** và `batch_size=1` (giảm 4 lần kích thước heatmap của CRAFT detector).
   - Bọc toàn bộ quá trình chạy OCR trong `torch.inference_mode()` để vô hiệu hóa autograd graph tracking.
3. **Giới hạn số OpenMP Threads**:
   - Thiết lập `OMP_NUM_THREADS=2`, `OPENBLAS_NUM_THREADS=2` để ngăn glibc tạo 8 memory arenas gây phân mảnh bộ nhớ trên máy nhiều core.
4. **Thu gom rác cưỡng bức (`malloc_trim` & `gc.collect`)**:
   - Chủ động gọi `gc.collect()` và lệnh cấp hệ thống `ctypes.CDLL("libc.so.6").malloc_trim(0)` sau mỗi job để ép hệ điều hành thu hồi bộ nhớ heap ngay lập tức.
5. **Cấu hình Cgroups & Swap an toàn**:
   - `ai-worker`: Cấp giới hạn `mem_limit: 2000m` và `memswap_limit: 3500m`.
   - WSL2 Host: Cấu hình `memory=4GB`, `swap=4GB` (tổng 8GB bộ nhớ ảo) giúp hệ thống không bao giờ chạm đỉnh OOM Killer.
