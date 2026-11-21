import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useWallet } from '../../hooks/use-wallet';
import { useWorkerFinancials } from '../../hooks/use-worker-financials';
import { formatPointsToVND } from '../../utils/formatters';
import { WorkerEarningsSummary } from '../components/worker-earnings-summary';

export function WorkerBalanceScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const finances = useWorkerFinancials();
  return (
    <Screen safeArea scrollable refreshControl={<RefreshControl refreshing={wallet.isLoading} onRefresh={() => { void Promise.all([wallet.refetch(), finances.refetch()]); }} />} className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar mode="stack" title="HANDY_GO balance" subtitle="Số dư ví" role="Worker" onBack={router.back} />
      <View testID="worker-balance-screen" className="gap-4 p-4">
        {wallet.isLoading
          ? <ActivityIndicator />
          : wallet.wallet && !wallet.isError
            ? (
                <View className="gap-3 rounded-2xl bg-white p-4 dark:bg-neutral-900">
                  <Text className="font-bold text-neutral-900 dark:text-white">{`Tổng số dư ví: ${formatPointsToVND(wallet.wallet.balance)}`}</Text>
                  <Text className="text-emerald-700 dark:text-emerald-300">{`Khả dụng: ${formatPointsToVND(wallet.availableBalance)}`}</Text>
                  <Text className="text-amber-700 dark:text-amber-300">{`Đang tạm giữ: ${formatPointsToVND(wallet.reservedBalance)}`}</Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">Số dư tạm giữ có thể bao gồm lệnh rút đang xử lý. Máy chủ chưa cung cấp số cọc nhận việc tách riêng; không coi toàn bộ khoản tạm giữ là tiền cọc.</Text>
                </View>
              )
            : <Pressable accessibilityRole="button" onPress={() => { void wallet.refetch(); }}><Text className="text-red-600">{wallet.isWalletNotFound ? 'Ví của bạn chưa sẵn sàng' : 'Không thể tải số dư. Chạm để thử lại.'}</Text></Pressable>}
        <WorkerEarningsSummary />
        {finances.data?.summary && !finances.isError
          ? (
              <View className="gap-2 rounded-2xl bg-white p-4 dark:bg-neutral-900">
                <Text testID="worker-cash-commission-due" className="font-semibold text-amber-700 dark:text-amber-300">{`Phí nền tảng tiền mặt chưa ghi nhận thu: ${formatPointsToVND(finances.data.summary.cashCommissionDue)}`}</Text>
                <Text className="text-xs text-neutral-500 dark:text-neutral-400">Đối chiếu phí theo payment đã nhận tiền mặt với bút toán commission_debit cùng mã payment. Có thể chênh lệch tạm thời trong lúc các dịch vụ đồng bộ; kéo xuống để cập nhật.</Text>
              </View>
            )
          : null}
        <Pressable testID="worker-balance-history-btn" accessibilityRole="button" onPress={() => router.push(RouteNames.WORKER_WALLET_HISTORY as never)} className="items-center rounded-xl bg-emerald-700 p-3"><Text className="font-semibold text-white">Lịch sử biến động số dư</Text></Pressable>
      </View>
    </Screen>
  );
}
