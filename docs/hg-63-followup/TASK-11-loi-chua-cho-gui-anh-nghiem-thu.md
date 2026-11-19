# TASK-11: Sửa lỗi chưa cho gửi ảnh nghiệm thu công việc (Quy chuẩn ORD-10)

> **Trạng thái:** 📝 **Đã lập đặc tả kỹ thuật & Sẵn sàng triển khai**  
> **Mức độ ưu tiên:** 🔴 **Cao (Chặn luồng hoàn thành đơn hàng & thanh toán)**  
> **Phạm vi ảnh hưởng:** Màn hình nghiệm thu công việc của Thợ (`/worker/jobs/[id]/complete`), Chi tiết đơn việc thợ (`/worker/jobs/[id]`) và Đồng bộ minh chứng sang Khách hàng (`/customer/orders/[id]`)

---

## 1. Mục tiêu & Hiện tượng thực tế

### 1.1. Hiện tượng ghi nhận từ người dùng & QA
- Khi thợ thi công xong đơn việc và vào màn hình **Nghiệm thu công việc** (`/worker/jobs/[id]/complete`):
  1. **Không thể chụp ảnh hoặc chọn ảnh thật từ máy:** Nút **"+ Thêm ảnh"** (`add-evidence-photo-btn`) không kích hoạt máy ảnh thiết bị (Camera) hay mở thư viện ảnh (Photo Gallery). Thợ thực tế trên điện thoại không có cách nào tải ảnh hiện trường công việc vừa hoàn thành lên hệ thống.
  2. **Nút gửi ảnh / báo hoàn thành bị lỗi hoặc không phản hồi dữ liệu thật:** Khi nhấn nút *"Nộp Bằng Chứng & Báo Hoàn Thành (ORD-10)"*, hệ thống không tải được ảnh thực tế lên máy chủ hoặc báo lỗi không hợp lệ, khiến đơn hàng không thể chuyển trạng thái sang **Chờ nghiệm thu** (`awaiting_customer_confirmation`).
  3. **Khách hàng không thấy ảnh minh chứng:** Do ảnh nghiệm thu chưa được nộp thành công vào cơ sở dữ liệu (`order_evidences`), khách hàng khi mở màn hình Chi tiết đơn hàng không có bằng chứng hình ảnh để đối chiếu trước khi bấm xác nhận thanh toán.

### 1.2. Yêu cầu sau khi xử lý
- **Tích hợp Camera & Thư viện ảnh native:** Cho phép thợ chụp trực tiếp tại hiện trường hoặc chọn tối đa 5 ảnh từ bộ nhớ máy thông qua `expo-image-picker`.
- **Đường ống upload ảnh 2 giai đoạn (Two-phase Upload Pipeline):**
  - Giai đoạn 1: Nén và tải ảnh cục bộ (`file://...`) lên Cloud Storage qua `OrdersApi.uploadImage` để nhận URL công khai an toàn.
  - Giai đoạn 2: Ghi nhận biên bản bằng chứng vào bảng `order_evidences` của `order-service` qua `OrdersApi.uploadEvidence`.
- **Hoàn tất chuyển đổi trạng thái ORD-10:** Sau khi nộp đủ ít nhất 1 ảnh minh chứng hợp lệ, tự động kích hoạt `OrdersApi.finishOrder(jobId)` để chuyển trạng thái đơn hàng sang `awaiting_customer_confirmation`.
- **Hiển thị tiến trình trực quan (Upload Progress Indicator):** Có trạng thái loading/spinner rõ ràng theo từng ảnh, hỗ trợ xóa ảnh chụp hỏng và thử lại khi kết nối mạng chập chờn.

---

## 2. Phân tích nguyên nhân kỹ thuật gốc rễ (Root Cause Analysis)

### 2.1. Nút thêm ảnh chỉ dùng dữ liệu Mock tĩnh (Hardcoded Mock Assets)
- Trong [`worker-job-complete-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/worker/screens/worker-job-complete-screen.tsx) (dòng 51-54):
  ```ts
  const handleAddSampleEvidence = () => {
    const nextUrl = SAMPLE_EVIDENCE_URLS[evidenceUrls.length % SAMPLE_EVIDENCE_URLS.length];
    setEvidenceUrls(prev => [...prev, nextUrl]);
  };
  ```
  Hàm này chỉ luân phiên thêm 2 đường dẫn ảnh Unsplash cố định trên mạng (`SAMPLE_EVIDENCE_URLS`). Mã nguồn hoàn toàn chưa gọi API của thư viện `expo-image-picker`.

### 2.2. Thiếu bước chuyển đổi Local URI sang Cloud Storage URL
- Backend `order-service` tại [`orders.service.ts`](file:///d:/SCHOOL/PBL6/backend/apps/order-service/src/orders/orders.service.ts) (L930-965) quy định:
  ```ts
  // Yêu cầu mediaUrl phải là URL web (Cloudinary/S3 HTTP URL)
  const evidence = await tx.orderEvidence.create({
    data: {
      orderId,
      mediaType: dto.mediaType,
      mediaUrl: dto.mediaUrl, // URL hợp lệ
      description: dto.description,
    },
  });
  ```
- Nếu truyền thẳng đường dẫn nội bộ máy (`file:///var/mobile/...` trên iOS hoặc `file:///data/user/...` trên Android), backend sẽ không thể lưu trữ hay phục vụ hiển thị cho khách hàng.
- Màn hình `worker-job-complete-screen.tsx` hiện tại chưa gọi qua helper `OrdersApi.uploadImage(localUri, 'order_evidence')` để đẩy file lên kho lưu trữ trước khi ghi record evidence.

### 2.3. Ràng buộc trạng thái đơn hàng nghiêm ngặt phía Backend
- Backend kiểm tra điều kiện tiên quyết:
  ```ts
  if (order.status !== 'in_progress') {
    throw new ConflictException({
      code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION,
      message: `Evidence can only be uploaded while the order is in 'in_progress' status. Current status is '${order.status}'.`,
    });
  }
  ```
- Nếu thợ chưa bấm nút *"2. Bắt Đầu Thi Công (ORD-07)"* trên màn hình chi tiết công việc (đơn vẫn ở trạng thái `confirmed`), hoặc nút bắt đầu bị khóa do kiểm tra giờ hẹn (`isTooEarly`), thao tác gửi ảnh nghiệm thu sẽ bị backend trả về mã lỗi HTTP 409 Conflict.

### 2.4. Khối xử lý ngoại lệ nuốt lỗi (Silent Fallback Masking)
- Khi gọi `handleFinishJob`, khối `catch (err: any)` chỉ log ra console và hiển thị thông báo chung *"Đã ghi nhận báo cáo hoàn tất công việc!"* ngay cả khi API nộp ảnh bị lỗi, khiến thợ lầm tưởng ảnh đã được gửi thành công trong khi đơn thực tế vẫn chưa có ảnh nghiệm thu nào.

---

## 3. Kế hoạch giải quyết kỹ thuật (Technical Solution Architecture)

### 3.1. Tích hợp `expo-image-picker` với ActionSheet đa năng
- Tạo modal / ActionSheet khi thợ bấm **"+ Thêm ảnh"**:
  1. 📸 **Chụp ảnh hiện trường ngay:** Gọi `ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false })`.
  2. 🖼️ **Chọn ảnh từ thư viện:** Gọi `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 0.8 })`.
- Xử lý kiểm tra và yêu cầu quyền truy cập Camera/Photos (`requestCameraPermissionsAsync`, `requestMediaLibraryPermissionsAsync`).

### 3.2. Cấu trúc dữ liệu quản lý danh sách ảnh đính kèm
- Thay thế mảng chuỗi đơn thuần bằng interface đầy đủ thông tin:
  ```ts
  export type EvidenceImageItem = {
    id: string;
    localUri: string;
    remoteUrl?: string;
    status: 'pending' | 'uploading' | 'completed' | 'error';
    progress: number;
    errorMessage?: string;
  };
  ```

### 3.3. Quy trình tải ảnh tuần tự & Nộp biên bản hoàn thành (Execution Flow)
```
[Thợ chọn/chụp ảnh] ──► Thêm vào danh sách với status: 'pending'
                               │
                               ▼
            OrdersApi.uploadImage(localUri, 'order_evidence')
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
      [Thành công]                           [Thất bại]
status: 'completed', remoteUrl          status: 'error' ──► Hiển thị nút "Thử lại"
            │
            ▼ (Thợ nhấn "Nộp Bằng Chứng & Báo Hoàn Thành")
Kiểm tra tối thiểu $\ge 1$ ảnh trạng thái 'completed'
            │
            ▼
Vòng lặp Promise.all: OrdersApi.uploadEvidence(jobId, { mediaUrl, mediaType: 'image', description })
            │
            ▼
OrdersApi.finishOrder(jobId) ──► Đơn chuyển sang awaiting_customer_confirmation
            │
            ▼
Thông báo thành công & Điều hướng về danh sách công việc
```

### 3.4. Cập nhật giao diện người dùng (UI/UX Upgrades)
- **Grid ảnh minh chứng thông minh:**
  - Hiển thị thumbnail sắc nét kèm badge trạng thái (Đang tải: Spinner tròn; Hoàn tất: Checkmark xanh; Lỗi: Icon cảnh báo đỏ).
  - Nút bấm `✕` góc trên từng ảnh để thợ chủ động xóa ảnh không ưng ý.
  - Nút *"Thử lại"* ngay trên ảnh nếu quá trình upload gặp sự cố mạng.
- **Khóa an toàn nút Nộp:** Nút *"Nộp Bằng Chứng & Báo Hoàn Thành"* chỉ được kích hoạt (enabled) khi có ít nhất 1 ảnh đã tải lên máy chủ thành công (`status === 'completed'`) và không có ảnh nào đang trong trạng thái tải dở dang (`status === 'uploading'`).

---

## 4. Các file ảnh hưởng khi triển khai

| STT | File đường dẫn | Vai trò & Nội dung thay đổi |
|:---:|:---|:---|
| 1 | [`mobile/src/features/orders/worker/screens/worker-job-complete-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/worker/screens/worker-job-complete-screen.tsx) | Thay thế `handleAddSampleEvidence` bằng `ImagePicker` (chụp/chọn ảnh thật), xử lý pipeline upload ảnh lên storage trước khi nộp evidence và báo finish order. |
| 2 | [`mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx) | Đảm bảo nút chuyển sang màn hình nộp ảnh chỉ khả dụng khi đơn hợp lệ và nhắc nhở thợ bấm "Bắt đầu làm việc" trước khi nộp ảnh. |
| 3 | [`mobile/src/features/orders/hooks/use-worker-jobs.ts`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/hooks/use-worker-jobs.ts) | Bổ sung hàm tiện ích hỗ trợ upload đồng thời nhiều bằng chứng và làm mới cache query chi tiết đơn hàng sau khi hoàn tất. |
| 4 | [`mobile/src/features/orders/worker/__tests__/worker-jobs-screen.test.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/worker/__tests__/worker-jobs-screen.test.tsx) | Bổ sung test case kiểm thử chọn ảnh qua `ImagePicker`, nộp ảnh bằng chứng và xác nhận đơn chuyển sang trạng thái chờ nghiệm thu. |

---

## 5. Kịch bản kiểm thử & Tiêu chuẩn nghiệm thu (Acceptance Checklist)

- [ ] **Kịch bản 1: Chọn ảnh từ thư viện và chụp ảnh từ Camera**
  1. Mở màn hình Nghiệm thu công việc (`/worker/jobs/[id]/complete`).
  2. Bấm nút **"+ Thêm ảnh"**.
  3. Chọn nguồn ảnh (Camera hoặc Thư viện).
  4. **Kỳ vọng:** Ảnh chụp/chọn được hiển thị trên giao diện; có thanh/vòng tròn tiến trình tải lên máy chủ.
- [ ] **Kịch bản 2: Xóa ảnh đã chọn và chụp lại**
  1. Bấm nút `✕` trên góc thẻ ảnh vừa chọn.
  2. **Kỳ vọng:** Ảnh được gỡ khỏi danh sách; số lượng ảnh đếm (`Ảnh minh chứng (n)`) giảm tương ứng.
- [ ] **Kịch bản 3: Chặn nộp khi chưa có ảnh nào (ORD-10)**
  1. Xóa toàn bộ ảnh trong danh sách (số lượng = 0).
  2. Bấm *"Nộp Bằng Chứng & Báo Hoàn Thành"*.
  3. **Kỳ vọng:** Hiển thị cảnh báo bắt buộc đính kèm ít nhất 1 ảnh minh chứng hoàn thành; không cho phép gửi.
- [ ] **Kịch bản 4: Nộp thành công và đồng bộ sang khách hàng**
  1. Đính kèm 1-2 ảnh thật và điền ghi chú thi công.
  2. Bấm *"Nộp Bằng Chứng & Báo Hoàn Thành"*.
  3. **Kỳ vọng:** Ảnh được lưu thành công trên máy chủ; đơn hàng chuyển sang trạng thái `awaiting_customer_confirmation` (*Chờ nghiệm thu*).
  4. Mở tài khoản Khách hàng xem đơn hàng này: Các ảnh thợ vừa nộp xuất hiện đầy đủ trong phần *Bằng chứng thi công* và có thể chạm vào để phóng to xem rõ nét.

