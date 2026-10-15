import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { ArrowRight } from '@/components/ui/icons/arrow-right';
import { UserIcon, WrenchIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';

export type AppSwitchCardProps = {
  currentMode: 'Customer' | 'Worker';
  roles?: string[];
  workerStatus?: string | null;
  onSwitch?: (targetMode: 'Customer' | 'Worker') => void;
};

export function AppSwitchCard({
  currentMode,
  roles = [],
  workerStatus,
  onSwitch,
}: AppSwitchCardProps) {
  const router = useRouter();

  if (currentMode === 'Customer') {
    // Check if user has Worker role to allow switching
    if (!roles.includes('Worker')) {
      return null;
    }

    const handleSwitchToWorker = () => {
      useAuthStore.getState().setActiveMode('Worker');
      onSwitch?.('Worker');
      router.replace(RouteNames.WORKER_HOME as any);
    };

    return (
      <Pressable
        testID="switch-to-worker-btn"
        accessibilityRole="button"
        accessibilityLabel="Chuyển sang App Thợ"
        onPress={handleSwitchToWorker}
        className="mt-4 flex-row items-center justify-between rounded-2xl bg-blue-600 p-4 shadow-md shadow-blue-600/30 active:opacity-90 dark:bg-blue-600"
      >
        <View className="flex-1 flex-row items-center pr-3">
          <View className="size-11 items-center justify-center rounded-xl bg-white/20">
            <WrenchIcon color="#FFFFFF" size={22} />
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-bold text-white">
              Chuyển sang App Thợ
            </Text>
            <Text className="mt-0.5 text-xs text-blue-100" numberOfLines={1}>
              {workerStatus === 'verified'
                ? 'Nhận việc và quản lý dịch vụ sửa chữa'
                : workerStatus === 'draft'
                  ? 'Tài khoản Thợ (Chưa xác minh)'
                  : workerStatus === 'pending_kyc' || workerStatus === 'under_review'
                    ? 'Tài khoản Thợ (Đang xác minh)'
                    : workerStatus === 'rejected'
                      ? 'Tài khoản Thợ (Yêu cầu xác minh lại)'
                      : workerStatus === 'suspended'
                        ? 'Tài khoản Thợ (Tạm khóa)'
                        : 'Chuyển sang chế độ Thợ'}
            </Text>
          </View>
        </View>
        <View className="size-8 items-center justify-center rounded-full bg-white/20">
          <ArrowRight color="#FFFFFF" />
        </View>
      </Pressable>
    );
  }

  // Current mode is Worker -> Switch to Customer
  if (!roles.includes('Customer')) {
    return null;
  }

  const handleSwitchToCustomer = () => {
    useAuthStore.getState().setActiveMode('Customer');
    onSwitch?.('Customer');
    router.replace(RouteNames.CUSTOMER_HOME as any);
  };

  return (
    <Pressable
      testID="switch-to-customer-btn"
      accessibilityRole="button"
      accessibilityLabel="Chuyển sang App Khách"
      onPress={handleSwitchToCustomer}
      className="mt-4 flex-row items-center justify-between rounded-2xl bg-amber-400 p-4 shadow-md shadow-amber-400/30 active:opacity-90 dark:bg-amber-500"
    >
      <View className="flex-1 flex-row items-center pr-3">
        <View className="size-11 items-center justify-center rounded-xl bg-amber-950/10 dark:bg-black/20">
          <UserIcon color="#78350F" size={22} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-base font-bold text-amber-950 dark:text-neutral-900">
            Chuyển sang App Khách
          </Text>
          <Text className="mt-0.5 text-xs text-amber-900/80 dark:text-neutral-800" numberOfLines={1}>
            Đặt dịch vụ tiện ích và theo dõi yêu cầu
          </Text>
        </View>
      </View>
      <View className="size-8 items-center justify-center rounded-full bg-amber-950/10 dark:bg-black/20">
        <ArrowRight color="#78350F" />
      </View>
    </Pressable>
  );
}
