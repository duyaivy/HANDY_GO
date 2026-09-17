# Checklist dựng source base React Native Expo theo feature-first — HANDY GO

> Phạm vi: chuẩn bị bộ khung để các thành viên tiếp tục triển khai chức năng. Tài liệu mô tả phần đã có và phần đề xuất; các route minh họa bên dưới chưa được tạo trong source.

**Base hoàn thành khi app chạy được, tổ chức source theo feature-first, có providers dùng chung và bộ khung điều hướng với màn hình placeholder.** Người nhận chức năng sẽ thay placeholder bằng giao diện và logic thực tế.

**Feature-first là quy ước chính ngay từ lúc dựng base:** `src/features/<tên-feature>/` chứa màn hình và code riêng của tính năng; `src/app/` chỉ nối route với màn hình và cấu hình navigation. Các thư mục dùng chung giữ code nền tảng phục vụ nhiều feature.

Theo phân công của nhóm, **người phụ trách User & Trust Service sẽ triển khai refresh token**. Quản lý token, phiên đăng nhập, phân quyền thực tế, push, vị trí và thanh toán thuộc các đầu việc chức năng, không phải tiêu chí nghiệm thu source base.

## 1. Vai trò mobile trong kiến trúc microservices

```text
Mobile Khách / Thợ → API Gateway → các backend service
```

- Cấu hình một API base URL theo môi trường để sau này gọi Gateway.
- Backend phụ trách kết nối giữa các service, PostgreSQL/PostGIS và Kafka/RabbitMQ; mobile không cần setup các thành phần này.
- Source mobile chia theo tính năng như `auth`, `home`, `orders`, `profile`; mỗi feature gom màn hình và code liên quan. Không cần một HTTP client hay một app cho mỗi microservice.
- Sơ đồ backend giúp xác định các khu vực chức năng; không có nghĩa người dựng base phải implement tất cả service trên mobile.

## 2. Phần tối thiểu người dựng base cần làm

| Hạng mục              | Phạm vi bàn giao                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Môi trường phát triển | Expo/RN, TypeScript, package manager, alias, lint và scripts chạy app                                                          |
| Cấu hình app          | App name, icon/splash cơ bản, package/bundle ID và env mẫu                                                                     |
| Cấu trúc source       | Dựng `features/` cho các placeholder có trong base; tách route/navigation khỏi màn hình và quy định code riêng/code dùng chung |
| Navigation            | Root Stack, Tabs Khách/Thợ, màn hình chi tiết thuộc Stack; cấu hình header và Back                                             |
| Màn hình placeholder  | Nằm trong `features/<tên>/screens/`, hiện tên màn hình, route và nút điều hướng mẫu; chưa cần UI nghiệp vụ                     |
| Providers             | Gắn theme, Query và các UI providers đang dùng tại root                                                                        |
| API nền               | HTTP client dùng chung, base URL từ env, timeout và cách trả lỗi cơ bản                                                        |
| UI dùng chung         | Tái sử dụng Screen, Text, Button, Input và trạng thái loading/empty/error đã có                                                |
| Công cụ bàn giao      | Cấu hình test, lệnh kiểm tra và README hướng dẫn chạy/thêm màn hình                                                            |

Các màn hình placeholder phải mở được khi chưa có backend hoặc tài khoản thật. Có thể dùng trang đầu với nút “Xem giao diện Khách”, “Xem giao diện Thợ”, “Xem màn hình đăng nhập” để kiểm tra navigation; đây chỉ là lối vào demo bộ khung.

## 3. Đối chiếu source hiện tại

“Đã có” là quan sát cấu hình/code, chưa đồng nghĩa đã kiểm tra chạy thành công trên thiết bị.

| Hạng mục          | Hiện tại                                                                                                               | Cần làm trong phạm vi base                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Framework/tooling | [package.json](./package.json), [tsconfig.json](./tsconfig.json) có Expo, TypeScript strict, alias và scripts          | Tái sử dụng, kiểm tra lệnh chạy                                                   |
| Env/app config    | Có [env.ts](./env.ts), [.env.example](./.env.example), [app.config.ts](./app.config.ts)                                | Hướng dẫn điền env, phân biệt URL mẫu và URL Gateway thực tế                      |
| Navigation        | [app/\_layout.tsx](./src/app/_layout.tsx) có root Stack; [app/index.tsx](./src/app/index.tsx) là trang giới thiệu base | Bổ sung bộ khung route, Tabs và placeholder mẫu                                   |
| Feature-first     | Source hiện chưa có bộ khung `features/` như đề xuất                                                                   | Tạo feature chứa các màn hình mẫu; file route import/re-export màn hình tương ứng |
| HTTP client       | [api-client.ts](./src/services/api/api-client.ts) có Axios, timeout và xử lý lỗi                                       | Ghi rõ cách import/sử dụng; không yêu cầu thêm refresh token                      |
| API re-export     | [lib/api/client.tsx](./src/lib/api/client.tsx) dùng lại instance trong `services/api`                                  | Giữ một instance chung, tránh tạo client trùng                                    |
| React Query       | [provider.tsx](./src/lib/api/provider.tsx) đã có provider ở root                                                       | Giữ sẵn cho người viết chức năng sử dụng                                          |
| State/storage     | Đã có Zustand và MMKV                                                                                                  | Ghi quy ước sử dụng; chưa cần xây store nghiệp vụ                                 |
| UI/theme/i18n     | Có components dùng chung, theme hook và bản dịch                                                                       | Dùng cho placeholder, không cần dựng lại design system                            |
| Test              | Có Jest, RNTL, [test-utils.tsx](./src/lib/test-utils.tsx) và component tests                                           | Giữ công cụ chạy được; thêm provider trong test helper khi ví dụ thực sự cần      |
| Build/tài liệu    | Có [eas.json](./eas.json) và [README.md](./README.md)                                                                  | Kiểm tra hướng dẫn development build và bổ sung sơ đồ navigation                  |

## 4. Cấu hình Stack, Tabs và Screen như thế nào?

### 4.1. Phân biệt các khái niệm

| Thành phần                             | Vai trò trong bộ khung                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `_layout.tsx`                          | Khai báo cách điều hướng/bố trí các route bên dưới; root layout còn chứa providers                           |
| `Stack`                                | Điều hướng từ màn hình này sang màn hình tiếp theo, có lịch sử để Back                                       |
| `Tabs`                                 | Các khu vực ngang hàng xuất hiện trên thanh tab, ví dụ Trang chủ, Đơn hàng, Hồ sơ                            |
| File route như `login.tsx`, `[id].tsx` | Điểm vào của màn hình: import/re-export screen từ feature; có thể đọc route params và truyền xuống screen    |
| `Stack.Screen`                         | Cấu hình route trong Stack: tiêu đề, header, cách trình bày; nội dung giao diện nằm trong screen của feature |
| `Tabs.Screen`                          | Cấu hình route trong Tabs: tên tab, icon, thứ tự và options                                                  |
| `components/ui/Screen`                 | Component bọc giao diện dùng chung của repo; không phải navigator hoặc khai báo route                        |

Một màn hình thuộc Stack hay Tabs tùy layout chứa nó. Với Expo Router, file route được nhận diện tự động; `Stack.Screen` dùng để cấu hình options, không cần truyền `component` như cách khai báo React Navigation thủ công. Tham khảo [Expo navigation layouts](https://docs.expo.dev/router/basics/navigation-layouts/).

### 4.2. Cây route đề xuất

Đây là bộ khung mẫu để kiểm tra điều hướng, chưa phải danh sách màn hình nghiệp vụ đầy đủ. Các file màn hình trong cây `app/` dưới đây chỉ nối đến placeholder ở `features/`; phần chú thích mô tả màn hình được mở, không phải nơi đặt giao diện.

```text
src/app/
├── _layout.tsx                  # Root Stack + providers hiện có
├── index.tsx                    # Trang demo: nút mở Login / Khách / Thợ
├── +not-found.tsx               # Route không tồn tại
├── (auth)/
│   ├── _layout.tsx              # Stack cho các màn hình xác thực
│   └── login.tsx                # Placeholder: “Màn hình đăng nhập”
├── customer/
│   ├── _layout.tsx              # Stack của khu vực Khách
│   ├── (tabs)/
│   │   ├── _layout.tsx          # Tabs: Trang chủ / Đơn hàng / Hồ sơ
│   │   ├── index.tsx            # Placeholder Trang chủ Khách
│   │   ├── orders.tsx           # Placeholder Danh sách đơn
│   │   └── profile.tsx          # Placeholder Hồ sơ Khách
│   └── orders/
│       └── [id].tsx            # Chi tiết đơn: Stack screen, ngoài Tabs
└── worker/
    ├── _layout.tsx              # Stack của khu vực Thợ
    └── (tabs)/
        ├── _layout.tsx          # Tabs: Trang chủ / Công việc / Hồ sơ
        ├── index.tsx            # Placeholder Trang chủ Thợ
        ├── jobs.tsx             # Placeholder Công việc
        └── profile.tsx          # Placeholder Hồ sơ Thợ
```

Giữ `+html.tsx` hiện có nếu vẫn hỗ trợ Expo web; cây trên tập trung vào navigation mobile. Tên thư mục trong ngoặc như `(auth)`, `(tabs)` là route group, không thêm segment vào URL.

| Layout cấu hình               | Route con cần cấu hình                                | Cách hiển thị đề xuất                                             |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Root `app/_layout.tsx`        | `index`, `(auth)`, `customer`, `worker`, `+not-found` | Ẩn header ở các route chứa navigator con để tránh hai header      |
| `(auth)/_layout.tsx`          | `login`                                               | Stack screen có tiêu đề “Đăng nhập”                               |
| `customer/_layout.tsx`        | `(tabs)`, `orders/[id]`                               | Ẩn header cho `(tabs)`; hiện header và Back cho chi tiết đơn      |
| `customer/(tabs)/_layout.tsx` | `index`, `orders`, `profile`                          | Ba tab chính, mỗi tab có tên/icon và một header phù hợp           |
| `worker/_layout.tsx`          | `(tabs)`                                              | Ẩn header của màn chứa Tabs; sẵn vị trí thêm màn chi tiết sau này |
| `worker/(tabs)/_layout.tsx`   | `index`, `jobs`, `profile`                            | Ba tab chính của Thợ                                              |

Ví dụ kiểm tra: từ tab `/customer/orders`, bấm nút mở `/customer/orders/demo-001`. Trang chi tiết hiển thị ID mẫu, không có thanh tab vì nằm ngoài `(tabs)`; Back trở lại danh sách. Đây là kiểm tra điều hướng, không cần API đơn hàng. Cách lồng navigator tham khảo [Expo Stack](https://docs.expo.dev/router/advanced/stack/) và [Expo Tabs](https://docs.expo.dev/router/advanced/tabs/).

### 4.3. Placeholder chỉ cần đến mức nào?

Một màn hình mẫu chỉ cần hiển thị:

```text
Đây là màn hình: Danh sách đơn hàng của Khách
Route: /customer/orders
Chức năng sẽ được triển khai bởi người phụ trách Order.

[Mở chi tiết đơn mẫu]
```

Màn hình đăng nhập cũng chỉ cần tên màn hình/route. Không cần submit đăng nhập, token thật hoặc giả lập một quy trình xác thực hoàn chỉnh để nghiệm thu base.

## 5. Cấu trúc feature-first để bàn giao

### 5.1. Cây source chính

Tạo ngay các feature có placeholder trong base. Ví dụ `orders` chứa cả màn hình đơn của Khách và công việc của Thợ vì cùng một miền chức năng; vai trò Khách/Thợ được phân nhánh ở navigation và các screen tương ứng.

```text
src/
├── app/                              # Route mỏng + Stack/Tabs ở mục 4
├── features/
│   ├── dev-demo/
│   │   └── screens/base-demo-screen.tsx
│   ├── auth/
│   │   └── screens/login-screen.tsx
│   ├── home/
│   │   └── screens/
│   │       ├── customer-home-screen.tsx
│   │       └── worker-home-screen.tsx
│   ├── orders/
│   │   └── screens/
│   │       ├── customer-orders-screen.tsx
│   │       ├── order-detail-screen.tsx
│   │       └── worker-jobs-screen.tsx
│   └── profile/
│       └── screens/
│           ├── customer-profile-screen.tsx
│           └── worker-profile-screen.tsx
├── components/ui/                    # UI dùng chung hiện có
├── lib/                              # Providers, theme, i18n, tiện ích nền
├── services/                         # HTTP client, storage, logger dùng chung
├── stores/                           # Chỉ state dùng chung toàn app
├── types/                            # Chỉ kiểu dùng chung nhiều feature
├── constants/                        # Chỉ hằng số dùng chung
└── translations/                     # Tài nguyên dịch theo cấu hình hiện có
```

`dev-demo` phục vụ kiểm tra bộ khung, không đại diện một backend service. Feature-first là cách tổ chức source, không yêu cầu viết thêm logic nghiệp vụ.

### 5.2. Một feature mở rộng như thế nào?

Ở giai đoạn base, feature chỉ cần `screens/` với placeholder. Khi người phụ trách triển khai chức năng, code liên quan được đặt cùng feature theo mẫu:

```text
features/orders/
├── screens/                 # Các màn hình của tính năng
├── components/              # Component chỉ dùng trong orders
├── api.ts                   # API đơn hàng, dùng HTTP client chung
├── hooks/                   # Query/mutation và hook riêng của orders
├── store.ts                 # State riêng nếu thực sự cần
├── types.ts                 # DTO/model riêng của orders
├── schemas.ts               # Validation riêng nếu cần
└── __tests__/               # Test của feature, hoặc đặt cạnh file được test
```

Các file/thư mục ngoài `screens/` trong mẫu này được thêm **khi triển khai chức năng**, không phải danh sách cần tạo rỗng hoặc implement để nghiệm thu base. Assets riêng cũng có thể đặt trong feature khi phát sinh; icon/splash của app tiếp tục ở `mobile/assets/`.

### 5.3. Ranh giới code riêng và code dùng chung

| Thư mục                            | Đặt gì ở đây?                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/app/`                         | Route, layout, options điều hướng và chuyển route params xuống screen; không chứa UI/logic nghiệp vụ |
| `src/features/<tên>/`              | Screen, component, API, hook, state và type riêng của tính năng; placeholder cũng đặt ở đây          |
| `src/components/ui/`               | Component giao diện dùng chung                                                                       |
| `src/lib/`                         | Providers, theme/i18n, hooks và tiện ích nền tảng                                                    |
| `src/services/api/`                | HTTP client và xử lý lỗi cơ bản                                                                      |
| `src/services/storage/`, `logger/` | Tiện ích lưu preferences và logging hiện có                                                          |
| `src/stores/`                      | State thực sự dùng chung toàn app; state riêng để trong feature                                      |
| `src/types/`, `constants/`         | Kiểu/hằng số thực sự dùng chung; DTO và hằng số riêng để trong feature                               |
| `src/translations/`                | Chuỗi đa ngôn ngữ                                                                                    |

Quy tắc phụ thuộc:

```text
app (route/layout) → features (screen và code tính năng) → code dùng chung
```

- Feature không import file từ `app/`; với màn chi tiết, route có thể đọc ID và truyền xuống screen bằng props.
- Code dùng chung không import ngược vào feature. Component chỉ dùng trong `orders` ở lại `features/orders/components/`.
- Khi cần kết hợp hai feature, dùng interface/export rõ ràng; tránh import sâu vào file nội bộ của nhau hoặc tạo phụ thuộc vòng.
- `services/api/` giữ HTTP client chung; endpoint đơn hàng nằm trong `features/orders/api.ts` khi chức năng được triển khai.
- Không tạo thêm cây feature riêng theo từng backend service hoặc nhân đôi toàn bộ feature cho Khách/Thợ.

### 5.4. Ví dụ nối route với feature

File route `src/app/customer/(tabs)/orders.tsx` chỉ cần re-export screen:

```tsx
export { default } from "@/features/orders/screens/customer-orders-screen";
```

Trong giai đoạn base, `customer-orders-screen.tsx` hiển thị placeholder ở mục 4.3. Người làm Order sau đó sửa nội dung trong feature; cấu hình tab vẫn nằm ở `app/customer/(tabs)/_layout.tsx`.

README cần ghi quy ước feature-first và cách thêm màn hình: **tạo screen trong feature → thêm file route nối đến screen → cấu hình Stack/Tabs nếu cần**. Endpoint, DTO, query keys và logic cache cụ thể do người triển khai từng chức năng bổ sung.

## 6. Checklist nghiệm thu source base

- [ ] Cài dependencies và chạy được app theo README bằng development build phù hợp các native modules hiện có.
- [ ] Có env mẫu, API base URL cấu hình được và app placeholder mở được khi chưa có backend.
- [ ] Root providers hoạt động, giao diện dùng được các component/theme hiện có.
- [ ] Có `features/` ngay trong base; các placeholder nằm trong feature tương ứng, `app/` chỉ giữ route/layout và phần nối với screen.
- [ ] Tài liệu phân biệt code riêng của feature với code dùng chung; có ví dụ thêm screen theo feature-first.
- [ ] Có trang demo mở được route Đăng nhập, khu vực Khách và khu vực Thợ.
- [ ] Tabs hiển thị đúng tên/thứ tự; chuyển qua lại giữa các placeholder được.
- [ ] Có một ví dụ Stack screen chi tiết, truyền ID mẫu và Back đúng; không bị trùng header hoặc hiện tab ngoài ý muốn.
- [ ] Placeholder ghi rõ tên màn hình/route, đủ để người nhận biết vị trí cần implement.
- [ ] HTTP client nền và quy ước cấu trúc source được ghi trong README.
- [ ] Lint, type-check và các test nền hiện có chạy được; hướng dẫn thêm route/tab rõ ràng.
- [ ] Bàn giao danh sách phần chức năng cho người phụ trách, trong đó refresh token thuộc người làm User & Trust.

Các lệnh kiểm tra khi triển khai base, chạy trong `mobile/`:

```bash
pnpm run lint
pnpm run type-check
pnpm run test
```
