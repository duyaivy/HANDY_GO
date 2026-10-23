import type { NotificationRecord } from '@/services/notifications/notification-api';
import { useCallback } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Platform, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { syncPushRegistration } from '@/services/notifications/push-registration';
import { NotificationItem } from './components/notification-item';
import { useNotifications, useNotificationUserId, useReadNotification, useUnreadNotifications } from './hooks/use-notifications';

const keyExtractor = (item: NotificationRecord) => item.id;
const contentContainerStyle = { flexGrow: 1, paddingBottom: 24 };

export function NotificationScreen({ worker = false }: { worker?: boolean }) {
  const userId = useNotificationUserId();
  const list = useNotifications();
  const unread = useUnreadNotifications();
  const read = useReadNotification();
  const items = list.data?.pages.flatMap(page => page.items) ?? [];
  const markRead = useCallback((item: NotificationRecord) => {
    if (!item.readAt && !read.isPending)
      read.mutate(item.id);
  }, [read]);
  const renderItem = useCallback(({ item }: { item: NotificationRecord }) => (
    <NotificationItem item={item} onPress={markRead} />
  ), [markRead]);
  const refresh = () => {
    void list.refetch();
    void unread.refetch();
    void syncPushRegistration();
  };
  return (
    <Screen safeArea={false}>
      <AppBar title={worker ? 'Thông báo Thợ' : 'Thông báo'} hideBackButton={!worker} />
      <View className="flex-1" testID={worker ? 'worker-notifications-screen' : 'customer-notifications-screen'}>
        {!userId
          ? <EmptyState title="Đăng nhập để xem thông báo" message="Thông báo của bạn sẽ xuất hiện tại đây." />
          : (
              <>
                <View className="flex-row items-center justify-between px-4 py-2">
                  <Text>{`${unread.data?.count ?? 0} chưa đọc`}</Text>
                  <Button label="Đọc tất cả" variant="ghost" disabled={read.isPending || !unread.data?.count} onPress={() => read.mutate(null)} />
                </View>
                {Platform.OS !== 'web' && (
                  <Button
                    label="Cài đặt thông báo trên thiết bị"
                    variant="ghost"
                    onPress={() => {
                      Linking.openSettings().catch(() => Alert.alert('Thông báo', 'Vui lòng mở cài đặt thiết bị.'));
                    }}
                  />
                )}
                {read.isError && <Text accessibilityRole="alert" className="px-4 text-danger-600">Không thể đánh dấu đã đọc. Vui lòng thử lại.</Text>}
                {unread.isError && <Text className="px-4 text-danger-600">Không thể tải số thông báo chưa đọc.</Text>}
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
