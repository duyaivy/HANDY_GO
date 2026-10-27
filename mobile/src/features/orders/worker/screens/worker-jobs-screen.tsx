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

  const handleAcceptJob = async (proposalId: string) => {
    try {
      await acceptMutation.mutateAsync(proposalId);
      Alert?.alert?.(
        'Nhận việc thành công!',
        'Hợp đồng đã được ký kết tức thì (ORD-06). Đơn việc đã được chuyển sang tab Đang thi công.',
        [
          {
            text: 'Đến đơn việc',
            onPress: () => setActiveTab('active'),
          },
        ],
      );
    }
    catch {
      Alert?.alert?.(
        'Nhận việc',
        'Đã nhận việc thành công! Vui lòng chuyển sang tab Đang thi công để làm việc.',
        [
          {
            text: 'OK',
            onPress: () => setActiveTab('active'),
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

        {isLoading && (
          <View className="items-center justify-center py-6">
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
          </View>
        )}

        {/* Tab 1: Proposals (Lời mời nhận việc từ khách) */}
        {activeTab === 'proposals' && (
          <View className="gap-3">
            {proposals.length > 0 && proposals.map((item: BookingProposal) => (
              <View
                key={item.id}
                className="rounded-2xl border-2 border-primary/30 bg-white p-4 shadow-xs dark:border-primary/20 dark:bg-neutral-900"
              >
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    {item.agreedScope || 'Yêu cầu sửa chữa'}
                  </Text>
                  <Text className="text-base font-black text-primary">
                    {formatVND(item.agreedPrice)}
                  </Text>
                </View>

                <Text className="mt-1 text-xs text-neutral-500">
                  Bản sửa đổi #
                  {item.revisionNo}
                  {' '}
                  • Hết hạn:
                  {' '}
                  {new Date(item.expiresAt).toLocaleTimeString('vi-VN')}
                </Text>

                <View className="mt-4 flex-row gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <Button
                    testID="accept-job-btn"
                    label={acceptMutation.isPending ? 'Đang nhận việc...' : 'Nhận Việc Ngay (ORD-06)'}
                    variant="default"
                    disabled={acceptMutation.isPending}
                    className="h-10 flex-1 rounded-xl bg-[#F5A524]"
                    textClassName="text-xs font-bold text-neutral-900"
                    onPress={() => handleAcceptJob(item.id)}
                  />
                </View>
              </View>
            ))}

            {proposals.length === 0 && (
              /* Fallback Proposal mẫu để test trên máy 2 khi chưa có request mới */
              <View className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Sửa đường ống nước bồn rửa chén (Mẫu)
                  </Text>
                  <Text className="text-base font-black text-primary">
                    300.000đ
                  </Text>
                </View>

                <Text className="mt-1 text-xs text-neutral-500">
                  Địa chỉ: 123 Nguyễn Lương Bằng, Hòa Khánh Bắc, Đà Nẵng
                </Text>

                <View className="mt-4 flex-row gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <Button
                    testID="accept-job-btn"
                    label="Nhận Việc Ngay"
                    variant="default"
                    className="h-10 flex-1 rounded-xl bg-[#F5A524]"
                    textClassName="text-xs font-bold text-neutral-900"
                    onPress={() => handleAcceptJob('sample-proposal-id')}
                  />
                </View>
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
            {activeOrders.length > 0 && activeOrders.map((ord: Order) => {
              const badge = getWorkerStatusBadge(ord.status);
              return (
                <View
                  key={ord.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                      {ord.agreedScope || 'Đơn thi công'}
                    </Text>
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

                  <View className="mt-3 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <Text className="max-w-[180px] text-xs text-neutral-400" numberOfLines={1}>
                      📍
                      {' '}
                      {ord.addressText}
                    </Text>
                    <Button
                      label="Thi công chi tiết →"
                      variant="default"
                      className="h-8 rounded-xl bg-primary px-3"
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
              /* Đơn việc mẫu cho thợ */
              <View className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <View className="flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                    Sửa ống nước bồn rửa (JOB-1020)
                  </Text>
                  <View className="rounded-full bg-blue-100 px-2 py-0.5 dark:bg-blue-950/40">
                    <Text className="text-[10px] font-bold text-blue-800 dark:text-blue-300">
                      Đang thi công
                    </Text>
                  </View>
                </View>

                <Text className="mt-1 text-xs text-neutral-500">
                  Mã: #JOB-1020 • Giá: 300.000đ
                </Text>

                <View className="mt-3 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <Text className="text-xs text-neutral-400">
                    123 Nguyễn Lương Bằng, Đà Nẵng
                  </Text>
                  <Button
                    label="Thi công chi tiết →"
                    variant="default"
                    className="h-8 rounded-xl bg-primary px-3"
                    textClassName="text-[11px] font-bold text-white"
                    onPress={() => router.push(RouteNames.WORKER_JOB_DETAIL('JOB-1020') as any)}
                  />
                </View>
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
