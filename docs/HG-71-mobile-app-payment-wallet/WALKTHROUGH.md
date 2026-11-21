# Walkthrough nghiệm thu HG-71

> Bằng chứng lịch sử ngày 20/11/2026. Kết quả Android/local, backend và phạm vi bàn giao cập nhật nằm trong [báo cáo ngày 21/11](./BAO-CAO-TIEN-DO-VA-LOI-CON-LAI-2026-11-21.md); các nhận định và checklist bên dưới chỉ phản ánh thời điểm ghi nhận.

Ngày kiểm tra: 20/11/2026 (Asia/Bangkok). Nhánh: `feature/HG-71-mobile-app-payment-wallet`.

## Kết quả và cách tái lập

Bằng chứng máy đọc được: [quality-gates.json](./evidence/quality-gates.json). Dữ liệu test được rút trực tiếp từ báo cáo JSON của Jest, gồm tổng số và trạng thái từng suite; không bao gồm token, tài khoản hay dữ liệu backend thật.

Kết quả cuối: **118/118 suite, 880/880 test đạt**, không failed/pending. Gate Wallet riêng đạt 16 suite / 84 test; navigation A–F đạt 14/14. TypeScript và ESLint exit 0; lint không còn lỗi/cảnh báo. Diff backend từ baseline `70f5ee2` rỗng.

Chạy tại `mobile/`:

```powershell
pnpm test src/features/wallet --runInBand
pnpm test src/app/customer/__tests__/account-payment-flow.test.tsx --runInBand
pnpm test --runInBand
pnpm run type-check
pnpm run lint
```

Jest script hiện tại dùng `--forceExit`. Các cảnh báo log từ test API/network hoặc mock không phải là lỗi test; không sửa script để che lỗi hoặc bỏ qua suite.

## Hành trình kiểm thử xuyên màn hình

[wallet-payment-journey.test.tsx](../../mobile/src/features/wallet/customer/__tests__/wallet-payment-journey.test.tsx) mount các màn hình thật với cùng QueryClient. API và storage được mô phỏng có trạng thái để phản hồi của màn hình trước ảnh hưởng đúng tới màn hình sau. FlashList được thay bằng FlatList trong bài test này để điều khiển danh sách trong Jest; đây là integration journey, không phải test native device.

| Bước | Hành động được kiểm thử | Kết quả được assert |
| --- | --- | --- |
| 1 | Mở Quản lý thanh toán | Ví có 100.000 đ từ API mock |
| 2 | Bấm mắt ẩn/hiện | Số dư được che và hiện lại |
| 3 | Nhập 5.000 rồi chọn 50.000 | Nút nạp bị khóa khi dưới hạn mức |
| 4 | Sandbox nạp 50.000 | `credit_pending` → polling → `completed`; số dư 150.000 đ |
| 5 | See all → tab Nạp tiền → item | Đúng giao dịch vừa nạp và mã chi tiết |
| 6 | Back → Linked → chọn Tiền mặt | Lựa chọn mặc định lưu theo tài khoản |
| 7 | Mở modal đơn 200.000 đ | Mặc định Tiền mặt được dùng lại; chọn Ví thiếu 50.000 đ |
| 8 | Nạp bù rồi đóng nội dung nạp | Polling vẫn chạy, số dư lên 200.000 đ; giữ nguyên dịch vụ/thợ/đơn |
| 9 | Bấm xác nhận hai lần | Nghiệm thu một lần, trừ điểm một lần, đúng payment của đơn, số dư mock còn 0 |

Nút mở đơn trong test là thành phần của harness điều hướng kiểm thử. Tích hợp nút nghiệm thu trên màn hình chi tiết đơn thật được kiểm tra riêng bởi [customer-order-detail-screen.test.tsx](../../mobile/src/features/orders/customer/__tests__/customer-order-detail-screen.test.tsx).

## Bằng chứng độc lập từng phần

| Phần | Test/chứng cứ chính | Điều kiện biên |
| --- | --- | --- |
| 1 | `wallet-api.test.ts`, `formatters.test.ts` | Route/body đúng DTO, số nguyên vượt Number.MAX_SAFE_INTEGER |
| 2 | Các test `use-wallet`, `use-topup`, `use-wallet-transactions`, `use-order-payment` | 404, retry giữ key, không poll chồng, timeout 40 lần, hủy timer, debit trùng |
| 3 | `wallet-balance-card`, `topup-modal`, `customer-payment-screen` | Che số dư, hạn mức, checkout URL, sandbox, invalidation balance |
| 4 | `customer-transaction-history-screen`, `transaction-item`, `transaction-detail-modal` | Phân trang trùng ID, phản hồi muộn, filter, retry, trạng thái thực |
| 5 | `customer-link-account-screen` | Mặc định per-user, remount, dữ liệu lưu sai, ví đóng băng/404, Back |
| 6 | `order-payment-modal`, `order-payment-card`, test chi tiết đơn | Snapshot đổi giá, tiền mặt pending, processing/failed không báo paid, nạp bù |
| 7 | Toàn bộ Jest + journey + TypeScript + ESLint | Hồi quy Customer/Worker/chat/tracking/auth/API toàn ứng dụng |

## Rà Vercel React Native Skills

| Quy tắc | Đối chiếu nguồn hiện tại |
| --- | --- |
| Ảnh | Component HG-71 dùng SVG/Text cho icon, không thêm bitmap. Wrapper `components/ui/image.tsx` dùng `expo-image`; gallery đơn hiện có dùng wrapper |
| Falsy JSX | Các component customer wallet dùng ternary; điều kiện `serviceRequestId` của nút chat trong chi tiết đơn được đổi sang ternary |
| Text | Nhãn, số dư, ngày giờ, ký hiệu đều trong Text |
| Tương tác | Pressable/Button; radio có trạng thái accessibility; nút submit khóa ngay bằng ref và trạng thái busy |
| Danh sách | FlashList 2, TransactionItem memoized, renderItem ổn định, key theo ID, loại trùng giữa trang |
| Safe area/modal | Screen safeArea ở các màn hình, ScrollView có inset adjustment trong modal; nạp bù dùng chung native Modal với thanh toán |
| Route | Các điều hướng payment/history/support dùng RouteNames; nút chat từ chi tiết đơn cũng chuyển sang RouteNames và params |
| Lint | Tách resolver proposal khỏi file component để giữ Fast Refresh; trạng thái disconnected khi bỏ request được suy ra thay vì set state trực tiếp trong effect |

## Các chỉnh sửa polish trong Phần 7

- Khi đổi số tiền, modal nạp không hiển thị thông báo thành công của số tiền trước đó; có regression test.
- Nút lịch sử chat không render chuỗi rỗng ngoài Text và sử dụng route tập trung.
- Resolver proposal giữ nguyên thuật toán, chỉ chuyển file; test resolver/component hiện có vẫn chạy.
- Hook tracking trả disconnected ngay khi không còn request và giải phóng stream; có regression test.
- Test chat realtime chờ `act` bất đồng bộ sau từng sự kiện SSE trước khi kiểm tra UI/phát sự kiện tiếp theo; giữ nguyên assertion báo giá cập nhật và ẩn nút khi withdrawn, không thêm refetch thủ công hoặc bỏ test.
- README và quy tắc nghiệp vụ được đối chiếu với contract API hiện tại để tài liệu bàn giao tái lập được.

## Giới hạn và checklist native còn cần thực hiện

`adb devices -l` tại thời điểm bắt đầu không có thiết bị kết nối; AVD CUSTOMER tồn tại nhưng không được dùng làm bằng chứng test native. Không có phiên đăng nhập Customer/backend test được cung cấp cho kiểm thử native trong chat này. Không phát sinh giao dịch VNPAY thật.

Các kịch bản ở Phần 7 có bằng chứng automated phía trên. Những kiểm tra sau chưa được thực hiện trên thiết bị và không được đánh dấu là đã pass:

- [ ] Android và iOS: xem layout sáng/tối, safe area, bàn phím, cỡ chữ lớn, Back/đóng modal.
- [ ] Native FlashList: cuộn/phân trang với dữ liệu lớn và đo FPS.
- [ ] Mở trình duyệt VNPAY thật, quay lại app, nhận settlement qua backend/IPN.
- [ ] Thanh toán điểm trên backend đang phục vụ; xác nhận tiền mặt từ tài khoản Worker.

Cách chạy: đăng nhập Customer test, làm lần lượt bốn kịch bản trong Phần 7; nhánh sandbox chọn trực tiếp nút simulate khi backend bật mock, nhánh VNPAY chọn checkout thật. Ghi thiết bị/OS, build SHA, thời gian, ảnh hoặc video, payment/top-up ID và kết quả vào biên bản native riêng. Không ghi JWT/OTP/số thẻ trong evidence.
