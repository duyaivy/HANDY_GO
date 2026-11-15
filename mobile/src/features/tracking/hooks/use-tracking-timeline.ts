import { useQuery } from '@tanstack/react-query';
import { TrackingApi } from '../api/tracking.api';
import { TRACKING_QUERY_KEYS } from './use-tracking-summary';

export function useTrackingTimeline(
  serviceRequestId?: string,
  params?: { page?: number; limit?: number },
) {
  return useQuery({
    queryKey: TRACKING_QUERY_KEYS.timeline(serviceRequestId || '', params as Record<string, unknown> | undefined),
    queryFn: () => TrackingApi.getTimeline(serviceRequestId!, params),
    enabled: Boolean(serviceRequestId),
    staleTime: 10_000,
  });
}
