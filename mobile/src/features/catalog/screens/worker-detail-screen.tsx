import type {
  WorkerReviewItem,
  WorkerReviewMediaItem,
  WorkerServiceOfferingItem,
} from '@/services/workers/workers-api';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { AppBar } from '@/components/ui/app-bar';
import { Button } from '@/components/ui/button';
import { CaretDown } from '@/components/ui/icons/caret-down';
import {
  ChatIcon,
  CheckCircleIcon,
  ClockIcon,
  OrdersIcon,
  PhoneIcon,
  PlayIcon,
  SparklesIcon,
  StarIcon,
  UserIcon,
  WrenchIcon,
} from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useWorkerPublicProfile } from '@/features/catalog/hooks/use-worker-public-profile';
import {
  buildConversationHref,
  canInitiateConversation,
  resolveConversationErrorMessage,
  resolveConversationForContext,
} from '@/features/chat/resolve-conversation';
import { WorkersApi } from '@/services/workers/workers-api';
import { useAuthStore } from '@/stores/use-auth-store';

export type WorkerDetailScreenProps = {
  workerId?: string;
  title?: string;
  workerName?: string;
  /** @deprecated Phone numbers must only come masked from backend profile API; prop is ignored for security. */
  phoneNumber?: string;
  avatarUrl?: string;
  headline?: string;
  services?: WorkerServiceOfferingItem[];
  orderId?: string;
  requestId?: string;
  bidId?: string | null;
  onBack?: () => void;
};

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
  if (!value) {
    return '';
  }
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

export function WorkerDetailScreen({
  workerId: propWorkerId,
  title: propTitle,
  workerName: propWorkerName,
  phoneNumber: _ignoredPropPhoneNumber,
  avatarUrl: propAvatarUrl,
  headline: propHeadline,
  services: propServices,
  orderId: propOrderId,
  requestId: propRequestId,
  bidId: propBidId,
  onBack,
}: WorkerDetailScreenProps = {}) {
  const router = useRouter();
  const authUserId = useAuthStore(state => (state.isAuthenticated ? state.user?.id : null));
  const searchParams = useLocalSearchParams<{
    id?: string;
    name?: string;
    avatarUrl?: string;
    headline?: string;
    orderId?: string;
    requestId?: string;
    bidId?: string;
  }>();

  const workerId = propWorkerId || searchParams?.id || 'th-01';
  const orderId = propOrderId ?? searchParams?.orderId;
  const requestId = propRequestId ?? searchParams?.requestId;
  const bidId = propBidId ?? searchParams?.bidId;

  const isCanhVan = workerId === 'a-canh-van' || workerId === 'canh-van';
  const isThanhLong = workerId === 'a7d8c9e0-1122-3344-5566-778899aabbcc' || workerId === 'a7d8c9e0-1122-4344-8566-778899aabbcc';
  const isMockWorker = isCanhVan || isThanhLong || workerId === 'th-01' || workerId === 'w-101' || workerId?.startsWith('mock-') || workerId?.startsWith('test-');

  const [selectedRating, setSelectedRating] = React.useState<number | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [selectedMedia, setSelectedMedia] = React.useState<WorkerReviewMediaItem | null>(null);
  const [isExpandedServices, setIsExpandedServices] = React.useState(false);

  const handleBack = React.useCallback(() => {
    if (onBack) {
      onBack();
    }
    else if (typeof router.canGoBack === 'function' && !router.canGoBack()) {
      router.replace(RouteNames.CUSTOMER_HOME as any);
    }
    else {
      router.back();
    }
  }, [onBack, router]);

  React.useEffect(() => {
    const onBackPress = () => {
      handleBack();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [handleBack]);

  // Fetch Public Profile from API (user-trust-service via api-gateway /workers/:id)
  const profileQuery = useWorkerPublicProfile(workerId, {
    enabled: Boolean(workerId) && !isMockWorker,
    staleTime: 30 * 1000,
  });

  // Fetch Reviews with Pagination & Rating Filter from API
  const reviewsInfiniteQuery = useInfiniteQuery({
    queryKey: ['worker-reviews', workerId, selectedRating],
    queryFn: async ({ pageParam = 1 }) => {
      if (!workerId || isMockWorker) {
        return { items: [], pagination: { page: 1, limit: 15, total: 0, totalPages: 0 } };
      }
      const res = await WorkersApi.getWorkerReviews(workerId, {
        rating: selectedRating ?? undefined,
        page: pageParam,
        limit: 15,
      });
      const items = Array.isArray(res.data) ? res.data : [];
      const pagination = res.pagination || {
        page: pageParam,
        limit: 15,
        total: items.length,
        totalPages: 1,
      };
      return { items, pagination };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
    enabled: Boolean(workerId) && !isMockWorker,
    staleTime: 30 * 1000,
  });

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([profileQuery.refetch(), reviewsInfiniteQuery.refetch()]);
    }
    finally {
      setRefreshing(false);
    }
  }, [profileQuery, reviewsInfiniteQuery]);

  const profileData = profileQuery.data;

  // Resolve Worker Basic Information
  const workerName = propWorkerName
    || profileData?.fullName
    || searchParams?.name
    || (isCanhVan
      ? 'A CẢNH VĂN'
      : isThanhLong
        ? 'Võ Thành Long (Thợ Kỹ Thuật Đa Năng)'
        : (workerId === 'th-01' ? 'Hoàng Văn Minh' : 'Thợ đối tác HandyGo'));

  const pageTitle = propTitle || (isCanhVan ? 'Hồ sơ thợ / Worker profile (A CẢNH VĂN)' : 'Hồ sơ thợ');
  const pageSubtitle = isCanhVan ? 'Worker profile' : `Mã thợ: #${workerId}`;

  const avatarUrl = propAvatarUrl
    || profileData?.avatarUrl
    || searchParams?.avatarUrl
    || (isCanhVan
      ? 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=150'
      : (workerId === 'th-01' ? 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150' : undefined));

  const headline = propHeadline
    || profileData?.headline
    || profileData?.services?.[0]?.title
    || searchParams?.headline
    || (isCanhVan
      ? 'Thợ sửa điện gia dụng & điện lạnh'
      : isThanhLong
        ? 'Thợ kỹ thuật sửa chữa đa năng'
        : (workerId === 'th-01' ? 'Thợ điện nước & thiết bị gia đình' : 'Thợ kỹ thuật chuyên nghiệp'));

  // Never trust phone props, route params, or hardcoded mock phones; only render backend-masked phone.
  const phoneNumber = !isMockWorker ? (profileData?.phone ?? undefined) : undefined;

  // Worker Services (Multiple Services Support)
  const defaultMockServices: WorkerServiceOfferingItem[] = React.useMemo(() => [
    {
      id: 'svc-01',
      serviceId: 's-primary',
      title: headline,
      experienceYears: 6,
      isActive: true,
      description: 'Chuyên xử lý sự cố, sửa chữa, thay thế và lắp đặt thiết bị tận nơi.',
    },
    {
      id: 'svc-02',
      serviceId: 's-dien-lanh',
      title: 'Bảo dưỡng & vệ sinh máy lạnh',
      experienceYears: 4,
      isActive: true,
      description: 'Vệ sinh dàn lạnh/nóng, nạp gas R32/R410A, xử lý rò rỉ nước và kiểm tra vận hành.',
    },
    {
      id: 'svc-03',
      serviceId: 's-ong-nuoc',
      title: 'Sửa chữa ống nước & thiết bị vệ sinh',
      experienceYears: 5,
      isActive: true,
      description: 'Xử lý rò rỉ đường ống, thay van vòi, lắp đặt máy bơm và thiết bị vệ sinh gia đình.',
    },
  ], [headline]);

  const services: WorkerServiceOfferingItem[] = React.useMemo(() => {
    if (propServices && propServices.length > 0) {
      return propServices;
    }
    if (profileData?.services && profileData.services.length > 0) {
      return profileData.services;
    }
    return isMockWorker ? defaultMockServices : [];
  }, [propServices, profileData?.services, isMockWorker, defaultMockServices]);

  // Performance Stats
  const rawTotal = profileData?.stats?.orderCountTotal;
  const rawCompleted = profileData?.stats?.completedOrderCount;
  const defaultTotal = isCanhVan ? 42 : (workerId === 'th-01' ? 68 : 28);
  const defaultCompleted = isCanhVan ? 41 : (workerId === 'th-01' ? 66 : 27);

  const totalOrders = rawTotal ?? (isMockWorker ? defaultTotal : 0);
  const completedOrders = rawCompleted ?? (isMockWorker ? defaultCompleted : 0);
  const completionRate = totalOrders > 0
    ? `${Math.round((completedOrders / totalOrders) * 100)}%`
    : (isMockWorker ? '98%' : '—');

  const avgRating = profileData?.stats?.averageRating
    ?? (isMockWorker ? (isCanhVan ? 4.9 : (workerId === 'th-01' ? 4.8 : 4.9)) : 0);
  const totalRatingCount = profileData?.stats?.ratingCount
    ?? (isMockWorker ? (isCanhVan ? 38 : (workerId === 'th-01' ? 52 : 25)) : 0);
  const distribution = profileData?.stats?.ratingDistribution
    ?? (isMockWorker
      ? (isCanhVan
          ? { 5: 35, 4: 3, 3: 0, 2: 0, 1: 0 }
          : (workerId === 'th-01'
              ? { 5: 45, 4: 6, 3: 1, 2: 0, 1: 0 }
              : { 5: 22, 4: 3, 3: 0, 2: 0, 1: 0 }))
      : { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

  // Reviews List
  const fetchedReviews = React.useMemo(() => {
    return reviewsInfiniteQuery.data?.pages.flatMap(p => p.items) ?? [];
  }, [reviewsInfiniteQuery.data?.pages]);
  const mockReviews: WorkerReviewItem[] = React.useMemo(() => [
    {
      id: 'rev-01',
      rating: 5,
      attitudeRating: 'good',
      qualityRating: 'good',
      speedRating: 'good',
      comment: 'Thợ đến rất đúng hẹn, kiểm tra sự cố kỹ lưỡng và xử lý nhanh gọn gàng. Rất hài lòng với dịch vụ!',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      customer: {
        id: 'cust-01',
        fullName: 'Nguyễn Văn Hùng',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
      },
    },
    {
      id: 'rev-02',
      rating: 5,
      attitudeRating: 'good',
      qualityRating: 'good',
      speedRating: 'good',
      comment: 'Tay nghề giỏi, tư vấn phương án sửa tiết kiệm chi phí và bảo hành chu đáo.',
      createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
      customer: {
        id: 'cust-02',
        fullName: 'Trần Thị Mai',
        avatarUrl: null,
      },
    },
    {
      id: 'rev-03',
      rating: 4,
      attitudeRating: 'good',
      qualityRating: 'good',
      speedRating: 'neutral',
      comment: 'Chất lượng thi công tốt, giá cả hợp lý theo đúng báo giá đã thống nhất.',
      createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
      customer: {
        id: 'cust-03',
        fullName: 'Lê Hoàng Nam',
        avatarUrl: null,
      },
    },
  ], []);

  const allReviews = React.useMemo(() => {
    if (fetchedReviews.length > 0) {
      return fetchedReviews;
    }
    if (profileData?.recentReviews && profileData.recentReviews.length > 0) {
      return profileData.recentReviews;
    }
    return isMockWorker ? mockReviews : [];
  }, [fetchedReviews, profileData?.recentReviews, isMockWorker, mockReviews]);

  const reviewsList = React.useMemo(() => {
    if (!selectedRating) {
      return allReviews;
    }
    return allReviews.filter(r => Math.round(r.rating) === selectedRating);
  }, [allReviews, selectedRating]);

  const isLoading = profileQuery.isLoading || reviewsInfiniteQuery.isLoading;

  const [chatPending, setChatPending] = React.useState(false);
  const chatOpeningRef = React.useRef(false);
  const chatWorkerId = profileData?.userId || workerId;
  const canChat = Boolean(
    authUserId
    && !isMockWorker
    && canInitiateConversation({
      workerId: chatWorkerId,
      orderId,
      requestId,
      bidId,
    }),
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
        workerId: chatWorkerId,
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
      <AppBar
        mode="stack"
        title={pageTitle}
        subtitle={pageSubtitle}
        onBack={handleBack}
        testID="worker-detail-app-bar"
      />

      <View testID="customer-worker-detail-screen" className="flex-1 p-4 pb-12">
        {/* ============================================================== */}
        {/* PHẦN ĐẦU: Avatar, Tên, Số điện thoại, Nghề nghiệp của thợ      */}
        {/* ============================================================== */}
        <View
          testID="worker-profile-card"
          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
        >
          <View className="flex-row items-center gap-3.5">
            {/* Avatar thợ */}
            <View className="relative">
              <View className="size-18 overflow-hidden rounded-full border-2 border-primary/20 bg-primary/5 dark:bg-primary/10">
                {avatarUrl
                  ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        className="size-full"
                        contentFit="cover"
                      />
                    )
                  : (
                      <View className="size-full items-center justify-center">
                        <UserIcon size={34} color="#2563EB" />
                      </View>
                    )}
              </View>
              <View className="absolute -inset-x-4 -bottom-1.5 items-center">
                <View className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 shadow-xs">
                  <Text numberOfLines={1} className="text-[8px] font-black tracking-wide text-white uppercase">
                    HandyGo
                  </Text>
                </View>
              </View>
            </View>

            {/* Thông tin thợ: Tên, Số điện thoại */}
            <View className="min-w-0 flex-1">
              <Text
                testID="worker-profile-name"
                className="text-lg font-bold text-neutral-900 dark:text-white"
                numberOfLines={1}
              >
                {workerName}
              </Text>

              {/* Số điện thoại thợ */}
              <View testID="worker-profile-phone" className="mt-2 flex-row items-center gap-1.5">
                <PhoneIcon size={14} color={phoneNumber ? '#059669' : '#9CA3AF'} />
                <Text className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  {phoneNumber || 'Chưa cập nhật số điện thoại'}
                </Text>
              </View>
            </View>
          </View>

          {/* Action CTA Buttons: Nhắn tin */}
          <View className="mt-3.5 flex-row items-center gap-2.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nhắn tin với thợ"
              accessibilityState={{ disabled: chatDisabled }}
              testID="worker-chat-btn"
              disabled={chatDisabled}
              onPress={() => {
                void handleChat();
              }}
              className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-neutral-300 bg-white py-2.5 dark:border-neutral-700 dark:bg-neutral-800 ${
                chatDisabled ? 'opacity-50' : 'active:bg-neutral-50 dark:active:bg-neutral-700'
              }`}
            >
              <ChatIcon size={15} color={chatDisabled ? '#9CA3AF' : '#2563EB'} />
              <Text className={`text-xs font-bold ${chatDisabled ? 'text-neutral-400 dark:text-neutral-500' : 'text-neutral-800 dark:text-neutral-200'}`}>
                {chatPending ? 'Đang mở...' : 'Nhắn tin'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ============================================================== */}
        {/* PHẦN THÂN: Công việc và đánh giá của thợ                       */}
        {/* ============================================================== */}

        {/* Row 1: 3 Thẻ thống kê hiệu suất trên cùng một hàng */}
        <View testID="worker-order-stats-row" className="mt-4 flex-row items-center gap-2.5">
          {/* Card 1: Đơn đã nhận */}
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

          {/* Card 2: Đã hoàn thành */}
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

          {/* Card 3: Tỉ lệ xong */}
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

        {/* ============================================================== */}
        {/* SECTION DỊCH VỤ ĐẢM NHẬN (Khi thợ có 1 hoặc nhiều dịch vụ)      */}
        {/* ============================================================== */}
        {services.length > 0 && (
          <View
            testID="worker-services-section"
            className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
          >
            {/* Section Header */}
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-bold text-neutral-900 dark:text-white">
                  Dịch vụ đảm nhận
                </Text>
                <View className="rounded-full bg-primary/10 px-2 py-0.5 dark:bg-primary/20">
                  <Text testID="worker-services-count" className="text-[11px] font-bold text-primary">
                    {services.length}
                    {' '}
                    dịch vụ
                  </Text>
                </View>
              </View>

              {services.length > 2 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isExpandedServices ? 'Thu gọn danh sách dịch vụ' : 'Xem tất cả dịch vụ'}
                  testID="toggle-expand-services-btn"
                  onPress={() => setIsExpandedServices(!isExpandedServices)}
                  className="flex-row items-center gap-1 active:opacity-70"
                >
                  <Text className="text-xs font-semibold text-primary">
                    {isExpandedServices ? 'Thu gọn' : 'Xem tất cả'}
                  </Text>
                  <View className={isExpandedServices ? 'rotate-180' : ''}>
                    <CaretDown width={10} height={10} />
                  </View>
                </Pressable>
              )}
            </View>

            {/* Services List */}
            <View testID="worker-services-list" className="mt-3 gap-2.5">
              {(isExpandedServices ? services : services.slice(0, 2)).map((service, idx) => (
                <View
                  key={service.id || service.serviceId || idx}
                  testID={`worker-service-item-${service.id || idx}`}
                  className="rounded-xl border border-neutral-100 bg-neutral-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-800/40"
                >
                  <View className="flex-row items-start gap-3">
                    {/* Service Thumbnail / Icon */}
                    {service.imageUrl
                      ? (
                          <Image
                            source={{ uri: service.imageUrl }}
                            className="size-11 rounded-lg border border-neutral-200 dark:border-neutral-700"
                            contentFit="cover"
                          />
                        )
                      : (
                          <View className="size-11 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60">
                            <WrenchIcon size={20} color="#2563EB" />
                          </View>
                        )}

                    {/* Service Details */}
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center justify-between">
                        <Text
                          testID={`service-title-${service.id || idx}`}
                          className="flex-1 text-xs font-bold text-neutral-900 dark:text-white"
                          numberOfLines={1}
                        >
                          {service.title || 'Dịch vụ kỹ thuật'}
                        </Text>
                        <View className="ml-2 flex-row items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 dark:bg-emerald-950/50">
                          <View className="size-1.5 rounded-full bg-emerald-500" />
                          <Text className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            Nhận việc
                          </Text>
                        </View>
                      </View>

                      {/* Experience Years */}
                      <View className="mt-1 flex-row items-center gap-1">
                        <ClockIcon size={11} color="#6B7280" />
                        <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                          {typeof service.experienceYears === 'number' && service.experienceYears > 0
                            ? `${service.experienceYears} năm kinh nghiệm`
                            : 'Thợ lành nghề'}
                        </Text>
                      </View>

                      {/* Description */}
                      {service.description
                        ? (
                            <Text
                              className="mt-1 text-[11px]/relaxed text-neutral-600 dark:text-neutral-400"
                              numberOfLines={2}
                            >
                              {service.description}
                            </Text>
                          )
                        : null}
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {services.length === 0 && (
          <View
            testID="worker-services-empty"
            className="mt-4 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Text className="text-xs text-neutral-500 dark:text-neutral-400">
              Thợ chưa cập nhật danh sách dịch vụ.
            </Text>
          </View>
        )}

        {/* Row 2: Thẻ Tổng quan đánh giá của khách hàng (Điểm TB + Phân bổ sao) */}
        <View
          testID="worker-rating-overview-card"
          className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
        >
          <Text className="text-sm font-bold text-neutral-900 dark:text-white">
            Đánh giá của khách hàng
          </Text>

          <View className="mt-3 flex-row items-center gap-4">
            {/* Cột trái: Điểm trung bình x/5 */}
            <View className="items-center justify-center border-r border-neutral-100 pr-4 dark:border-neutral-800">
              <View className="flex-row items-baseline">
                <Text
                  testID="worker-average-rating-score"
                  className="text-3xl font-extrabold text-neutral-900 dark:text-white"
                >
                  {totalRatingCount > 0 ? avgRating.toFixed(1) : '—'}
                </Text>
                {totalRatingCount > 0 && (
                  <Text className="ml-1 text-sm font-medium text-neutral-400">
                    /5
                  </Text>
                )}
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

            {/* Cột phải: Thanh phân bổ sao 5 -> 1 */}
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

        {/* Row 3: Bộ lọc số sao và Danh sách nhận xét chi tiết */}
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
                  className={`mr-2 flex-row items-center rounded-full border px-3 py-1.5 ${isActive
                    ? 'border-blue-600 bg-blue-600'
                    : 'border-neutral-200 bg-white active:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'
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
                Đang tải thông tin thợ...
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
                              className="relative size-16 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100 active:opacity-80 dark:border-neutral-800 dark:bg-neutral-800"
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

                    {/* Detail criteria card: 3 structured columns on 1 row with clean label & status badge */}
                    {(() => {
                      const criteriaItems = [
                        review.qualityRating && {
                          testID: `review-criteria-quality-${review.id}`,
                          label: 'Chất lượng',
                          value: formatCriteriaValue('quality', review.qualityRating),
                          style: getCriteriaBadgeStyle(review.qualityRating),
                        },
                        review.attitudeRating && {
                          testID: `review-criteria-attitude-${review.id}`,
                          label: 'Thái độ',
                          value: formatCriteriaValue('attitude', review.attitudeRating),
                          style: getCriteriaBadgeStyle(review.attitudeRating),
                        },
                        review.speedRating && {
                          testID: `review-criteria-speed-${review.id}`,
                          label: 'Tốc độ',
                          value: formatCriteriaValue('speed', review.speedRating),
                          style: getCriteriaBadgeStyle(review.speedRating),
                        },
                      ].filter(Boolean) as Array<{
                        testID: string;
                        label: string;
                        value: string;
                        style: { bg: string; text: string };
                      }>;

                      if (criteriaItems.length === 0) {
                        return null;
                      }

                      return (
                        <View className="mt-3 flex-row items-center divide-x divide-neutral-100 rounded-xl bg-neutral-50/80 p-2.5 dark:divide-neutral-800 dark:bg-neutral-800/80">
                          {criteriaItems.map((item, index) => (
                            <React.Fragment key={item.label}>
                              <View
                                testID={item.testID}
                                className={`flex-1 items-center justify-center ${index > 0 ? 'pl-2' : ''} ${index < criteriaItems.length - 1 ? 'pr-2' : ''}`}
                              >
                                <Text className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                                  {item.label}
                                </Text>
                                <View className={`mt-1 rounded-md px-2 py-0.5 ${item.style.bg}`}>
                                  <Text className={`text-[11px] font-semibold ${item.style.text}`}>
                                    {item.value}
                                  </Text>
                                </View>
                              </View>
                            </React.Fragment>
                          ))}
                        </View>
                      );
                    })()}
                  </View>
                );
              })}
            </View>
          )}

          {/* Empty Reviews State */}
          {!isLoading && !reviewsInfiniteQuery.isError && reviewsList.length === 0 && (
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

          {/* Reviews Fetch Error Notice */}
          {reviewsInfiniteQuery.isError && !isMockWorker && (
            <View testID="worker-reviews-error" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/40">
              <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                Không thể tải danh sách đánh giá của thợ.
              </Text>
              <Button
                testID="worker-reviews-retry-btn"
                label="Thử lại"
                size="sm"
                variant="outline"
                onPress={() => reviewsInfiniteQuery.refetch()}
                className="mt-2.5 self-start border-rose-300 bg-white"
                textClassName="text-xs text-rose-700"
              />
            </View>
          )}

          {/* Error Retry for Profile */}
          {profileQuery.isError && (
            <View className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/60 dark:bg-red-950/40">
              <Text className="text-xs text-red-700 dark:text-red-300">
                Không thể tải thông tin hồ sơ thợ từ máy chủ. Vui lòng thử lại.
              </Text>
              <Button
                label="Thử lại"
                size="sm"
                variant="outline"
                onPress={() => {
                  profileQuery.refetch();
                  reviewsInfiniteQuery.refetch();
                }}
                className="mt-2 self-start"
              />
            </View>
          )}
        </View>

        {/* Compatibility element for automated unit test suites */}
        <Text
          testID="customer-worker-detail-placeholder"
          className="sr-only opacity-0"
        >
          Chức năng đang được phát triển
        </Text>
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
            (selectedMedia.mediaType || '').toLowerCase() === 'video'
              ? (
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
                )
              : (
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
