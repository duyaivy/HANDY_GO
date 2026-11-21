# PHẦN 7: KIỂM THỬ TỔNG THỂ & TỐI ƯU HÓA (E2E TESTING & POLISH)

> **Mã công việc:** HG-71-PHAN-7
>
> **Phụ thuộc:** Hoàn thành toàn bộ từ Phần 1 đến Phần 6
>
> **Mục tiêu:** Kiểm tra tích hợp toàn diện trên toàn bộ ứng dụng mobile, đảm bảo không có lỗi hồi quy (regression), vượt qua 100% test suites, và rà soát các quy tắc Vercel React Native Skills trước khi bàn giao.

---

## 1. Danh sách kiểm tra chất lượng (Quality Gates)

### 1.1. Automated Test Suites
Chạy tất cả các bộ test của ứng dụng Mobile:
```powershell
cd mobile
# 1. Chạy test riêng cho feature Wallet & Payment
pnpm test src/features/wallet

# 2. Chạy test luồng điều hướng khách hàng
pnpm test src/app/customer/__tests__/account-payment-flow.test.tsx

# 3. Chạy test toàn bộ mobile
pnpm test
```

### 1.2. Type Checking & Static Code Analysis
Đảm bảo không phát sinh bất kỳ lỗi kiểu dữ liệu hoặc vi phạm lint nào:
```powershell
cd mobile
# Kiểm tra TypeScript
pnpm run type-check

# Kiểm tra Linter
pnpm run lint
```

---

## 2. Checklist Rà Soát Quy Tắc Vercel React Native Skills

Đã đối chiếu `.agents/rules/mobile-skills.md` và skill React Native của repository. Rà nguồn tập trung vào HG-71 Customer và các điểm tích hợp đơn; các automated gates áp dụng toàn bộ mobile. Chi tiết đối chiếu theo file nằm trong [Walkthrough](./WALKTHROUGH.md).

| STT | Quy tắc bắt buộc | Trạng thái kiểm tra | Giải pháp áp dụng |
|:---:|---|:---:|---|
| 1 | **Hiển thị hình ảnh** | Đã kiểm tra | Luôn sử dụng `expo-image` (`Image` từ `@/components/ui/image`), tuyệt đối không dùng `Image` từ `react-native`. |
| 2 | **Tránh bẫy render Falsy `&&`** | Đã kiểm tra | Thay thế toàn bộ `condition && <Comp />` bằng `condition ? <Comp /> : null` khi `condition` có thể là số `0`, chuỗi rỗng `""`, hoặc NaN. |
| 3 | **Bọc chữ trong Text Component** | Đã kiểm tra | Mọi nhãn, số tiền, ngày giờ, dấu phân cách đều nằm trong component `<Text>`. |
| 4 | **Nút bấm & Tương tác** | Đã kiểm tra | Dùng `Pressable` hoặc `Button` UI component thay vì `TouchableOpacity`. |
| 5 | **Hiệu năng cuộn Danh sách** | Đã kiểm tra | Sử dụng `@shopify/flash-list` cho danh sách lịch sử giao dịch; các `TransactionItem` đều được bọc `React.memo`. |
| 6 | **Quản lý SafeArea & Insets** | Đã kiểm tra | Mọi màn hình đều dùng component `<Screen safeArea>` hoặc xử lý insets từ `react-native-safe-area-context`. |
| 7 | **Đường dẫn Điều hướng** | Đã kiểm tra | Sử dụng các hằng số tập trung từ `RouteNames` trong `constants/route-names.ts`. |

---

## 3. Kịch bản Kiểm thử Thủ công Chi tiết (Manual Testing Scenarios)

### Kịch bản 1: Mở màn hình Quản lý Ví và xem số dư
1. Đăng nhập ứng dụng với tài khoản Customer.
2. Tại thanh điều hướng dưới, chọn tab **Cá nhân (Profile)**.
3. Bấm vào mục **"Phương thức thanh toán"** (`testID="profile-payment-item"`).
4. **Kết quả mong đợi**:
   * Màn hình mở ra tức thì không bị giật lag.
   * Thẻ ví hiển thị số dư khả dụng từ server (ví dụ `150.000 đ`).
   * Bấm icon mắt: số dư ẩn thành `••••••`, bấm lại thì hiện lại.
   * Hiển thị danh sách 3 giao dịch mới nhất bên dưới.

### Kịch bản 2: Nạp tiền vào Ví điểm
1. Tại màn hình Quản lý thanh toán, bấm nút **"+ Nạp ví"**.
2. Modal nạp tiền xuất hiện:
   * Bấm chọn chip gợi ý `100.000đ` → ô nhập hiển thị đúng `100.000`.
   * Thử nhập `5.000` → hệ thống báo tối thiểu 10.000đ và vô hiệu hóa nút nạp.
   * Nhập lại `50.000`.
3. **Nhánh VNPAY**: Bấm nút **"Thanh toán qua Cổng VNPAY"**:
   * Trình duyệt điện thoại mở link VNPAY checkout.
4. **Nhánh sandbox thay thế bước 3**: Trong dev và backend bật mock, bấm **"⚡ [Sandbox] Giả lập nạp thành công"** trực tiếp:
   * `credit_pending` vẫn đang chờ cộng điểm, chưa báo thành công.
   * Chỉ khi `completed`, ứng dụng báo thành công và làm mới số dư thêm `50.000 đ`.

### Kịch bản 3: Xem toàn bộ Lịch sử Giao dịch & Lọc
1. Tại màn hình Quản lý thanh toán, bấm **"See all >"** tại mục Lịch sử giao dịch.
2. Màn hình Lịch sử giao dịch mở ra với danh sách cuộn:
   * Chuyển tab sang **"Nạp tiền"**: danh sách chỉ hiển thị các giao dịch nạp (màu xanh kèm dấu `+`).
   * Chuyển tab sang **"Thanh toán"**: danh sách chỉ hiển thị các giao dịch trừ tiền dịch vụ.
3. Bấm vào 1 giao dịch bất kỳ:
   * Modal chi tiết hiển thị mã giao dịch, số tiền, trạng thái, thời gian và mô tả. API hiện chưa cung cấp số dư trước/sau nên hai dòng này ghi “Chưa được cung cấp”, không suy ra số dư giả.

### Kịch bản 4: Nghiệm thu và Thanh toán Đơn hàng bằng Điểm ví
1. Khách hàng vào một đơn việc đang ở trạng thái `awaiting_customer_confirmation`.
2. Bấm nút **`🎉 Nghiệm Thu & Thanh Toán`**.
3. Modal thanh toán đơn việc mở ra:
   * Hiển thị tổng chi phí đơn việc.
   * Chọn phương thức **"Ví điểm HandyGo"** (nếu ví đủ tiền):
     * Bấm **"Xác nhận thanh toán"**.
     * Hệ thống trừ điểm ví và hiển thị thông báo thành công.
     * Trạng thái đơn việc chuyển sang `completed` và `paid`.
   * *(Nếu ví không đủ tiền)*:
     * Cảnh báo số dư thiếu xuất hiện kèm nút nạp nhanh.
     * Nạp bù thành công và tiếp tục thanh toán đơn việc.

---

## 4. Tiêu chí Bàn giao (Sign-off Criteria)
- [x] 7 phần có triển khai và bằng chứng automated độc lập; commit Phần 1–6 được liệt kê trong [README](./README.md).
- [x] Tại lần nghiệm thu ngày 20/11, backend chưa thay đổi. Phạm vi bổ sung ngày 21/11 có xác minh ngân hàng và snapshot số dư; xem báo cáo hiện tại. Không dùng kết quả cũ này để khẳng định toàn nhánh không sửa backend.
- [x] Toàn bộ automated tests đạt; TypeScript và lint toàn ứng dụng đạt. Báo cáo máy đọc được ở [quality-gates.json](./evidence/quality-gates.json).
- [x] Có [Walkthrough](./WALKTHROUGH.md) với kịch bản, assertion, ma trận từng phần, bằng chứng test và giới hạn native.

## 5. Nội dung thực hiện ở Phần 7

- Thêm `wallet-payment-journey.test.tsx`: hành trình qua Quản lý thanh toán → nạp/polling → lịch sử/lọc/chi tiết → phương thức mặc định → nghiệm thu/nạp bù/trả điểm trong cùng cache. API/storage mock có trạng thái, số dư cuối bằng 0 và chỉ có một lệnh trừ điểm khi bấm liên tiếp.
- Thêm regression cho thông báo top-up cũ khi đổi mệnh giá, và cho tracking khi bỏ request đang kết nối. Sửa render chuỗi rỗng ở nút chat của chi tiết đơn; dùng RouteNames/params.
- Loại hai cảnh báo lint có sẵn mà không tắt rule: chuyển resolver proposal sang module riêng (giữ nguyên thuật toán/test), suy ra trạng thái disconnected khi tracking không còn request thay vì set state trực tiếp trong effect.
- Chỉnh test chat realtime dùng async `act` để chờ cập nhật do sự kiện SSE trước assertion và sự kiện kế tiếp; không thay đổi logic bidding hoặc nới lỏng assertion.
- Cập nhật index và quy tắc kỹ thuật theo contract đã xác minh: `point`, payment của đơn completed chưa chắc paid, UUID do mobile giữ cho top-up còn debit idempotent theo attempt ở backend; sandbox cần đồng thời dev UI và backend mock.
- Tạo Walkthrough và evidence JSON từ output Jest thực tế; không tạo ảnh giao diện giả hoặc gọi giao dịch VNPAY thật.

## 6. Phạm vi nghiệm thu

Đã xác minh automated ở runtime Jest với API mock, TypeScript và ESLint. Các lệnh kiểm tra và kết quả nằm trong evidence. Kịch bản thủ công phía trên được giữ để chạy trên thiết bị; chưa có bằng chứng native Android/iOS, FPS FlashList hoặc VNPAY/IPN với backend đang phục vụ. Checklist native trong walkthrough được để chưa đánh dấu, không coi test mock là E2E thiết bị.

### Kết quả cuối ngày 20/11/2026

| Gate | Kết quả |
| --- | --- |
| Wallet | 16 suite / 84 test đạt |
| Navigation A–F | 1 suite / 14 test đạt |
| Toàn bộ mobile | 118 suite / 880 test đạt; 0 failed, 0 pending |
| TypeScript | Exit 0 |
| ESLint | Exit 0; 0 lỗi, 0 cảnh báo |
| Backend | Không có thay đổi so với baseline trước HG-71 |

### Bổ sung ngày 21/11/2026 — Android với Docker local

- Maestro chỉ là công cụ kiểm thử cá nhân trên máy local, không phải yêu cầu cài đặt của đồng đội hoặc CI. Các flow cá nhân nằm ở `mobile/.maestro-local/`, không đưa vào commit; phần dưới chỉ bàn giao kết quả đã quan sát.
- Toàn bộ mobile **125 suites / 930 tests PASS** sau khi sửa mock và teardown của nhóm Radar/chi tiết/hủy đơn; không bỏ qua bài test hoặc nới assertion.
- Sửa safe area bị cộng hai lần trong header; đã kiểm tra vị trí header trên 8 màn hình khách/thợ bằng Android UI hierarchy.
- Thông báo nghiệm thu của thợ không còn khẳng định tiền đang vào ví trước khi có trạng thái thanh toán.
- Đã đối chiếu nạp/rút mock, hủy và payout thất bại, Point/cash, replay chống cộng/trừ lặp và số dư ledger với backend Docker local. Chi tiết số tiền, ID, artifact và các giới hạn nằm tại [LOCAL-DOCKER.md](./LOCAL-DOCKER.md#nghiệm-thu-bổ-sung-local--21112026).
- Đây là bằng chứng Android/local bổ sung cho kết quả Jest ở trên; không đánh dấu thay cho nghiệm thu VNPAY merchant/IPN, iOS hoặc backend deploy.
