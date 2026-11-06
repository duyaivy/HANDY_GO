# Hướng dẫn Kỹ thuật Giai đoạn 3: Đấu nối Giao diện Khách hàng (Customer Order Detail)

> **Mã công việc:** HG-64  
> **Giai đoạn:** 3/5  
> **Tên giai đoạn:** Đấu nối Giao diện Khách hàng, Thay thế Stepper tĩnh bằng Live Timeline  
> **Thời lượng ước tính:** 1.0 ngày  
> **Trạng thái:** ✅ Đã hoàn thành  

---

## 1. Mục tiêu giai đoạn

Nâng cấp màn hình Chi tiết Đơn hàng của Khách hàng ([`customer-order-detail-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx)):
1. Thay thế khối stepper tĩnh `statusHistory` (chỉ hiển thị vài trạng thái sau khi đã có đơn) bằng **Dòng thời gian toàn diện (`OrderTrackingTimeline`)** hiển thị trọn vẹn 7 cột mốc từ khi gửi yêu cầu tới khi thanh toán.
2. Tích hợp kết nối SSE trực tiếp qua `useTrackingEvents` để **màn hình tự động nhảy trạng thái khi thợ làm việc mà không cần vuốt để tải lại (no pull-to-refresh)**.
3. Đảm bảo cơ chế phòng vệ **Graceful Fallback**: nếu API Tracking bị gián đoạn, tự động rơi về hiển thị `statusHistory` của Order Service để đảm bảo người dùng luôn xem được thông tin.

---

## 2. Các bước triển khai chi tiết

### Bước 3.1: Xây dựng Component `OrderTrackingTimeline`

#### 📍 Vị trí tệp:
- `mobile/src/features/tracking/components/order-tracking-timeline.tsx`
- `mobile/src/features/tracking/components/tracking-milestone-item.tsx`

#### 📝 Code Component `tracking-milestone-item.tsx`:
```tsx
import React from 'react';
import { View, Text } from 'react-native';
import { CheckCircle2, Clock, CircleDot, AlertCircle } from 'lucide-react-native';
import type { TrackingMilestone } from '../types/tracking.types';

interface Props {
  milestone: TrackingMilestone;
  isLast: boolean;
}

export const TrackingMilestoneItem: React.FC<Props> = ({ milestone, isLast }) => {
  const isCompleted = milestone.status === 'completed';
  const isInProgress = milestone.status === 'in_progress';
  const isDisputed = milestone.status === 'skipped' && milestone.key === 'dispute';

  return (
    <View className="flex-row items-start">
      {/* Icon cột mốc */}
      <View className="items-center mr-3">
        <View className="w-8 h-8 rounded-full items-center justify-center bg-neutral-100 dark:bg-neutral-800">
          {isCompleted && <CheckCircle2 size={20} color="#16a34a" />}
          {isInProgress && <CircleDot size={20} color="#2563eb" className="animate-spin" />}
          {isDisputed && <AlertCircle size={20} color="#dc2626" />}
          {!isCompleted && !isInProgress && !isDisputed && <Clock size={18} color="#9ca3af" />}
        </View>
        {/* Đường nối giữa các mốc */}
        {!isLast && (
          <View
            className={`w-0.5 h-10 my-1 ${
              isCompleted ? 'bg-green-500' : 'bg-neutral-200 dark:bg-neutral-700'
            }`}
          />
        )}
      </View>

      {/* Nội dung cột mốc */}
      <View className="flex-1 pb-4">
        <View className="flex-row justify-between items-center">
          <Text
            className={`text-sm font-bold ${
              isInProgress
                ? 'text-blue-600 dark:text-blue-400'
                : isCompleted
                ? 'text-neutral-900 dark:text-white'
                : 'text-neutral-400'
            }`}
          >
            {milestone.title}
          </Text>
          {milestone.reachedAt && (
            <Text className="text-xs text-neutral-400">
              {new Date(milestone.reachedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          )}
        </View>
        <Text className="text-xs text-neutral-500 mt-0.5">{milestone.description}</Text>
      </View>
    </View>
  );
};
```

#### 📝 Code Component `order-tracking-timeline.tsx`:
```tsx
import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Radio } from 'lucide-react-native';
import { TrackingMilestoneItem } from './tracking-milestone-item';
import type { TrackingSummaryResponse } from '../types/tracking.types';

interface Props {
  summary?: TrackingSummaryResponse;
  isLoading: boolean;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
}

export const OrderTrackingTimeline: React.FC<Props> = ({
  summary,
  isLoading,
  connectionStatus,
}) => {
  if (isLoading) {
    return (
      <View className="p-6 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 items-center justify-center">
        <ActivityIndicator size="small" color="#2563eb" />
        <Text className="text-xs text-neutral-400 mt-2">Đang tải tiến trình công việc...</Text>
      </View>
    );
  }

  if (!summary || !summary.milestones || summary.milestones.length === 0) {
    return null;
  }

  return (
    <View className="p-4 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 mb-4 shadow-sm">
      {/* Header trạng thái */}
      <View className="flex-row justify-between items-center mb-4 pb-2 border-b border-neutral-100 dark:border-neutral-800">
        <Text className="text-base font-bold text-neutral-900 dark:text-white">
          Tiến trình công việc
        </Text>

        {/* Live SSE Indicator */}
        <View className="flex-row items-center space-x-1">
          <View
            className={`w-2 h-2 rounded-full mr-1.5 ${
              connectionStatus === 'connected'
                ? 'bg-green-500'
                : connectionStatus === 'reconnecting'
                ? 'bg-amber-400'
                : 'bg-neutral-400'
            }`}
          />
          <Text className="text-[11px] font-semibold text-neutral-500">
            {connectionStatus === 'connected'
              ? 'Trực tiếp'
              : connectionStatus === 'reconnecting'
              ? 'Đang kết nối lại...'
              : 'Ngoại tuyến'}
          </Text>
        </View>
      </View>

      {/* Danh sách các cột mốc */}
      <View className="pl-1">
        {summary.milestones.map((milestone, index) => (
          <TrackingMilestoneItem
            key={milestone.key || index}
            milestone={milestone}
            isLast={index === summary.milestones.length - 1}
          />
        ))}
      </View>
    </View>
  );
};
```

---

### Bước 3.2: Tích hợp vào `customer-order-detail-screen.tsx`

#### 📍 Vị trí tệp:
- [`mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx`](file:///d:/SCHOOL/PBL6/mobile/src/features/orders/customer/screens/customer-order-detail-screen.tsx)

#### 📝 Các bước chỉnh sửa:
1. **Import Hook & Component:**
   ```typescript
   import { useTrackingSummary } from '@/features/tracking/hooks/use-tracking-summary';
   import { useTrackingEvents } from '@/features/tracking/hooks/use-tracking-events';
   import { OrderTrackingTimeline } from '@/features/tracking/components/order-tracking-timeline';
   ```

2. **Khởi tạo Hook trong Component:**
   ```typescript
   // Lấy serviceRequestId từ chi tiết order (hoặc route param)
   const serviceRequestId = order?.serviceRequestId;

   // Lấy dữ liệu summary từ Tracking Service
   const {
     data: trackingSummary,
     isLoading: isTrackingLoading,
     isError: isTrackingError,
   } = useTrackingSummary(serviceRequestId);

   // Kết nối luồng thời gian thực SSE
   const { connectionStatus } = useTrackingEvents(serviceRequestId);
   ```

3. **Thay thế khối `statusHistory` Stepper cũ bằng Logic Fallback:**
   ```tsx
   {/* KHỐI TIẾN TRÌNH THỜI GIAN THỰC */}
   {serviceRequestId && !isTrackingError && trackingSummary ? (
     <OrderTrackingTimeline
       summary={trackingSummary}
       isLoading={isTrackingLoading}
       connectionStatus={connectionStatus}
     />
   ) : (
     /* FALLBACK: Render statusHistory tĩnh cũ nếu Tracking Service không khả dụng */
     statusHistory && statusHistory.length > 0 && (
       <View className="p-4 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 mb-4">
         <Text className="text-base font-bold text-neutral-900 dark:text-white mb-3">
           Lịch sử trạng thái (Dự phòng)
         </Text>
         {/* ... (Khối map statusHistory hiện tại) ... */}
       </View>
     )
   )}
   ```

---

## 3. Lệnh kiểm thử & Xác minh Giai đoạn 3

```bash
# 1. Chạy test giao diện chi tiết đơn hàng khách hàng
cd mobile
pnpm test src/features/orders/customer/__tests__/customer-order-detail-screen.test.tsx
```

---

## 4. Tiêu chuẩn hoàn thành Giai đoạn 3 (Sign-off Checklist)

- [x] Component `OrderTrackingTimeline` hiển thị đẹp mắt, đầy đủ 7 cột mốc.
- [x] Màn hình chi tiết đơn hàng của khách hàng tự động cập nhật khi có sự kiện SSE từ Thợ.
- [x] Nếu ngắt kết nối mạng hoặc server Tracking dừng, màn hình fallback êm dịu về `statusHistory` mà không gặp crash/lỗi màn hình trắng.
- [x] Sẵn sàng chuyển sang **Giai đoạn 4 (Đấu nối giao diện Thợ)**.
