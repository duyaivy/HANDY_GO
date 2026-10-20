import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { RouteNames } from '@/constants/route-names';

export default function CustomerBookingSummaryRoute() {
  const router = useRouter();

  return (
    <PlaceholderScreen
      pageName="Tóm tắt đơn đặt việc"
      title="Tóm tắt đơn đặt việc"
      subtitle="Bước 4: Xác nhận thông tin đơn"
      testID="booking-summary-screen"
    >
      <View className="mt-4">
        <Button
          testID="booking-start-finding-btn"
          label="Start finding a worker →"
          variant="default"
          className="h-10 rounded-xl bg-[#F5A524] px-6"
          textClassName="text-xs font-bold text-neutral-900"
          onPress={() => router.push(RouteNames.CUSTOMER_BOOKING_RADAR as any)}
        />
      </View>
    </PlaceholderScreen>
  );
}
