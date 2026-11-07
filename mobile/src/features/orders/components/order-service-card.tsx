import * as React from 'react';
import { View } from 'react-native';
import { ClockIcon, MapPinIcon, WrenchIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';

export type OrderServiceCardProps = {
  serviceName?: string;
  agreedScope?: string;
  addressText?: string;
  scheduledAt?: string | null;
  createdAt?: string | null;
};

function formatDateTime(isoString?: string | null): string {
  if (!isoString) {
    return 'Theo thỏa thuận';
  }
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) {
      return 'Theo thỏa thuận';
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${hh}:${min} • Ngày ${dd}/${mm}/${yyyy}`;
  }
  catch {
    return 'Theo thỏa thuận';
  }
}

export function OrderServiceCard({
  serviceName,
  agreedScope,
  addressText,
  scheduledAt,
  createdAt,
}: OrderServiceCardProps) {
  const displayService = serviceName || 'Dịch vụ sửa chữa tại nhà';
  const displayAddress = addressText || 'Chưa có thông tin địa chỉ';
  const displayTime = formatDateTime(scheduledAt || createdAt);

  return (
    <View className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center gap-2 border-b border-neutral-100 pb-3 dark:border-neutral-800">
        <View className="size-8 items-center justify-center rounded-xl bg-primary/10">
          <WrenchIcon size={18} color="#F5A524" />
        </View>
        <View className="flex-1">
          <Text className="text-xs font-semibold tracking-wider text-neutral-500 uppercase dark:text-neutral-400">
            Chi tiết công việc
          </Text>
          <Text className="text-sm font-bold text-neutral-900 dark:text-white" numberOfLines={1}>
            {displayService}
          </Text>
        </View>
      </View>

      {/* Scope description */}
      {agreedScope
        ? (
            <View className="mt-3 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800/60">
              <Text className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
                Mô tả phạm vi thực hiện:
              </Text>
              <Text className="mt-1 text-xs/relaxed text-neutral-800 dark:text-neutral-200">
                {agreedScope}
              </Text>
            </View>
          )
        : null}

      {/* Location & Schedule */}
      <View className="mt-3 gap-2.5">
        <View className="flex-row items-start gap-2.5">
          <View className="mt-0.5">
            <MapPinIcon size={16} color="#EF4444" />
          </View>
          <View className="flex-1">
            <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Địa điểm thi công
            </Text>
            <Text className="mt-0.5 text-xs/snug font-semibold text-neutral-900 dark:text-white">
              {displayAddress}
            </Text>
          </View>
        </View>

        <View className="flex-row items-start gap-2.5">
          <View className="mt-0.5">
            <ClockIcon size={16} color="#6B7280" />
          </View>
          <View className="flex-1">
            <Text className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Thời gian thực hiện
            </Text>
            <Text className="mt-0.5 text-xs font-semibold text-neutral-900 dark:text-white">
              {displayTime}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
