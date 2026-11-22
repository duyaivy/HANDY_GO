import type { Order } from '../../types/order.types';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { CheckCircleIcon, ClockIcon, CloseIcon, OrdersIcon } from '@/components/ui/icons/handy-icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { SECONDARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { KNOWN_SERVICES_BY_ID, resolveServiceName } from '@/constants/services';
import { useWorkerJobHistory, type WorkerJobHistoryTab } from '../../hooks/use-worker-job-history';

export type WorkerJobHistoryScreenProps = {
  testID?: string;
};

const TABS: Array<{ id: WorkerJobHistoryTab; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'completed', label: 'Hoàn thành' },
  { id: 'cancelled', label: 'Đã hủy' },
];

function formatVND(amount: number | string | undefined | null): string {
  if (!amount) {
    return '0 đ';
  }
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  return `${n.toLocaleString('vi-VN')} đ`;
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) {
    return 'Không rõ thời gian';
  }
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
      return 'Không rõ thời gian';
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${hh}:${min} - ${dd}/${mm}/${yyyy}`;
  } catch {
    return 'Không rõ thời gian';
  }
}

function getJobServiceTitle(order: Order): string {
  if (order.serviceId && KNOWN_SERVICES_BY_ID[order.serviceId]) {
    return KNOWN_SERVICES_BY_ID[order.serviceId];
  }
  if (order.agreedScope && order.agreedScope.trim()) {
    return resolveServiceName(null, order.agreedScope, null);
  }
  return 'Công việc dịch vụ';
}

export function WorkerJobHistoryScreen({
  testID = 'worker-job-history-screen',
}: WorkerJobHistoryScreenProps = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = React.useState<WorkerJobHistoryTab>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isManualRefreshing, setIsManualRefreshing] = React.useState(false);

  const {
    orders,
    stats,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useWorkerJobHistory(activeTab);

  // Search filter across jobs
  const searchedOrders = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return orders;
    }
    return orders.filter((job) => {
      const title = getJobServiceTitle(job).toLowerCase();
      const code = (job.orderCode || job.id).toLowerCase();
      const scope = (job.agreedScope || '').toLowerCase();
      const addr = (job.addressText || '').toLowerCase();
      return title.includes(q) || code.includes(q) || scope.includes(q) || addr.includes(q);
    });
  }, [orders, searchQuery]);

  const handleManualRefresh = React.useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsManualRefreshing(false);
    }
  }, [refetch]);

  const handleScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
      // Trigger infinite scroll load more when within 80px of bottom
      const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 80;
      if (isCloseToBottom && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  const isErrorState = !isLoading && isError && orders.length === 0;
  const isEmpty = !isLoading && !isError && !searchQuery.trim() && orders.length === 0;
  const isSearchEmpty = !isLoading && searchQuery.trim().length > 0 && searchedOrders.length === 0;

  return (
    <Screen
      safeArea
      className="bg-neutral-50 dark:bg-neutral-950"
    >
      <AppBar
        mode="stack"
        title="Lịch sử công việc"
        testID="worker-job-history-app-bar"
      />

      <ScrollView
        testID="worker-history-scroll-view"
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, 16) + 40,
        }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={handleManualRefresh}
            tintColor={SECONDARY_COLOR}
            colors={[SECONDARY_COLOR]}
          />
        }
      >
        <View testID={testID} className="flex-1 p-4">
        {/* Search Bar */}
        <View className="mb-4 flex-row items-center rounded-2xl border border-neutral-200 bg-white px-3.5 py-2.5 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} className="mr-2">
            <Circle cx="11" cy="11" r="8" />
            <Path d="m21 21-4.3-4.3" />
          </Svg>
          <TextInput
            testID="worker-history-search-input"
            placeholder="Tìm theo dịch vụ, mã đơn, địa chỉ..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
            className="flex-1 text-xs text-neutral-900 dark:text-white"
          />
          {searchQuery.length > 0 && (
            <Pressable testID="worker-clear-search-btn" onPress={() => setSearchQuery('')} className="p-1">
              <CloseIcon size={14} color="#9CA3AF" />
            </Pressable>
          )}
        </View>

        {/* Statistics Overview Card */}
        <View className="mb-4 rounded-3xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <View className="flex-row items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <View className="flex-1 pr-2">
              <Text className="text-xs font-bold tracking-wider text-neutral-400 uppercase">
                Tổng quan hiệu suất
              </Text>
              <Text className="mt-1 text-xl font-black text-emerald-600 dark:text-emerald-400">
                {formatVND(stats.totalEarnings)}
              </Text>
              <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Tổng thu nhập từ đơn hoàn thành
              </Text>
            </View>
            <View className="size-11 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40">
              <CheckCircleIcon color="#059669" size={24} />
            </View>
          </View>

          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center pr-2">
              <View className="mr-2.5 size-8 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/40">
                <OrdersIcon color="#2563EB" size={16} />
              </View>
              <View className="flex-1">
                <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">Hoàn thành</Text>
                <Text testID="worker-history-completed-count" className="text-sm font-bold text-neutral-900 dark:text-white">
                  {stats.completedCount} việc
                </Text>
              </View>
            </View>

            <View className="h-8 w-px bg-neutral-100 dark:bg-neutral-800" />

            <View className="flex-1 flex-row items-center pl-3">
              <View className="mr-2.5 size-8 items-center justify-center rounded-xl bg-neutral-100 dark:bg-neutral-800">
                <ClockIcon color="#6B7280" size={16} />
              </View>
              <View className="flex-1">
                <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">Đã hủy</Text>
                <Text testID="worker-history-cancelled-count" className="text-sm font-bold text-neutral-700 dark:text-neutral-300">
                  {stats.cancelledCount} việc
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Tab Filters */}
        <View className="mb-4 flex-row rounded-2xl bg-neutral-200/60 p-1 dark:bg-neutral-800">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                testID={`worker-history-tab-${tab.id}`}
                onPress={() => setActiveTab(tab.id)}
                className={`flex-1 items-center justify-center rounded-xl py-2 ${
                  isActive ? 'bg-white shadow-xs dark:bg-neutral-900' : ''
                }`}
              >
                <Text
                  className={`text-xs ${
                    isActive
                      ? 'font-bold text-neutral-900 dark:text-white'
                      : 'font-medium text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Loading state */}
        {isLoading && (
          <View className="items-center justify-center py-12">
            <ActivityIndicator size="small" color={SECONDARY_COLOR} />
            <Text className="mt-2 text-xs text-neutral-500">Đang tải lịch sử công việc...</Text>
          </View>
        )}

        {/* Error state */}
        {isErrorState && (
          <View testID="worker-history-error-state" className="items-center justify-center py-16">
            <View className="mb-4 size-16 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950/40">
              <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Circle cx="12" cy="12" r="10" />
                <Path d="M12 8v4M12 16h.01" />
              </Svg>
            </View>
            <Text className="text-base font-bold text-neutral-900 dark:text-white">
              Không thể tải dữ liệu
            </Text>
            <Text className="mt-1 max-w-[280px] text-center text-xs text-neutral-500 dark:text-neutral-400">
              Đã có sự cố khi kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.
            </Text>
            <Button
              testID="worker-history-retry-btn"
              label="Thử lại"
              className="mt-6 h-10 flex-row items-center rounded-2xl bg-[#F5A524] px-6"
              textClassName="text-xs font-bold text-white"
              onPress={handleManualRefresh}
            />
          </View>
        )}

        {/* Search results count */}
        {searchQuery.trim().length > 0 && !isSearchEmpty && !isLoading && !isErrorState && (
          <Text testID="worker-search-results-count" className="mb-3 text-xs font-medium text-neutral-500 dark:text-neutral-400">
            Tìm thấy {searchedOrders.length} công việc phù hợp
          </Text>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View testID="worker-history-empty-state" className="items-center justify-center py-16">
            <View className="mb-4 size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <OrdersIcon color="#9CA3AF" size={32} />
            </View>
            <Text className="text-base font-bold text-neutral-900 dark:text-white">
              Chưa có công việc nào
            </Text>
            <Text className="mt-1 text-center text-xs text-neutral-500 dark:text-neutral-400">
              {activeTab === 'completed'
                ? 'Bạn chưa có công việc hoàn thành nào trong danh sách.'
                : activeTab === 'cancelled'
                  ? 'Bạn không có công việc nào bị hủy.'
                  : 'Các công việc bạn đã nhận và kết thúc sẽ được lưu lại tại đây.'}
            </Text>
            <Button
              testID="worker-history-find-jobs-btn"
              label="Xem việc mới ngay"
              className="mt-6 h-11 rounded-2xl bg-[#F5A524] px-6"
              textClassName="text-sm font-bold text-white"
              onPress={() => router.push(RouteNames.WORKER_JOBS as any)}
            />
          </View>
        )}

        {/* Empty state when search produces no results */}
        {isSearchEmpty && (
          <View testID="worker-search-empty-state" className="items-center justify-center py-16">
            <View className="mb-4 size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <OrdersIcon color="#9CA3AF" size={32} />
            </View>
            <Text className="text-base font-bold text-neutral-900 dark:text-white">
              Không tìm thấy kết quả
            </Text>
            <Text className="mt-1 text-center text-xs text-neutral-500 dark:text-neutral-400">
              {`Không tìm thấy công việc nào khớp với "${searchQuery}".`}
            </Text>
            <Button
              testID="worker-clear-search-result-btn"
              label="Xóa bộ lọc tìm kiếm"
              variant="outline"
              className="mt-6 h-10 rounded-2xl border-neutral-300 px-6 dark:border-neutral-700"
              textClassName="text-xs font-semibold text-neutral-700 dark:text-neutral-200"
              onPress={() => setSearchQuery('')}
            />
          </View>
        )}

        {/* Jobs list */}
        {!isLoading && searchedOrders.length > 0 && (
          <View className="gap-3">
            {searchedOrders.map((job: Order) => {
              const isCompleted = job.status === 'completed';
              const isCancelled = job.status === 'cancelled';
              const badge = isCompleted
                ? { label: 'Hoàn thành', bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-300' }
                : isCancelled
                  ? { label: 'Đã hủy', bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400' }
                  : { label: 'Khiếu nại', bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-800 dark:text-rose-300' };

              return (
                <View
                  key={job.id}
                  testID={`worker-history-card-${job.id}`}
                  className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                      {getJobServiceTitle(job)}
                    </Text>
                    <View className={`shrink-0 rounded-full px-2.5 py-0.5 ${badge.bg}`}>
                      <Text className={`text-[10px] font-bold ${badge.text}`}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>

                  <Text className="mt-1 text-xs text-neutral-500">
                    Mã đơn: #{job.orderCode || job.id.slice(0, 8)}
                  </Text>

                  {/* Address */}
                  <View className="mt-2 flex-row items-start">
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} className="mt-0.5 mr-1 shrink-0">
                      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <Path d="M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                    </Svg>
                    <Text className="flex-1 text-xs text-neutral-400" numberOfLines={1}>
                      {job.addressText || 'Đà Nẵng'}
                    </Text>
                  </View>

                  <Text className="mt-1 text-xs text-neutral-400">
                    {isCompleted ? 'Hoàn thành lúc: ' : 'Thời gian: '}
                    {formatDate(job.completedAt || job.cancelledAt || job.updatedAt || job.createdAt)}
                  </Text>

                  {isCancelled && job.cancelReason ? (
                    <Text className="mt-1 text-xs text-rose-500 dark:text-rose-400" numberOfLines={2}>
                      Lý do hủy: {job.cancelReason}
                    </Text>
                  ) : null}

                  {job.status === 'disputed' && job.disputeReason ? (
                    <Text className="mt-1 text-xs text-rose-500 dark:text-rose-400" numberOfLines={2}>
                      Lý do khiếu nại: {job.disputeReason}
                    </Text>
                  ) : null}

                  {/* Footer */}
                  <View className="mt-3.5 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <View>
                      <Text className="text-[10px] text-neutral-400 uppercase">
                        {isCompleted ? 'Tiền công nhận' : 'Giá thỏa thuận'}
                      </Text>
                      <Text
                        className={`text-sm font-bold ${
                          isCompleted
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-neutral-500 dark:text-neutral-400'
                        }`}
                      >
                        {formatVND(job.agreedPrice)}
                      </Text>
                    </View>

                    <Button
                      testID={`worker-job-detail-btn-${job.id}`}
                      label="Xem chi tiết"
                      variant="outline"
                      className="h-8 rounded-xl border-neutral-300 px-3.5 dark:border-neutral-700"
                      textClassName="text-xs font-semibold text-neutral-700 dark:text-neutral-200"
                      onPress={() => router.push(RouteNames.WORKER_JOB_DETAIL(job.id) as any)}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Auto infinite loading indicator */}
        {isFetchingNextPage && (
          <View testID="worker-history-loading-more-indicator" className="mt-4 mb-6 flex-row items-center justify-center gap-2 py-3">
            <ActivityIndicator size="small" color={SECONDARY_COLOR} />
            <Text className="text-xs font-medium text-neutral-500">Đang tải thêm công việc...</Text>
          </View>
        )}

        {/* Fallback load more button */}
        {hasNextPage && !isFetchingNextPage && (
          <View className="mt-4 mb-6 items-center">
            <Button
              testID="worker-history-load-more-btn"
              label="Xem thêm"
              variant="outline"
              className="h-10 rounded-xl border-neutral-300 px-6 dark:border-neutral-700"
              textClassName="text-xs font-semibold text-neutral-600 dark:text-neutral-300"
              onPress={() => fetchNextPage()}
            />
          </View>
        )}
      </View>
    </ScrollView>
  </Screen>
  );
}

