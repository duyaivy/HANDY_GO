# TÀI LIỆU KỸ THUẬT PHASE 3 — FIREBASE CLOUD MESSAGING (FCM) PUSH NOTIFICATION

> **Dự án:** HANDY GO (PBL6) — Notification Service  
> **Phiên bản:** Phase 3 (FCM Integration)  
> **Ngôn ngữ & Nền tảng:** TypeScript (ESM), NestJS v12, PostgreSQL (Prisma), Firebase Admin SDK 14.5  

---

## 1. Tổng quan Kiến trúc Phase 3

Phase 3 bổ sung khả năng gửi **Push Notification** qua Firebase Cloud Messaging (FCM HTTP v1 API) vào `notification-service`. Hệ thống tuân thủ chặt chẽ kiến trúc **PostgreSQL Durable Job Queue** và **In-Process Worker**, đảm bảo:
- **Tính toàn vẹn (No Dual-Write):** Push job (`NotificationDeliveryAttempt`) được tạo atomically trong cùng database transaction với in-app `Notification`.
- **An toàn tải & phục hồi (Crash Recovery):** Sử dụng `FOR UPDATE SKIP LOCKED` để worker claim job không bao giờ xung đột với instance khác, tự động thu hồi job bị bỏ rơi (abandoned) nếu worker gặp sự cố bất ngờ thông qua cơ chế lease timeout.
- **Bảo vệ Token Lifecycle:** Chỉ vô hiệu hóa token (`isActive = false`) khi Firebase xác nhận dứt khoát lỗi vĩnh viễn (invalid token), không deactive nhầm khi mạng lỗi hoặc Firebase tạm thời gián đoạn.
- **Tách biệt Policy & Tùy chọn người dùng:** Đánh giá chính sách gửi push độc lập khỏi in-app notification, tôn trọng `pushEnabled` trong `NotificationPreference`.

---

## 2. Luồng xử lý chi tiết (End-to-End Flow)

```
[ RabbitMQ: handy-go.events ]
           │
           ▼
[ EventConsumerService ] (Manual ACK, Retry, DLQ)
           │
           ▼
[ EventProcessorService ]
   ┌─────────────────────────────────────────────────────────────┐
   │ Bắt đầu $transaction (maxWait: 5s, timeout: 15s)            │
   │ 1. Idempotency Check: ConsumedEvent claim                   │
   │ 2. Routing & In-App Policy: NotificationRouter & Policy     │
   │ 3. Filter Recipients & Preferences (In-App)                 │
   │ 4. INSERT Notification (status: 'sent')                     │
   │ 5. Push Policy & Preference Check:                          │
   │    - PushPolicyResolver: Check event eligibility            │
   │    - PreferencesRepository.findPushOptOuts (nếu optional)  │
   │    - DevicesRepository.findActiveByUserIds                  │
   │ 6. INSERT NotificationDeliveryAttempt                       │
   │    (channel: 'push', status: 'queued', deliveryAttemptKey)  │
   └─────────────────────────────────────────────────────────────┘
           │
           ▼
[ PushWorkerService ] (Polling in-process mỗi 3s)
   │
   ├─► Claim jobs: PushJobRepository.claimPendingJobs(batchSize)
   │     [SELECT ... FOR UPDATE SKIP LOCKED] -> status = 'processing'
   │
   ├─► Build Payload: PushPayloadBuilder.build(...)
   │     - Whitelist data fields (notificationId, eventType, etc.)
   │     - Tránh FCM reserved keys
   │     - Bounded payload size <= 4096 bytes
   │
   ├─► Gửi FCM Batch: FirebasePushProvider.sendEach(messages)
   │     [FCM HTTP v1 API via firebase-admin]
   │
   └─► Phân loại & Xử lý kết quả:
         ├─ Thành công: status = 'sent', providerMessageId, deliveredAt
         ├─ Lỗi tạm thời (transient): status = 'queued', exponential backoff + jitter, attemptNo + 1
         ├─ Lỗi vĩnh viễn (terminal): status = 'failed', errorMessage
         └─ Token không hợp lệ: DevicesRepository.deactivateById(tokenId)
```

---

## 3. Các thành phần chính (Components)

### 3.1. `PushModule` (`apps/notification-service/src/push/push.module.ts`)
Module NestJS đóng gói toàn bộ tính năng push, kết nối `DevicesModule`, cung cấp:
- `PushJobRepository`
- `PushPolicyResolver`
- `PushProvider` (DI binding với `FirebasePushProvider`)
- `PushWorkerService`

### 3.2. `FirebasePushProvider` (`src/push/firebase-push.provider.ts`)
- Triển khai interface trừu tượng `PushProvider`.
- Quản lý vòng đời Firebase App (`initializeApp`, `deleteApp`).
- Phân tách gửi theo batch tối đa 500 messages (`sendEach`).
- Tự động fallback và báo lỗi fail-fast khi `PUSH_ENABLED=true` mà thiếu cấu hình credentials.

### 3.3. `PushJobRepository` (`src/push/push-job.repository.ts`)
- Tái sử dụng bảng `NotificationDeliveryAttempt` sẵn có mà không cần tạo thêm bảng mới.
- Khóa hàng an toàn bằng `FOR UPDATE SKIP LOCKED`.
- Reclaim tự động các job bị kẹt ở trạng thái `processing` vượt quá `LEASE_TIMEOUT_MS` (mặc định 120s).
- Tính toán thời gian retry với Exponential Backoff + Jitter:
  $$\text{delay} = \min(2000 \times 2^{\text{attemptNo}-1} + \text{jitter}, 300000)\text{ ms}$$

### 3.4. `PushPayloadBuilder` (`src/push/push-payload.builder.ts`)
- Định dạng title, body và chuyển đổi toàn bộ `data` sang chuỗi (string key-value).
- Loại bỏ các key cấm của Firebase (`from`, `notification`, `collapse_key`, `message_type`, `google.c.a.e`, `gcm.notification.body`).
- Tự động cắt gọn body nếu tổng dung lượng payload tiệm cận giới hạn 4096 bytes của FCM.

### 3.5. `PushPolicyResolver` (`src/push/push-policy.resolver.ts`)
- Mặc định ở chế độ an toàn: **Disabled** nếu không có cấu hình cụ thể.
- Hỗ trợ opt-in từng loại sự kiện qua biến môi trường `PUSH_EVENT_POLICIES`.
- Hỗ trợ `PUSH_SIMULATED_POLICIES=true` cho môi trường test/development.
- Phân định rạch ròi chế độ `mandatory` (bắt buộc, bỏ qua opt-out cá nhân) và `optional` (tôn trọng cài đặt người dùng).

### 3.6. `PushErrorClassifier` (`src/push/push-error-classifier.ts`)
Phân loại lỗi từ FCM:
- **Token không hợp lệ (`shouldDeactivateToken: true`):**
  - `messaging/registration-token-not-registered`
  - `messaging/invalid-registration-token`
  - `messaging/invalid-argument`
- **Lỗi tạm thời (`isTransient: true`):**
  - `messaging/unavailable`
  - `messaging/internal-error`
  - `messaging/server-unavailable`
  - `messaging/quota-exceeded`
  - `messaging/too-many-requests`
  - Lỗi mạng hệ thống: `ETIMEDOUT`, `ECONNRESET`, `ECONNREFUSED`
- **Lỗi vĩnh viễn cấu hình/payload:** Đánh dấu job `failed`, không retry, không vô hiệu hóa token của thiết bị.

---

## 4. Migration & Tối ưu Database

Migration `20261021000000_push_worker_indexes` bổ sung các partial indexes nhằm tối ưu hóa chu kỳ polling của worker mà không gây tốn dung lượng index cho các bản ghi đã hoàn tất:

```sql
-- Index phục vụ polling claim queued jobs
CREATE INDEX IF NOT EXISTS "delivery_attempts_push_worker_poll_idx"
  ON "notification_delivery_attempts" ("created_at" ASC)
  WHERE channel = 'push'
    AND status = 'queued'
    AND (next_retry_at IS NULL OR next_retry_at <= NOW());

-- Index phục vụ lease timeout recovery cho worker
CREATE INDEX IF NOT EXISTS "delivery_attempts_push_processing_idx"
  ON "notification_delivery_attempts" ("attempted_at" ASC)
  WHERE channel = 'push'
    AND status = 'processing';
```

---

## 5. Cấu hình biến môi trường (Environment Variables)

| Tên biến | Kiểu dữ liệu | Mặc định | Ý nghĩa |
|---|---|---|---|
| `PUSH_ENABLED` | boolean | `false` | Bật/tắt tính năng gửi FCM push notification |
| `PUSH_WORKER_ENABLED` | boolean | `true` | Bật/tắt polling worker xử lý hàng đợi push |
| `PUSH_WORKER_POLL_INTERVAL_MS` | number | `3000` | Chu kỳ polling kiểm tra job mới (ms) |
| `PUSH_WORKER_BATCH_SIZE` | number | `50` | Số lượng job claim mỗi chu kỳ poll |
| `PUSH_MAX_RETRY_ATTEMPTS` | number | `5` | Số lần thử lại tối đa trước khi đánh dấu failed |
| `PUSH_WORKER_LEASE_TIMEOUT_MS` | number | `120000` | Thời gian giữ lease trước khi coi job bị bỏ rơi |
| `FIREBASE_PROJECT_ID` | string | `""` | Firebase Project ID |
| `GOOGLE_APPLICATION_CREDENTIALS` | string | `""` | Đường dẫn đến file Service Account JSON |
| `PUSH_EVENT_POLICIES` | JSON string | `""` | Cấu hình policy chi tiết theo từng loại sự kiện |
| `PUSH_SIMULATED_POLICIES` | boolean | `false` | Bật giả lập push policy trên môi trường test/dev |
