import type { WalletTransaction } from '../../types/wallet.types';
import { memo, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { WalletIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';
import { transactionAmount, transactionTime, transactionTitle } from '../../utils/transaction-display';

type Props = { transaction: WalletTransaction; onPress: (transaction: WalletTransaction) => void };
export const TransactionItem = memo(({ transaction, onPress }: Props) => {
  const handlePress = useCallback(() => onPress(transaction), [onPress, transaction]);
  const amount = transactionAmount(transaction);
  const credit = amount.startsWith('+');
  const refund = transaction.type === 'refund_credit' || transaction.type === 'refund_recovery';
  return (
    <Pressable testID={`transaction-item-${transaction.id}`} accessibilityRole="button" onPress={handlePress} className="min-h-20 flex-row items-center gap-3 border-b border-neutral-100 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
      <View className={`size-10 items-center justify-center rounded-full ${transaction.type === 'topup' ? 'bg-emerald-50' : refund ? 'bg-purple-50' : transaction.type === 'payment_debit' ? 'bg-orange-50' : 'bg-neutral-100'}`}>
        {transaction.type === 'payment_debit' ? <WalletIcon size={20} color="#EA580C" /> : <Text className={`text-xl font-bold ${transaction.type === 'topup' ? 'text-emerald-700' : refund ? 'text-purple-700' : 'text-neutral-500'}`}>{transaction.type === 'topup' ? '↓' : refund ? '↶' : 'ⓘ'}</Text>}
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-sm font-semibold text-neutral-900 dark:text-white">{transactionTitle(transaction)}</Text>
        <Text className="text-xs text-neutral-500 dark:text-neutral-400">{transactionTime(transaction.createdAt)}</Text>
      </View>
      <Text testID={`transaction-amount-${transaction.id}`} className={`text-sm font-bold ${credit ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-900 dark:text-white'}`}>{amount}</Text>
    </Pressable>
  );
});
