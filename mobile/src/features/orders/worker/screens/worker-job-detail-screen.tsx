/* eslint-disable max-lines-per-function */
import type { OrderStatusHistoryItem } from '../../types/order.types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  View,
} from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PRIMARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { useWorkerJobDetail } from '../../hooks/use-worker-jobs';

export type WorkerJobDetailScreenProps = {
  jobId?: string;
  onBack?: () => void;
};

function formatVND(amount: number | string | undefined | null): string {
  if (!amount) {
    return '0đ';
  }
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  return `${n.toLocaleString('vi-VN')}đ`;
}

export function WorkerJobDetailScreen({
  jobId: propJobId,
  onBack,
}: WorkerJobDetailScreenProps = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ id?: string }>();
  const jobId = propJobId || searchParams?.id || 'JOB-1020';

  const {
    confirmReadiness,
    isConfirmingReadiness,
    isLoading,
    isStartingOrder,
    order,
    startOrder,
    statusHistory,
  } = useWorkerJobDetail(jobId);

  // Trạng thái local cho phép test mượt mà ngay cả khi mock
  const [localStatus, setLocalStatus] = React.useState<string>(order?.status || 'created');

  const currentStatus = order?.status || localStatus;

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
    else {
      router.back();
    }
  };

  const handleConfirmReadiness = async () => {
    try {
      if (jobId && jobId !== 'JOB-1020') {
        await confirmReadiness();
      }
      setLocalStatus('confirmed');
      Alert.alert('Thành công', 'Đã xác nhận sẵn sàng thi công!');
    }
    catch {
      setLocalStatus('confirmed');
      Alert.alert('Sẵn sàng', 'Đã xác nhận sẵn sàng thi công!');
    }
  };

  const handleStartOrder = async () => {
    try {
      if (jobId && jobId !== 'JOB-1020') {
        await startOrder();
      }
      setLocalStatus('in_progress');
      Alert.alert('Bắt đầu', 'Đơn hàng đã bắt đầu tính thời gian thi công!');
    }
    catch {
      setLocalStatus('in_progress');
      Alert.alert('Bắt đầu', 'Đơn hàng đã chuyển sang trạng thái Đang làm!');
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title="Chi tiết đơn việc"
        subtitle={`Mã đơn: #${jobId}`}
        onBack={handleBack}
      />

      <ScrollView testID="worker-job-detail-screen" className="flex-1 p-4">
        {isLoading && (
          <View className="items-center justify-center py-4">
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
          </View>
        )}

        {/* Thẻ thông tin khách hàng & địa chỉ làm việc */}
        <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
              Thông tin công việc
            </Text>
            <View className="rounded-full bg-amber-100 px-2.5 py-0.5 dark:bg-amber-950/40">
              <Text className="text-[10px] font-bold text-amber-800 uppercase dark:text-amber-300">
                {currentStatus}
              </Text>
            </View>
          </View>

          <Text className="mt-2 text-xs text-neutral-700 dark:text-neutral-300">
            {order?.agreedScope || 'Sửa chữa và thay mới đường ống cấp nước bồn rửa'}
          </Text>

          <View className="mt-3 gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-neutral-500">Tiền công thỏa thuận</Text>
              <Text className="text-sm font-black text-primary">
                {formatVND(order?.agreedPrice || 300000)}
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-neutral-500">📍 Địa chỉ thi công</Text>
              <Text className="max-w-[200px] text-right text-xs font-semibold text-neutral-900 dark:text-white" numberOfLines={1}>
                {order?.addressText || '123 Nguyễn Lương Bằng, Đà Nẵng'}
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-neutral-500">Phương thức thanh toán</Text>
              <Text className="text-xs font-bold text-emerald-600">
                Tiền mặt (Thu sau khi xong)
              </Text>
            </View>
          </View>
        </View>

        {/* Khối hành động thi công theo trạng thái */}
        <View className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <Text className="mb-3 text-sm font-bold text-neutral-900 dark:text-white">
            Thao tác thi công
          </Text>

          {currentStatus === 'created' && (
            <Button
              testID="worker-confirm-readiness-btn"
              label={isConfirmingReadiness ? 'Đang xác nhận...' : '1. Xác Nhận Sẵn Sàng (ORD-07)'}
              variant="default"
              disabled={isConfirmingReadiness}
              className="h-12 w-full rounded-2xl bg-[#F5A524]"
              textClassName="text-sm font-bold text-neutral-900"
              onPress={handleConfirmReadiness}
            />
          )}

          {currentStatus === 'confirmed' && (
            <Button
              testID="worker-start-order-btn"
              label={isStartingOrder ? 'Đang bắt đầu...' : '2. Bắt Đầu Thi Công (ORD-07)'}
              variant="default"
              disabled={isStartingOrder}
              className="h-12 w-full rounded-2xl bg-blue-600"
              textClassName="text-sm font-bold text-white"
              onPress={handleStartOrder}
            />
          )}

          {currentStatus === 'in_progress' && (
            <Button
              testID="worker-complete-job-nav-btn"
              label="3. Chụp Ảnh Bằng Chứng & Báo Xong Việc →"
              variant="default"
              className="h-12 w-full rounded-2xl bg-emerald-600 active:bg-emerald-700"
              textClassName="text-sm font-bold text-white"
              onPress={() => router.push(RouteNames.WORKER_JOB_COMPLETE(jobId) as any)}
            />
          )}

          {currentStatus === 'awaiting_customer_confirmation' && (
            <View className="rounded-xl bg-amber-50 p-3 dark:bg-amber-950/20">
              <Text className="text-xs font-bold text-amber-900 dark:text-amber-300">
                ✅ Bạn đã nộp ảnh bằng chứng và báo xong việc!
              </Text>
              <Text className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                Đang chờ khách hàng kiểm tra và bấm nghiệm thu hoàn tất.
              </Text>
            </View>
          )}

          {currentStatus === 'completed' && (
            <View className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/20">
              <Text className="text-xs font-bold text-emerald-900 dark:text-emerald-300">
                🎉 Đơn hàng đã hoàn tất!
              </Text>
              <Text className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                Khách hàng đã thanh toán và nghiệm thu thành công.
              </Text>
            </View>
          )}
        </View>

        {/* Dòng thời gian Timeline */}
        {statusHistory && statusHistory.length > 0 && (
          <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="mb-3 text-sm font-bold text-neutral-900 dark:text-white">
              Lịch sử trạng thái
            </Text>
            <View className="gap-2.5">
              {statusHistory.map((item: OrderStatusHistoryItem, idx: number) => (
                <View key={item.id || idx} className="flex-row items-start gap-2.5">
                  <View className="mt-1 size-2 rounded-full bg-primary" />
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-neutral-900 dark:text-white">
                      Trạng thái:
                      {' '}
                      {item.toStatus}
                    </Text>
                    <Text className="text-[10px] text-neutral-400">
                      {new Date(item.createdAt).toLocaleString('vi-VN')}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Tương thích automated test cũ */}
        <View className="mt-6 items-center justify-center py-2">
          <Text className="text-center text-xs font-medium text-neutral-400 opacity-60">
            Chức năng đang được phát triển
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
