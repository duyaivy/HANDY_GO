# TASK-03: Xử lý Safe Area nội dung Guest

- **Mục yêu cầu:** Mục 3 (HG-63)
- **Giai đoạn:** Giai đoạn 2
- **Độ ưu tiên:** Cao
- **Trạng thái:** Hoàn thành

---

## 1. Mục tiêu & Phạm vi

### Mục tiêu
Khắc phục hiện tượng các thành phần giao diện ở chế độ khách vãng lai (Guest - chưa đăng nhập) bị thanh điều hướng hệ thống (Android navigation bar/gestures, iOS home indicator) hoặc thanh trạng thái (status bar/notch) che khuất, đồng thời loại bỏ các khoảng cách padding cứng (hardcoded padding) gây lỗi hiển thị.

### Phạm vi chốt
- **Bao gồm:**
  - Sửa component `CustomerGuestOverview` (`mobile/src/features/home/customer/components/customer-guest-overview.tsx`) và màn hình trang chủ khách `CustomerHomeScreen`.
  - Rà soát kiểm tra component `WorkerGuestOverview` (`mobile/src/features/home/worker/components/worker-guest-overview.tsx`).
- **Ngoại trừ:** Không can thiệp vào các provider gốc của Expo Router nếu không cần thiết; không bọc chồng các `SafeAreaProvider` gây lỗi double padding.

---

## 2. Hiện trạng & Bằng chứng mã nguồn

1. **`mobile/src/features/home/customer/components/customer-guest-overview.tsx`**:
   - Thẻ bao ngoài cùng là `<View className="flex-1 bg-white dark:bg-neutral-900">`, **không sử dụng `Screen` có safe area** và không có inset an toàn.
   - Bên trong có `ScrollView` với thuộc tính `contentContainerStyle={{ paddingBottom: 100 }}` — dùng con số padding cứng `100` để né nút bấm phía dưới.
   - Nút bấm CTA "Bắt đầu ngay" được định vị tuyệt đối:
     ```tsx
     <View className="absolute inset-x-0 bottom-0 border-t border-neutral-100 bg-white/95 p-4 shadow-lg backdrop-blur-md ...">
     ```
     Điều này khiến nút bấm bị thanh điều hướng 3 nút hoặc thanh gạt Home Indicator của iOS đè lên một phần trên thiết bị thật, đồng thời che mất nội dung cuộn bên dưới nếu chiều cao màn hình ngắn.

2. **`mobile/src/features/home/worker/components/worker-guest-overview.tsx`**:
   - Đã sử dụng `<Screen safeArea={...}>`. Tuy nhiên cần kiểm tra thực tế xem có bị cộng dồn chiều cao tab bar (`bottomTabsHeight`) hay không khi tab bar ở trạng thái ẩn đối với guest.

---

## 3. Thiết kế giải pháp kỹ thuật

### 3.1. Cải tiến `CustomerGuestOverview`
1. **Thay thế thẻ bao ngoài:**
   - Sử dụng component `Screen` chuẩn của dự án:
     ```tsx
     import { Screen } from '@/components/ui';
     // ...
     <Screen safeArea="edges" edges={['top']} className="flex-1 bg-white dark:bg-neutral-900">
     ```
     Hoặc sử dụng `useSafeAreaInsets` từ `react-native-safe-area-context` để áp dụng chính xác `insets.top` cho header và `insets.bottom` cho footer.
2. **Loại bỏ Absolute Footer & Padding 100:**
   - Đưa thanh footer chứa nút "Bắt đầu ngay" trở thành **phần tử cùng cấp (sibling)** đứng ngay sau thẻ `ScrollView` thay vì đặt `absolute`:
     ```tsx
     <View className="flex-1">
       <ScrollView 
         className="flex-1"
         contentContainerStyle={{ paddingBottom: 16 }} // Đưa về padding chuẩn 16px thay vì 100px
         showsVerticalScrollIndicator={false}
       >
         {/* Nội dung danh mục dịch vụ, banner, bảo đảm an tâm */}
       </ScrollView>

       {/* Sticky Bottom Footer cùng cấp, tự động chừa Safe Area cạnh dưới */}
       <View 
         style={{ paddingBottom: Math.max(insets.bottom, 16) }}
         className="border-t border-neutral-100 bg-white/95 px-4 pt-3 dark:border-neutral-800 dark:bg-neutral-900/95"
       >
         <Pressable
           testID="customer-guest-cta-bottom"
           onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
           accessibilityRole="button"
           accessibilityLabel="Bắt đầu ngay"
           className="h-12 w-full flex-row items-center justify-center rounded-full bg-[#F5A524] shadow-md shadow-amber-500/20 active:bg-amber-600"
         >
           <Text className="text-base font-bold text-neutral-900">Bắt đầu ngay</Text>
         </Pressable>
       </View>
     </View>
     ```

### 3.2. Rà soát `WorkerGuestOverview`
- Kiểm tra xem component có đang cộng thêm `bottomTabBarHeight` không. Vì ở màn hình guest thanh tab bar đang được ẩn, việc cộng thêm chiều cao tab bar sẽ tạo ra khoảng trống trắng (white gap) không mong muốn ở đáy màn hình.
- Đảm bảo chỉ dùng `insets.bottom` để bảo vệ nút CTA không bị đè bởi Home Indicator.

### 3.3. Quy tắc tránh xung đột Safe Area
- Tận dụng `SafeAreaProvider` duy nhất được khởi tạo ở root layout (`mobile/src/app/_layout.tsx`).
- Không thêm `SafeAreaProvider` lồng nhau ở các layout con.
- Đối với các phần nền màu (Background): Cho phép nền màu tràn ra toàn bộ màn hình (edge-to-edge), chỉ áp dụng safe area padding cho nội dung tương tác (text, nút bấm, input).

---

## 4. Kế hoạch kiểm thử & Nghiệm thu

### Ca kiểm thử bắt buộc
1. **Thiết bị iOS có tai thỏ / Dynamic Island và Home Indicator (ví dụ iPhone 13/14/15/16):**
   - Header không bị tai thỏ đè lên chữ.
   - Nút "Bắt đầu ngay" có khoảng cách đệm trên thanh Home Indicator, không bị vạch ngang che khuất chữ.
2. **Thiết bị Android dùng 3 nút điều hướng cổ điển (Back, Home, Recents):**
   - Nút "Bắt đầu ngay" nằm hoàn toàn phía trên thanh điều hướng đen, không bị đè nút.
3. **Thiết bị Android dùng cử chỉ vuốt (Gesture Navigation):**
   - Thao tác vuốt từ đáy màn hình không vô tình kích hoạt nút "Bắt đầu ngay".
4. **Cuộn hết nội dung danh sách:**
   - Cuộn xuống dưới cùng của `ScrollView`: Toàn bộ nội dung khối cam ("100.000+ Thợ trên toàn quốc", "Bảo hành 30 ngày") hiển thị đầy đủ, không bị nút "Bắt đầu ngay" che mất dù chỉ 1 dòng.
5. **Không có khoảng trắng kép (No double spacing):**
   - Không xuất hiện khoảng trống trắng kỳ lạ giữa chân trang và đáy màn hình.

### Lệnh chạy test liên quan
```bash
cd mobile
pnpm test customer-home-screen.test.tsx
pnpm test worker-home-screen.test.tsx
```

---

## 5. Checklist thực hiện

- [x] Sửa `customer-guest-overview.tsx`: đưa footer về cùng cấp với `ScrollView`, bỏ `absolute`.
- [x] Bỏ `paddingBottom: 100` cứng trong `ScrollView` của `CustomerGuestOverview`.
- [x] Tích hợp `useSafeAreaInsets` để tính `paddingBottom: Math.max(insets.bottom, 16)` cho footer.
- [x] Rà soát `worker-guest-overview.tsx` đảm bảo không bị khoảng trắng thừa khi ẩn tab bar.
- [x] Chạy kiểm tra test unit và kiểm tra giao diện trên thiết bị thật / máy ảo Android và iOS.
- [x] Chạy `pnpm typecheck` và `pnpm lint`.

