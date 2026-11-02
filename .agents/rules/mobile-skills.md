# Mobile Engineering Standards & Skill Integration Rules

> **Phạm vi áp dụng:** BẮT BUỘC tuân thủ đối với MỌI tác vụ đọc, phân tích, tạo mới, chỉnh sửa hoặc tối ưu hóa mã nguồn trong thư mục `mobile/` (React Native, Expo, Navigation, UI Components, Hooks, State, Services).

---

## 1. Yêu Cầu Tiên Quyết Trước Khi Viết Code (Prerequisite Action)

Trước khi đề xuất giải pháp, thiết kế component hoặc viết/sửa code trong thư mục `mobile/`, Agent **BẮT BUỘC PHẢI THỰC HIỆN**:

1. **Đọc tài liệu kỹ năng cốt lõi**:
   - Sử dụng công cụ đọc file để đọc: [`mobile/.agents/skills/vercel-react-native-skills/SKILL.md`](file:///d:/SCHOOL/PBL6/mobile/.agents/skills/vercel-react-native-skills/SKILL.md).
2. **Tra cứu và áp dụng các rules chuyên sâu tương ứng**:
   - Tùy theo bài toán đang thực hiện, đọc các file rule liên quan trong thư mục [`mobile/.agents/skills/vercel-react-native-skills/rules/`](file:///d:/SCHOOL/PBL6/mobile/.agents/skills/vercel-react-native-skills/rules/) trước khi sinh code.

---

## 2. Bảng Tra Cứu Quy Tắc Bắt Buộc Theo Hạng Mục

| Hạng mục bài toán | Độ ưu tiên | File quy tắc cần đọc & áp dụng trong `rules/` | Tóm tắt yêu cầu kỹ thuật |
| :--- | :---: | :--- | :--- |
| **Danh sách & Cuộn (List & Scroll)** | **CRITICAL** | `list-performance-virtualize.md`<br>`list-performance-item-memo.md`<br>`list-performance-callbacks.md`<br>`list-performance-inline-objects.md`<br>`list-performance-images.md` | - Ưu tiên dùng `@shopify/flash-list` cho danh sách lớn.<br>- Bắt buộc `React.memo` các item component.<br>- Dùng `useCallback` ổn định hàm xử lý sự kiện trong item.<br>- Tránh inline objects/arrays trong props và style. |
| **Hoạt họa (Animation & Gesture)** | **HIGH** | `animation-gpu-properties.md`<br>`animation-derived-value.md`<br>`animation-gesture-detector-press.md` | - Chỉ animate thuộc tính GPU: `transform` và `opacity`.<br>- Sử dụng `react-native-reanimated` với `useDerivedValue`.<br>- Dùng `GestureDetector` từ `react-native-gesture-handler`. |
| **Giao diện & Thành phần (UI Patterns)** | **HIGH** | `ui-expo-image.md`<br>`ui-safe-area-scroll.md`<br>`ui-styling.md`<br>`ui-pressable.md`<br>`ui-native-modals.md` | - Luôn dùng `expo-image` thay vì `Image` mặc định để tối ưu cache & memory.<br>- Dùng `Pressable` thay cho `TouchableOpacity` cũ.<br>- Xử lý chuẩn `SafeAreaView` và insets khi cuộn. |
| **Hiển thị & JSX (Rendering Safety)** | **HIGH** | `rendering-no-falsy-and.md`<br>`rendering-text-in-text-component.md` | - **Nghiêm cấm** dùng `condition && <Component />` nếu condition có thể là `0`, `NaN`, `""` (dùng toán tử 3 ngôi `condition ? <Component /> : null`).<br>- Mọi text hoặc giá trị render ra màn hình phải nằm trong `<Text>`. |
| **Quản lý State & Dữ liệu** | **MEDIUM** | `state-ground-truth.md`<br>`react-state-minimize.md`<br>`react-state-dispatcher.md`<br>`scroll-position-no-state.md` | - Xác định duy nhất một Single Source of Truth.<br>- Giảm thiểu state dư thừa có thể tính toán được (derived state).<br>- Không lưu vị trí scroll vào React state gây re-render liên tục. |
| **Điều hướng (Navigation)** | **HIGH** | `navigation-native-navigators.md` | - Sử dụng Expo Router đúng chuẩn cấu trúc file-based routing.<br>- Tuân thủ quy ước định danh route trong `constants/route-names.ts`. |
| **Kiến trúc Monorepo** | **MEDIUM** | `monorepo-native-deps-in-app.md`<br>`monorepo-single-dependency-versions.md` | - Các native dependencies phải đồng bộ phiên bản và khai báo chính xác trong `mobile/package.json`. |

---

## 3. Checklist Tự Kiểm Tra Trước Khi Trả Lời (Self-Verification)

Mỗi khi hoàn thành code cho mobile, Agent phải tự rà soát:
- [ ] Đã đọc `SKILL.md` và các rule liên quan trước khi code chưa?
- [ ] Có dùng `expo-image` cho hiển thị ảnh không?
- [ ] Có bị dính bẫy render falsy `&&` (như `count && <Badge />`) không?
- [ ] Có inline styles hoặc hàm inline trong FlatList/FlashList không?
- [ ] Các text render đã được bọc an toàn trong `<Text>` chưa?
