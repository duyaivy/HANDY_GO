import type { ListRenderItemInfo } from '@shopify/flash-list';
import type { OrderPaymentRecord } from '../../types/payment.types';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useWorkerCashPayments } from '../../hooks/use-worker-cash-payments';
import { formatPointsToVND } from '../../utils/formatters';

const keyExtractor = (item: OrderPaymentRecord) => item.id;

export function WorkerCashPaymentsScreen() {
  const router = useRouter();
  const query = useWorkerCashPayments();
  const {
    userId: currentUserId,
    isAuthenticated,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isError,
    fetchNextPage,
  } = query;

  const payments = useMemo(() => {
    if (!currentUserId)
      return [];
    const unique = new Map<string, OrderPaymentRecord>();
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (
          item.workerUserId === currentUserId
          && item.method === 'cash'
          && item.orderCompletedAt
          && (item.status === 'pending' || item.status === 'failed')
        ) {
          unique.set(item.id, item);
        }
      }
    }
    return Array.from(unique.values());
  }, [query.data, currentUserId]);

  useEffect(() => {
    if (
      isAuthenticated
      && payments.length === 0
      && hasNextPage
      && !isFetchingNextPage
      && !isPending
      && !isError
    ) {
      void fetchNextPage();
    }
  }, [
    payments.length,
    hasNextPage,
    isAuthenticated,
    isFetchingNextPage,
    isPending,
    isError,
    fetchNextPage,
  ]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<OrderPaymentRecord>) => (
    <Pressable testID={`worker-cash-order-${item.orderId}`} accessibilityRole="button" onPress={() => router.push(RouteNames.WORKER_JOB_DETAIL(item.orderId) as never)} className="gap-2 border-b border-neutral-200 p-4 dark:border-neutral-800">
      <Text className="font-bold text-neutral-900 dark:text-white">{`Đơn ${item.orderId}`}</Text>
      <Text className="text-emerald-700 dark:text-emerald-300">{`Cần xác nhận: ${formatPointsToVND(item.amount)}`}</Text>
      <Text className="text-xs text-neutral-500">Mở chi tiết và chỉ xác nhận khi đã nhận đủ tiền mặt.</Text>
    </Pressable>
  ), [router]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const renderEmpty = () => {
    if (!isAuthenticated)
      return <Text className="p-4 text-neutral-500">Đăng nhập để xem đơn tiền mặt.</Text>;
    if (isPending)
      return <ActivityIndicator accessibilityLabel="Đang tải đơn tiền mặt" />;
    if (isError) {
      return (
        <Pressable accessibilityRole="button" onPress={() => { void query.refetch(); }} className="p-4">
          <Text className="text-red-600">Không thể tải đơn tiền mặt. Chạm để thử lại.</Text>
        </Pressable>
      );
    }
    if (isFetchingNextPage || hasNextPage) {
      return (
        <View testID="worker-cash-seeking-more" className="items-center gap-3 p-6">
          {isFetchingNextPage
            ? <ActivityIndicator accessibilityLabel="Đang tìm thêm đơn tiền mặt" />
            : null}
          <Text className="text-neutral-500">Đang tìm thêm đơn...</Text>
          {!isFetchingNextPage
            ? (
                <Pressable
                  testID="worker-cash-load-more-btn"
                  accessibilityRole="button"
                  onPress={() => { void fetchNextPage(); }}
                  className="rounded-xl bg-amber-500 px-4 py-2"
                >
                  <Text className="font-semibold text-white">Tải thêm</Text>
                </Pressable>
              )
            : null}
        </View>
      );
    }
    return <Text className="p-4 text-neutral-500">Không có đơn tiền mặt chờ xác nhận.</Text>;
  };

  return (
    <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar mode="stack" title="Tiền mặt chờ xác nhận" role="Worker" onBack={router.back} />
      <View testID="worker-cash-payments-screen" className="flex-1">
        <FlashList
          testID="worker-cash-payments-list"
          data={payments}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshControl={(
            <RefreshControl
              refreshing={query.isRefetching && !query.isFetchingNextPage}
              onRefresh={() => {
                void query.refetch();
              }}
            />
          )}
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={(
            query.isFetchingNextPage
              ? <ActivityIndicator className="py-4" />
              : query.hasNextPage
                ? (
                    <Pressable
                      testID="worker-cash-footer-load-more"
                      accessibilityRole="button"
                      onPress={loadMore}
                      className="items-center py-4"
                    >
                      <Text className="text-sm font-semibold text-amber-700 dark:text-amber-300">Tải thêm đơn</Text>
                    </Pressable>
                  )
                : null
          )}
        />
      </View>
    </Screen>
  );
}
