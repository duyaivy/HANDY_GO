import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
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
