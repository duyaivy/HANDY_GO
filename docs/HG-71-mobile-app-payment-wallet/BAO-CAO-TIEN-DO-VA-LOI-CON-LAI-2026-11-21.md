# HG-71 — Báo cáo triển khai, kiểm thử local và vấn đề còn lại

**Ngày lập:** 21/11/2026, múi giờ UTC+7.

**Repository:** `D:\SCHOOL\PBL6`.

**Nhánh:** `feature/HG-71-mobile-app-payment-wallet`.

**Commit nền trước đợt bàn giao:** `bd6f292b782127134838d7e7059bb1c4e25b495e`.

**Trạng thái bàn giao:** commit local trên nhánh HG-71, chưa push. Tra SHA hiện tại bằng `git log -1`; không ghi SHA tự tham chiếu vào nội dung commit. Công cụ Docker/seed và Maestro cá nhân nằm ngoài commit.

## 1. Kết quả hiện tại

Đã sửa các lỗi nạp mock, chờ phản hồi rút/hủy, header bị dư khoảng trống và thông báo nghiệm thu gây hiểu nhầm về tiền công. Đã sửa các test thiếu mock/chờ bất đồng bộ và chạy lại toàn bộ mobile thành công. Các luồng ví chính đã được đối chiếu với backend Docker local, API, ledger và giao diện Android.

| Hạng mục | Kết quả | Giới hạn |
| --- | --- | --- |
| Toàn bộ test mobile | **125 suites / 930 tests PASS**, 0 failed | Jest vẫn có cảnh báo; xem mục 7 |
| ESLint toàn mobile | PASS, exit 0 | Kết quả lint khác với cảnh báo runtime của Jest |
| TypeScript toàn mobile | PASS, exit 0 | Không thay thế kiểm thử native |
| `git diff --check` | PASS, exit 0 | Git có cảnh báo LF/CRLF trên một số file |
| Docker Compose local | Cấu hình hợp lệ; 16 container runtime healthy | Gồm 12 ứng dụng và 4 dịch vụ hạ tầng |
| Header | Đã kiểm tra trên 8 màn hình Android khách/thợ | Chưa kiểm tra iOS, xoay ngang hoặc cỡ chữ hệ thống lớn |
| Nạp/rút sandbox | Đã chạy các ca thành công, hủy, thất bại và kiểm tra chống lặp | Nạp/payout dùng mock; không có tiền ngân hàng di chuyển |
| Point/cash | Đã đối chiếu trạng thái, số dư, phí và ledger; kiểm tra replay | Phạm vi tài khoản test trong Docker local |
| VNPAY web/OTP/IPN | **Chưa nghiệm thu** | Đang giữ mock theo lựa chọn hiện tại |

**Chưa thể gọi là hoàn thành 100% mọi môi trường hoặc mọi kịch bản.** Các lỗi test đã nêu trước đó không còn làm suite thất bại ở lần chạy cuối; khác biệt quy tắc rút tiền giữa UI/BE, cảnh báo Jest và các phần chưa kiểm chứng vẫn được ghi riêng bên dưới.

## 2. Phạm vi và môi trường thực hiện

### 2.1. Giới hạn công việc

- Đợt sửa và kiểm thử local này chỉ làm trên nhánh HG-71 nêu trên.
- Không push, tạo/đóng/merge PR, cập nhật remote ref hoặc triển khai trong đợt này.
- Không sửa cấu hình hoặc dữ liệu database của môi trường deploy trong đợt này.
- Không sửa mã nghiệp vụ tài chính backend trong các thay đổi được liệt kê ở mục 9. Công cụ Docker/seed đã dùng để kiểm thử được giữ local; chỉ thay đổi Docker build context ở `.dockerignore` thuộc phần backend trong commit bàn giao.
- Số dư ban đầu được nạp qua API mock top-up; các thao tác thanh toán/rút/hủy đi qua API nghiệp vụ. Truy vấn SQL chỉ được dùng để đọc, đối chiếu ledger.
- Các bút toán snapshot đã có trong baseline được kiểm chứng lại; không nhận là tính năng backend mới được viết trong đợt sửa này.
- `AGENTS.md` root và `mobile/.env` vẫn chỉ dùng local, bị Git bỏ qua. Token, mật khẩu và khóa riêng không được đưa vào báo cáo.

### 2.2. Stack local

| Thành phần | Cấu hình |
| --- | --- |
| Docker project | `handygo-hg71-local` |
| Image ứng dụng | `handygo-hg71-local:dev` |
| Image migration | `handygo-hg71-local-migration:dev` |
| Gateway | `http://127.0.0.1:3000/api/v1` |
| Message | `http://127.0.0.1:3011/api/v1` |
| PostgreSQL | Database `handygo_hg71`, host port `55435` |
| Hạ tầng còn lại | Redis, RabbitMQ, Mailpit |
| Customer emulator | `emulator-5554`, AVD CUSTOMER |
| Worker emulator | `emulator-5556`, Pixel 6a |
| Mobile API URL | `http://10.0.2.2:3000/api/v1`; ADB reverse/API client có thể chuyển kết nối sang loopback |
| Mobile Message URL | `http://10.0.2.2:3011/api/v1` |
| Địa điểm fixture | Đà Nẵng |

Các giá trị runtime đã được kiểm tra:

```dotenv
NODE_ENV=development
TOPUP_MOCK_ENABLED=true
WALLET_WITHDRAWALS_ENABLED=true
PAYOUT_MOCK_ENABLED=true
PAYOUT_MOCK_OUTCOME=succeeded
ORDER_ENABLE_MOCK_VERIFIER=false
MATCHING_RANKING_PROVIDER=mock
```

Nạp/payout đang giả lập xác nhận của nhà cung cấp. HTTP, database, RabbitMQ, Payment, Wallet và các thay đổi ledger local vẫn chạy thật. Kiểm tra điều kiện bid của Order đã dùng luồng xác minh Bidding; phần xếp hạng Matching vẫn mock.

### 2.3. Dữ liệu test

- Hai tài khoản: **Khách HG-71 Local** và **Thợ HG-71 Local**; thông tin đăng nhập đã được bàn giao trong chat, không chép mật khẩu vào file.
- User khách: `a7100000-0000-4000-8000-000000000001`.
- User thợ: `a7100000-0000-4000-8000-000000000002`.
- Dịch vụ: **Bảo dưỡng máy in**, ID `a7100000-0000-4000-8000-000000000041`.
- Có hồ sơ thợ, KYC/ngành nghề fixture đã duyệt, khu vực phục vụ và tài khoản ngân hàng giả lập **HG71 LOCAL SANDBOX**.
- Rule hoa hồng local: **10% từ 01/11/2026**, không sửa rule deploy.
- Ban đầu mỗi ví được nạp 5.000.000đ bằng API mock, có ledger **0 → 5.000.000đ**.
- Script seed từ chối chạy khi thiếu cờ cho phép hoặc URL database không đúng môi trường local được chỉ định. Chạy lại không reset số dư, lịch sử hoặc mật khẩu đã có.

Hướng dẫn vận hành: [LOCAL-DOCKER.md](./LOCAL-DOCKER.md).

## 3. Những thay đổi đã thực hiện

### 3.1. Backend Docker Desktop và fixture local

Các công cụ dựng môi trường dưới đây đã được tạo và sử dụng trên máy cá nhân. Sau khi thu gọn phạm vi bàn giao, năm file Compose/script/template chỉ giữ local, không đưa vào commit; báo cáo vẫn ghi nhận môi trường đã dùng để tạo bằng chứng.

- Bổ sung Compose chạy đủ backend và hạ tầng, giữ dữ liệu trong volume riêng.
- Dùng artifact trong image Linux; không mount `dist`/`node_modules` Windows vào runtime.
- Bổ sung script Build/Start/Stop/Status/Logs; dùng env file được chỉ định, không tự tải `backend/.env`.
- Tạo cặp khóa JWT local trong hai volume public/private; chỉ Auth được mount khóa private.
- Bổ sung seed local có guard môi trường và kiểm tra dữ liệu trùng.
- Loại file ENV, khóa riêng và JSON tài khoản dịch vụ khỏi Docker build context. Runtime image đã được kiểm tra không chứa ENV/khóa JWT riêng từ host.
- Đã build hai image, chạy migration local, xác nhận hai cột `balance_before`/`balance_after` tồn tại và các container healthy.

File chính: `backend/.dockerignore`, `backend/docker-compose.hg71-local.yml` và nhóm `backend/scripts/hg71-local-*`.

### 3.2. Sửa request xác nhận nạp mock

**Trước:** app gửi `outcome` nhưng thiếu `confirmSimulated: true`; DTO backend từ chối request.

**Sau:** `PaymentApi.simulateTopup` gửi cả outcome và xác nhận giả lập. Backend vẫn lấy số tiền từ top-up đã lưu, app không tự cộng số dư.

File: `mobile/src/features/wallet/api/payment.api.ts` và test API tương ứng. Đã nạp thử trên app thợ và khách, kiểm tra trạng thái `completed` và ledger một lần.

### 3.3. Sửa lỗi Android mở `mock://` như trang VNPAY

**Trước:** bấm VNPAY với backend mock khiến app gọi Android mở URL `mock://topup/...`; Android báo không có Activity xử lý.

**Sau:**

- Nhận biết `provider=mock` hoặc `isSimulated` từ response.
- Hiển thị hướng dẫn thử nghiệm và ẩn nút VNPAY của giao dịch mock đó.
- Chỉ xác nhận mock sau khi người dùng bấm nút **[Sandbox] Giả lập nạp thành công**.
- Tái sử dụng top-up cùng số tiền còn `awaiting_payment`, không tạo yêu cầu mới chỉ để chuyển sang bước xác nhận mock.
- Hook mở checkout từ chối scheme ngoài HTTP/HTTPS trước khi gọi Android.
- Luồng VNPAY HTTP/HTTPS vẫn có trong app; chưa chuyển môi trường hiện tại sang provider VNPAY.

File: `customer/components/topup-modal.tsx`, `hooks/use-topup.ts` trong feature wallet và các test tương ứng.

### 3.4. Sửa việc rút/hủy đã thành công nhưng UI chờ refetch quá lâu

**Trước:** mutation đợi hoàn tất việc invalidate/refetch toàn nhóm wallet. Một truy vấn phụ chậm hoặc Payment tạm dừng có thể giữ trạng thái pending và trì hoãn thông báo dù backend đã ghi nhận thao tác.

**Sau:** mutation tạo/hủy rút vẫn kích hoạt cập nhật dữ liệu nhưng không chờ toàn bộ truy vấn nền để trả kết quả nghiệp vụ. Giữ cơ chế idempotency, lưu key khi kết quả chưa rõ và chống bấm lặp.

File: `mobile/src/features/wallet/hooks/use-withdrawal.ts`.

Có hai regression tests chứng minh create/cancel trả kết quả khi promise refresh nền chưa hoàn tất. Đã kiểm tra hủy native trong lúc Payment local tạm pause; sau kiểm tra đã unpause và trả payout về mặc định `succeeded`.

### 3.5. Sửa header dư khoảng trắng

**Nguyên nhân:** `Screen` đã dùng SafeAreaView nhưng `AppBar` lại cộng top inset lần nữa. Thanh địa chỉ/chuyển App Thợ chỉ thuộc trang chủ, không phải nguyên nhân gây giãn header các trang khác.

**Cách sửa:** `Screen` chịu trách nhiệm safe area, `AppBar` chỉ hiển thị toolbar. Hồ sơ khách/thợ, Hoạt động và Thông báo được chuyển từ `safeArea={false}` sang top/left/right safe area của `Screen`.

| Máy ảo | Header trước | Header sau | Phần dư bỏ được |
| --- | --- | --- | --- |
| Customer, Quản lý thanh toán | 213px | 150px | 63px |
| Worker, Chi tiết số dư | 282px | 150px | 132px |

Số đo là pixel trên hai emulator density 420, không phải chiều cao dp áp dụng cho mọi điện thoại.

Đã kiểm tra thêm Hồ sơ/Thông báo của cả hai vai trò, Hoạt động khách và Ví thợ: tổng cộng **8 màn hình**. Header vẫn nằm dưới thanh trạng thái/camera.

### 3.6. Sửa thông báo thợ khi khách nghiệm thu

**Trước:** sự kiện `order.completed` hiện câu “Tiền công đang được quyết toán vào ví của bạn” dù chưa có xác nhận Payment thành công hoặc khách chọn tiền mặt.

**Sau:** thông báo chỉ xác nhận khách đã nghiệm thu và hướng dẫn kiểm tra trạng thái thanh toán trong chi tiết đơn hàng.

Đã cập nhật hai test ở Worker Job Detail và Tracking; đã quan sát nội dung mới trên Android. Bút toán tiền vẫn phụ thuộc kết quả Payment, không phụ thuộc thông báo Order.

### 3.7. Sửa các test gây lỗi và không ổn định

- Chi tiết đơn hàng: mock hồ sơ thợ, bid, candidates và request bids dự phòng; không phụ thuộc HTTP 401/429 từ backend local cho các ca này.
- Radar: mock request/proposal/candidates và danh sách request khi cần; khôi phục spy sau mỗi test.
- Các test gửi đề xuất chờ thông báo kết quả hoàn tất trước khi kết thúc.
- Nhóm hủy đơn mock API danh sách/hủy và chờ thông báo hủy thành công.
- Cập nhật assertion của thông báo nghiệm thu theo ý nghĩa nghiệp vụ đã sửa.
- Sửa ba lỗi định dạng lint trong regression tests rút/hủy.
- Không skip bài test, không tăng timeout để che lỗi, không bỏ assertion về tiền/payload/idempotency.

Các lỗi thất bại được phát hiện trong các vòng kiểm tra trước đã hết ở lần chạy cuối. Tuy nhiên, cảnh báo Jest toàn repo chưa sạch hoàn toàn; xem mục 7.2.

### 3.8. Hoàn thiện Maestro và bằng chứng

**Chính sách bàn giao:** Maestro chỉ dùng cá nhân tại máy local. Không đưa flow/config/dependency/script Maestro mới hoặc thay đổi vào commit; đồng đội không cần cài để chạy app, Docker, Jest, lint hoặc TypeScript. Các kết quả bên dưới vẫn là bằng chứng kiểm thử đã thực hiện.

- Sửa cách chọn dịch vụ theo `SERVICE_ID`, xử lý vị trí cuộn và các màn hình có nội dung ngoài viewport.
- Bổ sung flow nạp mock khách/thợ, tạo/hủy rút, bắt đầu/báo hoàn thành đơn local và kiểm tra kết quả thanh toán.
- Tách bước xác nhận thông báo thanh toán để tránh truyền chuỗi tiếng Việt qua tham số CLI Windows bị sai encoding.
- Flow xác nhận cash đóng thông báo nghiệm thu cũ nếu có, kiểm tra nhánh “Chưa nhận”, rồi mới xác nhận nhận đủ tiền.
- Dùng flow lịch sử để kiểm tra số dư trước/sau được lưu theo từng giao dịch.
- Ảnh, XML, log và JSON bằng chứng nằm ở `mobile/coverage/`, đang bị Git bỏ qua.
- Sau khi chốt chính sách local: đã sao chép và kiểm tra SHA-256 đủ **19 flow** sang `mobile/.maestro-local/`. Bảy flow mới và ba flow đã chỉnh chỉ được giữ ở bản local; 12 flow đã track từ commit cũ ở `mobile/.maestro/` trở về đúng HEAD. Không sửa lịch sử commit, không đặt cờ giấu file tracked. Quy tắc ignore nằm trong `.git/info/exclude`, không sửa `.gitignore` chung.

## 4. Kết quả kiểm thử tài chính

Các hàng là snapshot ở thời điểm riêng. Trong quá trình dùng máy ảo còn có thao tác thử thủ công; không suy ra số dư cuối bằng cách cộng tuần tự mọi hàng trong bảng.

| Ca | Cách kiểm tra | Kết quả và số dư |
| --- | --- | --- |
| Nạp ban đầu mỗi ví 5.000.000đ | API mock + native lịch sử | Completed; ledger 0 → 5.000.000đ |
| Thợ nạp 200.000đ | Maestro/native + API/ledger | 5.000.000 → 5.200.000đ, một credit |
| Khách nạp 500.000đ sau sửa URL | Maestro/native + API/ledger | 4.444.445 → 4.944.445đ, một credit |
| Thợ rút 100.000đ thành công | Maestro/native + API/ledger | Succeeded; 5.200.000 → 5.100.000đ, reserved 0 |
| Giữ 100.000đ rồi hủy | Maestro/native + API | Balance 5.100.000đ; reserved 100.000đ và available 5.000.000đ khi chờ; hủy nhả hold về 0 |
| Payout 50.000đ thất bại | API nghiệp vụ + quan sát trạng thái | Failed; balance giữ 5.100.000đ, reserved 50.000 → 0 |
| Replay rút cùng key/payload | API | Cùng ID, không rút hai lần |
| Replay key với amount khác | API | 409 |
| Dùng ngân hàng thuộc người khác | API | 403 |
| Rút vượt khả dụng | API | 409 |
| Rút dưới 50.000đ trên app | Native + unit | UI chặn; API BE có khác biệt được ghi ở mục 7.1 |
| Replay cash, Point, top-up đã thành công | API + so sánh ledger | Số dư và số dòng ledger không đổi |
| Khách xác nhận cash thay thợ | API | 404, không ghi thêm bút toán |

### 4.1. Thanh toán bằng Point: 555.555đ

- Order: `12c43205-cd9b-4b01-8f40-6e2467e31c51`.
- Payment: `ebb4dc8a-5dbf-46a5-90af-fb5c3e48364f`.
- Trạng thái đối chiếu: Order `completed/paid`, Payment `point/succeeded`.
- Khách: **5.000.000 → 4.444.445đ**, debit **555.555đ**.
- Thợ: **5.100.000 → 5.599.999đ**, earning **499.999đ**.
- Platform nhận **55.556đ**. Tổng phân bổ: `499.999 + 55.556 = 555.555`.
- Đọc ledger có đúng ba bút toán cho Payment: customer debit, worker earning, platform fee.
- Maestro đã mở giao dịch của khách và thợ để kiểm tra snapshot trước/sau; gọi lại API trả Point không ghi thêm tiền.

| Bút toán | ID |
| --- | --- |
| Khách bị trừ Point | `3366ba65-48fa-4414-b609-0763e6caed3b` |
| Thợ nhận thu nhập | `5b257735-f118-4223-8149-370186724dad` |
| Platform fee | `8a86cfbb-6461-4863-9232-c6c311cb6a86` |

Việc tạo/publish, chọn bid, nhận việc và chuẩn bị đơn có dùng API local; các thao tác nghiệm thu/thanh toán đã được thực hiện trên máy ảo trong quá trình thử. Báo cáo không nhận rằng toàn bộ vòng đời Point được chạy trong một flow Maestro duy nhất.

### 4.2. Thanh toán tiền mặt: 150.000đ

- Request: `385b4f40-2fac-49b5-a65c-c0be91d89ecd`, mô tả `HG71-local-cash-e2e`.
- Order: `56911ee6-ec35-4e7b-8319-eba479a53cbc`.
- Payment: `8e04bc3c-5380-4d5f-8025-58d5f986aadc`.
- Request đã tạo trên app khách; việc chọn/nhận thợ diễn ra trước lượt kiểm tra cuối.
- Maestro chạy sẵn sàng → bắt đầu → báo hoàn thành → khách chọn cash → thợ xác nhận nhận đủ tiền.
- Khách thấy thông báo chờ thợ xác nhận sau khi chọn cash; sau xác nhận của thợ, Payment thành `cash/succeeded`.
- Ví khách giữ **7.444.445đ**; không có wallet debit của khách cho Payment cash.
- Ví thợ **5.199.999 → 5.184.999đ** do thu **15.000đ hoa hồng**.
- `workerEarning=135.000đ` là thu nhập thống kê, không phải khoản được cộng thêm vào ví khi đã nhận 150.000đ trực tiếp.
- Platform nhận **15.000đ**; ledger có đúng hai bút toán commission debit/credit cho Payment cash.
- Khách thấy **Đã thanh toán**, không còn nút thanh toán lại; thợ không còn nút xác nhận nhận tiền.

| Bút toán | ID |
| --- | --- |
| Thu hoa hồng từ ví thợ | `5a5f75f9-fefc-41db-9493-a15374acd7ed` |
| Platform commission credit | `32aacc38-fc6a-4a12-a3ad-b648100a3aa2` |

**Giới hạn bằng chứng của ca cash:** ảnh fixture được thêm qua API nghiệp vụ với URL HTTP local, không đi qua upload Cloudinary. Một lượt flow khách dừng ở assertion cuối do chuỗi tiếng Việt truyền qua CLI Windows; giao dịch thực tế đã ghi nhận. Đã chuyển chuỗi vào YAML và chạy lại riêng bước xác nhận thông báo, không gửi lại lệnh thanh toán. Không ghi nhận lượt flow ban đầu đó là toàn bộ flow PASS.

### 4.3. Tổng hợp cuối đợt trên app thợ

| Chỉ số đã quan sát | Giá trị |
| --- | --- |
| Số dư khả dụng | 5.184.999đ |
| Đang tạm giữ | 0đ theo API |
| Thu nhập ghi nhận tuần này | 634.999đ = 499.999 + 135.000 |
| Đơn đã nghiệm thu tuần này | 2 |
| Tổng hoa hồng đã nộp | 70.556đ = 55.556 + 15.000 |

Đây là snapshot kết thúc đợt kiểm thử, không phải cam kết số dư sẽ giữ nguyên sau thao tác thử tiếp theo. UI hierarchy: `mobile/coverage/hg71-worker-summary.xml`.

## 5. Gate và lệnh đã chạy

Từ `D:\SCHOOL\PBL6\mobile`:

```powershell
pnpm exec jest --forceExit --runInBand --watch=false
pnpm lint
pnpm type-check
```

Kết quả Jest cuối:

```text
Test Suites: 125 passed, 125 total
Tests:       930 passed, 930 total
Snapshots:   0 total
Time:        88.302 s
```

Từ repository root đã chạy `git diff --check`, kết quả exit 0. Cấu hình Compose được kiểm tra bằng `docker compose --env-file scripts/hg71-local.env.template -f docker-compose.hg71-local.yml config --quiet` trong thư mục backend, exit 0.

TypeScript, lint và test được chạy cho code cuối; việc lập báo cáo này chỉ bổ sung Markdown và không chạy lại thao tác tài chính.

## 6. Chỉ mục bằng chứng

Đường dẫn đầy đủ dưới đây tính từ repository root; tên rút gọn trong cùng hàng dùng chung thư mục với đường dẫn đầy đủ đứng trước. Các file trong `mobile/coverage/` chỉ có trên máy local hiện tại; clone repo hoặc checkout commit sau này không tự có các artifact này. File snapshot cũ có thể ghi trạng thái tại lúc chuẩn bị đơn; dùng kết quả acceptance cuối để đọc trạng thái thanh toán cuối.

| Nội dung | Artifact |
| --- | --- |
| Toàn bộ Jest | `mobile/coverage/hg71-final-mobile-tests.log` |
| Lint cuối | `mobile/coverage/hg71-final-lint.log` |
| Đối chiếu Point/cash, replay, ledger | `mobile/coverage/hg71-local-cash-point-acceptance.json` |
| Top-up khách trước/sau | `mobile/coverage/hg71-customer-topup-before.json`, `hg71-customer-topup-after.json` |
| Nạp khách native | `mobile/coverage/maestro-customer-topup-fixed/` |
| Nạp thợ native | `mobile/coverage/maestro-local-topup/` |
| Rút thành công | `mobile/coverage/maestro-local-withdraw-success/`, `hg71-local-withdraw-success.json` |
| Hủy rút native/hold | `mobile/coverage/maestro-local-cancel-fixed/`, `hg71-local-withdraw-hold.json` |
| Payout thất bại | `mobile/coverage/hg71-local-failed-payout.json` |
| Guard rút tiền/khác biệt minimum | `mobile/coverage/hg71-local-withdraw-guards.json` |
| Header trước/sau | `mobile/coverage/hg71-customer-header-before.xml`, `hg71-customer-header-after.xml`, `hg71-worker-header-before.xml`, `hg71-worker-header-after.xml` |
| Sáu màn hình header bổ sung | `mobile/coverage/header-native-checks/results.json` và PNG/XML cùng thư mục |
| Thợ bắt đầu/báo xong đơn cash | `mobile/coverage/maestro-local-cash-start/`, `maestro-local-cash-finish-retry/` |
| Kết quả khách chọn cash | `mobile/coverage/maestro-local-cash-customer-result/` |
| Thợ xác nhận cash | `mobile/coverage/maestro-local-cash-confirm/` |
| Khách thấy đơn cash đã thanh toán | `mobile/coverage/maestro-local-cash-paid/` |
| Snapshot phí cash | `mobile/coverage/maestro-local-cash-snapshot/` |
| Snapshot Point khách/thợ | `mobile/coverage/maestro-local-point-customer-snapshot/`, `maestro-local-point-worker-snapshot/` |
| Thông báo nghiệm thu mới | `mobile/coverage/hg71-worker-before-cash.xml` |
| Tổng hợp cuối trên app thợ | `mobile/coverage/hg71-worker-summary.xml` |

## 7. Lỗi, khác biệt và điểm cần xử lý tiếp

### 7.1. P2 — Minimum rút tiền chưa thống nhất giữa UI và backend

- **Thực tế:** UI yêu cầu ít nhất 50.000đ; DTO BE hiện chỉ kiểm tra chuỗi số nguyên dương.
- **Bằng chứng:** request 49.000đ qua API đã được chấp nhận, ID `72857a9f-dce4-4e50-981a-59a80bc1a0a2`; yêu cầu này đã hủy trước payout.
- **Phạm vi ảnh hưởng:** client gọi API trực tiếp có thể tạo lệnh dưới mức UI cho phép. Không phải lỗi hiển thị số dư hoặc chứng cứ tiền bị trừ hai lần.
- **Trạng thái:** chưa sửa quy tắc BE; đã ghi nhận để thống nhất với người phụ trách backend.
- **Cần quyết định:** 50.000đ là quy tắc toàn hệ thống hay chỉ giới hạn UI. Nếu là quy tắc toàn hệ thống, BE phải validate cùng mức, mô tả Swagger/contract và bổ sung test biên; nếu BE chủ đích cho phép số nhỏ hơn thì mobile cần thống nhất lại giới hạn.
- **Điều kiện đóng:** hai phía đồng nhất và kiểm tra API/UI với 49.999đ, 50.000đ, đúng khả dụng và vượt khả dụng.

### 7.2. P2 — Jest còn cảnh báo về công việc bất đồng bộ và cleanup

- Lần chạy cuối không có suite/test thất bại và không còn lỗi `ReferenceError: You are trying to import ... after ... torn down`.
- Tuy nhiên, log vẫn có **40 lần xuất hiện** `Cannot log after tests are done` và **26 lần xuất hiện** `was not wrapped in act`.
- Số đếm là số chuỗi xuất hiện trong log, không khẳng định có 40 hoặc 26 lỗi độc lập.
- Một số bài test khác vẫn có request nền/log hoặc cập nhật React sau thời điểm assertion/cleanup. Việc sửa các ca Radar/đơn hàng thất bại không có nghĩa đã làm sạch toàn bộ harness.
- Lệnh Jest vẫn dùng `--forceExit`; kết quả PASS không chứng minh tất cả timer/socket/query đã tự đóng.
- **Việc tiếp theo:** rà các test còn phát log, mock dependency phụ còn gọi HTTP, chờ tác vụ async và cleanup đúng QueryClient được tạo cho từng test. Chạy nhóm liên quan với `--detectOpenHandles` và không dùng `--forceExit` để kiểm tra đóng tài nguyên.
- **Điều kiện đóng:** bài test vẫn giữ assertion nghiệp vụ, không còn log sau teardown, không có cập nhật thiếu `act` và tiến trình Jest tự kết thúc. Không tắt console hoặc nới timeout chỉ để làm log trông sạch.

### 7.3. P3 — Tên “Nạp ký quỹ” chưa phản ánh đầy đủ contract hiện tại

- Nút ở ví thợ vẫn ghi **Nạp ký quỹ**; màn chi tiết dùng phụ đề **Số dư & Tài khoản ký quỹ**.
- Backend hiện dùng ví chung và `reservedBalance`, chưa trả một số cọc nhận việc tách riêng. Tiền tạm giữ có thể là hold của lệnh rút.
- Màn nạp đã có giải thích không tự tạo khoản cọc riêng, nhưng tên gọi vẫn có thể làm người dùng hiểu đây là ví ký quỹ riêng.
- **Trạng thái:** chưa đổi tên theo quyết định sản phẩm. Có thể thống nhất dùng “Nạp ví”/“Số dư ví” nếu chưa có nghiệp vụ ký quỹ riêng.
- File liên quan: `worker-balance-card.tsx`, `worker-deposit-screen.tsx`, `worker-balance-screen.tsx` trong feature wallet.

### 7.4. P3 — Còn chữ placeholder ở một số màn hình có nghiệp vụ hoạt động

- Màn nghiệm thu vẫn có dòng **“Chức năng đang được phát triển”** dù thao tác nộp/báo hoàn thành chạy được.
- Đã xác minh đoạn này tồn tại cuối `worker-job-complete-screen.tsx`, có chú thích tương thích automated test cũ. Một số test màn hình khác cũng đang assert placeholder này.
- **Ảnh hưởng:** gây hiểu nhầm về trạng thái tính năng khi demo; không phải bằng chứng thao tác tài chính bị lỗi.
- **Việc tiếp theo:** rà copy/placeholder theo màn hình, bỏ phần không còn đúng và cập nhật test để kiểm tra chức năng thay vì giữ text mẫu.

## 8. Các phần chưa kiểm chứng hoặc chưa được backend hỗ trợ

Các mục này không được đánh dấu PASS chỉ vì unit test hoặc mock đã chạy thành công.

| Phần | Trạng thái và điều kiện cần |
| --- | --- |
| VNPAY Sandbox mở web, nhập OTP, nhận IPN | Chưa chạy. Cần merchant credentials, Return URL và IPN công khai đúng cấu hình. Local hiện giữ mock theo yêu cầu; adapter VNPAY đã có trong BE nhưng chưa được nghiệm thu với merchant thực tế ở đợt này |
| Chuyển tiền ngân hàng thật khi rút | Chưa có provider ngân hàng thật trong module payout hiện tại; đang đăng ký MockPayoutProvider |
| Payout `unknown`/`needs_review` trên native | Có unit coverage liên quan; chưa có artifact native toàn luồng đối soát bằng admin trong đợt này |
| Race claim/cancel, timeout/restart từng bước trên thiết bị | Có unit/API coverage ở các phần tương ứng; chưa chạy đủ ma trận native mọi tổ hợp |
| Upload Cloudinary/camera/gallery thật | Chưa nghiệm thu. Bằng chứng đơn local dùng URL fixture; không coi upload fixture là upload thành công qua nhà cung cấp |
| Matching/OCR/AI thật | Matching vẫn mock; OCR/AI ngoài chưa được nghiệm thu |
| iOS và thiết bị Android vật lý | Chưa chạy; bằng chứng hiện có là hai emulator Android |
| Xoay ngang, font lớn, thiết bị có safe area khác | Chưa kiểm tra trực tiếp sau sửa header |
| FPS/hiệu năng FlashList, stress | Chưa đo; kết quả chức năng không thay thế số đo hiệu năng |
| Backend deploy | Chưa chạy lại toàn bộ ma trận này trên deploy; dữ liệu và cấu hình local không chứng minh trạng thái deploy |

**Không phải lỗi trong phạm vi thiết kế hiện tại:** app khách không có nút rút tiền. Kế hoạch ví HG-71 chỉ cung cấp UI rút cho thợ; app khách nạp điểm, thanh toán và nhận hoàn điểm. Việc thêm rút tiền cho khách là thay đổi phạm vi/nghiệp vụ.

## 9. Danh mục file đang thay đổi

Phạm vi commit sau khi tách công cụ cá nhân còn **28 file so với commit nền**: 26 file sửa và 2 tài liệu mới, đã gồm báo cáo này. Không tính năm file Docker/seed cá nhân, flow Maestro, artifact, `AGENTS.md` root hoặc quy tắc Git local vào phần bàn giao. Danh sách gồm các lượt sửa trước; không gán tất cả là code mới của riêng lượt lập báo cáo.

### 9.1. Docker build context — 1 file

```text
backend/.dockerignore
```

### 9.2. UI, API client và hooks mobile — 10 file

```text
mobile/src/components/ui/app-bar.tsx
mobile/src/features/notifications/notification-screen.tsx
mobile/src/features/orders/customer/screens/customer-orders-screen.tsx
mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx
mobile/src/features/profile/customer/screens/customer-profile-screen.tsx
mobile/src/features/profile/worker/screens/worker-profile-screen.tsx
mobile/src/features/wallet/api/payment.api.ts
mobile/src/features/wallet/customer/components/topup-modal.tsx
mobile/src/features/wallet/hooks/use-topup.ts
mobile/src/features/wallet/hooks/use-withdrawal.ts
```

### 9.3. Unit/component tests — 14 file

```text
mobile/src/app/customer/booking/__tests__/customer-booking-radar-bids-price.test.tsx
mobile/src/app/customer/booking/__tests__/customer-booking-radar-bids-sorting.test.tsx
mobile/src/app/customer/booking/__tests__/customer-booking-radar-cancel.test.tsx
mobile/src/app/customer/booking/__tests__/customer-booking-radar-coords.test.tsx
mobile/src/app/customer/booking/__tests__/customer-booking-radar-locate.test.tsx
mobile/src/app/customer/booking/__tests__/customer-booking-radar-service-name.test.tsx
mobile/src/features/orders/customer/__tests__/customer-order-detail-screen.test.tsx
mobile/src/features/orders/customer/__tests__/customer-orders.test.tsx
mobile/src/features/orders/worker/__tests__/worker-job-detail-screen.test.tsx
mobile/src/features/tracking/__tests__/tracking-e2e-resilience.test.tsx
mobile/src/features/wallet/api/__tests__/wallet-api.test.ts
mobile/src/features/wallet/customer/__tests__/topup-modal.test.tsx
mobile/src/features/wallet/hooks/__tests__/use-topup.test.ts
mobile/src/features/wallet/hooks/__tests__/worker-wallet-hooks.test.tsx
```

### 9.4. Tài liệu — 3 file, gồm báo cáo này

```text
docs/HG-71-mobile-app-payment-wallet/PHAN-7-E2E-TESTING-AND-POLISH.md
docs/HG-71-mobile-app-payment-wallet/LOCAL-DOCKER.md
docs/HG-71-mobile-app-payment-wallet/BAO-CAO-TIEN-DO-VA-LOI-CON-LAI-2026-11-21.md
```

Tổng inventory: **1 backend + 10 runtime mobile + 14 tests + 3 tài liệu = 28 file**. Không có flow/config Maestro hoặc bộ Docker/seed cá nhân trong commit bàn giao.

### 9.5. Maestro cá nhân — ngoài phạm vi commit

- Bộ flow cá nhân: `mobile/.maestro-local/worker-wallet/`, gồm 19 file YAML được giữ trên máy này.
- Hướng dẫn chạy cá nhân: `mobile/.maestro-local/README.local.md`; manifest SHA-256: `mobile/.maestro-local/preserved-files.json`.
- 12 file đã track từ commit cũ trong `mobile/.maestro/` không thay đổi so với HEAD; đợt này không xóa chúng khỏi lịch sử hoặc tạo thay đổi để xóa tracking.
- Ignore và quy tắc cho Codex chỉ nằm ở `.git/info/exclude` và `AGENTS.md` root đã được Git bỏ qua. Không bắt đồng đội áp dụng môi trường cá nhân.

### 9.6. Docker/seed cá nhân — 5 file ngoài phạm vi commit

- `backend/docker-compose.hg71-local.yml`.
- `backend/scripts/hg71-local-docker.ps1`.
- `backend/scripts/hg71-local-generate-keys.mjs`.
- `backend/scripts/hg71-local-seed.mjs`.
- `backend/scripts/hg71-local.env.template`.

Các file vẫn tồn tại tại chỗ để Docker Desktop và việc test trên máy này tiếp tục hoạt động. Chúng được bỏ qua bằng `.git/info/exclude`, không sửa `.gitignore` chung. Hướng dẫn trong `LOCAL-DOCKER.md` mô tả môi trường cá nhân này; người clone repo không có bộ file trên và không cần cài Maestro hoặc dùng setup cá nhân để chạy dự án.

## 10. Thứ tự xử lý tiếp để mở rộng nghiệm thu

1. Thống nhất contract minimum rút tiền với người phụ trách BE; sửa đúng phía theo quyết định, kiểm tra các giá trị biên và quyền sở hữu ngân hàng.
2. Làm sạch cảnh báo/cleanup Jest còn lại và xác nhận tiến trình test tự kết thúc, không cần force exit.
3. Rà thuật ngữ ký quỹ và placeholder để giao diện không mô tả sai khả năng hiện tại.
4. Khi chuyển sang VNPAY, cấu hình merchant sandbox và IPN; chạy thành công/hủy/OTP sai/callback lặp, xác nhận ví chỉ cộng sau kết quả hợp lệ từ backend.
5. Chạy upload thật, payout review/race và kiểm thử native các tình huống mất mạng/restart; bổ sung artifact riêng từng ca.
6. Chạy iOS, Android vật lý, font lớn/safe area và đo hiệu năng nếu nằm trong tiêu chí nghiệm thu.
7. Review thay đổi trên HG-71 local; chỉ commit/push/tạo PR/deploy khi có chỉ đạo tương ứng. Không suy ra quyền phát hành từ kết quả test PASS.

## 11. Cách kiểm tra lại và đọc số liệu

- Chạy lint/TypeScript/Jest bằng các lệnh ở mục 5.
- Chạy stack và kết nối Metro theo [LOCAL-DOCKER.md](./LOCAL-DOCKER.md); nếu cổng đang được tiến trình khác dùng, xác minh tiến trình thay vì dừng tùy ý.
- Trên app khách: Hồ sơ → Quản lý thanh toán → lịch sử giao dịch, mở chi tiết để xem số dư trước/sau.
- Trên app thợ: tab Thu nhập → Rút tiền/Nạp ký quỹ/Chi tiết số dư/Lịch sử. Nút rút ở ví chính, không nằm trong màn chi tiết số dư.
- Các flow tạo nạp/rút mới sẽ thay đổi dữ liệu test; không dùng số dư cố định của báo cáo làm kỳ vọng cho mọi lần chạy sau.
- Các flow cá nhân trong `mobile/.maestro-local/worker-wallet/`, gồm `verify-transaction-balances.yaml` và `verify-settled-payment.yaml`, chỉ dùng trên máy này để kiểm tra lại giao dịch/đơn đã có. Truyền ID và số dư snapshot của chính giao dịch đó; không thêm chúng vào commit.
- Không tạo lại thanh toán chỉ vì một assertion Maestro hoặc URL Return không hiện đúng; trước tiên đọc Payment, Wallet và ledger để xác định tiền đã được xử lý hay chưa.
- Báo cáo này là snapshot của kết quả đã quan sát trên local, không phải xác nhận phát hành hoặc bằng chứng môi trường deploy đã sẵn sàng.
