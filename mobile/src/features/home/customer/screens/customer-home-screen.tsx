/* eslint-disable max-lines-per-function */
import type { ServiceResponseDto } from '@/features/catalog/types';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';
import { Button } from '@/components/ui/button';
import { MapPinIcon, SparklesIcon } from '@/components/ui/icons';
import { Text } from '@/components/ui/text';
import { RouteNames } from '@/constants/route-names';
import { usePopularServices } from '@/features/catalog/hooks/use-services';
import { useAuthStore } from '@/stores/use-auth-store';
import {
  AiDiagnosisBanner,
  HeroBanner,
  HomeHeader,
  NearbyTechnicians,
  PopularServicesSection,
  PromoBanner,
  UtilityLinks,
} from '../components';
import { CustomerGuestOverview } from '../components/customer-guest-overview';

const StyledSafeAreaView = withUniwind(SafeAreaView);

export function CustomerHomeScreen() {
  const router = useRouter();
  const user = useAuthStore.use.user();
  const isAuthenticated = useAuthStore.use.isAuthenticated();

  const {
    data: servicesData,
    isLoading: servicesLoading,
    isError: servicesError,
    refetch: refetchServices,
  } = usePopularServices(8);

  const services = React.useMemo(() => servicesData?.data ?? [], [servicesData?.data]);
  const displayName = React.useMemo(
    () => (user as any)?.fullName || user?.email?.split('@')[0] || 'Khách hàng',
    [user],
  );

  const handleSearch = React.useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed) {
        router.push({
          pathname: '/customer/category' as never,
          params: { q: trimmed },
        });
      }
      else {
        router.push('/customer/category' as never);
      }
    },
    [router],
  );

  const handleViewAllServices = React.useCallback(() => {
    router.push('/customer/category' as never);
  }, [router]);

  const handleServiceSelect = React.useCallback(
    (serviceId: string, service?: ServiceResponseDto) => {
      router.push({
        pathname: RouteNames.CUSTOMER_BOOKING,
        params: {
          serviceId: serviceId || 'srv-01',
          serviceName: service?.name || 'Sửa ống nước',
        },
      } as any);
    },
    [router],
  );

  const handleSwitchToWorker = () => {
    const { isAuthenticated: isAuth, user: currentUser } = useAuthStore.getState();
    if (isAuth && currentUser) {
      useAuthStore.getState().setActiveMode('Worker');
    }
    else {
      useAuthStore.getState().setGuestRole('Worker');
    }
    router.replace(RouteNames.WORKER_HOME as any);
  };

  if (!isAuthenticated || !user) {
    return <CustomerGuestOverview />;
  }

  return (
    <StyledSafeAreaView
      className="flex-1 bg-neutral-50"
      style={{ flex: 1, backgroundColor: '#F8F9FA' }}
      edges={['top']}
    >
      <ScrollView
        className="flex-1"
        style={{ flex: 1 }}
        contentContainerStyle={SCROLL_CONTENT_STYLE}
        showsVerticalScrollIndicator={false}
        testID="home-customer-screen"
      >
        {/* Top Location & Role Switcher Bar */}
        <View className="flex-row items-center justify-between pt-1">
          <Pressable
            testID="home-location-selector"
            className="flex-row items-center active:opacity-75"
            onPress={() => router.push(RouteNames.CUSTOMER_SEARCH_ADDRESS as any)}
            accessibilityRole="button"
            accessibilityLabel="Chọn vị trí Hải Châu, Đà Nẵng"
          >
            <MapPinIcon size={16} color="#EF4444" />
            <Text className="ml-1 text-xs font-semibold text-neutral-800">
              Hải Châu, Đà Nẵng
            </Text>
          </Pressable>
          <Pressable
            testID="home-role-switch-chip"
            onPress={handleSwitchToWorker}
            accessibilityRole="button"
            accessibilityLabel="Đổi sang App Thợ"
            className="flex-row items-center rounded-full bg-[#F5A524] px-2.5 py-1 shadow-xs active:opacity-80"
          >
            <Text className="text-xs font-bold text-white">
              App Thợ ⇄
            </Text>
          </Pressable>
        </View>

        {/* Guest Mode Banner (Ảnh 3) */}
        {!isAuthenticated && (
          <View
            testID="guest-banner"
            className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-xs"
          >
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <View className="flex-row items-center">
                  <SparklesIcon size={16} color="#D97706" />
                  <Text className="ml-1 text-sm font-bold text-amber-900">
                    Chào mừng bạn đến với HandyGo!
                  </Text>
                </View>
                <Text className="mt-1 text-xs text-amber-800">
                  Đăng nhập ngay để nhận ưu đãi và đặt thợ nhanh nhất
                </Text>
              </View>
              <Button
                testID="guest-login-btn"
                label="Đăng nhập"
                variant="default"
                className="h-8 rounded-xl bg-[#F5A524] px-3.5"
                textClassName="text-xs font-bold"
                onPress={() => router.push(RouteNames.AUTH_LOGIN as any)}
              />
            </View>
          </View>
        )}

        {/* Header (Ảnh 9) */}
        <HomeHeader displayName={displayName} />

        {/* Hero Banner with Search */}
        <HeroBanner onSearch={handleSearch} />

        {/* AI Diagnosis Banner */}
        <AiDiagnosisBanner />

        {/* Popular Services Section */}
        <PopularServicesSection
          services={services}
          isLoading={servicesLoading}
          isError={servicesError}
          onSelectService={handleServiceSelect}
          onViewAll={handleViewAllServices}
          onRetry={refetchServices}
        />

        {/* Promo Event Banner */}
        <PromoBanner />

        {/* Utility Links Grid (2x2) */}
        <UtilityLinks />

        {/* Nearby Available Technicians */}
        <NearbyTechnicians />
      </ScrollView>
    </StyledSafeAreaView>
  );
}

const SCROLL_CONTENT_STYLE = {
  paddingHorizontal: 16,
  paddingTop: 8,
  paddingBottom: 32,
  gap: 16,
  flexGrow: 1,
};
