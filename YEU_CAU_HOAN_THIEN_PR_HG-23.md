# 📋 Yêu Cầu Hoàn Thiện & Tiêu Chí Nghiệm Thu Merge PR (HG-23)

> **Nhánh:** `feature/HG-23-login_and_register`  
> **Dự án:** HANDY GO — PBL6  
> **Người thực hiện:** Huỳnh Đức Thịnh  
> **Nội dung:** Tổng hợp và cụ thể hóa các phản hồi từ Reviewer/Tech Lead để hoàn tất và merge PR vào nhánh chính.

---

## 🎯 1. Bối cảnh & Mục tiêu

Sau khi rà soát khối lượng công việc lớn của task HG-23 (luồng Authentication toàn diện gồm Backend, Database, Docker, Gateway và Mobile), Tech Lead/Reviewer đã đưa ra chỉ đạo **tinh gọn phạm vi để merge sớm**:

> *"Cái task của m nhiều quá, t khong xem hết được tạm thời m đẩy như t liệt kê để merge vô luôn:*  
> *1. Đại khái thì cái cấu trúc code có vấn đề, sửa lại theo hướng feature-base hì vì hiện tại cái src mình hắn đang follow theo như rứa rồi á.*  
> *2. Resolve hết mấy cái comment*  
> *3. Phần mobile t không check, nhưng vibe thì cũng tuân thủ cấu trúc chứ đừng ẩu quá, nếu sau ni performance tệ quá thì phải sửa lại còn tạm tạm thì kệ luôn."*

**Mục tiêu:** Hoàn thiện dứt điểm 3 đầu việc trên với tiêu chí nhanh - gọn - đúng quy ước dự án để hoàn tất việc merge PR.

---

## 🛠️ 2. Chi tiết 3 Yêu cầu Kỹ thuật Cần Thực hiện

### 🔹 Yêu cầu 1: Chuẩn hóa Cấu trúc Code theo hướng Feature-Based (Feature-First)

Toàn bộ dự án (`frontend/src/feature/` và `mobile/src/features/`) đã được thống nhất cấu trúc theo **Feature-First Architecture** (quy định tại [`mobile/SOURCE_BASE_CHECKLIST.md`](file:///d:/SCHOOL/PBL6/mobile/SOURCE_BASE_CHECKLIST.md)). Mã nguồn phục vụ một tính năng nghiệp vụ cụ thể cần được gom vào trong thư mục tính năng đó thay vì phân tán ra các thư mục tầng kỹ thuật chung.

#### 1.1. Chuẩn hóa phía Mobile (`mobile/src/`)
* **Hiện trạng cần chỉnh sửa:**
  - `auth-api.ts` đang nằm ở thư mục dùng chung ngoài feature: `src/services/auth/auth-api.ts`.
  - `use-auth-store.ts` đang nằm tại `src/stores/use-auth-store.ts`.
  - Các màn hình đăng nhập, đăng ký, OTP nằm tại `src/features/auth/screens/`.
* **Cấu trúc Feature-First mục tiêu cho Auth (`mobile/src/features/auth/`):**
  ```text
  mobile/src/features/auth/
  ├── api/
  │   └── auth-api.ts             # Gọi API xác thực qua Gateway
  ├── screens/
  │   ├── login-screen.tsx        # Màn hình đăng nhập
  │   ├── register-screen.tsx     # Màn hình đăng ký (Customer/Worker)
  │   └── otp-verification-screen.tsx # Màn hình xác thực OTP
  ├── stores/
  │   └── use-auth-store.ts       # Quản lý state phiên đăng nhập Zustand
  ├── types/
  │   └── auth.types.ts           # DTO và payload của luồng auth
  ├── __tests__/
  │   ├── login-screen.test.tsx
  │   ├── register-screen.test.tsx
  │   └── otp-verification-screen.test.tsx
  └── index.ts                    # Re-export các thành phần public của feature
  ```
* **Lưu ý:** Re-export rõ ràng từ `src/features/auth/index.ts` để các module khác (như `src/app/`, `src/lib/auth/`) import sạch sẽ, tránh phá vỡ đường dẫn hiện tại.

#### 1.2. Rà soát phía Backend (`backend/apps/auth-service/src/`)
* Tách biệt rõ ràng các tầng nghiệp vụ theo module/flow, không để controller và facade service phình to ở thư mục gốc nếu không cần thiết.
* Đảm bảo tính nhất quán: flow service (`flows/`), session (`session/`), rate-limit (`rate-limit/`), otp (`otp/`).

---

### 🔹 Yêu cầu 2: Rà soát & Resolve toàn bộ Review Comments trên PR

Trên giao diện Web của GitHub/GitLab PR:
1. **Kiểm tra tất cả Unresolved Conversations:** Mở tab **Files changed** và **Conversation** để xem toàn bộ danh sách comment.
2. **Đối chiếu với các thay đổi đã xử lý:**
   - [x] Tách `SessionService`, `UserTrustClient`, `AuthResponseBuilder` giải quyết vi phạm SRP.
   - [x] Loại bỏ magic numbers trong rate limiter (`auth.constants.ts`).
   - [x] Thay thế `any` type bằng Prisma types (`Account`, `Role`, `OtpChallenge`...).
   - [x] Ép buộc cấu hình bí mật `OTP_SECRET` qua `ConfigService` (Fail-Fast).
   - [x] Xử lý Race Condition khi verify và resend OTP đồng thời.
   - [x] Fail-close HTTP 503 khi User & Trust RPC gặp sự cố.
   - [x] Chống giả mạo IP bằng `x-internal-secret` giữa API Gateway và Auth Service.
   - [x] Xóa bỏ boilerplate `getHello()`.
3. **Thao tác chốt trên PR:**
   - Trả lời ngắn gọn (1 câu) xác nhận đã refactor hoặc fix theo gợi ý.
   - Bấm nút **Resolve conversation** cho từng bình luận. Đảm bảo PR đạt trạng thái **0 unresolved comments**.

---

### 🔹 Yêu cầu 3: Đảm bảo Chất lượng Mobile & Chiến lược Hiệu năng (Performance)

Reviewer xác nhận bỏ qua việc soi chi tiết code mobile để ưu tiên tiến độ, nhưng đặt ra 2 điều kiện:

#### 3.1. Giữ chuẩn cấu trúc và phong cách code ("Vibe sạch sẽ")
- Tuân thủ đặt tên: Components theo `PascalCase`, biến/hàm theo `camelCase`, file style/utility theo `kebab-case`.
- Không nhồi nhét xử lý logic phức tạp trực tiếp vào JSX return.
- Tận dụng các component giao diện dùng chung từ `@/components/ui` (`Screen`, `Button`, `Input`, `Text`).

#### 3.2. Chiến lược Hiệu năng: "Tạm tạm thì kệ luôn" (No Premature Optimization)
- **Không over-engineer:** Không cần mất thời gian bao bọc mọi hàm bằng `useCallback`, `useMemo` hay tách nhỏ component quá mức nếu không cần thiết.
- **Tiêu chuẩn nghiệm thu:** 
  - Mở app mượt mà, chuyển đổi giữa tab Khách hàng và Thợ dịch vụ không bị giật lag.
  - Luồng Đăng ký -> Nhận OTP qua Email -> Điền OTP -> Đăng nhập thành công, app điều hướng chính xác vào `/customer/home` hoặc `/worker/home`.
  - Không xuất hiện cảnh báo đỏ (Red Screen / Crash).
- Đạt được các tiêu chuẩn trên là **đạt yêu cầu để merge luôn**, việc tối ưu sâu sẽ để dành cho các sprint sau khi ghép nối toàn bộ nghiệp vụ.

---

## 📋 3. Checklist Kiểm tra Trước khi Báo Merge

Trước khi thông báo reviewer bấm merge, chạy các lệnh kiểm thử sau tại thư mục gốc backend và mobile:

### Phía Backend (`backend/`):
```bash
# 1. Kiểm tra kiểu dữ liệu TypeScript
pnpm run typecheck

# 2. Kiểm tra quy tắc định dạng code
pnpm run lint

# 3. Chạy toàn bộ Unit Tests & E2E Tests
pnpm test
pnpm run test:e2e
```

### Phía Mobile (`mobile/`):
```bash
# 1. Kiểm tra TypeScript
pnpm tsc --noEmit

# 2. Chạy Jest tests của các màn hình Auth
pnpm test
```

---