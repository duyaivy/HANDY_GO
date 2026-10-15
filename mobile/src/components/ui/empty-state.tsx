import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';
import { View } from 'react-native';
import { Button } from './button';
import { Text } from './text';

export type EmptyStateProps = {
  icon?: ReactNode;
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
} & ViewProps;

export function EmptyState({
  icon,
  title = 'Chưa có dữ liệu',
  message = 'Danh sách hiện tại đang trống.',
  actionLabel,
  onAction,
  className,
  style,
  ...props
}: EmptyStateProps) {
  return (
    <View
      className={`flex-1 items-center justify-center p-6 ${className ?? ''}`}
      style={style}
      {...props}
    >
      <View className="mb-3 size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
        {icon || <Text className="text-3xl">📦</Text>}
      </View>
      <Text className="text-center text-lg font-bold text-neutral-900 dark:text-white">
        {title}
      </Text>
      <Text className="mt-1 max-w-xs text-center text-sm text-neutral-500 dark:text-neutral-400">
        {message}
      </Text>
      {Boolean(actionLabel && onAction) && (
        <View className="mt-5 w-44">
          <Button label={actionLabel!} onPress={onAction} variant="outline" size="default" />
        </View>
      )}
    </View>
  );
}
