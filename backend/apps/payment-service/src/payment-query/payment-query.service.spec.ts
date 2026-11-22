import { describe, expect, it, vi } from 'vitest';
import { PaymentQueryService } from './payment-query.service.js';

describe('PaymentQueryService', () => {
  it('returns the total of completed refunds with a payment without exposing refund rows', async () => {
    const payment = {
      id: 'payment-1', amount: 200000n, platformFee: 50000n, workerEarning: 150000n,
      status: 'partially_refunded', refunds: [{ amountVnd: 30000n }, { amountVnd: 70000n }],
    };
    const client = {
      payment: { findMany: vi.fn().mockResolvedValue([payment]), count: vi.fn().mockResolvedValue(1) },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    };
    const service = new PaymentQueryService({ client } as never);

    const result = await service.list('worker-1', { page: 1, limit: 100 } as never);

    expect(client.payment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ refunds: { where: { status: 'completed' }, select: { amountVnd: true } } }),
    }));
    expect(result.items[0]).toMatchObject({ amount: '200000', platformFee: '50000', workerEarning: '150000', refundedAmount: '100000' });
    expect(result.items[0]).not.toHaveProperty('refunds');
  });
});
