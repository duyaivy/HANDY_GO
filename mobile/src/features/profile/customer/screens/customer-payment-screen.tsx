import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';

export type CustomerPaymentScreenProps = {
  onBack?: () => void;
};

export function CustomerPaymentScreen({ onBack }: CustomerPaymentScreenProps = {}) {
  const router = useRouter();

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
        title="Quản lý thanh toán"
        subtitle="Payment"
        onBack={handleBack}
        testID="payment-app-bar"
      />

      <View testID="customer-payment-screen" className="flex-1 p-4">
        {/* Linked Accounts Section */}
        <View className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                Phương thức thanh toán
              </Text>
              <Text className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                Tài khoản ngân hàng & ví liên kết
              </Text>
            </View>

            <Button
              testID="payment-linked-btn"
              label="Linked"
              variant="outline"
              className="h-9 rounded-xl border-primary px-4"
              textClassName="text-xs font-bold text-primary"
              onPress={() => router.push(RouteNames.CUSTOMER_PAYMENT_LINK_ACCOUNT as any)}
            />
          </View>
        </View>

        {/* Transaction History Section */}
        <View className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
              Transaction history
            </Text>

            <Pressable
              testID="payment-see-all-transactions-btn"
              accessibilityRole="button"
              accessibilityLabel="Xem tất cả lịch sử giao dịch"
              onPress={() => router.push(RouteNames.CUSTOMER_PAYMENT_TRANSACTION_HISTORY as any)}
              className="py-1"
            >
              <Text className="text-xs font-semibold text-primary">
                See all &gt;
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Skeleton notice */}
        <View className="mt-8 items-center justify-center py-6">
          <Text
            testID="customer-payment-placeholder"
            className="text-center text-sm font-medium text-neutral-400 dark:text-neutral-500"
          >
            Chức năng đang được phát triển
          </Text>
        </View>
      </View>
    </Screen>
  );
}
