import type { UserProfileResponse } from '@/services/auth/auth-api';
import { useQuery } from '@tanstack/react-query';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';

export function useUserProfile() {
  const user = useAuthStore.use.user();
  const userId = user?.id;

  const query = useQuery<UserProfileResponse>({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const response = await AuthApi.getMyProfile();
      return response.data;
    },
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.isError
      ? ((query.error as any)?.message || 'Không thể tải thông tin hồ sơ. Vui lòng thử lại.')
      : null,
    refetch: query.refetch,
  };
}
