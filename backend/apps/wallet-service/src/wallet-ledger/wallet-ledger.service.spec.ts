import { describe, expect, it } from 'vitest';
import { WalletLedgerService } from './wallet-ledger.service.js';
describe('WalletLedgerService', () => {
  it('rejects unbalanced postings before opening a transaction', async () => {
    const prisma = { $transaction: () => { throw new Error('should not be called'); } };
    const service = new WalletLedgerService(prisma as never);
    await expect(service.createBalancedTransfer({ operationId: 'op', idempotencyKey: 'key', kind: 'test', postings: [
      { walletId: 'a', direction: 'debit', amount: 10n, type: 'debit' },
      { walletId: 'b', direction: 'credit', amount: 9n, type: 'credit' },
    ] })).rejects.toThrow('totals must match');
  });
});
