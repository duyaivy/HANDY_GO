import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export type CustomerOrderDetailScreenProps = {
  orderId: string;
};

export function CustomerOrderDetailScreen({ orderId }: CustomerOrderDetailScreenProps) {
  const router = useRouter();

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="orders-customer-detail-screen" className="flex-1 items-center justify-center px-6 py-12">
        <View className="mb-6 size-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-md">
          <Text className="text-2xl font-bold text-white">📋</Text>
        </View>

        <Text className="text-center text-2xl font-bold text-neutral-900 dark:text-white">
          Chi tiết đơn hàng của Khách
        </Text>
        <Text className="mt-1 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Route: /customer/orders/[id]
        </Text>

        {/* Order ID Display Card */}
        <View className="mt-6 w-full items-center rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40">
          <Text className="text-xs font-semibold text-blue-600 uppercase dark:text-blue-400">
            Mã đơn hàng nhận từ Route params
          </Text>
          <Text
            testID="orders-customer-detail-order-id"
            className="mt-1 text-2xl font-extrabold text-blue-700 dark:text-blue-300"
          >
            {orderId || '(chưa có ID)'}
          </Text>
        </View>

        {/* Module / Owner Info Card */}
        <View className="mt-6 w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="text-xs font-semibold tracking-wider text-blue-600 uppercase dark:text-blue-400">
            Thông tin Module
          </Text>
          <Text className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
            Thư mục:
            {' '}
            <Text className="font-semibold text-neutral-900 dark:text-white">src/features/orders/customer/</Text>
          </Text>
          <Text className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
            Người phụ trách:
            {' '}
            <Text className="font-semibold text-neutral-900 dark:text-white">Customer Orders Owner</Text>
          </Text>

          <View className="mt-4 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
            <Text className="text-xs/relaxed text-neutral-600 dark:text-neutral-400">
              Màn hình chi tiết đơn nằm ngoài thanh tab navigator. Màn hình có header Stack và nút Back để quay lại danh sách đơn hàng.
            </Text>
          </View>
        </View>

        {/* Action Button */}
        <View className="mt-8 w-full">
          <Button
            testID="orders-customer-detail-back-btn"
            label="Quay lại danh sách đơn"
            variant="outline"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Screen>
  );
}
