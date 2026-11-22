import type { WalletData } from '../../types/wallet.types';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { WalletIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';
import { StorageKeys } from '@/constants/storage-keys';
import { StorageService } from '@/services/storage/storage-service';
import { formatPointsToVND } from '../../utils/formatters';

type Props = {
  wallet?: WalletData;
  isLoading?: boolean;
  isWalletNotFound?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  onTopup: () => void;
  onHistory: () => void;
};

function VisibilityIcon({ hidden }: { hidden: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
      <Path d="M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" />
      {hidden ? <Path d="M3 3l18 18" /> : null}
    </Svg>
  );
}

export function WalletBalanceCard({
  wallet,
  isLoading = false,
  isWalletNotFound = false,
  isError = false,
  onRetry,
  onTopup,
  onHistory,
}: Props) {
  const [hidden, setHidden] = useState(() => StorageService.getItem<boolean>(StorageKeys.WALLET_BALANCE_HIDDEN) === true);
  const toggleHidden = () => {
    const next = !hidden;
    setHidden(next);
    StorageService.setItem(StorageKeys.WALLET_BALANCE_HIDDEN, next);
  };
  const showWallet = Boolean(wallet) && !isLoading && !isError && !isWalletNotFound;
  const canTopup = showWallet && wallet?.status === 'active';
  const available = wallet?.availableBalance ?? '0';
  const reserved = wallet?.reservedBalance ?? '0';

  return (
    <View testID="wallet-balance-card" className="rounded-3xl bg-emerald-700 p-5 dark:bg-neutral-900">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <WalletIcon color="#FFFFFF" size={23} />
          <Text className="text-sm font-semibold text-emerald-50">Số dư khả dụng</Text>
        </View>
        <Pressable
          testID="wallet-visibility-toggle"
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Hiện số dư ví' : 'Ẩn số dư ví'}
          onPress={toggleHidden}
          hitSlop={12}
          className="p-2"
        >
          <VisibilityIcon hidden={hidden} />
        </Pressable>
      </View>

      {isLoading
        ? (
            <View className="min-h-28 justify-center">
              <ActivityIndicator color="#FFFFFF" accessibilityLabel="Đang tải số dư ví" />
            </View>
          )
        : showWallet
          ? (
              <View className="mt-3 min-h-28">
                <Text testID="wallet-balance-amount" className="text-3xl font-bold text-white">
                  {hidden ? '••••••' : formatPointsToVND(available)}
                </Text>
                <Text className="mt-1 text-sm text-emerald-100">
                  {hidden ? '•••••• điểm' : `${formatPointsToVND(available).replace(' đ', '')} điểm`}
                </Text>
                <Text className="mt-4 text-xs text-emerald-100">
                  {hidden ? 'Đang tạm giữ: ••••••' : `Đang tạm giữ: ${formatPointsToVND(reserved)}`}
                </Text>
                {wallet?.status !== 'active'
                  ? <Text className="mt-1 text-xs text-amber-200">Ví hiện không hoạt động</Text>
                  : null}
              </View>
            )
          : (
              <View className="min-h-28 justify-center">
                <Text className="font-semibold text-white">
                  {isWalletNotFound ? 'Ví của bạn chưa sẵn sàng' : 'Không thể tải số dư ví'}
                </Text>
                {isError && onRetry
                  ? (
                      <Pressable accessibilityRole="button" onPress={onRetry} className="mt-2 self-start py-1">
                        <Text className="text-sm font-semibold text-emerald-100">Thử lại</Text>
                      </Pressable>
                    )
                  : null}
              </View>
            )}

      <View className="mt-4 flex-row gap-3">
        <Pressable
          testID="wallet-topup-btn"
          accessibilityRole="button"
          accessibilityLabel="Nạp tiền vào ví"
          accessibilityState={{ disabled: !canTopup }}
          disabled={!canTopup}
          onPress={onTopup}
          className={`flex-1 items-center rounded-xl p-3 ${canTopup ? 'bg-white' : 'bg-neutral-300'}`}
        >
          <Text className="text-sm font-bold text-emerald-800">+ Nạp ví</Text>
        </Pressable>
        <Pressable
          testID="wallet-history-btn"
          accessibilityRole="button"
          accessibilityLabel="Xem lịch sử giao dịch ví"
          onPress={onHistory}
          className="flex-1 items-center rounded-xl border border-emerald-200 p-3"
        >
          <Text className="text-sm font-semibold text-white">Lịch sử GD</Text>
        </Pressable>
      </View>
    </View>
  );
}
