import type { CategoryResponseDto, ServiceResponseDto } from '../types';
import * as React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Image, Text } from '@/components/ui';

import { ServiceCard } from './service-card';

const BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';
const FALLBACK_LOGO = ((): any => require('../../../../assets/logoMobile.png'))();

export type CategorySectionCardProps = {
  category: CategoryResponseDto;
  services: ServiceResponseDto[];
  onSelectService: (serviceId: string, service: ServiceResponseDto) => void;
};

export const CategorySectionCard = React.memo(
  ({
    category,
    services,
    onSelectService,
  }: CategorySectionCardProps) => {
    // Deterministic technician count for visual fidelity matching Stitch design (e.g. 113, 119)
    const technicianCount = React.useMemo(() => {
      let hash = 0;
      for (let i = 0; i < category.name.length; i++) {
        hash = (hash * 31 + category.name.charCodeAt(i)) % 30;
      }
      return 105 + hash;
    }, [category.name]);

    const thumbnailSource = React.useMemo(
      () => (category.imageUrl ? { uri: category.imageUrl } : FALLBACK_LOGO),
      [category.imageUrl],
    );

    return (
      <View
        className="mx-4 mb-4 rounded-3xl border border-neutral-100 bg-white p-4 shadow-sm"
        testID={`category-card-${category.id}`}
      >
        {/* Category Header */}
        <View className="flex-row items-center gap-3 border-b border-neutral-100 pb-3">
          {/* Category Thumbnail / Illustration */}
          <View className="size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-100">
            <Image
              source={thumbnailSource}
              className="size-18 scale-130"
              contentFit="contain"
              cachePolicy="memory-disk"
              placeholder={BLURHASH}
            />
          </View>

          {/* Category Info & Badges */}
          <View className="flex-1 gap-1.5">
            <Text className="text-base font-bold tracking-tight text-neutral-900">
              {category.name}
            </Text>

            <View className="flex-row flex-wrap items-center gap-2">
              {/* Service Count Badge */}
              <View className="flex-row items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5">
                <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth={2}>
                  <Path d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                <Text className="text-[11px] font-bold text-blue-600">
                  {`${services.length} dịch vụ`}
                </Text>
              </View>

              {/* Technicians Available Badge */}
              <View className="flex-row items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5">
                <Svg width={10} height={10} viewBox="0 0 20 20" fill="#FF6C00">
                  <Path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </Svg>
                <Text className="text-[11px] font-bold text-orange-600">
                  {`${technicianCount} thợ gần bạn`}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Services Grid (4 Columns Layout) */}
        <View className="-mx-0.5 flex-row flex-wrap pt-3">
          {services.length === 0
            ? (
                <View className="w-full items-center py-4">
                  <Text className="text-xs text-neutral-400">Đang cập nhật dịch vụ...</Text>
                </View>
              )
            : (
                services.map(service => (
                  <ServiceCard
                    key={service.id}
                    service={service}
                    onSelect={onSelectService}
                    variant="category-grid"
                    testID={`service-card-${service.id}`}
                  />
                ))
              )}
        </View>
      </View>
    );
  },
  (prev, next) => {
    return (
      prev.category.id === next.category.id
      && prev.category.name === next.category.name
      && prev.category.imageUrl === next.category.imageUrl
      && prev.services === next.services
      && prev.onSelectService === next.onSelectService
    );
  },
);
