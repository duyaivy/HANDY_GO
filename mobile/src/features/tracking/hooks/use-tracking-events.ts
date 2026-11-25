import type { TrackingEventItem } from '../types/tracking.types';
import type { TrackingConnectionStatus } from '@/services/sse/tracking-sse-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { scheduleOrderRelatedInvalidation } from '@/features/orders/hooks/orders-query-keys';
import { TrackingSseClient } from '@/services/sse/tracking-sse-client';
import { TRACKING_QUERY_KEYS } from './use-tracking-summary';

export function useTrackingEvents(
  serviceRequestId?: string,
  onEvent?: (event: TrackingEventItem) => void,
) {
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState<TrackingConnectionStatus>('disconnected');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!serviceRequestId) {
      return;
    }

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
        queryKey: TRACKING_QUERY_KEYS.timelines(),
      });

      // 2. Làm mới các query liên quan đến số đơn khi có sự kiện thay đổi trạng thái đơn
      // Sử dụng scheduleOrderRelatedInvalidation ở cấp QueryClient để không bị hủy khi unmount
      // và tự động retry nhiều mốc (1000ms, 2500ms, 5000ms) nếu consumer commit chậm > 1.2s
      if (typeof event.eventType === 'string' && event.eventType.startsWith('order.')) {
        scheduleOrderRelatedInvalidation(queryClient);
      }

      // 3. Gọi callback nếu màn hình muốn xử lý hiệu ứng/rung chuông
      onEventRef.current?.(event);
    });

    void client.connect();

    return () => {
      unsubEvent();
      unsubStatus();
      client.disconnect();
    };
  }, [serviceRequestId, queryClient]);

  return { connectionStatus: serviceRequestId ? connectionStatus : 'disconnected' as const };
}
