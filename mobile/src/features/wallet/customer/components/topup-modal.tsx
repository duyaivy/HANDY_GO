import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { ShieldCheckIcon } from '@/components/ui/icons/handy-icons';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useTopup } from '../../hooks/use-topup';
import { formatPointsToVND } from '../../utils/formatters';

const QUICK_AMOUNTS = [50_000, 100_000, 200_000, 500_000, 1_000_000, 2_000_000];
const MIN_TOPUP = 10_000;
const MAX_TOPUP = 50_000_000;

type Props = {
  visible: boolean;
  onClose: () => void;
  initialAmount?: number;
  embedded?: boolean;
};

export function TopupModal({ visible, onClose, initialAmount, embedded = false }: Props) {
  const {
    createTopup,
    startVnpayCheckout,
    simulateTopup,
    activeTopup,
    refreshTopup,
    isCreating,
    isPolling,
    isSimulating,
    hasPollingTimedOut,
  } = useTopup();
  const [digits, setDigits] = useState(() => initialAmount == null ? '' : String(Math.min(MAX_TOPUP, Math.max(MIN_TOPUP, Math.ceil(initialAmount)))));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submitLock = useRef(false);
  const amount = digits ? Number(digits) : 0;
  const validAmount = Number.isSafeInteger(amount) && amount >= MIN_TOPUP && amount <= MAX_TOPUP;
  const busy = isSubmitting || isCreating || isSimulating || isPolling;
  const displayedTopup = activeTopup?.amountVnd === String(amount) ? activeTopup : null;
  const isSandboxTopup = displayedTopup?.isSimulated === true || displayedTopup?.provider === 'mock';
  const awaitingCredit = displayedTopup?.status === 'paid' || displayedTopup?.status === 'credit_pending' || displayedTopup?.status === 'needs_review';

  const onAmountChange = (text: string) => {
    const onlyDigits = text.replace(/\D/g, '').slice(0, 9);
    setDigits(onlyDigits ? String(Number(onlyDigits)) : '');
    setError(null);
  };

  const submit = async (simulate: boolean) => {
    if (!validAmount || busy || submitLock.current)
      return;
    submitLock.current = true;
    setIsSubmitting(true);
    setError(null);
    try {
      // Replaying the same idempotency key also refreshes a checkout that may have been paid elsewhere.
      const record = await createTopup(amount);
      if (record.providerPaidAt || ['paid', 'credit_pending', 'needs_review', 'completed'].includes(record.status))
        return;
      if (['failed', 'cancelled', 'expired'].includes(record.status))
        throw new Error('Giao dịch trước đã kết thúc. Vui lòng bấm lại để tạo yêu cầu nạp mới.');
      if (simulate) {
        if (!record.isSimulated || record.provider !== 'mock') {
          throw new Error('Backend hiện chưa bật chế độ nạp thử.');
        }
        await simulateTopup(record.id);
      }
      else if (!record.isSimulated && record.provider !== 'mock') {
        if (!record.checkoutUrl) {
          throw new Error('Không có đường dẫn thanh toán. Vui lòng thử lại.');
        }
        await startVnpayCheckout(record.checkoutUrl, record.id);
      }
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tạo yêu cầu nạp tiền. Vui lòng thử lại.');
    }
    finally {
      submitLock.current = false;
      setIsSubmitting(false);
    }
  };

  const validationMessage = digits && !validAmount
    ? amount < MIN_TOPUP
      ? 'Số tiền nạp tối thiểu là 10.000 đ.'
      : 'Số tiền nạp tối đa là 50.000.000 đ.'
    : null;

  const content = (
    <View className="flex-1 justify-end bg-black/60">
      <View className="max-h-[90%] rounded-t-3xl bg-white px-5 pt-5 pb-12 dark:bg-neutral-900">
        <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-xl font-bold text-neutral-900 dark:text-white">Nạp điểm vào Ví HandyGo</Text>
              <Text className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">1 VND = 1 Point</Text>
            </View>
            <Pressable testID="topup-close-btn" accessibilityRole="button" accessibilityLabel="Đóng nạp tiền" onPress={onClose} className="px-2 py-1">
              <Text className="text-xl text-neutral-600 dark:text-neutral-200">×</Text>
            </Pressable>
          </View>

          <Text className="mt-6 mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100">Chọn nhanh số tiền</Text>
          <View className="flex-row flex-wrap gap-2">
            {QUICK_AMOUNTS.map(value => (
              <Pressable
                key={value}
                testID={`topup-amount-${value}`}
                accessibilityRole="button"
                accessibilityLabel={`Chọn ${formatPointsToVND(value)}`}
                accessibilityState={{ selected: amount === value }}
                disabled={busy}
                onPress={() => onAmountChange(String(value))}
                className={`rounded-xl border px-3 py-2 ${amount === value ? 'border-emerald-700 bg-emerald-50 dark:bg-emerald-950' : 'border-neutral-200 dark:border-neutral-700'}`}
              >
                <Text className="text-sm font-semibold text-neutral-800 dark:text-white">{formatPointsToVND(value)}</Text>
              </Pressable>
            ))}
          </View>

          <View className="mt-5">
            <Input
              testID="topup-amount-input"
              label="Số tiền nạp (VND)"
              keyboardType="number-pad"
              placeholder="Từ 10.000 đến 50.000.000"
              value={digits ? formatPointsToVND(digits).replace(' đ', '') : ''}
              onChangeText={onAmountChange}
              disabled={busy}
              error={validationMessage ?? undefined}
            />
            <Text className="text-xs text-neutral-500 dark:text-neutral-400">
              Điểm nhận được:
              {' '}
              {validAmount ? formatPointsToVND(amount).replace(' đ', '') : '0'}
              {' '}
              Point
            </Text>
          </View>

          {error ? <Text testID="topup-error" className="mt-3 text-sm text-red-600">{error}</Text> : null}
          {isSandboxTopup
            ? (
                <Text testID="topup-sandbox-notice" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
                  {__DEV__
                    ? displayedTopup?.status === 'awaiting_payment'
                      ? 'Đây là giao dịch thử nghiệm, không trừ tiền ngân hàng. Bấm nút Giả lập nạp thành công bên dưới để xác nhận nạp thử.'
                      : 'Đây là giao dịch thử nghiệm, không trừ tiền ngân hàng.'
                    : 'Môi trường đang dùng nạp tiền thử nghiệm. Cổng VNPAY chưa được cấu hình.'}
                </Text>
              )
            : null}
          {displayedTopup
            ? (
                <Text testID="topup-status" className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
                  {displayedTopup.status === 'completed'
                    ? 'Nạp tiền thành công. Số dư ví đã được cập nhật.'
                    : displayedTopup.status === 'paid' || displayedTopup.status === 'credit_pending'
                      ? 'Đã thanh toán, đang chờ cộng điểm vào ví...'
                      : displayedTopup.status === 'needs_review'
                        ? 'Giao dịch đang được kiểm tra. Vui lòng kiểm tra lại trạng thái sau.'
                        : displayedTopup.status === 'awaiting_payment'
                          ? isSandboxTopup ? 'Đang chờ xác nhận nạp thử...' : 'Đang chờ xác nhận thanh toán...'
                          : `Trạng thái nạp tiền: ${displayedTopup.status}`}
                </Text>
              )
            : null}
          {hasPollingTimedOut
            ? <Text className="mt-2 text-sm text-amber-700">{awaitingCredit ? 'Ví chưa cập nhật sau thanh toán. Vui lòng kiểm tra lại trạng thái sau ít phút.' : 'Chưa nhận được xác nhận. Hãy kiểm tra lại lịch sử nạp tiền sau ít phút.'}</Text>
            : null}
          {awaitingCredit
            ? (
                <Pressable
                  testID="topup-refresh-btn"
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    if (displayedTopup)
                      void refreshTopup(displayedTopup.id).catch(cause => setError(cause instanceof Error ? cause.message : 'Không thể kiểm tra trạng thái nạp tiền.'));
                  }}
                  className="mt-3 rounded-xl border border-emerald-600 p-3"
                >
                  <Text className="text-center font-semibold text-emerald-700 dark:text-emerald-300">Kiểm tra lại trạng thái nạp tiền</Text>
                </Pressable>
              )
            : null}
          {busy
            ? (
                <View className="mt-3 flex-row items-center gap-2">
                  <ActivityIndicator color="#047857" />
                  <Text className="text-sm text-neutral-600 dark:text-neutral-300">{isPolling ? 'Đang xác nhận nạp tiền...' : 'Đang xử lý...'}</Text>
                </View>
              )
            : null}

          {isSandboxTopup
            ? null
            : (
                <Pressable
                  testID="topup-vnpay-btn"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !validAmount || busy || awaitingCredit }}
                  disabled={!validAmount || busy || awaitingCredit}
                  onPress={() => { void submit(false); }}
                  className={`mt-6 flex-row items-center justify-center gap-2 rounded-xl p-4 ${validAmount && !busy && !awaitingCredit ? 'bg-emerald-700' : 'bg-neutral-300'}`}
                >
                  <Text className="text-base font-bold text-white">Thanh toán qua Cổng</Text>
                  <Text className="text-base font-black text-white">VNPAY</Text>
                  <ShieldCheckIcon color="#FFFFFF" size={18} />
                </Pressable>
              )}

          {__DEV__
            ? (
                <Pressable
                  testID="topup-simulate-btn"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !validAmount || busy || awaitingCredit }}
                  disabled={!validAmount || busy || awaitingCredit}
                  onPress={() => { void submit(true); }}
                  className="mt-3 items-center rounded-xl border border-dashed border-emerald-600 px-4 py-3"
                >
                  <Text className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">⚡ [Sandbox] Giả lập nạp thành công</Text>
                </Pressable>
              )
            : null}
        </ScrollView>
      </View>
    </View>
  );
  return embedded
    ? visible ? content : null
    : <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>{content}</Modal>;
}
