import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, resetDb, seedPlatform, seedWallet, balanceOf, type Harness } from './helpers/harness.js';
import type { BankAccountVerifier } from '../../src/withdrawal/bank-account-verifier/bank-account-verifier.port.js';

// MOCK payout provider: KHÔNG phải Payment service thật. Chỉ mô phỏng hợp đồng
// claim (mark-processing) -> callback (status) mà Payment thật sẽ phải tuân theo.
const alwaysOk = { verify: async () => true } as BankAccountVerifier;
let h: Harness;

beforeAll(async () => {
  h = await createHarness(alwaysOk);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetDb();
  await seedPlatform(h);
});

async function requested(balance = 100n, amount = '60') {
  const userId = randomUUID();
  await seedWallet(h, { userId, balance });
  const w = await h.withdrawals.create(userId, { bankAccountId: randomUUID(), amount, idempotencyKey: randomUUID() });
  return { userId, id: w.id };
}

async function mockPayoutConsume(withdrawalId: string) {
  const event = await h.prisma.outboxEvent.findFirstOrThrow({
    where: { eventType: 'wallet.withdrawal.requested', payload: { path: ['withdrawalId'], equals: withdrawalId } },
  });
  expect(event.payload).toMatchObject({ withdrawalId });
  return h.withdrawals.markProcessing(withdrawalId);
}

describe('mock Payment ↔ wallet withdrawal contract', () => {
  it('claim → success: trừ tiền, giải phóng reserved', async () => {
    const { userId, id } = await requested();
    await mockPayoutConsume(id);
    await h.withdrawals.finish(userId, id, 'succeeded');
    const w = await balanceOf(h, userId);
    expect([w.balance, w.reserved]).toEqual([40n, 0n]);
  });

  it('claim → failed: hoàn lại, balance nguyên vẹn', async () => {
    const { userId, id } = await requested();
    await mockPayoutConsume(id);
    await h.withdrawals.finish(userId, id, 'failed');
    const w = await balanceOf(h, userId);
    expect([w.balance, w.reserved]).toEqual([100n, 0n]);
  });

  it('event trùng/claim lặp và callback lặp: idempotent', async () => {
    const { userId, id } = await requested();
    await mockPayoutConsume(id);
    await mockPayoutConsume(id);
    await h.withdrawals.finish(userId, id, 'succeeded');
    await h.withdrawals.finish(userId, id, 'succeeded');
    expect((await balanceOf(h, userId)).balance).toBe(40n);
    expect(await h.prisma.walletTransaction.count({ where: { type: 'withdrawal' } })).toBe(1);
  });

  it('callback thành công đến muộn sau khi user huỷ → needs_review, không tự động đổi tiền', async () => {
    const { userId, id } = await requested();
    await h.withdrawals.cancel(userId, id);
    await expect(h.withdrawals.markProcessing(id)).rejects.toMatchObject({ status: 409 });
    await h.withdrawals.finish(userId, id, 'succeeded');
    expect((await h.prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('needs_review');
    expect((await balanceOf(h, userId)).balance).toBe(100n);
  });

  it('callback terminal khi chưa claim bị từ chối', async () => {
    const { userId, id } = await requested();
    await expect(h.withdrawals.finish(userId, id, 'succeeded')).rejects.toMatchObject({ status: 409 });
  });

  it('provider crash/timeout sau claim: giữ processing, hold vẫn active, user không huỷ được', async () => {
    const { userId, id } = await requested();
    await mockPayoutConsume(id);
    await expect(h.withdrawals.cancel(userId, id)).rejects.toMatchObject({ status: 409 });
    const hold = await h.prisma.walletHold.findUniqueOrThrow({ where: { withdrawalId: id } });
    expect(hold.status).toBe('active');
    expect((await balanceOf(h, userId)).reserved).toBe(60n);
  });
});
