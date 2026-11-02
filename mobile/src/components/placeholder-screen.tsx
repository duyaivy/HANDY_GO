import { useRouter } from 'expo-router';
import * as React from 'react';
import { View } from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

export type PlaceholderScreenProps = {
  /** Tên trang hiển thị trong tiêu đề nếu title không truyền */
  pageName?: string;
  /** Tiêu đề AppBar (mặc định lấy theo pageName nếu không truyền) */
  title?: string;
  /** Phụ đề AppBar hoặc mã ID định danh */
  subtitle?: string;
  /** Mode của AppBar: 'stack' (mặc định) hoặc 'home' */
  mode?: 'stack' | 'home';
  /** Ẩn nút Back trên AppBar */
  hideBackButton?: boolean;
  /** Callback khi bấm nút Back */
  onBack?: () => void;
  /** Biểu tượng hiển thị (giữ tương thích prop) */
  icon?: string;
  /** TestID cho automation testing */
  testID?: string;
  /** Variant màu chủ đạo ('orange' cho Khách, 'blue' cho Thợ) */
  variant?: 'orange' | 'blue';
  /** Các thành phần bổ sung tùy chọn nếu cần */
  children?: React.ReactNode;
};

export function PlaceholderScreen({
  pageName = 'Trang',
  title,
  subtitle,
  mode = 'stack',
  hideBackButton = false,
  onBack,
  testID = 'placeholder-screen',
  children,
}: PlaceholderScreenProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
    else {
      router.back();
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode={mode}
        title={title || pageName}
        subtitle={subtitle}
        hideBackButton={hideBackButton}
        onBack={handleBack}
        testID={`${testID}-app-bar`}
      />

      <View testID={testID} className="flex-1 items-center justify-center px-6 py-24">
        <Text
          testID={`${testID}-title`}
          className="text-center text-base font-medium text-neutral-500 dark:text-neutral-400"
        >
          Chức năng đang được phát triển
        </Text>

        {children}
      </View>
    </Screen>
  );
}
