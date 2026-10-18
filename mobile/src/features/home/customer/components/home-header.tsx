import * as React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import Svg, { Circle, Path } from 'react-native-svg';
import { Image, Text } from '@/components/ui';

export type HomeHeaderProps = {
  displayName: string;
};

const AVATAR_URI = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&auto=format&fit=crop&q=80';

export const HomeHeader = React.memo(({ displayName }: HomeHeaderProps) => {
  const handleRewardPress = React.useCallback(() => {
    showMessage({
      message: 'Ví thưởng',
      description: 'Bạn đang có 200 điểm tích lũy!',
      type: 'info',
    });
  }, []);

  return (
    <View className="flex-row items-center justify-between pt-1">
      <View className="flex-1 flex-row items-center gap-3">
        <View className="relative">
          <Image
            source={{ uri: AVATAR_URI }}
            className="size-12 rounded-full bg-primary-100"
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <View className="absolute right-0 bottom-0 size-3.5 rounded-full border-2 border-white bg-emerald-500" />
        </View>
        <View>
          <Text className="text-[17px] font-bold tracking-tight text-neutral-900">
            {displayName}
          </Text>
          <Text className="mt-0.5 text-xs text-neutral-500">
            Xin chào, bạn cần thợ gì hôm nay?
          </Text>
        </View>
      </View>

      {/* Reward / Coin Badge Button */}
      <TouchableOpacity
        className="size-11 items-center justify-center rounded-xl bg-white shadow-sm active:opacity-80"
        onPress={handleRewardPress}
        accessibilityRole="button"
        accessibilityLabel="Ví thưởng"
      >
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" fill="#FFF7ED" stroke="#FF6C00" strokeWidth={1.8} />
          <Circle cx="12" cy="12" r="6" fill="#FFEDD5" />
          <Path
            d="M12 9V15M9.5 10.5C9.5 9.67 10.62 9 12 9C13.38 9 14.5 9.67 14.5 10.5C14.5 12 9.5 11.5 9.5 13C9.5 13.83 10.62 15 12 15C13.38 15 14.5 13.83 14.5 13"
            stroke="#FF6C00"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        </Svg>
      </TouchableOpacity>
    </View>
  );
});
