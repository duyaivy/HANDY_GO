import type { DiscoverableJobItem } from '@/features/bidding/api/worker-discovery.api';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button } from '@/components/ui/button';
import { WrenchIcon } from '@/components/ui/icons';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { SECONDARY_COLOR } from '@/constants/colors';
import { RouteNames } from '@/constants/route-names';
import { WorkerBiddingApi } from '@/features/bidding/api/worker-bidding.api';
import { WorkerBidModal } from '@/features/bidding/components/worker-bid-modal';
import { useMyBids } from '@/features/bidding/hooks/use-worker-bidding';
import { useWorkerDiscovery } from '@/features/bidding/hooks/use-worker-discovery';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { useAuthStore } from '@/stores/use-auth-store';
import { WorkerGuestOverview } from '../components/worker-guest-overview';

export function WorkerHomeScreen() {
  const router = useRouter();
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const user = useAuthStore.use.user();
  const isAuthenticated = useAuthStore.use.isAuthenticated();

  const [page, setPage] = React.useState(1);
  const [selectedJob, setSelectedJob] = React.useState<DiscoverableJobItem | null>(null);
  const [isBidModalVisible, setIsBidModalVisible] = React.useState(false);
  const handledRequestIdRef = React.useRef<string | null>(null);

  const {
    error,
    isError,
    isLoading,
    isRefetching,
    jobs,
    refetch,
    total,
    totalPages,
  } = useWorkerDiscovery({
    page,
    limit: 10,
    enabled: Boolean(isAuthenticated && user),
  });

  const { data: myBids, refetch: refetchMyBids } = useMyBids(undefined, Boolean(isAuthenticated && user));

  // Auto-refresh upon focusing "Nhận việc" tab
  useFocusEffect(
    React.useCallback(() => {
      if (isAuthenticated && user) {
        void refetch();
        void refetchMyBids();
      }
    }, [isAuthenticated, user, refetch, refetchMyBids]),
  );

  // Client-side guard: Only show jobs whose bidding round has NOT ended
  const activeJobs = React.useMemo(() => {
    const now = Date.now();
    return jobs.filter((job) => {
      if (job.biddingClosesAt) {
        const closesAtMs = new Date(job.biddingClosesAt).getTime();
        if (!Number.isNaN(closesAtMs) && closesAtMs <= now) {
          return false;
        }
      }
      return true;
    });
  }, [jobs]);

  // Auto-open bidding modal when navigated with ?requestId=... (e.g. from matching notification)
  React.useEffect(() => {
    if (!requestId || !isAuthenticated || !user) {
      return;
    }

    if (handledRequestIdRef.current === requestId) {
      return;
    }

    // 1. Try finding in loaded jobs
    const foundInList = jobs.find(j => j.id === requestId);
    if (foundInList) {
      handledRequestIdRef.current = requestId;
      setSelectedJob(foundInList);
      setIsBidModalVisible(true);
      return;
    }

    // 2. Fetch directly from API if not yet in current page
    let isCancelled = false;
    WorkerBiddingApi.getServiceRequest(requestId)
      .then((req) => {
        if (isCancelled || !req)
          return;
        handledRequestIdRef.current = requestId;
        setSelectedJob({
          id: req.id,
          requestCode: req.requestCode,
          serviceId: req.serviceId,
          description: req.description,
          scheduledAt: req.scheduledAt,
          addressText: req.addressText,
          biddingClosesAt: req.biddingClosesAt,
          createdAt: req.createdAt,
        });
        setIsBidModalVisible(true);
      })
      .catch((err) => {
        console.warn('[WORKER_HOME] Could not fetch request details for bidding:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [requestId, isAuthenticated, user, jobs]);

  if (!isAuthenticated || !user) {
    return <WorkerGuestOverview />;
  }

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

  const handleOpenBidModal = (job: DiscoverableJobItem) => {
    handledRequestIdRef.current = job.id;
    setSelectedJob(job);
    setIsBidModalVisible(true);
  };

  const handleCloseBidModal = () => {
    setIsBidModalVisible(false);
    setSelectedJob(null);
    handledRequestIdRef.current = null;
    if (requestId) {
      router.setParams({ requestId: '' });
    }
  };

  const handleRefresh = async () => {
    await Promise.all([refetch(), refetchMyBids()]);
  };

  const getExistingBidForJob = (jobId: string) => {
    if (!myBids || !Array.isArray(myBids))
      return null;
    return myBids.find(b => b.serviceRequestId === jobId) || null;
  };

  return (
    <Screen safeArea className="flex-1 bg-neutral-50 dark:bg-neutral-950">
      {/* Top Bar: Title, Notification Bell & Quick Role Switch */}
      <View className="flex-row items-center justify-between border-b border-neutral-100 bg-white px-4 py-3 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center">
          <WrenchIcon size={22} color={SECONDARY_COLOR} />
          <Text className="ml-2 text-xl font-black text-neutral-900 dark:text-white">
            Nhận việc
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

      {/* Main Job Feed ScrollView */}
      <ScrollView
        testID="home-worker-screen"
        className="flex-1 px-4 pt-3"
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            colors={['#F5A524']}
            tintColor="#F5A524"
          />
        )}
      >
        {/* Banner: Discoverable Jobs Status */}
        <View className="mb-3 rounded-2xl bg-[#1E293B] p-4 text-white shadow-sm">
          <Text className="text-base font-extrabold text-white">
            Việc làm xung quanh bạn
          </Text>
          <Text className="mt-0.5 text-xs text-slate-300">
            {activeJobs.length > 0
              ? `Tìm thấy ${activeJobs.length} yêu cầu dịch vụ phù hợp trong bán kính hoạt động`
              : 'Đang theo dõi các yêu cầu mới trong khu vực của bạn'}
          </Text>
        </View>

        {/* Loading State */}
        {isLoading && (
          <View className="items-center justify-center py-20">
            <ActivityIndicator size="large" color="#F5A524" />
            <Text className="mt-3 text-sm font-semibold text-neutral-500">
              Đang tìm kiếm yêu cầu phù hợp...
            </Text>
          </View>
        )}

        {/* Error State */}
        {!isLoading && isError && (
          <View className="items-center justify-center rounded-2xl border border-red-200 bg-red-50 p-6 my-8 dark:border-red-900 dark:bg-red-950/30">
            <Text className="text-center text-sm font-bold text-red-700 dark:text-red-300">
              Không thể tải danh sách công việc
            </Text>
            <Text className="mt-1 text-center text-xs text-red-600 dark:text-red-400">
              {error?.message || 'Vui lòng kiểm tra lại kết nối mạng.'}
            </Text>
            <View className="mt-4 w-32">
              <Button variant="outline" size="default" label="Thử lại" onPress={() => refetch()} />
            </View>
          </View>
        )}

        {/* Empty State */}
        {!isLoading && !isError && activeJobs.length === 0 && (
          <View className="items-center justify-center py-16 px-4">
            <View className="size-16 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800">
              <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2}>
                <Path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </Svg>
            </View>
            <Text className="mt-4 text-center text-base font-bold text-neutral-800 dark:text-neutral-200">
              Chưa có yêu cầu mới
            </Text>
            <Text className="mt-1 text-center text-xs text-neutral-500 max-w-[260px]">
              Hiện tại chưa có khách hàng nào đặt lịch trong bán kính phục vụ của bạn. Hãy quay lại sau ít phút!
            </Text>
            <View className="mt-4 w-36">
              <Button variant="outline" size="default" label="Làm mới" onPress={handleRefresh} />
            </View>
          </View>
        )}

        {/* Job Items List */}
        {!isLoading && !isError && activeJobs.length > 0 && (
          <View className="gap-3 pb-6">
            {activeJobs.map((job) => {
              const existingBid = getExistingBidForJob(job.id);
              const hasBid = Boolean(existingBid);

              return (
                <Pressable
                  key={job.id}
                  onPress={() => handleOpenBidModal(job)}
                  className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs active:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  {/* Job Header: Code, Category & Distance */}
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-1.5">
                      <View className="rounded-md bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">
                        <Text className="text-[11px] font-black text-neutral-700 dark:text-neutral-300">
                          #{job.requestCode || job.id.slice(0, 8)}
                        </Text>
                      </View>
                      <View className="rounded-md bg-amber-50 px-2 py-0.5 dark:bg-amber-950/40">
                        <Text className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                          {job.serviceName || job.categoryName || 'Sửa chữa'}
                        </Text>
                      </View>
                    </View>

                    {typeof job.distanceKm === 'number' && (
                      <View className="flex-row items-center rounded-full bg-blue-50 px-2.5 py-0.5 dark:bg-blue-950/50">
                        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2.5}>
                          <Path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                          <Path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
                        </Svg>
                        <Text className="ml-1 text-[11px] font-bold text-[#2563EB] dark:text-blue-400">
                          {job.distanceKm.toFixed(1)} km
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Description */}
                  <Text className="mt-2.5 text-base font-bold text-neutral-900 dark:text-white" numberOfLines={2}>
                    {job.description || 'Yêu cầu sửa chữa dịch vụ'}
                  </Text>

                  {/* Address */}
                  {job.addressText && (
                    <View className="mt-2 flex-row items-start">
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} className="mt-0.5 mr-1.5 shrink-0">
                        <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <Path d="M12 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
                      </Svg>
                      <Text className="flex-1 text-xs text-neutral-500" numberOfLines={1}>
                        {job.addressText}
                      </Text>
                    </View>
                  )}

                  {/* Scheduled Time */}
                  {job.scheduledAt && (
                    <View className="mt-1 flex-row items-center">
                      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} className="mr-1.5 shrink-0">
                        <Path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                      </Svg>
                      <Text className="text-xs text-neutral-500">
                        Hẹn: {new Date(job.scheduledAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                      </Text>
                    </View>
                  )}

                  {/* Bidding Closes Time */}
                  {job.biddingClosesAt && (
                    <View className="mt-1 flex-row items-center">
                      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth={2} className="mr-1.5 shrink-0">
                        <Circle cx="12" cy="12" r="10" />
                        <Path d="M12 6v6l4 2" />
                      </Svg>
                      <Text className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Hạn báo giá: {new Date(job.biddingClosesAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                      </Text>
                    </View>
                  )}

                  {/* Action Bar */}
                  <View className="mt-3.5 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
                    {existingBid?.status === 'active' ? (
                      <View className="flex-row items-center">
                        <View className="mr-1.5 size-2 rounded-full bg-emerald-500" />
                        <Text className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          Đã gửi: {existingBid?.amount.toLocaleString('vi-VN')} đ
                        </Text>
                      </View>
                    ) : existingBid?.status === 'withdrawn' ? (
                      <View className="flex-row items-center">
                        <View className="mr-1.5 size-2 rounded-full bg-neutral-400" />
                        <Text className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
                          Đã rút báo giá
                        </Text>
                      </View>
                    ) : (
                      <Text className="text-xs text-neutral-400">
                        Chưa gửi báo giá
                      </Text>
                    )}

                    {existingBid?.status === 'withdrawn' ? (
                      <Pressable
                        onPress={() => handleOpenBidModal(job)}
                        className="rounded-xl bg-neutral-100 px-4 py-2 dark:bg-neutral-800 active:opacity-80"
                      >
                        <Text className="text-xs font-bold text-neutral-500 dark:text-neutral-400">
                          Xem chi tiết
                        </Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => handleOpenBidModal(job)}
                        className={`rounded-xl px-4 py-2 ${
                          existingBid?.status === 'active' ? 'bg-neutral-800 dark:bg-neutral-700' : 'bg-[#F5A524]'
                        } active:opacity-80`}
                      >
                        <Text className={`text-xs font-black ${existingBid?.status === 'active' ? 'text-white' : 'text-neutral-950'}`}>
                          {existingBid?.status === 'active' ? 'Điều chỉnh giá' : 'Gửi báo giá'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </Pressable>
              );
            })}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <View className="my-3 flex-row items-center justify-between rounded-xl bg-white p-3 shadow-2xs dark:bg-neutral-900">
                <Button
                  variant="outline"
                  size="default"
                  disabled={page <= 1}
                  label="Trang trước"
                  onPress={() => setPage(p => Math.max(1, p - 1))}
                />
                <Text className="text-xs font-bold text-neutral-600 dark:text-neutral-400">
                  {page} / {totalPages}
                </Text>
                <Button
                  variant="outline"
                  size="default"
                  disabled={page >= totalPages}
                  label="Trang sau"
                  onPress={() => setPage(p => Math.min(totalPages, p + 1))}
                />
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bidding Sheet/Modal */}
      {selectedJob && (
        <WorkerBidModal
          visible={isBidModalVisible}
          onClose={handleCloseBidModal}
          request={selectedJob}
          existingBid={getExistingBidForJob(selectedJob.id)}
          onSuccess={() => {
            void refetch();
            void refetchMyBids();
          }}
        />
      )}
    </Screen>
  );
}
