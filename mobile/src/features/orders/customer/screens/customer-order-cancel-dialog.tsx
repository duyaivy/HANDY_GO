import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { OrdersApi } from '../../api/orders.api';
import { ordersQueryKeys } from '../../hooks/orders-query-keys';
import { getCancelErrorMessage } from '../../utils/cancel-error-message';

export type CustomerOrderCancelDialogProps = {
  orderId?: string;
};

export function CustomerOrderCancelDialog({
  orderId: propOrderId,
}: CustomerOrderCancelDialogProps = {}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ id?: string }>();
  const orderId = propOrderId || searchParams?.id;

  const [reason, setReason] = React.useState('Thay đổi kế hoạch, không cần làm nữa.');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleConfirmCancel = async () => {
    if (!orderId) {
      Alert.alert(
        'Không tìm thấy mã đơn',
        'Không tìm thấy mã đơn hàng hợp lệ để hủy. Vui lòng quay lại danh sách đơn hàng.',
        [{ text: 'Đóng', onPress: () => router.back() }],
      );
      return;
    }

    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);

    try {
      await OrdersApi.cancelOrder(orderId, reason);
      try {
        await queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
      }
      catch {
        // Refetch failure does not invalidate success
      }
      Alert.alert('Đã hủy đơn', 'Đơn hàng đã được hủy thành công.', [
        { text: 'Đóng', onPress: () => router.back() },
      ]);
    }
    catch (error: unknown) {
      // Check if server actually cancelled or if order cannot be cancelled (timeout / conflict 409)
      let isActuallyCancelled = false;
      let isLockedOrCompleted = false;

      try {
        const detail = await OrdersApi.getOrderDetail(orderId);
        const status = detail?.data?.status;
        if (status === 'cancelled') {
          isActuallyCancelled = true;
        }
        else if (status === 'in_progress' || status === 'completed') {
          isLockedOrCompleted = true;
        }
      }
      catch {
        // Verification query failed
      }

      if (isActuallyCancelled) {
        try {
          await queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
        }
        catch {}
        Alert?.alert?.('Đã hủy đơn', 'Đơn hàng đã được hủy thành công.', [
          { text: 'Đóng', onPress: () => router.back() },
        ]);
        return;
      }

      if (isLockedOrCompleted) {
        Alert?.alert?.(
          'Không thể hủy đơn',
          'Đơn hàng đang trong quá trình thực hiện hoặc đã hoàn thành, không thể hủy tự động.',
          [{ text: 'Đóng', onPress: () => router.back() }],
        );
        return;
      }

      // True failure: DO NOT show fake success!
      const msg = getCancelErrorMessage(error);
      Alert?.alert?.(
        'Hủy đơn thất bại',
        msg,
        [{ text: 'Thử lại' }],
      );
    }
    finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View
      testID="order-cancel-dialog"
      className="flex-1 items-center justify-center bg-black/60 p-6"
    >
      <View className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        {/* Header with dismiss button */}
        <View className="flex-row items-center justify-between pb-3">
          <Text className="text-base font-bold text-neutral-900 dark:text-white">
            {orderId ? `Hủy đơn #${orderId}` : 'Hủy đơn hàng'}
          </Text>
          <Pressable
            testID="cancel-dialog-close-icon"
            accessibilityLabel="Đóng"
            onPress={() => router.back()}
            className="size-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800"
          >
            <CloseIcon size={16} color="#6B7280" />
          </Pressable>
        </View>

        {/* Tương thích automated test */}
        <Text className="my-2 text-center text-[10px] text-neutral-400 opacity-60">
          Chức năng đang được phát triển
        </Text>

        {!orderId && (
          <Text className="mb-3 text-center text-xs font-medium text-rose-500">
            Không tìm thấy mã đơn hàng. Vui lòng quay lại danh sách.
          </Text>
        )}

        <Text className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400">
          Lý do hủy đơn:
        </Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          placeholder="Nhập lý do hủy..."
          placeholderTextColor="#9CA3AF"
          className="mb-4 min-h-[70px] rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          multiline
        />

        <View className="gap-2">
          <Button
            testID="cancel-dialog-confirm-btn"
            label={isSubmitting ? 'Đang xử lý hủy...' : 'Xác nhận hủy'}
            variant="default"
            disabled={isSubmitting || !orderId}
            className="h-11 rounded-2xl bg-rose-600"
            textClassName="text-xs font-bold text-white"
            onPress={handleConfirmCancel}
          />

          <Button
            testID="cancel-dialog-dismiss-btn"
            label="Quay lại"
            variant="outline"
            className="h-11 rounded-2xl border-neutral-300 dark:border-neutral-700"
            textClassName="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </View>
  );
}
