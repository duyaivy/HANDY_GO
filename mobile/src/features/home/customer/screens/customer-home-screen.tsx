import type { ServiceResponseDto } from '@/features/catalog/types';
import { useRouter } from 'expo-router';
import * as React from 'react';
import { ScrollView } from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';
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

const StyledSafeAreaView = withUniwind(SafeAreaView);

export function CustomerHomeScreen() {
  const router = useRouter();
  const user = useAuthStore.use.user();

  const {
    data: servicesData,
    isLoading: servicesLoading,
    isError: servicesError,
    refetch: refetchServices,
  } = usePopularServices(8);

  const services = React.useMemo(() => servicesData?.data ?? [], [servicesData?.data]);
  const displayName = React.useMemo(
    () => user?.email?.split('@')[0] ?? 'Nguyênnx Quốc Duy',
    [user?.email],
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

  const handleQuickAction = React.useCallback(
    (_actionId: string) => {
      router.push('/customer/category' as never);
    },
    [router],
  );

  const handleServiceSelect = React.useCallback(
    (_serviceId: string, service: ServiceResponseDto) => {
      showMessage({
        message: `${service.name}`,
        description: 'Tính năng đặt thợ sẽ sớm ra mắt!',
        type: 'info',
        icon: 'info',
        duration: 2500,
      });
    },
    [],
  );

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
        {/* Header */}
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
