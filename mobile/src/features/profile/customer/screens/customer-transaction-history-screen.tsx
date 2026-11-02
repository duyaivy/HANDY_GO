import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export type CustomerTransactionHistoryScreenProps = {
  onBack?: () => void;
};

export function CustomerTransactionHistoryScreen({
  onBack,
}: CustomerTransactionHistoryScreenProps = {}) {
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
        title="Transaction history"
        subtitle="Lịch sử giao dịch"
        onBack={handleBack}
        testID="transaction-history-app-bar"
      />

      <View testID="customer-transaction-history-screen" className="flex-1 p-4">
        <View className="mt-8 items-center justify-center py-6">
          <Text
            testID="customer-transaction-history-placeholder"
            className="text-center text-sm font-medium text-neutral-400 dark:text-neutral-500"
          >
            Chức năng đang được phát triển
          </Text>
        </View>
      </View>
    </Screen>
  );
}
