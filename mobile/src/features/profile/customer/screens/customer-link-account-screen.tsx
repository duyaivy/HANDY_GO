import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export type CustomerLinkAccountScreenProps = {
  onBack?: () => void;
};

export function CustomerLinkAccountScreen({ onBack }: CustomerLinkAccountScreenProps = {}) {
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
        title="Link account"
        subtitle="Liên kết tài khoản"
        onBack={handleBack}
        testID="link-account-app-bar"
      />

      <View testID="customer-link-account-screen" className="flex-1 p-4">
        <View className="mt-8 items-center justify-center py-6">
          <Text
            testID="customer-link-account-placeholder"
            className="text-center text-sm font-medium text-neutral-400 dark:text-neutral-500"
          >
            Chức năng đang được phát triển
          </Text>
        </View>
      </View>
    </Screen>
  );
}
