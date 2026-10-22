import { useRouter } from 'expo-router';
import * as React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import Svg, { Circle, Path } from 'react-native-svg';
import { Image, Text } from '@/components/ui';
import { RouteNames } from '@/constants/route-names';

const TECH_AVATAR_URI = 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=160&auto=format&fit=crop&q=80';

export const NearbyTechnicians = React.memo(() => {
  const router = useRouter();

  const handleCall = React.useCallback(() => {
    showMessage({
      message: 'Gọi thợ',
      description: 'Đang kết nối tới Thợ Hoàng Văn Minh...',
      type: 'info',
    });
  }, []);

  const handleAiAssistant = React.useCallback(() => {
    router.push(RouteNames.CUSTOMER_ASK_ME as any);
  }, [router]);

  const handleWorkerProfile = React.useCallback(() => {
    router.push(RouteNames.CUSTOMER_WORKER_DETAIL('th-01') as any);
  }, [router]);

  return (
    <View className="gap-3">
      {/* Header */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Path d="M22 2L11 13" stroke="#FF6C00" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M22 2L15 22L11 13L2 9L22 2Z" fill="#FFE2CC" stroke="#FF6C00" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Text className="text-base font-extrabold text-neutral-900">
            Thợ sẵn sàng gần đây
          </Text>
        </View>
        <View className="flex-row items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1">
          <View className="size-1.5 rounded-full bg-emerald-500" />
          <Text className="text-[11px] font-bold text-emerald-600">
            14 thợ đang rảnh
          </Text>
        </View>
      </View>

      {/* Technician Card */}
      <TouchableOpacity
        testID="nearby-technician-card"
        className="flex-row items-center gap-2.5 rounded-2xl bg-white p-3 shadow-sm active:opacity-90"
        onPress={handleWorkerProfile}
        accessibilityRole="button"
        accessibilityLabel="Hồ sơ thợ Hoàng Văn Minh"
      >
        <View className="relative">
          <Image
            source={{ uri: TECH_AVATAR_URI }}
            className="size-[58px] rounded-2xl bg-neutral-100"
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          <View className="absolute -bottom-1 self-center rounded-md bg-primary-600 px-1.5 py-0.5">
            <Text className="text-[9px] font-extrabold text-white">★ 4.9</Text>
          </View>
        </View>

        <View className="flex-1">
          <Text className="text-sm font-bold text-neutral-900">
            Thợ Hoàng Văn Minh
          </Text>
          <Text className="mt-0.5 text-[11px] text-neutral-500">
            Chuyên máy lạnh • Cách bạn 1.2 km
          </Text>
          <Text className="mt-1 text-[11px] font-semibold text-orange-600">
            Có mặt trong 15 phút
          </Text>
        </View>

        <View className="items-end gap-1.5">
          <TouchableOpacity
            className="rounded-full bg-orange-100 px-3.5 py-1.5 active:opacity-80"
            onPress={(e) => {
              e?.stopPropagation?.();
              handleCall();
            }}
            accessibilityRole="button"
            accessibilityLabel="Gọi thợ"
          >
            <Text className="text-xs font-bold text-orange-600">Gọi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="nearby-ai-assistant-btn"
            className="flex-row items-center gap-1 rounded-full bg-primary-600 px-2.5 py-1.5 active:opacity-85"
            onPress={(e) => {
              e?.stopPropagation?.();
              handleAiAssistant();
            }}
            accessibilityRole="button"
            accessibilityLabel="Trợ lý AI"
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
              <Path
                d="M12 2V6M12 18V22M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M2 12H6M18 12H22M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
              <Circle cx="12" cy="12" r="4" fill="#FFFFFF" />
            </Svg>
            <Text className="text-[11px] font-bold text-white">Trợ lý AI</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </View>
  );
});
