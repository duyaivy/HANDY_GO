import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';

export type CustomerSwitchToWorkerScreenProps = {
  onBack?: () => void;
  onProceed?: () => void;
};

export function CustomerSwitchToWorkerScreen({
  onBack,
  onProceed,
}: CustomerSwitchToWorkerScreenProps = {}) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
    else {
      router.back();
    }
  };

  const handleProceed = () => {
    if (onProceed) {
      onProceed();
      return;
    }

    const { isAuthenticated, user } = useAuthStore.getState();
    if (isAuthenticated && user) {
      useAuthStore.getState().setActiveMode('Worker');
    }
    else {
      useAuthStore.getState().setGuestRole('Worker');
    }
    router.replace(RouteNames.WORKER_HOME as any);
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title="Switching to Worker App"
        subtitle="Chuyển sang App Thợ"
        onBack={handleBack}
        testID="switch-to-worker-app-bar"
      />

      <View testID="customer-switch-to-worker-screen" className="flex-1 items-center justify-center p-6 py-16">
        <View className="mb-6 size-16 items-center justify-center rounded-2xl bg-blue-500/10">
          <Text className="text-3xl">🛠️</Text>
        </View>

        <Text className="text-center text-lg font-bold text-neutral-900 dark:text-white">
          Chuyển đổi sang ứng dụng Thợ
        </Text>
        <Text className="mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Đang chuyển sang không gian làm việc của Đối tác Thợ
        </Text>

        <View className="mt-8 w-full max-w-xs space-y-3">
          <Button
            testID="proceed-to-worker-btn"
            label="Tiếp tục sang App Thợ →"
            variant="default"
            className="h-11 rounded-xl bg-blue-600 active:bg-blue-700"
            textClassName="text-sm font-bold text-white"
            onPress={handleProceed}
          />
        </View>
      </View>
    </Screen>
  );
}
