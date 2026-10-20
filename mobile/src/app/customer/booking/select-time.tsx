import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { RouteNames } from '@/constants/route-names';

export default function CustomerBookingSelectTimeRoute() {
  const router = useRouter();

  return (
    <PlaceholderScreen
      pageName="Chọn thời gian"
      title="Chọn thời gian"
      subtitle="Bước 3: Chọn lịch hẹn mong muốn"
      testID="booking-select-time-screen"
    >
      <View className="mt-4">
        <Button
          testID="select-time-confirm-btn"
          label="Confirm →"
          variant="default"
          className="h-10 rounded-xl bg-[#F5A524] px-6"
          textClassName="text-xs font-bold text-neutral-900"
          onPress={() => router.push(RouteNames.CUSTOMER_BOOKING_SUMMARY as any)}
        />
      </View>
    </PlaceholderScreen>
  );
}
