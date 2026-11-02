import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { WrenchIcon } from '@/components/ui/icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';

export function WorkerGuestOverview() {
  const router = useRouter();

  const handleSwitchToCustomer = () => {
    useAuthStore.getState().setGuestRole('Customer');
    router.replace(RouteNames.CUSTOMER_HOME as any);
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="worker-guest-overview-screen" className="flex-1 p-4">
        {/* ── HEADER ── */}
        <View className="mb-3 flex-row items-center justify-between pt-1">
          <View className="flex-row items-center">
            <WrenchIcon size={20} color="#2563EB" />
            <Text className="ml-2 text-xl font-black text-neutral-900 dark:text-white">
              Nhận việc
            </Text>
          </View>

          {/* Role Switch Chip */}
          <Pressable
            testID="worker-guest-role-switch-chip"
            onPress={handleSwitchToCustomer}
            accessibilityRole="button"
            accessibilityLabel="Đổi sang App Khách"
            className="flex-row items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 shadow-2xs active:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40"
          >
            <View className="mr-1.5 size-2 rounded-full bg-blue-600" />
            <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">
              App Khách ⇄
            </Text>
          </Pressable>
        </View>

        {/* ── CENTERED IN-DEVELOPMENT PLACEHOLDER ── */}
        <View className="flex-1 items-center justify-center py-16">
          <Text className="text-center text-base font-medium text-neutral-500 dark:text-neutral-400">
            Chức năng đang được phát triển
          </Text>

          {/* Registration / Login CTA */}
          <View className="mt-8 w-full max-w-xs space-y-3">
            <Pressable
              testID="worker-guest-start-btn"
              onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
              accessibilityRole="button"
              accessibilityLabel="Bắt đầu ngay"
              className="h-12 w-full flex-row items-center justify-center rounded-2xl bg-blue-600 shadow-md shadow-blue-600/30 active:bg-blue-700"
            >
              <Text className="text-sm font-bold text-white">
                Bắt đầu ngay
              </Text>
              <Text className="ml-2 text-sm font-bold text-white">
                →
              </Text>
            </Pressable>
            <Pressable
              testID="worker-guest-cta-bottom"
              onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
              accessibilityRole="button"
              accessibilityLabel="Đăng nhập tài khoản Thợ"
              className="h-11 w-full items-center justify-center rounded-2xl border border-blue-600 active:bg-blue-50 dark:active:bg-blue-950/40"
            >
              <Text className="text-xs font-bold text-blue-600 dark:text-blue-400">
                Đã có tài khoản? Đăng nhập
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}
