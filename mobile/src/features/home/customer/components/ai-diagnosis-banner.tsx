import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '@/components/ui';
import { RouteNames } from '@/constants/route-names';

export const AiDiagnosisBanner = React.memo(() => {
  const router = useRouter();

  const handlePress = React.useCallback(() => {
    router.push(RouteNames.CUSTOMER_AI_DIAGNOSIS as any);
  }, [router]);

  return (
    <Pressable
      className="flex-row items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50/80 p-3 active:opacity-85"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="AI Chẩn đoán sự cố"
    >
      <View className="size-11 shrink-0 items-center justify-center rounded-xl bg-primary-600">
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Path
            d="M12 2C8.13 2 5 5.13 5 9C5 11.38 6.19 13.47 8 14.74V17C8 17.55 8.45 18 9 18H15C15.55 18 16 17.55 16 17V14.74C17.81 13.47 19 11.38 19 9C19 5.13 15.87 2 12 2Z"
            stroke="#FFFFFF"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path d="M9 21H15" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
          <Circle cx="12" cy="9" r="2.5" fill="#FFFFFF" />
        </Svg>
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-1.5">
          <Text className="text-sm font-bold text-neutral-900">
            AI Chẩn đoán sự cố
          </Text>
          <View className="rounded-full bg-primary-600 px-1.5 py-0.5">
            <Text className="text-[9px] font-extrabold text-white">MIỄN PHÍ</Text>
          </View>
        </View>
        <Text className="text-[11px] text-neutral-500" numberOfLines={1}>
          Phân tích tiếng ồn, rò rỉ & ước tính chi phí...
        </Text>
      </View>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d="M9 18L15 12L9 6" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
});

AiDiagnosisBanner.displayName = 'AiDiagnosisBanner';
