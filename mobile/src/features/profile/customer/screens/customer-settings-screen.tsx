/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Modal, Pressable, Switch, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { BellIcon, MailIcon, SparklesIcon } from '@/components/ui/icons/handy-icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PRIMARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/features/notifications/hooks/use-notifications';
import { useAuthStore } from '@/stores/use-auth-store';

/* ── Inline SVG Icons for Settings ── */
function KeyLockIcon({ size = 20, color = '#4B5563' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

function FingerprintIcon({ size = 20, color = '#4B5563' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <Path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <Path d="M17.29 21.02c.12-.6.43-2.3.43-3.02 0-3.31-2.69-6-6-6a5.96 5.96 0 0 0-5.32 3.21" />
      <Path d="M2 12a10 10 0 0 1 18-6" />
      <Path d="M2 16h.01" />
      <Path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <Path d="M9 6.8a6 6 0 0 1 9 5.2c0 .47 0 1.17-.02 2" />
    </Svg>
  );
}

function LogoutDoorIcon({ size = 20, color = '#EF4444' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <Path d="M16 17l5-5-5-5" />
      <Path d="M21 12H9" />
    </Svg>
  );
}

export function CustomerSettingsScreen() {
  const router = useRouter();
  const logout = useAuthStore.use.logout();
  const setGuestRole = useAuthStore.use.setGuestRole();
  const isLoading = useAuthStore.use.isLoading();

  const [biometricsEnabled, setBiometricsEnabled] = React.useState(true);
  const [showLogoutModal, setShowLogoutModal] = React.useState(false);

  const { data: preferences } = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();

  const [localPrefs, setLocalPrefs] = React.useState<{
    pushEnabled?: boolean;
    inAppEnabled?: boolean;
    emailEnabled?: boolean;
  }>({});

  const pushEnabled = localPrefs.pushEnabled ?? preferences?.pushEnabled ?? true;
  const inAppEnabled = localPrefs.inAppEnabled ?? preferences?.inAppEnabled ?? true;
  const emailEnabled = localPrefs.emailEnabled ?? preferences?.emailEnabled ?? false;

  const handleTogglePush = (value: boolean) => {
    setLocalPrefs(prev => ({ ...prev, pushEnabled: value }));
    updatePreferences.mutate({ pushEnabled: value });
  };

  const handleToggleInApp = (value: boolean) => {
    setLocalPrefs(prev => ({ ...prev, inAppEnabled: value }));
    updatePreferences.mutate({ inAppEnabled: value });
  };

  const handleToggleEmail = (value: boolean) => {
    setLocalPrefs(prev => ({ ...prev, emailEnabled: value }));
    updatePreferences.mutate({ emailEnabled: value });
  };

  const handleConfirmLogout = async () => {
    try {
      await logout();
      setGuestRole('Customer');
    }
    finally {
      setShowLogoutModal(false);
      // Reset về giao diện khách vãng lai ban đầu theo đúng yêu cầu Vua Thợ (Màn 14)
      router.replace(RouteNames.CUSTOMER_HOME as any);
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title="Cài đặt"
        subtitle="Tùy chọn tài khoản & bảo mật"
        onBack={() => router.back()}
        testID="settings-app-bar"
      />

      <View testID="customer-settings-screen" className="flex-1 p-5">
        {/* ── Nhóm 1: Bảo mật tài khoản (Ảnh 12 Vua Thợ) ── */}
        <Text className="mb-2 text-xs font-semibold tracking-wider text-neutral-400 uppercase">
          Bảo mật & Xác thực
        </Text>

        <View className="mb-6 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          {/* Tùy chọn: Đổi mật khẩu */}
          <Pressable
            testID="settings-change-password-btn"
            onPress={() => router.push(RouteNames.AUTH_CHANGE_PASSWORD as any)}
            className="flex-row items-center justify-between border-b border-neutral-100 p-3.5 active:bg-neutral-50 dark:border-neutral-800 dark:active:bg-neutral-800/50"
          >
            <View className="flex-row items-center">
              <View className="mr-3 size-9 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
                <KeyLockIcon size={18} color={PRIMARY_COLOR} />
              </View>
              <View>
                <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Đổi mật khẩu
                </Text>
                <Text className="text-xs text-neutral-400">
                  Cập nhật mật khẩu bảo vệ tài khoản
                </Text>
              </View>
            </View>
            <Text className="text-sm font-bold text-neutral-400">→</Text>
          </Pressable>

          {/* Tùy chọn: Đăng nhập sinh trắc học */}
          <View className="flex-row items-center justify-between p-3.5">
            <View className="flex-row items-center">
              <View className="mr-3 size-9 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
                <FingerprintIcon size={18} color="#059669" />
              </View>
              <View>
                <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Đăng nhập sinh trắc học
                </Text>
                <Text className="text-xs text-neutral-400">
                  Sử dụng Vân tay / Face ID khi mở app
                </Text>
              </View>
            </View>
            <Switch
              testID="settings-biometrics-switch"
              value={biometricsEnabled}
              onValueChange={setBiometricsEnabled}
              trackColor={{ false: '#E5E7EB', true: '#F5A524' }}
              thumbColor={biometricsEnabled ? '#FFFFFF' : '#F4F4F5'}
            />
          </View>
        </View>

        {/* ── Nhóm 2: Cài đặt thông báo (API preferences) ── */}
        <Text className="mb-2 text-xs font-semibold tracking-wider text-neutral-400 uppercase">
          Cài đặt thông báo
        </Text>

        <View className="mb-6 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          {/* Tùy chọn 1: Thông báo đẩy (Push) */}
          <View className="flex-row items-center justify-between border-b border-neutral-100 p-3.5 dark:border-neutral-800">
            <View className="mr-2 flex-1 flex-row items-center">
              <View className="mr-3 size-9 items-center justify-center rounded-xl bg-orange-100 dark:bg-orange-950/60">
                <BellIcon size={18} color="#EA580C" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Thông báo đẩy
                </Text>
                <Text className="text-xs text-neutral-400">
                  Nhận thông báo đơn hàng và tin nhắn mới trên thiết bị
                </Text>
              </View>
            </View>
            <Switch
              testID="settings-push-switch"
              value={pushEnabled}
              onValueChange={handleTogglePush}
              trackColor={{ false: '#E5E7EB', true: '#F5A524' }}
              thumbColor={pushEnabled ? '#FFFFFF' : '#F4F4F5'}
            />
          </View>

          {/* Tùy chọn 2: Thông báo trong ứng dụng (In-app) */}
          <View className="flex-row items-center justify-between border-b border-neutral-100 p-3.5 dark:border-neutral-800">
            <View className="mr-2 flex-1 flex-row items-center">
              <View className="mr-3 size-9 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-950/60">
                <SparklesIcon size={18} color="#7C3AED" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Thông báo trong ứng dụng
                </Text>
                <Text className="text-xs text-neutral-400">
                  Hiển thị thông báo khi đang mở ứng dụng
                </Text>
              </View>
            </View>
            <Switch
              testID="settings-inapp-switch"
              value={inAppEnabled}
              onValueChange={handleToggleInApp}
              trackColor={{ false: '#E5E7EB', true: '#F5A524' }}
              thumbColor={inAppEnabled ? '#FFFFFF' : '#F4F4F5'}
            />
          </View>

          {/* Tùy chọn 3: Thông báo qua Email */}
          <View className="flex-row items-center justify-between p-3.5">
            <View className="mr-2 flex-1 flex-row items-center">
              <View className="mr-3 size-9 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-950/60">
                <MailIcon size={18} color="#2563EB" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-neutral-900 dark:text-white">
                  Thông báo qua Email
                </Text>
                <Text className="text-xs text-neutral-400">
                  Nhận cập nhật tài khoản và biên lai qua email
                </Text>
              </View>
            </View>
            <Switch
              testID="settings-email-switch"
              value={emailEnabled}
              onValueChange={handleToggleEmail}
              trackColor={{ false: '#E5E7EB', true: '#F5A524' }}
              thumbColor={emailEnabled ? '#FFFFFF' : '#F4F4F5'}
            />
          </View>
        </View>

        {/* ── Nhóm 3: Thông tin hệ thống ── */}
        <Text className="mb-2 text-xs font-semibold tracking-wider text-neutral-400 uppercase">
          Thông tin ứng dụng
        </Text>

        <View className="mb-6 rounded-2xl border border-neutral-200 bg-white p-3.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between border-b border-neutral-100 pb-2.5 dark:border-neutral-800">
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">Phiên bản HandyGo</Text>
            <Text className="text-xs font-bold text-neutral-400">v1.0.0 (Vua Thợ)</Text>
          </View>
          <View className="flex-row items-center justify-between pt-2.5">
            <Text className="text-sm text-neutral-600 dark:text-neutral-300">Môi trường</Text>
            <Text className="text-xs font-bold text-emerald-600">Hoạt động bình thường</Text>
          </View>
        </View>

        {/* ── Nhóm 3: Đăng xuất (Kích hoạt Modal Màn 13) ── */}
        <View className="mt-4">
          <Button
            testID="settings-logout-btn"
            label="Đăng xuất tài khoản"
            variant="outline"
            className="h-12 rounded-2xl border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20"
            textClassName="text-sm font-bold text-red-600 dark:text-red-400"
            loading={isLoading}
            disabled={isLoading}
            onPress={() => setShowLogoutModal(true)}
          />
        </View>
      </View>

      {/* ── MÀN 13: HỘP THOẠI XÁC NHẬN ĐĂNG XUẤT (Modal Dialog) ── */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLogoutModal(false)}
      >
        <View
          testID="logout-confirm-modal"
          className="flex-1 items-center justify-center bg-black/60 p-6"
        >
          <View className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-900">
            <View className="mb-3 size-12 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/50">
              <LogoutDoorIcon size={24} color="#EF4444" />
            </View>

            <Text className="text-lg font-bold text-neutral-900 dark:text-white">
              Đăng xuất
            </Text>

            <Text className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Bạn có chắc chắn muốn đăng xuất khỏi tài khoản HandyGo không?
            </Text>

            <View className="mt-6 flex-row gap-3">
              <Button
                testID="logout-cancel-btn"
                label="Hủy"
                variant="outline"
                className="flex-1 rounded-xl"
                onPress={() => setShowLogoutModal(false)}
              />
              <Button
                testID="logout-confirm-btn"
                label="Đăng xuất"
                variant="default"
                className="flex-1 rounded-xl bg-red-600"
                textClassName="text-white font-bold"
                loading={isLoading}
                onPress={handleConfirmLogout}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
