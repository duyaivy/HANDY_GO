import type { TrackingMilestone } from '../types/tracking.types';
import * as React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Text } from '@/components/ui/text';

export type TrackingMilestoneItemProps = {
  milestone: TrackingMilestone;
  isLast: boolean;
};

function CheckCircle2Icon({ color = '#16a34a', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

function CircleDotIcon({ color = '#2563eb', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Circle cx="12" cy="12" r="3" fill={color} stroke="none" />
    </Svg>
  );
}

function AlertCircleIcon({ color = '#dc2626', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 8v4" />
      <Path d="M12 16h.01" />
    </Svg>
  );
}

function ClockIcon({ color = '#9ca3af', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx="12" cy="12" r="10" />
      <Path d="M12 6v6l4 2" />
    </Svg>
  );
}

export const TrackingMilestoneItem: React.FC<TrackingMilestoneItemProps> = ({
  milestone,
  isLast,
}) => {
  const isCompleted = milestone.status === 'completed';
  const isInProgress = milestone.status === 'in_progress';
  const isDisputed = milestone.status === 'skipped' && (milestone.key === 'dispute' || milestone.key === 'order_execution');

  const formattedTime = React.useMemo(() => {
    if (!milestone.reachedAt) {
      return null;
    }
    try {
      const d = new Date(milestone.reachedAt);
      if (Number.isNaN(d.getTime())) {
        return null;
      }
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    catch {
      return null;
    }
  }, [milestone.reachedAt]);

  return (
    <View testID={`milestone-item-${milestone.key}`} className="flex-row items-start">
      {/* Icon cột mốc */}
      <View className="mr-3 items-center">
        <View
          testID={`milestone-icon-${milestone.status}`}
          className="size-8 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800"
        >
          {isCompleted && <CheckCircle2Icon size={20} color="#16a34a" />}
          {isInProgress && <CircleDotIcon size={20} color="#2563eb" />}
          {isDisputed && <AlertCircleIcon size={20} color="#dc2626" />}
          {!isCompleted && !isInProgress && !isDisputed && <ClockIcon size={18} color="#9ca3af" />}
        </View>
        {/* Đường nối giữa các mốc */}
        {!isLast && (
          <View
            testID="milestone-connector"
            className={`my-1 h-10 w-0.5 ${
              isCompleted ? 'bg-green-500' : 'bg-neutral-200 dark:bg-neutral-700'
            }`}
          />
        )}
      </View>

      {/* Nội dung cột mốc */}
      <View className="flex-1 pb-4">
        <View className="flex-row items-center justify-between">
          <Text
            className={`text-sm font-bold ${
              isInProgress
                ? 'text-blue-600 dark:text-blue-400'
                : isCompleted
                  ? 'text-neutral-900 dark:text-white'
                  : 'text-neutral-400'
            }`}
          >
            {milestone.title}
          </Text>
          {formattedTime && (
            <Text className="text-xs text-neutral-400">
              {formattedTime}
            </Text>
          )}
        </View>
        <Text className="mt-0.5 text-xs text-neutral-500">{milestone.description}</Text>
      </View>
    </View>
  );
};
