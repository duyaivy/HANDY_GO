import { Stack } from 'expo-router';
import * as React from 'react';
import { RoleGuard } from '@/lib/auth/role-guard';

export default function WorkerLayout() {
  return (
    <>
      <RoleGuard allowedRoles={['Worker']} allowGuest />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="jobs/[id]" options={{ headerShown: false }} />
        <Stack.Screen
          name="jobs/[id]/complete"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="wallet/deposit"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="wallet/withdraw"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="application/status"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="application/register"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="application/analysis"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="application/complete-modal"
          options={{ headerShown: false, presentation: 'transparentModal' }}
        />
        <Stack.Screen name="balance" options={{ headerShown: false }} />
        <Stack.Screen name="skills" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
