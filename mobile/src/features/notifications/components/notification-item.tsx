import type { NotificationRecord } from '@/services/notifications/notification-api';
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

export const NotificationItem = memo(({ item, onPress }: {
  item: NotificationRecord;
  onPress: (item: NotificationRecord) => void;
}) => (
  <Pressable
    onPress={() => onPress(item)}
    accessibilityRole="button"
    accessibilityLabel={`${item.readAt ? 'Đã đọc' : 'Chưa đọc'}: ${item.title}`}
    className={`mx-4 my-1 rounded-xl border p-4 ${item.readAt ? 'border-neutral-200 bg-white dark:bg-neutral-900' : 'border-primary-200 bg-primary-50 dark:bg-neutral-800'}`}
  >
    <View className="flex-row items-center gap-2">
      {!item.readAt && <View className="size-2 rounded-full bg-primary-500" />}
      <Text className="flex-1 font-bold">{item.title}</Text>
    </View>
    <Text className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{item.body}</Text>
    <Text className="mt-2 text-xs text-neutral-500">{new Date(item.createdAt).toLocaleString('vi-VN')}</Text>
  </Pressable>
));
