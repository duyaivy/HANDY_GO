import { ApiError } from '@/services/api/api-error';
import {
  DISPUTE_COMPLAINT_WINDOW_MS,
  getDisputeCategoryLabel,
  getDisputeEligibility,
  getDisputeErrorMessage,
} from '../dispute-utils';

describe('dispute-utils', () => {
  const now = new Date('2026-11-26T12:00:00.000Z').getTime();

  it('allows customer and worker to dispute active orders', () => {
    expect(getDisputeEligibility({ status: 'in_progress', paymentState: 'unpaid' }, 'customer', now).canDispute).toBe(true);
    expect(getDisputeEligibility({ status: 'awaiting_customer_confirmation', paymentState: 'unpaid' }, 'worker', now).canDispute).toBe(true);
  });

  it('allows customer to dispute completed order within 7 days if not fully refunded', () => {
    const completedTwoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
    const res = getDisputeEligibility(
      { status: 'completed', completedAt: completedTwoDaysAgo, paymentState: 'paid' },
      'customer',
      now,
    );
    expect(res.canDispute).toBe(true);
    expect(res.isPostCompletion).toBe(true);
    expect(res.remainingDays).toBe(5);
  });

  it('blocks customer dispute after 7-day window expires', () => {
    const completedEightDaysAgo = new Date(now - DISPUTE_COMPLAINT_WINDOW_MS - 1000).toISOString();
    const res = getDisputeEligibility(
      { status: 'completed', completedAt: completedEightDaysAgo, paymentState: 'paid' },
      'customer',
      now,
    );
    expect(res.canDispute).toBe(false);
    expect(res.isWindowExpired).toBe(true);
  });

  it('blocks customer dispute when order is already fully refunded', () => {
    const completedYesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const res = getDisputeEligibility(
      { status: 'completed', completedAt: completedYesterday, paymentState: 'refunded' },
      'customer',
      now,
    );
    expect(res.canDispute).toBe(false);
    expect(res.isFullyRefunded).toBe(true);
  });

  it('blocks worker from disputing completed orders', () => {
    const completedYesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString();
    const res = getDisputeEligibility(
      { status: 'completed', completedAt: completedYesterday, paymentState: 'paid' },
      'worker',
      now,
    );
    expect(res.canDispute).toBe(false);
  });

  it('allows customer dispute at exact 168h boundary and blocks 1ms after', () => {
    const completedExactly168hAgo = new Date(now - DISPUTE_COMPLAINT_WINDOW_MS).toISOString();
    const atBoundary = getDisputeEligibility(
      { status: 'completed', completedAt: completedExactly168hAgo, paymentState: 'paid' },
      'customer',
      now,
    );
    expect(atBoundary.canDispute).toBe(true);

    const afterBoundary = getDisputeEligibility(
      { status: 'completed', completedAt: completedExactly168hAgo, paymentState: 'paid' },
      'customer',
      now + 1,
    );
    expect(afterBoundary.canDispute).toBe(false);
    expect(afterBoundary.isWindowExpired).toBe(true);
  });

  it('maps dispute categories and backend error codes (including ApiError) to Vietnamese labels', () => {
    expect(getDisputeCategoryLabel('property_damage')).toBe('Hư hỏng tài sản');
    expect(getDisputeErrorMessage({ response: { data: { code: 'COMPLAINT_WINDOW_EXPIRED' } } }))
      .toContain('7 ngày');

    const err400 = ApiError.fromAxiosError({
      response: { status: 400, data: { code: 'COMPLAINT_WINDOW_EXPIRED', message: 'Expired' } },
    });
    expect(getDisputeErrorMessage(err400)).toContain('7 ngày');

    const err403 = ApiError.fromAxiosError({
      response: { status: 403, data: { code: 'DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION', message: 'Forbidden' } },
    });
    expect(getDisputeErrorMessage(err403)).toContain('Chỉ khách hàng');

    const err409Refund = ApiError.fromAxiosError({
      response: { status: 409, data: { code: 'ORDER_ALREADY_FULLY_REFUNDED', message: 'Conflict' } },
    });
    expect(getDisputeErrorMessage(err409Refund)).toContain('hoàn tiền toàn phần');

    const err409State = ApiError.fromAxiosError({
      response: { status: 409, data: { code: 'INVALID_STATE_TRANSITION', message: 'Conflict' } },
    });
    expect(getDisputeErrorMessage(err409State)).toContain('Trạng thái đơn hàng');

    const networkErr = ApiError.fromAxiosError({ message: 'Network Error' });
    expect(getDisputeErrorMessage(networkErr)).toContain('Không có kết nối mạng');
  });
});
