import * as React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export function WorkerJobsScreen() {
  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="orders-worker-jobs-screen" className="flex-1 items-center justify-center px-6 py-12">
        <View className="mb-6 size-16 items-center justify-center rounded-2xl bg-amber-600 shadow-md">
          <Text className="text-2xl font-bold text-white">💼</Text>
        </View>

        <Text className="text-center text-2xl font-bold text-neutral-900 dark:text-white">
          Danh sách công việc của Thợ
        </Text>
        <Text className="mt-1 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Route: /worker/jobs
        </Text>

        <View className="mt-8 w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="text-xs font-semibold tracking-wider text-amber-600 uppercase dark:text-amber-400">
            Thông tin Module
          </Text>
          <Text className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
            Thư mục:
            {' '}
            <Text className="font-semibold text-neutral-900 dark:text-white">src/features/orders/worker/</Text>
          </Text>
          <Text className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
            Người phụ trách:
            {' '}
            <Text className="font-semibold text-neutral-900 dark:text-white">Worker Orders / Jobs Owner</Text>
          </Text>

          <View className="mt-4 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
            <Text className="text-xs/relaxed text-neutral-600 dark:text-neutral-400">
              Đây là placeholder danh sách công việc của Thợ (cùng thuộc Order business domain với phía Khách). Danh sách đơn chờ nhận, xác nhận nhận việc, cập nhật tiến độ công việc và hoàn thành dịch vụ sẽ được phát triển tại đây.
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}
