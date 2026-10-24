import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { WrenchIcon } from '@/components/ui/icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { SECONDARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';
import { WorkerGuestOverview } from '../components/worker-guest-overview';

export function WorkerHomeScreen() {
  const router = useRouter();
  const user = useAuthStore.use.user();
  const isAuthenticated = useAuthStore.use.isAuthenticated();

  if (!isAuthenticated || !user) {
    return <WorkerGuestOverview />;
  }

  const switchRole = () => {
    const { isAuthenticated: isAuth, user: currentUser } = useAuthStore.getState();
    if (isAuth && currentUser) {
      useAuthStore.getState().setActiveMode('Customer');
    }
    else {
      useAuthStore.getState().setGuestRole('Customer');
    }
    router.replace(RouteNames.CUSTOMER_HOME as any);
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <ScrollView className="flex-1 p-4" testID="home-worker-screen">
        {/* Top Bar: Title & Quick Role Switch */}
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <WrenchIcon size={20} color={SECONDARY_COLOR} />
            <Text className="ml-2 text-xl font-black text-neutral-900 dark:text-white">
              Nhận việc
            </Text>
          </View>
          <Pressable
            testID="home-role-switch-chip"
            onPress={switchRole}
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

        {/* Centered In-development / Placeholder Body */}
        <View className="flex-1 items-center justify-center py-24">
          <Text className="text-center text-base font-medium text-neutral-500 dark:text-neutral-400">
            Chức năng đang được phát triển
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
