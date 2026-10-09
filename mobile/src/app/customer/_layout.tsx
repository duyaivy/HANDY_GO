import { Stack } from 'expo-router';
import * as React from 'react';
import { RoleGuard } from '@/lib/auth/role-guard';

export default function CustomerLayout() {
  return (
    <RoleGuard allowedRoles={['Customer']}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile/detail" options={{ headerShown: false }} />
        <Stack.Screen
          name="orders/[id]"
          options={{
            title: 'Chi tiết đơn hàng',
            headerShown: true,
            headerBackTitle: 'Quay lại',
          }}
        />
      </Stack>
    </RoleGuard>
  );
}
