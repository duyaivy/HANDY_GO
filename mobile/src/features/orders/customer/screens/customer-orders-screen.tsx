import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';

export function CustomerOrdersScreen() {
  const router = useRouter();

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="orders-customer-screen" className="flex-1 items-center justify-center px-6 py-12">
        <View className="mb-6 size-16 items-center justify-center rounded-2xl bg-blue-600 shadow-md">
          <Text className="text-2xl font-bold text-white">📦</Text>
        </View>

        <Text className="text-center text-2xl font-bold text-neutral-900 dark:text-white">
          Danh sách đơn hàng của Khách
        </Text>
        <Text className="mt-1 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Route: /customer/orders
        </Text>

        <View className="mt-8 w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
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
              Đây là placeholder danh sách đơn hàng của Khách hàng. Quản lý danh sách đơn, trạng thái đơn, lọc theo ngày và kết nối API Gateway sẽ do người phụ trách Customer Orders phát triển.
            </Text>
          </View>
        </View>

        {/* Action button to open demo order detail */}
        <View className="mt-8 w-full">
          <Button
            testID="orders-customer-open-demo"
            label="Mở chi tiết đơn mẫu (demo-001)"
            variant="default"
            onPress={() => router.push(RouteNames.CUSTOMER_ORDER_DETAIL('demo-001'))}
          />
        </View>
      </View>
    </Screen>
  );
}
