# Báo Cáo Khắc Phục Lỗi Mã Nguồn & Hướng Dẫn Deploy Production (Payment Service & Cluster)

> **Mã công việc:** Remediation & Production Deployment Preparation  
> **Thời điểm hoàn thành:** 14/11/2026  
> **Trạng thái Codebase:** Tất cả mã nguồn, Dockerfile, cấu hình Compose, script preflight và bộ validator đã được vá sạch, 100% tests & linting PASS.

---

## 1. TỔNG HỢP CÁC LỖI MÃ NGUỒN / CẤU HÌNH ĐÃ ĐƯỢC FIX TRONG REPO

Toàn bộ các lỗi được chỉ ra trong báo cáo đã được khắc phục trực tiếp trong kho mã nguồn:

### 1.1. Khắc phục lỗi Hairpin NAT (Internal HTTP Timeout giữa các Microservices cùng VPS)
- **Files sửa đổi:**
  - `backend/deploy/production/compose.production.yml`
  - `backend/scripts/validate-production-compose.py`
  - `backend/deploy/production/tests/test_service_endpoints.py`
- **Chi tiết xử lý:**
  - **VPS3 (`payment-service` ↔ `wallet-service`):** Thêm override `WALLET_SERVICE_URL: http://wallet-service:3009` vào container `payment-service`.
  - **VPS2 (`order-service` ↔ `bidding-service`, `matching-service`):** 
    - Thêm override `BIDDING_SERVICE_URL: http://bidding-service:3005` và `MATCHING_SERVICE_URL: http://matching-service:3006` vào container `order-service`.
    - Thêm override `ORDER_SERVICE_URL: http://order-service:3004` vào container `bidding-service`.
  - **Cập nhật validator CI:** Cập nhật `validate-production-compose.py` để công nhận các override Docker DNS nội bộ hợp lệ cho các service cùng host, ngăn CI chặn PR. Thêm test case bảo vệ hồi quy trong `test_service_endpoints.py`.

### 1.2. Nâng trần RAM & V8 Heap chống crash OOM
- **Files sửa đổi:**
  - `backend/deploy/production/services.json`
  - `backend/deploy/production/compose.production.yml`
- **Chi tiết xử lý:**
  - Nâng `memory_mib` của cả `payment-service` và `wallet-service` từ `112 MiB` lên **`192 MiB`**.
  - Trong Compose: cấu hình `mem_limit: 192m`, `memswap_limit: 384m`, và nâng tham số V8 heap `NODE_OPTIONS: '--max-old-space-size=104'`.
  - Tổng RAM container trên VPS3 là `608 MiB` + `280 MiB` (host reserve) = `888 MiB` $\le 1024\text{ MiB}$ (vượt qua hoàn toàn kiểm tra của `check-production-config.py`).

### 1.3. Bổ sung `PAYMENT` vào DB Preflight trên VPS3
- **File sửa đổi:** `backend/deploy/production/env-preflight.mjs`
- **Chi tiết xử lý:** Thêm `'PAYMENT'` vào mảng overrides database của `vps3` (`['WALLET', 'CATALOG', 'PAYMENT']`), đảm bảo biến `DATABASE_URL_PAYMENT` (nếu tách database riêng) được kiểm tra kết nối kỹ lưỡng trước khi bắt đầu transaction triển khai.

### 1.4. Bảo toàn 10 Prisma Generated Clients khi chạy `pnpm prune --prod`
- **File sửa đổi:** `backend/Dockerfile`
- **Chi tiết xử lý:** Bổ sung việc sao lưu và phục hồi đầy đủ cả 10 generated clients (`auth`, `bidding`, `matching`, `message`, `notification`, `order`, `payment`, `tracking`, `user-trust`, `wallet`) qua bước `pnpm prune --prod`, ngăn chặn nguy cơ runtime thiếu module `@prisma/*-client`.

### 1.5. Trích xuất chính xác IP thật của Client (`X-Forwarded-For`) gửi sang VNPAY
- **Files sửa đổi:**
  - `backend/apps/payment-service/src/topups/topups.controller.ts`
  - `backend/apps/payment-service/src/topups/topup-return.spec.ts`
- **Chi tiết xử lý:**
  - Cập nhật hàm `clientIp(req)` ưu tiên đọc header `x-forwarded-for` (lấy IP đầu tiên trong chuỗi phân tách bởi dấu phẩy nếu request đi qua Nginx / API Gateway proxy), fallback về `req.ip` và `'127.0.0.1'`.
  - Thêm 3 unit tests xác thực cơ chế trích xuất IP trong `topup-return.spec.ts`.

### 1.6. Cập nhật và Xác thực File `.env.prod` (Local)
- **File sửa đổi:** `backend/deploy/production/env/.env.prod` (gitignored)
- **Chi tiết xử lý:**
  - Đã bổ sung 4 biến cấu hình connection pool & payment flag:
    ```env
    DB_POOL_GROUP_PAYMENT=PRIMARY
    DB_POOL_REPLICAS_PAYMENT=1
    DB_DDL_VERIFIED_PAYMENT=true
    TOPUP_MOCK_ENABLED=false
    ```
  - Đã xác thực thành công qua bộ 3 validator: `validate_env`, `validate_service_endpoints`, và `validate_database_plan`.

---

## 2. NHỮNG PHẦN CẦN THAO TÁC TRÊN GITHUB

Trước và trong quá trình release, bạn cần thực hiện các bước sau trên GitHub:

### 2.1. Cập nhật GitHub Secret `BACKEND_PRODUCTION_ENV`
- **Vào:** `GitHub Repository` $\to$ `Settings` $\to$ `Secrets and variables` $\to$ `Actions` $\to$ `Environments` $\to$ chọn `production`.
- **Cập nhật secret `BACKEND_PRODUCTION_ENV`:** Sao chép toàn bộ nội dung file `.env.prod` dưới máy local (đã chứa các biến payment ở mục 1.6) vào secret này.
- **Lưu ý đặc biệt:**
  - `DATABASE_URL` (hoặc `DIRECT_URL_PAYMENT`) phải trỏ vào cổng **5432** (Session Pooler hoặc Direct), **không** được dùng cổng **6543** (Transaction Pooler) vì Prisma Migrate bắt buộc cần session advisory locks để chạy migration.

### 2.2. Quy trình Merge Code vào `main` trước khi vào `release`
> [!IMPORTANT]
> Tuyệt đối **không push trực tiếp** hoặc sửa code thẳng trên nhánh `release`. Hệ thống CI/CD yêu cầu SHA tree của commit deploy phải có bằng chứng kiểm thử (`backend-ci-proof`) sinh ra từ PR đã merge vào `main`.

1. Tạo một Pull Request đưa các commit fix này vào nhánh `main`.
2. Đợi workflow PR CI (`pr-ci.yml`) chạy hoàn tất (xanh tất cả lint, typecheck, test, build).
3. Merge PR vào `main`.
4. Merge nhánh `main` sang nhánh `release`.

### 2.3. Chạy Deployment với cờ `run_migrations: true` trên GitHub Actions
1. Khi `main` vừa merge vào `release`, sự kiện `push` tự động **sẽ bị fail có chủ đích** tại bước Begin với thông báo:
   ```
   New/initial migrations require an explicitly reviewed run_migrations deployment
   ```
   *(Đây là cơ chế bảo vệ an toàn của handygo khi phát hiện có Prisma migration mới của payment-service).*
2. **Cách chạy deploy chính xác:**
   - Vào tab **Actions** $\to$ Chọn workflow **Backend production** ở menu bên trái.
   - Bấm nút **Run workflow**.
   - Chọn nhánh **`release`**.
   - **Tích chọn ô checkbox: `run_migrations` = true**.
   - Bấm **Run workflow**.

---

## 3. NHỮNG PHẦN CẦN THAO TÁC HOẶC CẤU HÌNH TRÊN VPS / DỊCH VỤ NGOÀI

Sau khi GitHub Actions chạy deploy xanh thành công:

### 3.1. Cấu hình VNPAY Merchant Sandbox (Cổng thanh toán)
- Đăng nhập vào trang quản trị VNPAY Sandbox Merchant.
- Cấu hình URL trả lời tự động (IPN URL):
  ```
  https://handygo.duyaivy.id.vn/api/v1/payments/topups/vnpay/ipn
  ```
- Cấu hình URL trả về sau thanh toán (Return URL):
  ```
  https://handygo.duyaivy.id.vn/api/v1/payments/topups/vnpay/return
  ```
  *(Các route này đã được mở public tại `api-gateway` và proxy tới `payment-service`).*

### 3.2. [BẮT BUỘC] Tạo Commission Rule đầu tiên cho Hệ thống
> [!WARNING]
> Bản Prisma migration của Payment Service tạo bảng `commission_rules` nhưng **không tự động chèn rule hoa hồng mặc định**. Khi container khởi động cũng không tự chạy seed. Nếu bảng này trống, mọi sự kiện tạo đơn `order.created` sẽ bị ném lỗi `CommissionRuleMissingError` và rơi vào DLQ (`failed_inbound_events`), khiến đơn hàng không thể tạo thanh toán.

**Cách xử lý (Chọn 1 trong 2 cách):**
- **Cách 1 (Khuyên dùng - qua Admin API):**
  Gọi HTTP POST `/api/v1/payments/admin/commission-rules` với token quyền ADMIN:
  ```json
  POST /api/v1/payments/admin/commission-rules
  Authorization: Bearer <ADMIN_JWT_TOKEN>
  Content-Type: application/json

  {
    "rateBps": 1000,
    "effectiveFrom": "2026-11-14T15:00:00.000Z",
    "note": "Initial default 10% platform commission"
  }
  ```
  *(Lưu ý: `effectiveFrom` phải là thời điểm tương lai cách hiện tại tối thiểu 1–2 phút theo nghiệp vụ).*

- **Cách 2 (Chạy script trực tiếp):**
  Chạy lệnh seed hoa hồng trong môi trường backend:
  ```bash
  pnpm run seed:payment:commission
  ```

### 3.3. Đăng nhập lại tài khoản Admin (Refresh JWT)
- Khi container `auth-service` khởi động trên production, service `AuthSeedService` đã tự động nạp 8 quyền mới của Payment vào DB cho role `ADMIN`:
  - `PAYMENT_VIEW_ALL`, `PAYMENT_DISPUTE_MANAGE`, `COMMISSION_RULE_CREATE`, `COMMISSION_RULE_VIEW`, `PAYOUT_REVIEW`, `PAYMENT_REFUND_MANAGE`, `FINANCIAL_LEDGER_VIEW`, `PAYMENT_RECONCILE_TRIGGER`.
- Quản trị viên cần **đăng xuất và đăng nhập lại** để JWT access token nhận danh sách permissions mới này.

---

## 4. KẾT QUẢ KIỂM THỬ XÁC NHẬN TRƯỚC KHI BÀN GIAO

| Hạng mục kiểm tra | Lệnh thực hiện | Kết quả |
| :--- | :--- | :--- |
| **Production Config Contracts** | `python3 backend/scripts/check-production-config.py` | **PASS** (VPS3 RAM 608 MiB $\le$ 744 MiB) |
| **Multi-Host Compose Validation** | `python3 backend/scripts/validate-production-compose.py` | **PASS** (4 hosts VPS1-VPS4, Docker DNS overrides) |
| **Production Deploy Python Suite** | `python3 -m unittest discover -s backend/deploy/production/tests` | **PASS** (269/269 tests) |
| **ENV Preflight Authenticator** | `node --test backend/deploy/production/tests/env-preflight.test.mjs` | **PASS** (22/22 tests bao gồm VPS3 PAYMENT) |
| **Code Style & Static Linting** | `cd backend && pnpm run lint` | **PASS** (0 errors) |
| **TypeScript Typecheck** | `cd backend && pnpm run typecheck` | **PASS** (0 type errors) |
| **Payment Service Unit Tests** | `cd backend && pnpm vitest run apps/payment-service/` | **PASS** (19/19 files, 161/161 tests) |
| **Offline ENV Verification** | `validate_env`, `validate_service_endpoints`, `validate_database_plan` | **PASS** sạch cho cả `.env.prod` và `production.env.example` |
