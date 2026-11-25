import type { WorkerPublicProfileData } from '@/services/workers/workers-api';
import { useQuery } from '@tanstack/react-query';
import { WorkersApi } from '@/services/workers/workers-api';

export const WORKER_PUBLIC_PROFILE_QUERY_KEY = 'worker-public-profile';
export const WORKER_PUBLIC_PROFILE_SERVICES_QUERY_KEY = 'worker-public-profile-services';

export function getWorkerPublicProfileQueryKey(workerId?: string | null) {
  return [WORKER_PUBLIC_PROFILE_QUERY_KEY, workerId] as const;
}

export function getWorkerPublicProfileServicesQueryKey(workerId?: string | null) {
  return [WORKER_PUBLIC_PROFILE_SERVICES_QUERY_KEY, workerId] as const;
}

export async function fetchWorkerPublicProfile(workerId: string): Promise<WorkerPublicProfileData> {
  const res = await WorkersApi.getWorkerPublicProfile(workerId);
  return res.data;
}

export function useWorkerPublicProfile(
  workerId?: string | null,
  options?: { enabled?: boolean; staleTime?: number },
) {
  const isEnabled = Boolean(workerId) && (options?.enabled ?? true);
  return useQuery<WorkerPublicProfileData>({
    queryKey: getWorkerPublicProfileQueryKey(workerId),
    queryFn: async () => {
      if (!workerId) {
        throw new Error('Mã thợ không hợp lệ');
      }
      return fetchWorkerPublicProfile(workerId);
    },
    enabled: isEnabled,
    staleTime: options?.staleTime ?? 5 * 60 * 1000,
  });
}
