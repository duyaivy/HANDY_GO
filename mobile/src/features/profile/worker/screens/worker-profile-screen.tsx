import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useAuthStore } from '@/stores/use-auth-store';

export function WorkerProfileScreen() {
  const router = useRouter();
  const user = useAuthStore.use.user();
  const logout = useAuthStore.use.logout();
  const isLoading = useAuthStore.use.isLoading();

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
      <View testID="profile-worker-screen" className="flex-1 px-6 py-8">
        <View className="items-center">
          <View className="mb-4 size-20 items-center justify-center rounded-3xl bg-amber-600 shadow-lg shadow-amber-500/20">
            <Text className="text-3xl text-white">👨‍🔧</Text>
          </View>
          <Text className="text-center text-2xl font-bold text-neutral-900 dark:text-white">
            Hồ sơ Thợ
          </Text>
          <Text className="mt-1 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
            Route: /worker/profile
          </Text>
          <Text className="mt-1 text-center text-xs text-neutral-400">
            Worker Profile Owner
          </Text>
        </View>

        {/* Account Details Card */}
        <View className="mt-8 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="text-xs font-semibold tracking-wider text-amber-600 uppercase dark:text-amber-400">
            Thông tin tài khoản Thợ
          </Text>

          <View className="mt-4 space-y-3">
            <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">User ID</Text>
              <Text className="text-sm font-medium text-neutral-900 dark:text-white">{user?.id || '—'}</Text>
            </View>

            <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">Số điện thoại</Text>
              <Text className="text-sm font-medium text-neutral-900 dark:text-white">{user?.phone || '—'}</Text>
            </View>

            <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">Email</Text>
              <Text className="text-sm font-medium text-neutral-900 dark:text-white">{user?.email || '—'}</Text>
            </View>

            <View className="flex-row justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
              <Text className="text-sm text-neutral-500 dark:text-neutral-400">Vai trò</Text>
              <Text className="text-sm font-medium text-neutral-900 dark:text-white">
                {user?.roles?.join(', ') || 'Worker'}
              </Text>
            </View>
          </View>
        </View>

        {/* Logout Action */}
        <View className="mt-8">
          <Button
            testID="worker-logout-btn"
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
