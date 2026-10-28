import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/components/ui';
import { RouteNames } from '@/constants/route-names';

export const CategoryAiBanner = React.memo(() => {
  const router = useRouter();

  const handleAiChat = React.useCallback(() => {
    router.push(RouteNames.CUSTOMER_ASK_ME as any);
  }, [router]);

  return (
    <Pressable
      testID="category-ai-chat-banner"
      className="relative mx-4 mt-2 mb-3 flex-row items-center justify-between overflow-hidden rounded-2xl border border-neutral-100 bg-white p-3 shadow-sm active:opacity-85"
      onPress={handleAiChat}
      accessibilityRole="button"
      accessibilityLabel="Chat với AI Vua Thợ"
    >
      {/* Subtle warm glow background accent */}
      <View className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full bg-orange-100/50" />

      <View className="flex-1 flex-row items-center gap-3 pr-2">
        {/* Robot Avatar */}
        <View className="relative">
          <View className="size-11 items-center justify-center rounded-2xl border border-orange-200 bg-orange-50">
            <View className="h-5 w-7 flex-row items-center justify-center gap-1 rounded-lg bg-primary-600">
              <View className="size-1.5 rounded-full bg-white" />
              <View className="size-1.5 rounded-full bg-white" />
            </View>
          </View>
          <View className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full border border-white bg-emerald-500" />
        </View>

        {/* AI Banner Texts */}
        <View className="flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            <Text className="text-sm font-bold text-neutral-900">
              Chat với AI Vua Thợ
            </Text>
            <View className="rounded-full bg-primary-600 px-1.5 py-0.5">
              <Text className="text-[9px] font-extrabold text-white">AI Pro</Text>
            </View>
          </View>
          <Text className="text-[11px]/4 text-neutral-500" numberOfLines={2}>
            Mô tả vấn đề — AI gợi ý dịch vụ phù hợp và ước tính chi phí tức thì
          </Text>
        </View>
      </View>

      {/* Chevron Right */}
      <Svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#9CA3AF"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <Path d="M9 5l7 7-7 7" />
      </Svg>
    </Pressable>
  );
});
