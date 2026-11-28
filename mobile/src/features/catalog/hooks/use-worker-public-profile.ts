import type { WorkerPublicProfileData } from '@/services/workers/workers-api';
import { useQuery } from '@tanstack/react-query';
import { WorkersApi } from '@/services/workers/workers-api';
import { useAuthStore } from '@/stores/use-auth-store';

export const WORKER_PUBLIC_PROFILE_QUERY_KEY = 'worker-public-profile';
export const WORKER_PUBLIC_PROFILE_SERVICES_QUERY_KEY = 'worker-public-profile-services';

export function resolveWorkerProfileViewerScope(
  user?: {
    id?: string | null;
    role?: string | null;
    roles?: string[] | null;
  } | null,
  activeMode?: string | null,
): string {
  if (!user?.id) {
    return 'anonymous';
  }
  const normalizedRoles = Array.isArray(user.roles) && user.roles.length > 0
    ? [...user.roles].map(r => r.trim().toLowerCase()).filter(Boolean).sort()
    : (user.role ? [user.role.trim().toLowerCase()] : []);
  const mode = activeMode ? activeMode.trim().toLowerCase() : '';
  return `${user.id}:${normalizedRoles.join(',')}:${mode}`;
}

export function getWorkerPublicProfileQueryKey(
  workerId?: string | null,
  viewerScope?: string | null,
) {
  return viewerScope
    ? [WORKER_PUBLIC_PROFILE_QUERY_KEY, workerId, viewerScope] as const
    : [WORKER_PUBLIC_PROFILE_QUERY_KEY, workerId] as const;
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
  const user = useAuthStore(state => (state.isAuthenticated ? state.user : null));
  const activeMode = useAuthStore(state => state.activeMode);
  const viewerScope = resolveWorkerProfileViewerScope(user, activeMode);
  const isEnabled = Boolean(workerId) && (options?.enabled ?? true);

  return useQuery<WorkerPublicProfileData>({
    queryKey: getWorkerPublicProfileQueryKey(workerId, viewerScope),
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
