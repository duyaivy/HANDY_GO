import { Stack } from 'expo-router';
import * as React from 'react';

export default function CustomerLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="orders/[id]"
        options={{
          title: 'Chi tiết đơn hàng',
          headerShown: true,
          headerBackTitle: 'Quay lại',
        }}
      />
    </Stack>
  );
}
