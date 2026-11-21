import type { OrderPaymentRecord, PaymentMethod } from '../../types/payment.types';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { InsufficientWalletBalanceError, useOrderPayment } from '../../hooks/use-order-payment';
import { usePreferredPaymentMethod } from '../../hooks/use-preferred-payment-method';
import { useWallet } from '../../hooks/use-wallet';
import { formatPointsToVND, parseOrderVnd } from '../../utils/formatters';
import { TopupModal } from './topup-modal';

type Props = {
  orderId: string;
  amount: string | number;
  serviceName: string;
  workerName: string;
  initialMethod?: PaymentMethod | null;
  needsConfirmation: boolean;
  onConfirmCompletion: () => Promise<unknown>;
  onResult: (payment: OrderPaymentRecord) => void;
  onClose: () => void;
};

export function OrderPaymentModal({ orderId, amount, serviceName, workerName, initialMethod, needsConfirmation, onConfirmCompletion, onResult, onClose }: Props) {
  const walletState = useWallet();
  const preference = usePreferredPaymentMethod();
  const { processPayment, isPaying } = useOrderPayment(orderId);
  const [method, setMethod] = useState<PaymentMethod>(initialMethod ?? preference.method);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState<number | null>(null);
  const [isTopupOpen, setIsTopupOpen] = useState(false);
  const confirmed = useRef(!needsConfirmation);
  const submitLock = useRef(false);
  const parsedTotal = parseOrderVnd(amount);
  const total = parsedTotal != null && parsedTotal > 0n ? parsedTotal : null;
  const available = BigInt(walletState.wallet?.availableBalance ?? '0');
  const shortfall = total != null && total > available ? total - available : 0n;
  const walletReady = Boolean(walletState.wallet) && !walletState.isError && !walletState.isWalletNotFound && walletState.wallet?.status === 'active';
  const blocked = busy || isPaying || total == null || (method === 'point' && (!walletReady || shortfall > 0n));
  const submit = async () => {
    if (blocked || submitLock.current || total == null)
      return;
    submitLock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!confirmed.current && needsConfirmation) {
        await onConfirmCompletion();
        confirmed.current = true;
      }
      const payment = await processPayment(method, total.toString());
      if (payment.status === 'failed' || payment.status === 'cancelled') {
        setError('Thanh toán chưa thành công. Vui lòng kiểm tra và thử lại.');
      }
      else {
        onResult(payment);
      }
    }
    catch (cause) {
      setError(cause instanceof InsufficientWalletBalanceError
        ? `Số dư vừa thay đổi. Còn thiếu ${formatPointsToVND(cause.shortfall)}. Vui lòng tải lại ví hoặc nạp thêm.`
        : cause instanceof Error ? cause.message : 'Không thể thanh toán. Vui lòng thử lại.');
      void walletState.refetch();
    }
    finally {
      submitLock.current = false;
      setBusy(false);
    }
  };
  const close = () => {
    if (!busy && !isPaying)
      onClose();
  };
  const suggestTopup = () => {
    setTopupAmount(Number(shortfall > 50_000_000n ? 50_000_000n : shortfall < 10_000n ? 10_000n : shortfall));
    setIsTopupOpen(true);
  };
  const closeTopup = () => {
    setIsTopupOpen(false);
    void walletState.refetch();
  };
  return (
    <Modal visible transparent animationType="slide" onRequestClose={isTopupOpen ? closeTopup : close}>
      {!isTopupOpen
        ? (
            <View className="flex-1 justify-center bg-black/60 p-5">
              <View testID="order-payment-modal" className="max-h-[90%] rounded-3xl bg-white p-5 dark:bg-neutral-900">
                <ScrollView contentInsetAdjustmentBehavior="automatic">
                  <Text className="text-xl font-bold text-neutral-900 dark:text-white">Nghiệm thu & thanh toán</Text>
                  <Text className="mt-3 text-neutral-800 dark:text-neutral-200">{serviceName}</Text>
                  <Text className="mt-2 text-neutral-600 dark:text-neutral-400">{`Thợ thực hiện: ${workerName}`}</Text>
                  <Text className="mt-3 font-bold text-neutral-900 dark:text-white">{total == null ? 'Chi phí không hợp lệ. Vui lòng tải lại đơn hàng.' : `Tổng chi phí: ${formatPointsToVND(total.toString())}`}</Text>
                  <Pressable testID="order-payment-point" accessibilityRole="radio" accessibilityState={{ checked: method === 'point', disabled: busy }} disabled={busy} onPress={() => setMethod('point')} className="mt-5 rounded-xl border border-emerald-600 p-4">
                    <Text className="font-semibold text-neutral-900 dark:text-white">{`${method === 'point' ? '◉' : '○'} Ví HandyGo`}</Text>
                    {walletState.isLoading ? <ActivityIndicator accessibilityLabel="Đang tải ví" /> : walletReady ? <Text className="mt-2 text-emerald-700 dark:text-emerald-300">{`Số dư ví: ${formatPointsToVND(available.toString())}`}</Text> : <Text className="mt-2 text-amber-700 dark:text-amber-300">Ví chưa sẵn sàng để thanh toán.</Text>}
                  </Pressable>
                  {method === 'point' && walletReady && total != null ? <Text className="mt-3 text-amber-700 dark:text-amber-300">{shortfall > 0n ? `Số dư ví không đủ (Còn thiếu ${formatPointsToVND(shortfall.toString())})` : `Số dư sau thanh toán: ${formatPointsToVND((available - total).toString())}`}</Text> : null}
                  {method === 'point' && walletReady && shortfall > 0n ? <Pressable testID="order-payment-topup-btn" accessibilityRole="button" disabled={busy} onPress={suggestTopup} className="mt-3 rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950"><Text className="font-semibold text-emerald-700 dark:text-emerald-300">{`+ Nạp thêm ${formatPointsToVND(shortfall.toString())} qua VNPAY`}</Text></Pressable> : null}
                  {method === 'point' && walletReady && shortfall > 0n && (shortfall < 10000n || shortfall > 50000000n) ? <Text className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">Mỗi lần nạp từ 10.000 đ đến 50.000.000 đ. Bạn có thể nạp nhiều lần nếu cần.</Text> : null}
                  {method === 'point' ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => { void walletState.refetch(); }} className="mt-2 p-2"><Text className="text-emerald-700 dark:text-emerald-300">Tải lại số dư ví</Text></Pressable> : null}
                  <Pressable testID="order-payment-cash" accessibilityRole="radio" accessibilityState={{ checked: method === 'cash', disabled: busy }} disabled={busy} onPress={() => setMethod('cash')} className="mt-4 rounded-xl border border-neutral-300 p-4 dark:border-neutral-700">
                    <Text className="font-semibold text-neutral-900 dark:text-white">{`${method === 'cash' ? '◉' : '○'} Tiền mặt trực tiếp cho thợ`}</Text>
                    <Text className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{`Bạn sẽ thanh toán ${total == null ? '' : formatPointsToVND(total.toString())} bằng tiền mặt trực tiếp cho thợ. Thợ sẽ xác nhận đã nhận tiền trên ứng dụng.`}</Text>
                  </Pressable>
                  {error ? <Text testID="order-payment-error" className="mt-3 text-red-600">{error}</Text> : null}
                  {busy || isPaying ? <ActivityIndicator accessibilityLabel="Đang nghiệm thu và thanh toán" className="mt-3" /> : null}
                  <Pressable testID="order-payment-confirm-btn" accessibilityRole="button" accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={() => { void submit(); }} className={`mt-5 rounded-xl p-4 ${blocked ? 'bg-neutral-400' : 'bg-emerald-700'}`}><Text className="text-center font-bold text-white">{method === 'cash' ? 'Xác nhận trả tiền mặt' : `Xác nhận thanh toán ${total == null ? '' : formatPointsToVND(total.toString())}`}</Text></Pressable>
                  <Pressable testID="order-payment-close-btn" accessibilityRole="button" disabled={busy || isPaying} onPress={close} className="mt-2 p-3"><Text className="text-center text-neutral-700 dark:text-white">Đóng</Text></Pressable>
                </ScrollView>
              </View>
            </View>
          )
        : null}
      {topupAmount != null
        ? (
            <TopupModal
              key={topupAmount}
              embedded
              visible={isTopupOpen}
              initialAmount={topupAmount}
              onClose={closeTopup}
            />
          )
        : null}
    </Modal>
  );
}
