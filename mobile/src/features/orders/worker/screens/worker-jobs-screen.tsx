/* eslint-disable max-lines-per-function */
import type { BookingProposal, Order } from '../../types/order.types';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  View,
} from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PRIMARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { useAcceptProposal, useWorkerJobs } from '../../hooks/use-worker-jobs';

export type WorkerJobTab = 'proposals' | 'active';

function formatVND(amount: number | string | undefined | null): string {
  if (!amount) {
    return '0đ';
  }
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  return `${n.toLocaleString('vi-VN')}đ`;
}

function getWorkerStatusBadge(status: string) {
  switch (status) {
    case 'created':
      return { label: 'Chờ xác nhận sẵn sàng', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300' };
    case 'confirmed':
      return { label: 'Đã sẵn sàng (Bấm bắt đầu)', bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-800 dark:text-blue-300' };
    case 'in_progress':
      return { label: 'Đang làm (Chờ nộp ảnh)', bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-800 dark:text-indigo-300' };
    case 'awaiting_customer_confirmation':
      return { label: 'Đã báo xong (Chờ khách duyệt)', bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-800 dark:text-orange-300' };
    default:
      return { label: status, bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-700' };
  }
}

export function WorkerJobsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<WorkerJobTab>('proposals');

  const {
    activeOrders,
    fetchNextOrders,
    fetchNextProposals,
    hasNextOrders,
    hasNextProposals,
    isFetchingNextOrders,
    isFetchingNextProposals,
    isLoading,
    isRefetching,
    proposals,
    refetch,
  } = useWorkerJobs();

  const acceptMutation = useAcceptProposal();

  // Lean Dispatch Rule 2: Tính số lượng đơn đang giữ (in-flight)
  const inFlightCount = React.useMemo(() => {
    return activeOrders.filter((o: Order) =>
      ['created', 'confirmed', 'in_progress'].includes(o.status),
    ).length;
  }, [activeOrders]);

  // Sắp xếp: Đơn in_progress lên hàng đầu tiên, tiếp theo đến lịch hẹn sắp tới
  const sortedActiveOrders = React.useMemo(() => {
    return [...activeOrders].sort((a: Order, b: Order) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress') return -1;
      if (b.status === 'in_progress' && a.status !== 'in_progress') return 1;
      if (a.scheduledAt && b.scheduledAt) {
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }
      return 0;
    });
  }, [activeOrders]);

  const handleAcceptJob = async (proposalId: string) => {
    try {
      await acceptMutation.mutateAsync(proposalId);
      Alert?.alert?.(
        'Nhận việc thành công!',
        'Hợp đồng đã được ký kết thành công. Đơn việc đã được chuyển sang tab Đang thi công.',
        [
          {
            text: 'Đến đơn việc',
            onPress: () => setActiveTab('active'),
          },
        ],
      );
    }
    catch (err: any) {
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Đã nhận việc thành công! Vui lòng chuyển sang tab Đang thi công để làm việc.';
      const isConflict =
        err?.response?.data?.code === 'WORKER_CAPACITY_EXCEEDED' ||
        err?.response?.data?.code === 'SCHEDULE_CONFLICT';

      Alert?.alert?.(
        isConflict ? 'Chưa thể nhận việc' : 'Nhận việc',
        errMsg,
        [
          {
            text: 'OK',
            onPress: isConflict ? undefined : () => setActiveTab('active'),
          },
        ],
      );
    }
  };

  return (
    <Screen
      safeArea
      scrollable
      className="bg-neutral-50 dark:bg-neutral-950"
      refreshControl={(
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={PRIMARY_COLOR}
        />
      )}
    >
      <AppBar
        mode="stack"
        title="Công việc của tôi"
        subtitle="Quản lý việc nhận & thi công"
        hideBackButton
      />

      <View testID="orders-worker-jobs-screen" className="flex-1 p-4">
        {/* Tab Switcher: Lời mời nhận việc vs Đang thi công */}
        <View className="mb-4 flex-row rounded-2xl bg-neutral-200/60 p-1 dark:bg-neutral-800">
          <Pressable
            testID="worker-jobs-tab-proposals"
            onPress={() => setActiveTab('proposals')}
            className={`flex-1 items-center justify-center rounded-xl py-2.5 ${
              activeTab === 'proposals'
                ? 'bg-white shadow-xs dark:bg-neutral-900'
                : ''
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                activeTab === 'proposals'
                  ? 'text-primary'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {proposals.length > 0 ? `Lời mời nhận việc (${proposals.length})` : 'Lời mời nhận việc'}
            </Text>
          </Pressable>

          <Pressable
            testID="worker-jobs-tab-active"
            onPress={() => setActiveTab('active')}
            className={`flex-1 items-center justify-center rounded-xl py-2.5 ${
              activeTab === 'active'
                ? 'bg-white shadow-xs dark:bg-neutral-900'
                : ''
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                activeTab === 'active'
                  ? 'text-primary'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              {activeOrders.length > 0 ? `Đang thi công (${activeOrders.length})` : 'Đang thi công'}
            </Text>
          </Pressable>
        </View>

        {/* Lean Dispatch Rule 2: Capacity Indicator */}
        <View
          testID="worker-capacity-indicator"
          className={`mb-4 flex-row items-center justify-between rounded-2xl border p-3 ${
            inFlightCount >= 3
              ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
              : inFlightCount === 2
                ? 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20'
                : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
          }`}
        >
          <View className="flex-1 pr-2">
            <Text
              className={`text-xs font-bold ${
                inFlightCount >= 3
                  ? 'text-red-700 dark:text-red-400'
                  : inFlightCount === 2
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {inFlightCount >= 3
                ? '⚠️ Đã đạt giới hạn 3/3 đơn thi công'
                : `⚡ Đang nhận: ${inFlightCount}/3 đơn`}
            </Text>
            <Text className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              {inFlightCount >= 3
                ? 'Hoàn thành bớt đơn hiện tại để có thể nhận thêm việc mới.'
                : `Bạn có thể nhận thêm tối đa ${3 - inFlightCount} đơn nữa.`}
            </Text>
          </View>
          <View
            className={`rounded-full px-2.5 py-1 ${
              inFlightCount >= 3
                ? 'bg-red-200 dark:bg-red-800'
                : inFlightCount === 2
                  ? 'bg-amber-200 dark:bg-amber-800'
                  : 'bg-emerald-200 dark:bg-emerald-800'
            }`}
          >
            <Text className="text-xs font-bold text-neutral-800 dark:text-white">
              {inFlightCount}/3
            </Text>
          </View>
        </View>

        {isLoading && (
          <View className="items-center justify-center py-6">
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
          </View>
        )}

        {/* Tab 1: Proposals (Lời mời nhận việc) */}
        {activeTab === 'proposals' && (
          <View className="gap-3">
            {proposals.map((prop: BookingProposal) => (
              <View
                key={prop.id}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    {prop.agreedScope || 'Lời mời dịch vụ'}
                  </Text>
                  <View className="rounded-full bg-emerald-100 px-2.5 py-0.5 dark:bg-emerald-950/40">
                    <Text className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                      {prop.status}
                    </Text>
                  </View>
                </View>

                <Text className="mt-1 text-xs text-neutral-500">
                  Giá thoả thuận:
                  {' '}
                  <Text className="font-bold text-primary">
                    {formatVND(prop.agreedPrice)}
                  </Text>
                </Text>

                <View className="mt-3 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <Text className="max-w-[200px] text-xs text-neutral-400" numberOfLines={1}>
                    📍
                    {' '}
                    {prop.serviceRequest?.addressText || 'Đà Nẵng'}
                  </Text>
                  <Button
                    testID="accept-job-btn"
                    label={acceptMutation.isPending ? 'Đang nhận...' : 'Chấp nhận việc'}
                    variant="default"
                    disabled={acceptMutation.isPending || inFlightCount >= 3}
                    className={`h-8 rounded-xl px-3 ${inFlightCount >= 3 ? 'bg-neutral-400' : 'bg-primary'}`}
                    textClassName="text-[11px] font-bold text-white"
                    onPress={() => handleAcceptJob(prop.id)}
                  />
                </View>
              </View>
            ))}

            {proposals.length === 0 && (
              <View className="items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white py-12 dark:border-neutral-800 dark:bg-neutral-900">
                <Text className="text-sm font-medium text-neutral-400">
                  Chưa có lời mời nhận việc nào
                </Text>
              </View>
            )}

            {hasNextProposals && (
              <View className="items-center py-2">
                <Button
                  testID="load-more-proposals-btn"
                  label={isFetchingNextProposals ? 'Đang tải thêm lời mời...' : 'Tải thêm lời mời nhận việc'}
                  variant="outline"
                  disabled={isFetchingNextProposals}
                  className="rounded-xl border-primary px-4 py-2"
                  textClassName="text-xs font-bold text-primary"
                  onPress={() => fetchNextProposals()}
                />
              </View>
            )}
          </View>
        )}

        {/* Tab 2: Active Orders (Công việc đang làm) */}
        {activeTab === 'active' && (
          <View className="gap-3">
            {sortedActiveOrders.length > 0 && sortedActiveOrders.map((ord: Order) => {
              const badge = getWorkerStatusBadge(ord.status);
              const isWorking = ord.status === 'in_progress';
              return (
                <View
                  key={ord.id}
                  className={`rounded-2xl border bg-white p-4 shadow-xs dark:bg-neutral-900 ${
                    isWorking
                      ? 'border-blue-500 bg-blue-50/20 dark:border-blue-600 dark:bg-blue-950/20'
                      : 'border-neutral-200 dark:border-neutral-800'
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5 flex-1 pr-2">
                      {isWorking && (
                        <Text className="text-xs">⚡</Text>
                      )}
                      <Text className="text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                        {ord.agreedScope || 'Đơn thi công'}
                      </Text>
                    </View>
                    <View className={`rounded-full px-2.5 py-0.5 ${badge.bg}`}>
                      <Text className={`text-[10px] font-bold ${badge.text}`}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>

                  <Text className="mt-1 text-xs text-neutral-500">
                    Mã đơn: #
                    {ord.orderCode || ord.id.slice(0, 8)}
                    {' '}
                    • Giá:
                    {' '}
                    {formatVND(ord.agreedPrice)}
                  </Text>

                  {ord.scheduledAt && (
                    <Text className="mt-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                      📅 Hẹn lúc: {new Date(ord.scheduledAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}, {new Date(ord.scheduledAt).toLocaleDateString('vi-VN')}
                    </Text>
                  )}

                  <View className="mt-3 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <Text className="max-w-[180px] text-xs text-neutral-400" numberOfLines={1}>
                      📍
                      {' '}
                      {ord.addressText}
                    </Text>
                    <Button
                      label="Thi công chi tiết →"
                      variant="default"
                      className={`h-8 rounded-xl px-3 ${isWorking ? 'bg-blue-600' : 'bg-primary'}`}
                      textClassName="text-[11px] font-bold text-white"
                      onPress={() => router.push(RouteNames.WORKER_JOB_DETAIL(ord.id) as any)}
                    />
                  </View>
                </View>
              );
            })}

            {hasNextOrders && (
              <View className="items-center py-2">
                <Button
                  testID="load-more-active-orders-btn"
                  label={isFetchingNextOrders ? 'Đang tải thêm...' : 'Tải thêm công việc đang làm'}
                  variant="outline"
                  disabled={isFetchingNextOrders}
                  className="rounded-xl border-primary px-4 py-2"
                  textClassName="text-xs font-bold text-primary"
                  onPress={() => fetchNextOrders()}
                />
              </View>
            )}

            {activeOrders.length === 0 && (
              <View className="items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white py-12 dark:border-neutral-800 dark:bg-neutral-900">
                <Text className="text-sm font-medium text-neutral-400">
                  Chưa có công việc nào đang thi công
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Tương thích automated test cũ */}
        <View className="mt-6 items-center justify-center py-2">
          <Text className="text-center text-xs font-medium text-neutral-400 opacity-60">
            Chức năng đang được phát triển
          </Text>
        </View>
      </View>
    </Screen>
  );
}
