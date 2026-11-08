import type {
  WorkerPublicProfileData,
  WorkerServiceOfferingItem,
  WorkerServiceRegistrationItem,
} from '@/services/workers/workers-api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import * as React from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  RefreshControl,
  Switch,
  View,
} from 'react-native';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons/arrow-left';
import { ArrowRight } from '@/components/ui/icons/arrow-right';
import {
  ClockIcon,
  CloseIcon,
  EditIcon,
  OrdersIcon,
  PlusIcon,
  WalletIcon,
  WrenchIcon,
} from '@/components/ui/icons/handy-icons';
import { Image } from '@/components/ui/image';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { useUserProfile } from '@/features/profile/hooks/use-user-profile';
import { WorkersApi } from '@/services/workers/workers-api';
import { useAuthStore } from '@/stores/use-auth-store';

function formatCurrency(val?: number | null): string {
  if (!val || val === 0) {
    return '0 đ';
  }
  return `${val.toLocaleString('vi-VN')} đ`;
}

type MainTab = 'my_services' | 'registrations';

const SERVICE_CATEGORY_IMAGES: Record<string, string> = {
  'cat-dien-lanh': 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400&q=80',
  'cat-dien-nuoc': 'https://images.unsplash.com/photo-1581244277943-fe4a9c777189?w=400&q=80',
  'cat-co-khi': 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=400&q=80',
  'cat-xay-dung': 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=400&q=80',
  'cat-do-go': 'https://images.unsplash.com/photo-1538688525198-9b88f6f53126?w=400&q=80',
  'cat-thiet-bi-nha-bep': 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?w=400&q=80',
};

export function WorkerSkillsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore.use.user();
  const userId = user?.id;
  const { profile } = useUserProfile();
  const workerIdentifier = profile?.workerProfile?.id || userId;

  const [activeTab, setActiveTab] = React.useState<MainTab>('my_services');
  const [refreshing, setRefreshing] = React.useState(false);

  // Local active toggle state for approved services
  const [servicesActiveState, setServicesActiveState] = React.useState<Record<string, boolean>>({});

  const handleCancelRegistration = React.useCallback(
    (regId: string, serviceTitle?: string) => {
      Alert.alert(
        'Hủy yêu cầu đăng ký',
        `Bạn có chắc chắn muốn hủy yêu cầu đăng ký nghiệp vụ "${serviceTitle || 'này'}" không? Dữ liệu đơn sẽ bị xóa khỏi danh sách chờ phê duyệt.`,
        [
          { text: 'Quay lại', style: 'cancel' },
          {
            text: 'Hủy yêu cầu',
            style: 'destructive',
            onPress: async () => {
              try {
                await WorkersApi.cancelServiceRegistration(regId);
                await queryClient.invalidateQueries({
                  queryKey: ['worker-my-service-registrations'],
                });
                Alert.alert('Đã hủy yêu cầu', 'Đơn đăng ký dịch vụ đã được hủy thành công.');
              }
              catch (err: any) {
                const msg = err?.response?.data?.message || err?.message || 'Không thể hủy yêu cầu đăng ký.';
                Alert.alert('Lỗi', Array.isArray(msg) ? msg.join('\n') : msg);
              }
            },
          },
        ],
      );
    },
    [queryClient],
  );

  const handleEditRegistration = React.useCallback(
    (reg: WorkerServiceRegistrationItem) => {
      router.push({
        pathname: RouteNames.WORKER_SKILLS_REGISTER as any,
        params: {
          editRegistrationId: reg.id,
          registrationData: JSON.stringify(reg),
        },
      });
    },
    [router],
  );

  const handleBack = React.useCallback(() => {
    if (typeof router.canGoBack === 'function' && router.canGoBack()) {
      router.back();
    }
    else if (typeof router.back === 'function') {
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

  // Query: Worker Public Profile (with existing active services)
  const profileQuery = useQuery<WorkerPublicProfileData>({
    queryKey: ['worker-public-profile-services', workerIdentifier],
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

  // Query: Worker Service Registrations History
  const registrationsQuery = useQuery<WorkerServiceRegistrationItem[]>({
    queryKey: ['worker-my-service-registrations'],
    queryFn: async () => {
      const res = await WorkersApi.getMyServiceRegistrations();
      return res.data ?? [];
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  });

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        profileQuery.refetch(),
        registrationsQuery.refetch(),
      ]);
    }
    finally {
      setRefreshing(false);
    }
  }, [profileQuery, registrationsQuery]);

  const handleToggleService = (serviceId: string, currentVal: boolean) => {
    setServicesActiveState(prev => ({
      ...prev,
      [serviceId]: !currentVal,
    }));
  };

  const approvedServices: WorkerServiceOfferingItem[] = profileQuery.data?.services ?? [];
  // Chỉ hiển thị các đơn đang chờ hoặc bị từ chối bởi Admin (ẩn các đơn thợ đã chủ động hủy)
  const registrations: WorkerServiceRegistrationItem[] = React.useMemo(() => {
    return (registrationsQuery.data ?? []).filter(
      reg => !reg.rejectionReason?.includes('hủy'),
    );
  }, [registrationsQuery.data]);

  // Row 1 Statistics
  const totalApproved = approvedServices.length;
  const activeCount = approvedServices.filter((s) => {
    return servicesActiveState[s.id] !== undefined ? servicesActiveState[s.id] : s.isActive;
  }).length;

  const totalOrders = profileQuery.data?.stats?.orderCountTotal
    ?? profile?.workerProfile?.orderCountTotal
    ?? 0;

  // Total revenue calculated or default to 0
  const totalRevenue = approvedServices.reduce((sum, s) => sum + (s.revenue ?? 0), 0);

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
      <View testID="worker-skills-screen" className="flex-1 pb-12">
        {/* Header Bar */}
        <View className="relative h-12 flex-row items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Quay lại"
            testID="app-bar-back-btn"
            onPress={handleBack}
            className="size-10 items-center justify-center rounded-full active:bg-neutral-100 dark:active:bg-neutral-800"
          >
            <ArrowLeft width={10} height={20} color="#374151" />
          </Pressable>

          <View className="items-center">
            <Text className="text-base font-bold text-neutral-900 dark:text-white">
              Dịch vụ & Kỹ năng
            </Text>
          </View>

          <View className="size-10" />
        </View>

        <View className="p-4">
          {/* ROW 1: 3 Thống kê trên cùng 1 hàng: Nghiệp vụ hoạt động x/y, Tổng đơn đã nhận, Doanh thu */}
          <View testID="worker-skills-stats-row" className="flex-row items-center gap-2.5">
            {/* Stat 1: Số nghiệp vụ đang hoạt động x/y */}
            <View className="flex-1 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <View className="mb-2 size-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60">
                <WrenchIcon color="#2563EB" size={15} />
              </View>
              <Text
                testID="worker-active-services-count"
                className="text-base font-bold text-neutral-900 dark:text-white"
              >
                {activeCount}
                /
                {totalApproved}
              </Text>
              <Text className="mt-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                Nghiệp vụ hoạt động
              </Text>
            </View>

            {/* Stat 2: Tổng đơn dịch vụ đã nhận */}
            <View className="flex-1 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <View className="mb-2 size-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60">
                <OrdersIcon color="#059669" size={15} />
              </View>
              <Text
                testID="worker-total-service-orders"
                className="text-base font-bold text-emerald-700 dark:text-emerald-400"
              >
                {totalOrders}
              </Text>
              <Text className="mt-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                Tổng đơn đã nhận
              </Text>
            </View>

            {/* Stat 3: Doanh thu */}
            <View className="flex-1 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <View className="mb-2 size-7 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/60">
                <WalletIcon color="#D97706" size={15} />
              </View>
              <Text
                testID="worker-total-service-revenue"
                className="text-base font-bold text-amber-700 dark:text-amber-400"
                numberOfLines={1}
              >
                {formatCurrency(totalRevenue)}
              </Text>
              <Text className="mt-0.5 text-[11px] font-medium text-neutral-500 dark:text-neutral-400" numberOfLines={1}>
                Doanh thu
              </Text>
            </View>
          </View>

          {/* ROW 2: Banner Thêm dịch vụ kỹ năng mới */}
          <Pressable
            testID="add-professional-skills-btn"
            accessibilityRole="button"
            accessibilityLabel="Thêm dịch vụ kỹ năng mới"
            onPress={() => router.push(RouteNames.WORKER_SKILLS_REGISTER as any)}
            className="mt-4 flex-row items-center justify-between rounded-2xl border border-blue-200 bg-blue-50/90 p-4 shadow-xs active:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40"
          >
            <View className="flex-1 flex-row items-center pr-2">
              <View className="mr-3 size-10 items-center justify-center rounded-xl bg-blue-600 shadow-xs">
                <PlusIcon size={20} color="#FFFFFF" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
                  + Thêm dịch vụ kỹ năng mới
                </Text>
                <Text className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400" numberOfLines={1}>
                  Đăng ký thêm ngành nghề & nghiệp vụ mới
                </Text>
              </View>
            </View>
            <View
              testID="add-service-arrow-btn"
              className="size-8 items-center justify-center rounded-full bg-blue-600/10 dark:bg-blue-900/40"
            >
              <ArrowRight color="#2563EB" width={8} height={16} />
            </View>
          </Pressable>

          {/* ROW 3: Cụm 2 Tabs "Nghiệp vụ của bạn" và "Chờ phê duyệt dịch vụ" */}
          <View className="mt-5">
            <View className="flex-row border-b border-neutral-200 bg-white px-2 pt-1 dark:border-neutral-800 dark:bg-neutral-900">
              <Pressable
                testID="tab-my-services"
                onPress={() => setActiveTab('my_services')}
                className={`mr-6 border-b-2 pb-3 ${
                  activeTab === 'my_services'
                    ? 'border-blue-600'
                    : 'border-transparent'
                }`}
              >
                <Text
                  className={`text-sm font-bold ${
                    activeTab === 'my_services'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  Nghiệp vụ của bạn (
                  {approvedServices.length}
                  )
                </Text>
              </Pressable>

              <Pressable
                testID="tab-registrations"
                onPress={() => setActiveTab('registrations')}
                className={`border-b-2 pb-3 ${
                  activeTab === 'registrations'
                    ? 'border-blue-600'
                    : 'border-transparent'
                }`}
              >
                <Text
                  className={`text-sm font-bold ${
                    activeTab === 'registrations'
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-neutral-500 dark:text-neutral-400'
                  }`}
                >
                  Chờ phê duyệt dịch vụ (
                  {registrations.length}
                  )
                </Text>
              </Pressable>
            </View>

            {/* TAB CONTENT 1: Nghiệp vụ của bạn (Đã được Admin duyệt) */}
            {activeTab === 'my_services' && (
              <View className="mt-3">
                {profileQuery.isLoading && (
                  <View className="items-center justify-center py-8">
                    <ActivityIndicator size="small" color="#2563EB" />
                    <Text className="mt-2 text-xs text-neutral-500">Đang tải nghiệp vụ của bạn...</Text>
                  </View>
                )}

                {!profileQuery.isLoading && approvedServices.length === 0 && (
                  <View
                    testID="worker-services-empty"
                    className="mt-2 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <View className="size-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/50">
                      <WrenchIcon size={24} color="#2563EB" />
                    </View>
                    <Text className="mt-3 text-sm font-bold text-neutral-900 dark:text-white">
                      Chưa có nghiệp vụ nào được duyệt
                    </Text>
                    <Text className="mt-1 text-center text-xs text-neutral-500 dark:text-neutral-400">
                      Hãy nhấn "+ Thêm dịch vụ kỹ năng mới" ở trên để gửi hồ sơ nghiệp vụ cho Admin phê duyệt.
                    </Text>
                    <Button
                      label="Thêm dịch vụ ngay"
                      size="sm"
                      variant="default"
                      className="mt-4 bg-blue-600"
                      textClassName="text-white font-semibold"
                      onPress={() => router.push(RouteNames.WORKER_SKILLS_REGISTER as any)}
                    />
                  </View>
                )}

                {!profileQuery.isLoading && approvedServices.length > 0 && (
                  <View testID="worker-services-list" className="space-y-3.5">
                    {approvedServices.map((service, idx) => {
                      const isServiceActive
                        = servicesActiveState[service.id] !== undefined
                          ? servicesActiveState[service.id]
                          : service.isActive;

                      const serviceOrders = service.orderCount ?? 0;
                      const serviceRevenue = service.revenue ?? 0;

                      return (
                        <View
                          key={service.id || `service-${idx}`}
                          testID={`approved-service-card-${service.id}`}
                          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                        >
                          {/* Top Row: Service Image, Name, Status Badge & Toggle Switch */}
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1 flex-row items-center gap-3">
                              {/* Hình ảnh mô phỏng nghiệp vụ */}
                              {service.imageUrl
                                ? (
                                    <Image
                                      source={{ uri: service.imageUrl }}
                                      className="size-14 rounded-xl border border-neutral-100 dark:border-neutral-800"
                                    />
                                  )
                                : (
                                    <View className="size-14 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950">
                                      <WrenchIcon size={24} color="#2563EB" />
                                    </View>
                                  )}

                              {/* Tên nghiệp vụ & Kinh nghiệm */}
                              <View className="flex-1 pr-2">
                                <Text
                                  testID={`service-title-${service.id}`}
                                  className="text-sm font-bold text-neutral-900 dark:text-white"
                                  numberOfLines={2}
                                >
                                  {service.title || 'Nghiệp vụ kỹ thuật'}
                                </Text>

                                <View className="mt-1 flex-row items-center gap-1.5">
                                  {/* Trạng thái hoạt động / tạm dừng */}
                                  <View
                                    className={`rounded-full px-2 py-0.5 ${
                                      isServiceActive
                                        ? 'bg-emerald-100 dark:bg-emerald-950'
                                        : 'bg-neutral-100 dark:bg-neutral-800'
                                    }`}
                                  >
                                    <Text
                                      className={`text-[10px] font-bold ${
                                        isServiceActive
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : 'text-neutral-500 dark:text-neutral-400'
                                      }`}
                                    >
                                      {isServiceActive ? 'Hoạt động' : 'Tạm dừng'}
                                    </Text>
                                  </View>

                                  <Text className="text-[10px] text-neutral-400">
                                    •
                                    {' '}
                                    {service.experienceYears ?? 0}
                                    {' '}
                                    năm KN
                                  </Text>
                                </View>
                              </View>
                            </View>

                            {/* Nút bật / tắt dịch vụ (Switch toggle) */}
                            <View className="items-end">
                              <Switch
                                testID={`toggle-service-switch-${service.id}`}
                                value={isServiceActive}
                                onValueChange={() => handleToggleService(service.id, isServiceActive)}
                                trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
                                thumbColor={isServiceActive ? '#2563EB' : '#9CA3AF'}
                              />
                              <Text className="mt-0.5 text-[9px] font-medium text-neutral-400">
                                {isServiceActive ? 'Đang bật' : 'Đang tắt'}
                              </Text>
                            </View>
                          </View>

                          {/* Mô tả nghiệp vụ nếu có */}
                          {service.description && (
                            <Text
                              className="mt-2.5 text-xs text-neutral-600 dark:text-neutral-400"
                              numberOfLines={2}
                            >
                              {service.description}
                            </Text>
                          )}

                          {/* Bottom Row: Số đơn đã đặt & Doanh thu đã đạt ở dịch vụ này */}
                          <View className="mt-3 flex-row items-center justify-between border-t border-neutral-100 pt-2.5 dark:border-neutral-800">
                            {/* Số đơn đã đặt ở dịch vụ này */}
                            <View className="flex-row items-center gap-1.5">
                              <OrdersIcon size={14} color="#6B7280" />
                              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                                Số đơn:
                                {' '}
                                <Text className="font-bold text-neutral-900 dark:text-white">
                                  {serviceOrders}
                                  {' '}
                                  đơn
                                </Text>
                              </Text>
                            </View>

                            {/* Doanh thu đã đạt ở dịch vụ này */}
                            <View className="flex-row items-center gap-1.5">
                              <WalletIcon size={14} color="#D97706" />
                              <Text className="text-xs text-neutral-500 dark:text-neutral-400">
                                Doanh thu:
                                {' '}
                                <Text className="font-bold text-amber-700 dark:text-amber-400">
                                  {formatCurrency(serviceRevenue)}
                                </Text>
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* TAB CONTENT 2: Chờ phê duyệt dịch vụ (Thông tin dịch vụ đã gửi lên Admin duyệt) */}
            {activeTab === 'registrations' && (
              <View className="mt-3">
                {registrationsQuery.isLoading && (
                  <View className="items-center justify-center py-8">
                    <ActivityIndicator size="small" color="#2563EB" />
                    <Text className="mt-2 text-xs text-neutral-500">Đang tải danh sách chờ phê duyệt...</Text>
                  </View>
                )}

                {!registrationsQuery.isLoading && registrations.length === 0 && (
                  <View className="mt-2 items-center justify-center rounded-2xl border border-dashed border-neutral-300 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
                    <ClockIcon size={24} color="#6B7280" />
                    <Text className="mt-3 text-sm font-bold text-neutral-900 dark:text-white">
                      Không có dịch vụ nào đang chờ duyệt
                    </Text>
                    <Text className="mt-1 text-center text-xs text-neutral-500 dark:text-neutral-400">
                      Các dịch vụ mới gửi sẽ xuất hiện tại đây trong thời gian chờ Admin thẩm định và phê duyệt.
                    </Text>
                  </View>
                )}

                {!registrationsQuery.isLoading && registrations.length > 0 && (
                  <View testID="worker-registrations-list" className="space-y-3">
                    {registrations.map((reg) => {
                      const isApproved = reg.status === 'approved';
                      const isPending = reg.status === 'pending';
                      const isCancelled
                        = reg.status === 'rejected'
                          && Boolean(reg.rejectionReason?.includes('hủy'));

                      const badgeClass = isApproved
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : isPending
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : isCancelled
                            ? 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300';

                      const statusText = isApproved
                        ? 'Đã duyệt'
                        : isPending
                          ? 'Chờ phê duyệt'
                          : isCancelled
                            ? 'Đã hủy'
                            : 'Bị từ chối';

                      const serviceItem = reg.services?.[0];
                      const serviceTitle = serviceItem?.title || serviceItem?.serviceName || 'Nghiệp vụ dịch vụ';
                      const catId = reg.categoryIds?.[0] || serviceItem?.categoryId || '';
                      const serviceMockImage = serviceItem?.imageUrl || (catId ? SERVICE_CATEGORY_IMAGES[catId] : null);

                      return (
                        <View
                          key={reg.id}
                          testID={`registration-card-${reg.id}`}
                          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
                        >
                          {/* Top Row: Hình ảnh mô phỏng dịch vụ, Tên dịch vụ, Trạng thái dịch vụ */}
                          <View className="flex-row items-center justify-between">
                            <View className="flex-1 flex-row items-center gap-3 pr-2">
                              {/* Hình ảnh mô phỏng dịch vụ */}
                              {serviceMockImage
                                ? (
                                    <Image
                                      source={{ uri: serviceMockImage }}
                                      className="size-16 rounded-xl border border-neutral-100 dark:border-neutral-800"
                                      contentFit="cover"
                                    />
                                  )
                                : (
                                    <View className="size-16 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950">
                                      <WrenchIcon size={24} color="#2563EB" />
                                    </View>
                                  )}

                              {/* Tên dịch vụ (Ẩn ngành & khu vực bên ngoài) */}
                              <View className="flex-1">
                                <Text
                                  testID={`registration-title-${reg.id}`}
                                  className="text-sm font-bold text-neutral-900 dark:text-white"
                                  numberOfLines={2}
                                >
                                  {serviceTitle}
                                </Text>
                              </View>
                            </View>

                            {/* Badge trạng thái dịch vụ */}
                            <View className={`rounded-full px-2.5 py-1 ${badgeClass}`}>
                              <Text testID={`registration-status-${reg.id}`} className="text-[10px] font-bold">
                                {statusText}
                              </Text>
                            </View>
                          </View>

                          {/* Lý do từ chối nếu có hoặc thông báo thợ tự hủy */}
                          {reg.rejectionReason && (
                            <View
                              className={`mt-2.5 rounded-xl p-2.5 ${
                                isCancelled
                                  ? 'bg-neutral-100 dark:bg-neutral-800/60'
                                  : 'bg-red-50 dark:bg-red-950/40'
                              }`}
                            >
                              <Text
                                className={`text-xs font-medium ${
                                  isCancelled
                                    ? 'text-neutral-600 dark:text-neutral-400'
                                    : 'text-red-700 dark:text-red-300'
                                }`}
                              >
                                {isCancelled
                                  ? 'Đơn đăng ký đã được bạn chủ động hủy'
                                  : `Lý do từ chối: ${reg.rejectionReason}`}
                              </Text>
                            </View>
                          )}

                          {/* Action Buttons: Chỉnh sửa & Hủy yêu cầu */}
                          <View className="mt-3.5 flex-row items-center gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
                            {/* Nút Chỉnh sửa dịch vụ */}
                            <Pressable
                              testID={`edit-registration-btn-${reg.id}`}
                              onPress={() => handleEditRegistration(reg)}
                              className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50/70 py-2 active:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40"
                            >
                              <EditIcon size={14} color="#2563EB" />
                              <Text className="text-xs font-bold text-blue-700 dark:text-blue-300">
                                Chỉnh sửa
                              </Text>
                            </Pressable>

                            {/* Nút Hủy yêu cầu (chỉ khi pending) */}
                            {isPending && (
                              <Pressable
                                testID={`cancel-registration-btn-${reg.id}`}
                                onPress={() => handleCancelRegistration(reg.id, serviceTitle)}
                                className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50/70 py-2 active:bg-red-100 dark:border-red-900/60 dark:bg-red-950/40"
                              >
                                <CloseIcon size={14} color="#DC2626" />
                                <Text className="text-xs font-bold text-red-700 dark:text-red-400">
                                  Hủy yêu cầu
                                </Text>
                              </Pressable>
                            )}
                          </View>

                          <View className="mt-2 flex-row items-center justify-between text-[10px] text-neutral-400">
                            <Text className="text-[10px] text-neutral-400">
                              {`Ngày gửi: ${new Date(reg.createdAt).toLocaleDateString('vi-VN')}`}
                            </Text>
                            <Text className="text-[10px] text-neutral-400">
                              {`Mã đơn: #${reg.id.slice(0, 8)}`}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </View>
    </Screen>
  );
}
