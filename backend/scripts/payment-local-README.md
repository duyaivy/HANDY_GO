# Test nạp tiền VNPAY vào ví bằng Swagger trên local

Thực hiện lần lượt 8 bước dưới đây. Các lệnh dùng PowerShell, chạy tại thư mục backend:

```powershell
cd "...\HANDY_GO\backend"
```

Cần Node.js, dependencies đã cài, Docker Desktop đang chạy, `.env`, `.env.payment-local`, tài khoản HANDY GO và cấu hình merchant VNPAY sandbox. Không chia sẻ mật khẩu, access token, internal secret hoặc URL database chứa credentials.

## 1. Kiểm tra đã có database Payment và Wallet chưa

Kiểm tra Docker và database local:

```powershell
docker compose -f docker-compose.payment-local.yml ps -a
```

Nếu chưa có container hoặc đang dừng, bật dependencies trước để kiểm tra:

```powershell
docker compose -f docker-compose.payment-local.yml up -d --wait
```

Compose tạo database `handygo_payment_local` khi khởi tạo volume mới. Có container/database chưa có nghĩa đã có đủ bảng. Kiểm tra các bảng:

```powershell
docker compose -f docker-compose.payment-local.yml exec -T postgres psql -U handygo_local -d handygo_payment_local -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema IN ('payment_service', 'wallet_service') ORDER BY table_schema, table_name;"
```

Kết quả cần có bảng của schema `payment_service`, `wallet_service`, trong đó Wallet có `wallets`, `wallet_transactions`. Nếu trống hoặc môi trường chưa được migrate, áp dụng migration Payment và Wallet vào đúng database local:

```powershell
$localDb = 'postgresql://handygo_local:handygo_local_dev@127.0.0.1:55434/handygo_payment_local'
foreach ($service in @('payment', 'wallet')) {
    $databaseKey = 'DATABASE_URL_' + $service.ToUpperInvariant()
    $directKey = 'DIRECT_URL_' + $service.ToUpperInvariant()
    $savedDatabase = [Environment]::GetEnvironmentVariable($databaseKey, 'Process')
    $savedDirect = [Environment]::GetEnvironmentVariable($directKey, 'Process')
    try {
        [Environment]::SetEnvironmentVariable($databaseKey, $localDb, 'Process')
        [Environment]::SetEnvironmentVariable($directKey, $localDb, 'Process')
        npx.cmd prisma migrate deploy --config "apps/$service-service/prisma/prisma.config.ts"
        if ($LASTEXITCODE -ne 0) { throw "Migration failed: $service" }
    } finally {
        [Environment]::SetEnvironmentVariable($databaseKey, $savedDatabase, 'Process')
        [Environment]::SetEnvironmentVariable($directKey, $savedDirect, 'Process')
    }
}
```

Lệnh trên dùng credentials local trong compose hiện tại; nếu bạn đổi compose thì cập nhật tương ứng. Không dùng migrate reset hoặc xóa volume để sửa lỗi khi cần giữ dữ liệu.

Auth và User & Trust dùng database gốc trong `.env`, cũng cần được migrate sẵn. Script start giữ `DATABASE_URL_AUTH` / `DATABASE_URL_USER_TRUST` từ `.env`, fallback `DATABASE_URL`, để không trỏ nhầm vào database Payment. Đã từng gặp `auth_service.permissions does not exist` do Auth dùng nhầm database local chỉ có bảng Payment/Wallet.

Ví và lịch sử được lưu trong PostgreSQL Docker, không nằm ở Swagger. Có thể xem bằng DBeaver/pgAdmin: host `127.0.0.1`, port `55434`, database `handygo_payment_local`, credentials xem compose. Dữ liệu nằm trong volume `payment-local-postgres` (tên thực tế có thể có tiền tố project). Dừng/reboot không xóa dữ liệu; tránh `down -v` và xóa volume. Database mới không tự nhập giao dịch từ môi trường cũ.

## 2. Chạy local start để bật các service

Nếu chưa build hoặc vừa sửa mã nguồn, build trước:

```powershell
foreach ($service in @('user-trust-service', 'auth-service', 'api-gateway', 'payment-service', 'wallet-service')) {
    npx.cmd nest build $service
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $service" }
}
```

Khởi động:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/payment-local-start.ps1
```

Script mở 6 terminal có tên riêng:

| Terminal            | Cổng                            | Vai trò                                |
| ------------------- | ------------------------------- | -------------------------------------- |
| Database + RabbitMQ | PostgreSQL 55434; RabbitMQ 5674 | Chờ dependencies healthy, hiển thị log |
| User & Trust        | 3002                            | Xác minh hồ sơ khi đăng nhập           |
| Auth                | 3001                            | Đăng nhập/cấp token                    |
| API Gateway         | 3000                            | Swagger và cổng API chung              |
| Payment             | 3007                            | Tạo top-up/xử lý IPN                   |
| Wallet              | 3009                            | Số dư và lịch sử ví                    |

Chờ service báo khởi động thành công. Dòng `Microservices started for user-trust-service` là thông báo thành công, không phải bị đơ. RabbitMQ management: `http://localhost:15674`.

Script chạy build trong `dist`, không watch và không tự migrate/build. Sửa source phải build rồi restart. Nếu PowerShell chặn npm.ps1/npx.ps1, dùng `npm.cmd`/`npx.cmd`.

Nếu thấy `skipped: port ... already in use (PID ...)`, service cũ đang chiếm cổng nên không mở terminal mới. Không chạy thêm bản Payment/Wallet riêng vì có thể gặp `EADDRINUSE`; hãy dừng đúng tiến trình cũ rồi chạy lại. Script không tự chuyển tiến trình cũ sang cửa sổ mới.

## 3. Cài và chạy ngrok để nhận callback từ internet

Cài một lần theo [hướng dẫn ngrok cho Windows](https://ngrok.com/download/windows):

```powershell
winget install ngrok -s msstore
```

Nếu không dùng được winget, tải ngrok từ trang chính thức, giải nén và thêm thư mục chứa ngrok.exe vào PATH. Mở terminal mới, kiểm tra:

```powershell
ngrok version
```

Tạo/đăng nhập tài khoản ngrok, lấy authtoken trong dashboard rồi cấu hình một lần theo [tài liệu ngrok](https://ngrok.com/docs/start):

```powershell
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
```

Không nhầm ngrok authtoken với access token của HANDY GO. Không đưa token thật vào README hoặc ảnh chia sẻ.

Mở terminal riêng và giữ chạy trong suốt thời gian thanh toán:

```powershell
ngrok http 3000
```

Script local start hiện chưa tự mở ngrok. Lấy URL HTTPS ở dòng Forwarding và cấu hình IPN merchant VNPAY:

```text
https://DOMAIN-NGROK-HIEN-TAI/api/v1/payments/topups/vnpay/ipn
```

Domain phải là domain của tunnel hiện tại, target Gateway 3000. Nếu domain thay đổi thì cập nhật lại phía merchant. Chỉ đổi `VNPAY_RETURN_URL` trong .env không đổi IPN merchant; backend hiện không thêm `vnp_IpnUrl` vào checkout.

Phân biệt hai URL:

| URL                                    | Cách gọi            | Công dụng                                                  |
| -------------------------------------- | ------------------- | ---------------------------------------------------------- |
| `/api/v1/payments/topups/vnpay/return` | Trình duyệt quay về | Không cộng ví; chỉ hướng dẫn truy vấn trạng thái           |
| `/api/v1/payments/topups/vnpay/ipn`    | VNPAY gọi server    | Xác minh chữ ký, số tiền, giao dịch để ghi nhận thanh toán |

VNPAY không thể gọi IPN vào localhost của máy bạn. Return URL localhost vẫn có thể dùng trên trình duyệt máy test.

Kiểm tra đường đi, không truyền query thanh toán:

```powershell
Invoke-RestMethod 'http://localhost:3007/api/v1/payments/topups/vnpay/ipn'
Invoke-RestMethod 'http://localhost:3000/api/v1/payments/topups/vnpay/ipn'
# Thay domain bằng Forwarding thực tế:
Invoke-RestMethod 'https://DOMAIN-NGROK-HIEN-TAI/api/v1/payments/topups/vnpay/ipn'
```

HTTP 200, `RspCode: "97"`, `Message: "Invalid signature"` là bình thường vì probe thiếu chữ ký: endpoint đã tới được, chưa chứng minh giao dịch thật sẽ thành công. Public URL 404/không kết nối nhưng local chạy thì sửa tunnel/domain/path/port trước. Xem request ngrok tại `http://127.0.0.1:4040`.

## 4. Vào Auth Service lấy access token

Mở `http://localhost:3000/docs`, chọn **Auth Service** trong dropdown trên cùng.

1. Mở `POST /api/v1/auth/login` → **Try it out**.
2. Nhập tài khoản đã đăng ký:

   ```json
   {
     "phone": "SO_DIEN_THOAI_CUA_BAN",
     "password": "MAT_KHAU_CUA_BAN"
   }
   ```

3. **Execute**, kéo xuống **Server response → Response body**.
4. Khi đăng nhập thành công, sao chép giá trị `accessToken`, không lấy dấu ngoặc kép.

Chỉ dùng chuỗi JWT thường bắt đầu `eyJ...` trong Authorize. Không dán cả Curl, JSON hoặc chữ Bearer. Với ô Bearer của Swagger, UI tự thêm tiền tố đó.

**Curl chỉ mô tả request. Responses → Example Value → 200 chỉ là dữ liệu mẫu. Kết quả thật nằm tại Server response → Code/Response body.**

Token local đã được chỉnh thành 30 phút trong `backend/.env`:

```env
ACCESS_TOKEN_EXPIRATION_SECONDS=1800
```

Sau khi đổi phải restart Auth và login lại; token cũ vẫn giữ hạn cũ. Refresh token trong code có hạn 7 ngày, nhưng quy trình Swagger này không tự refresh. Hết hạn thì login lấy token mới, Logout token cũ trong Authorize và nhập token mới. Không cần tạo lại ví hoặc thanh toán lại.

Auth Offline/No operations defined nghĩa Gateway không tải được spec Auth; Payment chạy không có nghĩa Auth chạy. Nếu login 503 dịch vụ hồ sơ, kiểm tra cả Auth và User & Trust, cùng RabbitMQ broker/vhost, queue `user-trust-service`, handler `user.auth-status` và database hồ sơ. Log `Failed to confirm user status ...: undefined` trước đây do chỉ đọc err.message; logger đã sửa đọc lỗi dạng string, cần build/restart Auth để nhận sửa đổi. Lỗi trả nhanh chưa đủ kết luận timeout 10 giây.

## 5. Vào Wallet kiểm tra ví, tạo nếu chưa có

Chọn **Wallet Service → Authorize**, dán access token → **Authorize → Close**.

Gọi `GET /api/v1/wallets/me` → **Try it out → Execute**. HTTP 200 có `data.balance`, `reservedBalance`, `availableBalance`; ghi lại số dư trước khi nạp. Số dư là chuỗi Point.

Nếu `404 Wallet not found`, request đã qua xác thực nhưng database Wallet chưa có ví của user. Ví thường được tạo bởi event `user.registered`; tài khoản cũ có thể chưa có ví trong database sandbox mới, login không tự phát lại event đăng ký.

Lấy `userId` từ response tài khoản, ví dụ `GET /api/v1/auth/me` sau Authorize. Không dùng accountId, số điện thoại hay wallet ID.

Để provision ví cho test local, thay `USER_ID_CUA_BAN` rồi chạy tại backend khi Wallet đang bật:

```powershell
@'
const response = await fetch("http://localhost:3009/api/v1/internal/wallets/provision", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-internal-secret": process.env.INTERNAL_SERVICE_SECRET
  },
  body: JSON.stringify({ userId: "USER_ID_CUA_BAN" })
});
console.log(response.status, await response.text());
'@ | node --env-file=.env --env-file=.env.payment-local --input-type=module
```

Đây là API nội bộ có secret, không phải API tạo ví công khai. Lệnh tự đọc secret từ config. HTTP 201 kèm body statusCode 200/message Wallet provisioned là thành công, ví mới active và balance 0. Gọi lại API xem ví để xác nhận.

Nếu `.env: not found`, đang chạy ngoài backend: cd lại đúng thư mục. Nếu SyntaxError tại fetch URL, PowerShell đã làm mất dấu nháy qua node -e: dùng here-string/stdin nguyên khối trên, dòng đóng `'@` ở đầu dòng.

Nếu Wallet không có Authorize hoặc loading kèm `applySecurities`/`Cannot destructure property 'type'`, kiểm tra spec `/docs/specs/wallet-service`. Custom Swagger của Wallet đã bổ sung `.addBearerAuth()` để khớp `@ApiBearerAuth()`; phải build/restart bản mới, Ctrl+Shift+R và Authorize lại. Cảnh báo deep link whitespace không tự chứng minh nguyên nhân gây lỗi.

## 6. Vào Payment Service tạo VNPAY URL

Chọn **Payment Service → Authorize** bằng token mới còn hạn. Khi chuyển service, kiểm tra lại token của service đang chọn.

Gọi `POST /api/v1/payments/topups`:

```json
{
  "amountVnd": 10000,
  "idempotencyKey": "swagger-topup-20261112-001"
}
```

- amountVnd là số nguyên từ 1 đến 999999999; hiện 1 VND = 1 Point.
- idempotencyKey dài 8–150 ký tự. Mỗi ý định nạp mới dùng key mới. Gửi lại cùng key/cùng dữ liệu trả yêu cầu cũ; không dùng key cũ cho số tiền khác.
- Body `{ "amountVnd": 100000, "idempotencyKey": "12345678" }` tự nó đúng định dạng; phải đọc response để biết lỗi cụ thể.

Lưu `data.id` (top-up ID), `provider`, `checkoutUrl`, `status`, `expiresAt`. **Top-up ID khác userId, wallet ID và mã VNPAY vnp_TxnRef.** Muốn lấy checkout URL, sao chép toàn bộ giá trị data.checkoutUrl giữa hai dấu ngoặc kép, không lấy dấu ngoặc kép/dấu phẩy và không rút gọn bằng dấu ba chấm.

Nếu 401 thiếu token: Curl chưa có Authorization. Nếu 401 token không hợp lệ/hết hạn: login lại và Authorize bằng JWT mới; nếu token mới dùng được ở Wallet nhưng Payment vẫn 401 thì kiểm tra cấu hình khóa/issuer/audience.

Nếu Failed to fetch, chưa nhận được HTTP response; CORS chỉ là gợi ý chung. Đã gặp Gateway 3000 dừng trong khi Payment 3007 vẫn health 200. Kiểm tra:

```powershell
Invoke-RestMethod 'http://localhost:3000/health'
Invoke-RestMethod 'http://localhost:3007/health'
```

Khởi động lại Gateway nếu cần, tải lại Swagger rồi thử lại.

## 7. Thực hiện theo hướng dẫn VNPAY

Với provider vnpay, mở checkoutUrl trong tab trình duyệt mới, làm theo màn hình thanh toán, nhập thông tin thử nghiệm của môi trường VNPAY sandbox. Giữ backend và ngrok chạy để nhận IPN.

Top-up hiện có hạn 15 phút. Xem expiresAt: đuôi Z là UTC, cộng 7 giờ ra giờ Việt Nam. Token 30 phút không kéo dài checkout. Link hết hạn và chưa thanh toán thì tạo top-up với key mới. Đã thanh toán thì kiểm tra IPN trước, không thanh toán lại ngay.

Trang thanh toán báo thành công hoặc trình duyệt về return URL chưa đủ để ví có tiền. Backend cần IPN hợp lệ, rồi Wallet xử lý sự kiện và xác nhận cộng tiền.

Trong báo cáo sandbox đã gặp Merchant Response chứa `Exception ... (404) Not Found`: VNPAY đã thử gọi IPN nhưng đường callback trả HTTP 404. Đây khác JSON nghiệp vụ RspCode 01 khi không tìm thấy giao dịch. Sửa tunnel/domain/path/port và IPN merchant theo bước 3, xem ngrok inspector, rồi thử gửi lại/kiểm tra IPN sandbox nếu có. Không sửa query/chữ ký tùy ý hoặc cộng tiền từ return URL.

| RspCode IPN trong backend | Ý nghĩa                                     |
| ------------------------- | ------------------------------------------- |
| 00                        | Confirm Success: tiếp nhận kết quả provider |
| 01                        | Không tìm thấy giao dịch                    |
| 02                        | Đã xác nhận trước đó                        |
| 04                        | Số tiền không hợp lệ                        |
| 97                        | Chữ ký không hợp lệ                         |
| 99                        | Lỗi xử lý khác                              |

Nếu response tạo top-up là provider mock thì không phải luồng VNPAY. Chỉ khi mock đã bật non-production (`TOPUP_MOCK_ENABLED=true`, gồm Wallet), có thể gọi `POST /api/v1/payments/topups/{topupId}/simulate` với `{ "outcome": "succeeded", "confirmSimulated": true }`. Không dùng simulate cho top-up VNPAY.

## 8. Kiểm tra completed và đối chiếu ví

Payment Service → `GET /api/v1/payments/topups/{id}`, nhập **top-up ID từ bước 6**, không nhập userId. Nếu quên ID, gọi `GET /api/v1/payments/topups` để lấy danh sách của tài khoản.

| Trạng thái       | Ý nghĩa và bước kiểm tra                                       |
| ---------------- | -------------------------------------------------------------- |
| awaiting_payment | Chưa ghi nhận thanh toán: xem checkout/IPN                     |
| credit_pending   | Đã ghi nhận provider, chờ Wallet: xem RabbitMQ/outbox/consumer |
| completed        | Wallet đã xác nhận cộng tiền                                   |
| failed / expired | Thất bại hoặc hết hạn                                          |
| needs_review     | Cần xem log và dữ liệu trước khi xử lý tiếp                    |

Luồng thường là awaiting_payment → credit_pending → completed. providerPaidAt null nghĩa chưa có mốc ghi nhận thanh toán; walletCreditedAt null nghĩa chưa có mốc xác nhận cộng ví. Chờ vài giây và query lại nếu sự kiện đang xử lý. IPN RspCode 00 chưa đồng nghĩa Wallet đã completed.

Sau completed, chuyển Wallet Service, kiểm tra lại:

```http
GET /api/v1/wallets/me
GET /api/v1/wallets/me/transactions
```

Test đạt khi trạng thái completed, số dư tăng đúng (nạp 10000 VND tăng 10000 Point nếu không có giao dịch khác), lịch sử có giao dịch tương ứng. Gửi lại cùng yêu cầu bằng key cũ không được gây cộng trùng.

404 Top-up not found: kiểm tra đúng top-up ID, cùng tài khoản và database. 401: lấy token mới, không tạo lại top-up hoặc thanh toán lại chỉ để sửa xác thực.

Nếu cần xem request: F12 → Network → Fetch/XHR → lọc wallets/me hoặc topups → Execute một lần → xem đúng API/Response. Request `/docs?...` trả 304 chỉ là cache trang Swagger, không phải kết quả ví. Pending kéo dài cần đối chiếu log; Ctrl+Shift+R/ẩn danh có thể loại trạng thái Swagger cũ nhưng không restart backend.

### Dừng sau khi test

Chạy tại backend sau khi startup đã hoàn tất:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/payment-local-stop.ps1
```

Script dừng các service/terminal đã được start quản lý và Docker dependencies, giữ volume dữ liệu. Muốn giữ Docker chạy:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/payment-local-stop.ps1 -KeepDependencies
```

PID/thời điểm tạo terminal lưu tại `logs/payment-local-terminals.clixml`; stop kiểm tra để tránh dừng nhầm PID tái sử dụng. Service mở thủ công, bị start bỏ qua hoặc mở bằng script cũ phải dừng riêng. Ngrok mở thủ công cũng dừng riêng bằng Ctrl+C. Đóng cửa sổ log database không tự dừng container.

Khi cần tìm tiến trình cũ trước khi dừng thủ công:

```powershell
Get-NetTCPConnection -State Listen |
    Where-Object { $_.LocalPort -in @(3000, 3001, 3002, 3007, 3009) } |
    Select-Object LocalPort, OwningProcess
```

Chỉ dừng PID sau khi xác nhận thuộc service local cần tắt. Không chạy start/stop đồng thời. Khi gửi lỗi để hỗ trợ, ưu tiên HTTP status, Response body, requestId và log cùng thời điểm, che thông tin bí mật.
