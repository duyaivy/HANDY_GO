import { Stack } from 'expo-router';
import * as React from 'react';

export default function WorkerLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
