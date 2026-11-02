import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuthStore } from '@/stores/use-auth-store';

export type CustomerProfileDetailScreenProps = {
  onBack?: () => void;
};

export function CustomerProfileDetailScreen({ onBack }: CustomerProfileDetailScreenProps = {}) {
  const router = useRouter();
  const user = useAuthStore.use.user();

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
        title="Profile"
        subtitle="Hồ sơ cá nhân"
        onBack={handleBack}
        testID="profile-detail-app-bar"
      />

      <View testID="customer-profile-detail-screen" className="flex-1 p-4">
        {user && (
          <View className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
              {user.phone ? `Số điện thoại: ${user.phone}` : 'Thông tin người dùng'}
            </Text>
            {user.email && (
              <Text className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                {`Email: ${user.email}`}
              </Text>
            )}
          </View>
        )}

        <View className="mt-8 items-center justify-center py-6">
          <Text
            testID="customer-profile-detail-placeholder"
            className="text-center text-sm font-medium text-neutral-400 dark:text-neutral-500"
          >
            Chức năng đang được phát triển
          </Text>
        </View>
      </View>
    </Screen>
  );
}
