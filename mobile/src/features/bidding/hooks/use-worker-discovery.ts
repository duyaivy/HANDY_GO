import type {
  DiscoverableJobItem,
  DiscoverableJobsResponseData,
  WorkerDiscoveryParams,
} from '../api/worker-discovery.api';
import { useQuery } from '@tanstack/react-query';
import { workerBiddingKeys } from '@/features/candidates/hooks/candidate-query-keys';
import { WorkerDiscoveryApi } from '../api/worker-discovery.api';

export type UseWorkerDiscoveryOptions = WorkerDiscoveryParams & {
  enabled?: boolean;
};

export function useWorkerDiscovery(options?: UseWorkerDiscoveryOptions) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 10;
  const isEnabled = options?.enabled ?? true;

  const query = useQuery<DiscoverableJobsResponseData, Error>({
    queryKey: workerBiddingKeys.discoverableRequests({ page, limit }),
    queryFn: ({ signal }) =>
      WorkerDiscoveryApi.getDiscoverableRequestsData({ page, limit }, signal),
    enabled: isEnabled,
  });

  return {
    ...query,
    jobs: (query.data?.items ?? []) as DiscoverableJobItem[],
    total: query.data?.total ?? 0,
    page: query.data?.page ?? page,
    limit: query.data?.limit ?? limit,
    totalPages: Math.ceil((query.data?.total ?? 0) / limit),
  };
}
