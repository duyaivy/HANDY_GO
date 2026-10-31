/* eslint-disable max-lines-per-function */
import type { NotificationRecord } from '@/services/notifications/notification-api';
import { useRouter } from 'expo-router';
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
import { useAuthStore } from '@/stores/use-auth-store';
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
  const router = useRouter();
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

  const handleItemPress = useCallback((item: NotificationRecord) => {
    if (!item.readAt) {
      read.mutate(item.id);
    }

    try {
      const payload = item.payload || {};
      const eventType = String(payload.eventType || '');
      const requestId = String(payload.requestId || payload.serviceRequestId || payload.entityId || '');
      const category = item.category;
      const mode = useAuthStore.getState().activeMode;
      const userRoles = useAuthStore.getState().user?.roles || [];

      // Route matching job discovery notifications directly to Worker Home / Bidding
      if (
        eventType === 'matching.eligible_workers.ready'
        || category === 'matching'
        || (category === 'request' && (worker || mode === 'Worker' || userRoles.includes('Worker')))
      ) {
        if (userRoles.includes('Worker') && mode !== 'Worker') {
          useAuthStore.getState().setActiveMode('Worker');
        }
        if (requestId) {
          router.push(`/worker?requestId=${encodeURIComponent(requestId)}` as any);
        }
        else {
          router.push('/worker' as any);
        }
        return;
      }

      // Bid notifications -> Customer Radar
      if (
        (eventType === 'bid.submitted' || eventType === 'bid.revised' || category === 'bidding')
        && requestId
      ) {
        if (userRoles.includes('Customer') && mode !== 'Customer') {
          useAuthStore.getState().setActiveMode('Customer');
        }
        router.push(`/customer/booking/radar?requestId=${encodeURIComponent(requestId)}` as any);
        return;
      }

      // Proposal notification
      if (category === 'proposal') {
        if (worker || mode === 'Worker') {
          if (requestId) {
            router.push(`/worker?requestId=${encodeURIComponent(requestId)}` as any);
          }
          else {
            router.push('/worker' as any);
          }
        }
        else if (requestId) {
          router.push(`/customer/booking/radar?requestId=${encodeURIComponent(requestId)}` as any);
        }
        return;
      }

      // Order notification -> Order detail
      if (category === 'order') {
        const orderId = String(payload.entityId || payload.orderId || '');
        if (orderId) {
          if (worker || mode === 'Worker') {
            router.push(`/worker/jobs/${encodeURIComponent(orderId)}` as any);
          }
          else {
            router.push(`/customer/orders/${encodeURIComponent(orderId)}` as any);
          }
        }
        return;
      }

      // Wallet / Payment notification -> Wallet
      if (category === 'wallet' || category === 'payment') {
        if (worker || mode === 'Worker') {
          router.push('/worker/wallet' as any);
        }
        else {
          router.push('/customer/payment' as any);
        }
      }
    }
    catch (err) {
      console.warn('[NOTIF_CLICK] Navigation error:', err);
    }
  }, [read, router, worker]);

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
        <NotificationItem item={item} onPress={handleItemPress} />
      </View>
    );
  }, [items, handleItemPress]);
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
        disabled={!unreadCount}
        onPress={() => read.mutate(null)}
        accessibilityRole="button"
        accessibilityLabel="Đọc tất cả"
        className="rounded-full px-2 py-1 active:bg-neutral-100 dark:active:bg-neutral-800"
      >
        <Text
          className={`text-xs font-semibold ${
            !unreadCount
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
