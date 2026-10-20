/* eslint-disable max-lines-per-function */
import { useFocusEffect, useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { BrandLogo } from '@/components/brand-logo';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { CloseIcon } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { getDestinationByRoles } from '@/lib/auth/navigation';
import { ERROR_CODES } from '@/services/api/api-error';
import { useAuthStore } from '@/stores/use-auth-store';
import { usePasswordResetStore } from '../use-password-reset-store';

export function LoginScreen() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const params = useLocalSearchParams<{ phone?: string; verified?: string; reset?: string }>();
  const login = useAuthStore.use.login();
  const isLoading = useAuthStore.use.isLoading();
  const isAuthenticated = useAuthStore.use.isAuthenticated();
  const user = useAuthStore.use.user();
  const clearError = useAuthStore.use.clearError();
  const clearPasswordReset = usePasswordResetStore(state => state.clear);

  const [phone, setPhone] = React.useState(params?.phone || '');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);

  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    params?.verified === 'true'
      ? 'Xác thực tài khoản thành công! Vui lòng tiếp tục.'
      : params?.reset === 'true'
        ? 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.'
        : null,
  );
  const [localErrors, setLocalErrors] = React.useState<{
    phone?: string;
    password?: string;
  }>({});

  React.useEffect(() => {
    if (params?.reset === 'true') {
      setSuccessMessage('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
    }
    else if (params?.verified === 'true') {
      setSuccessMessage('Xác thực tài khoản thành công! Vui lòng tiếp tục.');
    }
  }, [params?.reset, params?.verified]);

  // Auth guard: already logged in users cannot re-enter login screen via back navigation
  React.useEffect(() => {
    if (!rootNavigationState?.key) {
      return;
    }

    if (isAuthenticated && user) {
      const activeMode = useAuthStore.getState().activeMode;
      const dest = getDestinationByRoles(user.roles, activeMode);
      if (dest.type === 'ROUTE') {
        try {
          router.replace(dest.path as any);
        }
        catch {
          // Ignore if navigator is transitionary
        }
      }
    }
  }, [rootNavigationState?.key, isAuthenticated, user, router]);

  React.useEffect(() => {
    clearError();
  }, [clearError]);

  useFocusEffect(
    React.useCallback(() => {
      clearPasswordReset();
    }, [clearPasswordReset]),
  );

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

  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanPhone = phone.trim();

    try {
      const session = await login({
        phone: cleanPhone,
        password,
      });

      const currentMode = useAuthStore.getState().activeMode;
      const dest = getDestinationByRoles(session.user.roles, currentMode);
      if (dest.type === 'ROUTE') {
        router.replace(dest.path as any);
      }
      else {
        router.replace(RouteNames.ROOT);
      }
    }
    catch (err: any) {
      const code = err?.code;

      if (code === ERROR_CODES.INVALID_CREDENTIALS) {
        setErrorMessage('Số điện thoại hoặc mật khẩu không chính xác.');
      }
      else if (code === ERROR_CODES.ACCOUNT_BLOCKED) {
        setErrorMessage('Tài khoản đã bị tạm khóa hoặc ngừng hoạt động. Vui lòng liên hệ bộ phận hỗ trợ.');
      }
      else if (code === ERROR_CODES.RATE_LIMITED) {
        const retryAfter = err?.details?.retryAfterSeconds;
        setErrorMessage(
          retryAfter
            ? `Bạn đã thử đăng nhập sai quá số lần cho phép. Vui lòng thử lại sau ${Math.ceil(retryAfter / 60)} phút.`
            : 'Quá nhiều yêu cầu đăng nhập. Vui lòng thử lại sau giây lát.',
        );
      }
      else {
        setErrorMessage(err?.message || 'Đăng nhập không thành công. Vui lòng thử lại.');
      }
    }
  };

  const handleBack = React.useCallback(() => {
    if (router.canGoBack ? router.canGoBack() : false) {
      router.back();
    }
    else {
      const guestRole = useAuthStore.getState().guestRole;
      if (guestRole === 'Worker') {
        router.replace(RouteNames.WORKER_HOME as any);
      }
      else if (guestRole === 'Customer') {
        router.replace(RouteNames.CUSTOMER_HOME as any);
      }
      else {
        router.replace(RouteNames.WELCOME as any);
      }
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
        title="Đăng nhập"
        onBack={handleBack}
        testID="login-app-bar"
      />

      <View testID="auth-login-screen" className="flex-1 justify-between p-6">
        <View>
          {/* Header / Brand */}
          <View className="mb-6 items-center">
            <View className="mb-3 rounded-3xl bg-amber-50 p-2 dark:bg-neutral-900">
              <BrandLogo size={84} />
            </View>
            <Text className="text-center text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Chào mừng bạn đến với HandyGo
            </Text>
            <Text className="mt-2 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Nhập số điện thoại và mật khẩu để tiếp tục
            </Text>
          </View>

          {/* Form Card */}
          <View className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            {successMessage && (
              <View testID="auth-login-success" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/50">
                <Text className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                  {successMessage}
                </Text>
              </View>
            )}

            {errorMessage && (
              <View testID="auth-login-error" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
                <Text className="text-xs font-medium text-red-700 dark:text-red-300">
                  {errorMessage}
                </Text>
              </View>
            )}

            {/* Phone Number Field */}
            <View className="mb-3">
              <Text className="mb-1.5 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
                Số điện thoại
              </Text>
              <View className="flex-row items-center rounded-2xl border border-neutral-300 bg-neutral-100 px-4 py-1 dark:border-neutral-700 dark:bg-neutral-800">
                {/* Phone Input */}
                <TextInput
                  testID="login-phone-input"
                  placeholder="0912 345 678"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={(text) => {
                    setPhone(text);
                    if (localErrors.phone) {
                      setLocalErrors(prev => ({ ...prev, phone: undefined }));
                    }
                    if (errorMessage) {
                      setErrorMessage(null);
                    }
                  }}
                  className="flex-1 py-2.5 text-base font-semibold text-neutral-900 dark:text-white"
                />

                {/* Clear Button ✕ */}
                {phone.length > 0 && (
                  <Pressable
                    testID="login-clear-phone-btn"
                    accessibilityRole="button"
                    accessibilityLabel="Xóa số điện thoại"
                    onPress={() => {
                      setPhone('');
                      if (localErrors.phone) {
                        setLocalErrors(prev => ({ ...prev, phone: undefined }));
                      }
                    }}
                    className="size-7 items-center justify-center rounded-full bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-700 dark:active:bg-neutral-600"
                  >
                    <CloseIcon size={14} color="#6B7280" />
                  </Pressable>
                )}
              </View>

              {localErrors.phone && (
                <Text testID="login-phone-error" className="mt-1 text-xs font-medium text-red-500">
                  {localErrors.phone}
                </Text>
              )}
            </View>

            {/* Password Section */}
            <View className="mt-2">
              <Input
                testID="login-password-input"
                label="Mật khẩu"
                placeholder="Nhập mật khẩu"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (localErrors.password) {
                    setLocalErrors(prev => ({ ...prev, password: undefined }));
                  }
                  if (errorMessage) {
                    setErrorMessage(null);
                  }
                }}
                error={localErrors.password}
                rightAccessory={(
                  <Pressable
                    testID="login-toggle-password-btn"
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="py-1"
                  >
                    <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {showPassword ? 'Ẩn' : 'Hiện'}
                    </Text>
                  </Pressable>
                )}
              />

              <View className="mt-1 items-end">
                <Pressable
                  testID="login-forgot-password-btn"
                  accessibilityRole="button"
                  onPress={() => router.push(RouteNames.AUTH_FORGOT_PASSWORD as any)}
                  className="py-1"
                >
                  <Text className="text-xs font-semibold text-primary-700 dark:text-primary-300">
                    Quên mật khẩu?
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Submit Button */}
            <View className="mt-4">
              <Button
                testID="login-submit-button"
                label="Đăng nhập"
                variant="default"
                loading={isLoading}
                disabled={isLoading}
                className="h-12 rounded-2xl bg-[#F5A524]"
                onPress={handleSubmit}
              />
            </View>
          </View>
        </View>

        {/* Footer Actions */}
        <View className="mt-6 items-center">
          <View className="flex-row items-center justify-center">
            <Text className="text-sm text-neutral-600 dark:text-neutral-400">
              Chưa có tài khoản?
              {' '}
            </Text>
            <Pressable
              testID="login-to-register-btn"
              onPress={() => router.push(RouteNames.AUTH_REGISTER as any)}
            >
              <Text className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                Đăng ký ngay
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}
