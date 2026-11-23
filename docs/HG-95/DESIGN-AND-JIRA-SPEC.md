# [HG-95] Thiết kế triển khai: Gợi ý chọn tình trạng dịch vụ khi tạo đơn (Hướng 4 — Hybrid)

- **Ticket:** `HG-95` — *Gợi ý chọn tình trạng dịch vụ phù hợp trong lúc tạo đơn cho khách*
- **Tài liệu đối chiếu hiện trạng:** [CURRENT-STATE-AND-BASELINE.md](./CURRENT-STATE-AND-BASELINE.md)
- **Phương án đã chốt:** **Hướng 4 — Hybrid** (Server-Driven `catalog-service` + Admin Web + Mobile Fallback)

---

## 1. Tóm tắt vấn đề & mục tiêu

- **Hiện trạng:** Màn hình **Mô tả sự cố** (`CustomerBookingScreen`) trên Mobile đang hardcode duy nhất 1 bộ gợi ý của *Sửa ống nước* cho toàn bộ gần 100 dịch vụ trong hệ thống.
- **Mục tiêu:**
  1. Hiển thị đúng các nhóm & chip gợi ý tình trạng phù hợp với từng dịch vụ khách chọn.
  2. Hỗ trợ Admin tự cấu hình gợi ý khi thêm **Mục (Category)** hoặc **Dịch vụ (Service)** mới mà **không cần build/release lại app Mobile**.
  3. An toàn khi triển khai lệch pha giữa Backend và Mobile nhờ lớp fallback local trên Mobile.

---

## 2. Kiến trúc giải pháp (Hybrid — 4 tầng ưu tiên)

### Luồng phân giải gợi ý trên Mobile
Khi khách hàng mở màn hình **Mô tả sự cố** cho một dịch vụ, Mobile lấy danh sách nhóm gợi ý theo thứ tự ưu tiên:

1. **`service.suggestionGroups` từ API `catalog-service`** — Cấu hình riêng cho dịch vụ đặc thù (override).
2. **`category.suggestionGroups` từ API `catalog-service`** — Cấu hình mặc định kế thừa từ Mục (Category) cha.
3. **Local preset trên Mobile** — Khớp theo từ khóa tên dịch vụ / tên mục (dự phòng cho dịch vụ chưa cấu hình trên DB hoặc khi BE chưa kịp deploy).
4. **Fallback trung tính** — Bộ nhãn phổ quát (*Nhu cầu / Tình trạng*, *Mức độ ưu tiên*) đảm bảo hợp lý với mọi ngành mới.

---

## 3. Data Contract & Schema (`suggestionGroups`)

Dùng chung một cấu trúc JSON chuẩn ở cả Backend (`JSONB`), Admin Web và Mobile:

```ts
export type ServiceSuggestionGroup = {
  key: string;                        // vd: 'issue', 'device_type', 'location', 'severity'
  label: string;                      // Tiêu đề hiển thị: 'Tình trạng thiết bị', 'Loại máy', 'Mức độ'
  descriptionPrefix?: string;         // Nhãn khi ghép vào ô mô tả (mặc định dùng label)
  selectionMode?: 'single' | 'multiple'; // Mặc định 'single'
  options: string[];                  // Danh sách chip gợi ý
};
```

Ví dụ cho dịch vụ **Sửa máy lạnh**:
```json
[
  {
    "key": "issue",
    "label": "Tình trạng thiết bị",
    "descriptionPrefix": "Tình trạng",
    "selectionMode": "single",
    "options": ["Không lạnh / yếu lạnh", "Chảy nước", "Kêu to / rung", "Không lên nguồn", "Báo lỗi", "Chưa rõ"]
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

## 4. Phạm vi triển khai theo từng phần

### 4.1. Backend (`backend/apps/catalog-service`)
- **Database Migration (Prisma):**
  - Thêm cột `suggestion_groups Json?` (nullable) vào bảng `categories` và bảng `services`.
- **DTO & Validation:**
  - Validate mảng `suggestionGroups` trong `CreateCategoryDto`, `UpdateCategoryDto`, `CreateServiceDto`, `UpdateServiceDto`.
  - Trả về `suggestionGroups` trong `CategoryResponseDto`, `ServiceResponseDto` (kèm `category.suggestionGroups` để Mobile nhận ngay khi lấy danh sách dịch vụ mà không cần gọi thêm API).
- **Seed / Backfill dữ liệu ban đầu:**
  - Chuẩn bị bộ dữ liệu gợi ý cho các mục và dịch vụ hiện có (~100 dịch vụ) để seed vào DB, giảm công sức nhập tay ban đầu.

### 4.2. Admin Web (`frontend`)
- Bổ sung khu vực cấu hình **Gợi ý tình trạng dịch vụ** (tùy chọn) trong form tạo/sửa Category và Service:
  - **Nhập tay trực quan:** Thêm/xóa nhóm, đặt tên nhóm, thêm/xóa từng chip lựa chọn.
  - **Tiện ích dán nhanh JSON (Import JSON):** Cho phép Admin copy JSON gợi ý (tự soạn hoặc sinh sẵn từ Gemini/Codex) dán vào để tự động điền form, duyệt lại rồi bấm Lưu.

### 4.3. Mobile (`mobile`)
- **Truyền dữ liệu đầy đủ sang màn Booking:**
  - Từ `category-screen.tsx` và `customer-home-screen.tsx`, truyền thêm `categoryId`, `categoryName` (và `suggestionGroups` từ `ServiceResponseDto` / cache Catalog) sang `CustomerBookingScreen`.
- **Module resolve gợi ý tách biệt khỏi UI:**
  - Áp dụng chuỗi ưu tiên 4 tầng (API Service → API Category → Local Preset → Fallback trung tính).
- **Cập nhật `CustomerBookingScreen` & `summary.tsx`:**
  - Render động theo `ServiceSuggestionGroup[]` thay vì hardcode 3 nhóm cố định.
  - Thay cơ chế regex hardcode `Sự cố|Vị trí|Mức độ` bằng cơ chế ghép/gỡ text sạch theo các nhóm động, **bảo toàn 100% nội dung khách tự gõ tay**.
  - Reset state chip khi đổi `serviceId` hoặc khi bấm nút **Điền nhanh**.
  - Đảm bảo `summary.tsx` giữ nguyên tên dịch vụ và không bị lặp prefix khi tạo đơn.

---

## 5. Checklist kiểm thử & nghiệm thu

- [ ] **Backend:** Unit test validation `suggestionGroups` hợp lệ / không hợp lệ; API `GET /categories`, `GET /services`, `GET /services/:id` trả đúng dữ liệu; migration chạy sạch.
- [ ] **Admin Web:** Tạo/sửa Category & Service có và không có `suggestionGroups`; test nhập tay và dán nhanh JSON.
- [ ] **Mobile:**
  - [ ] Chọn dịch vụ có cấu hình riêng từ API → hiển thị đúng bộ override.
  - [ ] Chọn dịch vụ không có cấu hình riêng → kế thừa đúng bộ của Category cha.
  - [ ] Trường hợp API chưa trả `suggestionGroups` → hiển thị đúng local preset theo dịch vụ/mục, không hiện nhầm bộ *Sửa ống nước*.
  - [ ] Dịch vụ thuộc ngành hoàn toàn mới → hiển thị bộ fallback trung tính.
  - [ ] Chọn/bỏ chọn chip không làm mất nội dung khách đã tự gõ; đổi dịch vụ hoặc bấm *Điền nhanh* sẽ reset state chip sạch sẽ.
  - [ ] Đối chiếu lại toàn bộ tiêu chí trong [CURRENT-STATE-AND-BASELINE.md](./CURRENT-STATE-AND-BASELINE.md).

---

## 6. Câu hỏi nhỏ cần chốt nhanh trước khi code
- Trên Mobile, thẻ **"Gợi ý cho dịch vụ này"** nên **mở sẵn mặc định** (để khách thấy và chọn ngay) hay giữ **thu gọn mặc định** như hiện tại?
