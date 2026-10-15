import { Link, Stack } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '404 - Not Found' }} />
      <Screen safeArea className="items-center justify-center p-6">
        <View className="items-center justify-center space-y-4">
          <Text className="text-4xl font-bold text-neutral-900 dark:text-white">404</Text>
          <Text className="text-base text-neutral-500 dark:text-neutral-400">
            This screen does not exist.
          </Text>
          <Link href="/" className="mt-4">
            <Text className="text-base font-semibold text-blue-600 dark:text-blue-400">
              Go to Home screen
            </Text>
          </Link>
        </View>
      </Screen>
    </>
  );
}
