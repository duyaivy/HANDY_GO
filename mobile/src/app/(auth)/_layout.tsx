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
    </Stack>
  );
}
