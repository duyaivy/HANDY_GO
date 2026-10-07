/* eslint-disable max-lines-per-function */
import type { AppStateStatus } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { AppState, View } from 'react-native';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { ERROR_CODES } from '@/services/api/api-error';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';

export function OtpVerificationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    challengeId?: string;
    email?: string;
    phone?: string;
    emailMasked?: string;
    deliveryFailed?: string;
    resendAvailableAt?: string;
  }>();

  const email = params.email;
  const phone = params.phone;
  const emailMasked = params.emailMasked;
  const [isDeliveryFailed, setIsDeliveryFailed] = React.useState(params.deliveryFailed === 'true');

  const [challengeId, setChallengeId] = React.useState<string | undefined>(params.challengeId);

  const verifyOtp = useAuthStore.use.verifyOtp();
  const isLoading = useAuthStore.use.isLoading();

  const [otp, setOtp] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [successNotice, setSuccessNotice] = React.useState<string | null>(null);
  const [isResending, setIsResending] = React.useState(false);

  // Compute initial cooldown seconds from server timestamp if provided
  const targetResendTimestamp = React.useRef<number>(
    params.resendAvailableAt
      ? new Date(params.resendAvailableAt).getTime()
      : isDeliveryFailed
        ? Date.now()
        : Date.now() + 60000,
  );

  const calculateRemainingSeconds = React.useCallback(() => {
    const diff = targetResendTimestamp.current - Date.now();
    return Math.max(0, Math.ceil(diff / 1000));
  }, []);

  const [cooldown, setCooldown] = React.useState<number>(calculateRemainingSeconds);

  // Countdown timer for resend cooldown
  React.useEffect(() => {
    if (cooldown <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setCooldown(calculateRemainingSeconds());
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldown, calculateRemainingSeconds]);

  // Re-sync countdown when app returns to foreground
  React.useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        setCooldown(calculateRemainingSeconds());
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [calculateRemainingSeconds]);

  const handleVerify = async () => {
    const cleanOtp = otp.replace(/\D/g, '');
    if (cleanOtp.length !== 6) {
      setError('Vui lòng nhập đúng 6 chữ số mã OTP');
      return;
    }

    if (!email && !phone) {
      setError('Thiếu thông tin tài khoản cần xác thực. Vui lòng quay lại màn hình đăng nhập.');
      return;
    }

    if (isLoading || isResending) {
      return;
    }

    setError(null);
    setSuccessNotice(null);

    try {
      await verifyOtp({
        challengeId,
        email,
        phone,
        otp: cleanOtp,
      });

      // Verification successful: tokens saved and store updated, navigate directly into Customer App
      router.replace(RouteNames.CUSTOMER_HOME as any);
    }
    catch (err: any) {
      const code = err?.code;

      if (code === ERROR_CODES.OTP_INVALID) {
        const remaining = err?.details?.remainingAttempts;
        setError(
          remaining !== undefined
            ? `Mã OTP không chính xác. Bạn còn ${remaining} lần thử.`
            : 'Mã OTP không chính xác. Vui lòng kiểm tra lại.',
        );
        return;
      }

      if (code === ERROR_CODES.OTP_EXPIRED) {
        setError('Mã OTP đã hết hạn. Vui lòng nhấn gửi lại mã mới.');
        return;
      }

      if (code === ERROR_CODES.OTP_ALREADY_USED) {
        setError('Mã OTP này đã được sử dụng. Vui lòng nhấn gửi lại mã mới.');
        return;
      }

      if (code === ERROR_CODES.OTP_ATTEMPTS_EXCEEDED) {
        setError('Bạn đã vượt quá số lần nhập sai cho phép. Vui lòng nhấn gửi lại mã OTP mới.');
        return;
      }

      if (code === ERROR_CODES.RATE_LIMITED) {
        setError('Bạn đã gửi yêu cầu quá nhiều lần. Vui lòng đợi thêm thời gian.');
        return;
      }

      if (code === ERROR_CODES.PROFILE_NOT_READY) {
        setError('Hồ sơ người dùng đang được khởi tạo. Vui lòng thử lại sau giây lát.');
        return;
      }

      setError(err?.message || 'Xác thực OTP không thành công. Vui lòng thử lại.');
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending || isLoading) {
      return;
    }

    if (!email && !phone) {
      setError('Thiếu thông tin tài khoản cần xác thực.');
      return;
    }

    setIsResending(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const response = await AuthApi.resendOtp({ email, phone });
      setSuccessNotice('Mã OTP mới đã được gửi thành công.');
      setIsDeliveryFailed(false);

      if (response?.data?.challengeId) {
        setChallengeId(response.data.challengeId);
      }

      if (response?.data?.resendAvailableAt) {
        targetResendTimestamp.current = new Date(response.data.resendAvailableAt).getTime();
      }
      else {
        targetResendTimestamp.current = Date.now() + 60000;
      }
      setCooldown(calculateRemainingSeconds());
    }
    catch (err: any) {
      const code = err?.code;
      if (code === ERROR_CODES.RATE_LIMITED) {
        setError('Bạn đã gửi lại mã quá số lần cho phép trong giờ. Vui lòng thử lại sau.');
      }
      else if (code === ERROR_CODES.OTP_DELIVERY_FAILED) {
        setError('Không thể gửi email OTP lúc này. Vui lòng thử lại sau giây lát.');
      }
      else {
        setError(err?.message || 'Không thể gửi lại mã OTP lúc này. Vui lòng thử lại sau.');
      }
    }
    finally {
      setIsResending(false);
    }
  };

  return (
    <Screen
      safeArea
      scrollable
      keyboardAware
      bottomOffset={70}
      className="bg-neutral-50 dark:bg-neutral-950"
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
    >
      <View testID="auth-otp-screen" className="px-6 py-8">
        {/* Header */}
        <View className="mb-8 items-center">
          <View className="mb-4">
            <BrandLogo />
          </View>
          <Text className="text-center text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Xác thực tài khoản
          </Text>
          <Text className="mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Mã OTP 6 chữ số đã được gửi đến:
          </Text>
          <Text className="text-center text-sm font-semibold text-neutral-800 dark:text-neutral-200">
            {emailMasked || email || phone || 'thông tin tài khoản của bạn'}
          </Text>
        </View>

        {/* Card */}
        <View className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {isDeliveryFailed
            ? (
                <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
                  <Text className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Không thể gửi email OTP đến hộp thư của bạn do gián đoạn kết nối. Vui lòng nhấn &quot;Gửi lại mã OTP&quot; bên dưới để nhận mã mới.
                  </Text>
                </View>
              )
            : null}

          {error
            ? (
                <View testID="otp-error-message" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
                  <Text className="text-sm font-medium text-red-700 dark:text-red-300">
                    {error}
                  </Text>
                </View>
              )
            : null}

          {successNotice
            ? (
                <View className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/50">
                  <Text className="text-sm font-medium text-green-700 dark:text-green-300">
                    {successNotice}
                  </Text>
                </View>
              )
            : null}

          <Input
            testID="otp-input"
            label="Mã xác thực (OTP)"
            placeholder="Nhập 6 chữ số"
            keyboardType="number-pad"
            maxLength={6}
            value={otp}
            onChangeText={(text) => {
              // Only allow digits
              const clean = text.replace(/\D/g, '');
              setOtp(clean);
              if (error) {
                setError(null);
              }
            }}
          />

          <View className="mt-6 space-y-3">
            <Button
              testID="otp-submit-btn"
              label="Xác nhận kích hoạt"
              variant="default"
              loading={isLoading}
              disabled={isLoading || isResending}
              onPress={handleVerify}
            />

            <Button
              testID="otp-resend-btn"
              label={
                cooldown > 0
                  ? `Gửi lại mã sau (${cooldown}s)`
                  : 'Gửi lại mã OTP'
              }
              variant="outline"
              loading={isResending}
              disabled={cooldown > 0 || isResending || isLoading}
              onPress={handleResend}
            />
          </View>
        </View>

        {/* Back Link */}
        <View className="mt-8 items-center">
          <Button
            testID="otp-back-btn"
            label="Quay lại Đăng nhập"
            variant="ghost"
            onPress={() => router.replace(RouteNames.AUTH_LOGIN as any)}
          />
        </View>
      </View>
    </Screen>
  );
}
