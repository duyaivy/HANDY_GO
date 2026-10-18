import * as React from 'react';
import { TextInput, TouchableOpacity, View } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import Svg, { Path } from 'react-native-svg';

export type CategorySearchHeaderProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onBack: () => void;
};

export const CategorySearchHeader = React.memo(({
  searchQuery,
  onSearchChange,
  onBack,
}: CategorySearchHeaderProps) => {
  const handleVoiceSearch = React.useCallback(() => {
    showMessage({
      message: 'Tìm kiếm bằng giọng nói',
      description: 'Tính năng giọng nói đang được phát triển!',
      type: 'info',
      icon: 'info',
    });
  }, []);

  return (
    <View className="flex-row items-center gap-2.5 px-4 py-2.5">
      {/* Close / Back Button */}
      <TouchableOpacity
        className="size-10 items-center justify-center rounded-full bg-white shadow-sm active:opacity-80"
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Quay lại"
      >
        <Svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4B5563"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <Path d="M18 6L6 18M6 6l12 12" />
        </Svg>
      </TouchableOpacity>

      {/* Search Box Pill */}
      <View className="flex-1 flex-row items-center rounded-full border border-neutral-100 bg-white py-1 pr-1.5 pl-3.5 shadow-sm">
        <TextInput
          className="flex-1 py-1 text-[13.5px] text-neutral-900"
          placeholder="Bạn cần sửa gì hôm nay?"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={onSearchChange}
          accessibilityLabel="Tìm kiếm dịch vụ"
          testID="category-search-input"
          returnKeyType="search"
        />

        {/* Voice Search Button */}
        <TouchableOpacity
          className="size-8 items-center justify-center rounded-full bg-primary-600 active:opacity-85"
          onPress={handleVoiceSearch}
          accessibilityRole="button"
          accessibilityLabel="Tìm kiếm bằng giọng nói"
        >
          <Svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M12 1.5a3.5 3.5 0 0 0-3.5 3.5v7a3.5 3.5 0 0 0 7 0V5a3.5 3.5 0 0 0-3.5-3.5z" />
            <Path d="M19 10.5v1.5a7 7 0 0 1-14 0v-1.5M12 19v3.5M8.5 22.5h7" />
          </Svg>
        </TouchableOpacity>
      </View>
    </View>
  );
});
