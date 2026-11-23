import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PaymentInternalController } from './payment-internal.controller.js';
import { RefundInternalController } from '../refunds/refund-internal.controller.js';
import type { ConfigService } from '@app/config';
import type { PaymentQueryService } from './payment-query.service.js';
import type { RefundsService } from '../refunds/refunds.service.js';

describe('Payment internal endpoints', () => {
  const orderId = randomUUID();
  const resolutionId = randomUUID();
  const adminUserId = randomUUID();
  const config = { internalServiceSecret: 'test-secret' } as ConfigService;
  const query = {
    refundableByOrder: vi.fn().mockResolvedValue({
      paymentId: randomUUID(),
      status: 'succeeded',
      refundableAmountVnd: '150000',
    }),
  };
  const refunds = {
    cancelDisputeRefundForOverride: vi.fn().mockResolvedValue({
      safeToOverride: true,
      outcome: 'cancelled',
      refundId: randomUUID(),
      refundStatus: 'cancelled',
      paymentId: randomUUID(),
      paymentStatus: 'succeeded',
      refundAmountVnd: '150000',
    }),
  };
  const controller = new PaymentInternalController(
    config,
    query as unknown as PaymentQueryService,
  );
  const refundInternalController = new RefundInternalController(
    config,
    refunds as unknown as RefundsService,
  );

  it('rejects requests without the shared internal secret', async () => {
    query.refundableByOrder.mockClear();
    refunds.cancelDisputeRefundForOverride.mockClear();
    await expect(controller.refundable(undefined, orderId)).rejects.toMatchObject({ status: 403 });
    await expect(controller.refundable('wrong-secret', orderId)).rejects.toMatchObject({ status: 403 });
    await expect(
      refundInternalController.cancelDisputeRefundForOverride(
        undefined,
        resolutionId,
        { orderId, adminUserId, reason: 'Override' },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      refundInternalController.cancelDisputeRefundForOverride(
        'wrong-secret',
        resolutionId,
        { orderId, adminUserId, reason: 'Override' },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(query.refundableByOrder).not.toHaveBeenCalled();
    expect(refunds.cancelDisputeRefundForOverride).not.toHaveBeenCalled();
  });

  it('returns a read-only exact-VND contract to an authenticated service', async () => {
    const result = await controller.refundable('test-secret', orderId);
    expect(query.refundableByOrder).toHaveBeenCalledWith(orderId);
    expect(result.data.refundableAmountVnd).toBe('150000');
  });

  it('delegates cancelDisputeRefundForOverride to RefundsService with valid secret', async () => {
    const result = await refundInternalController.cancelDisputeRefundForOverride(
      'test-secret',
      resolutionId,
      { orderId, adminUserId, reason: 'Admin override' },
    );
    expect(refunds.cancelDisputeRefundForOverride).toHaveBeenCalledWith(
      resolutionId,
      { orderId, adminUserId, reason: 'Admin override' },
    );
    expect(result.data.safeToOverride).toBe(true);
    expect(result.data.outcome).toBe('cancelled');
  });
});
