import type { OrderStatus } from '../types/order.types';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  Alert,
  Image,
  Pressable,
  View,
} from 'react-native';
import { ChatIcon, StarIcon, UserIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import {
  buildConversationHref,
  canInitiateConversation,
  resolveConversationErrorMessage,
  resolveConversationForContext,
} from '@/features/chat/resolve-conversation';
import { useAuthStore } from '@/stores/use-auth-store';

export type OrderWorkerCardProps = {
  workerId?: string;
  workerName?: string;
  avatarUrl?: string;
  rating?: number;
  completedJobs?: number;
  completionRate?: number;
  headline?: string;
  orderId?: string;
  requestId?: string;
  bidId?: string | null;
  orderStatus?: OrderStatus;
};

export function OrderWorkerCard({
  workerId,
  workerName = 'Thợ phụ trách',
  avatarUrl,
  rating,
  completedJobs,
  completionRate,
  headline = 'Thợ chuyên nghiệp HandyGo',
  orderId,
  requestId,
  bidId,
}: OrderWorkerCardProps) {
  const router = useRouter();
  const authUserId = useAuthStore(state => (state.isAuthenticated ? state.user?.id : null));
  const [chatPending, setChatPending] = React.useState(false);
  const chatOpeningRef = React.useRef(false);

  const canChat = Boolean(
    authUserId
    && canInitiateConversation({ workerId, orderId, requestId, bidId }),
  );
  const chatDisabled = !canChat || chatPending;

  const handleChat = async () => {
    if (chatDisabled || chatOpeningRef.current) {
      return;
    }
    chatOpeningRef.current = true;
    setChatPending(true);
    try {
      const conversation = await resolveConversationForContext({
        workerId,
        workerName,
        orderId,
        requestId,
        bidId,
      });
      router.push(buildConversationHref(conversation, workerName));
    }
    catch (error) {
      Alert.alert('Chưa thể nhắn tin', resolveConversationErrorMessage(error));
    }
    finally {
      chatOpeningRef.current = false;
      setChatPending(false);
    }
  };

  const handleViewProfile = () => {
    if (!workerId) {
      return;
    }
    const contextParams = {
      ...(orderId ? { orderId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(bidId ? { bidId } : {}),
    };
    if (Object.keys(contextParams).length > 0) {
      router.push({
        pathname: RouteNames.CUSTOMER_WORKER_DETAIL(workerId) as any,
        params: contextParams,
      });
      return;
    }
    router.push(RouteNames.CUSTOMER_WORKER_DETAIL(workerId) as any);
  };

  const hasRating = typeof rating === 'number' && !Number.isNaN(rating) && rating > 0;
  const hasStats = (typeof completionRate === 'number' && completionRate > 0)
    || (typeof completedJobs === 'number' && completedJobs > 0);

  return (
    <View
      testID="worker-quote-section"
      className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
          Thợ phụ trách thực hiện
        </Text>
        {hasRating
          ? (
              <View className="flex-row items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 dark:bg-amber-950/40">
                <StarIcon size={12} color="#F59E0B" fill="#F59E0B" />
                <Text className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  {rating!.toFixed(1)}
                </Text>
              </View>
            )
          : (
              <View className="rounded-full bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                <Text className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  Chưa có đánh giá
                </Text>
              </View>
            )}
      </View>

      <View className="mt-3 flex-row items-center gap-3">
        {/* Worker Avatar */}
        <View className="relative size-14 overflow-hidden rounded-full border-2 border-primary/20 bg-neutral-100 dark:bg-neutral-800">
          {avatarUrl
            ? (
                <Image
                  source={{ uri: avatarUrl }}
                  className="size-full"
                  resizeMode="cover"
                />
              )
            : (
                <View className="size-full items-center justify-center bg-primary/10">
                  <UserIcon size={28} color="#F5A524" />
                </View>
              )}
        </View>

        {/* Worker Info */}
        <View className="flex-1 justify-center">
          <Text
            testID="worker-name-label"
            className="text-base font-bold text-neutral-900 dark:text-white"
            numberOfLines={1}
          >
            {workerName}
          </Text>
          <Text className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
            {headline}
          </Text>
          {hasStats
            ? (
                <Text className="mt-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  {typeof completionRate === 'number' && completionRate > 0 ? `${completionRate}% hoàn thành` : ''}
                  {typeof completionRate === 'number' && completionRate > 0 && typeof completedJobs === 'number' && completedJobs > 0 ? ' • ' : ''}
                  {typeof completedJobs === 'number' && completedJobs > 0 ? `${completedJobs} đơn thành công` : ''}
                </Text>
              )
            : (
                <Text className="mt-0.5 text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
                  Chưa có dữ liệu đơn
                </Text>
              )}
        </View>
      </View>

      {/* Action Buttons Row: Nhắn tin, Xem hồ sơ */}
      <View className="mt-4 flex-row items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <Pressable
          testID="worker-chat-btn"
          accessibilityRole="button"
          accessibilityLabel="Nhắn tin cho thợ"
          accessibilityState={{ disabled: chatDisabled }}
          disabled={chatDisabled}
          onPress={() => {
            void handleChat();
          }}
          className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border ${
            chatDisabled
              ? 'border-neutral-200 bg-neutral-100 opacity-50 dark:border-neutral-800 dark:bg-neutral-900'
              : 'border-indigo-200 bg-indigo-50/80 active:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:active:bg-indigo-900/60'
          }`}
        >
          <ChatIcon size={16} color={chatDisabled ? '#9CA3AF' : '#4F46E5'} />
          <Text className={`text-xs font-bold ${chatDisabled ? 'text-neutral-400 dark:text-neutral-500' : 'text-indigo-700 dark:text-indigo-300'}`}>
            {chatPending ? 'Đang mở...' : 'Nhắn tin'}
          </Text>
        </Pressable>

        <Pressable
          testID="worker-profile-btn"
          accessibilityRole="button"
          accessibilityLabel="Xem hồ sơ thợ"
          disabled={!workerId}
          onPress={handleViewProfile}
          className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border ${
            workerId
              ? 'border-primary bg-amber-50/40 active:bg-amber-100 dark:bg-amber-950/20'
              : 'border-neutral-200 bg-neutral-100 opacity-60 dark:border-neutral-800 dark:bg-neutral-900'
          }`}
        >
          <UserIcon size={16} color={workerId ? '#D97706' : '#9CA3AF'} />
          <Text className={`text-xs font-bold ${workerId ? 'text-primary' : 'text-neutral-400'}`}>
            Xem hồ sơ
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
