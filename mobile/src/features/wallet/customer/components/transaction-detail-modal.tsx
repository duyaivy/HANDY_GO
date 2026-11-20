import type { WalletTransaction } from '../../types/wallet.types';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { TRANSACTION_STATUSES, transactionAmount, transactionTime, transactionTitle } from '../../utils/transaction-display';

type Props = { transaction: WalletTransaction | null; onClose: () => void; onSupport: () => void };
export function TransactionDetailModal({ transaction, onClose, onSupport }: Props) {
  if (!transaction)
    return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-center bg-black/60 p-5">
        <View testID="transaction-detail-modal" className="max-h-[90%] rounded-3xl bg-white p-5 dark:bg-neutral-900">
          <ScrollView contentInsetAdjustmentBehavior="automatic">
            <Text className="text-xl font-bold text-neutral-900 dark:text-white">Chi tiết giao dịch</Text>
            <Text className={`mt-3 self-start rounded-xl px-3 py-2 font-semibold ${transaction.status === 'completed' ? 'bg-emerald-50 text-emerald-700' : transaction.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-700'}`}>{TRANSACTION_STATUSES[transaction.status] ?? transaction.status}</Text>
            <Text className="mt-4 text-lg font-bold text-neutral-900 dark:text-white">{transactionAmount(transaction)}</Text>
            <Text className="mt-2 text-neutral-700 dark:text-neutral-300">{transactionTitle(transaction)}</Text>
            <Text selectable className="mt-4 text-neutral-700 dark:text-neutral-300">{`Mã giao dịch: ${transaction.id}`}</Text>
            <Text selectable className="mt-3 text-neutral-700 dark:text-neutral-300">{`Mã tham chiếu: ${transaction.referenceId ?? 'Không có'}`}</Text>
            <Text className="mt-3 text-neutral-700 dark:text-neutral-300">{`Thời gian: ${transactionTime(transaction.createdAt)}`}</Text>
            <Text className="mt-3 text-neutral-700 dark:text-neutral-300">Số dư trước giao dịch: Chưa được cung cấp</Text>
            <Text className="mt-3 text-neutral-700 dark:text-neutral-300">Số dư sau giao dịch: Chưa được cung cấp</Text>
            <Text className="mt-3 text-neutral-700 dark:text-neutral-300">{`Nội dung: ${transaction.description || 'Không có nội dung'}`}</Text>
            <Pressable testID="transaction-support-btn" accessibilityRole="button" onPress={onSupport} className="mt-5 rounded-xl bg-emerald-700 p-3"><Text className="text-center font-semibold text-white">Cần trợ giúp về giao dịch này</Text></Pressable>
            <Pressable testID="transaction-detail-close-btn" accessibilityRole="button" onPress={onClose} className="mt-3 p-3"><Text className="text-center font-semibold text-neutral-800 dark:text-white">Đóng</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
