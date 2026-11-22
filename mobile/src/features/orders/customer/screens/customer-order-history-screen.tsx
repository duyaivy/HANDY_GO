import type { Order, ServiceRequest } from '../../types/order.types';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { ClockIcon, OrdersIcon } from '@/components/ui/icons/handy-icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PRIMARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { KNOWN_SERVICES_BY_ID, resolveServiceName } from '@/constants/services';
import { useCustomerOrders } from '../../hooks/use-customer-orders';

export type CustomerHistoryTab = 'all' | 'completed' | 'cancelled';

const HISTORY_TABS: Array<{ id: CustomerHistoryTab; label: string }> = [
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

function getOrderServiceTitle(order: Order): string {
  if (order.serviceId && KNOWN_SERVICES_BY_ID[order.serviceId]) {
    return KNOWN_SERVICES_BY_ID[order.serviceId];
  }
  if (order.agreedScope && order.agreedScope.trim()) {
    return resolveServiceName(null, order.agreedScope, null);
  }
  return 'Dịch vụ tiện ích';
}

function getRequestServiceTitle(req: ServiceRequest): string {
  if (req.serviceId && KNOWN_SERVICES_BY_ID[req.serviceId]) {
    return KNOWN_SERVICES_BY_ID[req.serviceId];
  }
  if (req.description && req.description.trim()) {
    return resolveServiceName(null, req.description, null);
  }
  return 'Dịch vụ tiện ích';
}

export type CustomerOrderHistoryScreenProps = {
  testID?: string;
};

export function CustomerOrderHistoryScreen({
  testID = 'customer-history-screen',
}: CustomerOrderHistoryScreenProps = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = React.useState<CustomerHistoryTab>('all');
  const [isManualRefreshing, setIsManualRefreshing] = React.useState(false);

  // Map our UI tab to the hook tab
  const hookTab = React.useMemo(() => {
    switch (activeTab) {
      case 'completed':
        return 'Finished';
      case 'cancelled':
        return 'Cancelled';
      case 'all':
      default:
        return 'All';
    }
  }, [activeTab]);

  const {
    orders,
    requests,
    isLoading,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useCustomerOrders(hookTab);

  // Filter items based on tab for history view
  const filteredOrders = React.useMemo(() => {
    if (activeTab === 'completed') {
      return orders.filter((o) => o.status === 'completed');
    }
    if (activeTab === 'cancelled') {
      return orders.filter((o) => o.status === 'cancelled');
    }
    // 'all' in history view shows completed and cancelled
    return orders.filter((o) => o.status === 'completed' || o.status === 'cancelled' || o.status === 'disputed');
  }, [orders, activeTab]);

  const filteredRequests = React.useMemo(() => {
    if (activeTab === 'completed') {
      return [];
    }
    return requests.filter((r) => r.status === 'cancelled' || r.status === 'expired');
  }, [requests, activeTab]);

  const totalCompletedCount = React.useMemo(() => {
    return orders.filter((o) => o.status === 'completed').length;
  }, [orders]);

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

  const isEmpty = !isLoading && filteredOrders.length === 0 && filteredRequests.length === 0;

  return (
    <Screen
      safeArea
      className="bg-neutral-50 dark:bg-neutral-950"
    >
      <AppBar
        mode="stack"
        title="Lịch sử đơn hàng"
        testID="order-history-app-bar"
      />

      <ScrollView
        testID="customer-history-scroll-view"
        className="flex-1"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, 16) + 40,
        }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        refreshControl={
          <RefreshControl
            refreshing={isManualRefreshing}
            onRefresh={handleManualRefresh}
            tintColor={PRIMARY_COLOR}
          />
        }
      >
        <View testID={testID} className="flex-1 p-4">
        {/* Quick summary banner */}
        <View className="mb-4 flex-row items-center justify-between rounded-2xl bg-primary/10 p-4 dark:bg-primary/20">
          <View className="flex-row items-center">
            <View className="mr-3 size-10 items-center justify-center rounded-xl bg-primary/20 dark:bg-primary/30">
              <ClockIcon color={PRIMARY_COLOR} size={22} />
            </View>
            <View>
              <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                Tổng đơn hoàn thành
              </Text>
              <Text className="text-base font-bold text-neutral-900 dark:text-white">
                {totalCompletedCount} dịch vụ
              </Text>
            </View>
          </View>
          <Button
            label="Đặt mới"
            variant="outline"
            className="h-8 rounded-xl border-primary px-3"
            textClassName="text-xs font-bold text-primary"
            onPress={() => router.push(RouteNames.CUSTOMER_HOME as any)}
          />
        </View>

        {/* Tab Filters */}
        <View className="mb-4 flex-row rounded-2xl bg-neutral-200/60 p-1 dark:bg-neutral-800">
          {HISTORY_TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Pressable
                key={tab.id}
                testID={`history-tab-${tab.id}`}
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
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
            <Text className="mt-2 text-xs text-neutral-500">Đang tải lịch sử đơn hàng...</Text>
          </View>
        )}

        {/* Empty state */}
        {isEmpty && (
          <View testID="history-empty-state" className="items-center justify-center py-16">
            <View className="mb-4 size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <OrdersIcon color="#9CA3AF" size={32} />
            </View>
            <Text className="text-base font-bold text-neutral-900 dark:text-white">
              Chưa có đơn hàng nào
            </Text>
            <Text className="mt-1 text-center text-xs text-neutral-500 dark:text-neutral-400">
              {activeTab === 'completed'
                ? 'Bạn chưa hoàn thành đơn dịch vụ nào.'
                : activeTab === 'cancelled'
                  ? 'Bạn không có đơn dịch vụ nào bị hủy.'
                  : 'Các dịch vụ bạn đã sử dụng sẽ được lưu lại tại đây.'}
            </Text>
            <Button
              testID="history-book-now-btn"
              label="Khám phá dịch vụ ngay"
              className="mt-6 h-11 rounded-2xl bg-primary px-6"
              textClassName="text-sm font-bold text-white"
              onPress={() => router.push(RouteNames.CUSTOMER_HOME as any)}
            />
          </View>
        )}

        {/* Orders list */}
        {!isLoading && filteredOrders.length > 0 && (
          <View className="gap-3">
            {filteredOrders.map((order: Order) => {
              const isCompleted = order.status === 'completed';
              const isCancelled = order.status === 'cancelled';
              const badge = isCompleted
                ? { label: 'Hoàn thành', bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-300' }
                : isCancelled
                  ? { label: 'Đã hủy', bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400' }
                  : { label: 'Khiếu nại', bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-800 dark:text-rose-300' };

              return (
                <View
                  key={order.id}
                  testID={`history-order-card-${order.id}`}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                      {getOrderServiceTitle(order)}
                    </Text>
                    <View className={`shrink-0 rounded-full px-2.5 py-0.5 ${badge.bg}`}>
                      <Text className={`text-[10px] font-bold ${badge.text}`}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>

                  <Text className="mt-1 text-xs text-neutral-500">
                    Mã đơn: #{order.orderCode || order.id.slice(0, 8)}
                  </Text>

                  <Text className="mt-0.5 text-xs text-neutral-400">
                    {isCompleted ? 'Hoàn thành lúc: ' : 'Thời gian: '}
                    {formatDate(order.completedAt || order.updatedAt || order.createdAt)}
                  </Text>

                  <View className="mt-3 flex-row items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <View>
                      <Text className="text-[10px] text-neutral-400 uppercase">Chi phí</Text>
                      <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                        {formatVND(order.agreedPrice)}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-2">
                      <Button
                        testID={`view-detail-btn-${order.id}`}
                        label="Chi tiết"
                        variant="outline"
                        className="h-8 rounded-xl border-neutral-300 px-3 dark:border-neutral-700"
                        textClassName="text-xs font-semibold text-neutral-700 dark:text-neutral-200"
                        onPress={() => router.push(RouteNames.CUSTOMER_ORDER_DETAIL(order.id) as any)}
                      />
                      <Button
                        testID={`rebook-btn-${order.id}`}
                        label="Đặt lại"
                        className="h-8 rounded-xl bg-primary px-3"
                        textClassName="text-xs font-bold text-white"
                        onPress={() => {
                          if (order.serviceId) {
                            router.push({
                              pathname: RouteNames.CUSTOMER_BOOKING as any,
                              params: { serviceId: order.serviceId },
                            });
                          } else {
                            router.push(RouteNames.CUSTOMER_BOOKING as any);
                          }
                        }}
                      />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Cancelled Service Requests list */}
        {!isLoading && filteredRequests.length > 0 && (
          <View className="mt-4 gap-3">
            <Text className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
              Yêu cầu tìm thợ đã hủy ({filteredRequests.length})
            </Text>
            {filteredRequests.map((req: ServiceRequest) => (
              <View
                key={req.id}
                testID={`history-request-card-${req.id}`}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
              >
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="flex-1 text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                    {getRequestServiceTitle(req)}
                  </Text>
                  <View className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 dark:bg-neutral-800">
                    <Text className="text-[10px] font-bold text-neutral-600 dark:text-neutral-400">
                      Đã hủy
                    </Text>
                  </View>
                </View>

                <Text className="mt-1 text-xs text-neutral-500">
                  Mã yêu cầu: #{req.requestCode || req.id.slice(0, 8)}
                </Text>

                <Text className="mt-0.5 text-xs text-rose-500">
                  Hủy lúc: {formatDate(req.cancelledAt || req.updatedAt)}
                </Text>

                <View className="mt-3 flex-row items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                  <Text className="flex-1 text-xs text-neutral-400" numberOfLines={1}>
                    {req.addressText || 'Đà Nẵng'}
                  </Text>
                  <Button
                    label="Đặt lại"
                    className="h-8 rounded-xl bg-primary px-3"
                    textClassName="text-xs font-bold text-white"
                    onPress={() => {
                      if (req.serviceId) {
                        router.push({
                          pathname: RouteNames.CUSTOMER_BOOKING as any,
                          params: { serviceId: req.serviceId },
                        });
                      } else {
                        router.push(RouteNames.CUSTOMER_BOOKING as any);
                      }
                    }}
                  />
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Auto infinite loading indicator */}
        {isFetchingNextPage && (
          <View testID="history-loading-more-indicator" className="mt-4 mb-6 flex-row items-center justify-center gap-2 py-3">
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
            <Text className="text-xs font-medium text-neutral-500">Đang tải thêm đơn hàng...</Text>
          </View>
        )}

        {/* Fallback load more button */}
        {hasNextPage && !isFetchingNextPage && (
          <View className="mt-4 mb-6 items-center">
            <Button
              testID="history-load-more-btn"
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
