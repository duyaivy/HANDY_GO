import type { DisputeCategory, Order } from '../types/order.types';

export const DISPUTE_COMPLAINT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const DISPUTE_MIN_REASON_LENGTH = 5;
export const DISPUTE_MAX_REASON_LENGTH = 2000;
export const DISPUTE_MAX_EVIDENCE_URLS = 10;

export const DISPUTE_CATEGORY_OPTIONS: ReadonlyArray<{
  value: DisputeCategory;
  label: string;
}> = [
  { value: 'service_quality', label: 'Chất lượng dịch vụ' },
  { value: 'incomplete_work', label: 'Thi công chưa hoàn tất' },
  { value: 'property_damage', label: 'Hư hỏng tài sản' },
  { value: 'price_fraud', label: 'Gian lận chi phí' },
  { value: 'attitude', label: 'Thái độ phục vụ' },
  { value: 'other', label: 'Lý do khác' },
];

export const DISPUTE_QUICK_REASONS: Record<'customer' | 'worker', readonly string[]> = {
  customer: [
    'Thợ thi công chưa đạt yêu cầu cam kết.',
    'Sự cố tái phát sau khi hoàn tất dịch vụ.',
    'Phát sinh hư hỏng thiết bị/tài sản trong lúc làm.',
    'Thu phí sai với báo giá đã thỏa thuận.',
  ],
  worker: [
    'Khách hàng không hợp tác nghiệm thu công việc.',
    'Yêu cầu phát sinh ngoài phạm vi thỏa thuận ban đầu.',
    'Khách hàng từ chối thanh toán đúng thỏa thuận.',
  ],
};

export function getDisputeCategoryLabel(category?: string | null): string | null {
  if (!category) {
    return null;
  }
  return DISPUTE_CATEGORY_OPTIONS.find(item => item.value === category)?.label ?? category;
}

export type DisputeEligibility = {
  canDispute: boolean;
  isPostCompletion: boolean;
  isWindowExpired: boolean;
  isFullyRefunded: boolean;
  remainingDays: number;
};

export function getDisputeEligibility(
  order?: Pick<Order, 'status' | 'completedAt' | 'paymentState'> | null,
  role: 'customer' | 'worker' = 'customer',
  nowMs: number = Date.now(),
): DisputeEligibility {
  if (!order) {
    return {
      canDispute: false,
      isPostCompletion: false,
      isWindowExpired: false,
      isFullyRefunded: false,
      remainingDays: 0,
    };
  }

  if (order.status === 'in_progress' || order.status === 'awaiting_customer_confirmation') {
    return {
      canDispute: true,
      isPostCompletion: false,
      isWindowExpired: false,
      isFullyRefunded: false,
      remainingDays: 0,
    };
  }

  if (role === 'customer' && order.status === 'completed') {
    if (order.paymentState === 'refunded') {
      return {
        canDispute: false,
        isPostCompletion: true,
        isWindowExpired: false,
        isFullyRefunded: true,
        remainingDays: 0,
      };
    }

    const completedAtMs = order.completedAt ? new Date(order.completedAt).getTime() : Number.NaN;
    if (!Number.isFinite(completedAtMs)) {
      return {
        canDispute: false,
        isPostCompletion: true,
        isWindowExpired: true,
        isFullyRefunded: false,
        remainingDays: 0,
      };
    }

    const elapsedMs = Math.max(0, nowMs - completedAtMs);
    if (elapsedMs > DISPUTE_COMPLAINT_WINDOW_MS) {
      return {
        canDispute: false,
        isPostCompletion: true,
        isWindowExpired: true,
        isFullyRefunded: false,
        remainingDays: 0,
      };
    }

    const remainingMs = DISPUTE_COMPLAINT_WINDOW_MS - elapsedMs;
    const remainingDays = Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    return {
      canDispute: true,
      isPostCompletion: true,
      isWindowExpired: false,
      isFullyRefunded: false,
      remainingDays,
    };
  }

  return {
    canDispute: false,
    isPostCompletion: false,
    isWindowExpired: false,
    isFullyRefunded: false,
    remainingDays: 0,
  };
}

export function getDisputeErrorMessage(error: unknown): string {
  const err = error as {
    code?: string;
    kind?: string;
    message?: string;
    response?: { data?: { code?: string; message?: string | string[] } };
  };
  const code = err?.code ?? err?.response?.data?.code;
  switch (code) {
    case 'COMPLAINT_WINDOW_EXPIRED':
      return 'Đã quá thời hạn bảo hành 7 ngày kể từ khi hoàn tất đơn hàng, không thể mở khiếu nại.';
    case 'ORDER_ALREADY_FULLY_REFUNDED':
      return 'Đơn hàng đã được hoàn tiền toàn phần nên không thể mở khiếu nại mới.';
    case 'DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION':
      return 'Chỉ khách hàng mới có thể khiếu nại đơn hàng sau khi đã hoàn tất.';
    case 'INVALID_STATE_TRANSITION':
      return 'Trạng thái đơn hàng hiện tại không thể mở khiếu nại.';
    default: {
      if (err?.kind === 'NETWORK_ERROR' || err?.kind === 'TIMEOUT_ERROR') {
        return err.message || 'Không có kết nối mạng. Vui lòng kiểm tra WiFi hoặc 4G.';
      }
      const serverMsg = err?.response?.data?.message;
      if (Array.isArray(serverMsg) && serverMsg.length > 0) {
        return serverMsg.join(', ');
      }
      if (typeof serverMsg === 'string' && serverMsg.trim().length > 0) {
        return serverMsg;
      }
      if (typeof err?.message === 'string' && err.message.trim().length > 0) {
        return err.message;
      }
      return 'Không thể gửi khiếu nại. Vui lòng thử lại sau.';
    }
  }
}
