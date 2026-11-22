# HG-95 — Ghi nhận hiện trạng (Baseline) trước khi triển khai

- **Ticket:** `HG-95` — *Gợi ý chọn tình trạng dịch vụ phù hợp trong lúc tạo đơn cho khách*
- **Nhánh làm việc:** `feature/HG-95-service-issue-suggestions`
- **Base commit (`origin/main`):** `a5f15c2c` (`Merge pull request #93 from duyaivy/feature/HG-71-mobile-app-payment-wallet`)
- **Ngày ghi nhận:** 2026-11-22
- **Mục đích tài liệu:** Lưu lại chính xác tình trạng hiện tại của codebase trước khi chỉnh sửa để đối chiếu (before/after) sau khi hoàn thành task.

---

## 1. Tóm tắt vấn đề hiện tại

Hiện tại, màn hình **Mô tả sự cố** (`CustomerBookingScreen`) khi khách hàng tạo đơn chỉ có **duy nhất 1 bộ chip gợi ý hardcode cho dịch vụ "Sửa ống nước"**. Dù khách hàng chọn bất kỳ dịch vụ nào khác trong hệ thống (như *Vệ sinh máy lạnh*, *Sửa máy giặt*, *Sửa điện*, *Sửa khóa*, *Sửa xe máy*, *Dọn dẹp nhà cửa*, *Sơn nhà*, *Sửa máy tính*, *Chăm sóc mẹ và em bé*, *Bốc xếp hàng hoá*...), màn hình vẫn hiển thị nguyên bộ gợi ý của Sửa ống nước (`Rò rỉ nước`, `Tắc nghẽn`, `Vòi/thiết bị hỏng`, `Tầng hầm`, `Nặng (ngập/nguy hiểm)`...).

---

## 2. Chi tiết hiện trạng theo từng tầng

### 2.1. Mobile — Màn hình tạo đơn (`CustomerBookingScreen`)

- **File:** `mobile/src/features/orders/customer/screens/customer-booking-screen.tsx`

| Hạng mục | Hiện trạng (As-Is) | Vị trí trong code |
|---|---|---|
| Nguồn dữ liệu gợi ý | Hardcode 1 hằng số `SUGGESTION_CATEGORIES` duy nhất (phong cách Sửa ống nước) | Dòng `42-64` |
| Nhóm 1 — **Loại sự cố** | `Rò rỉ nước`, `Tắc nghẽn`, `Vòi/thiết bị hỏng`, `Lắp đặt mới`, `Chưa rõ` | Dòng `44-50`, `803-834` |
| Nhóm 2 — **Vị trí** | `Nhà bếp`, `Nhà tắm`, `Sân vườn`, `Tầng hầm`, `Chưa rõ` | Dòng `51-57`, `836-867` |
| Nhóm 3 — **Mức độ** | `Nhẹ (ít ảnh hưởng)`, `Trung bình`, `Nặng (ngập/nguy hiểm)`, `Chưa rõ` | Dòng `58-63`, `869-900` |
| Trạng thái thẻ gợi ý mặc định | Thu gọn mặc định (`isSuggestionsCollapsed = true`), người dùng phải bấm vào `Gợi ý cho dịch vụ này` mới mở ra | Dòng `119`, `780-797` |
| State lưu chip đang chọn | 3 state cục bộ rời rạc: `selectedIssueType`, `selectedLocation`, `selectedSeverity` (chỉ cho phép single-select mỗi nhóm) | Dòng `122-124` |
| Xử lý chọn chip (`handleSelectChip`) | Ghép text theo mẫu cố định `Sự cố: <...> - Vị trí: <...> - Mức độ: <...>`. Bỏ qua giá trị `'Chưa rõ'`. Giữ nguyên text khách tự gõ bằng cách strip `prevChipTextRef` và regex hardcode `Sự cố\|Vị trí\|Mức độ` | Dòng `405-473` |
| Định dạng chuỗi mô tả tạo ra | - Chưa có custom text: `Tôi cần người <serviceName>: <chipText>`<br>- Đã có custom text: `<customText>. <chipText>` | Dòng `457-472` |
| Nút **Điền nhanh** (`handleQuickFill`) | Ghi đè `description` thành `Tôi cần người <serviceName>`, **không reset** 3 state chip đang chọn và `prevChipTextRef` | Dòng `475-478`, `938-954` |
| Đổi `serviceId` khi component vẫn mount | `useEffect` gọi `store.resetDraft()` nhưng **không reset** `selectedIssueType`, `selectedLocation`, `selectedSeverity`, `prevChipTextRef` | Dòng `195-214` |
| Truyền thông tin dịch vụ vào màn hình | Chỉ đọc `serviceId` (prop hoặc searchParams) và `serviceName` (searchParams hoặc `resolveServiceName(serviceId)`). Chưa nhận/dùng `categoryId` hay `categoryName` | Dòng `84-106` |

### 2.2. Mobile — Các điểm điều hướng vào màn hình Booking & Draft Store

| File | Hiện trạng (As-Is) | Vị trí |
|---|---|---|
| `mobile/src/app/customer/booking/index.tsx` | Chỉ lấy `serviceId` từ `useLocalSearchParams` và truyền xuống `<CustomerBookingScreen serviceId={serviceId} />` | Dòng `4-7` |
| `mobile/src/features/catalog/screens/category-screen.tsx` | Có đủ object `service: ServiceResponseDto` (gồm `categoryId`, `category.name`) nhưng chỉ truyền `{ serviceId, serviceName }` khi `router.push(RouteNames.CUSTOMER_BOOKING)` | Dòng `137-142` |
| `mobile/src/features/home/customer/screens/customer-home-screen.tsx` | Có object `service?: ServiceResponseDto` nhưng chỉ truyền `{ serviceId, serviceName }` | Dòng `70-81` |
| `mobile/src/features/catalog/screens/service-detail-screen.tsx` | Truyền `{ serviceId, serviceName: resolveServiceName(serviceId) }` | Dòng `32-39` |
| `mobile/src/features/orders/stores/use-booking-draft-store.ts` | Lưu `serviceId`, `serviceName`, `description`, `addressText`, `latitude`, `longitude`, `scheduledAt`, `mediaUrls`, ... Không lưu `categoryId`/`categoryName` hay metadata gợi ý | Dòng `4-29` |
| `mobile/src/app/customer/booking/summary.tsx` | Khi gửi đơn (`handleStartFinding`), nếu `description` bắt đầu bằng `sự cố:` hoặc `vị trí:` và chưa có `serviceName`, tự động thêm prefix `Tôi cần người ${serviceName}: ` | Dòng `97-109` |

### 2.3. Mobile — Danh sách dịch vụ hiện có trong `constants/services.ts`

- **File:** `mobile/src/constants/services.ts` (`KNOWN_SERVICES_BY_ID`, dòng `3-74`)
- Hiện khai báo **38 UUID dịch vụ** (cùng các short ID/slug demo), có thể gom vào các nhóm chính sau:
  1. **Điện lạnh:** Vệ sinh máy lạnh, Sửa máy lạnh, Tháo và lắp đặt máy lạnh, Sửa tủ lạnh, Vệ sinh tủ lạnh
  2. **Điện dân dụng:** Sửa điện, Lắp đặt hệ thống điện, Hệ thống chiếu sáng
  3. **Ống nước & Thoát nước:** Sửa ống nước, Thông cống, Bảo trì hệ thống nước, Lắp đặt và sửa chữa bồn cầu, (slug: Chống thấm)
  4. **Điện gia dụng:** Sửa máy giặt, Vệ sinh máy giặt, Sửa điện gia dụng khác
  5. **Điện tử & CNTT:** Sửa tivi, Điện tử gia dụng, Bảo dưỡng máy in, Lắp đặt và sửa chữa mạng, Sửa tivi và âm thanh, Sửa máy tính
  6. **Cửa & Nhôm kính / Cửa cuốn:** Cửa nhôm kính, Lắp đặt cửa kính, Thi công vách ngăn nhôm, Vệ sinh cửa kính, Lắp đặt cửa cuốn, Bảo trì và sửa chữa cửa cuốn
  7. **Cơ khí / Sắt hàn:** Thợ sắt, Thợ hàn, Thợ tiện
  8. **Khóa cửa:** Sửa khoá và làm chìa khoá, Lắp đặt hệ thống khoá
  9. **Xe cộ:** Sửa xe máy, Sửa xe oto, Sơn ô tô, Thay và vá lốp xe
  10. **Nhà cửa & Vệ sinh:** Dọn dẹp nhà cửa, Sơn nhà
  11. **Chăm sóc gia đình & Vận chuyển (slug/demo):** Chăm sóc mẹ và em bé, Bốc xếp hàng hoá, Vận chuyển hàng hoá

### 2.4. Backend (`catalog-service` & `order-service`)

- **`catalog-service`:**
  - `backend/apps/catalog-service/prisma/schema.prisma` (dòng `10-42`)
  - `backend/apps/catalog-service/src/services/dto/service-response.dto.ts` (dòng `21-54`)
  - Hiện tại `Category` và `Service` **chưa có trường/bảng nào** lưu cấu hình gợi ý tình trạng dịch vụ.
- **`order-service`:**
  - `backend/apps/order-service/src/service-requests/dto/create-service-request.dto.ts` (dòng `56-137`)
  - Chỉ nhận `description?: string` (mô tả dạng chuỗi văn bản). Các lựa chọn gợi ý trên mobile hiện được ghép trực tiếp vào trường `description` này.

### 2.5. Unit Test hiện có liên quan trực tiếp

- **File:** `mobile/src/features/orders/customer/__tests__/customer-booking-service-name-and-description.test.tsx`
- Hiện có 6 test cases, trong đó có 2 test liên quan trực tiếp đến chip gợi ý:
  1. `preserves user custom typed description when clicking suggestion chips` (dòng `60-108`):
     - Render `CustomerBookingScreen` với `serviceId="cbb1b85c-32f9-4041-a0fd-df5cde04784f"` (**Sửa máy giặt**).
     - Đang click vào chip `'Nhà tắm'` và `'Nặng (ngập/nguy hiểm)'` (vốn thuộc bộ hardcode của Sửa ống nước).
     - Verify custom text không bị ghi đè khi chọn/bỏ chọn chip.
  2. `prefixes serviceName when user selects suggestion chips without typing custom text first` (dòng `146-168`):
     - Render với `Sửa máy giặt`, click `'Nhà tắm'`.
     - Verify kết quả là `'Tôi cần người Sửa máy giặt: Vị trí: Nhà tắm'` và **không** chứa `'Cần thợ kiểm tra'`.
     - Bỏ chọn chip thì `description` quay về chuỗi rỗng `''`.

---

## 3. Danh sách điểm cần đối chiếu sau khi fix (Before / After Checklist)

| # | Tiêu chí đối chiếu | Hiện trạng (Before) | Mục tiêu sau khi fix (After) | Trạng thái |
|---|---|---|---|---|
| 1 | Gợi ý phù hợp theo dịch vụ/danh mục | 100% dịch vụ dùng chung 1 bộ chip Sửa ống nước | Mỗi nhóm dịch vụ / dịch vụ cụ thể hiển thị đúng nhóm & lựa chọn tình trạng phù hợp; có fallback chung hợp lý cho dịch vụ mới/chưa rõ | `[ ]` |
| 2 | Dữ liệu đầu vào phân loại dịch vụ | Chỉ dùng `serviceId` / `serviceName` để hiển thị tiêu đề | Resolve đúng bộ gợi ý từ `serviceId`, `serviceName`, `categoryId`/`categoryName` (nếu có) | `[ ]` |
| 3 | Ghép & gỡ text từ chip vào `description` | Hardcode 3 key `Sự cố`, `Vị trí`, `Mức độ` | Tự động ghép/gỡ chính xác theo các nhóm gợi ý của dịch vụ đang chọn, vẫn bảo toàn custom text người dùng tự nhập | `[ ]` |
| 4 | Reset state chip khi đổi dịch vụ hoặc bấm "Điền nhanh" | Không reset `selected*` và `prevChipTextRef` | Reset sạch state chip khi đổi `serviceId` hoặc bấm "Điền nhanh" (tránh dính state cũ) | `[ ]` |
| 5 | Tương thích màn hình `summary.tsx` | Kiểm tra prefix `sự cố:` / `vị trí:` để nối `serviceName` | Hoạt động nhất quán với format mô tả mới (không mất tên dịch vụ hoặc lặp prefix) | `[ ]` |
| 6 | Unit tests | Test cũ đang dùng chip Sửa ống nước cho Sửa máy giặt | Cập nhật test cũ + bổ sung test cho nhiều nhóm dịch vụ khác nhau, fallback, đổi dịch vụ và bảo toàn custom text | `[ ]` |
