import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PaymentInternalController } from './payment-internal.controller.js';
import type { ConfigService } from '@app/config';
import type { PaymentQueryService } from './payment-query.service.js';

describe('Payment internal refundability endpoint', () => {
  const orderId = randomUUID();
  const query = { refundableByOrder: vi.fn().mockResolvedValue({ paymentId: randomUUID(), status: 'succeeded', refundableAmountVnd: '150000' }) };
  const controller = new PaymentInternalController({ internalServiceSecret: 'test-secret' } as ConfigService,
    query as unknown as PaymentQueryService);

  it('rejects requests without the shared internal secret', async () => {
    query.refundableByOrder.mockClear();
    await expect(controller.refundable(undefined, orderId)).rejects.toMatchObject({ status: 403 });
    await expect(controller.refundable('wrong-secret', orderId)).rejects.toMatchObject({ status: 403 });
    expect(query.refundableByOrder).not.toHaveBeenCalled();
  });

  it('returns a read-only exact-VND contract to an authenticated service', async () => {
    const result = await controller.refundable('test-secret', orderId);
    expect(query.refundableByOrder).toHaveBeenCalledWith(orderId);
    expect(result.data.refundableAmountVnd).toBe('150000');
  });
});
