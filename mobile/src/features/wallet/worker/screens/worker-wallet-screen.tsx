import type { WalletTransaction } from '../../types/wallet.types';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { TransactionDetailModal } from '../../customer/components/transaction-detail-modal';
import { TransactionItem } from '../../customer/components/transaction-item';
import { useWallet } from '../../hooks/use-wallet';
import { useWorkerFinancials } from '../../hooks/use-worker-financials';
import { WorkerBalanceCard } from '../components/worker-balance-card';
import { WorkerEarningsSummary } from '../components/worker-earnings-summary';

export function WorkerWalletScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const financials = useWorkerFinancials();
  const [selected, setSelected] = useState<WalletTransaction | null>(null);
  const refresh = () => {
    void Promise.all([wallet.refetch(), financials.refetch()]);
  };
  return (
    <Screen safeArea scrollable refreshControl={<RefreshControl refreshing={wallet.isLoading} onRefresh={refresh} />} className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar mode="stack" title="Ví & Thu nhập" role="Worker" hideBackButton />
      <View testID="worker-wallet-screen" className="gap-4 p-4 pb-10">
        {wallet.isLoading ? <ActivityIndicator accessibilityLabel="Đang tải số dư ví" /> : wallet.isWalletNotFound ? <Text className="text-amber-700">Ví của bạn chưa sẵn sàng</Text> : wallet.isError ? <Pressable accessibilityRole="button" onPress={() => { void wallet.refetch(); }}><Text className="text-red-600">Không thể tải ví. Chạm để thử lại.</Text></Pressable> : wallet.wallet ? <WorkerBalanceCard wallet={wallet.wallet} onDeposit={() => router.push(RouteNames.WORKER_WALLET_DEPOSIT as never)} onWithdraw={() => router.push(RouteNames.WORKER_WALLET_WITHDRAW as never)} onDetails={() => router.push(RouteNames.WORKER_BALANCE as never)} /> : null}
        <WorkerEarningsSummary />
        <Pressable testID="worker-wallet-cash-payments-btn" accessibilityRole="button" onPress={() => router.push(RouteNames.WORKER_WALLET_CASH_PAYMENTS as never)} className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"><Text className="font-bold text-amber-800 dark:text-amber-200">Đơn tiền mặt chờ xác nhận →</Text></Pressable>
        <View className="gap-3 rounded-2xl bg-white py-4 dark:bg-neutral-900">
          <Text className="px-4 font-bold text-neutral-900 dark:text-white">5 giao dịch ví mới nhất</Text>
          {!financials.isAuthenticated ? <Text className="px-4 text-neutral-500">Đăng nhập để xem lịch sử.</Text> : financials.isPending ? <ActivityIndicator /> : financials.isError ? <Pressable accessibilityRole="button" onPress={() => { void financials.refetch(); }} className="px-4"><Text className="text-red-600">Không thể tải lịch sử. Chạm để thử lại.</Text></Pressable> : financials.data?.transactions.length === 0 ? <Text className="px-4 text-neutral-500">Chưa có giao dịch ví.</Text> : financials.data?.transactions.slice(0, 5).map(transaction => <TransactionItem key={transaction.id} transaction={transaction} onPress={setSelected} />)}
          <Pressable testID="worker-wallet-history-btn" accessibilityRole="button" onPress={() => router.push(RouteNames.WORKER_WALLET_HISTORY as never)} className="px-4 py-2"><Text className="font-semibold text-emerald-700 dark:text-emerald-300">Xem tất cả lịch sử</Text></Pressable>
        </View>
      </View>
      <TransactionDetailModal transaction={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}
