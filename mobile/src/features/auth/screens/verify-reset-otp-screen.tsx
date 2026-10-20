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

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyResetOtpScreen() {
  const router = useRouter();
  const email = usePasswordResetStore(state => state.email);
  const setResetToken = usePasswordResetStore(state => state.setResetToken);
  const clearFlow = usePasswordResetStore(state => state.clear);
  const [otp, setOtp] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [isResending, setIsResending] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(RESEND_COOLDOWN_SECONDS);

  React.useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }
    const timer = setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const isNavigatingAway = React.useRef(false);

  React.useEffect(() => {
    if (!email && !isNavigatingAway.current) {
      router.replace(RouteNames.AUTH_FORGOT_PASSWORD as any);
    }
  }, [email, router]);

  const handleVerify = async () => {
    const cleanOtp = otp.replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Vui lòng nhập đúng 6 chữ số mã OTP');
      return;
    }
    if (!email || isVerifying || isResending) {
      return;
    }

    setError(null);
    setNotice(null);
    setIsVerifying(true);
    try {
      const response = await AuthApi.verifyResetOtp({ email, otp: cleanOtp });
      setResetToken(response.data.resetToken);
      router.push(RouteNames.AUTH_RESET_PASSWORD as any);
    }
    catch (err: any) {
      setError(err?.statusCode === 429
        ? 'Bạn đã gửi quá nhiều yêu cầu xác minh. Vui lòng thử lại sau.'
        : err?.statusCode === 400
          ? 'Mã OTP không hợp lệ hoặc đã hết hạn.'
          : err?.message || 'Mã OTP không hợp lệ hoặc đã hết hạn.');
    }
    finally {
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email || cooldown > 0 || isResending || isVerifying) {
      return;
    }
    setError(null);
    setNotice(null);
    setIsResending(true);
    try {
      await AuthApi.forgotPassword({ email });
      setNotice('Nếu email tồn tại và hợp lệ, mã mới đã được gửi. Vui lòng kiểm tra hộp thư.');
      setOtp('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
    catch (err: any) {
      setError(err?.statusCode === 429
        ? 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau.'
        : err?.message || 'Chưa thể gửi lại mã lúc này. Vui lòng thử lại.');
    }
    finally {
      setIsResending(false);
    }
  };

  const handleCancel = () => {
    isNavigatingAway.current = true;
    clearFlow();
    router.replace(RouteNames.AUTH_LOGIN as any);
  };

  return (
    <PasswordResetLayout
      step={2}
      testID="auth-verify-reset-otp-screen"
      title="Kiểm tra email"
      description="Nhập mã OTP gồm 6 chữ số để xác minh yêu cầu đặt lại mật khẩu."
    >
      <Text className="mb-5 text-center text-sm font-semibold text-neutral-700 dark:text-neutral-200">{email}</Text>

      <View testID="forgot-password-generic-success" className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/50">
        <Text className="text-sm/5 text-emerald-800 dark:text-emerald-200">
          Nếu email tồn tại và hợp lệ, mã xác minh đã được gửi. Vui lòng kiểm tra hộp thư.
        </Text>
      </View>

      {error
        ? (
            <View testID="verify-reset-otp-error" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/50">
              <Text className="text-sm/5 text-red-700 dark:text-red-300">{error}</Text>
            </View>
          )
        : null}
      {notice
        ? (
            <View testID="verify-reset-otp-notice" className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/50">
              <Text className="text-sm/5 text-emerald-800 dark:text-emerald-200">{notice}</Text>
            </View>
          )
        : null}

      <Input
        testID="verify-reset-otp-input"
        label="Mã OTP"
        placeholder="••••••"
        keyboardType="number-pad"
        value={otp}
        onChangeText={(value) => {
          setOtp(value.replace(/\D/g, '').slice(0, 6));
          setError(null);
        }}
        maxLength={6}
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        accessibilityLabel="Mã OTP gồm 6 chữ số"
      />

      <View className="mt-4">
        <Button
          testID="verify-reset-otp-submit-button"
          label="Xác minh mã"
          className="h-12 rounded-xl bg-primary-600"
          loading={isVerifying}
          disabled={isVerifying || isResending}
          onPress={handleVerify}
        />
      </View>

      <View className="mt-2 flex-row items-center justify-center">
        <Text className="text-sm text-neutral-500 dark:text-neutral-400">Chưa nhận được mã? </Text>
        <Pressable
          testID="verify-reset-otp-resend-button"
          accessibilityRole="button"
          disabled={cooldown > 0 || isResending || isVerifying}
          onPress={handleResend}
          className="py-2"
        >
          <Text className={`text-sm font-semibold ${cooldown > 0 || isResending ? 'text-neutral-400' : 'text-primary-700 dark:text-primary-300'}`}>
            {isResending ? 'Đang gửi...' : cooldown > 0 ? `Gửi lại sau ${cooldown}s` : 'Gửi lại mã'}
          </Text>
        </Pressable>
      </View>

      <Pressable
        testID="verify-reset-otp-cancel"
        accessibilityRole="button"
        onPress={handleCancel}
        className="mt-3 items-center py-2"
      >
        <Text className="text-sm font-semibold text-neutral-600 dark:text-neutral-300">Hủy và quay lại đăng nhập</Text>
      </Pressable>
    </PasswordResetLayout>
  );
}
