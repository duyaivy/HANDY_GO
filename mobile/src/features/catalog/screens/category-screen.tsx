/* eslint-disable max-lines-per-function */
import type { CategoryResponseDto, ServiceResponseDto } from '@/features/catalog/types';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as React from 'react';
import {
  FlatList,
  InteractionManager,
  Platform,
  RefreshControl,
} from 'react-native';
import { showMessage } from 'react-native-flash-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';
import { ErrorState, LoadingState } from '@/components/ui';
import { useCategories } from '@/features/catalog/hooks/use-categories';
import { useServices } from '@/features/catalog/hooks/use-services';
import {
  CategoryAiBanner,
  CategorySearchHeader,
  CategorySectionCard,
  EmptySearchResult,
} from '../components';

const StyledSafeAreaView = withUniwind(SafeAreaView);

const STATIC_CATEGORIES_PARAMS = Object.freeze({ isActive: true, limit: 50 });
const STATIC_SERVICES_PARAMS = Object.freeze({ isActive: true, limit: 100 });

type CategoryWithServices = {
  category: CategoryResponseDto;
  services: ServiceResponseDto[];
};

export function CategoryScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ q?: string }>();
  const initialQuery = typeof searchParams.q === 'string' ? searchParams.q : '';

  const [searchQuery, setSearchQuery] = React.useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = React.useState(initialQuery);
  const [isReady, setIsReady] = React.useState(process.env.NODE_ENV === 'test');

  // Defer heavy list rendering until after screen navigation transition finishes
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    const task = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => task.cancel();
  }, []);

  // Debounce search query to prevent re-filtering on every keystroke
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch all active categories
  const {
    data: categoriesData,
    isLoading: categoriesLoading,
    isError: categoriesError,
    refetch: refetchCategories,
  } = useCategories(STATIC_CATEGORIES_PARAMS);
  const categories = React.useMemo(() => categoriesData?.data ?? [], [categoriesData?.data]);

  // Fetch all active services
  const {
    data: servicesData,
    isLoading: servicesLoading,
    isError: servicesError,
    refetch: refetchServices,
  } = useServices(STATIC_SERVICES_PARAMS);
  const allServices = React.useMemo(() => servicesData?.data ?? [], [servicesData?.data]);

  // Group services by categoryId (cached by allServices reference)
  const servicesByCategory = React.useMemo(() => {
    const map: Record<string, ServiceResponseDto[]> = {};
    for (const service of allServices) {
      if (!map[service.categoryId]) {
        map[service.categoryId] = [];
      }
      map[service.categoryId].push(service);
    }
    return map;
  }, [allServices]);

  // Filter categories and their services based on debounced search query
  const filteredCategoriesWithServices = React.useMemo<CategoryWithServices[]>(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) {
      return categories.map(cat => ({
        category: cat,
        services: servicesByCategory[cat.id] ?? [],
      }));
    }

    return categories
      .map((cat) => {
        const catServices = servicesByCategory[cat.id] ?? [];
        const isCatMatch = cat.name.toLowerCase().includes(q);
        const matchingServices = catServices.filter(srv =>
          srv.name.toLowerCase().includes(q) || (srv.description?.toLowerCase().includes(q) ?? false),
        );

        if (isCatMatch) {
          return { category: cat, services: catServices };
        }
        if (matchingServices.length > 0) {
          return { category: cat, services: matchingServices };
        }
        return null;
      })
      .filter((item): item is CategoryWithServices => item !== null);
  }, [categories, servicesByCategory, debouncedQuery]);

  const isLoading = categoriesLoading || servicesLoading;
  const isError = categoriesError || servicesError;

  const handleRetry = React.useCallback(() => {
    refetchCategories();
    refetchServices();
  }, [refetchCategories, refetchServices]);

  const handleBack = React.useCallback(() => {
    router.back();
  }, [router]);

  const handleClearSearch = React.useCallback(() => {
    setSearchQuery('');
    setDebouncedQuery('');
  }, []);

  const handleServiceSelect = React.useCallback((_serviceId: string, service: ServiceResponseDto) => {
    showMessage({
      message: `${service.name}`,
      description: 'Tính năng đặt thợ sẽ sớm ra mắt!',
      type: 'info',
      icon: 'info',
      duration: 2500,
    });
  }, []);

  const renderItem = React.useCallback(
    ({ item }: { item: CategoryWithServices }) => (
      <CategorySectionCard
        category={item.category}
        services={item.services}
        onSelectService={handleServiceSelect}
      />
    ),
    [handleServiceSelect],
  );

  const keyExtractor = React.useCallback((item: CategoryWithServices) => item.category.id, []);

  const renderEmptyComponent = React.useCallback(() => {
    if (isLoading || !isReady) {
      return <LoadingState message="Đang tải danh mục dịch vụ..." />;
    }
    if (isError) {
      return <ErrorState onRetry={handleRetry} />;
    }
    return (
      <EmptySearchResult
        query={debouncedQuery}
        onClear={handleClearSearch}
      />
    );
  }, [isLoading, isReady, isError, handleRetry, debouncedQuery, handleClearSearch]);

  const listData = isLoading || isError || !isReady ? EMPTY_LIST : filteredCategoriesWithServices;

  return (
    <StyledSafeAreaView
      className="flex-1 bg-neutral-100/80"
      style={{ flex: 1, backgroundColor: '#F4F6F9' }}
      edges={['top', 'left', 'right']}
    >
      {/* Top Search Header */}
      <CategorySearchHeader
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onBack={handleBack}
      />

      {/* Categories & Services List with Virtualization */}
      <FlatList
        style={{ flex: 1 }}
        data={listData}
        keyExtractor={keyExtractor}
        ListHeaderComponent={<CategoryAiBanner />}
        renderItem={renderItem}
        ListEmptyComponent={renderEmptyComponent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={LIST_CONTENT_STYLE}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={(
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRetry}
            colors={['#FF6C00']}
            tintColor="#FF6C00"
          />
        )}
      />
    </StyledSafeAreaView>
  );
}

const EMPTY_LIST: CategoryWithServices[] = [];
const LIST_CONTENT_STYLE = {
  paddingBottom: 40,
};
