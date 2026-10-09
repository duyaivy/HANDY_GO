import { Stack } from 'expo-router';
import * as React from 'react';
import { RoleGuard } from '@/lib/auth/role-guard';

export default function WorkerLayout() {
  return (
    <RoleGuard allowedRoles={['Worker']}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="profile/detail" options={{ headerShown: false }} />
      </Stack>
    </RoleGuard>
  );
}
