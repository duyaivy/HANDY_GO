import { Stack } from 'expo-router';
import * as React from 'react';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="login"
        options={{
          title: 'Đăng nhập',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="register"
        options={{
          title: 'Đăng ký tài khoản',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="otp"
        options={{
          title: 'Xác thực OTP',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="create-pin"
        options={{
          title: 'Tạo mã PIN',
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="complete-profile"
        options={{
          title: 'Hoàn tất hồ sơ',
          headerShown: false,
        }}
      />
      <Stack.Screen name="forgot-password" options={{ title: 'Quên mật khẩu', headerShown: false }} />
      <Stack.Screen name="verify-reset-otp" options={{ title: 'Xác minh OTP', headerShown: false }} />
      <Stack.Screen name="reset-password" options={{ title: 'Mật khẩu mới', headerShown: false }} />
      <Stack.Screen name="change-password" options={{ title: 'Đổi mật khẩu', headerShown: false }} />
    </Stack>
  );
}
