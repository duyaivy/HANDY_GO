/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { AuthApi } from '@/services/auth/auth-api';
import { PasswordResetLayout } from '../components/password-reset-layout';
import { usePasswordResetStore } from '../use-password-reset-store';

export function ResetPasswordScreen() {
  const router = useRouter();
  const resetToken = usePasswordResetStore(state => state.resetToken);
  const clearFlow = usePasswordResetStore(state => state.clear);
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  React.useEffect(() => {
    if (!resetToken) {
      router.replace(RouteNames.AUTH_FORGOT_PASSWORD as any);
    }
  }, [resetToken, router]);

  const validate = (): boolean => {
    if (!password) {
      setError('Vui lòng nhập mật khẩu mới');
      return false;
    }
    if (password.length < 8) {
      setError('Mật khẩu phải có tối thiểu 8 ký tự');
      return false;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError('Mật khẩu không được vượt quá 72 byte');
      return false;
    }
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^a-z0-9]/i.test(password)) {
      setError('Mật khẩu cần có chữ hoa, chữ thường, chữ số và ký tự đặc biệt');
      return false;
    }
    if (!confirmPassword) {
      setError('Vui lòng xác nhận mật khẩu mới');
      return false;
    }
    if (confirmPassword !== password) {
      setError('Mật khẩu xác nhận không trùng khớp');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate() || !resetToken || isLoading) {
      return;
    }
    setError(null);
    setIsLoading(true);
    try {
      await AuthApi.resetPassword({ resetToken, newPassword: password });
      clearFlow();
      router.replace({
        pathname: RouteNames.AUTH_LOGIN,
        params: { reset: 'true' },
      } as any);
    }
    catch (err: any) {
      setError(err?.statusCode === 429
        ? 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'
        : err?.message || 'Chưa thể đổi mật khẩu lúc này. Vui lòng thử lại.');
    }
    finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    clearFlow();
    router.replace(RouteNames.AUTH_LOGIN as any);
  };

  return (
    <PasswordResetLayout
      step={3}
      testID="auth-reset-password-screen"
      title="Tạo mật khẩu mới"
      description="Chọn mật khẩu mạnh để bảo vệ tài khoản HANDY GO của bạn."
    >
      {error
        ? (
            <View testID="reset-password-error" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/50">
              <Text className="text-sm/5 text-red-700 dark:text-red-300">{error}</Text>
            </View>
          )
        : null}

      <Input
        testID="reset-password-input"
        label="Mật khẩu mới"
        placeholder="Nhập mật khẩu mới"
        secureTextEntry={!showPassword}
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          setError(null);
        }}
        autoComplete="new-password"
        textContentType="newPassword"
        rightAccessory={(
          <Pressable testID="reset-password-toggle" onPress={() => setShowPassword(value => !value)}>
            <Text className="text-xs font-semibold text-primary-700 dark:text-primary-300">{showPassword ? 'Ẩn' : 'Hiện'}</Text>
          </Pressable>
        )}
      />
      <View className="mt-3">
        <Input
          testID="reset-password-confirm-input"
          label="Xác nhận mật khẩu"
          placeholder="Nhập lại mật khẩu mới"
          secureTextEntry={!showConfirmPassword}
          value={confirmPassword}
          onChangeText={(value) => {
            setConfirmPassword(value);
            setError(null);
          }}
          autoComplete="new-password"
          textContentType="newPassword"
          rightAccessory={(
            <Pressable testID="reset-password-confirm-toggle" onPress={() => setShowConfirmPassword(value => !value)}>
              <Text className="text-xs font-semibold text-primary-700 dark:text-primary-300">{showConfirmPassword ? 'Ẩn' : 'Hiện'}</Text>
            </Pressable>
          )}
        />
      </View>
      <Text className="mt-1 text-xs/5 text-neutral-500 dark:text-neutral-400">
        Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
      </Text>

      <View className="mt-4">
        <Button
          testID="reset-password-submit-button"
          label="Cập nhật mật khẩu"
          className="h-12 rounded-xl bg-primary-600"
          loading={isLoading}
          disabled={isLoading}
          onPress={handleSubmit}
        />
      </View>

      <Pressable
        testID="reset-password-cancel"
        accessibilityRole="button"
        onPress={handleCancel}
        className="mt-3 items-center py-2"
      >
        <Text className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">Hủy và quay lại đăng nhập</Text>
      </Pressable>
    </PasswordResetLayout>
  );
}
