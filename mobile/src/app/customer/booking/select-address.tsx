import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { PlaceholderScreen } from '@/components/placeholder-screen';
import { RouteNames } from '@/constants/route-names';

export default function CustomerBookingSelectAddressRoute() {
  const router = useRouter();

  return (
    <PlaceholderScreen
      pageName="Chọn địa chỉ"
      title="Chọn địa chỉ"
      subtitle="Bước 2: Xác nhận vị trí làm việc"
      testID="booking-select-address-screen"
    >
      <View className="mt-4 w-full max-w-xs gap-3">
        <Button
          testID="select-address-confirm-btn"
          label="Xác nhận địa chỉ (Confirm) →"
          variant="default"
          className="h-10 rounded-xl bg-[#F5A524] px-6"
          textClassName="text-xs font-bold text-neutral-900"
          onPress={() => router.push(RouteNames.CUSTOMER_BOOKING_SELECT_TIME as any)}
        />
        <Button
          testID="select-address-search-btn"
          label="Tìm kiếm địa chỉ khác"
          variant="outline"
          className="h-10 rounded-xl px-6"
          textClassName="text-xs font-semibold text-neutral-700"
          onPress={() => router.push(RouteNames.CUSTOMER_SEARCH_ADDRESS as any)}
        />
      </View>
    </PlaceholderScreen>
  );
}
