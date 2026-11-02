import * as React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { Image, Text } from '@/components/ui';

const PROMO_IMAGE_URI = 'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=260&auto=format&fit=crop&q=80';

export const PromoBanner = React.memo(() => {
  const handlePress = React.useCallback(() => {
    showMessage({
      message: 'Sự kiện Đua Top',
      description: 'Chương trình sắp diễn ra trong tháng này!',
      type: 'info',
    });
  }, []);

  return (
    <View className="relative flex-row items-center overflow-hidden rounded-[22px] bg-orange-100/70 p-4">
      <View className="flex-1 gap-1.5 pr-2">
        <View className="self-start rounded-sm bg-primary-600 px-2 py-0.5">
          <Text className="text-[9px] font-extrabold text-white uppercase">
            🏆 SỰ KIỆN THÁNG
          </Text>
        </View>
        <Text className="text-[17px] leading-[22px] font-extrabold text-neutral-900">
          {'Đua Top Ngay,\n'}
          <Text className="text-orange-600">Rinh Honda Wave</Text>
        </Text>
        <Text className="text-[11px]/4 text-neutral-500" numberOfLines={2}>
          Cơ hội sở hữu xe máy Honda Wave cùng 500+ giải thưởng giá trị.
        </Text>
        <TouchableOpacity
          className="mt-1 self-start rounded-full bg-primary-600 px-4 py-2 active:opacity-85"
          onPress={handlePress}
          activeOpacity={0.85}
        >
          <Text className="text-xs font-bold text-white">
            Tham gia ngay →
          </Text>
        </TouchableOpacity>
      </View>

      {/* Right Honda Wave Illustration Card */}
      <View className="h-20 w-[100px] overflow-hidden rounded-2xl border border-orange-200 bg-white">
        <Image
          source={{ uri: PROMO_IMAGE_URI }}
          className="size-full"
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      </View>
    </View>
  );
});
