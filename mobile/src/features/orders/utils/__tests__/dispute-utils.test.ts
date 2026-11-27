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

  it('maps dispute categories and backend error codes to Vietnamese labels', () => {
    expect(getDisputeCategoryLabel('property_damage')).toBe('Hư hỏng tài sản');
    expect(getDisputeErrorMessage({ response: { data: { code: 'COMPLAINT_WINDOW_EXPIRED' } } }))
      .toContain('7 ngày');
    expect(getDisputeErrorMessage({ response: { data: { code: 'ORDER_ALREADY_FULLY_REFUNDED' } } }))
      .toContain('hoàn tiền toàn phần');
  });
});
