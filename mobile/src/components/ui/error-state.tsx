import type { ViewProps } from 'react-native';
import { View } from 'react-native';
import { Button } from './button';
import { Text } from './text';

export type ErrorStateProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryText?: string;
} & ViewProps;

export function ErrorState({
  title = 'Đã có lỗi xảy ra',
  message = 'Không thể tải được dữ liệu. Vui lòng kiểm tra kết nối và thử lại.',
  onRetry,
  retryText = 'Thử lại',
  className,
  style,
  ...props
}: ErrorStateProps) {
  return (
    <View
      className={`flex-1 items-center justify-center p-6 text-center ${className ?? ''}`}
      style={style}
      {...props}
    >
      <View className="mb-3 size-14 items-center justify-center rounded-full bg-danger-100 dark:bg-danger-900/30">
        <Text className="text-2xl">⚠️</Text>
      </View>
      <Text className="text-center text-lg font-bold text-neutral-900 dark:text-white">
        {title}
      </Text>
      <Text className="mt-1 max-w-xs text-center text-sm text-neutral-500 dark:text-neutral-400">
        {message}
      </Text>
      {Boolean(onRetry) && (
        <View className="mt-5 w-40">
          <Button label={retryText} onPress={onRetry} variant="default" size="default" />
        </View>
      )}
    </View>
  );
}
