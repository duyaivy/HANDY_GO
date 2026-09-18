import Env from 'env';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';

export function BaseDemoScreen() {
  const router = useRouter();

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View className="flex-1 items-center justify-center px-6 py-12">
        {/* Logo / Badge */}
        <View className="mb-6 size-20 items-center justify-center rounded-3xl bg-blue-600 shadow-lg shadow-blue-500/30">
          <Text className="text-3xl font-bold text-white">HG</Text>
        </View>

        {/* App Title & Subtitle */}
        <Text className="text-center text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
          HANDYGO MOBILE
        </Text>
        <Text className="mt-2 text-center text-base font-medium text-neutral-500 dark:text-neutral-400">
          Scaffold &amp; Modular Base Architecture
        </Text>

        {/* Ownership Badge */}
        <View className="mt-4 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 dark:border-blue-900 dark:bg-blue-950/50">
          <Text className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            Module: features/dev-demo | Owner: Base/Integration
          </Text>
        </View>

        {/* Navigation Action Buttons */}
        <View className="mt-8 w-full space-y-3">
          <Text className="text-xs font-bold tracking-wider text-neutral-400 uppercase dark:text-neutral-500">
            Khu vực trải nghiệm (Navigation Shell)
          </Text>

          <Button
            testID="dev-demo-open-customer"
            label="Xem giao diện Khách (/customer)"
            variant="default"
            onPress={() => router.push(RouteNames.CUSTOMER_HOME)}
          />

          <Button
            testID="dev-demo-open-worker"
            label="Xem giao diện Thợ (/worker)"
            variant="outline"
            onPress={() => router.push(RouteNames.WORKER_HOME)}
          />

          <Button
            testID="dev-demo-open-login"
            label="Xem màn hình Đăng nhập (/login)"
            variant="ghost"
            onPress={() => router.push(RouteNames.LOGIN)}
          />
        </View>

        {/* Architecture Info Card */}
        <View className="mt-8 w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="mb-4 text-xs font-semibold tracking-wider text-blue-600 uppercase dark:text-blue-400">
            Kiến trúc Nền tảng (Integration Rules)
          </Text>

          <View className="space-y-3">
            <InfoRow label="Microservices" value="Single API Gateway" />
            <InfoRow label="Base URL" value={Env.EXPO_PUBLIC_API_URL || 'Configured via Env'} />
            <InfoRow label="Modularity" value="Domain-first & Role-owned" />
            <InfoRow label="Framework" value="Expo SDK 54 / RN 0.81" />
            <InfoRow label="Language" value="TypeScript (Strict)" />
            <InfoRow label="Navigation" value="Expo Router (Thin Adapters)" />
          </View>
        </View>

        {/* Footer Status */}
        <View className="mt-8 flex-row items-center justify-center space-x-2">
          <View className="size-2.5 rounded-full bg-emerald-500" />
          <Text className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Src Base Ready &amp; Initialized
          </Text>
        </View>
      </View>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between border-b border-neutral-100 py-2 dark:border-neutral-800">
      <Text className="text-sm text-neutral-500 dark:text-neutral-400">{label}</Text>
      <Text className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">{value}</Text>
    </View>
  );
}
