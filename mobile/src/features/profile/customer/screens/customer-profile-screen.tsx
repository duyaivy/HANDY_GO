import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { ProfileHeaderCard } from '@/features/profile/components';
import { useUserProfile } from '@/features/profile/hooks/use-user-profile';
import { useAuthStore } from '@/stores/use-auth-store';

export function CustomerProfileScreen() {
  const router = useRouter();
  const user = useAuthStore.use.user();
  const logout = useAuthStore.use.logout();
  const isLoading = useAuthStore.use.isLoading();

  const {
    profile,
    isLoading: isProfileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useUserProfile();

  const handleLogout = async () => {
    try {
      await logout();
    }
    finally {
      router.replace(RouteNames.AUTH_LOGIN as any);
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="profile-customer-screen" className="flex-1 p-6">
        {/* Profile Header & Mode Switcher */}
        <ProfileHeaderCard
          mode="Customer"
          fullName={profile?.fullName}
          avatarUrl={profile?.avatarUrl}
          phone={user?.phone}
          roles={user?.roles}
          workerStatus={profile?.workerProfile?.status}
          isLoading={isProfileLoading}
          error={profileError}
          onRetry={refetchProfile}
        />

        {/* Account Details Card */}
        <View className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="text-xs font-semibold tracking-wider text-blue-600 uppercase dark:text-blue-400">
            Thông tin tài khoản
          </Text>

          <View className="mt-4 space-y-3">
            <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">User ID</Text>
              <Text className="text-sm font-medium text-neutral-900 dark:text-white">{user?.id || '—'}</Text>
            </View>

            <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">Số điện thoại</Text>
              <Text className="text-sm font-medium text-neutral-900 dark:text-white">{user?.phone || '—'}</Text>
            </View>

            <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">Email</Text>
              <Text className="text-sm font-medium text-neutral-900 dark:text-white">{user?.email || '—'}</Text>
            </View>

            <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">Vai trò</Text>
              <Text className="text-sm font-medium text-neutral-900 dark:text-white">
                {user?.roles?.join(', ') || 'Customer'}
              </Text>
            </View>
          </View>
        </View>

        {/* Logout Action */}
        <View className="mt-8">
          <Button
            testID="customer-logout-btn"
            label="Đăng xuất"
            variant="outline"
            loading={isLoading}
            disabled={isLoading}
            onPress={handleLogout}
          />
        </View>
      </View>
    </Screen>
  );
}
