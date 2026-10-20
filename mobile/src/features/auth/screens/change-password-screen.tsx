/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { AuthApi } from '@/services/auth/auth-api';

function KeyLockIcon({ size = 20, color = '#F5A524' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </Svg>
  );
}

export function ChangePasswordScreen() {
  const router = useRouter();

  const [oldPassword, setOldPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  const [showOldPassword, setShowOldPassword] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const validate = (): boolean => {
    if (!oldPassword.trim()) {
      setError('Vui lòng nhập mật khẩu hiện tại');
      return false;
    }
    if (!newPassword) {
      setError('Vui lòng nhập mật khẩu mới');
      return false;
    }
    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có tối thiểu 8 ký tự');
      return false;
    }
    if (new TextEncoder().encode(newPassword).length > 72) {
      setError('Mật khẩu không được vượt quá 72 byte');
      return false;
    }
    if (
      !/[a-z]/.test(newPassword)
      || !/[A-Z]/.test(newPassword)
      || !/\d/.test(newPassword)
      || !/[^a-z0-9]/i.test(newPassword)
    ) {
      setError('Mật khẩu mới cần có chữ hoa, chữ thường, chữ số và ký tự đặc biệt');
      return false;
    }
    if (newPassword === oldPassword) {
      setError('Mật khẩu mới không được trùng với mật khẩu cũ');
      return false;
    }
    if (!confirmPassword) {
      setError('Vui lòng xác nhận mật khẩu mới');
      return false;
    }
    if (confirmPassword !== newPassword) {
      setError('Mật khẩu xác nhận không trùng khớp');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || isLoading) {
      return;
    }
    setError(null);
    setSuccessMessage(null);
    setIsLoading(true);

    try {
      await AuthApi.changePassword({
        oldPassword,
        newPassword,
      });
      setSuccessMessage('Đổi mật khẩu thành công!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
    catch (err: any) {
      setError(
        err?.statusCode === 429
          ? 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'
          : err?.message || 'Không thể đổi mật khẩu lúc này. Vui lòng kiểm tra lại mật khẩu cũ.',
      );
    }
    finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title="Đổi mật khẩu"
        subtitle="Cập nhật mật khẩu bảo mật tài khoản"
        onBack={() => router.back()}
        testID="change-password-app-bar"
      />

      <View testID="change-password-screen" className="flex-1 p-5">
        {/* Security Info Card */}
        <View className="mb-4 flex-row items-center rounded-2xl border border-amber-200 bg-amber-50/80 p-4 shadow-xs dark:border-amber-900 dark:bg-amber-950/40">
          <View className="mr-3 size-10 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/60">
            <KeyLockIcon size={20} color="#D97706" />
          </View>
          <View className="flex-1">
            <Text className="text-xs font-bold text-amber-950 dark:text-amber-200">
              Bảo mật tài khoản
            </Text>
            <Text className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">
              Nhập mật khẩu hiện tại và tạo mật khẩu mới để tăng cường an toàn.
            </Text>
          </View>
        </View>

        {/* Error Notification */}
        {error
          ? (
              <View
                testID="change-password-error"
                className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-xs dark:border-red-900 dark:bg-red-950/50"
              >
                <Text className="text-sm font-medium text-red-700 dark:text-red-300">
                  {error}
                </Text>
              </View>
            )
          : null}

        {/* Success Notification */}
        {successMessage
          ? (
              <View
                testID="change-password-success"
                className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-xs dark:border-emerald-900 dark:bg-emerald-950/50"
              >
                <Text className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                  {successMessage}
                </Text>
              </View>
            )
          : null}

        {/* Inputs Card */}
        <View className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          {/* 1. Mật khẩu cũ */}
          <View>
            <Input
              testID="old-password-input"
              label="Mật khẩu hiện tại"
              placeholder="Nhập mật khẩu hiện tại"
              secureTextEntry={!showOldPassword}
              value={oldPassword}
              onChangeText={(text) => {
                setOldPassword(text);
                setError(null);
              }}
              autoComplete="password"
              textContentType="password"
              rightAccessory={(
                <Pressable
                  testID="old-password-toggle"
                  onPress={() => setShowOldPassword(v => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showOldPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  <Text className="text-xs font-semibold text-[#F5A524]">
                    {showOldPassword ? 'Ẩn' : 'Hiện'}
                  </Text>
                </Pressable>
              )}
            />
          </View>

          {/* 2. Mật khẩu mới */}
          <View className="mt-4">
            <Input
              testID="new-password-input"
              label="Mật khẩu mới"
              placeholder="Nhập mật khẩu mới"
              secureTextEntry={!showNewPassword}
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                setError(null);
              }}
              autoComplete="new-password"
              textContentType="newPassword"
              rightAccessory={(
                <Pressable
                  testID="new-password-toggle"
                  onPress={() => setShowNewPassword(v => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showNewPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  <Text className="text-xs font-semibold text-[#F5A524]">
                    {showNewPassword ? 'Ẩn' : 'Hiện'}
                  </Text>
                </Pressable>
              )}
            />
            <Text className="mt-1 text-xs text-neutral-400">
              Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
            </Text>
          </View>

          {/* 3. Nhập lại mật khẩu mới */}
          <View className="mt-4">
            <Input
              testID="confirm-new-password-input"
              label="Nhập lại mật khẩu mới"
              placeholder="Xác nhận mật khẩu mới"
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError(null);
              }}
              autoComplete="new-password"
              textContentType="newPassword"
              rightAccessory={(
                <Pressable
                  testID="confirm-new-password-toggle"
                  onPress={() => setShowConfirmPassword(v => !v)}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  <Text className="text-xs font-semibold text-[#F5A524]">
                    {showConfirmPassword ? 'Ẩn' : 'Hiện'}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </View>

        {/* Action Buttons */}
        <View className="mt-6 space-y-3">
          <Button
            testID="submit-change-password-btn"
            label="Cập nhật mật khẩu"
            variant="default"
            className="h-12 rounded-2xl bg-[#F5A524]"
            textClassName="text-sm font-bold text-neutral-900"
            loading={isLoading}
            disabled={isLoading}
            onPress={handleSubmit}
          />
          <Button
            testID="cancel-change-password-btn"
            label="Quay lại"
            variant="outline"
            className="h-12 rounded-2xl border-neutral-300 dark:border-neutral-700"
            onPress={() => router.back()}
          />
        </View>
      </View>
    </Screen>
  );
}
