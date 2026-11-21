import type { TrackingSummaryResponse } from '../types/tracking.types';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { computeMilestonesFromSummary } from '../types/tracking.types';
import { TrackingMilestoneItem } from './tracking-milestone-item';

export type OrderTrackingTimelineProps = {
  summary?: TrackingSummaryResponse;
  isLoading: boolean;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
};

export const OrderTrackingTimeline: React.FC<OrderTrackingTimelineProps> = ({
  summary,
  isLoading,
  connectionStatus,
}) => {
  const milestones = React.useMemo(() => {
    if (!summary) {
      return [];
    }
    if (Array.isArray(summary.milestones) && summary.milestones.length > 0) {
      return summary.milestones;
    }
    return computeMilestonesFromSummary(summary);
  }, [summary]);

  if (isLoading) {
    return (
      <View
        testID="tracking-timeline-loading"
        className="mb-4 items-center justify-center rounded-2xl border border-neutral-100 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <ActivityIndicator size="small" color="#2563eb" />
        <Text className="mt-2 text-xs text-neutral-400">Đang tải tiến trình công việc...</Text>
      </View>
    );
  }

  if (!summary || milestones.length === 0) {
    return null;
  }

  return (
    <View
      testID="tracking-timeline-container"
      className="mb-4 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Header trạng thái */}
      <View className="mb-4 flex-row items-center justify-between border-b border-neutral-100 pb-2 dark:border-neutral-800">
        <Text className="text-base font-bold text-neutral-900 dark:text-white">
          Tiến trình công việc
        </Text>

        {/* Live SSE Indicator */}
        <View testID="tracking-live-indicator" className="flex-row items-center">
          <View
            testID="tracking-status-dot"
            className={`mr-1.5 size-2 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-green-500'
                : connectionStatus === 'reconnecting'
                  ? 'bg-amber-400'
                  : 'bg-neutral-400'
            }`}
          />
          <Text
            testID="tracking-connection-status"
            className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400"
          >
            {connectionStatus === 'connected'
              ? 'Trực tiếp'
              : connectionStatus === 'reconnecting'
                ? 'Đang kết nối lại...'
                : 'Ngoại tuyến'}
          </Text>
        </View>
      </View>

      {/* Danh sách các cột mốc */}
      <View className="pl-1">
        {milestones.map((milestone, index) => (
          <TrackingMilestoneItem
            key={milestone.key || index}
            milestone={milestone}
            isLast={index === milestones.length - 1}
          />
        ))}
      </View>
    </View>
  );
};
