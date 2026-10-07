import { useRouter } from 'expo-router';
import * as React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ProfileDetailHeaderCard } from '@/features/profile-detail/components';
import { useUserProfile } from '@/features/profile/hooks/use-user-profile';
import { useAuthStore } from '@/stores/use-auth-store';

export function CustomerProfileDetailScreen() {
  const router = useRouter();
  const user = useAuthStore.use.user();
  const {
    profile,
    isLoading,
    error,
    refetch,
  } = useUserProfile();

  const handleStartVerification = () => {
    Alert.alert('Xác minh KYC', 'Luồng xác minh sẽ sớm được cập nhật.');
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="customer-profile-detail-screen" className="flex-1 p-5">
        <View className="mb-5 flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            onPress={() => router.back()}
            className="mr-3 size-10 items-center justify-center rounded-full border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          >
            <ArrowLeft width={10} height={20} color="#374151" />
          </Pressable>
          <Text className="text-lg font-bold text-neutral-900 dark:text-white">Thông tin hồ sơ</Text>
        </View>

        <ProfileDetailHeaderCard
          fullName={profile?.fullName}
          avatarUrl={profile?.avatarUrl}
          phone={user?.phone}
          email={user?.email}
          accountStatus={profile?.status}
          workerStatus={profile?.workerProfile?.status}
          onStartVerification={handleStartVerification}
        />

        {isLoading && (
          <Text testID="profile-detail-loading" className="mt-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Đang tải thông tin hồ sơ...
          </Text>
        )}

        {error && (
          <View testID="profile-detail-error" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
            <Text className="text-sm text-red-800 dark:text-red-200">{error}</Text>
            <Button
              testID="profile-detail-retry"
              label="Thử lại"
              variant="outline"
              size="sm"
              onPress={() => void refetch()}
              className="mt-3 self-start"
            />
          </View>
        )}
      </View>
    </Screen>
  );
}
