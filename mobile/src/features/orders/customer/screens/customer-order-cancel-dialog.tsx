import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';

export type CustomerOrderCancelDialogProps = {
  orderId?: string;
};

export function CustomerOrderCancelDialog({ orderId: propOrderId }: CustomerOrderCancelDialogProps = {}) {
  const router = useRouter();
  const searchParams = typeof useLocalSearchParams === 'function' ? useLocalSearchParams<{ id?: string }>() : {};
  const orderId = propOrderId || searchParams?.id || 'demo-001';

  return (
    <View
      testID="order-cancel-dialog"
      className="flex-1 items-center justify-center bg-black/60 p-6"
    >
      <View className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        {/* Header with dismiss button */}
        <View className="flex-row items-center justify-between pb-3">
          <Text className="text-base font-bold text-neutral-900 dark:text-white">
            {`Hủy đơn #${orderId}`}
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

        <Text className="my-6 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Chức năng đang được phát triển
        </Text>

        <Button
          testID="cancel-dialog-dismiss-btn"
          label="Đóng"
          variant="outline"
          className="h-11 rounded-2xl border-neutral-300 dark:border-neutral-700"
          textClassName="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}
