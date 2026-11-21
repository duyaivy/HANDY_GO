import { ActivityIndicator, Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useWorkerFinancials } from '../../hooks/use-worker-financials';
import { formatPointsToVND } from '../../utils/formatters';

export function WorkerEarningsSummary() {
  const query = useWorkerFinancials();
  return (
    <View testID="worker-earnings-summary" className="gap-3 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <Text className="font-bold text-neutral-900 dark:text-white">Thu nhập & hoa hồng</Text>
      {!query.isAuthenticated
        ? <Text className="text-neutral-500">Đăng nhập để xem thu nhập.</Text>
        : query.isPending
          ? <ActivityIndicator accessibilityLabel="Đang tải thu nhập" />
          : query.isError
            ? <Pressable accessibilityRole="button" onPress={() => { void query.refetch(); }}><Text className="text-red-600">Không thể tải thống kê. Chạm để thử lại.</Text></Pressable>
            : query.data?.summary
              ? (
                  <>
                    <Text className="text-neutral-800 dark:text-neutral-200">{`Thu nhập ghi nhận tuần này: ${formatPointsToVND(query.data.summary.weeklyEarnings)}`}</Text>
                    <Text className="text-neutral-800 dark:text-neutral-200">{`Đơn đã nghiệm thu tuần này: ${query.data.summary.completedJobs}`}</Text>
                    <Text className="text-neutral-800 dark:text-neutral-200">{`Tổng hoa hồng đã nộp: ${formatPointsToVND(query.data.summary.commissionPaid)}`}</Text>
                    <Text className="text-xs text-neutral-500 dark:text-neutral-400">Theo payment đã thanh toán; gồm thu nhập tiền mặt trực tiếp, không đồng nghĩa số dư ví. Hoa hồng theo mức áp dụng cho từng đơn.</Text>
                  </>
                )
              : query.data
                ? <Text testID="worker-financials-unavailable" className="text-neutral-500">Chưa thể hiển thị thống kê chính xác với lịch sử hiện tại. Vui lòng xem lịch sử giao dịch để đối chiếu.</Text>
                : null}
    </View>
  );
}
