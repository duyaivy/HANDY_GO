import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';

export type CustomerBookingScreenProps = {
  serviceId?: string;
};

export function CustomerBookingScreen({ serviceId: propServiceId }: CustomerBookingScreenProps = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ serviceId?: string }>();
  const serviceId = propServiceId ?? searchParams?.serviceId;

  return (
    <PlaceholderScreen
      pageName="Mô tả sự cố"
      title="Mô tả sự cố"
      subtitle={serviceId ? `Mã dịch vụ: ${serviceId}` : 'Đặt lịch thợ'}
      icon="📅"
      testID="customer-booking-screen"
    >
      <View className="mt-4 items-center gap-3">
        <Text className="text-xs text-neutral-400">Đặt lịch thợ</Text>
        <Button
          testID="booking-next-btn"
          label="Next →"
          variant="default"
          className="h-10 rounded-xl bg-[#F5A524] px-6"
          textClassName="text-xs font-bold text-neutral-900"
          onPress={() => router.push(RouteNames.CUSTOMER_BOOKING_SELECT_ADDRESS as any)}
        />
      </View>
    </PlaceholderScreen>
  );
}
