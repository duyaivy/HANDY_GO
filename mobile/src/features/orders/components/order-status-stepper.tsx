import type { OrderStatus } from '../types/order.types';
import * as React from 'react';
import { View } from 'react-native';
import { CheckCircleIcon, ClockIcon, CloseIcon, ShieldCheckIcon, WrenchIcon } from '@/components/ui/icons/handy-icons';
import { Text } from '@/components/ui/text';

export const ORDER_PROGRESS_STEPS = [
  { key: 'created', label: 'Đã đặt' },
  { key: 'confirmed', label: 'Nhận việc' },
  { key: 'in_progress', label: 'Thi công' },
  { key: 'awaiting_customer_confirmation', label: 'Nghiệm thu' },
  { key: 'completed', label: 'Hoàn tất' },
] as const;

export type OrderStatusStepperProps = {
  status?: OrderStatus | string | null;
  createdAt?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  disputedAt?: string | null;
  disputeReason?: string | null;
};

function formatDateTime(isoString?: string | null): string {
  if (!isoString) {
    return 'Vừa xong';
  }
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) {
      return 'Vừa xong';
    }
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${hh}:${min} • ${dd}/${mm}/${yyyy}`;
  }
  catch {
    return 'Vừa xong';
  }
}

function getStepIndex(status?: string | null): number {
  switch (status) {
    case 'created':
      return 0;
    case 'confirmed':
      return 1;
    case 'in_progress':
      return 2;
    case 'awaiting_customer_confirmation':
      return 3;
    case 'completed':
      return 4;
    default:
      return 0;
  }
}

export function OrderStatusStepper({
  status,
  createdAt: _createdAt,
  cancelledAt,
  cancelReason,
  disputedAt,
  disputeReason,
}: OrderStatusStepperProps) {
  const currentStep = getStepIndex(status);
  const isCancelled = status === 'cancelled';
  const isDisputed = status === 'disputed';

  // Hero status content config
  const statusConfig = React.useMemo(() => {
    switch (status) {
      case 'created':
        return {
          title: 'Đang chờ thợ xác nhận nhận việc...',
          subtitle: 'Thợ phụ trách đang xem lại chi tiết và chuẩn bị xác nhận đơn.',
          bgClass: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900',
          titleClass: 'text-amber-900 dark:text-amber-200',
          subtitleClass: 'text-amber-700 dark:text-amber-300',
          badgeText: 'Chờ thợ nhận việc',
          badgeBg: 'bg-amber-100 dark:bg-amber-900/50',
          badgeTextClass: 'text-amber-800 dark:text-amber-300',
          icon: <ClockIcon size={22} color="#D97706" />,
        };
      case 'confirmed':
        return {
          title: 'Thợ đã nhận việc & chuẩn bị đến',
          subtitle: 'Thợ đang chuẩn bị đồ nghề và sẽ có mặt theo đúng lịch hẹn.',
          bgClass: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900',
          titleClass: 'text-amber-900 dark:text-amber-200',
          subtitleClass: 'text-amber-700 dark:text-amber-300',
          badgeText: 'Thợ đã sẵn sàng',
          badgeBg: 'bg-amber-100 dark:bg-amber-900/50',
          badgeTextClass: 'text-amber-800 dark:text-amber-300',
          icon: <WrenchIcon size={22} color="#D97706" />,
        };
      case 'in_progress':
        return {
          title: 'Thợ đang tiến hành thi công',
          subtitle: 'Công việc đang được triển khai trực tiếp tại hiện trường.',
          bgClass: 'bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-900',
          titleClass: 'text-indigo-900 dark:text-indigo-200',
          subtitleClass: 'text-indigo-700 dark:text-indigo-300',
          badgeText: 'Đang thi công',
          badgeBg: 'bg-indigo-100 dark:bg-indigo-900/50',
          badgeTextClass: 'text-indigo-700 dark:text-indigo-300',
          icon: <WrenchIcon size={22} color="#4F46E5" />,
        };
      case 'awaiting_customer_confirmation':
        return {
          title: 'Thợ đã hoàn thành công việc',
          subtitle: 'Vui lòng kiểm tra hiện trường, xem ảnh bằng chứng và nghiệm thu.',
          bgClass: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900',
          titleClass: 'text-emerald-900 dark:text-emerald-200',
          subtitleClass: 'text-emerald-700 dark:text-emerald-300',
          badgeText: 'Chờ nghiệm thu',
          badgeBg: 'bg-emerald-100 dark:bg-emerald-900/50',
          badgeTextClass: 'text-emerald-800 dark:text-emerald-300',
          icon: <CheckCircleIcon size={22} color="#059669" />,
        };
      case 'completed':
        return {
          title: 'Đơn hàng hoàn tất thành công!',
          subtitle: 'Cảm ơn bạn đã tin tưởng HandyGo. Hãy để lại đánh giá cho thợ nhé.',
          bgClass: 'bg-teal-50 border-teal-200 dark:bg-teal-950/30 dark:border-teal-900',
          titleClass: 'text-teal-900 dark:text-teal-200',
          subtitleClass: 'text-teal-700 dark:text-teal-300',
          badgeText: 'Hoàn tất',
          badgeBg: 'bg-teal-100 dark:bg-teal-900/50',
          badgeTextClass: 'text-teal-800 dark:text-teal-300',
          icon: <ShieldCheckIcon size={22} color="#0D9488" />,
        };
      case 'cancelled':
        return {
          title: 'Đơn hàng đã được hủy',
          subtitle: cancelReason || 'Đơn hàng đã kết thúc mà không phát sinh thêm chi phí.',
          bgClass: 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900',
          titleClass: 'text-rose-900 dark:text-rose-200',
          subtitleClass: 'text-rose-700 dark:text-rose-300',
          badgeText: 'Đã hủy',
          badgeBg: 'bg-rose-100 dark:bg-rose-900/50',
          badgeTextClass: 'text-rose-800 dark:text-rose-300',
          icon: <CloseIcon size={22} color="#E11D48" />,
        };
      case 'disputed':
        return {
          title: 'Đơn hàng đang trong quá trình khiếu nại',
          subtitle: disputeReason || 'Bộ phận CSKH HandyGo đang xem xét và sẽ liên hệ hỗ trợ bạn.',
          bgClass: 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900',
          titleClass: 'text-amber-900 dark:text-amber-200',
          subtitleClass: 'text-amber-700 dark:text-amber-300',
          badgeText: 'Đang khiếu nại',
          badgeBg: 'bg-amber-100 dark:bg-amber-900/50',
          badgeTextClass: 'text-amber-800 dark:text-amber-300',
          icon: <ShieldCheckIcon size={22} color="#D97706" />,
        };
      default:
        return {
          title: 'Chi tiết trạng thái đơn',
          subtitle: 'Theo dõi tiến trình thực hiện đơn hàng của bạn.',
          bgClass: 'bg-neutral-50 border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800',
          titleClass: 'text-neutral-900 dark:text-neutral-100',
          subtitleClass: 'text-neutral-600 dark:text-neutral-400',
          badgeText: status || 'Đang cập nhật',
          badgeBg: 'bg-neutral-100 dark:bg-neutral-800',
          badgeTextClass: 'text-neutral-700 dark:text-neutral-300',
          icon: <ClockIcon size={22} color="#6B7280" />,
        };
    }
  }, [status, cancelReason, disputeReason]);

  return (
    <View className="mb-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      {/* Hero Status Banner */}
      <View className={`p-4 ${!isCancelled && !isDisputed ? 'border-b' : ''} ${statusConfig.bgClass}`}>
        <View className="flex-row items-start gap-3">
          <View className="size-9 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-xs dark:bg-neutral-800">
            {statusConfig.icon}
          </View>
          <View className="min-w-0 flex-1">
            <View className="flex-row items-start justify-between gap-2">
              <Text className={`flex-1 text-sm font-bold ${statusConfig.titleClass}`} numberOfLines={2}>
                {statusConfig.title}
              </Text>
              <View className={`shrink-0 rounded-full px-2 py-0.5 ${statusConfig.badgeBg}`}>
                <Text className={`text-[10px] font-bold ${statusConfig.badgeTextClass}`}>
                  {statusConfig.badgeText}
                </Text>
              </View>
            </View>
            <Text className={`mt-1 text-xs ${statusConfig.subtitleClass}`} numberOfLines={2}>
              {statusConfig.subtitle}
            </Text>
          </View>
        </View>

        {/* Cancellation or Dispute details if applicable */}
        {isCancelled && cancelledAt && (
          <View className="mt-3 flex-row items-center justify-between border-t border-rose-200/60 pt-2.5 dark:border-rose-900/40">
            <Text className="text-xs font-medium text-rose-700 dark:text-rose-300">Thời gian hủy:</Text>
            <Text className="text-xs font-bold text-rose-800 dark:text-rose-200">
              {formatDateTime(cancelledAt)}
            </Text>
          </View>
        )}

        {isDisputed && disputedAt && (
          <View className="mt-3 flex-row items-center justify-between border-t border-amber-200/60 pt-2.5 dark:border-amber-900/40">
            <Text className="text-xs font-medium text-amber-800 dark:text-amber-300">Thời gian khiếu nại:</Text>
            <Text className="text-xs font-bold text-amber-900 dark:text-amber-200">
              {formatDateTime(disputedAt)}
            </Text>
          </View>
        )}
      </View>

      {/* Stepper (Only show if not cancelled / disputed, or show as context) */}
      {!isCancelled && !isDisputed && (
        <View className="px-3 py-4">
          <View className="flex-row items-center justify-between">
            {ORDER_PROGRESS_STEPS.map((step, index) => {
              const isPast = index < currentStep;
              const isCurrent = index === currentStep;

              return (
                <React.Fragment key={step.key}>
                  {/* Step Node */}
                  <View className="items-center" style={{ width: 56 }}>
                    <View
                      className={`size-7 items-center justify-center rounded-full border-2 ${
                        isPast
                          ? 'border-emerald-600 bg-emerald-600'
                          : isCurrent
                            ? 'border-primary bg-primary/10'
                            : 'border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-800'
                      }`}
                    >
                      {isPast
                        ? (
                            <CheckCircleIcon size={14} color="#FFFFFF" />
                          )
                        : isCurrent
                          ? (
                              <View className="size-2.5 rounded-full bg-primary" />
                            )
                          : (
                              <Text className="text-[10px] font-bold text-neutral-400">
                                {index + 1}
                              </Text>
                            )}
                    </View>
                    <Text
                      className={`mt-1.5 text-center text-[11px] ${
                        isCurrent
                          ? 'font-bold text-primary'
                          : isPast
                            ? 'font-semibold text-neutral-800 dark:text-neutral-200'
                            : 'font-normal text-neutral-400'
                      }`}
                      numberOfLines={1}
                    >
                      {step.label}
                    </Text>
                  </View>

                  {/* Connecting Line between nodes */}
                  {index < ORDER_PROGRESS_STEPS.length - 1 && (
                    <View
                      className={`mb-4.5 h-0.5 flex-1 ${
                        index < currentStep
                          ? 'bg-emerald-500'
                          : 'bg-neutral-200 dark:bg-neutral-800'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}
