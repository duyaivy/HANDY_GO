import type { InfiniteData } from '@tanstack/react-query';
import type {
  NotificationPage,
  NotificationRecord,
  UpdateNotificationPreferencesDto,
} from '@/services/notifications/notification-api';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryClient } from '@/lib/api/query-client';
import { NotificationApi } from '@/services/notifications/notification-api';
import { useAuthStore } from '@/stores/use-auth-store';

export const notificationKeys = {
  user: (id: string | null) => ['notifications', id] as const,
  list: (id: string | null) => ['notifications', id, 'list'] as const,
  count: (id: string | null) => ['notifications', id, 'count'] as const,
  preferences: (id: string | null) => ['notifications', id, 'preferences'] as const,
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

type OptimisticReadContext = {
  previousList?: InfiniteData<NotificationPage, string | undefined>;
  previousCount?: { count: number };
};

export function useReadNotification() {
  const client = useQueryClient();
  const userId = useNotificationUserId();
  return useMutation<
    NotificationRecord | { updatedCount: number },
    Error,
    string | null,
    OptimisticReadContext
  >({
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
    onMutate: async (id: string | null) => {
      if (!userId)
        return {};
      const listKey = notificationKeys.list(userId);
      const countKey = notificationKeys.count(userId);

      // Cancel outgoing refetches so they don't overwrite optimistic update
      await client.cancelQueries({ queryKey: listKey });
      await client.cancelQueries({ queryKey: countKey });

      // Snapshot previous values
      const previousList = client.getQueryData<InfiniteData<NotificationPage, string | undefined>>(listKey);
      const previousCount = client.getQueryData<{ count: number }>(countKey);

      const now = new Date().toISOString();

      // Optimistically update list in cache
      client.setQueryData<InfiniteData<NotificationPage, string | undefined>>(listKey, (old) => {
        if (!old)
          return old;
        return {
          ...old,
          pages: old.pages.map(page => ({
            ...page,
            items: page.items.map((item) => {
              if (id === null || item.id === id) {
                return item.readAt ? item : { ...item, readAt: now };
              }
              return item;
            }),
          })),
        };
      });

      // Optimistically update unread count in cache
      client.setQueryData<{ count: number }>(countKey, (old) => {
        if (!old)
          return old;
        if (id === null)
          return { count: 0 };
        return { count: Math.max(0, old.count - 1) };
      });

      return { previousList, previousCount };
    },
    onError: (_err, _id, context) => {
      if (!userId || !context)
        return;
      if (context.previousList !== undefined) {
        client.setQueryData(notificationKeys.list(userId), context.previousList);
      }
      if (context.previousCount !== undefined) {
        client.setQueryData(notificationKeys.count(userId), context.previousCount);
      }
    },
    onSettled: () => {
      if (userId && useAuthStore.getState().user?.id === userId)
        return client.invalidateQueries({ queryKey: notificationKeys.user(userId) });
    },
  });
}

export function useNotificationPreferences() {
  const userId = useNotificationUserId();
  return useQuery({
    queryKey: notificationKeys.preferences(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) => NotificationApi.getPreferences(signal),
  });
}

export function useUpdateNotificationPreferences() {
  const client = useQueryClient();
  const userId = useNotificationUserId();
  return useMutation({
    mutationFn: (body: UpdateNotificationPreferencesDto) => NotificationApi.updatePreferences(body),
    onSuccess: (data) => {
      if (userId) {
        client.setQueryData(notificationKeys.preferences(userId), data);
      }
    },
  });
}
