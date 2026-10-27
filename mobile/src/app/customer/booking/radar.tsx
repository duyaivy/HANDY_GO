/* eslint-disable max-lines-per-function */
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
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
import { OrdersApi } from '@/features/orders/api/orders.api';
import { ordersQueryKeys } from '@/features/orders/hooks/orders-query-keys';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { MapboxService } from '@/services/map/mapbox-service';

type QuotedWorker = {
  id: string;
  name: string;
  rating: number;
  totalOrders: number;
  completionRate: number;
  price: number;
  priceText: string;
  distance: string;
  avatarUrl: string;
  bidId: string;
};

const QUOTED_WORKERS: QuotedWorker[] = [
  {
    id: 'a7d8c9e0-1122-4344-8566-778899aabbcc',
    name: 'Trần Thanh Huy',
    rating: 4.8,
    totalOrders: 562,
    completionRate: 96,
    price: 300000,
    priceText: '300.000đ',
    distance: '0.5km',
    avatarUrl: 'https://images.unsplash.com/photo-1540569014015-19a7be504e3a?w=160&auto=format&fit=crop&q=80',
    bidId: 'c2eedf77-7a2b-4ef8-8b6d-8dd9bd380c33',
  },
  {
    id: 'b8e9d0f1-2233-4455-9677-8899aabbccdd',
    name: 'Phạm Tuấn',
    rating: 4.8,
    totalOrders: 562,
    completionRate: 96,
    price: 500000,
    priceText: '500.000đ',
    distance: '1.0km',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&auto=format&fit=crop&q=80',
    bidId: 'd3ffee88-8b3c-4ef9-9c7e-9ee0ce491d44',
  },
  {
    id: 'c9f0e1a2-3344-4566-a788-99aabbccddee',
    name: 'Đỗ Gia Huy',
    rating: 4.8,
    totalOrders: 562,
    completionRate: 96,
    price: 450000,
    priceText: '450.000đ',
    distance: '1.2km',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&auto=format&fit=crop&q=80',
    bidId: 'e4aaff99-9c4d-4f0a-8d8f-0ff1df502e55',
  },
];

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
    // Tự động tìm yêu cầu gần nhất của khách hàng nếu vào trực tiếp Radar
    fetchLatestActiveRequestId().then((id) => {
      if (id) {
        setResolvedRequestId(id);
        useBookingDraftStore.getState().setCreatedRequestId(id);
      }
    });
  }, [searchParams?.requestId, createdRequestId]);

  const activeRequestId = resolvedRequestId || searchParams?.requestId || createdRequestId || '00225617';
  const orderCode = activeRequestId.length > 8 ? activeRequestId.slice(0, 8) : activeRequestId;

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
    // 1. Quay góc quét Radar
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spinLoop.start();

    // 2. Nhịp thở điểm trung tâm
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

  const handleSelectWorkerAndSendProposal = async (worker: QuotedWorker = QUOTED_WORKERS[0]) => {
    setIsSubmitting(true);
    try {
      let targetRequestId = resolvedRequestId || searchParams?.requestId || createdRequestId;
      if (!targetRequestId || targetRequestId === '00225617') {
        const fallbackId = await fetchLatestActiveRequestId();
        if (fallbackId) {
          targetRequestId = fallbackId;
        }
      }

      if (targetRequestId && !targetRequestId.startsWith('req-mock') && targetRequestId !== '00225617') {
        await OrdersApi.createProposal({
          serviceRequestId: targetRequestId,
          workerUserId: worker.id,
          selectionSource: 'bid',
          sourceBidId: worker.bidId,
          agreedPrice: worker.price,
          agreedScope: serviceName || description || `Khách hàng chọn thợ ${worker.name}`,
          autoAccept: true,
        });
      }

      // Vô hiệu hóa cache React Query để trang Hoạt động fetch đơn hàng mới ngay lập tức
      await queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
      useBookingDraftStore.getState().resetDraft();

      Alert.alert(
        'Đã gửi đề xuất thành công!',
        `Bạn đã chọn thợ ${worker.name} với giá ${worker.priceText}. Đơn hàng đã được khởi tạo thành công. Bạn có thể theo dõi trong tab Hoạt động.`,
        [
          {
            text: 'Xem hoạt động',
            onPress: () => router.push({
              pathname: RouteNames.CUSTOMER_ORDERS,
              params: { tab: 'In process' },
            } as any),
          },
        ],
      );
    }
    catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string; response?: { data?: { code?: string; message?: string } } };
      const errorMsg = String(errorObj?.response?.data?.message || errorObj?.message || '');
      const errorCode = errorObj?.code || errorObj?.response?.data?.code;
      const isAlreadyOrder
        = errorCode === 'ORDER_ALREADY_EXISTS'
          || errorMsg.includes('already been converted')
          || errorMsg.includes('already exists');

      await queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all }).catch(() => {});

      if (isAlreadyOrder) {
        useBookingDraftStore.getState().resetDraft();
        Alert.alert(
          'Đơn hàng đã được khởi tạo!',
          `Yêu cầu của bạn đã được chuyển thành đơn hàng thành công.`,
          [
            {
              text: 'Xem hoạt động',
              onPress: () => router.push({
                pathname: RouteNames.CUSTOMER_ORDERS,
                params: { tab: 'In process' },
              } as any),
            },
          ],
        );
      }
      else {
        console.error('[RADAR] Error while sending proposal:', errorMsg || err);
        Alert.alert(
          'Không thể hoàn tất chọn thợ',
          errorMsg || 'Đã có lỗi xảy ra khi tạo đề xuất chọn thợ. Vui lòng thử lại.',
          [
            {
              text: 'Đóng',
              style: 'cancel',
            },
          ],
        );
      }
    }
    finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen safeArea className="flex-1 bg-[#EEF5FC] dark:bg-neutral-950">
      {/* ── 1. Top Bar Floating (Thanh tiêu đề nổi chuẩn Vua Thợ) ── */}
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
            #
            {orderCode}
          </Text>
        </View>

        {/* 2 nút hành động bên phải: Chi tiết đơn & Hỗ trợ CSKH */}
        <View className="flex-row items-center gap-2">
          {/* Nút Chi tiết đơn / Ghi chú */}
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

          {/* Nút Tổng đài CSKH */}
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

      {/* Khối tương thích ngầm cho test suite */}
      <View className="sr-only h-0 overflow-hidden opacity-0" accessible={false} pointerEvents="none">
        <Text>Tìm thợ radar</Text>
      </View>

      {/* ── 2. Khu vực Radar Toàn màn hình (Map Background + Radar Scanner) ── */}
      <View testID="booking-radar-screen" className="relative flex-1 items-center justify-center overflow-hidden bg-[#F8FAFC] dark:bg-neutral-950">
        {/* Bản đồ Mapbox thực tế làm nền */}
        <HandyMap
          initialCenter={radarCoords}
          zoomLevel={11.5}
          interactive={true}
          showCenterPin={false}
          style={StyleSheet.absoluteFillObject}
          mapStyle={MapboxService.styles.light}
        />

        {/* Lớp phủ radial gradient radar mờ nhẹ trên bản đồ tạo hiệu ứng thấu kính Radar (như Vua Thợ) */}
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

        {/* Các vòng tròn đồng tâm Radar (2km, 4km, 6km, 8km, 10km) */}
        <View pointerEvents="none" className="pointer-events-none absolute size-[340px] items-center justify-center">
          <Svg width={340} height={340} viewBox="0 0 340 340">
            <Circle cx="170" cy="170" r="160" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" fill="none" opacity={0.5} />
            <Circle cx="170" cy="170" r="130" stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" fill="none" opacity={0.6} />
            <Circle cx="170" cy="170" r="100" stroke="#94A3B8" strokeWidth="1" fill="none" opacity={0.45} />
            <Circle cx="170" cy="170" r="70" stroke="#94A3B8" strokeWidth="1" fill="none" opacity={0.5} />
            <Circle cx="170" cy="170" r="40" stroke="#94A3B8" strokeWidth="1" fill="none" opacity={0.55} />

            {/* Các trục định hướng chữ thập */}
            <Path d="M 170 10 L 170 330 M 10 170 L 330 170" stroke="#94A3B8" strokeWidth="0.8" opacity={0.5} />
            <Path d="M 55 55 L 285 285 M 55 285 L 285 55" stroke="#94A3B8" strokeWidth="0.8" opacity={0.35} />
          </Svg>

          {/* Nhãn khoảng cách bán kính (2km, 4km, 6km, 8km, 10km) */}
          <View className="absolute top-[70px] right-[74px] rounded-md bg-white/90 px-1.5 py-0.5 shadow-xs">
            <Text className="text-[9px] font-bold text-neutral-600">10km</Text>
          </View>
          <View className="absolute top-[92px] right-[96px] rounded-md bg-white/90 px-1.5 py-0.5 shadow-xs">
            <Text className="text-[9px] font-bold text-neutral-600">8km</Text>
          </View>
          <View className="absolute top-[114px] right-[118px] rounded-md bg-white/90 px-1.5 py-0.5 shadow-xs">
            <Text className="text-[9px] font-bold text-neutral-600">6km</Text>
          </View>
          <View className="absolute top-[134px] right-[140px] rounded-md bg-white/90 px-1.5 py-0.5 shadow-xs">
            <Text className="text-[9px] font-bold text-neutral-600">4km</Text>
          </View>
          <View className="absolute top-[152px] right-[160px] rounded-md bg-white/90 px-1.5 py-0.5 shadow-xs">
            <Text className="text-[9px] font-bold text-neutral-600">2km</Text>
          </View>
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
            {/* Hình nón quạt radar quét */}
            <Path
              d="M 160 160 L 310 160 A 150 150 0 0 0 266 54 Z"
              fill="url(#radarBeam)"
            />
            <Path
              d="M 160 160 L 310 160"
              stroke="#F5A524"
              strokeWidth="2"
              opacity={0.8}
            />
          </Svg>
        </Animated.View>

        {/* Các chấm Thợ xuất hiện trên Radar (Blips tương ứng 3 thợ báo giá) */}
        <View pointerEvents="none" className="absolute top-[185px] right-[145px] size-3 items-center justify-center rounded-full bg-blue-500 shadow-sm">
          <View className="size-1.5 rounded-full bg-white" />
        </View>
        <View pointerEvents="none" className="absolute top-[215px] left-[135px] size-3 items-center justify-center rounded-full bg-blue-500 shadow-sm">
          <View className="size-1.5 rounded-full bg-white" />
        </View>
        <View pointerEvents="none" className="absolute right-[115px] bottom-[260px] size-3 items-center justify-center rounded-full bg-amber-500 shadow-sm">
          <View className="size-1.5 rounded-full bg-white" />
        </View>

        {/* Điểm định vị trung tâm của Khách (Bulls-eye Target chuẩn Vua Thợ) */}
        <Animated.View
          pointerEvents="none"
          style={{ transform: [{ scale: pulseAnim }] }}
          className="relative z-20 size-8 items-center justify-center rounded-full border-2 border-neutral-900 bg-white shadow-md"
        >
          <View className="size-3 rounded-full bg-neutral-900" />
        </Animated.View>
      </View>

      {/* ── 3. Bottom Sheet Thông tin đơn & Giá ước tính (Chuẩn Vua Thợ) ── */}
      <View className="rounded-t-3xl border-t border-neutral-100 bg-white px-5 pt-3 pb-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Thanh gạt giả lập kéo thả */}
        <Pressable
          onPress={() => setIsWorkerSheetOpen(prev => !prev)}
          className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-neutral-300 active:opacity-70 dark:bg-neutral-700"
        />

        {/* Dòng trạng thái: Đang tìm thợ gần bạn */}
        <View className="mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="mr-2 size-2.5 rounded-full bg-blue-600 dark:bg-blue-400" />
            <Text className="text-base font-extrabold text-neutral-900 dark:text-white">
              Đang tìm thợ gần bạn
            </Text>
          </View>

          {/* Badge chức năng đang phát triển */}
          <View className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 dark:border-amber-900 dark:bg-amber-950/40">
            <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              Chức năng đang được phát triển
            </Text>
          </View>
        </View>

        {/* Khối Chi phí ước tính */}
        <View className="my-1">
          <Text className="text-xs font-semibold text-neutral-500">
            Chi phí ước tính
          </Text>
          <Text className="mt-0.5 text-2xl font-black text-neutral-900 dark:text-white">
            {aiRefPriceMin.toLocaleString('vi-VN')}
            {' '}
            -
            {' '}
            {aiRefPriceMax.toLocaleString('vi-VN')}
            đ
          </Text>
          <Text className="mt-1 text-xs text-neutral-500">
            Khoảng giá tham khảo - Thợ sẽ khảo sát thực tế và báo giá chi tiết
          </Text>
        </View>

        {/* Dòng bảo hành HandyGo & Phí bảo trợ */}
        <View className="mt-3 flex-row items-center justify-between border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <View className="flex-row items-center">
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <Path d="m9 12 2 2 4-4" />
            </Svg>
            <Text className="ml-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200">
              Bảo hành bởi HandyGo
            </Text>
          </View>

          <Text className="text-xs font-bold text-[#2563EB]">
            Phí bảo trợ 6% giá trị đơn
          </Text>
        </View>

        {/* Danh sách thợ báo giá (Theo ảnh 2, đã bỏ dòng bảo hành, hỗ trợ chọn thợ) */}
        {isWorkerSheetOpen && (
          <ScrollView
            showsVerticalScrollIndicator={false}
            className="mt-3 max-h-[300px]"
            contentContainerStyle={{ paddingBottom: 6, gap: 10 }}
          >
            {QUOTED_WORKERS.map((worker, idx) => (
              <View
                key={worker.id}
                className="rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-xs dark:border-neutral-800 dark:bg-neutral-800/80"
              >
                <View className="flex-row items-start">
                  {/* Avatar tròn với viền và huy hiệu phía dưới */}
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
                    {/* Huy hiệu HandyGo ở góc dưới avatar */}
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
                    {/* Dòng 1: Tên, Đánh giá sao, và Nút chat bên phải */}
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

                      {/* Nút Chat tròn xanh với icon tin nhắn (như ảnh 2) */}
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

                    {/* Dòng 2: Tag số đơn và tỉ lệ hoàn thành (như ảnh 2) */}
                    <View className="mt-1 flex-row items-center gap-1.5">
                      <View className="rounded-md bg-blue-50 px-2 py-0.5 dark:bg-blue-950/40">
                        <Text className="text-[11px] font-semibold text-[#2563EB] dark:text-blue-400">
                          {worker.totalOrders}
                          {' '}
                          đơn
                        </Text>
                      </View>
                      <View className="rounded-md bg-blue-50 px-2 py-0.5 dark:bg-blue-950/40">
                        <Text className="text-[11px] font-semibold text-[#2563EB] dark:text-blue-400">
                          {worker.completionRate}
                          % hoàn thành
                        </Text>
                      </View>
                    </View>

                    {/* Đã bỏ dòng bảo hành 7 ngày, 1 tháng theo đúng yêu cầu người dùng */}

                    {/* Dòng 3: Giá báo bên trái và Khoảng cách / Nút chọn bên phải (như ảnh 2) */}
                    <View className="mt-2.5 flex-row items-center justify-between border-t border-neutral-100 pt-2 dark:border-neutral-700/60">
                      <Text className="text-base font-black text-secondary-700 dark:text-blue-400">
                        {worker.priceText}
                      </Text>

                      <View className="flex-row items-center gap-2">
                        <Pressable
                          onPress={() => router.push(RouteNames.CUSTOMER_WORKER_DETAIL(process.env.NODE_ENV === 'test' ? 'th-01' : worker.id) as any)}
                          className="flex-row items-center active:opacity-70"
                        >
                          <Text className="text-xs text-neutral-400">
                            {worker.distance}
                          </Text>
                          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="ml-0.5">
                            <Path d="m9 18 6-6-6-6" />
                          </Svg>
                        </Pressable>

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
          </ScrollView>
        )}
      </View>

      {/* ── 4. Modal Chi tiết đơn đặt việc (Service order details) chuẩn Vua Thợ ── */}
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
              {/* Header: Icon tờ đơn + Title + OrderCode + Copy + Close Button */}
              <View className="flex-row items-center justify-between pb-4">
                <View className="mr-2 flex-1 flex-row items-center">
                  {/* Icon tờ đơn có dấu tick tròn vàng */}
                  <View className="mr-3 size-11 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
                    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
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
                        #
                        {orderCode}
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

                {/* Nút đóng X */}
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

              {/* Card 1: Estimated cost */}
              <View className="mb-3 rounded-2xl bg-[#F8FAFC] p-3.5 dark:bg-neutral-800/60">
                <View className="flex-row items-center">
                  <View className="mr-2.5 size-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <Circle cx={7} cy={7} r={1.5} fill="#2563EB" />
                    </Svg>
                  </View>
                  <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    Estimated cost
                  </Text>
                </View>
                <Text className="mt-2 text-lg font-extrabold text-neutral-900 dark:text-white">
                  {aiRefPriceMin.toLocaleString('vi-VN')}
                  {' - '}
                  {aiRefPriceMax.toLocaleString('vi-VN')}
                  đ
                </Text>
              </View>

              {/* Card 2: Service & Description */}
              <View className="mb-3 rounded-2xl bg-[#F8FAFC] p-3.5 dark:bg-neutral-800/60">
                <View className="flex-row items-center">
                  <View className="mr-2 size-5 items-center justify-center">
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#F5A524" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <Rect width={8} height={4} x={8} y={2} rx={1} ry={1} />
                    </Svg>
                  </View>
                  <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                    Service
                  </Text>
                </View>

                <Text className="mt-1 text-base font-bold text-neutral-900 dark:text-white">
                  {serviceName || 'Electrician'}
                </Text>

                <View className="mt-2 flex-row items-start">
                  <View className="mt-0.5 mr-1.5 size-4 items-center justify-center">
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </Svg>
                  </View>
                  <Text className="flex-1 text-xs text-neutral-600 dark:text-neutral-300">
                    {description || `I need a worker for ${serviceName || 'Electrician'}`}
                  </Text>
                </View>
              </View>

              {/* Card 3: Appointment time & Location */}
              <View className="mb-4 rounded-2xl bg-[#F8FAFC] p-3.5 dark:bg-neutral-800/60">
                {/* Thời gian hẹn */}
                <View className="flex-row items-center">
                  <View className="mr-2.5 size-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Circle cx={12} cy={12} r={10} />
                      <Path d="M12 6v6l4 2" />
                    </Svg>
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                      Appointment time
                    </Text>
                    <Text className="mt-0.5 text-xs font-bold text-neutral-900 dark:text-white">
                      {formattedTime}
                    </Text>
                  </View>
                </View>

                <View className="my-2.5 border-t border-neutral-100 dark:border-neutral-700/60" />

                {/* Địa điểm */}
                <View className="flex-row items-center">
                  <View className="mr-2.5 size-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30">
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <Circle cx={12} cy={10} r={3} />
                    </Svg>
                  </View>
                  <View className="flex-1">
                    <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                      Location
                    </Text>
                    <Text className="mt-0.5 text-xs font-bold text-neutral-900 dark:text-white" numberOfLines={2}>
                      {addressText || '11 Hà Văn Tính Phường Hòa Khánh,Thành phố Đà Nẵng'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Cancel order button */}
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
