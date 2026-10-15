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

export function ForgotPasswordScreen() {
  const router = useRouter();
  const storedEmail = usePasswordResetStore(state => state.email);
  const setEmail = usePasswordResetStore(state => state.setEmail);
  const clearFlow = usePasswordResetStore(state => state.clear);
  const [email, setEmailInput] = React.useState(storedEmail);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  const handleSubmit = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Vui lòng nhập địa chỉ email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Địa chỉ email không hợp lệ');
      return;
    }
    if (isLoading) {
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      await AuthApi.forgotPassword({ email: normalizedEmail });
      setEmail(normalizedEmail);
      router.push(RouteNames.AUTH_VERIFY_RESET_OTP as any);
    }
    catch (err: any) {
      setError(err?.statusCode === 429
        ? 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'
        : err?.message || 'Chưa thể gửi yêu cầu lúc này. Vui lòng thử lại.');
    }
    finally {
      setIsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    clearFlow();
    router.replace(RouteNames.AUTH_LOGIN as any);
  };

  return (
    <PasswordResetLayout
      step={1}
      testID="auth-forgot-password-screen"
      title="Quên mật khẩu?"
      description="Nhập email đã đăng ký. Chúng tôi sẽ gửi mã xác minh nếu địa chỉ này hợp lệ."
    >
      {error
        ? (
            <View testID="forgot-password-error" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/50">
              <Text className="text-sm/5 text-red-700 dark:text-red-300">{error}</Text>
            </View>
          )
        : null}

      <Input
        testID="forgot-password-email-input"
        label="Email"
        placeholder="ban@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        value={email}
        onChangeText={(value) => {
          setEmailInput(value);
          setError(null);
        }}
        error={undefined}
        returnKeyType="send"
        onSubmitEditing={handleSubmit}
      />

      <View className="mt-4">
        <Button
          testID="forgot-password-submit-button"
          label="Gửi mã xác minh"
          variant="default"
          className="h-12 rounded-xl bg-primary-600"
          loading={isLoading}
          disabled={isLoading}
          onPress={handleSubmit}
        />
      </View>

      <Pressable
        testID="forgot-password-back-to-login"
        accessibilityRole="button"
        onPress={handleBackToLogin}
        className="mt-5 items-center py-2"
      >
        <Text className="text-sm font-semibold text-primary-700 dark:text-primary-300">Quay lại đăng nhập</Text>
      </Pressable>
    </PasswordResetLayout>
  );
}
