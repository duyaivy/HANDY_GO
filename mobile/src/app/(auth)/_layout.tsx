import { Stack } from 'expo-router';
import * as React from 'react';

export default function AuthLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="login"
        options={{
          title: 'Đăng nhập',
          headerShown: true,
        }}
      />
    </Stack>
  );
}
