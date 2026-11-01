import { describe, expect, it, vi } from 'vitest';
import { PaymentDebitService } from './payment-debit.service.js';
describe('PaymentDebitService', () => {
  it('rejects unbalanced payment allocation before persistence', async () => {
    const ledger = { prisma: { wallet: { findUnique: vi.fn() } }, createBalancedTransfer: vi.fn() };
    const service = new PaymentDebitService(ledger as never);
    await expect(service.debit('customer', { paymentId: 'p1', attemptId: 'a1', workerUserId: 'worker', grossAmount: '100', workerEarning: '80', platformFee: '10' })).rejects.toMatchObject({ status: 400 });
    expect(ledger.createBalancedTransfer).not.toHaveBeenCalled();
  });
});
