import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TopupModal } from '../../customer/components/topup-modal';
import { useWallet } from '../../hooks/use-wallet';
import { formatPointsToVND } from '../../utils/formatters';

export function WorkerDepositScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const [amount, setAmount] = useState(200000);
  const [visible, setVisible] = useState(false);
  const ready = wallet.status === 'active' && !wallet.isLoading && !wallet.isError && !wallet.isWalletNotFound;
  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar mode="stack" title="Nạp tiền ví ký quỹ" role="Worker" onBack={router.back} />
      <View testID="wallet-deposit-screen" className="gap-4 p-4">
        <Text className="text-base font-semibold text-neutral-900 dark:text-white">Tiền nạp vào ví dùng để cấn trừ hoa hồng sàn khi nhận việc thanh toán tiền mặt.</Text>
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">1 VND = 1 Point. Tiền chỉ được cộng khi máy chủ xác nhận nạp hoàn tất. Nạp ví không tự tạo một khoản cọc tách riêng.</Text>
        {wallet.isLoading ? <ActivityIndicator /> : wallet.wallet ? <Text testID="worker-deposit-balance" className="font-bold text-emerald-700 dark:text-emerald-300">{`Số dư khả dụng: ${formatPointsToVND(wallet.availableBalance)}`}</Text> : <Text className="text-amber-700">{wallet.isWalletNotFound ? 'Ví của bạn chưa sẵn sàng' : 'Không thể tải số dư ví'}</Text>}
        {wallet.isError ? <Pressable accessibilityRole="button" onPress={() => { void wallet.refetch(); }}><Text className="text-emerald-700">Thử tải lại ví</Text></Pressable> : null}
        <View className="flex-row flex-wrap gap-3">{[200000, 500000, 1000000, 2000000].map(value => <Pressable key={value} testID={`worker-deposit-amount-${value}`} accessibilityRole="button" accessibilityState={{ selected: amount === value }} onPress={() => setAmount(value)} className={`rounded-xl border p-3 ${amount === value ? 'border-emerald-600 bg-emerald-50' : 'border-neutral-300 dark:border-neutral-700'}`}><Text className="font-semibold text-emerald-800 dark:text-emerald-300">{formatPointsToVND(value)}</Text></Pressable>)}</View>
        <Pressable testID="worker-deposit-open-btn" accessibilityRole="button" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => setVisible(true)} className={`items-center rounded-xl p-4 ${ready ? 'bg-orange-500' : 'bg-neutral-400'}`}><Text className="font-bold text-white">Tiếp tục nạp qua VNPAY</Text></Pressable>
      </View>
      <TopupModal key={amount} initialAmount={amount} visible={visible} onClose={() => setVisible(false)} />
    </Screen>
  );
}
