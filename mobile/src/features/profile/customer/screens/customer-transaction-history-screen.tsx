import type { ListRenderItemInfo } from '@shopify/flash-list';
import type { WalletTransaction, WalletTransactionType } from '@/features/wallet/types/wallet.types';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { TransactionDetailModal } from '@/features/wallet/customer/components/transaction-detail-modal';
import { TransactionItem } from '@/features/wallet/customer/components/transaction-item';
import { useWalletTransactions } from '@/features/wallet/hooks/use-wallet-transactions';

const FILTERS: { label: string; type?: WalletTransactionType }[] = [
  { label: 'Tất cả' },
  { label: 'Nạp tiền', type: 'topup' },
  { label: 'Thanh toán', type: 'payment_debit' },
  { label: 'Hoàn tiền', type: 'refund_credit' },
];
const WORKER_FILTERS: { label: string; type?: WalletTransactionType }[] = [
  { label: 'Tất cả' },
  { label: 'Nạp tiền', type: 'topup' },
  { label: 'Thu nhập', type: 'worker_earning' },
  { label: 'Phí nền tảng', type: 'commission_debit' },
  { label: 'Rút tiền', type: 'withdrawal' },
  { label: 'Thu hồi hoàn tiền', type: 'refund_recovery' },
];
const keyExtractor = (item: WalletTransaction) => item.id;
export type CustomerTransactionHistoryScreenProps = { onBack?: () => void; worker?: boolean };

export function CustomerTransactionHistoryScreen({ onBack, worker = false }: CustomerTransactionHistoryScreenProps = {}) {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<WalletTransactionType>();
  const [selected, setSelected] = useState<WalletTransaction | null>(null);
  const query = useWalletTransactions(selectedType);
  const transactions = useMemo(() => {
    const unique = new Map<string, WalletTransaction>();
    for (const page of query.data?.pages ?? []) {
      for (const item of page.items) {
        if (!unique.has(item.id))
          unique.set(item.id, item);
      }
    }
    return Array.from(unique.values());
  }, [query.data]);
  const renderItem = useCallback(({ item }: ListRenderItemInfo<WalletTransaction>) => <TransactionItem transaction={item} onPress={setSelected} />, []);
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetching && !query.isFetchNextPageError)
      void query.fetchNextPage();
  };
  const refresh = () => {
    void query.refetch();
  };
  const closeDetail = () => setSelected(null);
  const support = () => {
    closeDetail();
    router.push(RouteNames.CUSTOMER_SUPPORT as never);
  };
  return (
    <Screen safeArea className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar mode="stack" title="Lịch sử giao dịch" subtitle="Transaction history" onBack={onBack ?? router.back} testID="transaction-history-app-bar" />
      <View testID={worker ? 'worker-transaction-history-screen' : 'customer-transaction-history-screen'} className="flex-1">
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentInsetAdjustmentBehavior="automatic">
            <View className="flex-row gap-2 p-4">
              {(worker ? WORKER_FILTERS : FILTERS).map(filter => (
                <Pressable
                  key={filter.type ?? 'all'}
                  testID={`transaction-filter-${filter.type ?? 'all'}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: selectedType === filter.type }}
                  onPress={() => {
                    setSelectedType(filter.type);
                    setSelected(null);
                  }}
                  className={`rounded-full border px-4 py-2 ${selectedType === filter.type ? 'border-emerald-700 bg-emerald-700' : 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900'}`}
                >
                  <Text className={`font-semibold ${selectedType === filter.type ? 'text-white' : 'text-neutral-700 dark:text-neutral-200'}`}>{filter.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
        <FlashList
          key={selectedType ?? 'all'}
          testID="transaction-history-list"
          data={transactions}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={refresh} />}
          ListEmptyComponent={query.isPending
            ? (
                <View testID="transaction-loading" className="gap-4 p-4">
                  <ActivityIndicator accessibilityLabel="Đang tải giao dịch" />
                  <View className="h-16 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
                  <View className="h-16 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
                </View>
              )
            : query.isError
              ? <Pressable accessibilityRole="button" onPress={refresh} className="p-6"><Text className="text-center text-red-600">Không thể tải giao dịch. Chạm để thử lại.</Text></Pressable>
              : (
                  <View testID="transaction-empty" className="items-center gap-3 p-8">
                    <Text className="text-3xl text-neutral-400">↔</Text>
                    <Text className="text-center text-neutral-500">Chưa có giao dịch nào thuộc bộ lọc này.</Text>
                  </View>
                )}
          ListFooterComponent={query.isFetchingNextPage
            ? <ActivityIndicator accessibilityLabel="Đang tải thêm giao dịch" className="p-4" />
            : query.isFetchNextPageError
              ? <Pressable accessibilityRole="button" onPress={() => { void query.fetchNextPage(); }} className="p-4"><Text className="text-center text-red-600">Tải thêm thất bại. Chạm để thử lại.</Text></Pressable>
              : query.isRefetchError && transactions.length > 0
                ? <Pressable accessibilityRole="button" onPress={refresh} className="p-4"><Text className="text-center text-red-600">Làm mới thất bại. Chạm để thử lại.</Text></Pressable>
                : null}
        />
      </View>
      <TransactionDetailModal transaction={selected} onClose={closeDetail} onSupport={worker ? undefined : support} />
    </Screen>
  );
}
