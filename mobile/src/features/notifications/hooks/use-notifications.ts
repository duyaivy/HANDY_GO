import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '@/lib/api/query-client';
import { NotificationApi } from '@/services/notifications/notification-api';
import { useAuthStore } from '@/stores/use-auth-store';

export const notificationKeys = {
  user: (id: string | null) => ['notifications', id] as const,
  list: (id: string | null) => ['notifications', id, 'list'] as const,
  count: (id: string | null) => ['notifications', id, 'count'] as const,
};
export function useNotificationUserId() {
  return useAuthStore(s => s.isHydrated && s.isAuthenticated && !s.isLoading ? s.user?.id ?? null : null);
}
export function refreshNotifications(userId: string) {
  return queryClient.invalidateQueries({ queryKey: notificationKeys.user(userId) });
}
export function useNotifications() {
  const userId = useNotificationUserId();
  return useInfiniteQuery({
    queryKey: notificationKeys.list(userId),
    enabled: Boolean(userId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) => NotificationApi.list(pageParam, signal),
    getNextPageParam: last => last.nextCursor ?? undefined,
  });
}
export function useUnreadNotifications() {
  const userId = useNotificationUserId();
  return useQuery({
    queryKey: notificationKeys.count(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) => NotificationApi.unreadCount(signal),
  });
}
export function useReadNotification() {
  const client = useQueryClient();
  const userId = useNotificationUserId();
  return useMutation({
    mutationFn: async (id: string | null) => {
      const session = useAuthStore.getState();
      if (!userId || !session.isAuthenticated || !session.isHydrated || session.isLoading || session.user?.id !== userId)
        throw new Error('Session changed');
      const controller = new AbortController();
      const unsubscribe = useAuthStore.subscribe((state) => {
        if (!state.isAuthenticated || state.isLoading || state.user?.id !== userId)
          controller.abort();
      });
      try {
        return id ? await NotificationApi.markRead(id, controller.signal) : await NotificationApi.markAllRead(controller.signal);
      }
      finally { unsubscribe(); }
    },
    onSuccess: () => {
      if (userId && useAuthStore.getState().user?.id === userId)
        return client.invalidateQueries({ queryKey: notificationKeys.user(userId) });
    },
  });
}
