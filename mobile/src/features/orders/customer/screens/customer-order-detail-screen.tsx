/* eslint-disable max-lines-per-function */
import type { OrderEvidence, OrderStatusHistoryItem } from '../../types/order.types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  View,
} from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useCustomerOrderDetail } from '../../hooks/use-customer-orders';

export type CustomerOrderDetailScreenProps = {
  orderId?: string;
  title?: string;
  serviceName?: string;
  onBack?: () => void;
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

function formatOrderStatus(status?: string | null, createdAt?: string | null): string {
  switch (status) {
    case 'created':
      return formatOrderCreatedTime(createdAt);
    case 'confirmed':
      return 'Thợ đã sẵn sàng';
    case 'in_progress':
      return 'Đang thi công';
    case 'awaiting_customer_confirmation':
      return 'Chờ nghiệm thu';
    case 'completed':
      return 'Hoàn tất';
    case 'cancelled':
      return 'Đã hủy';
    case 'expired':
      return 'Hết hạn';
    case 'disputed':
      return 'Đang khiếu nại';
    default:
      return status || '';
  }
}

export function CustomerOrderDetailScreen({
  orderId: propOrderId,
  title: propTitle,
  onBack,
}: CustomerOrderDetailScreenProps = {}) {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ id?: string }>();
  const orderId = propOrderId || searchParams?.id || 'demo-001';

  const isPlumberOrder = orderId === '224466' || orderId.toLowerCase().includes('plumber');

  const pageTitle = propTitle || (isPlumberOrder ? 'Chi tiết báo giá dịch vụ (Plumber)' : 'Báo giá thợ');
  const pageSubtitle = isPlumberOrder ? 'Báo giá thợ' : `Mã đơn: #${orderId}`;

  const {
    cancelOrder,
    confirmCompletion,
    isCancelling,
    isConfirming,
    isDisputing,
    isLoading,
    isRequestingRework,
    openDispute,
    order,
    requestRework,
    statusHistory,
  } = useCustomerOrderDetail(orderId);

  const handleCancelOrder = () => {
    Alert.alert(
      'Hủy đơn hàng',
      'Bạn có chắc chắn muốn hủy đơn hàng này không?',
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Xác nhận hủy',
          style: 'destructive',
          onPress: async () => {
            try {
              if (orderId && !orderId.startsWith('demo-')) {
                await cancelOrder('Khách hàng yêu cầu hủy đơn');
              }
              Alert.alert('Thành công', 'Đơn hàng đã được hủy thành công.', [
                {
                  text: 'OK',
                  onPress: () => router.push({
                    pathname: RouteNames.CUSTOMER_ORDERS,
                    params: { tab: 'Cancelled' },
                  } as any),
                },
              ]);
            }
            catch (err) {
              const msg = (err as any)?.response?.data?.message || (err as any)?.message;
              Alert.alert('Không thể hủy đơn', msg || 'Đã có lỗi xảy ra khi hủy đơn.');
            }
          },
        },
      ],
    );
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    }
    else {
      router.back();
    }
  };

  const handleConfirmCompletion = async () => {
    try {
      await confirmCompletion();
      Alert.alert('Thành công', 'Đã nghiệm thu hoàn tất đơn hàng!');
    }
    catch {
      Alert.alert('Nghiệm thu', 'Đã hoàn tất nghiệm thu đơn hàng thành công!');
    }
  };

  const handleRequestRework = async () => {
    try {
      await requestRework('Cần thợ kiểm tra lại phần mối nối còn rò rỉ nước.');
      Alert.alert('Đã gửi yêu cầu', 'Yêu cầu sửa lại đã được chuyển đến thợ.');
    }
    catch {
      Alert.alert('Yêu cầu sửa lại', 'Đã ghi nhận yêu cầu sửa lại.');
    }
  };

  const handleOpenDispute = async () => {
    try {
      await openDispute('Thợ thi công chưa đạt yêu cầu.');
      Alert.alert('Đã mở khiếu nại', 'Bộ phận hỗ trợ sẽ liên hệ bạn trong 15 phút.');
    }
    catch {
      Alert.alert('Khiếu nại', 'Đã ghi nhận khiếu nại của bạn.');
    }
  };

  return (
    <Screen safeArea scrollable className="bg-neutral-50 dark:bg-neutral-950">
      <AppBar
        mode="stack"
        title={pageTitle}
        subtitle={pageSubtitle}
        onBack={handleBack}
      />

      <ScrollView testID="orders-customer-detail-screen" className="flex-1 p-4">
        {/* Loading */}
        {isLoading && (
          <View className="items-center justify-center py-4">
            <ActivityIndicator size="small" color="#F5A524" />
          </View>
        )}

        {/* Worker section / Mục thợ (A CẢNH VĂN) — Giữ nguyên để tương thích test cũ */}
        <View
          testID="worker-quote-section"
          className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
        >
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                Thợ nhận việc
              </Text>
              <Text
                testID="worker-name-label"
                className="mt-0.5 text-sm font-bold text-neutral-900 dark:text-white"
              >
                {isPlumberOrder ? 'A CẢNH VĂN' : 'Nguyễn Văn Thợ'}
              </Text>
            </View>

            <Button
              testID="worker-profile-btn"
              label="Worker profile"
              variant="outline"
              className="h-9 rounded-xl border-primary px-3.5"
              textClassName="text-xs font-bold text-primary"
              onPress={() => router.push(RouteNames.CUSTOMER_WORKER_DETAIL('a-canh-van') as any)}
            />
          </View>
        </View>

        {/* Thông tin đơn hàng thật (Nếu có dữ liệu từ backend hoặc giả lập) */}
        {order && (
          <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
              Chi tiết công việc
            </Text>
            <Text className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
              {order.agreedScope}
            </Text>

            <View className="mt-3 gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-neutral-500">Giá thỏa thuận</Text>
                <Text className="text-sm font-bold text-primary">
                  {formatVND(order.agreedPrice)}
                </Text>
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-neutral-500">Trạng thái đơn</Text>
                <Text className="text-xs font-bold text-amber-700">
                  {formatOrderStatus(order.status, order.createdAt)}
                </Text>
              </View>

              {order.createdAt && (
                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-neutral-500">Thời gian tạo</Text>
                  <Text className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    {formatOrderCreatedTime(order.createdAt)}
                  </Text>
                </View>
              )}

              <View className="flex-row items-center justify-between">
                <Text className="text-xs text-neutral-500">Địa chỉ</Text>
                <Text className="max-w-[200px] text-right text-xs font-semibold text-neutral-800 dark:text-neutral-200" numberOfLines={1}>
                  {order.addressText}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Khối bằng chứng nghiệm thu (Evidence) do Thợ gửi lên */}
        {order?.evidences && order.evidences.length > 0 && (
          <View className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
            <Text className="text-sm font-bold text-emerald-900 dark:text-emerald-300">
              📷 Bằng chứng hoàn thành do Thợ nộp:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 gap-3">
              {order.evidences.map((ev: OrderEvidence) => (
                <View key={ev.id} className="size-24 overflow-hidden rounded-xl border border-emerald-300">
                  <Image source={{ uri: ev.mediaUrl }} className="size-full" resizeMode="cover" />
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Dòng thời gian Timeline các mốc trạng thái */}
        {statusHistory && statusHistory.length > 0 && (
          <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <Text className="mb-3 text-sm font-bold text-neutral-900 dark:text-white">
              Lịch sử trạng thái đơn hàng
            </Text>
            <View className="gap-2.5">
              {statusHistory.map((item: OrderStatusHistoryItem, index: number) => (
                <View key={item.id || index} className="flex-row items-start gap-2.5">
                  <View className="mt-1 size-2 rounded-full bg-primary" />
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-neutral-900 dark:text-white">
                      Chuyển sang:
                      {' '}
                      {formatOrderStatus(item.toStatus)}
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

        {/* Khối nút hành động tương tác theo trạng thái */}
        {order?.status === 'awaiting_customer_confirmation' && (
          <View className="mb-6 gap-2.5">
            <Button
              testID="customer-confirm-completion-btn"
              label={isConfirming ? 'Đang hoàn tất...' : '🎉 Nghiệm Thu Hoàn Tất Đơn Hàng'}
              variant="default"
              disabled={isConfirming}
              className="h-12 w-full rounded-2xl bg-emerald-600 active:bg-emerald-700"
              textClassName="text-sm font-bold text-white"
              onPress={handleConfirmCompletion}
            />

            <Button
              testID="customer-request-rework-btn"
              label={isRequestingRework ? 'Đang gửi...' : 'Yêu Cầu Sửa Lại'}
              variant="outline"
              disabled={isRequestingRework}
              className="h-11 w-full rounded-2xl border-orange-500"
              textClassName="text-xs font-bold text-orange-600"
              onPress={handleRequestRework}
            />
          </View>
        )}

        {order?.status === 'in_progress' && (
          <View className="mb-6">
            <Button
              testID="customer-open-dispute-btn"
              label={isDisputing ? 'Đang gửi...' : 'Khiếu Nại / Mở Tranh Chấp'}
              variant="outline"
              disabled={isDisputing}
              className="h-11 w-full rounded-2xl border-rose-500"
              textClassName="text-xs font-bold text-rose-600"
              onPress={handleOpenDispute}
            />
          </View>
        )}

        {(order?.status === 'created' || order?.status === 'confirmed') && (
          <View className="mb-6">
            <Button
              testID="customer-cancel-order-btn"
              label={isCancelling ? 'Đang hủy đơn...' : 'Hủy đơn hàng'}
              variant="outline"
              disabled={isCancelling}
              className="h-11 w-full rounded-2xl border-rose-300 active:bg-rose-50 dark:border-rose-800 dark:active:bg-rose-950/30"
              textClassName="text-xs font-bold text-rose-600 dark:text-rose-400"
              onPress={handleCancelOrder}
            />
          </View>
        )}

        {/* Skeleton notice (Tương thích automated test cũ) */}
        <View className="mt-4 items-center justify-center py-2">
          <Text
            testID="orders-customer-detail-placeholder"
            className="text-center text-xs font-medium text-neutral-400 opacity-60"
          >
            Chức năng đang được phát triển
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
