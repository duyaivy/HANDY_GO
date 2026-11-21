# Hướng dẫn Kỹ thuật Giai đoạn 4: Đấu nối Giao diện Thợ (Worker Job Detail)

> **Mã công việc:** HG-64  
> **Giai đoạn:** 4/5  
> **Tên giai đoạn:** Đấu nối Giao diện Thợ, Đồng bộ Trạng thái Làm lại (Rework) & Nghiệm thu (Completion)  
> **Thời lượng ước tính:** 0.5 ngày  
> **Trạng thái:** ✅ Đã hoàn thành  

---

## 1. Mục tiêu giai đoạn

Nâng cấp màn hình Chi tiết Công việc của Thợ ([`worker-job-detail-screen.tsx`](../../mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx)):
1. Hiển thị dòng thời gian tiến độ thi công đồng bộ với Khách hàng.
2. Tự động phản ứng với sự kiện **Khách yêu cầu làm lại (`rework`)**: Hiển thị lý do thợ cần sửa, tự động mở lại nút cho phép thợ hoàn tất và tải ảnh minh chứng bổ sung.
3. Tự động phản ứng với sự kiện **Khách nghiệm thu thành công (`completed`)**: Hiển thị thông báo chúc mừng, cập nhật trạng thái tiền thù lao đã được chuyển quyết toán.
4. Đảm bảo nguyên tắc bảo mật thông tin (Role-based security & Assigned worker check): Thợ chỉ được xem các sự kiện của đơn hàng mình được phân công chính thức.

---

## 2. Các bước triển khai chi tiết

### Bước 4.1: Nhúng `OrderTrackingTimeline` vào `worker-job-detail-screen.tsx`

#### 📍 Vị trí tệp:
- [`mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx`](../../mobile/src/features/orders/worker/screens/worker-job-detail-screen.tsx)

#### 📝 Các bước chỉnh sửa:
1. **Import Hook & Component:**
   ```typescript
   import { useTrackingSummary } from '@/features/tracking/hooks/use-tracking-summary';
   import { useTrackingEvents } from '@/features/tracking/hooks/use-tracking-events';
   import { OrderTrackingTimeline } from '@/features/tracking/components/order-tracking-timeline';
   ```

2. **Gọi Hooks lấy tiến trình:**
   ```typescript
   const serviceRequestId = job?.serviceRequestId;

   const {
     data: trackingSummary,
     isLoading: isTrackingLoading,
   } = useTrackingSummary(serviceRequestId);

   // Lắng nghe sự kiện SSE với callback xử lý thông báo
   const { connectionStatus } = useTrackingEvents(serviceRequestId, (event) => {
     handleWorkerRealtimeEvent(event);
   });
   ```

3. **Chèn `<OrderTrackingTimeline />` vào phần nội dung chi tiết:**
   - Đặt timeline bên trên danh sách nút hành động của thợ để thợ luôn biết mình đang ở bước nào (Đã xác nhận $\to$ Đang làm $\to$ Chờ khách nghiệm thu).

---

### Bước 4.2: Xử lý Sự kiện Làm lại (Rework) & Nghiệm thu (Completion)

#### 📝 Code hàm xử lý `handleWorkerRealtimeEvent`:
```typescript
const handleWorkerRealtimeEvent = (event: TrackingEventItem) => {
  // 1. Trường hợp Khách hàng yêu cầu sửa chữa (Rework)
  if (
    event.eventType === 'order.status.changed' &&
    event.toStatus === 'in_progress' &&
    (event.reason || event.metadata?.reason)
  ) {
    const reworkReason = event.reason || event.metadata?.reason || 'Khách hàng yêu cầu chỉnh sửa lại công việc';
    Alert.alert(
      '⚠️ Yêu cầu chỉnh sửa công việc',
      `Khách hàng vừa gửi yêu cầu sửa lại:\n\n"${reworkReason}"\n\nVui lòng kiểm tra và hoàn thiện lại công việc.`,
      [{ text: 'Đã hiểu', style: 'default' }]
    );
  }

  // 2. Trường hợp Khách hàng đã duyệt nghiệm thu thành công
  if (event.eventType === 'order.completed') {
    Alert.alert(
      '🎉 Nghiệm thu thành công!',
      'Khách hàng đã xác nhận hoàn thành công việc. Tiền công đang được quyết toán vào ví của bạn.',
      [{ text: 'Tuyệt vời', style: 'default' }]
    );
  }

  // 3. Trường hợp đơn bị tranh chấp / khiếu nại
  if (event.eventType === 'order.disputed' || event.toStatus === 'disputed') {
    Alert.alert(
      '🚨 Đơn hàng đang được khiếu nại',
      'Đơn hàng đang trong trạng thái xem xét tranh chấp bởi Quản trị viên.',
      [{ text: 'Xem chi tiết', style: 'destructive' }]
    );
  }
};
```

---

### Bước 4.3: Tự động Bật/Tắt Nút Hành động của Thợ theo Timeline

Dựa vào `trackingSummary.currentPhase`:
* Nếu `currentPhase === 'ORDER_CONFIRMED'`: Nổi bật nút **"Bắt đầu làm việc"**.
* Nếu `currentPhase === 'ORDER_IN_PROGRESS'`: Nổi bật nút **"Báo hoàn tất & Gửi ảnh minh chứng"**.
* Nếu `currentPhase === 'ORDER_FINISHED'`: Hiển thị trạng thái **"Đang chờ khách hàng nghiệm thu"** (vô hiệu hóa các nút bấm, hiện spinner chờ).
* Nếu `currentPhase === 'COMPLETED'`: Ẩn toàn bộ nút hành động, chuyển sang trạng thái đã hoàn tất.

---

## 3. Lệnh kiểm thử & Xác minh Giai đoạn 4

```bash
# Chạy kiểm thử màn hình việc làm của thợ
cd mobile
pnpm test src/features/orders/worker/__tests__/worker-job-detail-screen.test.tsx
```

---

## 4. Tiêu chuẩn hoàn thành Giai đoạn 4 (Sign-off Checklist)

- [x] Thợ xem được đúng timeline của đơn hàng mình nhận (không lộ thông tin các báo giá khác nhờ Bid Shielding).
- [x] Khi Khách bấm Rework từ máy khách, máy Thợ nhận được Alert tức thì qua SSE và nút "Báo hoàn tất" được kích hoạt lại.
- [x] Khi Khách bấm Nghiệm thu, máy Thợ chuyển trạng thái Đã hoàn thành tự động.
- [x] Sẵn sàng bước vào **Giai đoạn 5 (Kiểm thử toàn trình E2E & Nghiệm thu)**.
