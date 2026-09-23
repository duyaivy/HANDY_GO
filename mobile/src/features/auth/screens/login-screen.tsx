import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';

export function LoginScreen() {
  const router = useRouter();

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="auth-login-screen" className="flex-1 items-center justify-center px-6 py-12">
        {/* Placeholder Icon / Badge */}
        <View className="mb-6 size-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-md">
          <Text className="text-2xl font-bold text-white">🔒</Text>
        </View>

        {/* Screen Identity */}
        <Text className="text-center text-2xl font-bold text-neutral-900 dark:text-white">
          Màn hình Đăng nhập
        </Text>
        <Text className="mt-1 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Route: /login
        </Text>

        {/* Module / Owner info card */}
        <View className="mt-8 w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="text-xs font-semibold tracking-wider text-indigo-600 uppercase dark:text-indigo-400">
            Thông tin Module
          </Text>
          <Text className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
            Thư mục:
            {' '}
            <Text className="font-semibold text-neutral-900 dark:text-white">src/features/auth/</Text>
          </Text>
          <Text className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
            Người phụ trách:
            {' '}
            <Text className="font-semibold text-neutral-900 dark:text-white">Auth / User &amp; Trust Service Owner</Text>
          </Text>

          <View className="mt-4 rounded-xl bg-neutral-100 p-3 dark:bg-neutral-800">
            <Text className="text-xs/relaxed text-neutral-600 dark:text-neutral-400">
              Đây là placeholder giao diện xác thực. Form nhập liệu, API submit đăng nhập và cơ chế quản lý token sẽ do người phụ trách Auth phát triển.
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View className="mt-8 w-full space-y-3">
          <Button
            testID="auth-login-back-btn"
            label="Quay lại Demo Home (/)"
            variant="outline"
            onPress={() => router.replace(RouteNames.ROOT)}
          />
        </View>
      </View>
    </Screen>
  );
}
