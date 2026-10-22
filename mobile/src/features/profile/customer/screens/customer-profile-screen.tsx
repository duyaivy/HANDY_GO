/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
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

  const handleSwitchToWorker = () => {
    const { isAuthenticated, user: currentUser } = useAuthStore.getState();
    if (isAuthenticated && currentUser) {
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
        hideBackButton
        title="Tài khoản cá nhân"
        subtitle="Account"
        testID="profile-app-bar"
      />

      <View testID="profile-customer-screen" className="flex-1 p-6">
        {/* Profile Header & Mode Switcher */}
        <ProfileHeaderCard
          mode="Customer"
          fullName={profile?.fullName || (user as any)?.fullName}
          avatarUrl={profile?.avatarUrl}
          phone={user?.phone}
          roles={user?.roles}
          workerStatus={profile?.workerProfile?.status}
          isLoading={isProfileLoading}
          error={profileError}
          onRetry={refetchProfile}
          onSwitch={handleSwitchToWorker}
          onPressUserCard={() => router.push(RouteNames.CUSTOMER_PROFILE_DETAIL as any)}
          onPressSwitchArrow={() => router.push(RouteNames.CUSTOMER_SWITCH_TO_WORKER as any)}
        />

        {/* Navigation Menu Options: Payment, Setting */}
        <View className="mt-6 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <Pressable
            testID="profile-payment-item"
            accessibilityRole="button"
            accessibilityLabel="Quản lý thanh toán"
            onPress={() => router.push(RouteNames.CUSTOMER_PAYMENT as any)}
            className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800"
          >
            <View>
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                Payment
              </Text>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Quản lý thanh toán
              </Text>
            </View>
            <Text className="text-xs font-semibold text-neutral-400">&gt;</Text>
          </Pressable>

          <Pressable
            testID="profile-setting-item"
            accessibilityRole="button"
            accessibilityLabel="Cài đặt"
            onPress={() => router.push(RouteNames.CUSTOMER_SETTINGS as any)}
            className="flex-row items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800"
          >
            <View>
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                Setting
              </Text>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Cài đặt
              </Text>
            </View>
            <Text className="text-xs font-semibold text-neutral-400">&gt;</Text>
          </Pressable>
        </View>

        {/* Account Details Card */}
        <View className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="text-xs font-semibold tracking-wider text-amber-600 uppercase dark:text-amber-400">
            {user ? 'Thông tin tài khoản' : 'Chế độ khách vãng lai'}
          </Text>

          {user
            ? (
                <View className="mt-4 space-y-3">
                  <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
                    <Text className="text-sm text-neutral-500 dark:text-neutral-400">Mã tài khoản</Text>
                    <Text className="text-sm font-medium text-neutral-900 dark:text-white">{user.id || '—'}</Text>
                  </View>

                  <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
                    <Text className="text-sm text-neutral-500 dark:text-neutral-400">Số điện thoại</Text>
                    <Text className="text-sm font-medium text-neutral-900 dark:text-white">{user.phone || '—'}</Text>
                  </View>

                  <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
                    <Text className="text-sm text-neutral-500 dark:text-neutral-400">Email</Text>
                    <Text className="text-sm font-medium text-neutral-900 dark:text-white">{user.email || '—'}</Text>
                  </View>

                  <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
                    <Text className="text-sm text-neutral-500 dark:text-neutral-400">Vai trò</Text>
                    <Text className="text-sm font-medium text-neutral-900 dark:text-white">
                      {user.roles?.join(', ') || 'Customer'}
                    </Text>
                  </View>
                </View>
              )
            : (
                <View className="mt-3">
                  <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                    Bạn chưa đăng nhập. Vui lòng đăng nhập để đặt dịch vụ và theo dõi đơn hàng của bạn.
                  </Text>
                </View>
              )}
        </View>

        {/* Action Buttons */}
        <View className="mt-8 space-y-3">
          {user
            ? (
                <>
                  <Button
                    testID="profile-change-password-btn"
                    label="Đổi mật khẩu"
                    variant="outline"
                    onPress={() => router.push(RouteNames.AUTH_CHANGE_PASSWORD as any)}
                  />
                  <Button
                    testID="customer-logout-btn"
                    label="Đăng xuất"
                    variant="outline"
                    loading={isLoading}
                    disabled={isLoading}
                    onPress={handleLogout}
                  />
                </>
              )
            : (
                <Button
                  testID="customer-login-btn"
                  label="Đăng nhập / Đăng ký ngay"
                  variant="default"
                  className="bg-[#F5A524] active:bg-primary-600"
                  textClassName="font-bold text-neutral-950"
                  onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
                />
              )}
        </View>
      </View>
    </Screen>
  );
}
