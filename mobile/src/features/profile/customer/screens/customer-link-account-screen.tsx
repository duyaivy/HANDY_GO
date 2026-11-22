import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { ShieldCheckIcon, WalletIcon } from '@/components/ui/icons/handy-icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PaymentMethodCard } from '@/features/wallet/customer/components/payment-method-card';
import { TopupModal } from '@/features/wallet/customer/components/topup-modal';
import { usePreferredPaymentMethod } from '@/features/wallet/hooks/use-preferred-payment-method';
import { useWallet } from '@/features/wallet/hooks/use-wallet';
import { formatPointsToVND } from '@/features/wallet/utils/formatters';

export type CustomerLinkAccountScreenProps = { onBack?: () => void };

export function CustomerLinkAccountScreen({ onBack }: CustomerLinkAccountScreenProps = {}) {
  const router = useRouter();
  const walletState = useWallet();
  const preference = usePreferredPaymentMethod();
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const walletReady = Boolean(walletState.wallet) && !walletState.isError && !walletState.isWalletNotFound;
  const canTopup = walletReady && walletState.wallet?.status === 'active';
  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar mode="stack" title="Phương thức thanh toán" subtitle="Liên kết tài khoản & ví" onBack={onBack ?? router.back} testID="link-account-app-bar" />
      <View testID="customer-link-account-screen" className="gap-4 p-4 pb-10">
        <Text className="text-base font-bold text-neutral-900 dark:text-white">Phương thức thanh toán chính</Text>
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">Chọn phương thức mặc định. Lựa chọn được lưu cho tài khoản của bạn trên thiết bị này.</Text>
        <PaymentMethodCard
          testID="payment-method-point"
          title="Ví HandyGo (Điểm thưởng & Nạp tiền)"
          description="Sử dụng điểm ví để thanh toán dịch vụ. 1 VND = 1 Point."
          badge={preference.method === 'point' ? 'Mặc định' : 'Khuyên dùng'}
          icon={<WalletIcon size={26} color="#047857" />}
          selected={preference.method === 'point'}
          onSelect={() => preference.setMethod('point')}
          disabled={!preference.canSave}
        >
          {walletState.isLoading
            ? <ActivityIndicator accessibilityLabel="Đang tải số dư ví" />
            : walletReady
              ? <Text testID="payment-method-wallet-balance" className="font-semibold text-emerald-700 dark:text-emerald-300">{`Số dư khả dụng: ${formatPointsToVND(walletState.wallet?.availableBalance)}`}</Text>
              : <Text className="text-sm text-neutral-500 dark:text-neutral-400">{walletState.isWalletNotFound ? 'Ví của bạn chưa sẵn sàng' : 'Không thể tải số dư ví'}</Text>}
          {walletReady && walletState.wallet?.status !== 'active' ? <Text className="text-sm text-amber-700 dark:text-amber-300">Ví hiện không hoạt động</Text> : null}
        </PaymentMethodCard>
        {walletState.isError ? <Pressable accessibilityRole="button" onPress={() => { void walletState.refetch(); }}><Text className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Thử tải lại số dư</Text></Pressable> : null}
        <PaymentMethodCard
          testID="payment-method-cash"
          title="Tiền mặt (Trực tiếp cho thợ)"
          description="Thanh toán bằng tiền mặt sau khi thợ hoàn thành việc. Thợ sẽ xác nhận đã nhận tiền trên ứng dụng."
          badge={preference.method === 'cash' ? 'Mặc định' : 'Khả dụng'}
          icon={<Text className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">₫</Text>}
          selected={preference.method === 'cash'}
          onSelect={() => preference.setMethod('cash')}
          disabled={!preference.canSave}
        />
        {!preference.canSave ? <Text className="text-sm text-neutral-500">Đăng nhập để lưu phương thức mặc định.</Text> : null}
        <Text className="mt-2 text-base font-bold text-neutral-900 dark:text-white">Cổng thanh toán tích hợp</Text>
        <PaymentMethodCard
          testID="payment-method-vnpay"
          title="Cổng VNPAY (ATM, QR Pay, Thẻ quốc tế)"
          description="Nạp điểm vào Ví HandyGo qua ngân hàng, mã QR VNPAY hoặc thẻ."
          badge="Đã hỗ trợ"
          icon={<Text className="text-xs font-black text-blue-800 dark:text-blue-300">VNPAY</Text>}
        >
          <Pressable testID="payment-method-topup-btn" accessibilityRole="button" accessibilityState={{ disabled: !canTopup }} disabled={!canTopup} onPress={() => setIsTopupOpen(true)} className={`items-center rounded-xl p-3 ${canTopup ? 'bg-emerald-700' : 'bg-neutral-400'}`}>
            <Text className="font-semibold text-white">Nạp tiền ngay</Text>
          </Pressable>
        </PaymentMethodCard>
        <View className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
          <View className="flex-row items-center gap-2">
            <ShieldCheckIcon color="#047857" size={22} />
            <Text className="flex-1 font-bold text-neutral-900 dark:text-white">Bảo mật & quyền lợi</Text>
          </View>
          <Text className="text-sm text-neutral-600 dark:text-neutral-400">Thông tin thẻ được nhập tại cổng VNPAY đạt tiêu chuẩn bảo mật PCI-DSS. Không chia sẻ mã OTP cho người khác.</Text>
          <Text className="text-sm text-neutral-600 dark:text-neutral-400">Nếu thợ không hoàn thành cam kết, bạn có thể yêu cầu hoàn tiền. Sau khi được phê duyệt hoàn toàn phần, 100% giá trị đã thanh toán được hoàn về Ví HandyGo; mức hoàn một phần theo kết quả xử lý khiếu nại.</Text>
        </View>
      </View>
      <TopupModal visible={isTopupOpen} onClose={() => setIsTopupOpen(false)} />
    </Screen>
  );
}
