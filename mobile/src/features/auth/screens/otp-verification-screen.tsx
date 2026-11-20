import type { AppStateStatus } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { AppState, Pressable, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { LockIcon } from '@/components/ui/icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { getDestinationByRoles } from '@/lib/auth/navigation';
import { ERROR_CODES } from '@/services/api/api-error';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { useAuthFlowStore } from '../use-auth-flow-store';

const OTP_LENGTH = 6;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;
const CIRCLE_RADIUS = 24;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS; // ~150.796

function getResendTimestamp(resendAvailableAt?: string, deliveryFailed = false): number {
  if (deliveryFailed) {
    return Date.now();
  }

  const parsedTimestamp = resendAvailableAt ? Date.parse(resendAvailableAt) : Number.NaN;
  return Number.isFinite(parsedTimestamp)
    ? parsedTimestamp
    : Date.now() + DEFAULT_RESEND_COOLDOWN_SECONDS * 1000;
}

function getSecondsUntil(timestamp: number): number {
  return Math.max(0, Math.ceil((timestamp - Date.now()) / 1000));
}

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

  const flowPhone = useAuthFlowStore(state => state.phone);
  const phone = params.phone || flowPhone || '';
  const email = params.email;
  const emailMasked = params.emailMasked;
  const [isDeliveryFailed, setIsDeliveryFailed] = React.useState(params.deliveryFailed === 'true');
  const [challengeId, setChallengeId] = React.useState<string | undefined>(params.challengeId);

  const verifyOtp = useAuthStore.use.verifyOtp();
  const isLoading = useAuthStore.use.isLoading();

  const [otp, setOtp] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [successNotice, setSuccessNotice] = React.useState<string | null>(null);
  const [isResending, setIsResending] = React.useState(false);

  const targetResendTimestamp = React.useRef(
    getResendTimestamp(params.resendAvailableAt, params.deliveryFailed === 'true'),
  );
  const [cooldownDuration, setCooldownDuration] = React.useState(() =>
    getSecondsUntil(targetResendTimestamp.current) || DEFAULT_RESEND_COOLDOWN_SECONDS,
  );
  const [cooldown, setCooldown] = React.useState(() =>
    getSecondsUntil(targetResendTimestamp.current),
  );
  const inputRef = React.useRef<TextInput | null>(null);

  const calculateRemainingSeconds = React.useCallback(() => {
    const remaining = getSecondsUntil(targetResendTimestamp.current);
    setCooldown(remaining);
    return remaining;
  }, []);

  const updateResendCooldown = React.useCallback((resendAvailableAt?: string) => {
    const targetTimestamp = getResendTimestamp(resendAvailableAt);
    targetResendTimestamp.current = targetTimestamp;
    const remaining = getSecondsUntil(targetTimestamp);
    const duration = remaining || DEFAULT_RESEND_COOLDOWN_SECONDS;
    setCooldownDuration(duration);
    setCooldown(remaining);
  }, []);

  // Recalculate from the server's absolute timestamp to avoid drift.
  React.useEffect(() => {
    const interval = setInterval(calculateRemainingSeconds, 1000);
    return () => clearInterval(interval);
  }, [calculateRemainingSeconds]);

  // Recalculate after backgrounding, when JS timers may have been paused.
  React.useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        calculateRemainingSeconds();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [calculateRemainingSeconds]);

  const handleVerify = async () => {
    const cleanOtp = otp.replace(/\D/g, '');
    if (cleanOtp.length !== OTP_LENGTH) {
      setError(`Vui lòng nhập đúng ${OTP_LENGTH} chữ số mã OTP`);
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
      const session = await verifyOtp({
        challengeId,
        email,
        phone,
        otp: cleanOtp,
      });
      const activeMode = useAuthStore.getState().activeMode;
      const destination = getDestinationByRoles(session.user.roles, activeMode);

      if (destination.type === 'ROUTE') {
        router.replace(destination.path as any);
      }
      else {
        router.replace(RouteNames.ROOT as any);
      }
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

      setError(err?.message || 'Xác thực OTP không thành công. Vui lòng thử lại.');
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending || isLoading) {
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

      updateResendCooldown(response?.data?.resendAvailableAt);
    }
    catch (err: any) {
      const code = err?.code;
      if (code === ERROR_CODES.RATE_LIMITED) {
        const retryAfterSeconds = Number(err?.details?.retryAfterSeconds);
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
          const resendAvailableAt = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
          updateResendCooldown(resendAvailableAt);
        }
        setError('Bạn đã gửi lại mã quá số lần cho phép. Vui lòng thử lại sau.');
      }
      else if (code === ERROR_CODES.OTP_DELIVERY_FAILED) {
        setIsDeliveryFailed(true);
        targetResendTimestamp.current = Date.now();
        setCooldown(0);
        setError('Không thể gửi mã OTP đến email của bạn. Vui lòng bấm "Gửi lại mã OTP" bên dưới.');
      }
      else {
        setError(err?.message || 'Không thể gửi mã OTP đến email của bạn. Vui lòng thử lại.');
      }
    }
    finally {
      setIsResending(false);
    }
  };

  const progress = cooldownDuration > 0 ? cooldown / cooldownDuration : 0;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);

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
      keyboardAware
      bottomOffset={70}
      className="bg-neutral-50 dark:bg-neutral-950"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <AppBar
        mode="stack"
        title="Xác thực OTP"
        onBack={handleBack}
        testID="otp-app-bar"
      />

      <View testID="auth-otp-screen" className="flex-1 justify-between px-6 py-4">
        <View>
          {/* Header */}
          <View className="mb-6 items-center">
            <View className="mb-3 size-16 items-center justify-center rounded-3xl bg-amber-100 shadow-xs dark:bg-amber-950/40">
              <LockIcon size={32} color="#F5A524" />
            </View>
            <Text className="text-center text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Nhập mã xác thực
            </Text>
            <Text className="mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Mã xác thực gồm 6 chữ số đã được gửi đến Gmail:
            </Text>
            <View className="mt-1.5 rounded-full border border-amber-200 bg-amber-50 px-3.5 py-1 dark:border-amber-900 dark:bg-amber-950/30">
              <Text className="text-center text-sm font-bold text-amber-900 dark:text-amber-200">
                {emailMasked || email || 'Gmail của bạn'}
              </Text>
            </View>
          </View>

          {/* Card */}
          <View className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            {isDeliveryFailed && (
              <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
                <Text className="text-xs font-medium text-amber-800 dark:text-amber-200">
                  Không thể gửi mã OTP đến email của bạn. Vui lòng bấm &quot;Gửi lại mã OTP&quot; bên dưới.
                </Text>
              </View>
            )}

            {error && (
              <View testID="otp-error-message" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
                <Text className="text-xs font-medium text-red-700 dark:text-red-300">
                  {error}
                </Text>
              </View>
            )}

            {successNotice && (
              <View className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/50">
                <Text className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {successNotice}
                </Text>
              </View>
            )}

            {/* 6 OTP discrete input boxes */}
            <Pressable
              onPress={() => inputRef.current?.focus()}
              className="my-3 flex-row justify-between"
            >
              {Array.from({ length: OTP_LENGTH }, (_, index) => `otp-${index}`).map((boxId, index) => {
                const char = otp[index] || '';
                const isFocused = index === Math.min(otp.length, OTP_LENGTH - 1);
                return (
                  <View
                    key={boxId}
                    testID={`otp-box-${index}`}
                    className={`h-14 w-10 items-center justify-center rounded-xl border-2 shadow-xs dark:bg-neutral-800 ${
                      isFocused
                        ? 'border-[#F5A524] bg-white'
                        : char
                          ? 'border-neutral-400 bg-white dark:border-neutral-600'
                          : 'border-neutral-200 bg-neutral-50 dark:border-neutral-700'
                    }`}
                  >
                    <Text className="text-2xl font-bold text-neutral-900 dark:text-white">
                      {char}
                    </Text>
                  </View>
                );
              })}
            </Pressable>

            {/* Hidden Input capturing typing and paste */}
            <TextInput
              ref={inputRef}
              testID="otp-input"
              keyboardType="number-pad"
              maxLength={OTP_LENGTH}
              value={otp}
              onChangeText={(text) => {
                const clean = text.replace(/\D/g, '').slice(0, OTP_LENGTH);
                setOtp(clean);
                if (error)
                  setError(null);
              }}
              style={{ position: 'absolute', opacity: 0.01, height: 1, width: 1 }}
            />

            {/* Server-synchronized resend countdown */}
            <View className="my-4 items-center justify-center">
              <View testID="otp-countdown-circle" className="relative size-16 items-center justify-center">
                <Svg width={60} height={60} viewBox="0 0 60 60">
                  {/* Background track */}
                  <Circle
                    cx="30"
                    cy="30"
                    r={CIRCLE_RADIUS}
                    stroke="#E5E7EB"
                    strokeWidth={4}
                    fill="none"
                  />
                  {/* Progress arc */}
                  <Circle
                    cx="30"
                    cy="30"
                    r={CIRCLE_RADIUS}
                    stroke="#F5A524"
                    strokeWidth={4}
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    fill="none"
                    transform="rotate(-90 30 30)"
                  />
                </Svg>
                <View className="absolute inset-0 items-center justify-center">
                  <Text testID="otp-countdown-text" className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                    {cooldown}
                    s
                  </Text>
                </View>
              </View>

              <Text className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                {cooldown > 0
                  ? `Có thể gửi lại mã sau ${cooldown} giây`
                  : 'Bạn chưa nhận được mã?'}
              </Text>
            </View>

            {/* Action Buttons */}
            <View className="mt-2 space-y-3">
              <Button
                testID="otp-submit-btn"
                label="Tiếp tục →"
                variant="default"
                loading={isLoading}
                disabled={isLoading || isResending}
                className={`h-12 rounded-2xl ${
                  otp.length >= OTP_LENGTH ? 'bg-[#F5A524]' : 'bg-neutral-300 dark:bg-neutral-800'
                }`}
                onPress={handleVerify}
              />

              <Button
                testID="otp-resend-btn"
                label={cooldown > 0 ? `Gửi lại mã sau (${cooldown}s)` : 'Gửi lại mã OTP'}
                variant="outline"
                loading={isResending}
                disabled={cooldown > 0 || isResending || isLoading}
                className="h-12 rounded-2xl border-neutral-300 dark:border-neutral-700"
                onPress={handleResend}
              />
            </View>
          </View>
        </View>

        {/* Back Link */}
        <View className="mt-4 items-center">
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
