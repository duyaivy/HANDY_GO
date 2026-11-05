import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  Alert,
  Image,
  Linking,
  Pressable,
  View,
} from 'react-native';
import { Button } from '@/components/ui/button';
import { ChatIcon, PhoneIcon, StarIcon, UserIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';

export type OrderWorkerCardProps = {
  workerId?: string;
  workerName?: string;
  avatarUrl?: string;
  phoneNumber?: string;
  rating?: number;
  completedJobs?: number;
  headline?: string;
};

export function OrderWorkerCard({
  workerId,
  workerName = 'Thợ phụ trách',
  avatarUrl,
  phoneNumber = '0901234567',
  rating = 5.0,
  completedJobs = 120,
  headline = 'Thợ chuyên nghiệp HandyGo',
}: OrderWorkerCardProps) {
  const router = useRouter();

  const handleCall = () => {
    if (!phoneNumber) {
      Alert.alert('Thông báo', 'Thợ chưa cập nhật số điện thoại.');
      return;
    }
    const cleanPhone = phoneNumber.replace(/[^0-9+]/g, '');
    const url = `tel:${cleanPhone}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        }
        Alert.alert('Không thể gọi', `Thiết bị không hỗ trợ cuộc gọi tới số: ${phoneNumber}`);
      })
      .catch(() => {
        Alert.alert('Lỗi', `Không thể kết nối cuộc gọi tới số: ${phoneNumber}`);
      });
  };

  const handleChat = () => {
    router.push({
      pathname: RouteNames.CUSTOMER_CHAT as any,
      params: workerId ? { workerId, workerName } : undefined,
    });
  };

  const handleViewProfile = () => {
    if (workerId) {
      router.push(RouteNames.CUSTOMER_WORKER_DETAIL(workerId) as any);
    }
  };

  return (
    <View
      testID="worker-quote-section"
      className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
          Thợ phụ trách thực hiện
        </Text>
        <View className="flex-row items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 dark:bg-amber-950/40">
          <StarIcon size={12} color="#F59E0B" fill="#F59E0B" />
          <Text className="text-xs font-bold text-amber-700 dark:text-amber-400">
            {rating.toFixed(1)}
          </Text>
        </View>
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
          <Text className="mt-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            98% hoàn thành •
            {' '}
            {completedJobs}
            {' '}
            đơn thành công
          </Text>
        </View>
      </View>

      {/* Action Buttons Row: Gọi điện, Nhắn tin, Xem hồ sơ */}
      <View className="mt-4 flex-row items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Gọi điện cho thợ"
          onPress={handleCall}
          className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/80 active:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:active:bg-blue-900/60"
        >
          <PhoneIcon size={16} color="#2563EB" />
          <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">
            Gọi điện
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nhắn tin cho thợ"
          onPress={handleChat}
          className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 active:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:active:bg-indigo-900/60"
        >
          <ChatIcon size={16} color="#4F46E5" />
          <Text className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
            Nhắn tin
          </Text>
        </Pressable>

        <Button
          testID="worker-profile-btn"
          label="Worker profile"
          variant="outline"
          className="h-10 flex-1 rounded-xl border-primary bg-amber-50/40 active:bg-amber-100 dark:bg-amber-950/20"
          textClassName="text-xs font-bold text-primary"
          disabled={!workerId}
          onPress={handleViewProfile}
        />
      </View>
    </View>
  );
}
