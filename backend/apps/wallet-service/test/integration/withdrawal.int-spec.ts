import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, resetDb, seedPlatform, seedWallet, balanceOf, type Harness } from './helpers/harness.js';
import type { BankAccountVerifier } from '../../src/withdrawal/bank-account-verifier/bank-account-verifier.port.js';

let a: Harness; // hai harness = hai pool kết nối DB độc lập
let b: Harness;
const verifier = { result: true, calls: 0 };
const stubVerifier = {
  verify: async () => {
    verifier.calls++;
    return verifier.result;
  },
} as BankAccountVerifier;

beforeAll(async () => {
  a = await createHarness(stubVerifier);
  b = await createHarness(stubVerifier);
});
afterAll(async () => {
  await a.close();
  await b.close();
});
beforeEach(async () => {
  verifier.result = true;
  verifier.calls = 0;
  await resetDb();
  await seedPlatform(a);
});

async function newRequestedWithdrawal(balance = 100n, amount = '60') {
  const userId = randomUUID();
  await seedWallet(a, { userId, balance });
  const w = await a.withdrawals.create(userId, {
    bankAccountId: randomUUID(), amount, idempotencyKey: randomUUID(),
  });
  return { userId, withdrawalId: w.id };
}

describe('withdrawal create', () => {
  it('tạo hold và event requested; retry cùng key không tạo hold thứ hai', async () => {
    const userId = randomUUID();
    await seedWallet(a, { userId, balance: 100n });
    const dto = { bankAccountId: randomUUID(), amount: '60', idempotencyKey: 'k1' };
    const first = await a.withdrawals.create(userId, dto);
    const second = await a.withdrawals.create(userId, dto);
    expect(second.id).toBe(first.id);
    expect(await a.prisma.walletHold.count()).toBe(1);
    expect((await balanceOf(a, userId)).reserved).toBe(60n);
    expect(await a.prisma.outboxEvent.count({ where: { eventType: 'wallet.withdrawal.requested' } })).toBe(1);
  });

  it('cùng key khác payload → conflict', async () => {
    const userId = randomUUID();
    await seedWallet(a, { userId, balance: 100n });
    const bank = randomUUID();
    await a.withdrawals.create(userId, { bankAccountId: bank, amount: '60', idempotencyKey: 'k2' });
    await expect(
      a.withdrawals.create(userId, { bankAccountId: bank, amount: '61', idempotencyKey: 'k2' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('chưa xác minh bank account → 403 và không tạo hold/withdrawal', async () => {
    verifier.result = false;
    const userId = randomUUID();
    await seedWallet(a, { userId, balance: 100n });
    await expect(
      a.withdrawals.create(userId, { bankAccountId: randomUUID(), amount: '10', idempotencyKey: 'k3' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await a.prisma.withdrawal.count()).toBe(0);
    expect(await a.prisma.walletHold.count()).toBe(0);
    expect((await balanceOf(a, userId)).reserved).toBe(0n);
  });

  it('2 withdrawal đồng thời không vượt số dư khả dụng', async () => {
    const userId = randomUUID();
    await seedWallet(a, { userId, balance: 100n });
    const mk = (h: Harness, k: string) =>
      h.withdrawals.create(userId, { bankAccountId: randomUUID(), amount: '70', idempotencyKey: k });
    const results = await Promise.allSettled([mk(a, 'c1'), mk(b, 'c2')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const w = await balanceOf(a, userId);
    expect(w.reserved).toBe(70n);
    expect(w.balance - w.reserved).toBeGreaterThanOrEqual(0n);
  });
});

describe('claim vs cancel race (F06)', () => {
  it('chỉ một bên thắng; hold luôn nhất quán với trạng thái cuối', async () => {
    const outcomes = new Set<string>();
    for (let i = 0; i < 15; i++) {
      await resetDb();
      await seedPlatform(a);
      const { userId, withdrawalId } = await newRequestedWithdrawal();
      const [claim, cancel] = await Promise.allSettled([
        a.withdrawals.markProcessing(withdrawalId),
        b.withdrawals.cancel(userId, withdrawalId),
      ]);
      const final = await a.prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
      const hold = await a.prisma.walletHold.findUniqueOrThrow({ where: { withdrawalId } });
      const wallet = await balanceOf(a, userId);

      expect(['processing', 'cancelled']).toContain(final.status);
      outcomes.add(final.status);
      if (final.status === 'processing') {
        expect(claim.status).toBe('fulfilled');
        expect(cancel.status).toBe('rejected');
        expect(hold.status).toBe('active');
        expect(wallet.reserved).toBe(60n);
      } else {
        expect(cancel.status).toBe('fulfilled');
        expect(claim.status).toBe('rejected');
        expect(hold.status).toBe('released');
        expect(wallet.reserved).toBe(0n);
      }
    }
    expect(outcomes.size).toBeGreaterThan(0);
  });

  it('cancel sau khi đã claim bị từ chối và giữ hold', async () => {
    const { userId, withdrawalId } = await newRequestedWithdrawal();
    await a.withdrawals.markProcessing(withdrawalId);
    await expect(a.withdrawals.cancel(userId, withdrawalId)).rejects.toMatchObject({ status: 409 });
    expect((await balanceOf(a, userId)).reserved).toBe(60n);
  });

  it('claim lặp lại là idempotent', async () => {
    const { withdrawalId } = await newRequestedWithdrawal();
    await a.withdrawals.markProcessing(withdrawalId);
    const again = await a.withdrawals.markProcessing(withdrawalId);
    expect(again.status).toBe('processing');
  });
});

describe('payout callback', () => {
  it('succeeded: capture hold + debit ledger đúng một lần, callback lặp idempotent', async () => {
    const { userId, withdrawalId } = await newRequestedWithdrawal();
    await a.withdrawals.markProcessing(withdrawalId);
    await a.withdrawals.finish(userId, withdrawalId, 'succeeded');
    await a.withdrawals.finish(userId, withdrawalId, 'succeeded');
    const w = await balanceOf(a, userId);
    expect(w).toEqual({ balance: 40n, reserved: 0n });
    expect(await a.prisma.walletTransaction.count({ where: { type: 'withdrawal' } })).toBe(1);
  });

  it('succeeded gọi đồng thời 2 lần vẫn chỉ trừ một lần', async () => {
    const { userId, withdrawalId } = await newRequestedWithdrawal();
    await a.withdrawals.markProcessing(withdrawalId);
    await Promise.allSettled([
      a.withdrawals.finish(userId, withdrawalId, 'succeeded'),
      b.withdrawals.finish(userId, withdrawalId, 'succeeded'),
    ]);
    expect((await balanceOf(a, userId)).balance).toBe(40n);
    expect(await a.prisma.walletTransaction.count({ where: { type: 'withdrawal' } })).toBe(1);
  });

  it('failed: release hold, số dư giữ nguyên', async () => {
    const { userId, withdrawalId } = await newRequestedWithdrawal();
    await a.withdrawals.markProcessing(withdrawalId);
    await a.withdrawals.finish(userId, withdrawalId, 'failed');
    expect(await balanceOf(a, userId)).toEqual({ balance: 100n, reserved: 0n });
  });

  it('terminal khi chưa claim bị từ chối (giữ hold)', async () => {
    const { userId, withdrawalId } = await newRequestedWithdrawal();
    await expect(a.withdrawals.finish(userId, withdrawalId, 'succeeded')).rejects.toMatchObject({ status: 409 });
    expect((await balanceOf(a, userId)).reserved).toBe(60n);
  });

  it('success sau cancel → needs_review, ghi bằng chứng, không chuyển tiền', async () => {
    const { userId, withdrawalId } = await newRequestedWithdrawal();
    await a.withdrawals.cancel(userId, withdrawalId);
    const res = await a.withdrawals.finish(userId, withdrawalId, 'succeeded');
    expect(res.status).toBe('needs_review');
    expect(await a.prisma.outboxEvent.count({ where: { eventType: 'wallet.withdrawal.needs_review' } })).toBe(1);
    expect(await balanceOf(a, userId)).toEqual({ balance: 100n, reserved: 0n });
  });
});
