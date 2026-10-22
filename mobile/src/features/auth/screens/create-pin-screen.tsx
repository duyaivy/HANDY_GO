/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { BackspaceIcon, LockIcon } from '@/components/ui/icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useAuthFlowStore } from '../use-auth-flow-store';

const PIN_LENGTH = 6;

const PIN_DOT_IDS = ['dot-0', 'dot-1', 'dot-2', 'dot-3', 'dot-4', 'dot-5'] as const;
const KEYPAD_ROWS = [
  { id: 'row-1', digits: ['1', '2', '3'] },
  { id: 'row-2', digits: ['4', '5', '6'] },
  { id: 'row-3', digits: ['7', '8', '9'] },
] as const;

export function CreatePinScreen() {
  const router = useRouter();
  const setPinInStore = useAuthFlowStore(state => state.setPin);
  const existingPin = useAuthFlowStore(state => state.pin);

  const [pin, setPin] = React.useState(existingPin || '');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleKeyPress = (digit: string) => {
    if (pin.length < PIN_LENGTH) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage(null);
      if (nextPin.length === PIN_LENGTH) {
        setPinInStore(nextPin);
      }
    }
  };

  const handleDelete = () => {
    if (pin.length > 0) {
      setPin(prev => prev.slice(0, -1));
      setErrorMessage(null);
    }
  };

  const handleClear = () => {
    setPin('');
    setErrorMessage(null);
  };

  const handleContinue = () => {
    if (pin.length !== PIN_LENGTH) {
      setErrorMessage(`Vui lòng nhập đủ ${PIN_LENGTH} chữ số mã PIN`);
      return;
    }
    setPinInStore(pin);
    router.push(RouteNames.AUTH_COMPLETE_PROFILE as any);
  };

  const handleBack = React.useCallback(() => {
    if (router.canGoBack ? router.canGoBack() : true) {
      router.back();
    }
    else {
      router.replace(RouteNames.AUTH_LOGIN as any);
    }
  }, [router]);

  return (
    <Screen
      safeArea
      scrollable
      className="bg-neutral-50 dark:bg-neutral-950"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <AppBar
        mode="stack"
        title="Tạo mã PIN"
        onBack={handleBack}
        testID="create-pin-app-bar"
      />

      <View testID="create-pin-screen" className="flex-1 justify-between px-6 py-4">
        {/* Top Header */}
        <View className="items-center">
          <View className="mb-3 size-16 items-center justify-center rounded-3xl bg-amber-100 shadow-xs dark:bg-amber-950/40">
            <LockIcon size={32} color="#F5A524" />
          </View>
          <Text className="text-center text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Tạo mã PIN bảo mật
          </Text>
          <Text className="mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Mã PIN 6 số dùng để xác thực nhanh và bảo vệ tài khoản HandyGo của bạn
          </Text>

          {/* 6 Indicator Dots */}
          <View
            testID="pin-dots-container"
            className="my-8 flex-row items-center justify-center space-x-4"
          >
            {PIN_DOT_IDS.map((dotId, index) => {
              const isFilled = index < pin.length;
              return (
                <View
                  key={dotId}
                  testID={`pin-dot-${index}`}
                  className={`size-4 rounded-full transition-all ${
                    isFilled
                      ? 'scale-110 bg-[#F5A524]'
                      : 'border-2 border-neutral-300 dark:border-neutral-600'
                  }`}
                />
              );
            })}
          </View>

          {errorMessage && (
            <View testID="pin-error-message" className="mb-2 rounded-xl bg-red-50 px-4 py-2 dark:bg-red-950/50">
              <Text className="text-center text-xs font-medium text-red-600 dark:text-red-400">
                {errorMessage}
              </Text>
            </View>
          )}
        </View>

        {/* Custom Numeric Keypad */}
        <View className="items-center pb-4">
          <View className="w-full max-w-[320px]">
            {/* Rows 1-3 */}
            {KEYPAD_ROWS.map(row => (
              <View key={row.id} className="mb-3 flex-row justify-between">
                {row.digits.map(digit => (
                  <Pressable
                    key={`pin-key-${digit}`}
                    testID={`pin-key-${digit}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Số ${digit}`}
                    onPress={() => handleKeyPress(digit)}
                    className="size-20 items-center justify-center rounded-full bg-white shadow-xs active:bg-neutral-200 dark:bg-neutral-900 dark:active:bg-neutral-800"
                  >
                    <Text className="text-2xl font-bold text-neutral-900 dark:text-white">
                      {digit}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ))}

            {/* Row 4: Clear, 0, Delete */}
            <View className="mb-4 flex-row justify-between">
              <Pressable
                testID="pin-key-clear"
                accessibilityRole="button"
                accessibilityLabel="Xóa hết"
                onPress={handleClear}
                className="size-20 items-center justify-center rounded-full bg-transparent active:bg-neutral-100 dark:active:bg-neutral-800"
              >
                <Text className="text-xs font-semibold text-neutral-400 dark:text-neutral-500">
                  Xóa hết
                </Text>
              </Pressable>

              <Pressable
                testID="pin-key-0"
                accessibilityRole="button"
                accessibilityLabel="Số 0"
                onPress={() => handleKeyPress('0')}
                className="size-20 items-center justify-center rounded-full bg-white shadow-xs active:bg-neutral-200 dark:bg-neutral-900 dark:active:bg-neutral-800"
              >
                <Text className="text-2xl font-bold text-neutral-900 dark:text-white">
                  0
                </Text>
              </Pressable>

              <Pressable
                testID="pin-key-delete"
                accessibilityRole="button"
                accessibilityLabel="Xóa lùi"
                onPress={handleDelete}
                className="size-20 items-center justify-center rounded-full bg-transparent active:bg-neutral-100 dark:active:bg-neutral-800"
              >
                <BackspaceIcon size={24} color="#6B7280" />
              </Pressable>
            </View>
          </View>

          {/* Action Button */}
          <View className="w-full">
            <Button
              testID="pin-submit-btn"
              label="Tiếp tục →"
              variant="default"
              disabled={pin.length !== PIN_LENGTH}
              className={`h-12 w-full rounded-2xl ${
                pin.length === PIN_LENGTH ? 'bg-[#F5A524]' : 'bg-neutral-300 dark:bg-neutral-800'
              }`}
              onPress={handleContinue}
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}
