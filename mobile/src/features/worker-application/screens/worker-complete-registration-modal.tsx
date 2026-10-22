import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';

export function WorkerCompleteRegistrationModal() {
  const router = useRouter();

  const handleDismiss = () => {
    router.back();
  };

  return (
    <View
      testID="worker-complete-registration-modal"
      className="flex-1 items-center justify-center bg-black/60 p-6"
    >
      <View className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-900">
        <View className="flex-row items-center justify-between pb-3">
          <Text
            testID="complete-modal-title"
            className="text-base font-bold text-neutral-900 dark:text-white"
          >
            Hoàn thiện hồ sơ đăng ký
          </Text>
          <Pressable
            testID="complete-modal-close-icon"
            accessibilityLabel="Đóng"
            onPress={handleDismiss}
            className="size-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800"
          >
            <CloseIcon size={16} color="#6B7280" />
          </Pressable>
        </View>

        <Text className="my-6 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Chức năng đang được phát triển
        </Text>

        <Button
          testID="complete-modal-close-btn"
          label="Đóng"
          variant="outline"
          className="h-11 rounded-2xl border-neutral-300 dark:border-neutral-700"
          textClassName="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
          onPress={handleDismiss}
        />
      </View>
    </View>
  );
}
