# HANDYGO MOBILE

Ứng dụng di động của dự án HANDY GO, xây dựng bằng React Native và Expo Development Build. Source base được tổ chức theo business domain và vai trò người dùng để nhiều thành viên có thể phát triển song song với ít xung đột Git.

README này là tài liệu bắt đầu dành cho thành viên mobile. Hãy đọc ít nhất các mục **Cài đặt lần đầu**, **Quy trình chạy ứng dụng hằng ngày** và **Quy tắc sở hữu source code** trước khi sửa code.

## 1. Mục tiêu kiến trúc

Source base tuân theo ba mục tiêu bắt buộc.

### 1.1. Tích hợp backend microservices qua một API Gateway

Ứng dụng mobile không phải là một tập hợp microservice. Mobile là một ứng dụng client dạng modular monolith và chỉ gọi một API Gateway.

```text
Customer UI / Worker UI
          |
          v
Domain modules trong src/features
          |
          v
Shared ApiClient trong src/services/api
          |
          v
API Gateway: EXPO_PUBLIC_API_URL
          |
          v
Backend microservices
```

Các service như User, Order, Payment, Notification hoặc Location thuộc backend. Mobile không gọi trực tiếp từng microservice và không tự tạo nhiều Axios client tương ứng với từng service.

### 1.2. Chia module theo domain trước, role sau

Feature được chia theo business domain như `home`, `orders`, `profile`; bên trong domain mới chia theo `customer` và `worker`.

```text
src/features/orders/
├── customer/
└── worker/
```

Không gom toàn bộ code Customer vào một thư mục lớn và toàn bộ code Worker vào một thư mục lớn. Cách tổ chức domain-first giúp tìm nghiệp vụ, kiểm thử và mở rộng dễ hơn.

### 1.3. Mỗi thành viên làm việc trong một thư mục sở hữu riêng

Một feature developer chỉ sửa role submodule được giao, ví dụ:

```text
src/features/orders/customer/**
```

Những điểm dùng chung như `src/app`, `src/components/ui`, `src/services`, root config và dependency do Base/Integration hoặc Foundation owner quản lý. Quy tắc này giảm xung đột khi nhiều người cùng làm một domain.

## 2. Công nghệ chính

| Phần               | Công nghệ                          |
| ------------------ | ---------------------------------- |
| Framework          | React Native 0.81, Expo SDK 54     |
| Ngôn ngữ           | TypeScript 5.9, strict mode        |
| Package manager    | PNPM 10.12.3                       |
| Navigation         | Expo Router 6                      |
| Styling            | Uniwind, Tailwind CSS 4            |
| Server state       | TanStack React Query 5             |
| HTTP               | Axios thông qua shared `ApiClient` |
| Local storage      | react-native-mmkv                  |
| Form và validation | TanStack Form, Zod                 |
| Localization       | i18next, react-i18next             |
| Test               | Jest, React Native Testing Library |
| Code quality       | ESLint, TypeScript                 |

Dự án sử dụng các native module như MMKV và Nitro Modules, vì vậy phải chạy bằng **Expo Development Build/Dev Client**. Không dùng Expo Go để chạy dự án này.

## 3. Yêu cầu môi trường

### 3.1. Phần mềm cần cài

- Git.
- Node.js LTS 20 hoặc 22.
- PNPM đúng version của project; `package.json` đang khóa `pnpm@10.12.3`.
- Android Studio.
- Android SDK, Platform Tools và Android Emulator.
- JDK tương thích với Android Gradle Plugin; ưu tiên JDK đi kèm Android Studio.
- Ít nhất một Android Virtual Device (AVD).

### 3.2. Cài PNPM

Ưu tiên Corepack:

```powershell
corepack enable
corepack prepare pnpm@10.12.3 --activate
pnpm --version
```

Nếu Corepack trên máy gặp lỗi chữ ký hoặc không kích hoạt được PNPM:

```powershell
npm install --global pnpm@10.12.3
pnpm --version
```

Kết quả mong đợi là `10.12.3`.

### 3.3. Kiểm tra Android SDK và ADB

```powershell
adb --version
```

Nếu không nhận lệnh `adb`, thêm thư mục `platform-tools` của Android SDK vào biến `PATH`. Đường dẫn thường gặp trên Windows:

```text
C:\Users\<username>\AppData\Local\Android\Sdk\platform-tools
```

Trong Android Studio, kiểm tra SDK tại:

```text
File > Settings > Languages & Frameworks > Android SDK
```

## 4. Cài đặt lần đầu

Các bước trong mục này chỉ cần làm khi mới clone project, xóa `node_modules`, đổi máy hoặc development build chưa được cài trên emulator.

### 4.1. Mở đúng thư mục

Nếu repository chứa nhiều project, chuyển vào thư mục mobile:

```powershell
cd D:\school\PBL6\HANDY_GO\mobile
```

Mọi lệnh trong README được chạy tại thư mục có file `package.json` này.

### 4.2. Cài dependency

```powershell
pnpm install
```

Không dùng `npm install` hoặc `yarn install`, vì có thể tạo lockfile khác và làm dependency của cả đội không đồng nhất.

### 4.3. Tạo file môi trường

```powershell
Copy-Item .env.example .env
```

Kiểm tra tối thiểu các biến sau trong `.env`:

```dotenv
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_URL=https://api.handygo.vn/v1
```

Lưu ý:

- Biến có tiền tố `EXPO_PUBLIC_` có thể xuất hiện trong bundle client, không được dùng để chứa secret.
- API key hoặc secret thật không được commit lên Git.
- Khi thay đổi `.env`, hãy khởi động lại Metro; nếu giá trị cũ còn bị cache, chạy Metro với `--clear`.

### 4.4. Tạo emulator

Trong Android Studio:

1. Mở **Tools > Device Manager**.
2. Chọn **Create Virtual Device**.
3. Chọn một thiết bị Pixel.
4. Chọn system image Android phù hợp và tải về nếu cần.
5. Hoàn tất cấu hình, sau đó bấm Play để khởi động emulator.

Kiểm tra emulator đã kết nối:

```powershell
adb devices
```

Kết quả phải có một thiết bị ở trạng thái `device`, ví dụ:

```text
List of devices attached
emulator-5554    device
```

### 4.5. Build và cài development app lần đầu

Bật emulator trước, sau đó chạy tại thư mục `mobile`:

```powershell
pnpm run android
```

Lệnh này compile native Android, cài development build lên emulator và mở ứng dụng. Lần build đầu có thể lâu vì Gradle cần tải dependency và compile native module.

Có thể build bằng Android Studio:

1. Mở thư mục `D:\school\PBL6\HANDY_GO\mobile\android`.
2. Chờ Gradle Sync hoàn tất.
3. Chọn emulator ở thanh thiết bị.
4. Chọn cấu hình `app`.
5. Nhấn **Run** hoặc `Shift + F10`.

Sau khi development app đã được cài, công việc hằng ngày không cần build native lại.

## 5. Quy trình chạy ứng dụng hằng ngày

Thực hiện theo đúng thứ tự sau mỗi lần mở máy.

### Bước 1: Mở Android Studio và bật emulator

Mở Android Studio, vào **Tools > Device Manager**, sau đó bấm Play tại emulator cần dùng. Chờ đến khi Android vào màn hình chính.

Có thể tách emulator thành cửa sổ lớn bằng nút **Open in New Window** ở góc trên bên phải của tab Running Devices.

### Bước 2: Mở terminal tại thư mục mobile

```powershell
cd D:\school\PBL6\HANDY_GO\mobile
```

### Bước 3: Kiểm tra thiết bị

```powershell
adb devices
```

Nếu không có dòng `emulator-xxxx device`, emulator chưa khởi động xong hoặc ADB chưa nhận thiết bị.

### Bước 4: Reverse cổng Metro

```powershell
adb reverse tcp:8081 tcp:8081
```

Lệnh này ánh xạ cổng `8081` trên emulator về cổng `8081` của máy tính. Cần chạy lại sau khi emulator hoặc máy tính được khởi động lại.

### Bước 5: Chạy Metro cho Expo Dev Client

Lệnh đã được kiểm tra trên Windows:

```powershell
.\node_modules\.bin\expo.cmd start --dev-client --host localhost
```

Lệnh tương đương khi PNPM hoạt động bình thường:

```powershell
pnpm exec expo start --dev-client --host localhost
```

Giữ terminal Metro mở trong suốt thời gian code.

### Bước 6: Mở ứng dụng

Khi Metro đã sẵn sàng:

- Nhấn `a` trong terminal Metro để mở app trên Android.
- Hoặc mở biểu tượng HANDY GO trên emulator nếu app đã được cài.

Quy trình rút gọn:

```text
Mở Android Studio
-> Bật emulator
-> adb devices
-> adb reverse tcp:8081 tcp:8081
-> Chạy Metro dev-client
-> Nhấn a
-> Bắt đầu code
```

## 6. Reload khi đang code

### 6.1. Fast Refresh

Khi sửa file TypeScript/TSX và nhấn `Ctrl + S`, ứng dụng thường tự cập nhật. Đây là Fast Refresh và không cần build lại app.

### 6.2. Reload toàn bộ JavaScript

Nếu giao diện chưa cập nhật, đặt focus vào terminal Metro và nhấn `r`.

### 6.3. Mở Developer Menu

Trong terminal Metro, nhấn `m`.

### 6.4. Xóa cache Metro

Dừng Metro bằng `Ctrl + C`, sau đó chạy:

```powershell
.\node_modules\.bin\expo.cmd start --dev-client --host localhost --clear
```

Sau khi Metro khởi động lại, nhấn `a`.

## 7. Khi nào phải build lại Android

Không cần build lại khi chỉ sửa:

- Screen, component hoặc style.
- TypeScript business logic.
- API function hoặc React Query hook.
- Locale text.
- Unit test.

Cần build lại development app khi:

- Thêm, xóa hoặc nâng cấp package có native code.
- Thay đổi plugin trong `app.config.ts`.
- Thay đổi Android permission, native module hoặc file trong `android/`.
- Development app chưa được cài trên emulator.
- Native runtime hiện tại không còn tương thích với JavaScript bundle.

Sau khi bật emulator:

```powershell
pnpm run android
```

Việc chạy prebuild có thể cập nhật nhiều file trong `android/`. Không tự ý chạy prebuild sạch hoặc commit thay đổi native hàng loạt nếu chưa thống nhất với Foundation owner.

## 8. Kiến trúc thư mục

```text
mobile/
├── android/                     # Native Android project
├── assets/                      # Icon, splash và static assets
├── scripts/                     # Script hỗ trợ kiểm tra
├── src/
│   ├── app/                     # Expo Router, chỉ chứa route adapter/layout
│   ├── components/ui/           # UI dùng chung toàn ứng dụng
│   ├── constants/               # Hằng số và route names
│   ├── core/                    # Core configuration
│   ├── features/                # Business features theo domain và role
│   ├── hooks/                   # Hook dùng chung
│   ├── lib/                     # Provider và utility nền tảng
│   ├── services/                # API, storage, logger dùng chung
│   ├── stores/                  # Global stores
│   ├── translations/            # Translation toàn ứng dụng
│   └── types/                   # Shared types
├── .env.example
├── app.config.ts
├── env.ts
├── package.json
└── pnpm-lock.yaml
```

### 8.1. Cấu trúc feature hiện tại

```text
src/features/
├── auth/
├── dev-demo/
├── home/
│   ├── customer/
│   └── worker/
├── orders/
│   ├── customer/
│   └── worker/
└── profile/
    ├── customer/
    └── worker/
```

Mỗi role submodule có thể tự sở hữu:

```text
<role-submodule>/
├── api/                         # API functions, tạo khi cần
├── components/                  # Component chỉ dùng trong module
├── hooks/                       # Query/mutation/business hooks
├── locales/                     # vi.ts, en.ts, index.ts
├── screens/                     # Các screen của module
├── types/                       # Type riêng của module
├── __tests__/                   # Test của module
└── index.ts                     # Public API của module
```

Không bắt buộc tạo trước tất cả thư mục. Chỉ tạo khi tính năng thực sự cần.

## 9. Quy tắc sở hữu source code

| Owner                  | Phạm vi chính                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Base/Integration       | `src/app/**`, `src/features/dev-demo/**`, root config, CI và docs                                                       |
| Auth owner             | `src/features/auth/**`                                                                                                  |
| Customer Home owner    | `src/features/home/customer/**`                                                                                         |
| Worker Home owner      | `src/features/home/worker/**`                                                                                           |
| Customer Orders owner  | `src/features/orders/customer/**`                                                                                       |
| Worker Jobs owner      | `src/features/orders/worker/**`                                                                                         |
| Customer Profile owner | `src/features/profile/customer/**`                                                                                      |
| Worker Profile owner   | `src/features/profile/worker/**`                                                                                        |
| Domain owner           | `src/features/<domain>/shared/**`, khi có contract chung thật sự                                                        |
| Foundation owner       | `src/components/ui/**`, `src/lib/**`, `src/services/**`, `src/stores/**`, `src/types/**`, dependency và config nền tảng |

### Quy tắc bắt buộc

1. Feature developer chỉ sửa thư mục role submodule được giao.
2. Customer module không import file nội bộ của Worker module và ngược lại.
3. Import module khác thông qua public `index.ts`, không xuyên vào file nội bộ.
4. Không tự tạo code dùng chung trong `shared/` chỉ vì có thể cần trong tương lai.
5. Không tự sửa `src/app`, shared UI, shared service, dependency hoặc root config khi chưa trao đổi với owner.
6. Nếu cần thay đổi xuyên module, tạo yêu cầu rõ ràng cho owner tương ứng thay vì cùng sửa một file chung.

Ví dụ import đúng:

```typescript
import { CustomerOrdersScreen } from '@/features/orders/customer';
```

Hạn chế import xuyên vào file nội bộ:

```typescript
// Không dùng từ module khác
import { CustomerOrdersScreen } from '@/features/orders/customer/screens/customer-orders-screen';
```

## 10. Navigation và route adapter

`src/app` là lớp adapter mỏng của Expo Router. File route chỉ được:

- Re-export screen từ public API của feature.
- Đọc route params và truyền xuống screen qua props.
- Cấu hình layout, stack hoặc tabs.

Không đặt UI nghiệp vụ, API call, form schema hoặc business store trong `src/app`.

Ví dụ route adapter đơn giản:

```typescript
export { CustomerOrdersScreen as default } from '@/features/orders/customer';
```

Ví dụ route có params:

```tsx
import { useLocalSearchParams } from 'expo-router';

import { CustomerOrderDetailScreen } from '@/features/orders/customer';

export default function CustomerOrderDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CustomerOrderDetailScreen orderId={id} />;
}
```

### Route hiện tại

| Route                   | Feature                     |
| ----------------------- | --------------------------- |
| `/`                     | `features/dev-demo`         |
| `/login`                | `features/auth`             |
| `/customer`             | `features/home/customer`    |
| `/customer/orders`      | `features/orders/customer`  |
| `/customer/orders/[id]` | `features/orders/customer`  |
| `/customer/profile`     | `features/profile/customer` |
| `/worker`               | `features/home/worker`      |
| `/worker/jobs`          | `features/orders/worker`    |
| `/worker/profile`       | `features/profile/worker`   |

Khi cần route mới, feature owner triển khai screen và public export trước, sau đó yêu cầu Base/Integration owner thêm route adapter.

## 11. Tích hợp API Gateway

Base URL được lấy từ:

```dotenv
EXPO_PUBLIC_API_URL=https://api.handygo.vn/v1
```

Shared client nằm tại `src/services/api/api-client.ts`.

API của feature chỉ dùng relative path:

```typescript
import type { CustomerOrderDto } from '../types';

import { ApiClient } from '@/services/api';

export const customerOrdersApi = {
  getOrders: () => ApiClient.get<CustomerOrderDto[]>('/orders'),
  getOrderById: (id: string) =>
    ApiClient.get<CustomerOrderDto>(`/orders/${id}`),
};
```

### Quy tắc API bắt buộc

- Chỉ sử dụng shared `ApiClient`.
- Chỉ truyền relative path như `/orders` hoặc `/auth/login`.
- Không hardcode domain backend trong feature.
- Không tạo Axios instance riêng cho từng module hoặc từng backend service.
- DTO, mapper và API function riêng của role được đặt trong role submodule.
- Contract thực sự dùng chung giữa Customer và Worker mới được chuyển vào domain `shared/` sau khi thống nhất với Domain owner.
- Token được shared API interceptor gắn tự động; feature không tự đọc và gắn token cho từng request.

## 12. Localization

Locale riêng của feature đặt trong module sở hữu:

```text
src/features/orders/customer/locales/
├── en.ts
├── vi.ts
└── index.ts
```

Namespace hiện có:

- `auth`
- `devDemo`
- `homeCustomer`
- `homeWorker`
- `ordersCustomer`
- `ordersWorker`
- `profileCustomer`
- `profileWorker`

Ví dụ sử dụng trong screen:

```tsx
import { useTranslation } from 'react-i18next';

export function CustomerOrdersScreen() {
  const { t } = useTranslation('ordersCustomer');
  return <Text>{t('title')}</Text>;
}
```

Feature owner chỉ sửa locale thuộc module của mình. Khi tạo namespace mới hoặc thay đổi registry tại `src/lib/i18n/resources.ts`, cần phối hợp với Foundation owner vì đây là file dùng chung.

## 13. Quy trình phát triển một tính năng

Ví dụ được giao màn hình chi tiết đơn hàng cho Customer.

### Bước 1: Xác định đúng module

```text
src/features/orders/customer/
```

### Bước 2: Tạo screen và component nội bộ

```text
src/features/orders/customer/screens/customer-order-detail-screen.tsx
src/features/orders/customer/components/order-summary.tsx
```

Ưu tiên dùng component nền tảng từ `@/components/ui` trước khi tạo component mới.

### Bước 3: Thêm type, API và hook khi cần

```text
src/features/orders/customer/types/
src/features/orders/customer/api/
src/features/orders/customer/hooks/
```

Screen không nên chứa toàn bộ logic fetch, mutation, mapping và validation trong cùng một file.

### Bước 4: Export qua public API

Thêm export vào `src/features/orders/customer/index.ts`.

### Bước 5: Thêm locale

Cập nhật `vi.ts` và `en.ts` trong module, sau đó dùng namespace của module trong UI.

### Bước 6: Thêm test

Test được đặt trong `__tests__` của cùng module. Kiểm tra ít nhất:

- Nội dung quan trọng được render.
- Trạng thái loading, empty và error nếu có gọi API.
- Tương tác chính của người dùng.
- Navigation hoặc params nếu screen có điều hướng.

### Bước 7: Yêu cầu route adapter nếu cần

Nếu cần URL mới, gửi cho Base/Integration owner:

- Route mong muốn.
- Screen export cần dùng.
- Params và type của params.
- Screen thuộc stack/tab nào.

## 14. Kiểm tra chất lượng và test

Chạy tại thư mục `mobile`:

```powershell
# ESLint
pnpm run lint

# TypeScript strict check
pnpm run type-check

# Translation JSON check
pnpm run lint:translations

# Toàn bộ unit test
pnpm run test -- --runInBand

# Toàn bộ kiểm tra trước Pull Request
pnpm run check-all
```

Chạy một file test:

```powershell
.\node_modules\.bin\jest.cmd --runTestsByPath src/features/orders/customer/__tests__/customer-orders.test.tsx --runInBand
```

Nếu PNPM/Corepack đang lỗi nhưng `node_modules` đã tồn tại, có thể kiểm tra tạm bằng local binary:

```powershell
.\node_modules\.bin\eslint.cmd .
.\node_modules\.bin\tsc.cmd --noEmit
.\node_modules\.bin\jest.cmd --runInBand
```

Không dùng local binary như giải pháp lâu dài cho lỗi package manager; hãy sửa PNPM để dependency và lockfile của cả đội tiếp tục đồng nhất.

## 15. Quy trình Git và Pull Request

### Trước khi code

1. Cập nhật nhánh làm việc từ nhánh chung theo quy trình của đội.
2. Xác nhận module và thư mục mình sở hữu.
3. Kiểm tra `git status` để biết các thay đổi đang có trên máy.
4. Không xóa hoặc ghi đè thay đổi chưa commit của thành viên khác.

### Trong khi code

- Commit theo từng thay đổi có ý nghĩa.
- Không đưa `.env`, secret, file build, log hoặc cache vào commit.
- Không format hoặc refactor hàng loạt file ngoài phạm vi task.
- Không cập nhật `pnpm-lock.yaml` nếu task không thay đổi dependency.
- Nếu buộc phải sửa file shared, trao đổi với owner trước để tránh hai người cùng sửa.

### Trước khi tạo Pull Request

```powershell
pnpm run check-all
git status
git diff --stat
```

Pull Request cần ghi rõ:

- Mục tiêu thay đổi.
- Module và role bị ảnh hưởng.
- Route hoặc API endpoint liên quan.
- Cách kiểm thử thủ công.
- Kết quả lint, type-check và test.
- Ảnh hoặc video với thay đổi giao diện nếu cần.
- Có thay đổi shared code, native code, config hoặc dependency hay không.

## 16. Xử lý lỗi thường gặp

### 16.1. `Failed to connect to /10.0.2.2:8081`

Nguyên nhân thường gặp: Metro chưa chạy, cổng reverse bị mất hoặc app đang trỏ tới server cũ.

```powershell
adb devices
adb reverse tcp:8081 tcp:8081
.\node_modules\.bin\expo.cmd start --dev-client --host localhost
```

Sau đó nhấn `a`. Nếu Metro đã chạy, nhấn `r` để reload.

### 16.2. `No development build installed`

Development app chưa được cài trên emulator. Bật emulator và chạy:

```powershell
pnpm run android
```

### 16.3. `adb devices` không thấy emulator

1. Chờ emulator vào hẳn màn hình chính.
2. Chạy lại `adb devices`.
3. Nếu vẫn không thấy, restart ADB:

```powershell
adb kill-server
adb start-server
adb devices
```

### 16.4. Cổng `8081` đang bị chiếm

Kiểm tra process:

```powershell
Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue |
  Select-Object LocalAddress, LocalPort, State, OwningProcess
```

Dừng đúng process sau khi kiểm tra PID:

```powershell
Stop-Process -Id <PID> -Force
```

Sau đó chạy lại Metro.

### 16.5. App không cập nhật sau khi lưu code

Thử theo thứ tự:

1. Nhấn `r` trong terminal Metro.
2. Đóng app và nhấn `a`.
3. Dừng Metro bằng `Ctrl + C`.
4. Khởi động lại với `--clear`.

```powershell
.\node_modules\.bin\expo.cmd start --dev-client --host localhost --clear
```

### 16.6. Metro báo lỗi module không tồn tại

Nếu vừa pull code có dependency mới:

```powershell
pnpm install
```

Nếu dependency có native code, chạy thêm:

```powershell
pnpm run android
```

### 16.7. PNPM/Corepack báo lỗi chữ ký hoặc không chạy

Kiểm tra version:

```powershell
node --version
corepack --version
pnpm --version
```

Kích hoạt lại đúng PNPM version:

```powershell
corepack enable
corepack prepare pnpm@10.12.3 --activate
```

Nếu Corepack vẫn lỗi, dùng phương án cài global được nêu ở mục 3.2 rồi mở terminal mới.

### 16.8. Gradle build lỗi sau khi đổi dependency

Trước tiên kiểm tra emulator, Java và dependency:

```powershell
adb devices
java -version
pnpm install
pnpm run android
```

Không xóa thư mục native, Gradle cache hoặc chạy prebuild `--clean` ngay lập tức. Nếu lỗi liên quan native config, gửi log đầy đủ cho Foundation owner để tránh tạo thay đổi Android ngoài ý muốn.

## 17. Danh sách lệnh nhanh

```powershell
# Cài dependency
pnpm install

# Chạy hằng ngày trên Android emulator
adb reverse tcp:8081 tcp:8081
.\node_modules\.bin\expo.cmd start --dev-client --host localhost

# Build/cài lại development app
pnpm run android

# Metro với cache sạch
.\node_modules\.bin\expo.cmd start --dev-client --host localhost --clear

# Web
pnpm run web

# ESLint và auto-fix
pnpm run lint
pnpm run lint:fix

# TypeScript
pnpm run type-check

# Unit test
pnpm run test
pnpm run test:watch

# Kiểm tra trước Pull Request
pnpm run check-all
```

## Tài liệu liên quan

- `SOURCE_BASE_CHECKLIST.md`: checklist yêu cầu source base.
- `SOURCE_BASE_IMPLEMENTATION_PLAN.md`: kế hoạch triển khai kiến trúc.
- `ANTIGRAVITY_SOURCE_BASE_PROMPT.md`: prompt thực thi source base.

Khi README và source code khác nhau, không tự đoán. Kiểm tra `package.json`, config thực tế và trao đổi với owner của module trước khi thay đổi phần dùng chung.
