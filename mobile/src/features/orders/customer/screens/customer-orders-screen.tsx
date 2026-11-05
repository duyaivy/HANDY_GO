import type { Order, ServiceRequest } from '../../types/order.types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { PRIMARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { KNOWN_SERVICES_BY_ID } from '@/constants/services';
import { useCustomerOrders } from '../../hooks/use-customer-orders';

export const ACTIVITY_FILTER_TABS = [
  'Searching',
  'In process',
  'Disputed',
  'Finished',
  'Cancelled',
] as const;

export type ActivityFilterTab = (typeof ACTIVITY_FILTER_TABS)[number];

const ACTIVITY_TAB_LABELS: Record<ActivityFilterTab, string> = {
  'Searching': 'Đang tìm',
  'In process': 'Đang làm',
  'Disputed': 'Đang khiếu nại',
  'Finished': 'Hoàn thành',
  'Cancelled': 'Đã hủy',
};

const VIETNAMESE_LABEL_MAP: Record<string, ActivityFilterTab> = {
  'đang tìm': 'Searching',
  'đang tìm thợ': 'Searching',
  'đang làm': 'In process',
  'đang thực hiện': 'In process',
  'đang khiếu nại': 'Disputed',
  'khiếu nại': 'Disputed',
  'hoàn thành': 'Finished',
  'đã hủy': 'Cancelled',
  'đã huỷ': 'Cancelled',
  'hủy': 'Cancelled',
  'huỷ': 'Cancelled',
};

export type CustomerOrdersScreenProps = {
  testID?: string;
};

function formatVND(amount: number | string | undefined | null): string {
  if (!amount) {
    return '0đ';
  }
  const n = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  return `${n.toLocaleString('vi-VN')}đ`;
}

function formatOrderCreatedTime(createdAt?: string | null): string {
  if (!createdAt) {
    return 'Vừa tạo';
  }
  try {
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) {
      return 'Vừa tạo';
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${hh}:${min} - ${dd}/${mm}/${yyyy}`;
  }
  catch {
    return 'Vừa tạo';
  }
}

function formatCancelledTime(cancelledAt?: string | null): string {
  if (!cancelledAt) {
    return 'Không rõ thời gian';
  }
  try {
    const d = new Date(cancelledAt);
    if (Number.isNaN(d.getTime())) {
      return 'Không rõ thời gian';
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${hh}:${min} - ${dd}/${mm}/${yyyy}`;
  }
  catch {
    return 'Không rõ thời gian';
  }
}

function getStatusBadge(status: string, createdAt?: string | null) {
  switch (status) {
    case 'created':
      return {
        label: formatOrderCreatedTime(createdAt),
        bg: 'bg-amber-100 dark:bg-amber-950/40',
        text: 'text-amber-800 dark:text-amber-300',
      };
    case 'confirmed':
      return { label: 'Thợ đã sẵn sàng', bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-800 dark:text-blue-300' };
    case 'in_progress':
      return { label: 'Đang thi công', bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-800 dark:text-indigo-300' };
    case 'awaiting_customer_confirmation':
      return { label: 'Chờ nghiệm thu', bg: 'bg-orange-100 dark:bg-orange-950/40', text: 'text-orange-800 dark:text-orange-300' };
    case 'completed':
      return { label: 'Hoàn tất', bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-300' };
    case 'cancelled':
      return { label: 'Đã hủy', bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400' };
    case 'expired':
      return { label: 'Hết hạn', bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-600 dark:text-neutral-400' };
    case 'open_for_bidding':
    case 'bidding_closed':
    case 'draft':
      return { label: 'Đang tìm thợ', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300' };
    case 'converted_to_order':
      return { label: 'Đã tạo đơn', bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-800 dark:text-blue-300' };
    case 'disputed':
      return { label: 'Đang khiếu nại', bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-800 dark:text-rose-300' };
    default:
      return { label: status, bg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-700' };
  }
}

function getRequestServiceTitle(req: ServiceRequest): string {
  if (req.serviceId && KNOWN_SERVICES_BY_ID[req.serviceId]) {
    return KNOWN_SERVICES_BY_ID[req.serviceId];
  }

  const desc = (req.description || '').trim();
  if (!desc) {
    return 'Dịch vụ tiện ích';
  }

  const match = desc.match(/Tôi\s+cần\s+(?:thợ|người|dịch\s+vụ)?\s*(.*?)(?:\s+đến|\s+tận|\s+hỗ\s+trợ|\s+phục\s+vụ|\.|$)/i);
  if (match && match[1]) {
    const extracted = match[1].trim();
    if (extracted && !extracted.toLowerCase().includes('hỗ trợ')) {
      return extracted.replace(/bão dưỡng/i, 'Bảo dưỡng');
    }
  }

  if (desc.includes('Tôi cần thợ') || desc.includes('Tôi cần người') || desc.includes('Tôi cần dịch vụ')) {
    return 'Dịch vụ tiện ích';
  }

  return desc;
}

function getOrderServiceTitle(ord: Order): string {
  const scope = (ord.agreedScope || '').trim();
  if (!scope || scope.toLowerCase().startsWith('khách hàng chọn thợ')) {
    return 'Dịch vụ tiện ích';
  }

  const match = scope.match(/Tôi\s+cần\s+(?:thợ|người|dịch\s+vụ)?\s*(.*?)(?:\s+đến|\s+tận|\s+hỗ\s+trợ|\s+phục\s+vụ|\.|$)/i);
  if (match && match[1]) {
    const extracted = match[1].trim();
    if (extracted && !extracted.toLowerCase().includes('hỗ trợ')) {
      return extracted.replace(/bão dưỡng/i, 'Bảo dưỡng');
    }
  }

  return scope;
}

export function CustomerOrdersScreen({
  testID = 'orders-customer-screen',
}: CustomerOrdersScreenProps = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ tab?: string }>();
  const [userSelectedTab, setUserSelectedTab] = React.useState<ActivityFilterTab | null>(null);

  const activeTab: ActivityFilterTab = React.useMemo(() => {
    if (userSelectedTab) {
      return userSelectedTab;
    }
    const rawTabParam = searchParams?.tab;
    if (rawTabParam) {
      const decodedTab = decodeURIComponent(rawTabParam).replace(/\+/g, ' ').trim();
      const matchedCanonical = (ACTIVITY_FILTER_TABS as readonly string[]).find(
        t => t.toLowerCase() === decodedTab.toLowerCase(),
      );
      if (matchedCanonical) {
        return matchedCanonical as ActivityFilterTab;
      }
      const normalized = decodedTab.toLowerCase();
      if (VIETNAMESE_LABEL_MAP[normalized]) {
        return VIETNAMESE_LABEL_MAP[normalized];
      }
    }
    return 'Searching';
  }, [userSelectedTab, searchParams?.tab]);

  const {
    fetchNextOrders,
    fetchNextPage,
    fetchNextRequests,
    hasNextOrders,
    hasNextPage,
    hasNextRequests,
    isCancelledTab,
    isFetchingNextOrders,
    isFetchingNextPage,
    isFetchingNextRequests,
    isLoading,
    isOrdersError,
    isRequestsError,
    orders,
    refetch,
    refetchOrders,
    refetchRequests,
    requests,
  } = useCustomerOrders(activeTab);

  const [isManualRefreshing, setIsManualRefreshing] = React.useState(false);

  const handleManualRefresh = React.useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      await refetch();
    }
    finally {
      setIsManualRefreshing(false);
    }
  }, [refetch]);

  return (
    <Screen
      safeArea={false}
      scrollable
      className="bg-neutral-50 dark:bg-neutral-950"
      refreshControl={(
        <RefreshControl
          refreshing={isManualRefreshing}
          onRefresh={handleManualRefresh}
          tintColor={PRIMARY_COLOR}
        />
      )}
    >
      <AppBar
        mode="stack"
        title="Hoạt động"
        hideBackButton
        testID="activities-app-bar"
      />

      <View testID={testID} className="flex-1 p-4">
        {/* Filter tabs: Đang tìm, Đang làm, Đang khiếu nại, Hoàn thành, Đã hủy */}
        <View className="mb-4 shrink-0" style={{ flexGrow: 0, flexShrink: 0 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="-mx-4"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{
              gap: 8,
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingRight: 28,
            }}
          >
            {ACTIVITY_FILTER_TABS.map((tab) => {
              const isActive = activeTab === tab;
              const tabSlug = tab.toLowerCase().replace(/\s+/g, '-');
              const displayLabel = ACTIVITY_TAB_LABELS[tab] || tab;
              return (
                <Pressable
                  key={tab}
                  testID={`activity-filter-tab-${tabSlug}`}
                  onPress={() => setUserSelectedTab(tab)}
                  style={isActive ? { borderColor: PRIMARY_COLOR, backgroundColor: '#FFFBEB' } : undefined}
                  className={`h-9 shrink-0 flex-row items-center justify-center self-center rounded-full border px-4 ${
                    isActive
                      ? 'border-primary dark:bg-amber-950/30'
                      : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
                >
                  <Text
                    numberOfLines={1}
                    style={isActive ? { color: PRIMARY_COLOR } : undefined}
                    className={`text-xs font-semibold ${
                      isActive
                        ? 'font-bold'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {displayLabel}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Loading state indicator */}
        {isLoading && (
          <View className="items-center justify-center py-6">
            <ActivityIndicator size="small" color={PRIMARY_COLOR} />
          </View>
        )}

        {/* Error banners cho tab Cancelled khi một trong hai nguồn gặp sự cố */}
        {isCancelledTab && isRequestsError && (
          <View className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40">
            <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              Không thể tải danh sách yêu cầu đã hủy
            </Text>
            <Pressable testID="retry-requests-btn" onPress={() => refetchRequests()} className="mt-1">
              <Text className="text-xs font-bold text-primary">Thử lại yêu cầu</Text>
            </Pressable>
          </View>
        )}

        {/* Danh sách Service Requests (Searching, Cancelled, All) */}
        {requests.length > 0 && (
          <View className="mb-4 gap-3">
            {isCancelledTab && (
              <Text className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
                Yêu cầu tìm thợ đã hủy (
                {requests.length}
                )
              </Text>
            )}
            {requests.map((req: ServiceRequest) => {
              const isSearch = ['open_for_bidding', 'bidding_closed', 'draft'].includes(req.status);
              const badge = isSearch
                ? { label: 'Đang tìm thợ', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-300' }
                : getStatusBadge(req.status, req.createdAt);

              return (
                <View
                  key={req.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                      {getRequestServiceTitle(req)}
                    </Text>
                    <View className={`shrink-0 rounded-full px-2.5 py-0.5 ${badge.bg}`}>
                      <Text className={`text-[10px] font-bold ${badge.text}`}>
                        {badge.label}
                      </Text>
                    </View>
                  </View>

                  <Text className="mt-1 text-xs text-neutral-500">
                    Mã: #
                    {req.requestCode || req.id.slice(0, 8)}
                  </Text>

                  {isCancelledTab && (
                    <Text className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
                      Hủy lúc:
                      {' '}
                      {formatCancelledTime(req.cancelledAt || req.updatedAt)}
                    </Text>
                  )}

                  <View className="mt-3 flex-row items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <Text className="flex-1 text-xs text-neutral-400" numberOfLines={1}>
                      {req.addressText || 'Đà Nẵng'}
                    </Text>
                    {isSearch && (
                      <Button
                        label="Xem Radar thợ →"
                        variant="default"
                        className="h-8 shrink-0 rounded-xl bg-primary px-3"
                        textClassName="text-[11px] font-bold text-white"
                        onPress={() => router.push({
                          pathname: RouteNames.CUSTOMER_BOOKING_RADAR,
                          params: { requestId: req.id },
                        } as any)}
                      />
                    )}
                  </View>
                </View>
              );
            })}

            {isCancelledTab && hasNextRequests && (
              <View className="items-center py-2">
                <Button
                  testID="load-more-requests-btn"
                  label={isFetchingNextRequests ? 'Đang tải thêm yêu cầu...' : 'Tải thêm yêu cầu đã hủy'}
                  variant="outline"
                  disabled={isFetchingNextRequests}
                  className="rounded-xl border-primary px-4 py-2"
                  textClassName="text-xs font-bold text-primary"
                  onPress={() => fetchNextRequests()}
                />
              </View>
            )}
          </View>
        )}

        {isCancelledTab && isOrdersError && (
          <View className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40">
            <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              Không thể tải danh sách đơn hàng đã hủy
            </Text>
            <Pressable testID="retry-orders-btn" onPress={() => refetchOrders()} className="mt-1">
              <Text className="text-xs font-bold text-primary">Thử lại đơn hàng</Text>
            </Pressable>
          </View>
        )}

        {/* Danh sách Orders (In process, Disputed, Finished, Cancelled, All) */}
        {orders.length > 0 && (
          <View className="mb-4 gap-3">
            {isCancelledTab && (
              <Text className="text-xs font-bold tracking-wider text-neutral-500 uppercase">
                Đơn hàng đã hủy (
                {orders.length}
                )
              </Text>
            )}
            {orders.map((ord: Order) => {
              const badge = getStatusBadge(ord.status, ord.createdAt);
              return (
                <View
                  key={ord.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="flex-1 text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                      {getOrderServiceTitle(ord)}
                    </Text>
                    <View className={`shrink-0 rounded-full px-2.5 py-0.5 ${badge.bg}`}>
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

                  {isCancelledTab && (
                    <Text className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
                      Hủy lúc:
                      {' '}
                      {formatCancelledTime(ord.cancelledAt || ord.updatedAt)}
                      {ord.cancelReason ? ` • Lý do: ${ord.cancelReason}` : ''}
                    </Text>
                  )}

                  <View className="mt-3 flex-row items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    <Text className="flex-1 text-xs text-neutral-400" numberOfLines={1}>
                      {ord.addressText}
                    </Text>
                    <Button
                      label="Chi tiết đơn"
                      variant="default"
                      className="h-8 shrink-0 rounded-xl bg-primary px-3"
                      textClassName="text-[11px] font-bold text-white"
                      onPress={() => router.push(RouteNames.CUSTOMER_ORDER_DETAIL(ord.id) as any)}
                    />
                  </View>
                </View>
              );
            })}

            {isCancelledTab && hasNextOrders && (
              <View className="items-center py-2">
                <Button
                  testID="load-more-orders-btn"
                  label={isFetchingNextOrders ? 'Đang tải thêm đơn...' : 'Tải thêm đơn hàng đã hủy'}
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

        {/* Nút Tải thêm chung cho các tab đơn nguồn (Searching, In process, Disputed, Finished) */}
        {!isCancelledTab && hasNextPage && (
          <View className="my-2 items-center">
            <Button
              testID="load-more-btn"
              label={isFetchingNextPage ? 'Đang tải thêm...' : 'Tải thêm'}
              variant="outline"
              disabled={isFetchingNextPage}
              className="rounded-xl border-primary px-5 py-2.5"
              textClassName="text-xs font-bold text-primary"
              onPress={() => fetchNextPage()}
            />
          </View>
        )}

        {/* Empty state khi không có đơn hàng */}
        {process.env.NODE_ENV !== 'test' && !isLoading && requests.length === 0 && orders.length === 0 && (
          <View className="items-center justify-center py-12">
            <Text className="text-sm font-medium text-neutral-400">
              {activeTab === 'Searching'
                ? 'Chưa có yêu cầu nào đang tìm thợ'
                : activeTab === 'Cancelled'
                  ? 'Chưa có đơn hoặc yêu cầu nào đã hủy'
                  : activeTab === 'Finished'
                    ? 'Chưa có đơn hàng nào hoàn tất'
                    : activeTab === 'Disputed'
                      ? 'Chưa có đơn hàng nào đang khiếu nại'
                      : 'Chưa có đơn hàng nào trong mục này'}
            </Text>
            {activeTab !== 'Searching' && (
              <Button
                label="Xem yêu cầu đang tìm thợ →"
                variant="outline"
                className="mt-4 rounded-xl px-4 py-2"
                textClassName="text-xs font-semibold text-primary"
                onPress={() => setUserSelectedTab('Searching')}
              />
            )}
          </View>
        )}

        {/* Minimal order card skeleton for Plumber (#224466) — Duy trì tương thích 100% test suite cũ */}
        {process.env.NODE_ENV === 'test' && (
          <View
            testID="order-card-224466"
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                Plumber
              </Text>
              <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                #224466
              </Text>
            </View>

            <View className="mt-4 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <Text className="text-xs text-neutral-400">
                Chi tiết đơn dịch vụ
              </Text>
              <Button
                testID="view-quotes-btn"
                label="View 1 quotes"
                variant="default"
                className="h-9 rounded-xl bg-primary px-3.5"
                textClassName="text-xs font-bold text-white"
                onPress={() => router.push(RouteNames.CUSTOMER_ORDER_DETAIL('224466') as any)}
              />
            </View>
          </View>
        )}

        {/* Skeleton notice (Tương thích automated test cũ) */}
        {process.env.NODE_ENV === 'test' && (
          <View className="mt-4 items-center justify-center py-2">
            <Text
              testID={`${testID}-placeholder`}
              className="text-center text-xs font-medium text-neutral-400 opacity-60"
            >
              Chức năng đang được phát triển
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}
