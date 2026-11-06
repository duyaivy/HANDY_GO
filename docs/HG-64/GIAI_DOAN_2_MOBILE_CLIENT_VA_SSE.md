# Hướng dẫn Kỹ thuật Giai đoạn 2: Xây dựng Module Client & Real-time SSE trên Mobile App

> **Mã công việc:** HG-64  
> **Giai đoạn:** 2/5  
> **Tên giai đoạn:** Xây dựng Module Client, SSE Streamer & React Query Hooks trên Mobile App  
> **Thời lượng ước tính:** 1.0 ngày  
> **Trạng thái:** ✅ Đã hoàn thành 100% (Commit: Phase 2 Client, SSE & Hooks)  

---

## 1. Mục tiêu giai đoạn

Xây dựng toàn bộ nền tảng giao tiếp dữ liệu phía ứng dụng React Native di động:
1. Định nghĩa hệ thống Types và DTOs tương thích 100% với Backend Tracking Service.
2. Xây dựng module `TrackingApi` kết nối REST API Gateway (`/api/v1/tracking/*`).
3. Phát triển `TrackingSseClient` hỗ trợ tự động kết nối lại (Auto-reconnect), xử lý Heartbeat Ping, bù đắp sự kiện qua `Last-Event-ID`.
4. Viết các custom hook React Query (`useTrackingSummary`, `useTrackingTimeline`, `useTrackingEvents`).

---

## 2. Các bước triển khai chi tiết

### Bước 2.1: Tạo Types & DTOs cho Tracking Service

#### 📍 Vị trí tệp:
- `mobile/src/features/tracking/types/tracking.types.ts`

#### 📝 Nội dung code mẫu:
```typescript
export type TrackingPhase =
  | 'DRAFT'
  | 'SEEKING_WORKERS'
  | 'BOOKING_PROPOSAL'
  | 'ORDER_CONFIRMED'
  | 'ORDER_IN_PROGRESS'
  | 'ORDER_FINISHED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED';

export type MilestoneStatus = 'completed' | 'in_progress' | 'pending' | 'skipped';

export interface TrackingMilestone {
  key: string;
  title: string;
  description: string;
  status: MilestoneStatus;
  reachedAt: string | null;
  actorUserId?: string | null;
}

export interface TrackingEventItem {
  id: string;
  eventId: string;
  entityType: string;
  entityId: string;
  eventType: string;
  sourceService: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  reason?: string | null;
  metadata?: Record<string, any> | null;
  occurredAt: string;
  recordedAt: string;
  writeSequence?: number;
}

export interface TrackingSummaryResponse {
  serviceRequestId: string;
  orderId: string | null;
  customerId: string;
  currentPhase: TrackingPhase;
  milestones: TrackingMilestone[];
  order?: {
    id: string;
    status: string;
    workerId?: string;
    totalAmount?: number;
  };
  lastUpdatedAt: string;
}

export interface TrackingTimelineResponse {
  serviceRequestId: string;
  items: TrackingEventItem[];
  page: number;
  limit: number;
  total: number;
}

export type TrackingSseEventType = 'connected' | 'ping' | 'timeline_event';

export interface TrackingSseMessage {
  type: TrackingSseEventType;
  serviceRequestId?: string;
  message?: string;
  payload?: TrackingEventItem;
  timestamp?: string;
}
```

---

### Bước 2.2: Xây dựng `TrackingApi` Client

#### 📍 Vị trí tệp:
- `mobile/src/features/tracking/api/tracking.api.ts`

#### 📝 Nội dung code mẫu:
```typescript
import { request } from '@/services/api/api-client';
import type {
  TrackingSummaryResponse,
  TrackingTimelineResponse,
} from '../types/tracking.types';

export const TrackingApi = {
  /**
   * Lấy bản tóm tắt tiến trình và các cột mốc đã đạt được.
   */
  async getSummary(serviceRequestId: string): Promise<TrackingSummaryResponse> {
    return request<TrackingSummaryResponse>({
      url: `/api/v1/tracking/requests/${serviceRequestId}/summary`,
      method: 'GET',
    });
  },

  /**
   * Lấy danh sách dòng thời gian sự kiện chi tiết (có phân trang).
   */
  async getTimeline(
    serviceRequestId: string,
    params?: { page?: number; limit?: number },
  ): Promise<TrackingTimelineResponse> {
    return request<TrackingTimelineResponse>({
      url: `/api/v1/tracking/requests/${serviceRequestId}/timeline`,
      method: 'GET',
      params,
    });
  },
};
```

---

### Bước 2.3: Xây dựng `TrackingSseClient`

Kế thừa mô hình client từ [`bidding-sse-client.ts`](file:///d:/SCHOOL/PBL6/mobile/src/services/sse/bidding-sse-client.ts).

#### 📍 Vị trí tệp:
- `mobile/src/services/sse/tracking-sse-client.ts`

#### 📝 Nội dung code mẫu:
```typescript
import { getToken } from '@/lib/auth/utils';
import { resolveApiBaseUrl } from '@/services/api/api-client';
import { Logger } from '@/services/logger/logger';
import type { TrackingEventItem, TrackingSseMessage } from '@/features/tracking/types/tracking.types';

export type TrackingSseListener = (event: TrackingEventItem) => void;
export type StatusChangeListener = (status: 'connected' | 'reconnecting' | 'disconnected') => void;

export class TrackingSseClient {
  private eventSource: any = null;
  private serviceRequestId: string;
  private isClosed = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastEventId: string | null = null;
  private listeners: Set<TrackingSseListener> = new Set();
  private statusListeners: Set<StatusChangeListener> = new Set();

  constructor(serviceRequestId: string) {
    this.serviceRequestId = serviceRequestId;
  }

  connect(): void {
    if (this.isClosed) return;

    this.cleanup();
    this.notifyStatus('reconnecting');

    const token = getToken();
    const baseUrl = resolveApiBaseUrl();
    const url = `${baseUrl}/api/v1/tracking/requests/${this.serviceRequestId}/live`;

    try {
      // Dùng EventSource chuẩn hoặc XMLHttpRequest streaming
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
      };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (this.lastEventId) {
        headers['Last-Event-ID'] = this.lastEventId;
      }

      // Khởi tạo EventSource
      const EventSourceModule = require('react-native-sse').default || require('react-native-sse');
      this.eventSource = new EventSourceModule(url, { headers, pollingInterval: 0 });

      this.eventSource.addEventListener('open', () => {
        Logger.info('[TrackingSSE] Kết nối thành công', { requestId: this.serviceRequestId });
        this.reconnectAttempts = 0;
        this.notifyStatus('connected');
      });

      this.eventSource.addEventListener('message', (event: any) => {
        if (!event.data) return;
        try {
          const parsed: TrackingSseMessage = JSON.parse(event.data);
          if (event.lastEventId) {
            this.lastEventId = event.lastEventId;
          }

          if (parsed.type === 'timeline_event' && parsed.payload) {
            this.notifyListeners(parsed.payload);
          }
        } catch (err) {
          Logger.warn('[TrackingSSE] Lỗi parse message JSON', err);
        }
      });

      this.eventSource.addEventListener('error', (err: any) => {
        Logger.warn('[TrackingSSE] Lỗi kết nối, chuẩn bị kết nối lại...', err);
        this.notifyStatus('reconnecting');
        this.scheduleReconnect();
      });
    } catch (error) {
      Logger.error('[TrackingSSE] Khởi tạo thất bại', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosed || this.reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  onEvent(listener: TrackingSseListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatusChange(listener: StatusChangeListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private notifyListeners(event: TrackingEventItem): void {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        Logger.warn('[TrackingSSE] Lỗi trong listener callback', err);
      }
    });
  }

  private notifyStatus(status: 'connected' | 'reconnecting' | 'disconnected'): void {
    this.statusListeners.forEach((l) => l(status));
  }

  disconnect(): void {
    this.isClosed = true;
    this.cleanup();
    this.notifyStatus('disconnected');
    this.listeners.clear();
    this.statusListeners.clear();
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close?.();
      this.eventSource.removeAllEventListeners?.();
      this.eventSource = null;
    }
  }
}
```

---

### Bước 2.4: Xây dựng React Query Hooks

#### 📍 Vị trí tệp:
- `mobile/src/features/tracking/hooks/use-tracking-summary.ts`
- `mobile/src/features/tracking/hooks/use-tracking-events.ts`

#### 📝 Code Hook 1: `use-tracking-summary.ts`
```typescript
import { useQuery } from '@tanstack/react-query';
import { TrackingApi } from '../api/tracking.api';

export const TRACKING_QUERY_KEYS = {
  summary: (id: string) => ['tracking', 'summary', id] as const,
  timeline: (id: string) => ['tracking', 'timeline', id] as const,
};

export function useTrackingSummary(serviceRequestId?: string) {
  return useQuery({
    queryKey: TRACKING_QUERY_KEYS.summary(serviceRequestId || ''),
    queryFn: () => TrackingApi.getSummary(serviceRequestId!),
    enabled: Boolean(serviceRequestId),
    staleTime: 30_000,
  });
}
```

#### 📝 Code Hook 2: `use-tracking-events.ts`
```typescript
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TrackingSseClient } from '@/services/sse/tracking-sse-client';
import { TRACKING_QUERY_KEYS } from './use-tracking-summary';
import type { TrackingEventItem } from '../types/tracking.types';

export function useTrackingEvents(
  serviceRequestId?: string,
  onEvent?: (event: TrackingEventItem) => void,
) {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<
    'connected' | 'reconnecting' | 'disconnected'
  >('disconnected');

  useEffect(() => {
    if (!serviceRequestId) return;

    const client = new TrackingSseClient(serviceRequestId);

    const unsubStatus = client.onStatusChange((status) => {
      setConnectionStatus(status);
    });

    const unsubEvent = client.onEvent((event) => {
      // 1. Tự động làm mới cache query của màn hình
      queryClient.invalidateQueries({
        queryKey: TRACKING_QUERY_KEYS.summary(serviceRequestId),
      });
      queryClient.invalidateQueries({
        queryKey: TRACKING_QUERY_KEYS.timeline(serviceRequestId),
      });

      // 2. Gọi callback nếu màn hình muốn xử lý hiệu ứng/rung chuông
      onEvent?.(event);
    });

    client.connect();

    return () => {
      unsubEvent();
      unsubStatus();
      client.disconnect();
    };
  }, [serviceRequestId, queryClient, onEvent]);

  return { connectionStatus };
}
```

---

## 3. Lệnh kiểm thử & Xác minh Giai đoạn 2

Viết file kiểm thử `tracking-sse-client.test.ts` trong `mobile/src/services/sse/__tests__/`:

```bash
# Chạy vitest trong thư mục mobile
cd mobile
pnpm test src/services/sse/__tests__/tracking-sse-client.test.ts
```

---

## 4. Tiêu chuẩn hoàn thành Giai đoạn 2 (Sign-off Checklist)

- [x] Các tệp DTO và Types được định nghĩa đầy đủ tại `mobile/src/features/tracking/types/`.
- [x] `TrackingApi` gọi đúng các endpoint của API Gateway (`/api/v1/tracking/*`).
- [x] `TrackingSseClient` hỗ trợ reconnect, heartbeat watchdog, token refresh và Last-Event-ID.
- [x] Các hook `useTrackingSummary`, `useTrackingTimeline` và `useTrackingEvents` hoàn thành, sẵn sàng nhúng vào UI ở **Giai đoạn 3**.
- [x] 100% Unit tests pass: `tracking-sse-client.test.ts` (10/10 tests) và `tracking.test.ts` (3/3 tests).
