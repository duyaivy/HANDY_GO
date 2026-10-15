import type { ViewProps } from 'react-native';
import { ActivityIndicator, View } from 'react-native';
import colors from './colors';
import { Text } from './text';

export type LoadingStateProps = {
  message?: string;
  size?: 'small' | 'large';
  color?: string;
} & ViewProps;

export function LoadingState({
  message = 'Đang tải...',
  size = 'large',
  color = colors.primary[600],
  className,
  style,
  ...props
}: LoadingStateProps) {
  return (
    <View
      className={`flex-1 items-center justify-center p-6 ${className ?? ''}`}
      style={style}
      {...props}
    >
      <ActivityIndicator size={size} color={color} />
      {Boolean(message) && (
        <Text className="mt-3 text-center text-sm font-medium text-neutral-500 dark:text-neutral-400">
          {message}
        </Text>
      )}
    </View>
  );
}
