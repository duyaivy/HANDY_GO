import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/stores/use-auth-store';
import { PaymentApi } from '../../api/payment.api';
import { useWorkerConfirmCash } from '../../hooks/use-worker-confirm-cash';
import { walletQueryKeys } from '../../hooks/wallet-query-keys';
import { formatPointsToVND } from '../../utils/formatters';

export function WorkerCashPaymentCard({ orderId, completed }: { orderId: string; completed: boolean }) {
  const userId = useAuthStore.use.user()?.id;
  const query = useQuery({ queryKey: walletQueryKeys.paymentByOrder(orderId), queryFn: async () => (await PaymentApi.getPaymentByOrder(orderId)).data, enabled: completed, retry: false, refetchInterval: state => state.state.data && ['pending', 'processing', 'failed'].includes(state.state.data.status) ? 5000 : false });
  const confirmation = useWorkerConfirmCash();
  const lock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  if (!completed)
    return null;
  const payment = query.data;
  const eligible = payment?.method === 'cash' && payment.workerUserId === userId && (payment.status === 'pending' || payment.status === 'failed') && Boolean(payment.orderCompletedAt);
  const confirm = async () => {
    if (!eligible || !payment || lock.current)
      return;
    lock.current = true;
    setError(null);
    try {
      const result = await confirmation.confirmCash(payment.id);
      if (result.status !== 'succeeded')
        setError('Máy chủ chưa xác nhận thanh toán hoàn tất. Vui lòng tải lại.');
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xác nhận. Vui lòng thử lại.');
      void query.refetch();
    }
    finally { lock.current = false; }
  };
  const requestConfirm = () => {
    if (!eligible || confirmation.isPending || lock.current)
      return;
    Alert.alert('Xác nhận nhận tiền mặt', `Bạn đã nhận đủ ${formatPointsToVND(payment!.amount)} từ khách hàng?`, [
      { text: 'Chưa nhận', style: 'cancel' },
      { text: 'Đã nhận đủ tiền', onPress: () => { void confirm(); } },
    ]);
  };
  return (
    <View testID="worker-cash-payment-card" className="my-4 gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <Text className="font-bold text-neutral-900 dark:text-white">Thanh toán đơn việc</Text>
      {query.isPending
        ? <ActivityIndicator accessibilityLabel="Đang tải thanh toán" />
        : query.isError
          ? <Pressable accessibilityRole="button" onPress={() => { void query.refetch(); }}><Text className="text-red-600">Không thể tải thanh toán. Chạm để thử lại.</Text></Pressable>
          : payment
            ? (
                <>
                  <Text className="font-bold text-neutral-900 dark:text-white">{`${payment.method === 'cash' ? 'Khách thanh toán tiền mặt' : payment.method === 'point' ? 'Khách thanh toán điểm ví' : 'Chưa chọn phương thức'}: ${formatPointsToVND(payment.amount)}`}</Text>
                  <Text testID="worker-payment-status" className="text-sm text-neutral-700 dark:text-neutral-300">{payment.status === 'succeeded' ? 'Đã thanh toán' : payment.status === 'refunded' || payment.status === 'partially_refunded' ? 'Đã hoàn tiền' : payment.status === 'processing' ? 'Đang xử lý thanh toán' : payment.status === 'cancelled' ? 'Thanh toán đã hủy' : payment.method === 'cash' ? 'Chờ thợ xác nhận nhận tiền mặt' : 'Chưa thanh toán'}</Text>
                  <Text className="text-sm text-neutral-700 dark:text-neutral-300">{`Phí sàn theo đơn: ${formatPointsToVND(payment.platformFee)}`}</Text>
                  {payment.method === 'cash' ? <Text className="text-sm text-neutral-600 dark:text-neutral-400">Tiền mặt không được cộng vào ví thợ. Máy chủ cấn trừ hoa hồng; nếu số dư chưa đủ, khoản chưa thu vẫn là công nợ.</Text> : null}
                  {eligible
                    ? (
                        <>
                          <Text className="text-sm text-amber-800 dark:text-amber-200">Vui lòng kiểm tra đã nhận đủ tiền mặt từ khách hàng trước khi xác nhận.</Text>
                          <Pressable testID="worker-confirm-cash-btn" accessibilityRole="button" accessibilityState={{ disabled: confirmation.isPending }} disabled={confirmation.isPending} onPress={requestConfirm} className="items-center rounded-xl bg-emerald-700 p-3"><Text className="font-bold text-white">{confirmation.isPending ? 'Đang xác nhận...' : '💵 Xác Nhận Đã Nhận Đủ Tiền Mặt'}</Text></Pressable>
                        </>
                      )
                    : null}
                  {payment.status === 'succeeded' && payment.method === 'cash' ? <Text className="font-semibold text-emerald-700 dark:text-emerald-300">Đã xác nhận nhận tiền mặt</Text> : null}
                </>
              )
            : null}
      {error ? <Text testID="worker-confirm-cash-error" className="text-red-600">{error}</Text> : null}
    </View>
  );
}
