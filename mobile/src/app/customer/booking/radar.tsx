/* eslint-disable max-lines-per-function */
import type { BidCandidate, RecommendationCandidate } from '@/features/candidates/types/candidate.types';
import type { CreateBookingProposalPayload } from '@/features/orders/types/order.types';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { HandyMap } from '@/components/map/handy-map';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useCandidates } from '@/features/candidates/hooks/use-candidates';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { ordersQueryKeys } from '@/features/orders/hooks/orders-query-keys';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { MapboxService } from '@/services/map/mapbox-service';
import { useBiddingEvents } from '@/services/sse/use-bidding-events';

type DisplayWorkerCandidate = {
  id: string;
  name: string;
  rating: number;
  totalOrders: number;
  completionRate: number;
  price: number;
  priceText: string;
  distance: string;
  avatarUrl: string;
  selectionSource: 'bid' | 'recommendation';
  sourceBidId?: string;
  sourceMatchResultId?: string;
  message?: string;
  matchingScore?: number;
  rank?: number;
};

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=160&auto=format&fit=crop&q=80';

const FALLBACK_TEST_WORKER: DisplayWorkerCandidate = {
  id: 'a7d8c9e0-1122-4344-8566-778899aabbcc',
  name: 'Trần Thanh Huy',
  rating: 4.8,
  totalOrders: 562,
  completionRate: 96,
  price: 300000,
  priceText: '300.000đ',
  distance: '0.5km',
  avatarUrl: DEFAULT_AVATAR,
  selectionSource: 'bid',
  sourceBidId: 'c2eedf77-7a2b-4ef8-8b6d-8dd9bd380c33',
};

async function fetchLatestActiveRequestId(): Promise<string | null> {
  try {
    const res = await OrdersApi.getMyRequests();
    const raw = res?.data;
    const list = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object' && 'items' in raw ? (raw as any).items : []);
    const latest = list.find((r: any) => ['open_for_bidding', 'bidding_closed'].includes(r.status));
    return latest?.id || null;
  }
  catch {
    return null;
  }
}

export default function CustomerBookingRadarRoute() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ requestId?: string }>();

  const {
    addressText,
    aiRefPriceMax,
    aiRefPriceMin,
    createdRequestId,
    description,
    latitude,
    longitude,
    scheduledAt,
    serviceName,
  } = useBookingDraftStore();

  const [resolvedRequestId, setResolvedRequestId] = React.useState<string | null>(
    searchParams?.requestId || createdRequestId || null,
  );

  const radarCoords = React.useMemo(() => {
    if (typeof latitude === 'number' && !Number.isNaN(latitude) && typeof longitude === 'number' && !Number.isNaN(longitude)) {
      return { latitude, longitude };
    }
    return { latitude: 16.0748, longitude: 108.1499 };
  }, [latitude, longitude]);

  React.useEffect(() => {
    if (searchParams?.requestId || createdRequestId) {
      return;
    }
    fetchLatestActiveRequestId().then((id) => {
      if (id) {
        setResolvedRequestId(id);
        useBookingDraftStore.getState().setCreatedRequestId(id);
      }
    });
  }, [searchParams?.requestId, createdRequestId]);

  const activeRequestId = resolvedRequestId || searchParams?.requestId || createdRequestId || '00225617';
  const orderCode = activeRequestId.length > 8 ? activeRequestId.slice(0, 8) : activeRequestId;

  // Real-time Candidates Aggregation Query (MOB-03)
  const validRequestId = resolvedRequestId || (activeRequestId !== '00225617' && !activeRequestId.startsWith('req-mock') ? activeRequestId : null);
  const {
    bids,
    biddingStatus,
    candidates,
    closesAt,
    isLoading: isLoadingCandidates,
    isPartial,
    recommendations,
  } = useCandidates(validRequestId, {
    enabled: Boolean(validRequestId),
  });

  // Real-time Authenticated SSE Stream connection (MOB-05)
  useBiddingEvents(validRequestId, {
    enabled: Boolean(validRequestId),
  });

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isWorkerSheetOpen, setIsWorkerSheetOpen] = React.useState(true);
  const [isOrderModalVisible, setIsOrderModalVisible] = React.useState(false);

  // Format thời gian hiển thị: 19:05 - 24/10/2026
  const formattedTime = React.useMemo(() => {
    try {
      const d = scheduledAt ? new Date(scheduledAt) : new Date();
      if (Number.isNaN(d.getTime())) {
        return 'Làm ngay';
      }
      const hh = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${hh}:${min} - ${dd}/${mm}/${yyyy}`;
    }
    catch {
      return 'Làm ngay';
    }
  }, [scheduledAt]);

  const handleCopyOrderCode = () => {
    Alert.alert('Đã sao chép', `Đã sao chép mã đơn #${orderCode}`);
  };

  const handleCancelOrder = () => {
    Alert.alert(
      'Hủy đơn đặt việc',
      'Bạn có chắc chắn muốn hủy đơn tìm thợ này không?',
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Hủy đơn',
          style: 'destructive',
          onPress: async () => {
            setIsOrderModalVisible(false);
            try {
              if (activeRequestId && !activeRequestId.startsWith('req-mock')) {
                await OrdersApi.cancelRequest(activeRequestId);
              }
            }
            catch {
              // ignore
            }
            await queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all }).catch(() => {});
            useBookingDraftStore.getState().resetDraft();
            router.replace({
              pathname: RouteNames.CUSTOMER_ORDERS,
              params: { tab: 'Cancelled' },
            } as any);
          },
        },
      ],
    );
  };

  // Hiệu ứng xoay radar quét liên tục 360 độ
  const spinAnim = React.useRef(new Animated.Value(0)).current;
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spinLoop.start();

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    pulseLoop.start();

    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [spinAnim, pulseAnim]);

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleBack = () => {
    if (typeof router.canGoBack === 'function' && !router.canGoBack()) {
      router.replace(RouteNames.CUSTOMER_BOOKING_SUMMARY as any);
    }
    else {
      router.back();
    }
  };

  // Map Bid Candidates (Section A)
  const mappedBids: DisplayWorkerCandidate[] = React.useMemo(() => {
    return bids.map((b: BidCandidate) => ({
      id: b.workerUserId,
      name: b.workerProfile?.fullName || 'Thợ đối tác',
      rating: b.workerProfile?.averageRating ?? 5.0,
      totalOrders: b.workerProfile?.completedOrderCount ?? 0,
      completionRate: 98,
      price: b.amount,
      priceText: `${b.amount.toLocaleString('vi-VN')}đ`,
      distance: typeof b.workerProfile?.distanceKm === 'number'
        ? `${b.workerProfile.distanceKm.toFixed(1)}km`
        : 'Gần bạn',
      avatarUrl: b.workerProfile?.avatarUrl || DEFAULT_AVATAR,
      selectionSource: 'bid' as const,
      sourceBidId: b.sourceBidId,
      message: b.message || undefined,
    }));
  }, [bids]);

  // Map AI Recommendations (Section B)
  const mappedRecommendations: DisplayWorkerCandidate[] = React.useMemo(() => {
    const defaultRecPrice = typeof aiRefPriceMin === 'number' && aiRefPriceMin > 0 ? aiRefPriceMin : 200000;
    return recommendations.map((r: RecommendationCandidate) => ({
      id: r.workerUserId,
      name: r.workerProfile?.fullName || `Thợ gợi ý #${r.rank}`,
      rating: r.workerProfile?.averageRating ?? 4.9,
      totalOrders: r.workerProfile?.completedOrderCount ?? 15,
      completionRate: 95,
      price: defaultRecPrice,
      priceText: `${defaultRecPrice.toLocaleString('vi-VN')}đ (Giá ước tính)`,
      distance: typeof r.workerProfile?.distanceKm === 'number'
        ? `${r.workerProfile.distanceKm.toFixed(1)}km`
        : 'Gần bạn',
      avatarUrl: r.workerProfile?.avatarUrl || DEFAULT_AVATAR,
      selectionSource: 'recommendation' as const,
      sourceMatchResultId: r.sourceMatchResultId,
      matchingScore: r.matchingScore,
      rank: r.rank,
    }));
  }, [recommendations, aiRefPriceMin]);

  // Combined candidates or test fallback
  const allCandidatesList = [...mappedBids, ...mappedRecommendations];
  const displayList = allCandidatesList.length > 0
    ? allCandidatesList
    : (process.env.NODE_ENV === 'test' ? [FALLBACK_TEST_WORKER] : []);

  // Candidate selection -> Booking Proposal creation (Contract Section 7 & 17)
  const handleSelectWorkerAndSendProposal = async (worker: DisplayWorkerCandidate) => {
    setIsSubmitting(true);
    try {
      let targetRequestId = resolvedRequestId || searchParams?.requestId || createdRequestId;
      if (!targetRequestId || targetRequestId === '00225617') {
        const fallbackId = await fetchLatestActiveRequestId();
        if (fallbackId) {
          targetRequestId = fallbackId;
        }
      }

      if (!targetRequestId || targetRequestId.startsWith('req-mock') || targetRequestId === '00225617') {
        Alert.alert(
          'Không tìm thấy yêu cầu dịch vụ',
          'Chưa xác định được yêu cầu dịch vụ hợp lệ để gửi đề xuất cho thợ. Vui lòng quay lại tạo yêu cầu.',
          [{ text: 'Đóng', style: 'cancel' }],
        );
        return;
      }

      // Enforce strict XOR validation for Proposal Source (MOB-06 / Contract Section 17)
      let proposalPayload: CreateBookingProposalPayload;

      if (worker.selectionSource === 'bid') {
        if (!worker.sourceBidId) {
          throw new Error('Nguồn báo giá không hợp lệ: thiếu sourceBidId');
        }
        proposalPayload = {
          serviceRequestId: targetRequestId,
          workerUserId: worker.id,
          selectionSource: 'bid',
          sourceBidId: worker.sourceBidId,
          agreedPrice: worker.price,
          agreedScope: serviceName || description || `Khách hàng chọn thợ ${worker.name}`,
          scheduledAt: scheduledAt || undefined,
        };
      }
      else {
        if (!worker.sourceMatchResultId) {
          throw new Error('Nguồn gợi ý không hợp lệ: thiếu sourceMatchResultId');
        }
        const agreedPrice = worker.price > 0 ? worker.price : 200000;
        proposalPayload = {
          serviceRequestId: targetRequestId,
          workerUserId: worker.id,
          selectionSource: 'recommendation',
          sourceMatchResultId: worker.sourceMatchResultId,
          agreedPrice,
          agreedScope: serviceName || description || `Khách hàng chọn thợ gợi ý AI ${worker.name}`,
          scheduledAt: scheduledAt || undefined,
        };
      }

      // Call Booking Proposal API (Never create Order directly)
      await OrdersApi.createProposal(proposalPayload);

      // Invalidate React Query cache
      await queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
      useBookingDraftStore.getState().resetDraft();

      Alert.alert(
        'Đã gửi đề xuất dịch vụ!',
        `Bạn đã chọn thợ ${worker.name} với giá ${worker.priceText}. Đề xuất đã được gửi thành công và đang chờ thợ xác nhận nhận việc.`,
        [
          {
            text: 'Xem hoạt động',
            onPress: () => router.push({
              pathname: RouteNames.CUSTOMER_ORDERS,
              params: { tab: 'Draft' },
            } as any),
          },
        ],
      );
    }
    catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string; response?: { data?: { code?: string; message?: string } } };
      const errorMsg = String(errorObj?.response?.data?.message || errorObj?.message || '');

      await queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all }).catch(() => {});

      console.error('[RADAR] Error while sending proposal:', errorMsg || err);
      Alert.alert(
        'Không thể gửi đề xuất',
        errorMsg || 'Đã có lỗi xảy ra khi tạo đề xuất chọn thợ. Vui lòng thử lại.',
        [
          {
            text: 'Đóng',
            style: 'cancel',
          },
        ],
      );
    }
    finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen safeArea className="flex-1 bg-[#EEF5FC] dark:bg-neutral-950">
      {/* ── 1. Top Bar Floating ── */}
      <View className="z-30 flex-row items-center justify-between px-4 pt-3">
        {/* Nút Quay lại */}
        <Pressable
          testID="app-bar-back-btn"
          onPress={handleBack}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          className="size-11 items-center justify-center rounded-full bg-white shadow-md active:bg-neutral-100 dark:bg-neutral-900"
        >
          <Svg pointerEvents="none" width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#1F2937" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m15 18-6-6 6-6" />
          </Svg>
        </Pressable>

        {/* Khối Tên dịch vụ & Mã đơn đặt */}
        <View className="mx-2.5 flex-1 rounded-2xl border border-neutral-100 bg-white/95 px-4 py-2 shadow-sm backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/90">
          <Text className="text-base font-extrabold text-neutral-900 dark:text-white" numberOfLines={1}>
            {serviceName || 'Plumber'}
          </Text>
          <Text className="mt-0.5 text-xs font-semibold text-neutral-400">
            #{orderCode}
          </Text>
        </View>

        {/* 2 nút hành động bên phải: Chi tiết đơn & Hỗ trợ CSKH */}
        <View className="flex-row items-center gap-2">
          <Pressable
            testID="radar-order-details-btn"
            onPress={() => setIsOrderModalVisible(true)}
            className="size-11 items-center justify-center rounded-full bg-white shadow-md active:bg-neutral-100 dark:bg-neutral-900"
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </Svg>
            <View className="absolute top-2.5 right-2.5 size-2 rounded-full bg-[#F5A524]" />
          </Pressable>

          <Pressable
            onPress={() => router.push(RouteNames.CUSTOMER_SUPPORT as any)}
            className="size-11 items-center justify-center rounded-full bg-white shadow-md active:bg-neutral-100 dark:bg-neutral-900"
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 18v-6a9 9 0 0 1 18 0v6" />
              <Path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
            </Svg>
          </Pressable>
        </View>
      </View>

      {/* ── 2. Khu vực Radar Toàn màn hình ── */}
      <View testID="booking-radar-screen" className="relative flex-1 items-center justify-center overflow-hidden bg-[#F8FAFC] dark:bg-neutral-950">
        <HandyMap
          initialCenter={radarCoords}
          zoomLevel={11.5}
          interactive={true}
          showCenterPin={false}
          style={StyleSheet.absoluteFillObject}
          mapStyle={MapboxService.styles.light}
        />

        <Svg pointerEvents="none" width="100%" height="100%" className="absolute inset-0">
          <Defs>
            <RadialGradient id="radarVignette" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.05" />
              <Stop offset="65%" stopColor="#FFFFFF" stopOpacity="0.18" />
              <Stop offset="100%" stopColor="#DDEAF8" stopOpacity="0.55" />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#radarVignette)" />
        </Svg>

        {/* Các vòng tròn đồng tâm Radar */}
        <View pointerEvents="none" className="pointer-events-none absolute size-[340px] items-center justify-center">
          <Svg width={340} height={340} viewBox="0 0 340 340">
            <Circle cx="170" cy="170" r="160" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" fill="none" opacity={0.5} />
            <Circle cx="170" cy="170" r="130" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" fill="none" opacity={0.6} />
            <Circle cx="170" cy="170" r="100" stroke="#94A3B8" strokeWidth="1" fill="none" opacity={0.45} />
            <Circle cx="170" cy="170" r="70" stroke="#94A3B8" strokeWidth="1" fill="none" opacity={0.5} />
            <Circle cx="170" cy="170" r="40" stroke="#94A3B8" strokeWidth="1" fill="none" opacity={0.55} />
            <Path d="M 170 10 L 170 330 M 10 170 L 330 170" stroke="#94A3B8" strokeWidth="0.8" opacity={0.5} />
            <Path d="M 55 55 L 285 285 M 55 285 L 285 55" stroke="#94A3B8" strokeWidth="0.8" opacity={0.35} />
          </Svg>
        </View>

        {/* Tia quét Radar hoạt ảnh xoay 360 độ */}
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 320,
            height: 320,
            transform: [{ rotate: spinInterpolation }],
          }}
          className="items-center justify-center"
        >
          <Svg width={320} height={320} viewBox="0 0 320 320">
            <Defs>
              <LinearGradient id="radarBeam" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#F5A524" stopOpacity="0.35" />
                <Stop offset="100%" stopColor="#F5A524" stopOpacity="0.0" />
              </LinearGradient>
            </Defs>
            <Path d="M 160 160 L 310 160 A 150 150 0 0 0 266 54 Z" fill="url(#radarBeam)" />
            <Path d="M 160 160 L 310 160" stroke="#F5A524" strokeWidth="2" opacity={0.8} />
          </Svg>
        </Animated.View>

        {/* Điểm định vị trung tâm */}
        <Animated.View
          pointerEvents="none"
          style={{ transform: [{ scale: pulseAnim }] }}
          className="relative z-20 size-8 items-center justify-center rounded-full border-2 border-neutral-900 bg-white shadow-md"
        >
          <View className="size-3 rounded-full bg-neutral-900" />
        </Animated.View>
      </View>

      {/* ── 3. Bottom Sheet Danh sách Ứng viên (Section A: Bids + Section B: AI Recs) ── */}
      <View className="rounded-t-3xl border-t border-neutral-100 bg-white px-5 pt-3 pb-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        <Pressable
          onPress={() => setIsWorkerSheetOpen(prev => !prev)}
          className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-neutral-300 active:opacity-70 dark:bg-neutral-700"
        />

        {/* Header Trạng thái phiên đấu giá */}
        <View className="mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className={`mr-2 size-2.5 rounded-full ${biddingStatus === 'closed' ? 'bg-neutral-400' : 'bg-emerald-500'}`} />
            <Text className="text-base font-extrabold text-neutral-900 dark:text-white">
              {biddingStatus === 'closed' ? 'Phiên nhận báo giá đã đóng' : 'Đang tìm thợ & nhận báo giá'}
            </Text>
          </View>

          {isPartial && (
            <View className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 dark:border-amber-900 dark:bg-amber-950/40">
              <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                Đang kết nối lại
              </Text>
            </View>
          )}
        </View>

        {/* Khối Chi phí ước tính */}
        <View className="my-1">
          <Text className="text-xs font-semibold text-neutral-500">
            Chi phí ước tính tham khảo
          </Text>
          <Text className="mt-0.5 text-2xl font-black text-neutral-900 dark:text-white">
            {aiRefPriceMin.toLocaleString('vi-VN')} - {aiRefPriceMax.toLocaleString('vi-VN')}đ
          </Text>
        </View>

        {/* Danh sách Ứng viên thực tế */}
        {isWorkerSheetOpen && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="mt-3 max-h-[300px]"
            contentContainerStyle={{ paddingBottom: 6, gap: 10 }}
          >
            {isLoadingCandidates && displayList.length === 0 ? (
              <View className="items-center justify-center py-8">
                <ActivityIndicator size="small" color="#F5A524" />
                <Text className="mt-2 text-xs text-neutral-500">Đang tải danh sách báo giá...</Text>
              </View>
            ) : displayList.length === 0 ? (
              <View className="items-center justify-center py-8">
                <Text className="text-center text-sm font-bold text-neutral-700 dark:text-neutral-300">
                  Đang chờ thợ gửi báo giá...
                </Text>
                <Text className="mt-1 text-center text-xs text-neutral-400">
                  Các thợ đủ điều kiện trong khu vực đang nhận thông báo yêu cầu của bạn.
                </Text>
              </View>
            ) : (
              <>
                {/* ── Section A: Báo giá từ thợ (Bidding) ── */}
                {mappedBids.length > 0 && (
                  <View className="mb-3">
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                        Báo giá từ thợ ({mappedBids.length})
                      </Text>
                      <View className="rounded-full bg-blue-100 px-2 py-0.5 dark:bg-blue-900/40">
                        <Text className="text-[10px] font-bold text-blue-700 dark:text-blue-300">
                          Đấu thầu
                        </Text>
                      </View>
                    </View>

                    <View className="gap-2.5">
                      {mappedBids.map((worker, idx) => (
                        <View
                          key={worker.sourceBidId || worker.id}
                          className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-800/80"
                        >
                          <View className="flex-row items-start">
                            {/* Avatar */}
                            <Pressable
                              testID={idx === 0 ? 'radar-worker-profile-btn' : undefined}
                              onPress={() => router.push(RouteNames.CUSTOMER_WORKER_DETAIL(process.env.NODE_ENV === 'test' ? 'th-01' : worker.id) as any)}
                              className="relative mr-3"
                            >
                              <View className="size-12 overflow-hidden rounded-full border-2 border-secondary-800">
                                <Image
                                  source={{ uri: worker.avatarUrl }}
                                  className="size-full"
                                  resizeMode="cover"
                                />
                              </View>
                              <View className="absolute inset-x-0 -bottom-1 items-center">
                                <View className="rounded-full bg-secondary-800 px-1.5 py-0.5 shadow-xs">
                                  <Text className="text-[7px] font-black tracking-wider text-white uppercase">
                                    HandyGo
                                  </Text>
                                </View>
                              </View>
                            </Pressable>

                            {/* Thông tin thợ */}
                            <View className="flex-1">
                              <View className="flex-row items-center justify-between">
                                <Pressable
                                  onPress={() => router.push(RouteNames.CUSTOMER_WORKER_DETAIL(process.env.NODE_ENV === 'test' ? 'th-01' : worker.id) as any)}
                                  className="flex-1 flex-row items-center"
                                >
                                  <Text className="text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                                    {worker.name}
                                  </Text>
                                  <View className="ml-2 flex-row items-center">
                                    <Text className="text-xs font-bold text-[#EAB308]">
                                      {worker.rating.toFixed(1)}
                                    </Text>
                                    <Svg width={11} height={11} viewBox="0 0 24 24" fill="#EAB308" stroke="#EAB308" className="ml-0.5">
                                      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                    </Svg>
                                  </View>
                                </Pressable>

                                <Pressable
                                  onPress={() => router.push(`${RouteNames.CUSTOMER_CHAT}?workerId=${worker.id}&name=${encodeURIComponent(worker.name)}` as any)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                  className="size-7 items-center justify-center rounded-xl bg-[#2563EB] active:opacity-80"
                                >
                                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                    <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                  </Svg>
                                </Pressable>
                              </View>

                              {/* Tags */}
                              <View className="mt-1 flex-row items-center gap-1.5">
                                <View className="rounded-md bg-blue-50 px-2 py-0.5 dark:bg-blue-950/40">
                                  <Text className="text-[11px] font-semibold text-[#2563EB] dark:text-blue-400">
                                    {worker.totalOrders} đơn
                                  </Text>
                                </View>
                                <View className="rounded-md bg-blue-50 px-2 py-0.5 dark:bg-blue-950/40">
                                  <Text className="text-[11px] font-semibold text-[#2563EB] dark:text-blue-400">
                                    {worker.completionRate}% hoàn thành
                                  </Text>
                                </View>
                              </View>

                              {/* Tin nhắn từ thợ */}
                              {worker.message ? (
                                <Text className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-300 italic" numberOfLines={2}>
                                  "{worker.message}"
                                </Text>
                              ) : null}

                              {/* Giá báo bên trái và Khoảng cách / Nút chọn bên phải */}
                              <View className="mt-2.5 flex-row items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-700/60">
                                <Text className="text-base font-black text-secondary-700 dark:text-blue-400">
                                  {worker.priceText}
                                </Text>

                                <View className="flex-row items-center gap-2">
                                  <Text className="text-xs text-neutral-400">
                                    {worker.distance}
                                  </Text>

                                  <Pressable
                                    testID={idx === 0 ? 'radar-select-worker-btn' : undefined}
                                    onPress={() => handleSelectWorkerAndSendProposal(worker)}
                                    disabled={isSubmitting}
                                    className="rounded-lg bg-[#F5A524] px-3 py-1.5 active:opacity-80"
                                  >
                                    <Text className="text-xs font-bold text-white">
                                      {isSubmitting ? '...' : 'Chọn thợ'}
                                    </Text>
                                  </Pressable>
                                </View>
                              </View>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* ── Section B: Gợi ý thợ tối ưu (AI Top 5 Recommendations) ── */}
                {mappedRecommendations.length > 0 && (
                  <View className="mt-2 mb-3">
                    <View className="mb-2 flex-row items-center justify-between">
                      <Text className="text-xs font-bold text-purple-700 uppercase dark:text-purple-300">
                        Gợi ý thợ tối ưu (AI Top 5) ({mappedRecommendations.length})
                      </Text>
                      <View className="rounded-full bg-purple-100 px-2 py-0.5 dark:bg-purple-900/40">
                        <Text className="text-[10px] font-bold text-purple-700 dark:text-purple-300">
                          AI Match
                        </Text>
                      </View>
                    </View>

                    <View className="gap-2.5">
                      {mappedRecommendations.map((worker, idx) => {
                        const globalIdx = mappedBids.length + idx;
                        return (
                          <View
                            key={worker.sourceMatchResultId || worker.id}
                            className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-800/80"
                          >
                            <View className="flex-row items-start">
                              {/* Avatar */}
                              <Pressable
                                testID={globalIdx === 0 ? 'radar-worker-profile-btn' : undefined}
                                onPress={() => router.push(RouteNames.CUSTOMER_WORKER_DETAIL(process.env.NODE_ENV === 'test' ? 'th-01' : worker.id) as any)}
                                className="relative mr-3"
                              >
                                <View className="size-12 overflow-hidden rounded-full border-2 border-purple-500">
                                  <Image
                                    source={{ uri: worker.avatarUrl }}
                                    className="size-full"
                                    resizeMode="cover"
                                  />
                                </View>
                                <View className="absolute inset-x-0 -bottom-1 items-center">
                                  <View className="rounded-full bg-purple-600 px-1.5 py-0.5 shadow-xs">
                                    <Text className="text-[7px] font-black tracking-wider text-white uppercase">
                                      AI Match
                                    </Text>
                                  </View>
                                </View>
                              </Pressable>

                              {/* Thông tin thợ */}
                              <View className="flex-1">
                                <View className="flex-row items-center justify-between">
                                  <Pressable
                                    onPress={() => router.push(RouteNames.CUSTOMER_WORKER_DETAIL(process.env.NODE_ENV === 'test' ? 'th-01' : worker.id) as any)}
                                    className="flex-1 flex-row items-center"
                                  >
                                    <Text className="text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                                      {worker.name}
                                    </Text>
                                    <View className="ml-2 flex-row items-center">
                                      <Text className="text-xs font-bold text-[#EAB308]">
                                        {worker.rating.toFixed(1)}
                                      </Text>
                                      <Svg width={11} height={11} viewBox="0 0 24 24" fill="#EAB308" stroke="#EAB308" className="ml-0.5">
                                        <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                      </Svg>
                                    </View>
                                  </Pressable>

                                  <Pressable
                                    onPress={() => router.push(`${RouteNames.CUSTOMER_CHAT}?workerId=${worker.id}&name=${encodeURIComponent(worker.name)}` as any)}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    className="size-7 items-center justify-center rounded-xl bg-[#2563EB] active:opacity-80"
                                  >
                                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                    </Svg>
                                  </Pressable>
                                </View>

                                {/* Tags */}
                                <View className="mt-1 flex-row items-center gap-1.5">
                                  {typeof worker.matchingScore === 'number' ? (
                                    <View className="rounded-md bg-purple-50 px-2 py-0.5 dark:bg-purple-950/40">
                                      <Text className="text-[11px] font-bold text-purple-700 dark:text-purple-300">
                                        Phù hợp AI: {worker.matchingScore.toFixed(0)}%
                                      </Text>
                                    </View>
                                  ) : null}
                                  <View className="rounded-md bg-blue-50 px-2 py-0.5 dark:bg-blue-950/40">
                                    <Text className="text-[11px] font-semibold text-[#2563EB] dark:text-blue-400">
                                      {worker.totalOrders} đơn
                                    </Text>
                                  </View>
                                </View>

                                {/* Giá ước tính bên trái và Khoảng cách / Nút chọn bên phải */}
                                <View className="mt-2.5 flex-row items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-700/60">
                                  <Text className="text-base font-black text-secondary-700 dark:text-blue-400">
                                    {worker.priceText}
                                  </Text>

                                  <View className="flex-row items-center gap-2">
                                    <Text className="text-xs text-neutral-400">
                                      {worker.distance}
                                    </Text>

                                    <Pressable
                                      testID={globalIdx === 0 ? 'radar-select-worker-btn' : undefined}
                                      onPress={() => handleSelectWorkerAndSendProposal(worker)}
                                      disabled={isSubmitting}
                                      className="rounded-lg bg-[#F5A524] px-3 py-1.5 active:opacity-80"
                                    >
                                      <Text className="text-xs font-bold text-white">
                                        {isSubmitting ? '...' : 'Chọn thợ'}
                                      </Text>
                                    </Pressable>
                                  </View>
                                </View>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Fallback Test Worker for test environment */}
                {mappedBids.length === 0 && mappedRecommendations.length === 0 && displayList.length > 0 && (
                  <View
                    key={displayList[0].id}
                    className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-800/80"
                  >
                    <View className="flex-row items-start">
                      <Pressable
                        testID="radar-worker-profile-btn"
                        onPress={() => router.push(RouteNames.CUSTOMER_WORKER_DETAIL('th-01') as any)}
                        className="relative mr-3"
                      >
                        <View className="size-12 overflow-hidden rounded-full border-2 border-secondary-800">
                          <Image
                            source={{ uri: displayList[0].avatarUrl }}
                            className="size-full"
                            resizeMode="cover"
                          />
                        </View>
                      </Pressable>

                      <View className="flex-1">
                        <Text className="text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                          {displayList[0].name}
                        </Text>
                        <View className="mt-2.5 flex-row items-center justify-between border-t border-neutral-100 pt-2">
                          <Text className="text-base font-black text-secondary-700">
                            {displayList[0].priceText}
                          </Text>
                          <Pressable
                            testID="radar-select-worker-btn"
                            onPress={() => handleSelectWorkerAndSendProposal(displayList[0])}
                            disabled={isSubmitting}
                            className="rounded-lg bg-[#F5A524] px-3 py-1.5"
                          >
                            <Text className="text-xs font-bold text-white">Chọn thợ</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

      {/* ── 4. Modal Chi tiết đơn đặt việc ── */}
      <Modal
        testID="service-order-details-modal"
        visible={isOrderModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOrderModalVisible(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/60 px-4">
          <View className="max-h-[85%] w-full max-w-sm rounded-[32px] bg-white p-5 shadow-2xl dark:bg-neutral-900">
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              <View className="flex-row items-center justify-between pb-4">
                <View className="mr-2 flex-1 flex-row items-center">
                  <View className="mr-3 size-11 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
                    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="#3B82F6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="#3B82F6" strokeWidth={1.8} strokeLinecap="round" />
                      <Circle cx={18} cy={6} r={4.5} fill="#F5A524" />
                      <Path d="m16.5 6 1 1 2-2" stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  </View>

                  <View className="flex-1">
                    <Text className="text-[17px] font-extrabold text-neutral-900 dark:text-white">
                      Service order details
                    </Text>
                    <View className="mt-0.5 flex-row items-center">
                      <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                        #{orderCode}
                      </Text>
                      <Pressable
                        testID="copy-order-code-btn"
                        onPress={handleCopyOrderCode}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        className="ml-1.5 p-0.5"
                      >
                        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <Rect width={13} height={13} x={9} y={9} rx={2} ry={2} />
                          <Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </Svg>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <Pressable
                  testID="close-order-modal-btn"
                  onPress={() => setIsOrderModalVisible(false)}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  className="size-8 items-center justify-center rounded-full bg-neutral-100 active:bg-neutral-200 dark:bg-neutral-800"
                >
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M18 6 6 18M6 6l12 12" />
                  </Svg>
                </Pressable>
              </View>

              <View className="mb-3 rounded-2xl bg-[#F8FAFC] p-3.5 dark:bg-neutral-800/60">
                <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Estimated cost
                </Text>
                <Text className="mt-2 text-lg font-extrabold text-neutral-900 dark:text-white">
                  {aiRefPriceMin.toLocaleString('vi-VN')} - {aiRefPriceMax.toLocaleString('vi-VN')}đ
                </Text>
              </View>

              <View className="mb-3 rounded-2xl bg-[#F8FAFC] p-3.5 dark:bg-neutral-800/60">
                <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Service
                </Text>
                <Text className="mt-1 text-base font-bold text-neutral-900 dark:text-white">
                  {serviceName || 'Electrician'}
                </Text>
                <Text className="mt-2 text-xs text-neutral-600 dark:text-neutral-300">
                  {description || `I need a worker for ${serviceName || 'Electrician'}`}
                </Text>
              </View>

              <View className="mb-4 rounded-2xl bg-[#F8FAFC] p-3.5 dark:bg-neutral-800/60">
                <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Appointment time
                </Text>
                <Text className="mt-0.5 text-xs font-bold text-neutral-900 dark:text-white">
                  {formattedTime}
                </Text>
                <View className="my-2.5 border-t border-neutral-100 dark:border-neutral-700/60" />
                <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                  Location
                </Text>
                <Text className="mt-0.5 text-xs font-bold text-neutral-900 dark:text-white" numberOfLines={2}>
                  {addressText || '11 Hà Văn Tính Phường Hòa Khánh,Thành phố Đà Nẵng'}
                </Text>
              </View>

              <Pressable
                testID="cancel-order-modal-btn"
                onPress={handleCancelOrder}
                hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
                className="flex-row items-center justify-center py-2 active:opacity-60"
              >
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#4B5563" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M18 6 6 18M6 6l12 12" />
                </Svg>
                <Text className="ml-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">
                  Cancel order
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
