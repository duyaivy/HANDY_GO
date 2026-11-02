import type { ServiceResponseDto } from '@/features/catalog/types';
import * as React from 'react';
import { Pressable, TouchableOpacity, View } from 'react-native';
import { LoadingState, Text } from '@/components/ui';
import { ServiceCard } from '@/features/catalog/components/service-card';

export type PopularServicesSectionProps = {
  services: ServiceResponseDto[];
  isLoading: boolean;
  isError: boolean;
  onSelectService: (serviceId: string, service: ServiceResponseDto) => void;
  onViewAll: () => void;
  onRetry: () => void;
};

export const PopularServicesSection = React.memo(({
  services,
  isLoading,
  isError,
  onSelectService,
  onViewAll,
  onRetry,
}: PopularServicesSectionProps) => {
  // Chunk services into rows of 4 for clean, high-performance flexbox grid layout without nested VirtualizedLists
  const rows = React.useMemo(() => {
    const chunked: ServiceResponseDto[][] = [];
    for (let i = 0; i < services.length; i += 4) {
      chunked.push(services.slice(i, i + 4));
    }
    return chunked;
  }, [services]);

  return (
    <View className="gap-2.5">
      {/* Header */}
      <View className="mb-0.5 flex-row items-center justify-between">
        <Text className="text-[17px] font-extrabold tracking-tight text-neutral-900">
          Dịch vụ phổ biến
        </Text>
        <TouchableOpacity
          onPress={onViewAll}
          accessibilityRole="button"
          accessibilityLabel="Xem tất cả dịch vụ"
          className="active:opacity-70"
        >
          <Text className="text-[13px] font-bold text-primary-600">
            Xem tất cả ›
          </Text>
        </TouchableOpacity>
      </View>

      {/* Loading State */}
      {isLoading && (
        <LoadingState message="Đang tải dịch vụ..." size="small" />
      )}

      {/* Error State */}
      {isError && !isLoading && (
        <Pressable
          className="items-center rounded-xl bg-red-100 p-4 active:opacity-80"
          onPress={onRetry}
        >
          <Text className="text-center text-[13px] font-medium text-red-600">
            Không tải được dịch vụ. Nhấn để thử lại.
          </Text>
        </Pressable>
      )}

      {/* Empty State */}
      {!isLoading && !isError && services.length === 0 && (
        <View className="items-center p-6">
          <Text className="text-sm text-neutral-500">
            Chưa có dịch vụ nào.
          </Text>
        </View>
      )}

      {/* High-Performance Grid */}
      {!isLoading && services.length > 0 && (
        <View testID="popular-services-grid" className="gap-1">
          {rows.map((row) => {
            const firstId = row[0]?.id ?? 'row';
            return (
              <View key={`row-${firstId}`} className="flex-row gap-1">
                {row.map(service => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    onSelect={onSelectService}
                    variant="grid"
                    testID={`service-card-${service.id}`}
                  />
                ))}
                {/* Fill remaining space if last row has less than 4 items */}
                {row.length < 4 && Array.from({ length: 4 - row.length }).map((_, emptyIndex) => (
                  <View key={`empty-${firstId}-${emptyIndex + 1}`} className="flex-1" />
                ))}
              </View>
            );
          })}

        </View>
      )}
    </View>
  );
});
