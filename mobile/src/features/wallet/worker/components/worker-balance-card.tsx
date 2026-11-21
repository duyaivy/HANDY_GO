import type { WalletData } from '../../types/wallet.types';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { WalletIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';
import { StorageKeys } from '@/constants/storage-keys';
import { StorageService } from '@/services/storage/storage-service';
import { formatPointsToVND } from '../../utils/formatters';

type Props = { wallet: WalletData; onWithdraw: () => void; onDeposit: () => void; onDetails: () => void };
export function WorkerBalanceCard({ wallet, onWithdraw, onDeposit, onDetails }: Props) {
  const [hidden, setHidden] = useState(() => StorageService.getItem<boolean>(StorageKeys.WALLET_BALANCE_HIDDEN) === true);
  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    StorageService.setItem(StorageKeys.WALLET_BALANCE_HIDDEN, next);
  };
  return (
    <View testID="worker-balance-card" className="gap-3 rounded-3xl bg-emerald-800 p-5 dark:bg-neutral-900">
      <View className="flex-row items-center gap-3">
        <WalletIcon color="#FFFFFF" size={25} />
        <Text className="flex-1 font-semibold text-white">Số dư khả dụng</Text>
        <Pressable testID="worker-wallet-privacy-btn" accessibilityRole="button" accessibilityLabel={hidden ? 'Hiện số dư' : 'Ẩn số dư'} onPress={toggle} className="p-2"><Text className="text-white">{hidden ? 'Hiện' : 'Ẩn'}</Text></Pressable>
      </View>
      <Text testID="worker-wallet-available" className="text-3xl font-bold text-white">{hidden ? '••••••' : formatPointsToVND(wallet.availableBalance)}</Text>
      <Text className="text-sm text-emerald-100">{`Đang tạm giữ: ${hidden ? '••••••' : formatPointsToVND(wallet.reservedBalance)}`}</Text>
      {wallet.status !== 'active' ? <Text className="text-sm text-amber-200">Ví hiện không hoạt động</Text> : null}
      <View className="flex-row gap-3">
        <Pressable testID="worker-wallet-withdraw-btn" accessibilityRole="button" disabled={wallet.status !== 'active'} onPress={onWithdraw} className="flex-1 items-center rounded-xl bg-white p-3"><Text className="font-bold text-emerald-800">Rút tiền</Text></Pressable>
        <Pressable testID="worker-wallet-deposit-btn" accessibilityRole="button" disabled={wallet.status !== 'active'} onPress={onDeposit} className="flex-1 items-center rounded-xl bg-orange-500 p-3"><Text className="font-bold text-white">Nạp tiền</Text></Pressable>
      </View>
      <Pressable testID="worker-wallet-details-btn" accessibilityRole="button" onPress={onDetails} className="items-center p-2"><Text className="font-semibold text-white">Chi tiết số dư</Text></Pressable>
    </View>
  );
}
