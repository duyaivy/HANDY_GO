import type { BankAccount } from '../../types/wallet.types';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

type Props = { account: BankAccount; selected?: boolean; onSelect?: () => void; disabled?: boolean };
export function BankAccountCard({ account, selected = false, onSelect, disabled = false }: Props) {
  const content = (
    <>
      <View className="flex-row items-center gap-3">
        <Text className="rounded-xl bg-blue-50 p-2 font-bold text-blue-800">{account.bankCode}</Text>
        <Text className="flex-1 font-semibold text-neutral-900 dark:text-white">{account.bankName}</Text>
      </View>
      <Text className="text-neutral-700 dark:text-neutral-200">{`•••• ${account.accountNumber.slice(-4)}`}</Text>
      <Text className="font-semibold text-neutral-900 dark:text-white">{account.accountHolderName.toUpperCase()}</Text>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">{account.isDefault ? 'Tài khoản mặc định' : 'Tài khoản đã lưu'}</Text>
    </>
  );
  const className = `gap-2 rounded-2xl border p-4 ${selected ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900'}`;
  return onSelect ? <Pressable testID={`withdraw-bank-${account.id}`} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onSelect} className={className}>{content}</Pressable> : <View className={className}>{content}</View>;
}
