# Module thông báo HandyGo

## Kiến trúc và chức năng

- `src/services/notifications/notification-api.ts`: DTO theo Swagger và các yêu cầu qua Axios client hiện có, sử dụng lại interceptor xác thực, huỷ yêu cầu và xử lý lỗi.
- `src/features/notifications/hooks/use-notifications.ts`: TanStack Query quản lý danh sách phân trang, số chưa đọc và thao tác đánh dấu đã đọc. Khoá truy vấn tách theo người dùng; không sao chép danh sách vào Zustand.
- `src/stores/use-push-registration-store.ts`: Zustand persist với AsyncStorage lưu UUID bản cài đặt, lịch sử hỏi quyền và thông tin đăng ký thành công gần nhất. Không lưu thông tin xác thực trong store này.
- `src/services/notifications/push-registration.ts`: tạo kênh Android, kiểm tra quyền, lấy token FCM gốc, chống đăng ký trùng, thử lại, cập nhật token và huỷ kích hoạt khi đăng xuất.
- `src/features/notifications/notification-lifecycle.tsx`: quản lý listener tại cấp ứng dụng, làm mới dữ liệu khi nhận thông báo hoặc quay lại ứng dụng, xử lý token thay đổi, xác minh quyền sở hữu trước khi điều hướng, chống xử lý lặp và dọn listener.
- Hai màn hình thông báo Khách/Thợ dùng chung danh sách ảo hoá, có trạng thái đang tải, trống, lỗi, phân trang, kéo để làm mới, đánh dấu một hoặc tất cả thông báo đã đọc. Tab thông báo của Khách và chuông trên trang chủ Thợ hiển thị số chưa đọc. Có nút mở cài đặt thiết bị.
- Giữ kiến trúc xác thực hiện có. Hook đăng xuất thử huỷ kích hoạt thiết bị trước khi xoá token đăng nhập. Các truy vấn thông báo được huỷ và xoá khỏi bộ nhớ đệm khi đăng xuất hoặc đổi tài khoản.

## Hợp đồng API đã xác minh

Nguồn: Swagger UI tại `http://localhost:3000/docs?urls.primaryName=Notification+Service`. Tệp `swagger-ui-init.js` trỏ đến `/docs/specs/notification-service`. Bản chụp ngày 22/10/2026 được lưu tại [contracts/notification-service.openapi.json](contracts/notification-service.openapi.json).

Các yêu cầu dùng Bearer token thông qua Axios client hiện có, với đường dẫn gốc `/api/v1`. Phản hồi thành công có dạng `{ statusCode, message, data }`.

| Phương thức và đường dẫn dưới `/api/v1` | Mục đích |
| --- | --- |
| `POST /notifications/devices` | Đăng ký, kích hoạt lại hoặc cập nhật token với `{ platform: 'android', deviceId, pushToken }`; chỉ lưu `id` thiết bị sau khi thành công |
| `DELETE /notifications/devices/{id}` | Huỷ kích hoạt thiết bị thuộc người dùng; gọi lại vẫn thành công |
| `GET /notifications?limit=20&cursor=…` | Lấy danh sách mới nhất trước, trả về `{ items, nextCursor }`; bỏ `cursor` ở trang đầu |
| `GET /notifications/unread-count` | Lấy `{ count }` thông báo chưa đọc |
| `GET /notifications/{id}` | Xác minh quyền sở hữu khi chạm push; không tự đánh dấu đã đọc |
| `PATCH /notifications/{id}/read` | Đánh dấu một thông báo đã đọc, không có nội dung yêu cầu |
| `POST /notifications/read-all` | Đánh dấu tất cả đã đọc, trả về `{ updatedCount }`, không có nội dung yêu cầu |

`readAt === null` nghĩa là chưa đọc. Tiêu đề và nội dung dùng `title`, `body`; thời gian và danh mục lấy từ DTO. Backend còn có API GET/PATCH tuỳ chọn thông báo và API phát thông báo dành cho quản trị viên; các chức năng này nằm ngoài phạm vi màn hình hiện tại.

Backend **không có API tra cứu danh sách/trạng thái thiết bị, chuyển quyền sở hữu token, xoá thông báo hoặc đánh dấu chưa đọc**.

Payload push đã được đối chiếu với `PushPayloadBuilder`: `notificationId`, các trường tuỳ chọn `eventType`, `category`, `entityId`, `requestId`, `recipientRole` và dữ liệu mở rộng. Khi chạm push, ứng dụng kiểm tra ID dạng UUID và gọi API xác minh quyền sở hữu trước khi điều hướng. Các trang chi tiết đơn/công việc vẫn dùng dữ liệu minh hoạ, nên push mở danh sách thông báo đúng vai trò; không điều hướng tới URL tuỳ ý trong payload.

## Vòng đời đăng ký token

1. Chờ xác thực thành công và khôi phục phiên hoàn tất. Khách chưa đăng nhập không bị hỏi quyền. Luồng cấp ứng dụng áp dụng cho đăng nhập, xác thực OTP và khôi phục phiên.
2. Bản dựng Android tạo kênh `default` trước khi xử lý quyền/token. Expo Go, web và iOS bỏ qua đăng ký FCM gốc.
3. Chỉ hỏi quyền khi trạng thái chưa xác định, `canAskAgain` cho phép và bản cài đặt chưa từng hỏi. Quyền đã cấp không hiện lại hộp thoại; từ chối không chặn sử dụng ứng dụng. Quay lại từ cài đặt thiết bị sẽ kiểm tra quyền lại. Nếu quyền bị thu hồi, ứng dụng thử huỷ kích hoạt đăng ký hiện có khi kết nối được backend.
4. Lấy token bằng `getDevicePushTokenAsync()`, không dùng Expo Push Service. So sánh người dùng, UUID bản cài đặt, nền tảng Android và token với thông tin đăng ký thành công đã lưu.
5. Tuần tự hoá đăng ký để tránh yêu cầu đồng thời. Chỉ lưu trạng thái khi API xác nhận đăng ký FCM đang hoạt động. Khởi động lại với cùng trạng thái sẽ bỏ qua yêu cầu đăng ký. Token thay đổi sẽ được cập nhật. Sau lỗi, chờ tối thiểu 60 giây rồi thử lại vào lần quay lại ứng dụng, thay đổi trạng thái xác thực hoặc làm mới danh sách tiếp theo; không thăm dò định kỳ.
6. Do không có API kiểm tra trạng thái thiết bị, ứng dụng đăng ký xác nhận lại sau **bảy ngày** bằng POST hiện có. Đây là chính sách phía ứng dụng, không phải thời hạn do backend quy định. Nếu backend xoá dữ liệu hoặc huỷ kích hoạt token, trạng thái cục bộ có thể chưa phản ánh đúng cho đến lần xác nhận lại.
7. Đổi phiên xác thực làm vô hiệu công việc cũ và huỷ yêu cầu đang chạy. Khi đăng xuất, ứng dụng tạm dừng đăng ký, chờ tối đa 5,5 giây để nhận ID từ yêu cầu đang chạy, sau đó thử huỷ kích hoạt với thời gian chờ 5 giây khi thông tin xác thực còn hiệu lực. Thông tin đăng ký theo người dùng và bộ nhớ đệm được xoá; UUID bản cài đặt và lịch sử hỏi quyền được giữ lại.

## Giới hạn và trường hợp lỗi

- **Backend hiện chặn tài khoản khác đăng ký cùng token FCM.** API trả `409` ngay cả sau khi DELETE đã đặt `isActive=false`. Ứng dụng không ghi nhận thành công giả hoặc dùng lại quyền sở hữu cũ. Đăng nhập và thông báo trong ứng dụng vẫn hoạt động. Backend cần cơ chế chuyển quyền sở hữu token nguyên tử có xác thực, hoặc hợp đồng giải phóng token, để push hoạt động liền mạch khi đổi tài khoản. Không sửa mã backend trong module này.
- Huỷ kích hoạt có thể thất bại khi mất mạng, phiên xác thực hết hiệu lực hoặc phản hồi bị mất sau khi máy chủ đã xử lý. Khi đó thiết bị có thể vẫn hoạt động trên backend. Đảm bảo thu hồi tuyệt đối cần được thực hiện phía backend.
- Token gốc trên iOS do Expo trả về là APNs. Dự án chưa có cầu nối Firebase Messaging để lấy token FCM trên iOS, nên không gửi token APNs đến API chỉ hỗ trợ FCM. Thông báo trong ứng dụng vẫn dùng được trên iOS; push iOS chưa được hỗ trợ.

## Cấu hình Firebase và bản dựng Expo

Đã thêm `expo-notifications ~0.32.17` tương thích SDK 54 và AsyncStorage `2.2.0`. Dùng `expo-crypto` sẵn có để tạo UUID bản cài đặt. Plugin thông báo thiết lập `defaultChannel: 'default'`; giữ các cấu hình EAS hiện có.

Tệp `google-services.json` cục bộ hiện chỉ có cấu hình cho **`com.handygo`** và không được chỉnh sửa. Các package Android:

| Môi trường | Package Android |
| --- | --- |
| development | `com.handygo` |
| preview | `com.handygo.preview` |
| production | `com.handygo` |

Development và production dùng chung Firebase Android app `com.handygo`, nên có thể dùng cùng giá trị Base64. Preview vẫn dùng `com.handygo.preview` và cần cấu hình Firebase tương ứng. Hai bản dev/prod không thể cài song song trên cùng hồ sơ Android; nếu chữ ký APK khác nhau, cần gỡ bản đang cài trước khi chuyển bản. API URL vẫn được chọn qua env riêng.

Các bước cần thực hiện:

1. Đăng ký từng package cần dùng trong cùng dự án Firebase với backend; tải tệp cấu hình **ứng dụng Android** `google-services.json` tương ứng.
2. Để chỉ chia sẻ env cho đồng đội, đặt `GOOGLE_SERVICES_JSON_BASE64` trong `.env` theo hướng dẫn bên dưới. `app.config.ts` tự giải mã và tạo tệp trước prebuild/build. Thứ tự ưu tiên: Base64 → đường dẫn `GOOGLE_SERVICES_JSON` → tệp `google-services.json` cục bộ. Nếu thiếu cả ba, ứng dụng chưa được cấu hình FCM.
3. Plugin `expo-localization` đã được bổ sung dependency `~17.0.9` tương thích SDK 54. Chạy `pnpm install` sau khi cập nhật mã nguồn để cài đầy đủ các package trước khi build.
4. Kiểm tra các chỉnh sửa native thủ công trước khi chạy script prebuild tương ứng, rồi dựng và cài lại bằng quy trình Android/EAS hiện có. Tải lại Metro hoặc OTA không thể bổ sung module native, AsyncStorage hoặc tài nguyên Firebase. Các tệp Gradle Android đã sinh hiện chưa tích hợp Google Services.
5. Kiểm tra trên thiết bị/bản dựng Android đã cấu hình, có kết nối backend và được cấp quyền. Backend cần dùng đúng dự án Firebase và gửi payload thông báo để hệ điều hành hiển thị khi ứng dụng ở nền. Module không triển khai tác vụ nền cho push chỉ chứa dữ liệu.

Không đưa tệp tài khoản dịch vụ Firebase Admin hoặc khoá riêng vào ứng dụng. Thông tin xác thực Admin thuộc backend. Với thiết kế backend gửi FCM trực tiếp, không cần tải thông tin xác thực máy chủ Firebase lên EAS.

Tham khảo: [Gửi trực tiếp qua FCM/APNs với Expo](https://docs.expo.dev/push-notifications/sending-notifications-custom/), [Xử lý sự cố thông báo Expo](https://docs.expo.dev/push-notifications/faq/).

## Chia sẻ cấu hình Firebase qua env

Mã hoá file Firebase đúng package thành một dòng Base64. Trên macOS có thể chép kết quả thẳng vào clipboard:

```sh
base64 -i google-services.json | tr -d '\n' | pbcopy
```

Dán vào `.env` (không dùng tiền tố `EXPO_PUBLIC_`):

```dotenv
EXPO_PUBLIC_APP_ENV=development
GOOGLE_SERVICES_JSON_BASE64=<chuỗi Base64 của file dành cho com.handygo>
```

Đồng đội chỉ cần nhận `.env`, cài dependencies và chạy:

```sh
pnpm install
pnpm android
```

Lệnh `pnpm android` hiện tự chạy prebuild Android trước bước build. Các lệnh `android:preview` và `android:production` cũng dùng luồng này. Prebuild cập nhật dự án native theo cấu hình Expo; cần giữ các tuỳ chỉnh native trong config plugin để có thể tái tạo chúng.

Mỗi lần Expo đọc `app.config.ts`, helper `scripts/firebase-config.ts` giải mã Base64, xác minh cấu trúc Firebase Android và package, rồi ghi vào `.firebase/google-services.<package>.json`. Dữ liệu lỗi làm dừng xử lý cấu hình với thông báo rõ, không in nội dung Base64/JSON. File gốc không bị ghi đè. Thư mục `.firebase/` và các file `.env.*` được Git bỏ qua, ngoại trừ `.env.example`. Khi bỏ biến Base64, cấu hình không dùng lại file tự sinh cũ.

Với EAS Build từ xa, `.env` bị Git bỏ qua nên cần khai báo biến `GOOGLE_SERVICES_JSON_BASE64` trên EAS cho đúng môi trường `development`, `preview` hoặc `production`. Có thể dùng mức hiển thị Sensitive để EAS CLI đọc được khi xử lý cấu hình trên máy local; sau khi cài dependencies, máy build cũng xử lý `app.config.ts` để tạo lại file. Không cần tải file JSON riêng hoặc thêm hook sau prebuild. [Thứ tự dựng Android của EAS](https://docs.expo.dev/build-reference/android-builds/).

Base64 không phải mã hoá bảo mật; chỉ chia sẻ env qua kênh phù hợp. Cấu hình Firebase client vẫn được đóng gói trong ứng dụng. Không dùng file tài khoản dịch vụ Admin làm đầu vào.

Dependency `expo-localization` đã được bổ sung để sửa lỗi phân giải plugin. File Firebase vẫn phải khớp package của môi trường được chọn trước khi build thật.

## Kiểm thử

Phần cấu hình Base64 có 8 kiểm thử đạt: tạo/cập nhật file, dữ liệu lỗi, sai package và giữ tương thích cấu hình dạng file. Đã chạy trực tiếp `app.config.ts` với cấu hình production cục bộ để xác nhận file giải mã giống bản gốc và Base64 không nằm trong `extra`. ESLint các file thay đổi và TypeScript đều đạt. Chưa chạy bản dựng native/EAS thật.

Sau triển khai, ESLint toàn dự án không có lỗi/cảnh báo, TypeScript đạt và toàn bộ 277 kiểm thử thuộc 37 bộ kiểm thử đã đạt. Lần kiểm tra tập trung vào thông báo/xác thực sau đó có 35 kiểm thử đạt.

Các kiểm thử thông báo bao gồm: kiểm tra quyền, lưu trạng thái, chống đăng ký trùng, thử lại, đổi token, xác nhận lại đăng ký, đổi tài khoản, huỷ kích hoạt, phân trang, đồng bộ trạng thái đọc và số chưa đọc, trạng thái trống/lỗi, tách bộ nhớ đệm theo tài khoản, kiểm tra payload, xác minh quyền sở hữu khi chạm thông báo, chống xử lý lặp và dọn listener.

Lệnh chạy lại không cần công cụ mô phỏng API bên ngoài:

```sh
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint .
./node_modules/.bin/jest --runInBand --forceExit
```

Chỉ chạy kiểm thử thông báo:

```sh
./node_modules/.bin/jest src/features/notifications --runInBand --forceExit
```

Các kiểm thử này sử dụng mock cho push và API; không chứng minh việc gửi FCM thật. Việc nhận push trên thiết bị, hộp thoại quyền của hệ điều hành, hành vi chạy nền/chạm thông báo và bản dựng EAS/native **chưa được xác minh**. Không thực hiện thao tác thay đổi dữ liệu có xác thực trên backend thật.
