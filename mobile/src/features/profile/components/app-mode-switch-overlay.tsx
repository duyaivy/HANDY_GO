import * as React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppModeSwitch } from '../hooks/use-app-mode-switch';
import { useModeSwitchStore } from '../stores/use-mode-switch-store';

export function AppModeSwitchOverlay() {
  const isSwitching = useModeSwitchStore(state => state.isSwitching);
  const targetMode = useModeSwitchStore(state => state.targetMode);
  const isTimedOut = useModeSwitchStore(state => state.isTimedOut);
  const errorMessage = useModeSwitchStore(state => state.errorMessage);

  const { retrySwitch, revertSwitch } = useAppModeSwitch();

  if (!isSwitching) {
    return null;
  }

  const isWorker = targetMode === 'Worker';
  const spinnerColor = isWorker ? '#2563EB' : '#F5A524';
  const message = isWorker
    ? 'Đang chuyển sang giao diện Thợ...'
    : 'Đang chuyển sang giao diện Khách hàng...';

  return (
    <View
      testID="app-mode-switch-overlay"
      style={StyleSheet.absoluteFillObject}
      className="z-50 items-center justify-center bg-black/60 p-6"
    >
      <View className="w-full max-w-xs items-center rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-900">
        {!isTimedOut
          ? (
              <>
                <ActivityIndicator
                  testID="mode-switch-spinner"
                  size="large"
                  color={spinnerColor}
                  className="mb-4"
                />
                <Text
                  testID="mode-switch-message"
                  className="text-center text-sm font-semibold text-neutral-800 dark:text-neutral-100"
                >
                  {message}
                </Text>
              </>
            )
          : (
              <>
                <View className="mb-3 size-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/40">
                  <Text className="text-xl font-bold text-rose-600">!</Text>
                </View>
                <Text className="mb-2 text-center text-sm font-bold text-neutral-900 dark:text-white">
                  Chuyển ứng dụng không thành công
                </Text>
                <Text
                  testID="mode-switch-error-message"
                  className="mb-5 text-center text-xs text-neutral-500 dark:text-neutral-400"
                >
                  {errorMessage || 'Không thể chuyển ứng dụng vào lúc này. Vui lòng thử lại.'}
                </Text>
                <View className="w-full gap-2.5">
                  <Button
                    testID="mode-switch-retry-btn"
                    label="Thử lại"
                    variant="default"
                    className="h-11 rounded-xl bg-blue-600"
                    textClassName="text-xs font-bold text-white"
                    onPress={retrySwitch}
                  />
                  <Button
                    testID="mode-switch-cancel-btn"
                    label="Quay về"
                    variant="outline"
                    className="h-11 rounded-xl border-neutral-300 dark:border-neutral-700"
                    textClassName="text-xs font-semibold text-neutral-700 dark:text-neutral-300"
                    onPress={revertSwitch}
                  />
                </View>
              </>
            )}
      </View>
    </View>
  );
}
