import Env from 'env';
import * as React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export default function HomeScreen() {
  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View className="flex-1 items-center justify-center px-6 py-16">
        {/* Logo / Badge */}
        <View className="mb-6 size-20 items-center justify-center rounded-3xl bg-blue-600 shadow-lg shadow-blue-500/30">
          <Text className="text-3xl font-bold text-white">HG</Text>
        </View>

        {/* App Title & Subtitle */}
        <Text className="text-center text-3xl font-bold tracking-tight text-neutral-900 dark:text-white">
          HANDY GO Mobile
        </Text>
        <Text className="mt-2 text-center text-lg font-medium text-neutral-500 dark:text-neutral-400">
          React Native base project
        </Text>

        {/* Foundation Info Card */}
        <View className="mt-10 w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="mb-4 text-xs font-semibold tracking-wider text-blue-600 uppercase dark:text-blue-400">
            Base Architecture
          </Text>

          <View className="space-y-3">
            <InfoRow label="Framework" value="Expo SDK 54 / RN 0.81" />
            <InfoRow label="Language" value="TypeScript (Strict)" />
            <InfoRow label="Navigation" value="Expo Router (File-based)" />
            <InfoRow label="Styling" value="Uniwind / TailwindCSS" />
            <InfoRow label="Environment" value={Env.EXPO_PUBLIC_APP_ENV} />
            <InfoRow label="App Version" value={`v${Env.EXPO_PUBLIC_VERSION}`} />
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
