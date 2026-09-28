/* eslint-disable max-lines-per-function */
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { getDestinationByRoles } from '@/lib/auth/navigation';
import { ERROR_CODES } from '@/services/api/api-error';
import { useAuthStore } from '@/stores/use-auth-store';

export function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; verified?: string }>();
  const login = useAuthStore.use.login();
  const isLoading = useAuthStore.use.isLoading();
  const isAuthenticated = useAuthStore.use.isAuthenticated();
  const user = useAuthStore.use.user();
  const clearError = useAuthStore.use.clearError();

  const [phone, setPhone] = React.useState(params?.phone || '');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    params?.verified === 'true'
      ? 'Xác thực tài khoản thành công! Vui lòng nhập mật khẩu để đăng nhập.'
      : null,
  );
  const [localErrors, setLocalErrors] = React.useState<{
    phone?: string;
    password?: string;
  }>({});

  React.useEffect(() => {
    if (params?.phone) {
      setPhone(params.phone);
    }
    if (params?.verified === 'true') {
      setSuccessMessage('Xác thực tài khoản thành công! Vui lòng nhập mật khẩu để đăng nhập.');
    }
  }, [params?.phone, params?.verified]);

  // Auth guard: already logged in users cannot re-enter login screen via back navigation
  React.useEffect(() => {
    if (isAuthenticated && user) {
      const dest = getDestinationByRoles(user.roles);
      if (dest.type === 'ROUTE') {
        router.replace(dest.path as any);
      }
    }
  }, [isAuthenticated, user, router]);

  React.useEffect(() => {
    clearError();
  }, [clearError]);

  const validate = (): boolean => {
    const errors: { phone?: string; password?: string } = {};

    const cleanPhone = phone.replace(/[\s\-.()]/g, '');
    const vnMobileRegex = /^(\+?84|0)([35789])\d{8}$/;
    if (!cleanPhone) {
      errors.phone = 'Vui lòng nhập số điện thoại';
    }
    else if (!vnMobileRegex.test(cleanPhone)) {
      errors.phone = 'Số điện thoại không đúng định dạng Việt Nam';
    }

    if (!password) {
      errors.password = 'Vui lòng nhập mật khẩu';
    }
    else if (password.length < 8) {
      errors.password = 'Mật khẩu phải có tối thiểu 8 ký tự';
    }
    else if (new TextEncoder().encode(password).length > 72) {
      errors.password = 'Mật khẩu không được vượt quá 72 byte';
    }

    setLocalErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const session = await login({
        phone: phone.trim(),
        password, // DO NOT TRIM PASSWORD
      });

      const dest = getDestinationByRoles(session.user.roles);
      if (dest.type === 'ROUTE') {
        router.replace(dest.path as any);
      }
      else {
        router.replace(RouteNames.ROOT);
      }
    }
    catch (err: any) {
      const code = err?.code;

      if (
        code === ERROR_CODES.ACCOUNT_PENDING
        || (err?.statusCode === 403 && (err?.message?.includes('xác thực') || err?.message?.includes('kích hoạt') || err?.message?.includes('chưa')))
      ) {
        // Pending account: guide user to continue OTP verification
        router.push({
          pathname: RouteNames.AUTH_OTP,
          params: {
            phone: phone.trim(),
            ...(err?.details?.verification?.emailMasked ? { emailMasked: err.details.verification.emailMasked } : {}),
            ...(err?.details?.verification?.resendAvailableAt ? { resendAvailableAt: err.details.verification.resendAvailableAt } : {}),
          },
        } as any);
        return;
      }

      if (code === ERROR_CODES.INVALID_CREDENTIALS) {
        setErrorMessage('Số điện thoại hoặc mật khẩu không chính xác.');
        return;
      }

      if (code === ERROR_CODES.ACCOUNT_BLOCKED) {
        setErrorMessage('Tài khoản đã bị tạm khóa hoặc ngừng hoạt động. Vui lòng liên hệ bộ phận hỗ trợ.');
        return;
      }

      if (code === ERROR_CODES.RATE_LIMITED) {
        const retryAfter = err?.details?.retryAfterSeconds;
        setErrorMessage(
          retryAfter
            ? `Bạn đã thử đăng nhập sai quá số lần cho phép. Vui lòng thử lại sau ${Math.ceil(retryAfter / 60)} phút.`
            : 'Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau giây lát.',
        );
        return;
      }

      setErrorMessage(err?.message || 'Đăng nhập không thành công. Vui lòng thử lại.');
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="auth-login-screen" className="flex-1 justify-center px-6 py-8">
        {/* Header / Brand */}
        <View className="mb-8 items-center">
          <View className="mb-4">
            <BrandLogo />
          </View>
          <Text className="text-center text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Chào mừng trở lại!
          </Text>
          <Text className="mt-1 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Đăng nhập tài khoản HANDY GO của bạn
          </Text>
        </View>

        {/* Form Card */}
        <View className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {successMessage
            ? (
                <View testID="auth-login-success" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/50">
                  <Text className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    {successMessage}
                  </Text>
                </View>
              )
            : null}

          {errorMessage
            ? (
                <View testID="auth-login-error" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
                  <Text className="text-sm font-medium text-red-700 dark:text-red-300">
                    {errorMessage}
                  </Text>
                </View>
              )
            : null}

          <Input
            testID="login-phone-input"
            label="Số điện thoại"
            placeholder="Ví dụ: 0912345678"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(text) => {
              setPhone(text);
              if (localErrors.phone)
                setLocalErrors(prev => ({ ...prev, phone: undefined }));
              if (errorMessage)
                setErrorMessage(null);
            }}
            error={localErrors.phone}
          />

          <View className="mt-3">
            <Input
              testID="login-password-input"
              label="Mật khẩu"
              placeholder="Nhập mật khẩu"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (localErrors.password)
                  setLocalErrors(prev => ({ ...prev, password: undefined }));
                if (errorMessage)
                  setErrorMessage(null);
              }}
              error={localErrors.password}
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              className="mt-1 self-end py-1"
            >
              <Text className="text-xs text-blue-600 dark:text-blue-400">
                {showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              </Text>
            </Pressable>
          </View>

          <View className="mt-6">
            <Button
              testID="login-submit-button"
              label="Đăng nhập"
              variant="default"
              loading={isLoading}
              disabled={isLoading}
              onPress={handleLogin}
            />
          </View>
        </View>

        {/* Footer Actions */}
        <View className="mt-8 items-center space-y-3">
          <View className="flex-row items-center justify-center">
            <Text className="text-sm text-neutral-600 dark:text-neutral-400">
              Chưa có tài khoản?
              {' '}
            </Text>
            <Pressable
              testID="login-to-register-btn"
              onPress={() => router.push(RouteNames.AUTH_REGISTER as any)}
            >
              <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                Đăng ký ngay
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}
