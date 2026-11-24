import type { TrackingEventItem } from '../types/tracking.types';
import type { TrackingConnectionStatus } from '@/services/sse/tracking-sse-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { TrackingSseClient } from '@/services/sse/tracking-sse-client';
import { TRACKING_QUERY_KEYS } from './use-tracking-summary';
import { invalidateOrderRelatedQueries } from '@/features/orders/hooks/orders-query-keys';

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
      if (typeof event.eventType === 'string' && event.eventType.startsWith('order.')) {
        invalidateOrderRelatedQueries(queryClient);
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
