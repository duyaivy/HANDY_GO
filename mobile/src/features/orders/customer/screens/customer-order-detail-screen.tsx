import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';

export type CustomerOrderDetailScreenProps = {
  orderId?: string;
  title?: string;
  serviceName?: string;
  onBack?: () => void;
};

export function CustomerOrderDetailScreen({
  orderId: propOrderId,
  title: propTitle,
  onBack,
}: CustomerOrderDetailScreenProps = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ id?: string }>();
  const orderId = propOrderId || searchParams?.id || 'demo-001';

  const isPlumberOrder = orderId === '224466' || orderId.toLowerCase().includes('plumber');
  const pageTitle = propTitle || (isPlumberOrder ? 'Chi tiết báo giá dịch vụ (Plumber)' : 'Báo giá thợ');
  const pageSubtitle = isPlumberOrder ? 'Báo giá thợ' : `Mã đơn: #${orderId}`;

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
    else {
      router.back();
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title={pageTitle}
        subtitle={pageSubtitle}
        onBack={handleBack}
        testID="order-detail-app-bar"
      />

      <View testID="orders-customer-detail-screen" className="flex-1 p-4">
        {/* Worker section / Mục thợ (A CẢNH VĂN) */}
        <View
          testID="worker-quote-section"
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Thợ nhận việc
              </Text>
              <Text
                testID="worker-name-label"
                className="mt-0.5 text-sm font-bold text-neutral-900 dark:text-white"
              >
                A CẢNH VĂN
              </Text>
            </View>

            <Button
              testID="worker-profile-btn"
              label="Worker profile"
              variant="outline"
              className="h-9 rounded-xl border-primary px-3.5"
              textClassName="text-xs font-bold text-primary"
              onPress={() => router.push(RouteNames.CUSTOMER_WORKER_DETAIL('a-canh-van') as any)}
            />
          </View>
        </View>

        {/* Skeleton notice */}
        <View className="mt-8 items-center justify-center py-6">
          <Text
            testID="orders-customer-detail-placeholder"
            className="text-center text-sm font-medium text-neutral-400 dark:text-neutral-500"
          >
            Chức năng đang được phát triển
          </Text>
        </View>
      </View>
    </Screen>
  );
}
