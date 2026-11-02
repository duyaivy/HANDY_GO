import * as React from 'react';
import { TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Text } from '@/components/ui';

export type EmptySearchResultProps = {
  query: string;
  onClear: () => void;
};

function EmptySearchIllustration() {
  return (
    <Svg width={120} height={120} viewBox="0 0 128 128" fill="none">
      <Defs>
        <LinearGradient id="emptyGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#FFF7ED" />
          <Stop offset="100%" stopColor="#FFEDD5" />
        </LinearGradient>
        <LinearGradient id="handleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#FF6C00" />
          <Stop offset="100%" stopColor="#C2410C" />
        </LinearGradient>
      </Defs>

      {/* Soft ambient background glow */}
      <Circle cx="64" cy="64" r="54" fill="url(#emptyGlow)" />
      <Circle cx="100" cy="36" r="10" fill="#FED7AA" opacity={0.6} />
      <Circle cx="28" cy="92" r="7" fill="#FED7AA" opacity={0.5} />

      {/* Floating Catalog / Document Card */}
      <Rect
        x="34"
        y="28"
        width="52"
        height="66"
        rx="10"
        fill="#FFFFFF"
        stroke="#FDBA74"
        strokeWidth="1.8"
      />
      <Rect x="42" y="38" width="22" height="4" rx="2" fill="#FED7AA" />
      <Rect x="42" y="47" width="36" height="3.5" rx="1.75" fill="#E5E7EB" />
      <Rect x="42" y="55" width="30" height="3.5" rx="1.75" fill="#E5E7EB" />
      <Rect x="42" y="63" width="24" height="3.5" rx="1.75" fill="#E5E7EB" />
      <Circle cx="76" cy="32" r="5" fill="#FF6C00" />
      <Path
        d="M73.5 32L75.2 33.5L78.5 29.8"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Sparkles */}
      <Path
        d="M96 20L97.2 23.8L101 25L97.2 26.2L96 30L94.8 26.2L91 25L94.8 23.8Z"
        fill="#FF6C00"
      />
      <Path
        d="M24 38L25.2 41.5L29 42.5L25.2 43.5L24 47L22.8 43.5L19 42.5L22.8 41.5Z"
        fill="#F59E0B"
      />
      <Circle cx="22" cy="70" r="2" fill="#FDBA74" />
      <Circle cx="106" cy="62" r="2.5" fill="#FDBA74" />

      {/* Magnifying Glass Body */}
      <Circle
        cx="68"
        cy="68"
        r="23"
        fill="#FFFFFF"
        fillOpacity={0.92}
        stroke="#FF6C00"
        strokeWidth="4"
      />
      <Path
        d="M56 59C58.5 53 64 50 71 50"
        stroke="#FDBA74"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Path
        d="M65 63C65 60.8 66.5 59.5 68.5 59.5C70.5 59.5 72 60.8 72 62.5C72 64.2 70.8 65.2 69.5 66.2C68.5 67 68.5 68 68.5 69"
        stroke="#FF8A00"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <Circle cx="68.5" cy="73.5" r="1.3" fill="#FF8A00" />
      <Path
        d="M84.5 84.5L102 102"
        stroke="url(#handleGrad)"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <Path
        d="M84 84L87.5 87.5"
        stroke="#FED7AA"
        strokeWidth="5.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export const EmptySearchResult = React.memo(({
  query,
  onClear,
}: EmptySearchResultProps) => {
  return (
    <View className="items-center justify-center px-6 py-12">
      <View className="mb-4">
        <EmptySearchIllustration />
      </View>

      <Text className="mb-1 text-center text-[17px] font-bold text-neutral-900">
        Không tìm thấy dịch vụ
      </Text>
      <Text className="mb-5 max-w-[280px] text-center text-[13px]/5 text-neutral-500">
        {query
          ? `Không tìm thấy dịch vụ hoặc danh mục nào phù hợp với "${query}".`
          : 'Hiện tại chưa có dịch vụ nào trong danh mục này.'}
      </Text>

      {Boolean(query) && (
        <TouchableOpacity
          className="rounded-full bg-primary-600 px-5 py-2.5 active:opacity-85"
          onPress={onClear}
        >
          <Text className="text-xs font-bold text-white">
            Xóa bộ lọc tìm kiếm
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
});
