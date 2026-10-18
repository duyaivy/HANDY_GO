import * as React from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '@/components/ui';

export type HeroBannerProps = {
  onSearch: (query: string) => void;
};

export const HeroBanner = React.memo(({ onSearch }: HeroBannerProps) => {
  const [query, setQuery] = React.useState('');

  const handleSubmit = React.useCallback(() => {
    onSearch(query);
  }, [onSearch, query]);

  return (
    <View className="relative overflow-hidden rounded-3xl bg-primary-600 p-[18px] shadow-lg shadow-orange-500/30">
      {/* Ambient background circles */}
      <View className="pointer-events-none absolute -top-12 -right-10 size-[180px] rounded-full bg-white/10" />
      <View className="pointer-events-none absolute -bottom-8 -left-5 size-[120px] rounded-full bg-white/10" />

      <View className="gap-2.5">
        {/* Badge row */}
        <View className="flex-row items-center justify-between">
          <View className="rounded-full bg-white/20 px-2.5 py-1">
            <Text className="text-[10px] font-extrabold tracking-wider text-white">
              ⚡ CỨU HỘ SIÊU TỐC
            </Text>
          </View>
          <Text className="text-[11px] font-medium text-white/90">
            Bảo hành 30 ngày
          </Text>
        </View>

        {/* Title */}
        <Text className="text-[22px]/7 font-extrabold tracking-tight text-white">
          Thợ giỏi, sẵn sàng hỗ trợ
        </Text>

        {/* Stats */}
        <View className="flex-row items-center gap-1">
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Circle cx="12" cy="12" r="9" stroke="#FFFFFF" strokeWidth={2} />
            <Path d="M12 7V12L15 14" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Text className="text-[11px] font-medium text-white/95">
            Báo giá trong 5 phút
          </Text>
          <Text className="text-[11px] text-white/60"> • </Text>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
            <Path d="M17 21V19C17 17.9 16.1 17 15 17H9C7.9 17 7 17.9 7 19V21" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" />
            <Circle cx="12" cy="10" r="4" stroke="#FFFFFF" strokeWidth={2} />
          </Svg>
          <Text className="text-[11px] font-medium text-white/95">
            120,000+ thợ đã xác thực
          </Text>
        </View>

        {/* Search bar inside Hero Banner */}
        <View className="mt-0.5 flex-row items-center gap-2 rounded-2xl bg-white py-1 pr-1.5 pl-3.5 shadow-sm">
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
            <Circle cx="11" cy="11" r="7" stroke="#9CA3AF" strokeWidth={2.2} />
            <Path d="M20 20L16.5 16.5" stroke="#9CA3AF" strokeWidth={2.2} strokeLinecap="round" />
          </Svg>
          <TextInput
            className="flex-1 py-1.5 text-[13px] text-neutral-900"
            placeholder="Tìm thợ sửa máy lạnh, điện nước..."
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSubmit}
            returnKeyType="search"
            accessibilityLabel="Tìm kiếm dịch vụ"
          />
          <TouchableOpacity
            className="h-[38px] w-11 items-center justify-center rounded-full bg-primary-600 active:opacity-85"
            onPress={handleSubmit}
            accessibilityRole="button"
            accessibilityLabel="Tìm kiếm"
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M5 12H19M19 12L12 5M19 12L12 19"
                stroke="#FFFFFF"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});
