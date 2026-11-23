# HG-95 — Kế hoạch triển khai chi tiết (Backend `catalog-service` + Mobile)

- **Ticket:** `HG-95` — *Gợi ý chọn tình trạng dịch vụ phù hợp trong lúc tạo đơn cho khách*
- **Phương án:** Hướng 4 (Hybrid — Server-Driven `catalog-service` + Mobile Fallback)
- **Tài liệu liên quan:**
  - Hiện trạng đối chiếu: [CURRENT-STATE-AND-BASELINE.md](./CURRENT-STATE-AND-BASELINE.md)
  - Spec tổng thể: [DESIGN-AND-JIRA-SPEC.md](./DESIGN-AND-JIRA-SPEC.md)
  - Task Jira tách riêng cho Admin Web: [JIRA-TASK-ADMIN-WEB.md](./JIRA-TASK-ADMIN-WEB.md)

---

## 1. Phạm vi triển khai

- **Chặng 1 — Backend (`backend/apps/catalog-service`):** Schema `suggestion_groups` (JSONB), migration, DTO validation, cập nhật service + Redis cache versioning/invalidation, script seed/backfill idempotent và unit tests.
- **Chặng 2 — Mobile (`mobile`):** Bộ phân giải gợi ý 4 tầng (`API Service` → `API Category` → `Local Preset theo Keyword/Category` → `Fallback trung tính`), cập nhật `useBookingDraftStore`, `CustomerBookingScreen`, `summary.tsx`, truyền dữ liệu từ màn danh mục & trang chủ, sửa lỗi state/reset chip và bổ sung unit tests.
- **Bỏ qua trong đợt này:** Phần **Admin Web (`frontend`)** đã tách sang [JIRA-TASK-ADMIN-WEB.md](./JIRA-TASK-ADMIN-WEB.md) để thành viên khác thực hiện.

---

## 2. Data Contract dùng chung (`ServiceSuggestionGroup[]`)

```ts
export type ServiceSuggestionGroup = {
  key: string;                           // ^[a-z0-9_]{1,40}$, duy nhất trong mảng
  label: string;                         // 1..80 ký tự
  descriptionPrefix?: string;            // 1..60 ký tự (optional, mặc định dùng label)
  selectionMode?: 'single' | 'multiple'; // mặc định 'single'
  options: string[];                     // 1..15 phần tử, mỗi phần tử 1..80 ký tự, không trùng lặp
};
```

- Mảng tối đa **6 nhóm**, tối thiểu **1 nhóm**; gửi `null` để xóa cấu hình (Service quay về kế thừa Category cha).
- Option `'Chưa rõ'` (nếu có) vẫn highlight trên UI nhưng không chèn vào chuỗi mô tả gửi thợ.

---

## 3. Chặng 1 — Backend (`backend/apps/catalog-service`)

1. **Prisma Schema & Migration**
   - Sửa `backend/apps/catalog-service/prisma/schema.prisma`: thêm `suggestionGroups Json? @map("suggestion_groups") @db.JsonB` vào `Category` và `Service`.
   - Tạo `backend/apps/catalog-service/prisma/migrations/20261122000000_add_catalog_suggestion_groups/migration.sql` dùng `ADD COLUMN IF NOT EXISTS "suggestion_groups" JSONB`.
2. **DTO & Validation**
   - Tạo `backend/apps/catalog-service/src/common/dto/suggestion-group.dto.ts`:
     - `ServiceSuggestionGroupDto` + custom top-level decorator `@IsValidSuggestionGroups()` (đảm bảo `bootstrapApplication` trả đầy đủ lỗi ở `fieldErrors.suggestionGroups`).
     - Helper `toPrismaSuggestionGroups(...)` xử lý `null` → `Prisma.DbNull`.
   - Cập nhật `create-category.dto.ts`, `category-response.dto.ts`, `create-service.dto.ts`, `service-response.dto.ts` (gồm cả `ServiceCategorySummaryDto`).
3. **Service Logic & Redis Cache**
   - Sửa `categories.service.ts`:
     - Lưu/cập nhật `suggestionGroups` trong `create`/`update`, bổ sung `suggestionGroups: true` trong `findOne` (`parent.select`).
     - Nâng cache key lên `catalog:categories:list:v3:...` và `catalog:category:v2:${id}`.
     - Xóa đầy đủ `catalog:categories:*`, `catalog:category:*`, `catalog:services:*`, `catalog:service:*` khi sửa/xóa/toggle category.
   - Sửa `services.service.ts`:
     - Lưu/cập nhật `suggestionGroups` trong `create`/`update`.
     - Bổ sung `suggestionGroups: true` vào `include.category.select` của `create`, `findAll`, `findOne`, `update`, `toggleStatus`.
     - Nâng cache key lên `catalog:services:list:v3:...` và `catalog:service:v2:${id}`.
     - Xóa đầy đủ `catalog:services:*`, `catalog:service:*`, `catalog:category:*` khi tạo/sửa/xóa/toggle service.
4. **Script Seed / Backfill (Idempotent)**
   - Tạo `backend/apps/catalog-service/prisma/suggestion-presets.ts` (~12 bộ Category + ~16 bộ Service override đặc thù).
   - Tạo `backend/apps/catalog-service/prisma/seed-suggestions.ts` hỗ trợ `--dry-run` và `--force`, mặc định chỉ điền dòng `suggestion_groups IS NULL`.
   - Thêm script `seed:catalog:suggestions` vào `backend/package.json`.
5. **Unit Tests Backend**
   - Tạo `suggestion-group.dto.spec.ts`.
   - Cập nhật `categories.service.spec.ts` và `services.service.spec.ts` kiểm tra lưu/xóa `suggestionGroups`, include `category.suggestionGroups` và cache invalidation.
6. **Verify Chặng 1**
   - `pnpm run prisma:generate:catalog`
   - `pnpm vitest run apps/catalog-service`
   - `pnpm run typecheck && pnpm run lint`

---

## 4. Chặng 2 — Mobile (`mobile`)

1. **Catalog Types & Booking Draft Store**
   - Sửa `mobile/src/features/catalog/types/index.ts`: thêm `ServiceSuggestionGroup` và `suggestionGroups?: ServiceSuggestionGroup[] | null` vào `CategoryResponseDto`, `ServiceCategorySummaryDto`, `ServiceResponseDto`.
   - Sửa `mobile/src/features/orders/stores/use-booking-draft-store.ts`: thêm `categoryId`, `categoryName`, `serviceSuggestionGroups`, `categorySuggestionGroups` (mở rộng `setService` tương thích ngược, reset sạch trong `resetDraft`).
2. **Module phân giải gợi ý 4 tầng & ghép mô tả**
   - Tạo `mobile/src/features/orders/customer/utils/service-issue-suggestions.ts`:
     - `normalizeSuggestionGroups(raw)` chống crash với dữ liệu rỗng/lỗi.
     - ~12 bộ Category preset + ~16 bộ Service keyword override + 1 bộ Fallback trung tính (matching không dấu tiếng Việt).
     - `resolveServiceSuggestions(...)` theo 4 tầng: `api-service` → `api-category` → `local-service` / `local-category` → `fallback`.
     - `formatSuggestionSelection(...)` & `mergeDescriptionWithSuggestions(...)` hỗ trợ `single` & `multiple`, bỏ qua `'Chưa rõ'`, bỏ regex hardcode `Sự cố|Vị trí|Mức độ`, bảo toàn 100% text khách tự nhập.
3. **Truyền dữ liệu từ các điểm vào Booking**
   - Sửa `category-screen.tsx` và `customer-home-screen.tsx`: truyền thêm `categoryId`, `categoryName` và hydrate `serviceSuggestionGroups` / `categorySuggestionGroups` vào `useBookingDraftStore`.
   - Sửa `mobile/src/app/customer/booking/index.tsx`: forward thêm `serviceName`, `categoryId`, `categoryName`.
4. **Cập nhật UI `CustomerBookingScreen` & `summary.tsx`**
   - Sửa `customer-booking-screen.tsx`:
     - Xóa `SUGGESTION_CATEGORIES` hardcode.
     - Dùng `selectedByGroup: Record<string, string[]>` render động theo `ServiceSuggestionGroup[]`.
     - Fetch ngầm `useServiceDetail` khi deep-link vào bằng UUID mà chưa có API suggestions (không chặn 0 ms render ban đầu).
     - Reset sạch `selectedByGroup` & `prevChipTextRef` khi đổi `serviceId`, bấm **Điền nhanh**, hoặc bấm **Quay lại**.
   - Sửa `mobile/src/app/customer/booking/summary.tsx`: tổng quát hóa kiểm tra prefix khi bổ sung `Tôi cần người ${serviceName}: `.
5. **Unit Tests Mobile & Cập nhật Baseline**
   - Tạo `mobile/src/features/orders/customer/utils/__tests__/service-issue-suggestions.test.ts`.
   - Cập nhật & mở rộng `customer-booking-service-name-and-description.test.tsx`.
   - Cập nhật bảng đối chiếu Before/After trong `docs/HG-95/CURRENT-STATE-AND-BASELINE.md`.
6. **Verify Chặng 2**
   - Chạy Jest cho toàn bộ test booking & suggestion utils.
   - `pnpm run type-check && pnpm run lint`.
