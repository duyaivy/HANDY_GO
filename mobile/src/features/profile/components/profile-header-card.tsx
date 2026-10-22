/* eslint-disable max-lines-per-function */
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { UserIcon, WrenchIcon } from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { AppSwitchCard } from './app-switch-card';

export type ProfileHeaderCardProps = {
  mode: 'Customer' | 'Worker';
  fullName?: string | null;
  avatarUrl?: string | null;
  phone?: string | null;
  roles?: string[];
  workerStatus?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSwitch?: (targetMode: 'Customer' | 'Worker') => void;
  onPressUserCard?: () => void;
  onPressSwitchArrow?: () => void;
};

export function ProfileHeaderCard({
  mode,
  fullName,
  avatarUrl,
  phone,
  roles = [],
  workerStatus,
  error,
  onRetry,
  onSwitch,
  onPressUserCard,
  onPressSwitchArrow,
}: ProfileHeaderCardProps) {
  const isGuest = !fullName && !phone && roles.length === 0;
  const displayName = fullName || (phone ? `Tài khoản ${phone}` : (isGuest ? 'Khách vãng lai' : 'Người dùng'));
  const displayPhone = phone || (isGuest ? 'Chưa đăng nhập' : 'Chưa cập nhật SĐT');
  const isWorkerMode = mode === 'Worker';
  const router = useRouter();

  const handleProfileDetail = () => {
    const profileDetailRoute = isWorkerMode
      ? RouteNames.WORKER_PROFILE_DETAIL
      : '/customer/profile/detail';
    router.push(profileDetailRoute as any);
  };

  return (
    <View testID="profile-header-card" className="w-full">
      {/* Profile Info Container */}
      <Pressable
        testID="profile-header-card-pressable"
        accessibilityRole="button"
        accessibilityLabel="Thông tin hồ sơ"
        onPress={handleProfileDetail}
        className="mb-4 w-full"
      >
        <Pressable
          testID="profile-user-card"
          accessibilityRole="button"
          accessibilityLabel="Xem chi tiết hồ sơ cá nhân"
          onPress={onPressUserCard || handleProfileDetail}
          className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
        >
          <View className="h-[50px] flex-row items-center">
            {/* Avatar Area */}
            <View className="mr-4">
              {avatarUrl
                ? (
                    <Image
                      testID="profile-avatar-img"
                      source={{ uri: avatarUrl }}
                      className="size-16 rounded-full border-2 border-white shadow-sm dark:border-neutral-700"
                    />
                  )
                : (
                    <View
                      testID="profile-avatar-fallback"
                      className={`size-16 items-center justify-center rounded-full ${
                        isWorkerMode
                          ? 'bg-amber-100 dark:bg-amber-950/60'
                          : 'bg-blue-100 dark:bg-blue-950/60'
                      }`}
                    >
                      {isWorkerMode
                        ? (
                            <WrenchIcon color="#D97706" size={28} />
                          )
                        : (
                            <UserIcon color="#2563EB" size={28} />
                          )}
                    </View>
                  )}
            </View>

            {/* User Details Area */}
            <View className="flex-1">
              <Text
                testID="profile-full-name"
                className="text-[14px] font-bold text-neutral-900 dark:text-white"
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text
                testID="profile-phone"
                className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400"
              >
                {displayPhone}
              </Text>
              {/* Badges Row */}
              <View className="mt-1 flex-row flex-wrap items-center justify-between gap-1.5">
                {/* Worker Verification Status Badge */}
                {workerStatus && (() => {
                  const normalizedWorkerStatus = (workerStatus || '').toLowerCase().trim();
                  const isVerified = normalizedWorkerStatus === 'verified';
                  const isPending
                    = normalizedWorkerStatus === 'pending_kyc'
                      || normalizedWorkerStatus === 'under_review'
                      || normalizedWorkerStatus === 'pending';
                  const isRejected
                    = normalizedWorkerStatus === 'rejected'
                      || normalizedWorkerStatus === 'suspended';

                  const statusLabel
                    = isVerified
                      ? 'Đã xác minh'
                      : isPending
                        ? 'Đang chờ xác minh'
                        : normalizedWorkerStatus === 'rejected'
                          ? 'Bị từ chối'
                          : normalizedWorkerStatus === 'suspended'
                            ? 'Tạm khóa'
                            : 'Chưa xác minh';

                  return (
                    <View
                      testID="worker-verification-badge"
                      className={`rounded-full border px-2.5 py-0.5 ${
                        isVerified
                          ? 'border-emerald-300 bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/50'
                          : isPending
                            ? 'border-blue-300 bg-blue-100 dark:border-blue-700 dark:bg-blue-900/50'
                            : isRejected
                              ? 'border-red-300 bg-red-100 dark:border-red-700 dark:bg-red-900/50'
                              : 'border-amber-300 bg-amber-100 dark:border-amber-700 dark:bg-amber-900/50'
                      }`}
                    >
                      <Text
                        className={`text-[10px] font-semibold ${
                          isVerified
                            ? 'text-emerald-800 dark:text-emerald-200'
                            : isPending
                              ? 'text-blue-800 dark:text-blue-200'
                              : isRejected
                                ? 'text-red-800 dark:text-red-200'
                                : 'text-amber-800 dark:text-amber-200'
                        }`}
                      >
                        {statusLabel}
                      </Text>
                    </View>
                  );
                })()}

                {/* App Mode Badge */}
                <View
                  testID="profile-mode-badge"
                  className={`rounded-full border px-2.5 py-0.5 ${
                    isWorkerMode
                      ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/50'
                      : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50'
                  }`}
                >
                  <View className="flex-row items-center">
                    <View className="mr-1 size-[4px] rounded-full bg-[#E5B52D]" />
                    <Text
                      className={`text-[10px] font-semibold ${
                        isWorkerMode
                          ? 'text-blue-700 dark:text-blue-300'
                          : 'text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {isWorkerMode ? 'App Thợ' : 'App Khách'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {/* Profile fetch error and retry notification */}
          {error
            ? (
                <View
                  testID="profile-fetch-error"
                  className="mt-3 flex-row items-center justify-between rounded-xl border border-red-200 bg-red-50 p-2.5 dark:border-red-900 dark:bg-red-950/40"
                >
                  <View className="mr-2 flex-1">
                    <Text className="text-xs font-medium text-red-800 dark:text-red-200">
                      Không thể tải thông tin hồ sơ mới nhất
                    </Text>
                  </View>
                  <Button
                    testID="profile-retry-btn"
                    label="Thử lại"
                    size="sm"
                    variant="outline"
                    onPress={onRetry}
                  />
                </View>
              )
            : null}
        </Pressable>
      </Pressable>

      {/* Switch Mode Card */}
      <AppSwitchCard
        currentMode={mode}
        roles={roles}
        workerStatus={workerStatus}
        onSwitch={onSwitch}
        onPressSwitchArrow={onPressSwitchArrow}
      />
    </View>
  );
}
