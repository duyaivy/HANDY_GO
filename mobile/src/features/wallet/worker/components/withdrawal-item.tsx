import type { WithdrawalRecord } from '../../types/wallet.types';
import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { formatPointsToVND } from '../../utils/formatters';
import { transactionTime } from '../../utils/transaction-display';

const LABELS = { requested: 'Chờ xử lý', processing: 'Đang chi trả', succeeded: 'Đã chi trả', failed: 'Chi trả thất bại', cancelled: 'Đã hủy', needs_review: 'Cần đối soát' };
export const WithdrawalItem = memo(({ item, onCancel, cancelling }: { item: WithdrawalRecord; onCancel: (id: string) => void; cancelling: boolean }) => {
  return (
    <View testID={`withdrawal-${item.id}`} className="gap-2 border-b border-neutral-200 p-4 dark:border-neutral-800">
      <View className="flex-row items-center justify-between">
        <Text className="font-bold text-neutral-900 dark:text-white">{formatPointsToVND(item.amount)}</Text>
        <Text className={`rounded-full px-2 py-1 text-xs font-semibold ${item.status === 'succeeded' ? 'bg-emerald-50 text-emerald-800' : item.status === 'requested' || item.status === 'processing' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-700'}`}>{LABELS[item.status] ?? item.status}</Text>
      </View>
      <Text selectable className="text-xs text-neutral-500 dark:text-neutral-400">{`Mã lệnh: ${item.id}`}</Text>
      <Text className="text-xs text-neutral-500 dark:text-neutral-400">{transactionTime(item.createdAt)}</Text>
      {item.status === 'needs_review' ? <Text className="text-sm text-amber-700 dark:text-amber-300">Kết quả chi trả cần đối soát. Không tạo lệnh thay thế cho khoản tiền này; liên hệ hỗ trợ với mã lệnh.</Text> : null}
      {item.status === 'requested' ? <Pressable testID={`cancel-withdrawal-${item.id}`} accessibilityRole="button" disabled={cancelling} onPress={() => onCancel(item.id)} className="self-start rounded-xl border border-red-300 p-2"><Text className="font-semibold text-red-600">{cancelling ? 'Đang hủy...' : 'Hủy yêu cầu'}</Text></Pressable> : null}
    </View>
  );
});
