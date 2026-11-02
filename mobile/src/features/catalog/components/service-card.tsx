import type { ServiceResponseDto } from '../types';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from '@/components/ui/image';
import { Text } from '@/components/ui/text';

const FALLBACK_LOGO = require('../../../../assets/logoMobile.png');

const BLURHASH_PLACEHOLDER = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

export type ServiceCardProps = {
  service: ServiceResponseDto;
  onSelect: (serviceId: string, service: ServiceResponseDto) => void;
  variant?: 'grid' | 'list' | 'category-grid';
  testID?: string;
};

/**
 * ServiceCardCategoryGrid – Category Screen 4-column layout
 * Matches Stitch design: soft rounded container, service icon inside, centered label.
 */
const ServiceCardCategoryGrid = React.memo(({
  service,
  onSelect,
  testID,
}: Omit<ServiceCardProps, 'variant'>) => {
  const handlePress = React.useCallback(() => {
    onSelect(service.id, service);
  }, [service, onSelect]);

  const imageSource = React.useMemo(
    () => (service.iconUrl ? { uri: service.iconUrl } : FALLBACK_LOGO),
    [service.iconUrl],
  );

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      className="mb-4 w-1/4 items-center px-0.5 active:scale-95 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`Dịch vụ: ${service.name}`}
    >
      <View className="size-[74px] items-center justify-center">
        <Image
          source={imageSource}
          className="size-[72px]"
          contentFit="contain"
          cachePolicy="memory-disk"
          placeholder={BLURHASH_PLACEHOLDER}
        />
      </View>
      <Text className="mt-1 text-center text-xs/4 font-bold text-neutral-900" numberOfLines={2}>
        {service.name}
      </Text>
    </Pressable>
  );
});

/**
 * ServiceCardGrid – Home Screen Popular Services (4-column grid)
 * Clean icon image without background tint, enlarged for prominence.
 */
const ServiceCardGrid = React.memo(({
  service,
  onSelect,
  testID,
}: Omit<ServiceCardProps, 'variant'>) => {
  const handlePress = React.useCallback(() => {
    onSelect(service.id, service);
  }, [service, onSelect]);

  const imageSource = React.useMemo(
    () => (service.iconUrl ? { uri: service.iconUrl } : FALLBACK_LOGO),
    [service.iconUrl],
  );

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      className="flex-1 items-center px-px py-0.5 active:scale-95 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`Dịch vụ: ${service.name}`}
    >
      <View className="size-[74px] items-center justify-center">
        <Image
          source={imageSource}
          className="size-[72px]"
          contentFit="contain"
          cachePolicy="memory-disk"
          placeholder={BLURHASH_PLACEHOLDER}
        />
      </View>
      <Text className="mt-1 min-h-[30px] text-center text-[12px] leading-[15px] font-semibold text-neutral-900" numberOfLines={2}>
        {service.name}
      </Text>
    </Pressable>
  );
});

/**
 * ServiceCardList – Horizontal list card variant
 */
const ServiceCardList = React.memo(({
  service,
  onSelect,
  testID,
}: Omit<ServiceCardProps, 'variant'>) => {
  const handlePress = React.useCallback(() => {
    onSelect(service.id, service);
  }, [service, onSelect]);

  const imageSource = React.useMemo(
    () => (service.iconUrl ? { uri: service.iconUrl } : FALLBACK_LOGO),
    [service.iconUrl],
  );

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      className="flex-row items-center gap-3 rounded-2xl bg-white p-3.5 shadow-sm active:opacity-85"
      accessibilityRole="button"
      accessibilityLabel={`Dịch vụ: ${service.name}`}
    >
      <View className="size-16 shrink-0 overflow-hidden rounded-xl bg-primary-50">
        <Image
          source={imageSource}
          className="size-full"
          contentFit="cover"
          cachePolicy="memory-disk"
          placeholder={BLURHASH_PLACEHOLDER}
        />
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-[15px]/5 font-bold text-neutral-900" numberOfLines={1}>
          {service.name}
        </Text>
        {Boolean(service.description) && (
          <Text className="text-xs/4 text-neutral-600" numberOfLines={2}>
            {service.description}
          </Text>
        )}
        {Boolean(service.category?.name) && (
          <Text className="mt-0.5 text-[11px] font-semibold text-primary-600" numberOfLines={1}>
            {service.category?.name}
          </Text>
        )}
      </View>
      <View className="w-6 items-center">
        <Text className="text-[22px] font-light text-primary-600">›</Text>
      </View>
    </Pressable>
  );
});

export const ServiceCard = React.memo(({
  variant = 'grid',
  ...props
}: ServiceCardProps) => {
  if (variant === 'list') {
    return <ServiceCardList {...props} />;
  }
  if (variant === 'category-grid') {
    return <ServiceCardCategoryGrid {...props} />;
  }
  return <ServiceCardGrid {...props} />;
});
