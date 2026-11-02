/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { ArrowRight, ShieldCheckIcon, WalletIcon } from '@/components/ui/icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { SECONDARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { ProfileHeaderCard } from '@/features/profile/components';
import { useUserProfile } from '@/features/profile/hooks/use-user-profile';
import { useAuthStore } from '@/stores/use-auth-store';

export function WorkerProfileScreen() {
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

  const handleSwitchToCustomer = () => {
    const { isAuthenticated, user: currentUser } = useAuthStore.getState();
    if (isAuthenticated && currentUser) {
      useAuthStore.getState().setActiveMode('Customer');
    }
    else {
      useAuthStore.getState().setGuestRole('Customer');
    }
    router.replace(RouteNames.CUSTOMER_HOME as any);
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="profile-worker-screen" className="flex-1 p-6">
        {/* Profile Header & Mode Switcher */}
        <ProfileHeaderCard
          mode="Worker"
          fullName={profile?.fullName || (user as any)?.fullName}
          avatarUrl={profile?.avatarUrl}
          phone={user?.phone}
          roles={user?.roles}
          workerStatus={profile?.workerProfile?.status}
          isLoading={isProfileLoading}
          error={profileError}
          onRetry={refetchProfile}
          onSwitch={handleSwitchToCustomer}
        />

        {/* Application & KYC Progress Card */}
        <Pressable
          testID="view-application-status-btn"
          accessibilityRole="button"
          accessibilityLabel="Tiến độ xét duyệt hồ sơ & KYC"
          onPress={() => router.push(RouteNames.WORKER_APPLICATION_STATUS as any)}
          className="mt-4 flex-row items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/80 p-4 shadow-xs active:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40"
        >
          <View className="flex-1 flex-row items-center pr-3">
            <View className="mr-3 size-10 items-center justify-center rounded-xl bg-blue-600 shadow-xs">
              <ShieldCheckIcon size={20} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                Tiến độ xét duyệt hồ sơ & KYC
              </Text>
              <Text className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                Theo dõi trạng thái xét duyệt
              </Text>
            </View>
          </View>
          <View className="size-8 items-center justify-center rounded-full bg-blue-600/10 dark:bg-blue-900/40">
            <ArrowRight color={SECONDARY_COLOR} />
          </View>
        </Pressable>

        {/* HANDY_GO Balance Card */}
        <Pressable
          testID="profile-balance-card"
          accessibilityRole="button"
          accessibilityLabel="HANDY_GO balance"
          onPress={() => router.push(RouteNames.WORKER_BALANCE as any)}
          className="mt-4 flex-row items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs active:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <View className="flex-1 flex-row items-center pr-3">
            <View className="mr-3 size-10 items-center justify-center rounded-xl bg-blue-600 shadow-xs">
              <WalletIcon size={20} color="#FFFFFF" />
            </View>
            <View className="flex-1">
              <Text className="text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                HANDY_GO balance
              </Text>
              <Text className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                Số dư & tài khoản ký quỹ
              </Text>
            </View>
          </View>
          <View className="size-8 items-center justify-center rounded-full bg-blue-600/10 dark:bg-blue-900/40">
            <ArrowRight color={SECONDARY_COLOR} />
          </View>
        </Pressable>

        {/* Navigation Menu Options: Professional skills, Setting */}
        <View className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <Pressable
            testID="profile-skills-item"
            accessibilityRole="button"
            accessibilityLabel="Professional skills"
            onPress={() => router.push(RouteNames.WORKER_SKILLS as any)}
            className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800"
          >
            <View>
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                Professional skills
              </Text>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Kỹ năng chuyên môn
              </Text>
            </View>
            <Text className="text-xs font-semibold text-neutral-400">&gt;</Text>
          </Pressable>

          <Pressable
            testID="profile-setting-item"
            accessibilityRole="button"
            accessibilityLabel="Setting"
            onPress={() => router.push(RouteNames.WORKER_SETTINGS as any)}
            className="flex-row items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800"
          >
            <View>
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                Setting
              </Text>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Cài đặt ứng dụng
              </Text>
            </View>
            <Text className="text-xs font-semibold text-neutral-400">&gt;</Text>
          </Pressable>
        </View>

        {/* Account Details Card */}
        <View className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="text-xs font-semibold tracking-wider text-blue-600 uppercase dark:text-blue-400">
            {user ? 'Thông tin tài khoản Thợ' : 'Chế độ khách vãng lai'}
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
                      {user.roles?.join(', ') || 'Thợ sửa chữa'}
                    </Text>
                  </View>
                </View>
              )
            : (
                <View className="mt-3">
                  <Text className="text-sm text-neutral-600 dark:text-neutral-300">
                    Bạn chưa đăng nhập. Vui lòng đăng nhập để nhận đơn việc, quản lý thu nhập và hoàn thiện hồ sơ Thợ.
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
                    testID="worker-change-password-btn"
                    label="Đổi mật khẩu"
                    variant="outline"
                    onPress={() => router.push(RouteNames.AUTH_CHANGE_PASSWORD as any)}
                  />
                  <Button
                    testID="worker-logout-btn"
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
                  testID="worker-login-btn"
                  label="Đăng nhập / Đăng ký"
                  variant="default"
                  className="bg-blue-600 active:bg-blue-700"
                  textClassName="text-white font-bold"
                  onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
                />
              )}
        </View>
      </View>
    </Screen>
  );
}
