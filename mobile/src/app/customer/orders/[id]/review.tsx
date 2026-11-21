import { Stack, useLocalSearchParams } from 'expo-router';
import * as React from 'react';
import { CustomerOrderReviewScreen } from '@/features/orders/customer';

export default function OrderReviewRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <CustomerOrderReviewScreen orderId={id} />
    </>
  );
}

