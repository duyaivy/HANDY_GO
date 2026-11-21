import type { WorkerPublicProfileData, WorkerReviewItem, WorkerReviewMediaItem } from '@/services/workers/workers-api';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import {
  CheckCircleIcon,
  OrdersIcon,
  PlayIcon,
  SparklesIcon,
  StarIcon,
  UserIcon,
} from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useUserProfile } from '@/features/profile/hooks/use-user-profile';
import { WorkersApi } from '@/services/workers/workers-api';
import { useAuthStore } from '@/stores/use-auth-store';

function formatDate(dateStr?: string | null): string {
  if (!dateStr) {
    return '';
  }
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  catch {
    return '';
  }
}

function StarRatingRow({ rating, size = 14 }: { rating: number; size?: number }) {
  const rounded = Math.round(rating);
  return (
    <View className="flex-row items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(starIndex => (
        <StarIcon
          key={starIndex}
          size={size}
          color={starIndex <= rounded ? '#F59E0B' : '#E5E7EB'}
          fill={starIndex <= rounded ? '#F59E0B' : '#E5E7EB'}
        />
      ))}
    </View>
  );
}

function formatCriteriaValue(type: 'quality' | 'attitude' | 'speed', value?: string | number | null): string {
  if (!value) return '';
  const raw = String(value).toLowerCase().trim();
  if (raw === 'good') {
    return type === 'speed' ? 'Nhanh' : 'Tốt';
  }
  if (raw === 'neutral') {
    return 'Bình thường';
  }
  if (raw === 'bad') {
    return type === 'speed' ? 'Chậm' : 'Chưa tốt';
  }
  return String(value);
}

function getCriteriaBadgeStyle(value?: string | number | null) {
  const raw = String(value || '').toLowerCase().trim();
  if (raw === 'good') {
    return {
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      text: 'text-emerald-700 dark:text-emerald-300',
    };
  }
  if (raw === 'bad') {
    return {
      bg: 'bg-rose-50 dark:bg-rose-950/40',
      text: 'text-rose-700 dark:text-rose-300',
    };
  }
  return {
    bg: 'bg-neutral-100 dark:bg-neutral-800',
    text: 'text-neutral-600 dark:text-neutral-400',
  };
}

export function WorkerReviewsScreen() {
  const router = useRouter();
  const user = useAuthStore.use.user();
  const userId = user?.id;

  const { profile } = useUserProfile();
  const workerIdentifier = profile?.workerProfile?.id || userId;
  const [selectedRating, setSelectedRating] = React.useState<number | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedMedia, setSelectedMedia] = React.useState<WorkerReviewMediaItem | null>(null);

  const handleBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    }
    else {
      router.replace(RouteNames.WORKER_PROFILE as any);
    }
  }, [router]);

  React.useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [handleBack]);

  // Fetch Public Profile Stats (Distribution, Overview) from real backend
  const profileQuery = useQuery<WorkerPublicProfileData>({
    queryKey: ['worker-public-profile', workerIdentifier],
    queryFn: async () => {
      if (!workerIdentifier) {
        throw new Error('Chưa đăng nhập');
      }
      const res = await WorkersApi.getWorkerPublicProfile(workerIdentifier);
      return res.data;
    },
    enabled: Boolean(workerIdentifier),
    staleTime: 30 * 1000,
  });

  // Fetch Reviews with Rating Filter from real backend
  const reviewsQuery = useQuery<WorkerReviewItem[]>({
    queryKey: ['worker-reviews', workerIdentifier, selectedRating],
    queryFn: async () => {
      if (!workerIdentifier) {
        return [];
      }
      const res = await WorkersApi.getWorkerReviews(workerIdentifier, {
        rating: selectedRating ?? undefined,
        limit: 30,
      });
      return res.data;
    },
    enabled: Boolean(workerIdentifier),
    staleTime: 30 * 1000,
  });

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([profileQuery.refetch(), reviewsQuery.refetch()]);
    }
    finally {
      setRefreshing(false);
    }
  }, [profileQuery, reviewsQuery]);

  const stats = profileQuery.data?.stats;
  const workerProfile = profile?.workerProfile;

  const totalOrders = stats?.orderCountTotal ?? workerProfile?.orderCountTotal ?? 0;
  const completedOrders = stats?.completedOrderCount ?? workerProfile?.completedOrderCount ?? 0;
  const completionRate = totalOrders > 0
    ? `${Math.round((completedOrders / totalOrders) * 100)}%`
    : '0%';

  const avgRating = stats?.averageRating !== undefined && stats?.averageRating !== null
    ? Number(stats.averageRating)
    : workerProfile?.averageRating && Number(workerProfile.averageRating) > 0
      ? Number(workerProfile.averageRating)
      : 0;

  const totalRatingCount = stats?.ratingCount ?? workerProfile?.ratingCount ?? 0;
  const distribution = stats?.ratingDistribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  const reviewsList = reviewsQuery.data ?? [];
  const isLoading = profileQuery.isLoading || reviewsQuery.isLoading;

  return (
    <Screen
      safeArea
      scrollable
      refreshControl={(
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          colors={['#2563EB']}
          tintColor="#2563EB"
        />
      )}
      className="bg-neutral-50 dark:bg-neutral-950"
    >
      <View testID="worker-reviews-screen" className="flex-1 pb-10">
        {/* Header Bar */}
        <View className="relative h-12 flex-row items-center justify-center border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            testID="worker-reviews-back-btn"
            onPress={handleBack}
            className="absolute top-1 left-4 size-10 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
          >
            <ArrowLeft width={10} height={20} color="#374151" />
          </Pressable>
          <Text className="text-base font-bold text-neutral-900 dark:text-white">
            Công việc và đánh giá
          </Text>
        </View>

        <View className="p-4">
          {/* Row 1: 3 Performance Statistics on the SAME row */}
          <View testID="worker-order-stats-row" className="flex-row items-center gap-2.5">
            {/* Card 1: Total Orders */}
            <View className="flex-1 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <View className="mb-2 size-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60">
                <OrdersIcon color="#2563EB" size={16} />
              </View>
              <Text
                testID="worker-total-orders"
                className="text-lg font-bold text-neutral-900 dark:text-white"
              >
                {totalOrders}
              </Text>
              <Text className="mt-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Đơn đã nhận
              </Text>
            </View>

            {/* Card 2: Completed Orders */}
            <View className="flex-1 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <View className="mb-2 size-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60">
                <CheckCircleIcon color="#059669" size={16} />
              </View>
              <Text
                testID="worker-completed-orders"
                className="text-lg font-bold text-emerald-700 dark:text-emerald-400"
              >
                {completedOrders}
              </Text>
              <Text className="mt-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Đã hoàn thành
              </Text>
            </View>

            {/* Card 3: Completion Rate */}
            <View className="flex-1 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <View className="mb-2 size-7 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/60">
                <SparklesIcon color="#D97706" size={16} />
              </View>
              <Text
                testID="worker-completion-rate"
                className="text-lg font-bold text-amber-700 dark:text-amber-400"
              >
                {completionRate}
              </Text>
              <Text className="mt-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                Tỉ lệ xong
              </Text>
            </View>
          </View>

          {/* Row 2: Customer Rating Overview (x/5 stars and rating breakdown) */}
          <View
            testID="worker-rating-overview-card"
            className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
              Đánh giá của khách hàng
            </Text>

            <View className="mt-3 flex-row items-center gap-4">
              {/* Left Column: Average Score x/5 */}
              <View className="items-center justify-center border-r border-neutral-100 pr-4 dark:border-neutral-800">
                <View className="flex-row items-baseline">
                  <Text
                    testID="worker-average-rating-score"
                    className="text-3xl font-extrabold text-neutral-900 dark:text-white"
                  >
                    {avgRating.toFixed(1)}
                  </Text>
                  <Text className="ml-1 text-sm font-medium text-neutral-400">
                    /5
                  </Text>
                </View>

                <View className="mt-1">
                  <StarRatingRow rating={avgRating} size={15} />
                </View>

                <Text className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {totalRatingCount}
                  {' '}
                  đánh giá
                </Text>
              </View>

              {/* Right Column: Rating Distribution Bars (5 to 1) */}
              <View className="flex-1 space-y-1">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = distribution[stars] || 0;
                  const percentage = totalRatingCount > 0
                    ? Math.round((count / totalRatingCount) * 100)
                    : 0;

                  return (
                    <View key={stars} className="flex-row items-center gap-2">
                      <View className="w-6 flex-row items-center justify-end gap-0.5">
                        <Text className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                          {stars}
                        </Text>
                        <StarIcon size={10} color="#F59E0B" fill="#F59E0B" />
                      </View>

                      {/* Progress Bar Container */}
                      <View className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                        <View
                          className="h-full rounded-full bg-amber-400"
                          style={{ width: `${percentage}%` }}
                        />
                      </View>

                      {/* Count */}
                      <Text className="w-6 text-right text-[11px] font-medium text-neutral-400">
                        {count}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>

          {/* Row 3: Reviews Filter Chips & List */}
          <View className="mt-5">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                Nhận xét chi tiết
              </Text>
              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                {reviewsList.length}
                {' '}
                nhận xét
              </Text>
            </View>

            {/* Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-2.5 flex-row py-1"
            >
              {[
                { label: 'Tất cả', value: null },
                { label: '5 sao', value: 5 },
                { label: '4 sao', value: 4 },
                { label: '3 sao', value: 3 },
                { label: '2 sao', value: 2 },
                { label: '1 sao', value: 1 },
              ].map((chip) => {
                const isActive = selectedRating === chip.value;
                return (
                  <Pressable
                    key={chip.label}
                    testID={`filter-chip-${chip.value ?? 'all'}`}
                    onPress={() => setSelectedRating(chip.value)}
                    className={`mr-2 flex-row items-center rounded-full border px-3 py-1.5 ${
                      isActive
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-neutral-200 bg-white active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900'
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        isActive ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {chip.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Loading Indicator */}
            {isLoading && (
              <View className="mt-6 items-center justify-center py-6">
                <ActivityIndicator size="small" color="#2563EB" />
                <Text className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  Đang tải nhận xét...
                </Text>
              </View>
            )}

            {/* Reviews List */}
            {!isLoading && reviewsList.length > 0 && (
              <View testID="worker-reviews-list" className="mt-3 space-y-3">
                {reviewsList.map((review) => {
                  const formattedReviewDate = formatDate(review.createdAt);
                  return (
                    <View
                      key={review.id}
                      className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      {/* Customer Info Header */}
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2.5">
                          {review.customer.avatarUrl
                            ? (
                                <Image
                                  source={{ uri: review.customer.avatarUrl }}
                                  className="size-9 rounded-full"
                                />
                              )
                            : (
                                <View className="size-9 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
                                  <UserIcon color="#2563EB" size={16} />
                                </View>
                              )}
                          <View>
                            <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                              {review.customer.fullName || 'Khách hàng'}
                            </Text>
                            <Text className="text-[10px] text-neutral-400">
                              {formattedReviewDate}
                            </Text>
                          </View>
                        </View>

                        <StarRatingRow rating={review.rating} size={13} />
                      </View>

                      {/* Review Comment */}
                      <Text className="mt-2.5 text-xs/relaxed text-neutral-800 dark:text-neutral-200">
                        {review.comment || 'Khách hàng không để lại nhận xét chi tiết.'}
                      </Text>

                      {/* Review Attached Media/Images */}
                      {review.media && review.media.length > 0 && (
                        <View testID={`review-media-gallery-${review.id}`} className="mt-3 flex-row flex-wrap gap-2">
                          {review.media.map((mediaItem, imgIndex) => {
                            const isVideo = (mediaItem.mediaType || '').toLowerCase() === 'video';
                            const displayUri = isVideo
                              ? (mediaItem.thumbnailUrl || mediaItem.mediaUrl)
                              : mediaItem.mediaUrl;
                            return (
                              <Pressable
                                key={mediaItem.id || mediaItem.mediaUrl || imgIndex}
                                testID={`review-media-item-${review.id}-${imgIndex}`}
                                onPress={() => setSelectedMedia(mediaItem)}
                                className="relative size-16 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800 active:opacity-80"
                              >
                                <Image
                                  source={{ uri: displayUri }}
                                  className="size-full"
                                  contentFit="cover"
                                />
                                {isVideo && (
                                  <View className="absolute inset-0 items-center justify-center bg-black/40">
                                    <PlayIcon size={20} color="#FFFFFF" />
                                  </View>
                                )}
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      {/* Detail criteria badges: always on 1 row and equal font size on 1 line */}
                      {(review.qualityRating || review.attitudeRating || review.speedRating) && (
                        <View
                          testID={`review-criteria-row-${review.id}`}
                          className="mt-2.5 flex-row items-center gap-1 border-t border-neutral-100 pt-2 dark:border-neutral-800"
                        >
                          {review.qualityRating && (() => {
                            const style = getCriteriaBadgeStyle(review.qualityRating);
                            return (
                              <View
                                testID={`review-criteria-quality-${review.id}`}
                                className={`flex-1 items-center justify-center rounded-lg px-0.5 py-1 ${style.bg}`}
                              >
                                <Text
                                  numberOfLines={1}
                                  className={`text-center text-[9px] font-semibold ${style.text}`}
                                >
                                  Chất lượng:
                                  {' '}
                                  {formatCriteriaValue('quality', review.qualityRating)}
                                </Text>
                              </View>
                            );
                          })()}
                          {review.attitudeRating && (() => {
                            const style = getCriteriaBadgeStyle(review.attitudeRating);
                            return (
                              <View
                                testID={`review-criteria-attitude-${review.id}`}
                                className={`flex-1 items-center justify-center rounded-lg px-0.5 py-1 ${style.bg}`}
                              >
                                <Text
                                  numberOfLines={1}
                                  className={`text-center text-[9px] font-semibold ${style.text}`}
                                >
                                  Thái độ:
                                  {' '}
                                  {formatCriteriaValue('attitude', review.attitudeRating)}
                                </Text>
                              </View>
                            );
                          })()}
                          {review.speedRating && (() => {
                            const style = getCriteriaBadgeStyle(review.speedRating);
                            return (
                              <View
                                testID={`review-criteria-speed-${review.id}`}
                                className={`flex-1 items-center justify-center rounded-lg px-0.5 py-1 ${style.bg}`}
                              >
                                <Text
                                  numberOfLines={1}
                                  className={`text-center text-[9px] font-semibold ${style.text}`}
                                >
                                  Tốc độ:
                                  {' '}
                                  {formatCriteriaValue('speed', review.speedRating)}
                                </Text>
                              </View>
                            );
                          })()}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Empty Reviews State */}
            {!isLoading && reviewsList.length === 0 && (
              <View
                testID="worker-reviews-empty"
                className="mt-4 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <View className="size-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-950/50">
                  <StarIcon size={24} color="#D97706" fill="#D97706" />
                </View>
                <Text className="mt-3 text-sm font-bold text-neutral-900 dark:text-white">
                  Chưa có đánh giá nào
                </Text>
                <Text className="mt-1 text-center text-xs text-neutral-500 dark:text-neutral-400">
                  {selectedRating
                    ? `Hiện chưa có nhận xét nào đạt mức ${selectedRating} sao.`
                    : 'Các đánh giá và nhận xét từ khách hàng sau khi hoàn thành dịch vụ sẽ xuất hiện tại đây.'}
                </Text>
              </View>
            )}

            {/* Error Retry */}
            {profileQuery.isError && (
              <View className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/40">
                <Text className="text-xs text-red-700 dark:text-red-300">
                  Không thể tải đầy đủ thông tin đánh giá. Vui lòng thử lại.
                </Text>
                <Button
                  label="Thử lại"
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    profileQuery.refetch();
                    reviewsQuery.refetch();
                  }}
                  className="mt-2 self-start"
                />
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Lightbox Modal for Full Image/Video View */}
      <Modal
        visible={Boolean(selectedMedia)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMedia(null)}
      >
        <Pressable
          testID="review-media-lightbox"
          className="flex-1 items-center justify-center bg-black/90 p-4"
          onPress={() => setSelectedMedia(null)}
        >
          {selectedMedia && (
            (selectedMedia.mediaType || '').toLowerCase() === 'video' ? (
              <View className="w-full items-center justify-center">
                <View className="relative h-72 w-full overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900">
                  <Image
                    source={{ uri: selectedMedia.thumbnailUrl || selectedMedia.mediaUrl }}
                    className="size-full"
                    contentFit="contain"
                  />
                  <View className="absolute inset-0 items-center justify-center bg-black/40">
                    <PlayIcon size={56} color="#FFFFFF" />
                  </View>
                  <View className="absolute top-3 left-3 rounded-md bg-black/70 px-2 py-1">
                    <Text className="text-[10px] font-bold text-white">VIDEO ĐÁNH GIÁ</Text>
                  </View>
                </View>

                <Pressable
                  testID="lightbox-play-video-btn"
                  onPress={() => {
                    if (selectedMedia.mediaUrl) {
                      void Linking.openURL(selectedMedia.mediaUrl);
                    }
                  }}
                  className="mt-5 flex-row items-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 active:bg-blue-700"
                >
                  <PlayIcon size={18} color="#FFFFFF" />
                  <Text className="text-sm font-bold text-white">
                    Phát video toàn màn hình
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Image
                source={{ uri: selectedMedia.mediaUrl }}
                className="h-3/4 w-full"
                contentFit="contain"
              />
            )
          )}
          <Text className="mt-4 text-xs font-semibold text-white/80">
            Nhấn ra ngoài để đóng
          </Text>
        </Pressable>
      </Modal>
    </Screen>
  );
}
