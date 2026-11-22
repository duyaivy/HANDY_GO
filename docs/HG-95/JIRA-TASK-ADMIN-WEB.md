# [Jira Task] Admin Web — Quản lý gợi ý tình trạng dịch vụ (Categories & Services)

> **Hướng dẫn dán lên Jira giữ nguyên định dạng:** Mở file ở chế độ Markdown Preview (`Ctrl + Shift + V`), nhấn `Ctrl + A` → `Ctrl + C`, rồi dán (`Ctrl + V`) vào Description của Jira.

---

## 1. Thông tin chung
- **Liên quan ticket gốc:** `HG-95` — *Gợi ý chọn tình trạng dịch vụ phù hợp trong lúc tạo đơn cho khách*
- **Phạm vi task này:** Chỉ phần **Admin Web (`frontend`)**. Phần **Backend (`catalog-service`)** và **Mobile App** được triển khai tách riêng theo cùng API Contract bên dưới.
- **Mục tiêu:** Cho phép Admin xem, tạo, chỉnh sửa và xóa cấu hình **Gợi ý tình trạng dịch vụ (`suggestionGroups`)** cho cả **Danh mục (Category)** (mặc định cho cả mục) và **Dịch vụ (Service)** (override riêng cho dịch vụ đặc thù), hỗ trợ cả **nhập tay trực quan** lẫn **dán nhanh JSON** (ví dụ copy JSON sinh từ Gemini/Codex).

---

## 2. Nghiệp vụ kế thừa cần thể hiện trên UI

1. **Ở mức Danh mục (Category):**
   - `suggestionGroups` là **bộ gợi ý mặc định** cho toàn bộ dịch vụ thuộc danh mục đó (bao gồm cả các dịch vụ mới được thêm sau này).
   - Không bắt buộc nhập (nếu để trống / `null`, Mobile sẽ tự dùng bộ fallback local).
2. **Ở mức Dịch vụ (Service):**
   - `suggestionGroups` là **bộ gợi ý riêng (override)** cho những dịch vụ đặc thù trong cùng danh mục (ví dụ trong danh mục *Điện lạnh*, *Vệ sinh máy lạnh* và *Sửa tủ lạnh* có bộ gợi ý khác nhau).
   - Nếu để trống / `null` (hoặc Admin bấm **"Dùng mặc định theo danh mục"**), dịch vụ sẽ tự động kế thừa `suggestionGroups` của danh mục cha.

---

## 3. API Contract từ Backend (`catalog-service`)

### 3.1. Cấu trúc trường `suggestionGroups`
Kiểu dữ liệu `ServiceSuggestionGroup[] | null | undefined`:

```ts
export type ServiceSuggestionGroup = {
  /** Mã định danh nhóm: chỉ gồm chữ thường, số, gạch dưới (^[a-z0-9_]+$), 1..40 ký tự, duy nhất trong mảng */
  key: string;
  /** Tiêu đề nhóm hiển thị trên Mobile (vd: 'Tình trạng thiết bị'), 1..80 ký tự */
  label: string;
  /** Nhãn ngắn khi ghép vào ô mô tả (optional, vd: 'Tình trạng'), 1..60 ký tự */
  descriptionPrefix?: string;
  /** Chế độ chọn trên Mobile: 'single' (mặc định) hoặc 'multiple' */
  selectionMode?: 'single' | 'multiple';
  /** Danh sách chip gợi ý: 1..15 phần tử, mỗi phần tử 1..80 ký tự, không trùng lặp */
  options: string[];
};
```

### 3.2. Quy tắc Validate phía Backend (trả `400 Bad Request` nếu vi phạm)
- Khi không gửi (`undefined`): không thay đổi (trong `PATCH`) hoặc mặc định `null` (trong `POST`).
- Khi gửi `null`: xóa cấu hình (`suggestion_groups = NULL` trong DB; với Service nghĩa là quay về kế thừa Category cha).
- Khi gửi mảng:
  - Phải có từ **1 đến 6 nhóm** (không gửi mảng rỗng `[]`; nếu Admin xóa hết nhóm thì gửi `null`).
  - `key` không được trùng nhau giữa các nhóm trong cùng mảng.
  - `options` trong mỗi nhóm phải có từ **1 đến 15 lựa chọn**, không rỗng, không trùng nhau (không phân biệt hoa/thường).

### 3.3. Các Endpoints sử dụng (giữ nguyên URL hiện tại)
Các Next.js Route Handler proxy hiện tại ở `frontend/src/app/api/categories/**` và `frontend/src/app/api/services/**` **đã forward nguyên JSON body**, không cần sửa route proxy.

- **Categories:**
  - `GET /categories` & `GET /categories/:id` → trả thêm field `suggestionGroups: ServiceSuggestionGroup[] | null`
  - `POST /api/categories` → nhận thêm optional `suggestionGroups?: ServiceSuggestionGroup[] | null`
  - `PATCH /api/categories/:id` → nhận thêm optional `suggestionGroups?: ServiceSuggestionGroup[] | null`
- **Services:**
  - `GET /services` & `GET /services/:id` → trả thêm:
    - `suggestionGroups: ServiceSuggestionGroup[] | null` (cấu hình riêng của dịch vụ)
    - `category.suggestionGroups: ServiceSuggestionGroup[] | null` (cấu hình mặc định của danh mục cha)
  - `POST /api/services` → nhận thêm optional `suggestionGroups?: ServiceSuggestionGroup[] | null`
  - `PATCH /api/services/:id` → nhận thêm optional `suggestionGroups?: ServiceSuggestionGroup[] | null`

### 3.4. Ví dụ JSON mẫu (dùng cho placeholder & nút "Dán nhanh JSON")
```json
[
  {
    "key": "issue",
    "label": "Tình trạng thiết bị",
    "descriptionPrefix": "Tình trạng",
    "selectionMode": "single",
    "options": [
      "Không lạnh / yếu lạnh",
      "Chảy nước",
      "Kêu to / rung",
      "Không lên nguồn",
      "Chưa rõ"
    ]
  },
  {
    "key": "device_type",
    "label": "Loại máy",
    "descriptionPrefix": "Loại máy",
    "selectionMode": "single",
    "options": ["Treo tường", "Âm trần", "Tủ đứng", "Chưa rõ"]
  },
  {
    "key": "severity",
    "label": "Mức độ",
    "descriptionPrefix": "Mức độ",
    "selectionMode": "single",
    "options": ["Bình thường", "Cần trong ngày", "Khẩn cấp", "Chưa rõ"]
  }
]
```

---

## 4. Phạm vi chỉnh sửa đề xuất trong `frontend/`

### 4.1. Schema & Types
- `frontend/src/feature/catagories/schema/category.schema.ts`:
  - Khai báo Zod schema & TS type cho `ServiceSuggestionGroup`.
  - Thêm `suggestionGroups: z.array(suggestionGroupSchema).nullable().optional()` vào `categorySchema`, `CategoryDetailResType`, `CreateCategoryBodyType`, `UpdateCategoryBodyType`.
- `frontend/src/feature/services/schema/service.schema.ts` & `frontend/src/feature/services/types/index.ts`:
  - Thêm `suggestionGroups?: ServiceSuggestionGroup[] | null` vào `ServiceResType`, `ServiceDetailResType`, `CreateServiceBodyType`, `UpdateServiceBodyType`, `ServiceItem`, `ServiceFormData` và `category.suggestionGroups` trong `ServiceResType`.

### 4.2. Component dùng chung mới: `SuggestionGroupsEditor`
Tạo 1 component tái sử dụng cho cả form Category và Service (ví dụ: `frontend/src/components/catalog/suggestion-groups-editor.tsx`):
- **Chế độ Nhập tay (Form Builder):**
  - Danh sách các nhóm gợi ý (tối đa 6 nhóm), có nút **"+ Thêm nhóm"**, nút xóa nhóm.
  - Mỗi nhóm gồm:
    - Tên nhóm (`label`) — tự sinh gợi ý `key` dạng snake_case không dấu từ `label` (Admin vẫn có thể sửa `key` nếu muốn).
    - Nhãn ghép mô tả (`descriptionPrefix`, tùy chọn).
    - Chế độ chọn (`Chọn 1` / `Chọn nhiều` → `'single' | 'multiple'`).
    - Danh sách chip lựa chọn (`options`): nhập từng chip (hỗ trợ nhấn `Enter` hoặc dấu phẩy để thêm nhanh, bấm `×` để xóa chip, tối đa 15 chip/nhóm).
- **Chế độ Dán nhanh JSON (Quick JSON Import/Export):**
  - Nút **"Dán nhanh JSON"** mở khung textarea cho phép dán mảng JSON `ServiceSuggestionGroup[]` (ví dụ lấy từ Gemini/Codex) → bấm **"Áp dụng"**.
  - Validate đúng rule ở mục 3.2, hiển thị lỗi rõ từng dòng/nhóm nếu JSON sai format; khi hợp lệ thì đổ dữ liệu vào Form Builder để Admin xem trực quan trước khi bấm Lưu.
  - Có nút **"Copy JSON"** để Admin dễ sao chép bộ gợi ý từ dịch vụ này sang dịch vụ khác.
- **Hiển thị kế thừa (dành cho form Service):**
  - Khi Service đang có `suggestionGroups = null`: hiển thị trạng thái *"Đang dùng bộ gợi ý mặc định từ danh mục [Tên danh mục]"* kèm xem trước (read-only) các chip của danh mục cha (nếu có), và nút **"Tùy chỉnh riêng cho dịch vụ này"**.
  - Khi Service đang có override riêng: có nút **"Xóa tùy chỉnh (quay về mặc định danh mục)"** để set `suggestionGroups = null`.

### 4.3. Tích hợp vào các Modal hiện có
- **Quản lý Danh mục (`frontend/src/feature/catagories/components/`):**
  - `add-catagory.tsx`: Nhúng `SuggestionGroupsEditor` (tùy chọn), gửi `suggestionGroups` khi tạo.
  - `edit-catagory.tsx`: Load `suggestionGroups` hiện tại vào `SuggestionGroupsEditor`, gửi `suggestionGroups` (hoặc `null` nếu đã xóa hết) khi cập nhật.
  - `detail-catagory.tsx`: Hiển thị danh sách nhóm gợi ý & chip (read-only) trong modal xem chi tiết danh mục.
- **Quản lý Dịch vụ (`frontend/src/feature/services/components/`):**
  - `add-service.tsx`: Nhúng `SuggestionGroupsEditor` ở chế độ Service (hiển thị preview gợi ý kế thừa từ Category đang chọn).
  - `edit-service.tsx`: Load `suggestionGroups` hiện tại (hoặc hiển thị kế thừa từ `service.category.suggestionGroups`), cho phép tạo override hoặc gỡ override về `null`.
  - `detail-service.tsx`: Hiển thị bộ gợi ý đang áp dụng kèm badge phân biệt **"Cấu hình riêng"** hay **"Kế thừa từ danh mục"**.

---

## 5. Acceptance Criteria (Tiêu chí nghiệm thu)

- [ ] Admin có thể tạo/sửa **Danh mục** có hoặc không có `suggestionGroups`; lưu xong reload lại vẫn hiển thị đúng.
- [ ] Admin có thể tạo/sửa **Dịch vụ** với cấu hình override riêng, hoặc bấm **"Quay về mặc định danh mục"** (gửi `suggestionGroups: null`).
- [ ] Khi xem chi tiết hoặc sửa một Dịch vụ không có override, UI hiển thị rõ bộ gợi ý đang kế thừa từ danh mục cha.
- [ ] Chế độ **Dán nhanh JSON** parse được mảng JSON chuẩn, báo lỗi rõ ràng khi JSON sai cú pháp / trùng `key` / quá 6 nhóm / nhóm rỗng `options` / trùng chip.
- [ ] Nếu Admin xóa hết các nhóm trong form rồi bấm Lưu, payload gửi lên BE là `suggestionGroups: null` (không gửi mảng rỗng `[]` gây lỗi 400).
- [ ] Không phá vỡ các luồng CRUD Category / Service hiện có (tạo/sửa bình thường khi không động vào phần gợi ý).
- [ ] `pnpm run type-check` / `pnpm run build` của `frontend` pass sạch.
