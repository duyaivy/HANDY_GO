import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

type Props = {
  testID: string;
  title: string;
  description: string;
  badge: string;
  icon: ReactNode;
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  children?: ReactNode;
};

export function PaymentMethodCard({ testID, title, description, badge, icon, selected, onSelect, disabled = false, children }: Props) {
  const content = (
    <>
      <View className="flex-row items-center gap-3">
        <View className="size-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950">{icon}</View>
        <View className="flex-1 gap-2">
          <Text className="font-semibold text-neutral-900 dark:text-white">{title}</Text>
          <Text className="self-start rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">{badge}</Text>
        </View>
        {onSelect ? <Text className="text-lg text-emerald-700 dark:text-emerald-400">{selected ? '◉' : '○'}</Text> : null}
      </View>
      <Text className="text-sm text-neutral-600 dark:text-neutral-400">{description}</Text>
      {children}
    </>
  );
  const className = `gap-3 rounded-2xl border p-4 ${selected ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900'}`;
  return onSelect
    ? <Pressable testID={testID} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onSelect} className={className}>{content}</Pressable>
    : <View testID={testID} className={className}>{content}</View>;
}
