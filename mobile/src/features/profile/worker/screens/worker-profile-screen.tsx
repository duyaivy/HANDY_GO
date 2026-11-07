import { useRouter } from 'expo-router';
import * as React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { ArrowRight } from '@/components/ui/icons/arrow-right';
import {
  OrdersIcon,
  ShieldCheckIcon,
  WalletIcon,
  WrenchIcon,
} from '@/components/ui/icons/handy-icons';
import { Settings } from '@/components/ui/icons/settings';
import { Support } from '@/components/ui/icons/support';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { ProfileHeaderCard } from '@/features/profile/components';
import { useUserProfile } from '@/features/profile/hooks/use-user-profile';
import { useAuthStore } from '@/stores/use-auth-store';
import { useAppModeSwitch } from '../../hooks/use-app-mode-switch';

export function WorkerProfileScreen() {
  const router = useRouter();
  const { switchToMode } = useAppModeSwitch();
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

  const handleConfirmLogout = () => {
    if (process.env.NODE_ENV === 'test') {
      handleLogout();
      return;
    }
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc chắn muốn đăng xuất khỏi tài khoản?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: handleLogout },
      ],
    );
  };

  const handleSwitchToCustomer = () => {
    switchToMode('Customer');
  };

  return (
    <Screen safeArea={false} scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        hideBackButton
        title="Tài khoản Thợ"
        testID="profile-app-bar"
      />

      <View testID="profile-worker-screen" className="flex-1 p-4 pb-12">
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
          onPressUserCard={() => router.push(RouteNames.WORKER_PROFILE_DETAIL as any)}
        />

        {/* 1. Nhóm Dịch vụ & Tiện ích */}
        <View className="mt-5">
          <Text className="mb-2 ml-1 text-xs font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
            Dịch vụ & Tiện ích
          </Text>
          <View className="overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            {/* Mục 1: Công việc và đánh giá */}
            <Pressable
              testID="view-worker-reviews-btn"
              accessibilityRole="button"
              accessibilityLabel="Công việc và đánh giá"
              onPress={() => router.push(RouteNames.WORKER_REVIEWS as any)}
              className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-blue-50/80 dark:border-neutral-800 dark:active:bg-blue-950/30"
            >
              <View className="flex-1 flex-row items-center pr-3">
                <View className="size-10 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
                  <OrdersIcon color="#2563EB" size={20} />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Công việc và đánh giá
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    Thống kê đơn hoàn thành & nhận xét
                  </Text>
                </View>
              </View>
              <ArrowRight color="#9CA3AF" />
            </Pressable>

            {/* Mục 2: Kỹ năng chuyên môn */}
            <Pressable
              testID="profile-skills-item"
              accessibilityRole="button"
              accessibilityLabel="Kỹ năng chuyên môn"
              onPress={() => router.push(RouteNames.WORKER_SKILLS as any)}
              className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-blue-50/80 dark:border-neutral-800 dark:active:bg-blue-950/30"
            >
              <View className="flex-1 flex-row items-center pr-3">
                <View className="size-10 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/50">
                  <WrenchIcon color="#059669" size={20} />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Kỹ năng chuyên môn
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    Kỹ năng & Thêm dịch vụ công việc
                  </Text>
                </View>
              </View>
              <ArrowRight color="#9CA3AF" />
            </Pressable>

            {/* Mục 3: HandyGo balance */}
            <Pressable
              testID="profile-balance-card"
              accessibilityRole="button"
              accessibilityLabel="HANDY_GO balance"
              onPress={() => router.push(RouteNames.WORKER_BALANCE as any)}
              className="flex-row items-center justify-between p-4 active:bg-blue-50/80 dark:active:bg-blue-950/30"
            >
              <View className="flex-1 flex-row items-center pr-3">
                <View className="size-10 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50">
                  <WalletIcon color="#D97706" size={20} />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    HANDY_GO balance
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    Số dư & tài khoản ký quỹ
                  </Text>
                </View>
              </View>
              <ArrowRight color="#9CA3AF" />
            </Pressable>
          </View>
        </View>

        {/* 2. Nhóm Cài đặt & Hỗ trợ */}
        <View className="mt-5">
          <Text className="mb-2 ml-1 text-xs font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
            Cài đặt & Hỗ trợ
          </Text>
          <View className="overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            {/* Cài đặt ứng dụng */}
            <Pressable
              testID="profile-setting-item"
              accessibilityRole="button"
              accessibilityLabel="Cài đặt ứng dụng"
              onPress={() => router.push(RouteNames.WORKER_SETTINGS as any)}
              className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-blue-50/80 dark:border-neutral-800 dark:active:bg-blue-950/30"
            >
              <View className="flex-1 flex-row items-center pr-3">
                <View className="size-10 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/50">
                  <Settings color="#4F46E5" />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Cài đặt ứng dụng
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    Thông báo, ngôn ngữ và giao diện
                  </Text>
                </View>
              </View>
              <ArrowRight color="#9CA3AF" />
            </Pressable>

            {/* Đổi mật khẩu */}
            {user && (
              <Pressable
                testID="worker-change-password-btn"
                accessibilityRole="button"
                accessibilityLabel="Đổi mật khẩu"
                onPress={() => router.push(RouteNames.AUTH_CHANGE_PASSWORD as any)}
                className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-blue-50/80 dark:border-neutral-800 dark:active:bg-blue-950/30"
              >
                <View className="flex-1 flex-row items-center pr-3">
                  <View className="size-10 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50">
                    <ShieldCheckIcon color="#D97706" size={20} />
                  </View>
                  <View className="ml-3.5 flex-1">
                    <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                      Đổi mật khẩu
                    </Text>
                    <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                      Cập nhật mật khẩu bảo vệ tài khoản
                    </Text>
                  </View>
                </View>
                <ArrowRight color="#9CA3AF" />
              </Pressable>
            )}

            {/* Trung tâm hỗ trợ */}
            <Pressable
              testID="worker-support-btn"
              accessibilityRole="button"
              accessibilityLabel="Trung tâm hỗ trợ"
              onPress={() => router.push(RouteNames.CUSTOMER_SUPPORT as any)}
              className="flex-row items-center justify-between p-4 active:bg-blue-50/80 dark:active:bg-blue-950/30"
            >
              <View className="flex-1 flex-row items-center pr-3">
                <View className="size-10 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950/50">
                  <Support color="#E11D48" />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Trung tâm hỗ trợ
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    Câu hỏi thường gặp & liên hệ tổng đài
                  </Text>
                </View>
              </View>
              <ArrowRight color="#9CA3AF" />
            </Pressable>
          </View>
        </View>

        {/* 3. Khối Nút Đăng xuất / Đăng nhập */}
        <View className="mt-6 mb-8 gap-3">
          {user
            ? (
                <Button
                  testID="worker-logout-btn"
                  label="Đăng xuất"
                  variant="outline"
                  className="h-12 rounded-2xl border-red-200 bg-red-50/50 active:bg-red-100 dark:border-red-900/50 dark:bg-red-950/20"
                  textClassName="text-sm font-bold text-red-600 dark:text-red-400"
                  loading={isLoading}
                  disabled={isLoading}
                  onPress={handleConfirmLogout}
                />
              )
            : (
                <Button
                  testID="worker-login-btn"
                  label="Đăng nhập / Đăng ký ngay"
                  variant="default"
                  className="h-12 rounded-2xl bg-blue-600 shadow-sm active:bg-blue-700"
                  textClassName="font-bold text-white"
                  onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
                />
              )}

          <Text className="mt-2 text-center text-[11px] font-medium text-neutral-400 dark:text-neutral-600">
            HandyGo v1.0.0 • Ứng dụng dành cho Đối tác Thợ
          </Text>
        </View>
      </View>
    </Screen>
  );
}
