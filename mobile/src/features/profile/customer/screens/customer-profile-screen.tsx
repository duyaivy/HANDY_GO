/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { ArrowRight } from '@/components/ui/icons/arrow-right';
import {
  MapPinIcon,
  OrdersIcon,
  ShieldCheckIcon,
  WalletIcon,
} from '@/components/ui/icons/handy-icons';
import { Settings } from '@/components/ui/icons/settings';
import { Support } from '@/components/ui/icons/support';
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
    <Screen safeArea={false} scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        hideBackButton
        title="Tài khoản cá nhân"
        testID="profile-app-bar"
      />

      <View testID="profile-customer-screen" className="flex-1 p-4 pb-12">
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

        {/* 1. Nhóm dịch vụ & Tiện ích */}
        <View className="mt-5">
          <Text className="mb-2 ml-1 text-xs font-bold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
            Dịch vụ & Tiện ích
          </Text>
          <View className="overflow-hidden rounded-3xl border border-neutral-100 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            {/* Phương thức thanh toán */}
            <Pressable
              testID="profile-payment-item"
              accessibilityRole="button"
              accessibilityLabel="Quản lý thanh toán"
              onPress={() => router.push(RouteNames.CUSTOMER_PAYMENT as any)}
              className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800/60"
            >
              <View className="flex-1 flex-row items-center pr-3">
                <View className="size-10 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/50">
                  <WalletIcon color="#059669" size={20} />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Phương thức thanh toán
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    Quản lý thẻ, ví điện tử & số dư
                  </Text>
                </View>
              </View>
              <ArrowRight color="#9CA3AF" />
            </Pressable>

            {/* Lịch sử giao dịch */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Lịch sử giao dịch"
              onPress={() => router.push(RouteNames.CUSTOMER_PAYMENT_TRANSACTION_HISTORY as any)}
              className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800/60"
            >
              <View className="flex-1 flex-row items-center pr-3">
                <View className="size-10 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
                  <OrdersIcon color="#2563EB" size={20} />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Lịch sử giao dịch
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    Xem các thanh toán & hoá đơn dịch vụ
                  </Text>
                </View>
              </View>
              <ArrowRight color="#9CA3AF" />
            </Pressable>

            {/* Địa chỉ đã lưu */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Địa chỉ đã lưu"
              onPress={() => router.push(RouteNames.CUSTOMER_SAVED_ADDRESSES as any)}
              className="flex-row items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/60"
            >
              <View className="flex-1 flex-row items-center pr-3">
                <View className="size-10 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50">
                  <MapPinIcon color="#D97706" size={20} />
                </View>
                <View className="ml-3.5 flex-1">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Địa chỉ đã lưu
                  </Text>
                  <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                    Địa chỉ nhà riêng, công ty để đặt thợ nhanh
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
              accessibilityLabel="Cài đặt"
              onPress={() => router.push(RouteNames.CUSTOMER_SETTINGS as any)}
              className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800/60"
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
                testID="profile-change-password-btn"
                accessibilityRole="button"
                accessibilityLabel="Đổi mật khẩu"
                onPress={() => router.push(RouteNames.AUTH_CHANGE_PASSWORD as any)}
                className="flex-row items-center justify-between border-b border-neutral-100 p-4 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800/60"
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
              accessibilityRole="button"
              accessibilityLabel="Trung tâm hỗ trợ"
              onPress={() => router.push(RouteNames.CUSTOMER_SUPPORT as any)}
              className="flex-row items-center justify-between p-4 active:bg-neutral-50 dark:active:bg-neutral-800/60"
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

        {/* 4. Khối Nút Đăng xuất / Đăng nhập */}
        <View className="mt-6 mb-8 gap-3">
          {user
            ? (
                <Button
                  testID="customer-logout-btn"
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
                  testID="customer-login-btn"
                  label="Đăng nhập / Đăng ký ngay"
                  variant="default"
                  className="h-12 rounded-2xl bg-[#F5A524] shadow-sm active:bg-primary-600"
                  textClassName="font-bold text-neutral-950"
                  onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
                />
              )}

          <Text className="mt-2 text-center text-[11px] font-medium text-neutral-400 dark:text-neutral-600">
            HandyGo v1.0.0 • Nền tảng dịch vụ tiện ích
          </Text>
        </View>
      </View>
    </Screen>
  );
}
