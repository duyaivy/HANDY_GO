import type { WalletTransaction, WalletTransactionType } from '@/features/wallet/types/wallet.types';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { WalletApi } from '@/features/wallet/api/wallet.api';
import { TopupModal } from '@/features/wallet/customer/components/topup-modal';
import { WalletBalanceCard } from '@/features/wallet/customer/components/wallet-balance-card';
import { useWallet } from '@/features/wallet/hooks/use-wallet';
import { walletQueryKeys } from '@/features/wallet/hooks/wallet-query-keys';
import { formatPointsToVND, getTransactionSign } from '@/features/wallet/utils/formatters';

const TRANSACTION_LABELS: Record<WalletTransactionType, string> = {
  topup: 'Nạp tiền vào ví',
  payment_debit: 'Thanh toán đơn hàng',
  worker_earning: 'Thu nhập đơn hàng',
  platform_fee: 'Phí nền tảng',
  refund_credit: 'Hoàn tiền',
  refund_recovery: 'Thu hồi hoàn tiền',
  withdrawal: 'Rút tiền',
  commission_debit: 'Phí hoa hồng',
  commission_credit: 'Thu hoa hồng',
  adjustment_funding: 'Điều chỉnh nguồn tiền',
  adjustment_recovery: 'Thu hồi điều chỉnh',
  admin_adjustment: 'Điều chỉnh số dư',
};

function transactionAmount(transaction: WalletTransaction): string {
  // Wallet Query does not expose direction for an admin adjustment.
  try {
    return `${getTransactionSign(transaction.type)}${formatPointsToVND(transaction.amount)}`;
  }
  catch {
    return formatPointsToVND(transaction.amount);
  }
}

export type CustomerPaymentScreenProps = {
  onBack?: () => void;
};

export function CustomerPaymentScreen({ onBack }: CustomerPaymentScreenProps = {}) {
  const router = useRouter();
  const [isTopupModalOpen, setIsTopupModalOpen] = React.useState(false);
  const walletState = useWallet();
  const recentQuery = useQuery({
    queryKey: walletQueryKeys.transactions({ page: 1, limit: 3 }),
    queryFn: async () => (await WalletApi.getMyTransactions({ page: 1, limit: 3 })).data,
    enabled: Boolean(walletState.wallet),
    staleTime: 60_000,
  });

  const goToHistory = () => router.push(RouteNames.CUSTOMER_PAYMENT_TRANSACTION_HISTORY as never);
  const handleBack = () => {
    if (onBack)
      onBack();
    else router.back();
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar mode="stack" title="Quản lý thanh toán" subtitle="Payment" onBack={handleBack} testID="payment-app-bar" />

      <View testID="customer-payment-screen" className="flex-1 p-4 pb-10">
        <WalletBalanceCard
          wallet={walletState.wallet}
          isLoading={walletState.isLoading}
          isWalletNotFound={walletState.isWalletNotFound}
          isError={walletState.isError}
          onRetry={() => { void walletState.refetch(); }}
          onTopup={() => setIsTopupModalOpen(true)}
          onHistory={goToHistory}
        />

        <View className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">Phương thức thanh toán</Text>
              <Text className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">Ví HandyGo, VNPAY và tiền mặt</Text>
            </View>
            <Button
              testID="payment-linked-btn"
              label="Linked"
              variant="outline"
              className="h-9 rounded-xl border-primary px-4"
              textClassName="text-xs font-bold text-primary"
              onPress={() => router.push(RouteNames.CUSTOMER_PAYMENT_LINK_ACCOUNT as never)}
            />
          </View>
        </View>

        <View className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">Lịch sử giao dịch gần đây</Text>
            <Pressable
              testID="payment-see-all-transactions-btn"
              accessibilityRole="button"
              accessibilityLabel="Xem tất cả lịch sử giao dịch"
              onPress={goToHistory}
              className="py-1"
            >
              <Text className="text-xs font-semibold text-primary">See all &gt;</Text>
            </Pressable>
          </View>

          {recentQuery.isLoading && walletState.wallet
            ? <ActivityIndicator className="mt-5" accessibilityLabel="Đang tải giao dịch" />
            : null}
          {recentQuery.isError
            ? (
                <Pressable accessibilityRole="button" onPress={() => { void recentQuery.refetch(); }} className="mt-4">
                  <Text className="text-sm text-red-600">Không thể tải giao dịch. Chạm để thử lại.</Text>
                </Pressable>
              )
            : null}
          {recentQuery.data?.items.length === 0
            ? <Text className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">Chưa có giao dịch nào.</Text>
            : null}
          {recentQuery.data?.items.slice(0, 3).map(transaction => (
            <View key={transaction.id} className="mt-4 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <View className="flex-1 pr-3">
                <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                  {TRANSACTION_LABELS[transaction.type] ?? 'Giao dịch ví'}
                </Text>
                <Text className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  {new Date(transaction.createdAt).toLocaleDateString('vi-VN')}
                </Text>
              </View>
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">{transactionAmount(transaction)}</Text>
            </View>
          ))}
        </View>
      </View>

      <TopupModal visible={isTopupModalOpen} onClose={() => setIsTopupModalOpen(false)} />
    </Screen>
  );
}
