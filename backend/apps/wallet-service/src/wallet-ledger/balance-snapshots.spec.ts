import { describe, expect, it, vi } from 'vitest';
import { WalletLedgerService } from './wallet-ledger.service.js';
import { TopupSettlementService } from '../topup-settlement/topup-settlement.service.js';
import { WithdrawalService } from '../withdrawal/withdrawal.service.js';

describe('Immutable wallet balance snapshots', () => {
  it.each(['standalone', 'existing transaction'])('captures each posting in sequence, including the same wallet twice (%s)', async (mode) => {
    const balances = new Map([['a', 1000n], ['b', 0n]]);
    const entries: Array<Record<string, unknown>> = [];
    let transfer: Record<string, unknown> | null = null;
    const tx = {
      $queryRaw: vi.fn(),
      wallet: {
        findUnique: vi.fn(async ({ where }) => ({ id: where.id, balance: balances.get(where.id), reservedBalance: where.id === 'a' ? 400n : 0n, status: 'active' })),
        update: vi.fn(async ({ where, data }) => {
          balances.set(where.id, balances.get(where.id)! + (data.balance.increment ?? -data.balance.decrement));
          return { id: where.id, balance: balances.get(where.id) };
        }),
      },
      walletTransfer: {
        findUnique: vi.fn(async () => transfer),
        create: vi.fn(async ({ data }) => { transfer = { id: 'transfer', ...data }; return transfer; }),
      },
      walletTransaction: { create: vi.fn(async ({ data }) => { entries.push(data); return data; }) },
      outboxEvent: { create: vi.fn() },
    };
    const service = new WalletLedgerService({ $transaction: (run) => run(tx) } as never);
    const input = { operationId: 'op', idempotencyKey: 'key', kind: 'payment', postings: [
      { walletId: 'a', direction: 'debit' as const, amount: 200n, type: 'payment_debit' },
      { walletId: 'b', direction: 'credit' as const, amount: 100n, type: 'worker_earning' },
      { walletId: 'a', direction: 'credit' as const, amount: 100n, type: 'refund_credit' },
    ] };
    const run = () => mode === 'standalone' ? service.createBalancedTransfer(input) : service.createBalancedTransferInTx(tx as never, input);
    await run();
    expect(entries.map(e => [e.walletId, e.balanceBefore, e.balanceAfter])).toEqual([
      ['a', 1000n, 800n], ['b', 0n, 100n], ['a', 800n, 900n],
    ]);
    // Later balances cannot rewrite the history when the operation is replayed.
    balances.set('a', 5000n);
    await expect(run()).resolves.toMatchObject({ idempotentReplay: true });
    expect(entries).toHaveLength(3);
    expect(entries[0].balanceBefore).toBe(1000n);
  });

  it('records top-up zero balances and preserves them on duplicate delivery', async () => {
    let balance = 0n;
    let entry: Record<string, unknown> | null = null;
    const tx = {
      $queryRaw: vi.fn(),
      wallet: {
        findUnique: vi.fn(async () => ({ id: 'wallet', status: 'active', balance })),
        update: vi.fn(async () => { balance += 50n; }),
      },
      walletTransaction: {
        findFirst: vi.fn(async () => entry),
        create: vi.fn(async ({ data }) => { entry = { id: 'entry', ...data }; return entry; }),
      },
      outboxEvent: { createMany: vi.fn() },
    };
    const service = new TopupSettlementService({ $transaction: (run) => run(tx) } as never);
    const input = { userId: 'user', paymentId: 'payment', amount: '50', idempotencyKey: 'key' };
    await expect(service.settle(input)).resolves.toMatchObject({ balanceBefore: 0n, balanceAfter: 50n });
    await expect(service.settle(input)).resolves.toMatchObject({ balanceBefore: 0n, balanceAfter: 50n });
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
    expect(balance).toBe(50n);
  });

  it('uses the captured wallet balance for a successful withdrawal', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      withdrawal: { findUnique: vi.fn().mockResolvedValue({ id: 'withdrawal', status: 'processing', walletId: 'wallet', payoutOperationId: 'payout' }), update: vi.fn() },
      walletHold: { findUnique: vi.fn().mockResolvedValue({ id: 'hold', status: 'active', amount: 50n }), update: vi.fn() },
      wallet: { update: vi.fn().mockResolvedValue({ balance: 950n, reservedBalance: 0n }) },
      walletTransaction: { create: vi.fn() },
      outboxEvent: { create: vi.fn() },
    };
    const service = new WithdrawalService({ $transaction: (run) => run(tx) } as never, {} as never);
    await service.finish('withdrawal', { payoutOperationId: 'payout', status: 'succeeded' });
    expect(tx.walletTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ balanceBefore: 1000n, balanceAfter: 950n }) });
  });
});
