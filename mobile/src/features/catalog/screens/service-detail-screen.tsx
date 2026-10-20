import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { RouteNames } from '@/constants/route-names';

export type ServiceDetailScreenProps = {
  serviceId?: string;
};

export function ServiceDetailScreen({ serviceId: propServiceId }: ServiceDetailScreenProps = {}) {
  const router = useRouter();
  const searchParams = typeof useLocalSearchParams === 'function' ? useLocalSearchParams<{ id?: string }>() : {};
  const serviceId = propServiceId || searchParams?.id || 'srv-01';

  return (
    <PlaceholderScreen
      pageName="Chi tiết dịch vụ"
      title="Chi tiết dịch vụ"
      subtitle={`Mã dịch vụ: #${serviceId}`}
      testID="customer-service-detail-screen"
    >
      <View className="mt-4">
        <Button
          testID="service-book-now-btn"
          label="Book now →"
          variant="default"
          className="h-10 rounded-xl bg-[#F5A524] px-6"
          textClassName="text-xs font-bold text-neutral-900"
          onPress={() =>
            router.push({
              pathname: RouteNames.CUSTOMER_BOOKING,
              params: { serviceId },
            } as any)}
        />
      </View>
    </PlaceholderScreen>
  );
}
