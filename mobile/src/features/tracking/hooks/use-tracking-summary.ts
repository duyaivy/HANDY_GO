import { useQuery } from '@tanstack/react-query';
import { TrackingApi } from '../api/tracking.api';

export const TRACKING_QUERY_KEYS = {
  all: ['tracking'] as const,
  summaries: () => [...TRACKING_QUERY_KEYS.all, 'summary'] as const,
  summary: (id: string) => [...TRACKING_QUERY_KEYS.summaries(), id] as const,
  timelines: () => [...TRACKING_QUERY_KEYS.all, 'timeline'] as const,
  timeline: (id: string, params?: Record<string, unknown>) =>
    params !== undefined
      ? ([...TRACKING_QUERY_KEYS.timelines(), id, params] as const)
      : ([...TRACKING_QUERY_KEYS.timelines(), id] as const),
};

export function useTrackingSummary(serviceRequestId?: string) {
  return useQuery({
    queryKey: TRACKING_QUERY_KEYS.summary(serviceRequestId || ''),
    queryFn: () => TrackingApi.getSummary(serviceRequestId!),
    enabled: Boolean(serviceRequestId),
    staleTime: 30_000,
  });
}
