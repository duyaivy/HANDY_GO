# Chạy backend HG-71 bằng Docker Desktop

**Hướng dẫn môi trường cá nhân trên máy đã kiểm thử.** Năm file Compose/script/template mang tên `hg71-local` được giữ trên máy này, bị Git bỏ qua và không nằm trong commit bàn giao. Đồng đội clone repo sẽ không có các file đó và không cần chúng để chạy quy trình backend sẵn có. Các lệnh dưới đây chỉ dùng khi bộ file cá nhân đang tồn tại ở đúng đường dẫn.

Stack `handygo-hg71-local` dùng code của checkout hiện tại và hai target `runtime` / `migration` trong `backend/Dockerfile`. Image chứa sẵn artifact của cả 12 ứng dụng; không dùng `dist` hay `node_modules` của Windows, không cần build từng service trên host.

Maestro chỉ dùng cá nhân trên máy local, không phải dependency hoặc điều kiện chạy dự án của đồng đội. Các flow dùng để kiểm tra bên dưới hiện nằm ở `mobile/.maestro-local/`, bị bỏ qua qua `.git/info/exclude`; không đưa vào commit. Những đường dẫn artifact là bằng chứng đã chạy trên máy này.

## Build và khởi động

Mở Docker Desktop ở chế độ Linux containers. Chạy từ thư mục repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\backend\scripts\hg71-local-docker.ps1 -Action Build
powershell -ExecutionPolicy Bypass -File .\backend\scripts\hg71-local-docker.ps1 -Action Start
```

Lần đầu Docker tải các image hạ tầng và build backend nên sẽ lâu hơn. `Start` chờ PostgreSQL/RabbitMQ/Redis khỏe, chạy migration cho database local, tạo khóa JWT local rồi khởi động ứng dụng. Chỉ trả thành công khi healthcheck các ứng dụng đạt. Trong Docker Desktop, mở nhóm **handygo-hg71-local** để xem trạng thái/log.

Các lệnh tương đương nếu chạy trực tiếp trong `backend/`:

```powershell
docker compose --env-file scripts/hg71-local.env.template -f docker-compose.hg71-local.yml build api-gateway migrate
docker compose --env-file scripts/hg71-local.env.template -f docker-compose.hg71-local.yml up -d --build --wait --wait-timeout 300
```

Luôn dùng `--env-file` chỉ định như trên. File `backend/.env` hiện có không được dùng cho stack này.

## Kết nối mobile

Gateway: `http://localhost:3000/api/v1`. Healthcheck: `http://localhost:3000/health`. Message REST/Socket.IO được publish tại cổng `3011`.

Trong `mobile/.env`:

```dotenv
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api/v1
EXPO_PUBLIC_MESSAGE_URL=http://10.0.2.2:3011/api/v1
```

Khởi động lại Metro và reload app sau khi đổi ENV. Đăng xuất tài khoản server trước khi đăng nhập local: token server và local dùng các cặp khóa khác nhau. Các máy ảo Android dùng được địa chỉ `10.0.2.2` để truy cập máy Windows.

## Dữ liệu và sandbox

- PostgreSQL, Redis, RabbitMQ và JWT dùng Docker volumes riêng của project `handygo-hg71-local`; các URL database/broker trong Compose trỏ cố định tới service Docker local.
- Database local mới không chứa tài khoản, dịch vụ, đơn hay số dư từ server deploy. Cần đăng ký/seed dữ liệu local trước khi test. Stack không sao chép hoặc sửa dữ liệu server.
- Mailpit bắt email/OTP đăng ký local tại `http://localhost:8025`. RabbitMQ Management tại `http://localhost:15675`, tài khoản local `handygo_local` / `local_only_password`.
- Nạp và payout mặc định dùng **mock sandbox**, không chuyển tiền thật. Nút nạp thử chỉ có trên app development; backend vẫn ghi ledger local và trả trạng thái thật của quá trình mô phỏng. Đây không phải kiểm thử VNPAY IPN thật.
- Khi test thanh toán đơn mới, phải có rule hoa hồng local phù hợp ngày tạo đơn. Việc migration không tự tạo rule tài chính hoặc tài khoản admin; cấu hình qua luồng quản trị/seed đã được xác nhận cho database local.
- Matching dùng provider mock để không cần AI bên ngoài. Các tính năng OCR/AI vẫn cần dịch vụ AI riêng nếu muốn kiểm thử chúng.
- Upload ảnh/video cần Cloudinary hoạt động. Nếu cần, copy `backend/scripts/hg71-local.env.template` thành `backend/.env.hg71-local` và điền các biến `HG71_CLOUDINARY_*`; script PowerShell tự ưu tiên file local này. Các giá trị mặc định chỉ giúp dịch vụ khởi động, không mô phỏng upload thành công.
- Muốn test payout thất bại, đặt `HG71_PAYOUT_OUTCOME=failed` trong `.env.hg71-local`, rồi chạy lại `Start` để cập nhật container.

## Quản lý stack

```powershell
powershell -ExecutionPolicy Bypass -File .\backend\scripts\hg71-local-docker.ps1 -Action Status
powershell -ExecutionPolicy Bypass -File .\backend\scripts\hg71-local-docker.ps1 -Action Logs
powershell -ExecutionPolicy Bypass -File .\backend\scripts\hg71-local-docker.ps1 -Action Stop
```

`Stop` dừng/xóa container và network của stack, giữ dữ liệu trong volumes. Không chạy `down -v` nếu muốn giữ tài khoản/đơn local. Sau khi sửa code backend, chạy lại `Build` rồi `Start` để dùng image mới.

Các file ENV và khóa riêng bị loại khỏi Docker build context. Khóa JWT local được tạo trong hai volumes public/private riêng; chỉ Auth được mount volume private. Không chạy script tạo khóa cũ để tránh đồng bộ khóa vào `.env.example`.

## Kết quả kiểm tra ngày 21/11/2026

- Build thành công hai image `handygo-hg71-local:dev` và `handygo-hg71-local-migration:dev`.
- Runtime image có đủ artifact của 12 ứng dụng; không chứa `.env`, `.env.example` hoặc khóa riêng JWT.
- Tạo và chạy lại bộ khởi tạo khóa thành công; lần sau dùng lại cặp khóa hợp lệ.
- Cả 12 ứng dụng và PostgreSQL/Redis/RabbitMQ/Mailpit đều healthy. `migrate` và `keys-init` kết thúc với exit code 0.
- Gateway `/health`, danh sách dịch vụ `/api/v1/services`, Message `/health` và Mailpit `/livez` đều trả HTTP 200.
- Database local đã có hai cột `wallet_transactions.balance_before` và `balance_after` sau migration.
- Ở lần khởi động ban đầu, database mới có **0 tài khoản và 0 rule hoa hồng**; dữ liệu test bổ sung được ghi riêng bên dưới.
- Kết quả trên xác nhận image và stack local khởi động được; chưa phải bằng chứng hoàn tất các luồng tài chính/native trên app.

## Dữ liệu test local đã chuẩn bị

Đã tạo hai tài khoản có tên **Khách HG-71 Local** và **Thợ HG-71 Local**. Số điện thoại và mật khẩu được truyền vào script lúc chạy, không lưu trong source/template. Thông tin đăng nhập được bàn giao trực tiếp trong chat.

- Script `backend/scripts/hg71-local-seed.mjs` chỉ chấp nhận `NODE_ENV=development`, cờ `HG71_LOCAL_SEED=1` và endpoint database `postgres/handygo_hg71`. Nó không đọc `.env`; từ chối endpoint khác trước khi kết nối.
- Các biến đầu vào bắt buộc là `HG71_LOCAL_CUSTOMER_PHONE`, `HG71_LOCAL_WORKER_PHONE`, `HG71_LOCAL_TEST_PASSWORD`. Chạy script trong container có thư viện `pg`/`bcrypt`, với mã nguồn truyền vào Node qua stdin. Script không tự chạy mỗi lần khởi động stack.
- Seed tạo hồ sơ khách, thợ/KYC/ngành nghề giả lập đã duyệt, khu vực Đà Nẵng, dịch vụ **Bảo dưỡng máy in**, ngân hàng giả lập **HG71 LOCAL SANDBOX** và rule hoa hồng **10% từ 01/11/2026**. Dữ liệu này chỉ phục vụ database local.
- Đã đăng nhập thành công cả hai tài khoản qua Gateway local. Mỗi ví được nạp **5.000.000đ** bằng API mock top-up, chờ `completed`; ledger ghi đúng **0 → 5.000.000đ**, không cập nhật số dư bằng SQL.
- Chạy lại seed không reset mật khẩu, số dư hoặc lịch sử giao dịch đã có. Đã kiểm tra cờ tắt/endpoint khác bị từ chối và chạy lặp giữ nguyên dữ liệu.
- Mobile `.env` local đã đổi sang cổng `3000`/`3011` của máy Windows và Metro đã khởi động lại. `.env` vẫn bị Git bỏ qua.
- Đã đăng nhập tài khoản local trên cả hai máy ảo. Maestro `verify-transaction-balances.yaml` PASS trên Customer (`emulator-5554`) và Worker (`emulator-5556`): mở giao dịch nạp, xác nhận số dư trước **0đ**, sau **5.000.000đ**. Artifacts nằm trong `mobile/coverage/maestro-local-customer/` và `mobile/coverage/maestro-local-worker/`.
- Hai máy ảo được đặt vị trí test ở Đà Nẵng để phù hợp vùng phục vụ của thợ fixture. Chọn địa chỉ Đà Nẵng khi tạo đơn test.

Ảnh, XML và kết quả kiểm tra thực tế đặt tại `mobile/coverage/`, không đưa token/mật khẩu vào evidence hoặc commit. Chưa tạo đơn hàng hay chi tiền thật trong bước chuẩn bị này.

## Kiểm tra lỗi nạp sandbox trên app khách — 21/11/2026

Backend mock trả `checkoutUrl` dạng `mock://topup/...`; đây không phải trang VNPAY để Android mở bằng trình duyệt. App đã được sửa để nhận biết `provider=mock`/`isSimulated`, hiển thị hướng dẫn sandbox và ẩn nút VNPAY cho giao dịch đó. App chỉ gửi xác nhận giả lập khi người dùng bấm **[Sandbox] Giả lập nạp thành công**, sử dụng lại yêu cầu đang chờ cùng số tiền. Hook checkout từ chối scheme ngoài HTTP/HTTPS trước khi gọi Android.

- Maestro local `mobile/.maestro-local/worker-wallet/customer-topup-sandbox.yaml` PASS trên Customer `emulator-5554`: bấm VNPAY, nhận hướng dẫn mock, không có lỗi mở URL, bấm giả lập, nhận thông báo thành công và thấy số dư cập nhật. Flow được giữ nguyên nội dung sau khi chuyển sang thư mục local.
- Nạp thử **500.000đ**: **4.444.445đ → 4.944.445đ**. API local xác nhận top-up `1b2d909a-1562-41e3-a98d-3ac037e9dcea` ở trạng thái `completed`, provider `mock`.
- Ledger chỉ phát sinh **một** dòng cộng 500.000đ, ID `d2761005-e258-4990-934b-34cb1a9e63fd`; `balanceBefore=4444445`, `balanceAfter=4944445`.
- 5 test suites / 23 tests liên quan tới top-up, màn hình khách và hành trình ví khách/thợ PASS. TypeScript và ESLint cho các file sửa PASS.
- Bằng chứng local: `mobile/coverage/maestro-customer-topup-fixed/`, `hg71-customer-topup-before.json` và `hg71-customer-topup-after.json` trong `mobile/coverage/`.

Đây là kiểm thử điểm giả lập trong Docker local, không xác nhận tích hợp ngân hàng/VNPAY thật. Muốn mở trang VNPAY sandbox cần cấu hình provider VNPAY riêng; liên kết mock không thể dùng thay trang đó.

## Nghiệm thu bổ sung local — 21/11/2026

### Sửa lỗi và kiểm tra tự động

- Test chi tiết đơn hàng đã mock đầy đủ các nguồn hồ sơ thợ dự phòng. Các test Radar đã mock request/proposal/candidates, khôi phục spy sau mỗi bài và chờ thông báo gửi đề xuất hoàn tất. Test hủy đơn chờ API và thông báo kết quả trước khi kết thúc. Việc chạy Docker local không còn khiến các ca này phụ thuộc HTTP 401/429 hoặc kết quả đến sau teardown.
- Sửa lỗi lint trong hai regression tests rút/hủy khi refetch chạy nền. Giữ các assertion về số tiền, payload, idempotency và trạng thái; không tăng timeout để che lỗi.
- Toàn bộ mobile: **125 suites / 930 tests PASS**. Lệnh: `pnpm exec jest --forceExit --runInBand --watch=false`; log: `mobile/coverage/hg71-final-mobile-tests.log`.
- Header dùng `Screen` làm nơi xử lý safe area; bỏ padding top trùng trong `AppBar`. Các trang Hồ sơ, Hoạt động, Thông báo được chuyển sang dùng top safe area của `Screen`. Đã đo trên 8 màn hình native: header khách giảm 63px, thợ giảm 132px, chiều cao toolbar sau sửa đều 150px trên hai emulator density 420.
- Thông báo `order.completed` của thợ chỉ xác nhận nghiệm thu và hướng dẫn kiểm tra trạng thái thanh toán. Không khẳng định tiền đang vào ví khi Payment chưa settled. Đã quan sát thông báo mới trên Android và cập nhật hai test theo đúng ý nghĩa nghiệp vụ này.

### Các luồng tài chính đã đối chiếu

Backend HTTP, PostgreSQL, Wallet ledger, Payment và RabbitMQ chạy thật trong Docker local; xác nhận nạp/payout dùng mock. Mỗi hàng dưới đây ghi số dư tại thời điểm riêng của ca kiểm thử.

| Ca | Kết quả đã quan sát | Bằng chứng local trong `mobile/coverage/` |
| --- | --- | --- |
| Thợ nạp mock 200.000đ trên app | Completed; 5.000.000 → 5.200.000; một ledger credit | `maestro-local-topup/`, `hg71-local-wallet-current.json` |
| Khách nạp mock 500.000đ trên app | Completed; 4.444.445 → 4.944.445; một ledger credit | `maestro-customer-topup-fixed/`, `hg71-customer-topup-after.json` |
| Thợ rút 100.000đ trên app | Succeeded; 5.200.000 → 5.100.000; reserved về 0 | `maestro-local-withdraw-success/`, `hg71-local-withdraw-success.json` |
| Tạm giữ rồi hủy rút | Reserved 100.000, available giảm 100.000; hủy giải phóng hold, không trừ balance | `maestro-local-cancel-fixed/`, `hg71-local-withdraw-hold.json` |
| Payout mock thất bại 50.000đ | Failed; giải phóng hold, balance giữ 5.100.000 | `hg71-local-failed-payout.json` |
| Replay rút / đổi payload / ngân hàng người khác / thiếu số dư | Cùng key trả cùng ID; đổi payload 409; ngân hàng người khác 403; thiếu số dư 409 | `hg71-local-withdraw-guards.json` |
| Thanh toán Point 555.555đ | Succeeded; khách 5.000.000 → 4.444.445; thợ 5.100.000 → 5.599.999; platform nhận 55.556 | `hg71-local-cash-point-acceptance.json` |
| Tiền mặt 150.000đ | Khách chọn cash trên app; thợ xác nhận nhận đủ tiền trên app; Payment succeeded. Ví khách giữ 7.444.445; ví thợ 5.199.999 → 5.184.999 do phí 15.000, không cộng tiền mặt vào ví | `maestro-local-cash-start/`, `maestro-local-cash-finish-retry/`, `maestro-local-cash-customer-result/`, `maestro-local-cash-confirm/`, `hg71-local-cash-point-acceptance.json` |
| Replay Point, cash và top-up đã completed | Balance và tổng số ledger không đổi; khách tự xác nhận cash thay thợ bị 404 | `hg71-local-cash-point-acceptance.json` |

Đơn Point: `12c43205-cd9b-4b01-8f40-6e2467e31c51`, Payment `ebb4dc8a-5dbf-46a5-90af-fb5c3e48364f`.

Đơn cash: `56911ee6-ec35-4e7b-8319-eba479a53cbc`, Payment `8e04bc3c-5380-4d5f-8025-58d5f986aadc`. Request đã được tạo trên app khách và được chọn/nhận việc trước đợt kiểm tra này. Maestro chạy các bước sẵn sàng, bắt đầu, báo hoàn thành, chọn cash và xác nhận nhận tiền. Ảnh bằng chứng được thêm bằng API nghiệp vụ với URL fixture HTTP local; không chạy upload Cloudinary. Một assertion thông báo customer ban đầu lỗi do truyền tiếng Việt qua tham số CLI Windows; đã chuyển chuỗi vào YAML và chạy tiếp bước xác nhận kết quả, không gửi lại lệnh thanh toán.

Maestro đã mở chi tiết lịch sử và xác nhận snapshot Point của khách/thợ, cùng phí cash của thợ: `maestro-local-point-customer-snapshot/`, `maestro-local-point-worker-snapshot/`, `maestro-local-cash-snapshot/`. Khách thấy đơn cash **Đã thanh toán**, không còn nút thanh toán lại (`maestro-local-cash-paid/`). Ví thợ trên Android hiển thị khả dụng **5.184.999đ**, thu nhập ghi nhận tuần này **634.999đ**, **2** đơn nghiệm thu và tổng hoa hồng **70.556đ**; UI hierarchy nằm tại `hg71-worker-summary.xml`.

Các gate cuối: `pnpm lint`, `pnpm type-check`, `git diff --check` đều exit 0. Compose hợp lệ; 16 container runtime healthy, không container nào bị pause. Đã xác minh runtime giữ `TOPUP_MOCK_ENABLED=true`, `WALLET_WITHDRAWALS_ENABLED=true`, `PAYOUT_MOCK_ENABLED=true`, `PAYOUT_MOCK_OUTCOME=succeeded`.

### Giới hạn của kết quả này

- Kết quả áp dụng cho **Android + Docker local + nạp/payout mock**. VNPAY web/OTP/IPN, chuyển khoản ngân hàng thật, iOS, upload Cloudinary và đo FPS chưa được nghiệm thu trong đợt này. Matching vẫn dùng provider mock.
- Các trạng thái payout `processing`/`needs_review`, xung đột claim/cancel và lỗi mạng có unit tests; không coi chúng là các ca native đã chạy nếu không có artifact tương ứng.
- UI rút tiền chặn dưới 50.000đ theo kế hoạch mobile. DTO backend hiện chỉ ràng buộc số nguyên dương: API trực tiếp đã nhận 49.000đ trong ca kiểm tra và yêu cầu đó được hủy trước payout. Đây là khác biệt giữa quy tắc UI và contract BE cần thống nhất với người phụ trách backend; đợt này không tự đổi quy tắc tài chính của BE.
- Không sửa dữ liệu deploy, không push/tạo PR/merge. Các thay đổi chưa được commit trong đợt sửa và test local này.
