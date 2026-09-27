/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { BrandLogo } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { ERROR_CODES } from '@/services/api/api-error';
import { AuthApi } from '@/services/auth/auth-api';

export function RegisterScreen() {
  const router = useRouter();

  const [fullName, setFullName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const [errors, setErrors] = React.useState<{
    fullName?: string;
    phone?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const validate = (): boolean => {
    const errs: {
      fullName?: string;
      phone?: string;
      email?: string;
      password?: string;
      confirmPassword?: string;
    } = {};

    const trimmedName = fullName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      errs.fullName = 'Họ và tên phải có tối thiểu 2 ký tự';
    }
    else if (trimmedName.length > 100) {
      errs.fullName = 'Họ và tên không được vượt quá 100 ký tự';
    }

    const cleanPhone = phone.replace(/[\s\-.()]/g, '');
    const vnMobileRegex = /^(\+?84|0)([35789])\d{8}$/;
    if (!cleanPhone) {
      errs.phone = 'Vui lòng nhập số điện thoại';
    }
    else if (!vnMobileRegex.test(cleanPhone)) {
      errs.phone = 'Số điện thoại không đúng định dạng di động Việt Nam';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      errs.email = 'Vui lòng nhập địa chỉ email';
    }
    else if (!emailRegex.test(trimmedEmail)) {
      errs.email = 'Địa chỉ email không hợp lệ';
    }

    if (!password) {
      errs.password = 'Vui lòng nhập mật khẩu';
    }
    else if (password.length < 8) {
      errs.password = 'Mật khẩu phải có tối thiểu 8 ký tự';
    }
    else if (new TextEncoder().encode(password).length > 72) {
      errs.password = 'Mật khẩu không được vượt quá 72 byte';
    }

    // UI-only validation: Confirm password check
    if (!confirmPassword) {
      errs.confirmPassword = 'Vui lòng xác nhận mật khẩu';
    }
    else if (confirmPassword !== password) {
      errs.confirmPassword = 'Mật khẩu xác nhận không trùng khớp';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) {
      return;
    }

    setIsLoading(true);
    setServerError(null);

    try {
      const response = await AuthApi.register({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim().toLowerCase(),
        password, // DO NOT TRIM PASSWORD
      });

      // Navigate to OTP verification with user details
      router.push({
        pathname: RouteNames.AUTH_OTP,
        params: {
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          emailMasked: response?.data?.emailMasked,
          resendAvailableAt: response?.data?.resendAvailableAt,
        },
      } as any);
    }
    catch (err: any) {
      const code = err?.code;

      if (code === ERROR_CODES.PHONE_ALREADY_EXISTS) {
        setErrors(prev => ({ ...prev, phone: 'Số điện thoại đã được đăng ký. Vui lòng đăng nhập.' }));
        return;
      }

      if (code === ERROR_CODES.EMAIL_ALREADY_EXISTS) {
        setErrors(prev => ({ ...prev, email: 'Địa chỉ email đã được sử dụng. Vui lòng đăng nhập.' }));
        return;
      }

      if (code === ERROR_CODES.VALIDATION_ERROR && err?.fieldErrors) {
        setErrors({
          fullName: err.fieldErrors.fullName?.[0],
          phone: err.fieldErrors.phone?.[0],
          email: err.fieldErrors.email?.[0],
          password: err.fieldErrors.password?.[0],
        });
        return;
      }

      if (code === ERROR_CODES.OTP_DELIVERY_FAILED) {
        // SMTP delivery failed, but pending account is created.
        // Guide user to OTP screen to resend code without re-registering.
        router.push({
          pathname: RouteNames.AUTH_OTP,
          params: {
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            deliveryFailed: 'true',
            resendAvailableAt: err?.details?.verification?.resendAvailableAt,
          },
        } as any);
        return;
      }

      if (code === ERROR_CODES.RATE_LIMITED) {
        setServerError('Bạn đã gửi quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau 1 giờ.');
        return;
      }

      setServerError(err?.message || 'Đăng ký không thành công. Vui lòng kiểm tra lại thông tin.');
    }
    finally {
      setIsLoading(false);
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <View testID="auth-register-screen" className="flex-1 justify-center px-6 py-8">
        {/* Header */}
        <View className="mb-8 items-center">
          <View className="mb-4">
            <BrandLogo />
          </View>
          <Text className="text-center text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Tạo tài khoản mới
          </Text>
          <Text className="mt-1 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Đăng ký tài khoản Khách hàng trên HANDY GO
          </Text>
        </View>

        {/* Form Card */}
        <View className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          {serverError
            ? (
                <View testID="auth-register-error" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/50">
                  <Text className="text-sm font-medium text-red-700 dark:text-red-300">
                    {serverError}
                  </Text>
                </View>
              )
            : null}

          <Input
            testID="register-fullname-input"
            label="Họ và tên"
            placeholder="Ví dụ: Nguyễn Văn A"
            value={fullName}
            onChangeText={(text) => {
              setFullName(text);
              if (errors.fullName)
                setErrors(prev => ({ ...prev, fullName: undefined }));
              if (serverError)
                setServerError(null);
            }}
            error={errors.fullName}
          />

          <View className="mt-3">
            <Input
              testID="register-phone-input"
              label="Số điện thoại"
              placeholder="Ví dụ: 0912345678"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
                if (errors.phone)
                  setErrors(prev => ({ ...prev, phone: undefined }));
                if (serverError)
                  setServerError(null);
              }}
              error={errors.phone}
            />
          </View>

          <View className="mt-3">
            <Input
              testID="register-email-input"
              label="Địa chỉ Email"
              placeholder="example@gmail.com"
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (errors.email)
                  setErrors(prev => ({ ...prev, email: undefined }));
                if (serverError)
                  setServerError(null);
              }}
              error={errors.email}
            />
          </View>

          <View className="mt-3">
            <Input
              testID="register-password-input"
              label="Mật khẩu"
              placeholder="Tối thiểu 8 ký tự"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (errors.password)
                  setErrors(prev => ({ ...prev, password: undefined }));
                if (serverError)
                  setServerError(null);
              }}
              error={errors.password}
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

          <View className="mt-3">
            <Input
              testID="register-confirm-password-input"
              label="Xác nhận mật khẩu"
              placeholder="Nhập lại mật khẩu"
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                if (errors.confirmPassword)
                  setErrors(prev => ({ ...prev, confirmPassword: undefined }));
                if (serverError)
                  setServerError(null);
              }}
              error={errors.confirmPassword}
            />
            <Pressable
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              className="mt-1 self-end py-1"
            >
              <Text className="text-xs text-blue-600 dark:text-blue-400">
                {showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              </Text>
            </Pressable>
          </View>

          <View className="mt-6">
            <Button
              testID="register-submit-button"
              label="Đăng ký tài khoản"
              variant="default"
              loading={isLoading}
              disabled={isLoading}
              onPress={handleRegister}
            />
          </View>
        </View>

        {/* Footer Actions */}
        <View className="mt-8 items-center space-y-3">
          <View className="flex-row items-center justify-center">
            <Text className="text-sm text-neutral-600 dark:text-neutral-400">
              Đã có tài khoản?
              {' '}
            </Text>
            <Pressable
              testID="register-to-login-btn"
              onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
            >
              <Text className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                Đăng nhập
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Screen>
  );
}
