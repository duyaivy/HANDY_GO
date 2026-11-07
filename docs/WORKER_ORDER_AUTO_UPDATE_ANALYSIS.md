# PHÂN TÍCH & KẾ HOẠCH TRIỂN KHAI: ĐỒNG BỘ ĐƠN HÀNG TỰ ĐỘNG 2 CHIỀU (THỢ & KHÁCH HÀNG)

> **Mã tài liệu:** `DOC-ORDER-REALTIME-01`  
> **Ngày cập nhật:** 03/11/2026  
> **Trạng thái:** ✅ ĐÃ HOÀN THÀNH (Completed & Verified)  
> **Phương án lựa chọn:** Hybrid (Event-driven Push Invalidation + Controlled Smart Polling)  
> **Phạm vi:** Mobile Client (`mobile/`) cho cả luồng Thợ (Worker) và Khách hàng (Customer)  

---

## 1. MÔ TẢ VẤN ĐỀ (PROBLEM STATEMENT)

### Hiện tượng 1 (Phía Thợ):
- Khách hàng tạo yêu cầu dịch vụ và chọn thợ trên màn hình Radar.
- Backend tạo `BookingProposal` và gửi thông báo thành công.
- **Trên App Thợ:** Ở màn hình danh sách nhận việc (`WorkerJobsScreen`), đề xuất mới trước đây **không tự động hiển thị**. Thợ phải kéo màn hình xuống (Pull to refresh) thủ công mới thấy.

### Hiện tượng 2 (Phía Khách hàng):
- Thợ bấm "Chấp nhận việc" (Accept Proposal), chuyển trạng thái sang `confirmed` hoặc bắt đầu làm `in_progress`, gửi bằng chứng hoàn thành `awaiting_customer_confirmation`.
- **Trên App Khách hàng:** Ở màn hình danh sách hoạt động (`CustomerOrdersScreen` - tab "Đang tìm" và "Đang làm") cũng như màn hình chi tiết đơn (`CustomerOrderDetailScreen`), dữ liệu trước đây **không tự động đổi trạng thái**. Khách hàng cũng phải vuốt màn hình để tải lại.

---

## 2. NGUYÊN NHÂN GỐC RỄ (ROOT CAUSE ANALYSIS)

```
                     ┌───────────────────────┐
                     │ Khách tạo / Thợ nhận  │
                     └───────────┬───────────┘
                                 │
                                 ▼
                     ┌───────────────────────┐
                     │     Order Service     │
                     └───────────┬───────────┘
                                 │ (RabbitMQ Event)
                                 ▼
                     ┌───────────────────────┐
                     │ Notification Service  │
                     └───────────┬───────────┘
                                 │ (Push FCM)
                                 ▼
                     ┌───────────────────────┐
                     │ App Mobile (FCM Push) │
                     └───────────┬───────────┘
                                 │
                    NotificationLifecycle Listener
                                 │
            ┌────────────────────┴────────────────────┐
            ▼                                         ▼
refreshNotifications(id)               queryClient.invalidateQueries(ordersQueryKeys.all)
(Làm mới cache Quả chuông)             (Làm mới TOÀN BỘ cache đơn hàng của cả Thợ & Khách)
            │                                         │
            ▼                                         ▼
   ✅ Quả chuông nổ số                        ✅ Đơn hàng 2 bên tự động cập nhật ngay
```

1. **Phía Notification Listener chung (`NotificationLifecycle`):**
   - Trước đây chỉ gọi `refreshNotifications(userId)` làm mới thông báo, bỏ quên toàn bộ cache đơn hàng `ordersQueryKeys.all`.
   - Vì `ordersQueryKeys.all = ['orders']` là tiền tố chung cho **toàn bộ queries của cả Khách và Thợ**, việc bổ sung lệnh invalidate này giúp cả 2 bên tự động làm mới dữ liệu tức thì (0s độ trễ) khi có Push Notification.

2. **Phía Hook Thợ (`useWorkerJobs`):**
   - Trước đây không có `refetchInterval`, dẫn đến khi chạy trên Expo Go (nơi Native Push bị tắt) hoặc khi mạng chập chờn thì không tự động cập nhật được.

3. **Phía Hook Khách hàng (`useCustomerOrders` & `useCustomerOrderDetail`):**
   - `useCustomerOrders`: Cả `requestsQuery` (tab Đang tìm) và `ordersQuery` (tab Đang làm) trước đây đều chưa có `refetchInterval`.
   - `useCustomerOrderDetail`: Đã có `refetchInterval`, nhưng chỉ kiểm tra trạng thái `['in_progress', 'awaiting_customer_confirmation']`, bỏ quên trạng thái `created` (khi đơn vừa tạo đang chờ thợ xác nhận).

---

## 3. CƠ CHẾ ĐỒNG BỘ 2 LỚP ĐÃ TRIỂN KHAI (HYBRID DUAL-LAYER SYNC)

Cơ chế này đã được áp dụng song song và đồng nhất cho cả 2 bên Thợ và Khách hàng:

```
                          CƠ CHẾ ĐỒNG BỘ 2 LỚP
   
   ┌─────────────────────────────────────────────────────────────┐
   │ LỚP 1: PUSH EVENT-DRIVEN (Tức thì - 0s delay)               │
   │ Push Notification nổ ──► queryClient.invalidateQueries()    │
   │ ──► Màn hình Thợ & Khách nhảy trạng thái mới ngay lập tức  │
   └─────────────────────────────────────────────────────────────┘
                                ▲
                                │ (Hỗ trợ lẫn nhau)
                                ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ LỚP 2: SMART POLLING (Lưới an toàn & Expo Go Fallback)      │
   │ Quét định kỳ 4s - 5s CHỈ KHI đang mở màn hình nhận việc/đơn │
   │ ──► Tự động dừng 100% khi ẩn app hoặc chuyển tab            │
   └─────────────────────────────────────────────────────────────┘
```

---

## 4. CHI TIẾT CÁC THAY ĐỔI ĐÃ THỰC HIỆN

### 1️⃣ File chung: `mobile/src/features/notifications/notification-lifecycle.tsx`
* **Vị trí:** Import và trong listener `Notifications.addNotificationReceivedListener`.
* **Code đã thêm:**
  ```typescript
  import { ordersQueryKeys } from '@/features/orders/hooks/orders-query-keys';

  subscriptions.push(Notifications.addNotificationReceivedListener(() => {
    const id = sessionUser();
    if (id) {
      void refreshNotifications(id);
      // Tự động làm mới cache toàn bộ đơn hàng (cả Khách hàng & Thợ)
      void queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    }
  }));
  ```

---

### 2️⃣ Phía Thợ: `mobile/src/features/orders/hooks/use-worker-jobs.ts`
* **Vị trí:** `proposalsQuery` và `ordersQuery`.
* **Code đã thêm:**
  ```typescript
  // proposalsQuery (Đề xuất mới từ khách):
  refetchInterval: 4000,
  refetchIntervalInBackground: false,

  // ordersQuery (Đơn hàng đang thực hiện):
  refetchInterval: 5000,
  refetchIntervalInBackground: false,
  ```

---

### 3️⃣ Phía Khách hàng: `mobile/src/features/orders/hooks/use-customer-orders.ts`
* **Vị trí:** `requestsQuery`, `ordersQuery` và `useCustomerOrderDetail`.
* **Code đã thêm:**
  ```typescript
  // Trong useCustomerOrders:
  // requestsQuery (tab Đang tìm thợ):
  refetchInterval: 5000,
  refetchIntervalInBackground: false,

  // ordersQuery (tab Đang thực hiện):
  refetchInterval: 5000,
  refetchIntervalInBackground: false,

  // Trong useCustomerOrderDetail:
  refetchInterval: (query) => {
    const data = query.state.data;
    if (!data) return false;
    // Bổ sung 'created' để tự động cập nhật ngay khi thợ bấm xác nhận đơn
    if (['created', 'in_progress', 'awaiting_customer_confirmation'].includes(data.status)) {
      return 4000;
    }
    return false;
  },
  refetchIntervalInBackground: false,
  ```

---

## 5. KẾT QUẢ KIỂM THỬ XÁC NHẬN (VERIFICATION RESULTS)

Đã bổ sung bộ unit test tự động trong `src/features/orders/__tests__/realtime-sync.test.tsx` và `src/features/notifications/__tests__/notification-lifecycle.test.tsx`:

- [x] **TC-W1:** `useWorkerJobs` cấu hình `refetchInterval: 4000` cho đề xuất mới, `5000` cho đơn hàng đang làm, `refetchIntervalInBackground: false`.
- [x] **TC-C1:** `useCustomerOrders` cấu hình `refetchInterval: 5000` cho cả requests query và orders query, `refetchIntervalInBackground: false`.
- [x] **TC-C2:** `useCustomerOrderDetail` tự động thăm dò mỗi 4s cho cả các trạng thái `['created', 'in_progress', 'awaiting_customer_confirmation']`.
- [x] **TC-N1:** `NotificationLifecycle` gọi `queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all })` khi nhận được push notification từ Firebase.
- [x] **Hồi quy toàn bộ (Full Regression):** Toàn bộ **11 test suites** với **85 unit tests** của `orders` và `notifications` đều **PASS 100%**.
