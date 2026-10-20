/* eslint-disable better-tailwindcss/no-unknown-classes */
/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellIcon, ChevronLeftIcon, HeadsetIcon, SwitchIcon } from '@/components/ui/icons';
import { PRIMARY_COLOR, SECONDARY_COLOR } from '@/constants/colors';
import { Text } from './text';


export type AppBarProps = {
  /** Mode của AppBar: 'home' (Trang chủ) hoặc 'stack' (Trang con có nút Back) */
  mode?: 'home' | 'stack';
  /** Tiêu đề trang */
  title?: string;
  /** Phụ đề nhỏ phía dưới */
  subtitle?: string;
  /** Vai trò hiển thị: 'Customer' | 'Worker' */
  role?: 'Customer' | 'Worker';
  /** Bật/Tắt chip chuyển đổi vai trò (Customer App ⇄ Worker App) */
  showRoleSwitcher?: boolean;
  /** Callback khi bấm chip đổi vai trò */
  onSwitchRole?: () => void;
  /** Callback khi bấm nút Back (mặc định router.back()) */
  onBack?: () => void;
  /** Ẩn nút back khi ở chế độ stack */
  hideBackButton?: boolean;
  /** Số lượng thông báo chưa đọc */
  notificationCount?: number;
  /** Callback khi bấm vào chuông thông báo */
  onPressNotification?: () => void;
  /** Callback khi bấm nút Trợ giúp / CSKH */
  onPressSupport?: () => void;
  /** Action bên phải tùy biến */
  rightAction?: React.ReactNode;
  /** Action bên trái tùy biến (thay thế nút Back) */
  leftAction?: React.ReactNode;
  /** Tùy chọn nền trong suốt */
  transparent?: boolean;
  /** ClassName bổ sung */
  className?: string;
  /** TestID cho automation testing */
  testID?: string;
};

export function AppBar({
  mode = 'stack',
  title,
  subtitle,
  role = 'Customer',
  showRoleSwitcher = false,
  onSwitchRole,
  onBack,
  hideBackButton = false,
  notificationCount = 0,
  onPressNotification,
  onPressSupport,
  rightAction,
  leftAction,
  transparent = false,
  className = '',
  testID = 'app-bar',
}: AppBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = React.useCallback(() => {
    if (onBack) {
      onBack();
    }
    else if (router.canGoBack ? router.canGoBack() : true) {
      router.back();
    }
  }, [onBack, router]);

  const isCustomer = role === 'Customer';
  const roleLabel = isCustomer ? 'App Khách' : 'App Thợ';
  const roleBadgeBg = isCustomer ? PRIMARY_COLOR : SECONDARY_COLOR;

  const renderLeft = () => {
    if (leftAction) {
      return leftAction;
    }

    if (mode === 'stack') {
      if (hideBackButton) {
        return null;
      }
      return (
        <Pressable
          testID="app-bar-back-btn"
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          className="size-10 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
        >
          <ChevronLeftIcon />
        </Pressable>
      );
    }

    return (
      <View className="flex-row items-center">
        <View
          style={{ backgroundColor: roleBadgeBg }}
          className="size-9 items-center justify-center rounded-xl shadow-sm"
        >
          <Text className="text-base font-black text-white">H</Text>
        </View>
        <View className="ml-2.5">
          <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            HandyGo
          </Text>
          <Text className="text-sm font-bold text-neutral-900 dark:text-white">
            {isCustomer ? 'Khách hàng' : 'Đối tác Thợ'}
          </Text>
        </View>
      </View>
    );
  };

  const renderRight = () => {
    if (rightAction) {
      return rightAction;
    }

    if (mode === 'home') {
      return (
        <Pressable
          testID="app-bar-notification-btn"
          onPress={onPressNotification}
          accessibilityRole="button"
          accessibilityLabel="Thông báo"
          className="relative size-10 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
        >
          <BellIcon />
          {notificationCount > 0 && (
            <View
              testID="app-bar-notification-badge"
              className="absolute -top-0.5 -right-0.5 h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1"
            >
              <Text className="text-3xs font-bold text-white">
                {notificationCount > 99 ? '99+' : notificationCount}
              </Text>
            </View>
          )}
        </Pressable>
      );
    }

    if (onPressSupport) {
      return (
        <Pressable
          testID="app-bar-support-btn"
          onPress={onPressSupport}
          accessibilityRole="button"
          accessibilityLabel="Trợ giúp"
          className="size-10 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200 dark:bg-neutral-800 dark:active:bg-neutral-700"
        >
          <HeadsetIcon />
        </Pressable>
      );
    }

    return null;
  };

  return (
    <View
      testID={testID}
      style={{ paddingTop: Math.max(insets.top, 12) }}
      className={`z-30 w-full ${
        transparent
          ? 'bg-transparent'
          : 'border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900'
      } ${className}`}
    >
      <View className="h-14 flex-row items-center justify-between px-4">
        {/* ── LEFT SECTION ── */}
        <View className="flex-1 flex-row items-center justify-start">
          {renderLeft()}

          {/* Role switcher chip (nếu hiển thị cạnh trái/giữa trong Home mode) */}
          {mode === 'home' && showRoleSwitcher && (
            <Pressable
              testID="app-bar-role-switch-chip"
              onPress={onSwitchRole}
              accessibilityRole="button"
              accessibilityLabel={`Chuyển sang ${isCustomer ? 'App Thợ' : 'App Khách'}`}
              style={{ backgroundColor: roleBadgeBg }}
              className="ml-3 flex-row items-center rounded-full px-2.5 py-1 shadow-xs active:opacity-80"
            >
              <Text className="text-2xs mr-1 font-bold text-white">
                {roleLabel}
              </Text>
              <SwitchIcon />
            </Pressable>
          )}
        </View>

        {/* ── CENTER SECTION (Stack Mode) ── */}
        {mode === 'stack' && (
          <View className="flex-2 items-center justify-center px-2">
            {title && (
              <Text
                testID="app-bar-title"
                numberOfLines={1}
                className="text-center text-base font-bold text-neutral-900 dark:text-white"
              >
                {title}
              </Text>
            )}
            {subtitle && (
              <Text
                testID="app-bar-subtitle"
                numberOfLines={1}
                className="text-2xs mt-0.5 text-center text-neutral-500 dark:text-neutral-400"
              >
                {subtitle}
              </Text>
            )}
          </View>
        )}

        {/* ── RIGHT SECTION ── */}
        <View className="flex-1 flex-row items-center justify-end space-x-2">
          {renderRight()}
        </View>
      </View>
    </View>
  );
}
