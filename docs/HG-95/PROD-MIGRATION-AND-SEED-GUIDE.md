# HG-95 — Hướng dẫn chạy Migration & Seed `suggestion_groups` trên Production

Tài liệu này hướng dẫn từng bước chạy migration bổ sung cột `suggestion_groups` (`JSONB`) và script backfill dữ liệu gợi ý tình trạng dịch vụ cho `catalog-service` trên môi trường Production/Staging một cách an toàn, idempotent và không làm mất cấu hình Admin đã chỉnh sửa.

---

## 1. Tổng quan thay đổi Database

- **Schema:** `catalog_service`
- **Migration:** `backend/apps/catalog-service/prisma/migrations/20261122000000_add_catalog_suggestion_groups/migration.sql`
- **Thay đổi DDL:**
  ```sql
  ALTER TABLE "catalog_service"."categories"
    ADD COLUMN IF NOT EXISTS "suggestion_groups" JSONB;

  ALTER TABLE "catalog_service"."services"
    ADD COLUMN IF NOT EXISTS "suggestion_groups" JSONB;
  ```
- **Đặc tính an toàn:**
  - Cột mới là `NULLABLE`, không có `DEFAULT` nặng, không khóa bảng lâu (metadata-only operation trên PostgreSQL).
  - Tương thích ngược 100%: code cũ hoặc dữ liệu cũ có `suggestion_groups = NULL` vẫn hoạt động bình thường.

---

## 2. Điều kiện tiên quyết (Prerequisites)

1. Chuẩn bị biến môi trường kết nối trực tiếp đến PostgreSQL của `catalog-service` (không dùng Supabase Transaction Pooler cổng `6543` khi chạy `prisma migrate deploy`):
   - `DIRECT_URL_CATALOG` hoặc `DATABASE_URL_CATALOG` (hoặc `DATABASE_URL`).
2. Đảm bảo đang đứng tại thư mục `backend/`:
   ```bash
   cd backend
   ```

---

## 3. Quy trình thực hiện trên Production (Step-by-Step)

### Bước 1: Kiểm tra trạng thái Migration hiện tại

```bash
pnpm run prisma:status:catalog
```

Xác nhận migration `20261122000000_add_catalog_suggestion_groups` đang ở trạng thái chưa áp dụng (pending).

### Bước 2: Chạy Migration bổ sung cột `suggestion_groups`

```bash
pnpm run prisma:migrate:catalog
```

Sau khi chạy xong, kiểm tra lại:

```bash
pnpm run prisma:status:catalog
```

Kết quả phải báo `Database schema is up to date!`.

### Bước 3: Chạy thử Seed / Backfill ở chế độ `--dry-run` (Không ghi vào DB)

Luôn chạy `--dry-run` trước để xem số lượng `categories` và `services` sẽ được cập nhật mà không thực sự commit thay đổi:

```bash
pnpm run seed:catalog:suggestions -- --dry-run
```

- Script sẽ mở transaction, kiểm tra toàn bộ dòng trong `catalog_service.categories` và `catalog_service.services`, validate các bộ preset qua `validateSuggestionGroupsValue`, in báo cáo thống kê JSON (`mode: "DRY_RUN"`) rồi tự động `ROLLBACK`.

### Bước 4: Chạy chính thức Seed / Backfill (Idempotent — chỉ điền dòng đang `NULL`)

```bash
pnpm run seed:catalog:suggestions
```

- **Cơ chế mặc định (An toàn cho Production):**
  - Chỉ cập nhật những dòng có `suggestion_groups IS NULL`.
  - Những danh mục hoặc dịch vụ mà Admin đã cấu hình trước đó (`suggestion_groups IS NOT NULL`) sẽ được giữ nguyên (`skippedExisting`).
  - Những dịch vụ đặc thù (~16 nhóm dịch vụ như *Vệ sinh máy lạnh*, *Sửa máy lạnh*, *Tháo và lắp đặt máy lạnh*, *Sửa tủ lạnh*, *Vệ sinh tủ lạnh*, *Thông cống*, *Lắp đặt và sửa chữa bồn cầu*, *Sửa máy giặt*, *Vệ sinh máy giặt*, *Sửa máy tính*, *Lắp đặt và sửa chữa mạng / Bảo dưỡng máy in*, *Cửa cuốn*, *Thay và vá lốp xe*, *Sửa/Sơn ô tô*, *Dọn dẹp nhà cửa*, *Sơn nhà*) sẽ được gán bộ override riêng.
  - Các dịch vụ còn lại giữ `suggestion_groups = NULL` để tự động kế thừa bộ gợi ý từ `Category` cha (`inheritedFromCategory`).

> **Lưu ý tùy chọn:**
> - Nếu muốn ghi đè lại toàn bộ các dòng đã có `suggestion_groups` bằng bộ preset chuẩn mới nhất, dùng cờ `--force`:
>   ```bash
>   pnpm run seed:catalog:suggestions -- --force
>   ```
> - Trên môi trường **Local Dev** mới khởi tạo chưa có dữ liệu danh mục/dịch vụ, có thể truyền thêm `--seed-sample-catalog` để tạo sẵn 12 danh mục + 40 dịch vụ mẫu (khớp đầy đủ 38 UUID trong `mobile/src/constants/services.ts`) trước khi backfill:
>   ```bash
>   pnpm run seed:catalog:suggestions -- --seed-sample-catalog
>   ```

---

## 4. Xác minh sau khi chạy (Post-Migration & Seed Verification)

### 4.1. Kiểm tra trực tiếp trên PostgreSQL

```sql
-- Kiểm tra số lượng danh mục đã có suggestion_groups
SELECT COUNT(*) AS total_categories,
       COUNT(suggestion_groups) AS categories_with_suggestions
FROM "catalog_service"."categories";

-- Kiểm tra số lượng dịch vụ có override riêng vs kế thừa từ danh mục
SELECT COUNT(*) AS total_services,
       COUNT(suggestion_groups) AS services_with_override,
       COUNT(*) - COUNT(suggestion_groups) AS services_inheriting_category
FROM "catalog_service"."services";
```

### 4.2. Kiểm tra qua API `catalog-service`

1. Gọi `GET /api/v1/categories` hoặc `GET /api/v1/categories/:id`:
   - Xác nhận mỗi category trả về trường `suggestionGroups` là mảng `ServiceSuggestionGroup[]`.
2. Gọi `GET /api/v1/services` hoặc `GET /api/v1/services/:id`:
   - Xác nhận dịch vụ có override trả về `suggestionGroups` riêng và `category.suggestionGroups` của danh mục cha.
   - Xác nhận dịch vụ không có override trả về `suggestionGroups: null` và `category.suggestionGroups` là mảng hợp lệ từ danh mục cha.

### 4.3. Làm mới Redis Cache (Nếu chạy script trực tiếp vào DB khi service đang chạy)

Các cache key của `catalog-service` trong bản phát hành HG-95 đã được nâng version lên:
- `catalog:categories:list:v3:*`
- `catalog:category:v2:*`
- `catalog:services:list:v3:*`
- `catalog:service:v2:*`

Nếu bạn chạy script `seed:catalog:suggestions` **sau khi** bản code mới đã chạy và cache `v2`/`v3` đã lưu bản ghi `null`, hãy xóa các key cache `catalog:*` trên Redis (hoặc đợi TTL 5 phút với list / 60 phút với detail):

```bash
redis-cli --scan --pattern "catalog:*" | xargs -r redis-cli del
```
