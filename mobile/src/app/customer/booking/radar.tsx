import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { RouteNames } from '@/constants/route-names';

export default function CustomerBookingRadarRoute() {
  const router = useRouter();

  return (
    <PlaceholderScreen
      pageName="Tìm thợ radar"
      title="Tìm thợ radar"
      subtitle="Bước 5: Tìm kiếm thợ xung quanh"
      testID="booking-radar-screen"
    >
      <View className="mt-4">
        <Button
          testID="radar-worker-profile-btn"
          label="Worker profile →"
          variant="default"
          className="h-10 rounded-xl bg-[#F5A524] px-6"
          textClassName="text-xs font-bold text-neutral-900"
          onPress={() => router.push(RouteNames.CUSTOMER_WORKER_DETAIL('th-01') as any)}
        />
      </View>
    </PlaceholderScreen>
  );
}
