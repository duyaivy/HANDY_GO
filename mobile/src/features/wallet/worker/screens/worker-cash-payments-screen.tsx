import type { ListRenderItemInfo } from '@shopify/flash-list';
import type { OrderPaymentRecord } from '../../types/payment.types';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useWorkerFinancials } from '../../hooks/use-worker-financials';
import { formatPointsToVND } from '../../utils/formatters';

const keyExtractor = (item: OrderPaymentRecord) => item.id;
export function WorkerCashPaymentsScreen() {
  const router = useRouter();
  const query = useWorkerFinancials();
  const payments = useMemo(() => query.data?.payments.filter(item => item.method === 'cash' && item.orderCompletedAt && (item.status === 'pending' || item.status === 'failed')) ?? [], [query.data]);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<OrderPaymentRecord>) => (
    <Pressable testID={`worker-cash-order-${item.orderId}`} accessibilityRole="button" onPress={() => router.push(RouteNames.WORKER_JOB_DETAIL(item.orderId) as never)} className="gap-2 border-b border-neutral-200 p-4 dark:border-neutral-800">
      <Text className="font-bold text-neutral-900 dark:text-white">{`Đơn ${item.orderId}`}</Text>
      <Text className="text-emerald-700 dark:text-emerald-300">{`Cần xác nhận: ${formatPointsToVND(item.amount)}`}</Text>
      <Text className="text-xs text-neutral-500">Mở chi tiết và chỉ xác nhận khi đã nhận đủ tiền mặt.</Text>
    </Pressable>
  ), [router]);
  return (
    <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar mode="stack" title="Tiền mặt chờ xác nhận" role="Worker" onBack={router.back} />
      <View testID="worker-cash-payments-screen" className="flex-1">
        <FlashList
          data={payments}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          refreshControl={(
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => {
                void query.refetch();
              }}
            />
          )}
          ListEmptyComponent={!query.isAuthenticated ? <Text className="p-4 text-neutral-500">Đăng nhập để xem đơn tiền mặt.</Text> : query.isPending ? <ActivityIndicator /> : query.isError ? <Pressable accessibilityRole="button" onPress={() => { void query.refetch(); }} className="p-4"><Text className="text-red-600">Không thể tải đơn tiền mặt. Chạm để thử lại.</Text></Pressable> : <Text className="p-4 text-neutral-500">Không có đơn tiền mặt chờ xác nhận.</Text>}
        />
      </View>
    </Screen>
  );
}
