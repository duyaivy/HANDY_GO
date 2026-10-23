import type { NotificationRecord } from '@/services/notifications/notification-api';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import {
  BellIcon,
  OrdersIcon,
  SparklesIcon,
  WalletIcon,
  WrenchIcon,
} from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';
import { PRIMARY_COLOR } from '@/constants/colors';

type CategoryStyle = {
  Icon: React.ComponentType<{ color: string; size: number }>;
  bgColor: string;
  iconColor: string;
};

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  order: {
    Icon: OrdersIcon,
    bgColor: 'bg-blue-100 dark:bg-blue-950/60',
    iconColor: '#2563EB',
  },
  wallet: {
    Icon: WalletIcon,
    bgColor: 'bg-emerald-100 dark:bg-emerald-950/60',
    iconColor: '#059669',
  },
  payment: {
    Icon: WalletIcon,
    bgColor: 'bg-emerald-100 dark:bg-emerald-950/60',
    iconColor: '#059669',
  },
  request: {
    Icon: WrenchIcon,
    bgColor: 'bg-orange-100 dark:bg-orange-950/60',
    iconColor: '#EA580C',
  },
  matching: {
    Icon: SparklesIcon,
    bgColor: 'bg-purple-100 dark:bg-purple-950/60',
    iconColor: '#7C3AED',
  },
  bidding: {
    Icon: SparklesIcon,
    bgColor: 'bg-violet-100 dark:bg-violet-950/60',
    iconColor: '#8B5CF6',
  },
  proposal: {
    Icon: OrdersIcon,
    bgColor: 'bg-indigo-100 dark:bg-indigo-950/60',
    iconColor: '#4F46E5',
  },
  system: {
    Icon: BellIcon,
    bgColor: 'bg-amber-100 dark:bg-amber-950/60',
    iconColor: '#D97706',
  },
};

const DEFAULT_STYLE: CategoryStyle = {
  Icon: BellIcon,
  bgColor: 'bg-amber-100 dark:bg-amber-950/60',
  iconColor: PRIMARY_COLOR,
};

function formatNotificationTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime()))
      return '';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }
  catch {
    return '';
  }
}

export const NotificationItem = React.memo(({ item, onPress }: {
  item: NotificationRecord;
  onPress: (item: NotificationRecord) => void;
}) => {
  const style = CATEGORY_STYLES[item.category] ?? DEFAULT_STYLE;
  const { Icon, bgColor, iconColor } = style;

  return (
    <Pressable
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${item.readAt ? 'Đã đọc' : 'Chưa đọc'}: ${item.title}`}
      className={`mx-4 my-1.5 rounded-2xl border p-4 shadow-sm ${
        item.readAt
          ? 'border-neutral-200/80 bg-white dark:border-neutral-800 dark:bg-neutral-900'
          : 'border-primary-200 bg-primary-50/50 dark:border-primary-900/50 dark:bg-neutral-800'
      }`}
    >
      <View className="flex-row items-start gap-3">
        <View className={`mt-0.5 size-11 items-center justify-center rounded-2xl ${bgColor}`}>
          <Icon size={22} color={iconColor} />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-1.5">
            {!item.readAt && <View className="size-2 rounded-full bg-primary-500" />}
            <Text className="flex-1 text-base font-bold text-neutral-900 dark:text-neutral-100">
              {item.title}
            </Text>
          </View>
          <Text className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {item.body}
          </Text>
          <Text className="mt-2 text-xs font-medium text-neutral-400">
            {formatNotificationTime(item.createdAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});
