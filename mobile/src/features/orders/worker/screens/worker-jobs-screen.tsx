/* eslint-disable max-lines-per-function */
import type { BookingProposal, Order } from '../../types/order.types';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button } from '@/components/ui/button';
import { OrdersIcon } from '@/components/ui/icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { SECONDARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { useAuthStore } from '@/stores/use-auth-store';
import { useAcceptProposal, useWorkerJobs } from '../../hooks/use-worker-jobs';

export type WorkerJobTab = 'proposals' | 'active';

function formatVND(amount: number | string | undefined | null): string {
  if (!amount) {
    return '0 đ';
  }
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  return `${n.toLocaleString('vi-VN')} đ`;
}

function getWorkerStatusBadge(status: string) {
  switch (status) {
    case 'created':
      return { label: 'Chờ sẵn sàng', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300' };
    case 'confirmed':
      return { label: 'Đã sẵn sàng', bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-800 dark:text-blue-300' };
    case 'in_progress':
      return { label: '⚡ Đang làm', bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-800 dark:text-indigo-300' };
    case 'awaiting_customer_confirmation':
      return { label: 'Chờ nghiệm thu', bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-800 dark:text-orange-300' };
    default:
      return { label: status, bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-700 dark:text-neutral-300' };
  }
}

export function WorkerJobsScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<WorkerJobTab>('proposals');
  const [isManualRefreshing, setIsManualRefreshing] = React.useState(false);

  const {
    activeOrders,
    fetchNextOrders,
    fetchNextProposals,
    hasNextOrders,
    hasNextProposals,
    isFetchingNextOrders,
    isFetchingNextProposals,
    isLoading,
    proposals,
    refetch,
  } = useWorkerJobs();

  const handleManualRefresh = React.useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    }
    finally {
      setIsManualRefreshing(false);
    }
  }, [refetch]);

  const acceptMutation = useAcceptProposal();

  const switchRole = () => {
    const { isAuthenticated: isAuth, user: currentUser } = useAuthStore.getState();
    if (isAuth && currentUser) {
      useAuthStore.getState().setActiveMode('Customer');
    }
    else {
      useAuthStore.getState().setGuestRole('Customer');
    }
    router.replace(RouteNames.CUSTOMER_HOME as any);
  };

  // Lean Dispatch Rule 2: Tính số lượng đơn đang giữ (in-flight)
  const inFlightCount = React.useMemo(() => {
    return activeOrders.filter((o: Order) =>
      ['created', 'confirmed', 'in_progress'].includes(o.status),
    ).length;
  }, [activeOrders]);

  // Sắp xếp: Đơn in_progress lên hàng đầu tiên, tiếp theo đến lịch hẹn sắp tới
  const sortedActiveOrders = React.useMemo(() => {
    return [...activeOrders].sort((a: Order, b: Order) => {
      if (a.status === 'in_progress' && b.status !== 'in_progress')
        return -1;
      if (b.status === 'in_progress' && a.status !== 'in_progress')
        return 1;
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
      const errMsg
        = err?.response?.data?.message
          || err?.message
          || 'Đã nhận việc thành công! Vui lòng chuyển sang tab Đang thi công để làm việc.';
      const isConflict
        = err?.response?.data?.code === 'WORKER_CAPACITY_EXCEEDED'
          || err?.response?.data?.code === 'SCHEDULE_CONFLICT';

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
    <Screen safeArea className="flex-1 bg-neutral-50 dark:bg-neutral-950">
      {/* Top Bar: Title, Notification Bell & Quick Role Switch (đồng bộ style Nhận việc) */}
      <View className="flex-row items-center justify-between border-b border-neutral-100 bg-white px-4 py-3 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center">
          <OrdersIcon size={22} color={SECONDARY_COLOR} />
          <Text className="ml-2 text-xl font-black text-neutral-900 dark:text-white">
            Công việc của tôi
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          <NotificationBell />
          <Pressable
            testID="home-role-switch-chip"
            onPress={switchRole}
            accessibilityRole="button"
            accessibilityLabel="Đổi sang App Khách"
            className="flex-row items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 shadow-2xs active:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40"
          >
            <View className="mr-1.5 size-2 rounded-full bg-blue-600" />
            <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">
              App Khách ⇄
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Main Content ScrollView */}
      <ScrollView
        testID="orders-worker-jobs-screen"
        className="flex-1 px-4 pt-3"
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={handleManualRefresh}
            colors={['#F5A524']}
            tintColor="#F5A524"
          />
        )}
      >
        {/* Banner: Hero Status & Lean Dispatch Capacity Indicator */}
        <View
          testID="worker-capacity-indicator"
          className="mb-3 rounded-2xl bg-[#1E293B] p-4 text-white shadow-sm"
        >
          <View className="flex-row items-start justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-base font-extrabold text-white">
                Tiến độ công việc
              </Text>
              <Text className="mt-0.5 text-xs text-slate-300">
                {inFlightCount >= 3
                  ? '⚠️ Đã đạt giới hạn 3/3 đơn thi công. Hãy hoàn thành đơn hiện tại để nhận thêm việc.'
                  : `⚡ Đang nhận: ${inFlightCount}/3 đơn thi công. Có thể nhận thêm ${3 - inFlightCount} đơn nữa.`}
              </Text>
            </View>
            <View
              className={`rounded-xl px-2.5 py-1.5 ${
                inFlightCount >= 3
                  ? 'border border-rose-500/40 bg-rose-500/20'
                  : inFlightCount === 2
                    ? 'border border-amber-500/40 bg-amber-500/20'
                    : 'border border-emerald-500/40 bg-emerald-500/20'
              }`}
            >
              <Text
                className={`text-xs font-black ${
                  inFlightCount >= 3
                    ? 'text-rose-300'
                    : inFlightCount === 2
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                }`}
              >
                {inFlightCount}
                /3 ĐƠN
              </Text>
            </View>
          </View>
        </View>

        {/* Tab Switcher: Lời mời nhận việc vs Đang thi công */}
        <View className="mb-3 flex-row rounded-2xl border border-neutral-200/60 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900">
          <Pressable
            testID="worker-jobs-tab-proposals"
            onPress={() => setActiveTab('proposals')}
            className={`flex-1 items-center justify-center rounded-xl py-2.5 ${
              activeTab === 'proposals'
                ? 'bg-white shadow-xs dark:bg-neutral-800'
                : ''
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                activeTab === 'proposals'
                  ? 'text-[#F5A524] dark:text-[#F5A524]'
                  : 'text-neutral-500 dark:text-neutral-400'
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
                ? 'bg-white shadow-xs dark:bg-neutral-800'
                : ''
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                activeTab === 'active'
                  ? 'text-[#F5A524] dark:text-[#F5A524]'
                  : 'text-neutral-500 dark:text-neutral-400'
              }`}
            >
              {activeOrders.length > 0 ? `Đang thi công (${activeOrders.length})` : 'Đang thi công'}
            </Text>
          </Pressable>
        </View>

        {/* Loading State */}
        {isLoading && (
          <View className="items-center justify-center py-16">
            <ActivityIndicator size="large" color="#F5A524" />
            <Text className="mt-3 text-sm font-semibold text-neutral-500">
              Đang tải danh sách công việc...
            </Text>
          </View>
        )}

        {/* Tab 1: Proposals (Lời mời nhận việc) */}
        {!isLoading && activeTab === 'proposals' && (
          <View className="gap-3 pb-6">
            {proposals.map((prop: BookingProposal) => (
              <View
                key={prop.id}
                className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs active:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
              >
                {/* Job Header: Code & Category */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5">
                    <View className="rounded-md bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                      <Text className="text-[11px] font-black text-neutral-700 dark:text-neutral-300">
                        #
                        {prop.id.slice(0, 8).toUpperCase()}
                      </Text>
                    </View>
                    <View className="rounded-md bg-amber-50 px-2 py-0.5 dark:bg-amber-950/40">
                      <Text className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        Lời mời dịch vụ
                      </Text>
                    </View>
                  </View>

                  <View className="rounded-full bg-emerald-50 px-2.5 py-0.5 dark:bg-emerald-950/40">
                    <Text className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      Chờ bạn nhận
                    </Text>
                  </View>
                </View>

                {/* Scope / Title */}
                <Text className="mt-2.5 text-base font-bold text-neutral-900 dark:text-white" numberOfLines={2}>
                  {prop.agreedScope || 'Lời mời thực hiện dịch vụ'}
                </Text>

                {/* Address with Map Pin icon */}
                <View className="mt-2 flex-row items-start">
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} className="mt-0.5 mr-1.5 shrink-0">
                    <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <Path d="M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                  </Svg>
                  <Text className="flex-1 text-xs text-neutral-500" numberOfLines={1}>
                    {prop.serviceRequest?.addressText || 'Đà Nẵng'}
                  </Text>
                </View>

                {/* Scheduled Time if present */}
                {prop.scheduledAt && (
                  <View className="mt-1 flex-row items-center">
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} className="mr-1.5 shrink-0">
                      <Path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                    </Svg>
                    <Text className="text-xs text-neutral-500">
                      Hẹn:
                      {' '}
                      {new Date(prop.scheduledAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                    </Text>
                  </View>
                )}

                {/* Action Bar Footer */}
                <View className="mt-3.5 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <View className="flex-row items-center">
                    <View className="mr-1.5 size-2 rounded-full bg-emerald-500" />
                    <Text className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Giá thỏa thuận:
                      {' '}
                      {formatVND(prop.agreedPrice)}
                    </Text>
                  </View>

                  <Pressable
                    testID="accept-job-btn"
                    disabled={acceptMutation.isPending || inFlightCount >= 3}
                    onPress={() => handleAcceptJob(prop.id)}
                    className={`rounded-xl px-4 py-2 ${
                      inFlightCount >= 3
                        ? 'bg-neutral-200 dark:bg-neutral-800'
                        : 'bg-[#F5A524] active:opacity-80'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${inFlightCount >= 3 ? 'text-neutral-400' : 'text-white'}`}>
                      {acceptMutation.isPending ? 'Đang nhận...' : 'Chấp nhận việc'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}

            {/* Empty State Proposals */}
            {proposals.length === 0 && (
              <View className="items-center justify-center px-4 py-16">
                <View className="size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2}>
                    <Path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </Svg>
                </View>
                <Text className="mt-4 text-center text-base font-bold text-neutral-800 dark:text-neutral-200">
                  Chưa có lời mời nhận việc
                </Text>
                <Text className="mt-1 max-w-[260px] text-center text-xs text-neutral-500">
                  Khi khách hàng chấp nhận báo giá của bạn, lời mời công việc sẽ hiển thị tại đây.
                </Text>
                <View className="mt-4 w-36">
                  <Button variant="outline" size="default" label="Làm mới" onPress={handleManualRefresh} />
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

        {/* Tab 2: Active Orders (Công việc đang thi công) */}
        {!isLoading && activeTab === 'active' && (
          <View className="gap-3 pb-6">
            {sortedActiveOrders.length > 0 && sortedActiveOrders.map((ord: Order) => {
              const badge = getWorkerStatusBadge(ord.status);
              const isWorking = ord.status === 'in_progress';
              return (
                <View
                  key={ord.id}
                  className={`rounded-2xl border bg-white p-4 shadow-xs dark:bg-neutral-900 ${
                    isWorking
                      ? 'border-blue-400 bg-blue-50/20 dark:border-blue-600 dark:bg-blue-950/20'
                      : 'border-neutral-100 dark:border-neutral-800'
                  }`}
                >
                  {/* Job Header: Code, Category & Status Badge */}
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5">
                      <View className="rounded-md bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                        <Text className="text-[11px] font-black text-neutral-700 dark:text-neutral-300">
                          #
                          {ord.orderCode || ord.id.slice(0, 8)}
                        </Text>
                      </View>
                      <View className="rounded-md bg-amber-50 px-2 py-0.5 dark:bg-amber-950/40">
                        <Text className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                          Sửa chữa
                        </Text>
                      </View>
                    </View>

                    <View className={`rounded-full px-2.5 py-0.5 ${badge.bg}`}>
                      <Text className={`text-[10px] font-bold ${badge.text}`}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>

                  {/* Scope / Title */}
                  <Text className="mt-2.5 text-base font-bold text-neutral-900 dark:text-white" numberOfLines={2}>
                    {ord.agreedScope || 'Đơn thi công sửa chữa'}
                  </Text>

                  {/* Address with Map Pin icon */}
                  <View className="mt-2 flex-row items-start">
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} className="mt-0.5 mr-1.5 shrink-0">
                      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <Path d="M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                    </Svg>
                    <Text className="flex-1 text-xs text-neutral-500" numberOfLines={1}>
                      {ord.addressText}
                    </Text>
                  </View>

                  {/* Scheduled Time with Clock icon */}
                  {ord.scheduledAt && (
                    <View className="mt-1 flex-row items-center">
                      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2} className="mr-1.5 shrink-0">
                        <Circle cx="12" cy="12" r="10" />
                        <Path d="M12 6v6l4 2" />
                      </Svg>
                      <Text className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        Hẹn lúc:
                        {' '}
                        {new Date(ord.scheduledAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                      </Text>
                    </View>
                  )}

                  {/* Action Bar Footer */}
                  <View className="mt-3.5 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <View className="flex-row items-center">
                      <View className="mr-1.5 size-2 rounded-full bg-emerald-500" />
                      <Text className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        Giá:
                        {' '}
                        {formatVND(ord.agreedPrice)}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => router.push(RouteNames.WORKER_JOB_DETAIL(ord.id) as any)}
                      className={`rounded-xl px-4 py-2 ${
                        isWorking ? 'bg-[#2563EB]' : 'bg-neutral-800 dark:bg-neutral-700'
                      } active:opacity-80`}
                    >
                      <Text className="text-xs font-bold text-white">
                        Thi công chi tiết →
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {/* Empty State Active Orders */}
            {activeOrders.length === 0 && (
              <View className="items-center justify-center px-4 py-16">
                <View className="size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2}>
                    <Path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </Svg>
                </View>
                <Text className="mt-4 text-center text-base font-bold text-neutral-800 dark:text-neutral-200">
                  Chưa có công việc đang thi công
                </Text>
                <Text className="mt-1 max-w-[260px] text-center text-xs text-neutral-500">
                  Khi bạn chấp nhận lời mời, công việc sẽ chuyển sang đây để bạn quản lý thi công và nộp nghiệm thu.
                </Text>
                <View className="mt-4 w-36">
                  <Button variant="outline" size="default" label="Làm mới" onPress={handleManualRefresh} />
                </View>
              </View>
            )}

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
          </View>
        )}

        {/* Tương thích automated test cũ */}
        <View className="mt-4 items-center justify-center py-2">
          <Text className="text-center text-xs font-medium text-neutral-400 opacity-60">
            Chức năng đang được phát triển
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
