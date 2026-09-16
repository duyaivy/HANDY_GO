# HANDY_GO Mobile - Source Base (Task HG-15)

Mobile Application Source Base cho dự án **HANDY_GO** (Nền tảng kết nối dịch vụ sửa chữa và tiện ích gia đình theo yêu cầu).
Dự án sử dụng React Native 0.81, Expo SDK 54, TypeScript Strict, Uniwind / TailwindCSS v4 và PNPM.

Đây là gói khởi tạo nền tảng kiến trúc (Foundation/Scaffold), cung cấp toàn bộ tooling, design system UI, storage, network client, localization và routing base để các thành viên triển khai các tính năng nghiệp vụ tiếp theo.

---

## 1. Công Nghệ & Tooling (Tech Stack)

| Phân hệ | Công nghệ / Thư viện | Mục đích |
| :--- | :--- | :--- |
| **Core Framework** | React Native 0.81 + Expo SDK 54 | Nền tảng ứng dụng di động đa nền tảng |
| **Language** | TypeScript 5.9 (Strict Mode) | Type-safety, tự phát hiện lỗi sớm |
| **Package Manager** | PNPM (`pnpm@10.12.3`) | Quản lý gói dependencies tốc độ cao và tối ưu dung lượng |
| **Navigation** | Expo Router v6 (File-based Routing) | Điều hướng Stack & Pages tối giản, sẵn sàng mở rộng |
| **Styling & Theme** | NativeWind / Uniwind (TailwindCSS v4) | CSS variables, hỗ trợ Light/Dark mode, UI tokens nhất quán |
| **Server State & Cache**| TanStack React Query v5 | Caching, deduplication, auto retry khi gọi API |
| **Network & API Client**| Axios + Custom Interceptors & Abstraction | Xử lý Bearer token tự động, timeout 15s, phân loại ApiError |
| **Local Storage** | react-native-mmkv (C++ Nitro) | Lưu trữ persistent siêu nhanh trên thiết bị |
| **Forms & Validation** | TanStack Form + Zod | Schema validation an toàn kiểu dữ liệu |
| **Localization** | i18next + react-i18next | Đa ngôn ngữ (`vi`, `en`, `ar`) |
| **Code Quality** | ESLint (@antfu/eslint-config) | Kiểm soát quy chuẩn và định dạng code tự động |
| **Testing** | Jest + React Native Testing Library | Unit tests cho core components và entry screen |

---

## 2. Yêu Cầu Môi Trường (Prerequisites)

Trước khi bắt đầu, máy tính của bạn cần cài đặt sẵn:
1. **Node.js**: Phiên bản LTS `>= 20.x` (khuyến nghị `20.x` hoặc `22.x`).
2. **PNPM**: Cài đặt thông qua npm nếu chưa có:
   ```bash
   npm install -g pnpm
   ```
3. **Android Studio**:
   - Cài đặt **Android SDK Platform** (khuyến nghị Android 14 / API 34 hoặc Android 15 / API 35).
   - Cài đặt **Android SDK Build-Tools**, **Android SDK Command-line Tools**, và **CMake / NDK**.
   - Thiết lập biến môi trường `ANDROID_HOME` trỏ tới thư mục SDK (thường là `C:\Users\<User>\AppData\Local\Android\Sdk`).
   - Đã tạo sẵn ít nhất một **Máy ảo Android (AVD Emulator)** (ví dụ: Pixel 8 / 9 - API 34/35).

> [!IMPORTANT]
> **Dự án sử dụng Expo Development Build (Expo Dev Client)** vì tích hợp các module native C++ hiệu năng cao (`react-native-mmkv`, `nitro-modules`, `reanimated`...).
> 👉 **KHÔNG THỂ dùng ứng dụng Expo Go thông thường trên CH Play để quét mã QR!** Bạn cần build file APK phát triển lên máy ảo theo hướng dẫn bên dưới.

---

## 3. Hướng Dẫn Cài Đặt & Chạy Ứng Dụng

### Bước 1: Cài đặt thư viện và file môi trường

Mở terminal tại thư mục gốc của repo, di chuyển vào `mobile`:
```bash
# 1. Di chuyển vào thư mục mobile
cd mobile

# 2. Cài đặt toàn bộ dependencies bằng PNPM
pnpm install

# 3. Tạo file cấu hình môi trường từ mẫu
cp .env.example .env
```
*(Trên Windows PowerShell nếu lệnh `cp` không chạy được, bạn có thể dùng `Copy-Item .env.example .env`)*.

---

### Bước 2: Build & Cài đặt app lên Máy ảo (Chỉ cần làm LẦN ĐẦU TIÊN)

Trước khi chạy, hãy **bật sẵn máy ảo Android (Emulator)** lên.

Chọn **1 trong 2 cách** sau:

#### 👉 Cách A: Chạy qua Terminal (Khuyên dùng - Đơn giản nhất)
Tại thư mục `mobile`, chạy lệnh:
```bash
pnpm run android
```
- **Quá trình diễn ra:**
  - Lệnh này sẽ tự động nhận diện máy ảo đang bật.
  - Gradle sẽ tự động tải các dependencies, biên dịch mã nguồn C++ native và đóng gói file APK `com.handygo.development`.
  - Tự động cài app vào máy ảo và mở app lên.
  - *Lưu ý: Lần đầu tiên Gradle build C++ có thể mất từ 5 – 10 phút. Các lần sau sẽ chỉ mất vài giây.*

#### 👉 Cách B: Build qua giao diện Android Studio
1. Mở **Android Studio** -> Chọn **Open** (hoặc **File > Open...**).
2. Trỏ tới thư mục: `HANDY_GO/mobile/android` *(Lưu ý: Chỉ mở đúng thư mục con `android`, không mở thư mục `mobile`)*.
3. Đợi Android Studio sync Gradle xong (báo `Gradle sync finished`).
4. Ở thanh công cụ trên cùng:
   - Target Device: Chọn máy ảo đang bật.
   - Configuration: Chọn **`app`**.
   - Bấm nút **Run (▶️ màu xanh lá)** hoặc phím tắt `Shift + F10`.

---

### Bước 3: Quy trình chạy & Code hàng ngày (Từ lần thứ 2 trở đi - Cực nhanh)

Sau khi app đã được cài lên máy ảo ở Bước 2, **bạn KHÔNG CẦN phải build lại native APK nữa**.

1. **Bật máy ảo Android**.
2. **Khởi động Metro Bundler**:
   ```bash
   cd mobile
   pnpm run start
   ```
   > ⚠️ **Luôn giữ cửa sổ Terminal này mở trong suốt quá trình code.**
3. **Mở app**:
   - Trên terminal Metro, chỉ cần bấm phím **`a`** trên bàn phím. App trên máy ảo sẽ tự động mở lên!
   - *(Hoặc trên máy ảo, bấm vào icon app **HANDY GO** -> Chọn server `http://10.0.2.2:8081` hoặc `http://127.0.0.1:8081`)*.
4. **Code & Xem thay đổi:**
   - Mở code trong thư mục `src/` để lập trình. Mỗi khi bấm `Ctrl + S`, màn hình máy ảo sẽ tự cập nhật ngay lập tức (**Fast Refresh**).
   - Bấm `Ctrl + M` trên máy ảo nếu cần mở Dev Menu (để Reload hoặc Debug).

---

## 4. Xử Lý Các Vấn Đề Thường Gặp (Troubleshooting)

### 🔴 Lỗi 1: `No development build installed`
- **Nguyên nhân:** Bạn chạy `pnpm run start` và bấm phím `a` khi chưa từng build và cài đặt file APK lên máy ảo lần nào.
- **Khắc phục:** Thực hiện lại **Bước 2** bằng lệnh `pnpm run android` để máy ảo được cài app trước.

### 🔴 Lỗi 2: Màn hình trắng hoặc báo `Failed to connect to /10.0.2.2:8081`
- **Nguyên nhân:** Cửa sổ terminal chạy Metro server đã bị tắt hoặc chưa khởi động, hoặc do máy ảo bị mất liên kết port.
- **Khắc phục:**
  1. Mở terminal và chạy `pnpm run start`.
  2. Nếu vẫn báo lỗi kết nối, mở thêm 1 tab terminal chạy:
     ```bash
     adb reverse tcp:8081 tcp:8081
     ```
  3. Bấm vào dòng `HANDY GO (http://127.0.0.1:8081)` trên màn hình máy ảo hoặc bấm `Reload`.

### 🔴 Lỗi 3: Cache cũ hoặc xung đột Metro
- **Khắc phục:** Tắt terminal Metro (`Ctrl + C`) và khởi động lại với cờ xóa cache:
  ```bash
  pnpm run start -c
  ```

---

## 5. Các Lệnh Thực Thi (Scripts Reference)

```bash
# Khởi động Metro Bundler
pnpm run start

# Khởi động Metro Bundler xóa sạch cache
pnpm run start -c

# Build và chạy native trên Android Emulator
pnpm run android

# Build và chạy native trên iOS Simulator (chỉ dành cho macOS)
pnpm run ios

# Kiểm tra an toàn kiểu dữ liệu TypeScript (Strict Mode)
pnpm run type-check

# Kiểm tra quy chuẩn ESLint
pnpm run lint

# Tự động format và sửa lỗi ESLint
pnpm run lint:fix

# Chạy Unit Tests với Jest
pnpm run test

# Kiểm tra cú pháp file đa ngôn ngữ (JSON)
pnpm run lint:translations

# Kiểm tra toàn diện chất lượng code (Chạy trước khi Commit / Tạo PR)
pnpm run check-all
```

---

## 6. Cấu Trúc Thư Mục `mobile/`

```text
mobile/
├── assets/                     # App icons, splash screens, assets tĩnh
├── src/
│   ├── __tests__/              # App level unit tests (đặt ngoài app/ để tránh Expo Router nhận nhầm route)
│   │   └── index.test.tsx      # Unit test cho Entry Screen
│   ├── app/                    # Expo Router file-based routing
│   │   ├── _layout.tsx         # Root Layout, ThemeProvider, SplashScreen & Global Providers
│   │   ├── index.tsx           # Entry Screen ("HANDY GO Mobile")
│   │   ├── +html.tsx           # Web entry container
│   │   └── +not-found.tsx      # 404 handler
│   │
│   ├── components/             # Reusable UI component system
│   │   └── ui/                 # Button, Text, Input, Checkbox, Select, Modal, Screen, Card, Icons...
│   │
│   ├── constants/              # App constants, storage keys, config
│   │   ├── app-constants.ts    # Timeout, page size, app config
│   │   ├── route-names.ts      # Type-safe routes
│   │   ├── storage-keys.ts     # MMKV storage keys (handy_go_*)
│   │   └── index.ts
│   │
│   ├── hooks/                  # Common custom hooks
│   │   └── index.ts
│   │
│   ├── lib/                    # Foundation libraries & wrappers
│   │   ├── api/                # Axios instance, interceptors, React Query provider
│   │   ├── auth/               # Token storage utilities
│   │   ├── hooks/              # Theme hook, first-time hook
│   │   ├── i18n/               # i18next configuration & language helpers
│   │   ├── storage.tsx         # MMKV storage utility
│   │   ├── test-utils.tsx      # Testing library helpers
│   │   └── utils.ts            # Common utility functions
│   │
│   ├── services/               # Infrastructure services
│   │   ├── api/                # Base API client & error handler (ApiClient, ApiError)
│   │   ├── logger/             # Logging wrapper with safe masking
│   │   ├── storage/            # Persistent storage service
│   │   └── index.ts
│   │
│   ├── stores/                 # Zustand global client stores
│   │   ├── use-app-store.ts    # Store lưu trạng thái app (online, notifications)
│   │   └── index.ts
│   │
│   ├── translations/           # Localization resources (JSON)
│   │   ├── en.json             # English resources
│   │   ├── vi.json             # Tiếng Việt resources
│   │   └── ar.json             # Arabic resources
│   │
│   ├── types/                  # Foundation TypeScript types
│   │   ├── api.ts              # ApiResponse, PaginatedResponse, PaginationParams
│   │   ├── common.ts           # ID, Coordinates, Nullable
│   │   └── index.ts
│   │
│   └── global.css              # NativeWind / Uniwind design tokens
│
├── .env.example                # Biến môi trường mẫu cho HANDY GO
├── app.config.ts               # Cấu hình Expo cho HANDY GO (com.handygo.*)
├── env.ts                      # Schema validation biến môi trường bằng Zod
├── package.json                # Định danh handy-go-mobile v1.0.0
└── tsconfig.json               # Cấu hình TypeScript với path alias @/*
```

---

## 7. Nguyên Tắc Phát Triển Cho Thành Viên Nhóm (Team Guidelines)

1. **Path Alias:** Luôn sử dụng alias `@/` để trỏ vào thư mục `src/` (ví dụ: `import { Button } from '@/components/ui/button'`).
2. **UI Component System:** Sử dụng các components có sẵn trong `src/components/ui/` (`Button`, `Text`, `Input`, `Screen`, `Card`, v.v.) kết hợp Uniwind / TailwindCSS classes để đảm bảo giao diện đồng bộ và hỗ trợ cả Light/Dark theme.
3. **Gọi API:** Sử dụng `ApiClient` từ `@/services/api` kết hợp `useQuery` / `useMutation` từ `@tanstack/react-query` thông qua `APIProvider`.
4. **Lưu trữ cục bộ:** Sử dụng `StorageService` hoặc `@/lib/storage` (dựa trên MMKV C++ siêu nhanh) thay vì AsyncStorage cũ.
5. **Đa ngôn ngữ:** Luôn định nghĩa chuỗi hiển thị trong `src/translations/` (`vi.json`, `en.json`) và sử dụng hook `useTranslation()` hoặc component `<Text tx="..." />`.
6. **Quy tắc Kiểm tra trước khi tạo PR:**
   Luôn chạy lệnh sau trước khi commit để đảm bảo code không bị vỡ CI:
   ```bash
   pnpm run check-all
   ```
