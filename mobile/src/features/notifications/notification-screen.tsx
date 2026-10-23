/* eslint-disable max-lines-per-function */
import type { NotificationRecord } from '@/services/notifications/notification-api';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBar } from '@/components/ui/app-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { syncPushRegistration } from '@/services/notifications/push-registration';
import { NotificationItem } from './components/notification-item';
import { useNotifications, useNotificationUserId, useReadNotification, useUnreadNotifications } from './hooks/use-notifications';

const keyExtractor = (item: NotificationRecord) => item.id;

function formatDateHeader(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime()))
      return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  catch {
    return '';
  }
}

export function NotificationScreen({ worker = false }: { worker?: boolean }) {
  const insets = useSafeAreaInsets();
  const userId = useNotificationUserId();
  const list = useNotifications();
  const unread = useUnreadNotifications();
  const read = useReadNotification();
  const items = useMemo(() => list.data?.pages.flatMap(page => page.items) ?? [], [list.data?.pages]);
  const unreadCount = unread.data?.count ?? 0;

  const contentContainerStyle = useMemo(() => ({
    flexGrow: 1,
    paddingBottom: 24 + (worker ? insets.bottom : 16),
  }), [worker, insets.bottom]);

  const markRead = useCallback((item: NotificationRecord) => {
    if (!item.readAt && !read.isPending)
      read.mutate(item.id);
  }, [read]);
  const renderItem = useCallback(({ item, index }: { item: NotificationRecord; index: number }) => {
    const currentDate = formatDateHeader(item.createdAt);
    const prevDate = index > 0 ? formatDateHeader(items[index - 1]?.createdAt) : null;
    const isFirstOfDay = Boolean(currentDate && currentDate !== prevDate);

    return (
      <View>
        {isFirstOfDay && (
          <View className="flex-row items-center gap-2 px-4 pt-4 pb-2">
            <View className="h-4 w-1 rounded-full bg-primary-500" />
            <Text className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              {currentDate}
            </Text>
          </View>
        )}
        <NotificationItem item={item} onPress={markRead} />
      </View>
    );
  }, [items, markRead]);
  const refresh = () => {
    void list.refetch();
    void unread.refetch();
    void syncPushRegistration();
  };

  const rightAction = useMemo(() => {
    if (!userId)
      return undefined;
    return (
      <Pressable
        testID="mark-all-read-btn"
        disabled={read.isPending || !unreadCount}
        onPress={() => read.mutate(null)}
        accessibilityRole="button"
        accessibilityLabel="Đọc tất cả"
        className="rounded-full px-2 py-1 active:bg-neutral-100 dark:active:bg-neutral-800"
      >
        <Text
          className={`text-xs font-semibold ${
            read.isPending || !unreadCount
              ? 'text-neutral-400 dark:text-neutral-600'
              : 'text-primary-600 dark:text-primary-400'
          }`}
        >
          Đọc tất cả
        </Text>
      </Pressable>
    );
  }, [userId, read, unreadCount]);

  return (
    <Screen safeArea={false}>
      <AppBar
        title={worker ? 'Thông báo Thợ' : 'Thông báo'}
        subtitle={userId ? `${unreadCount} chưa đọc` : undefined}
        hideBackButton={!worker}
        rightAction={rightAction}
      />
      <View
        className="flex-1"
        style={{ paddingBottom: worker ? insets.bottom : 0 }}
        testID={worker ? 'worker-notifications-screen' : 'customer-notifications-screen'}
      >
        {!userId
          ? <EmptyState title="Đăng nhập để xem thông báo" message="Thông báo của bạn sẽ xuất hiện tại đây." />
          : (
              <>
                {read.isError && <Text accessibilityRole="alert" className="px-4 py-1 text-xs text-danger-600">Không thể đánh dấu đã đọc. Vui lòng thử lại.</Text>}
                {unread.isError && <Text className="px-4 py-1 text-xs text-danger-600">Không thể tải số thông báo chưa đọc.</Text>}
                <FlatList
                  data={items}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  contentContainerStyle={contentContainerStyle}
                  refreshing={list.isRefetching && !list.isFetchingNextPage}
                  onRefresh={refresh}
                  onEndReachedThreshold={0.4}
                  onEndReached={() => {
                    if (list.hasNextPage && !list.isFetching && !list.isFetchNextPageError)
                      void list.fetchNextPage();
                  }}
                  ListEmptyComponent={list.isPending
                    ? <LoadingState />
                    : list.isError
                      ? <ErrorState onRetry={refresh} />
                      : <EmptyState title="Chưa có thông báo" message="Thông báo mới sẽ xuất hiện tại đây." />}
                  ListFooterComponent={list.isFetchingNextPage
                    ? <ActivityIndicator />
                    : list.isError && items.length > 0
                      ? (
                          <ErrorState onRetry={() => {
                            if (list.isFetchNextPageError)
                              void list.fetchNextPage();
                            else refresh();
                          }}
                          />
                        )
                      : null}
                />
              </>
            )}
      </View>
    </Screen>
  );
}
