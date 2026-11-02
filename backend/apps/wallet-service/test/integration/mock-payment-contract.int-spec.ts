import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, resetDb, seedPlatform, seedWallet, balanceOf, type Harness } from './helpers/harness.js';
import type { BankAccountVerifier } from '../../src/withdrawal/bank-account-verifier/bank-account-verifier.port.js';

// MOCK payout provider: KHÔNG phải Payment service thật. Chỉ mô phỏng hợp đồng
// event requested(payoutOperationId) -> claim -> callback(status) mà Payment thật phải tuân theo.
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

// Mock Payment đọc payoutOperationId từ event outbox rồi claim.
async function mockPayoutConsume(withdrawalId: string) {
  const event = await h.prisma.outboxEvent.findFirstOrThrow({
    where: { eventType: 'wallet.withdrawal.requested', payload: { path: ['withdrawalId'], equals: withdrawalId } },
  });
  const op = (event.payload as { payoutOperationId: string }).payoutOperationId;
  expect(op).toMatch(/^[0-9a-f-]{36}$/);
  await h.withdrawals.claim(withdrawalId, { payoutOperationId: op, payoutReference: `mock-${withdrawalId}` });
  return op;
}
const callback = (id: string, op: string, status: 'succeeded' | 'failed' | 'cancelled') =>
  h.withdrawals.finish(id, { payoutOperationId: op, status });

describe('mock Payment ↔ wallet withdrawal contract', () => {
  it('claim → success: trừ tiền, giải phóng reserved', async () => {
    const { userId, id } = await requested();
    const op = await mockPayoutConsume(id);
    await callback(id, op, 'succeeded');
    const w = await balanceOf(h, userId);
    expect([w.balance, w.reserved]).toEqual([40n, 0n]);
  });

  it('claim → failed: hoàn lại, balance nguyên vẹn', async () => {
    const { userId, id } = await requested();
    const op = await mockPayoutConsume(id);
    await callback(id, op, 'failed');
    const w = await balanceOf(h, userId);
    expect([w.balance, w.reserved]).toEqual([100n, 0n]);
  });

  it('event trùng/claim lặp và callback lặp: idempotent', async () => {
    const { userId, id } = await requested();
    const op = await mockPayoutConsume(id);
    await mockPayoutConsume(id);
    await callback(id, op, 'succeeded');
    await callback(id, op, 'succeeded');
    expect((await balanceOf(h, userId)).balance).toBe(40n);
    expect(await h.prisma.walletTransaction.count({ where: { type: 'withdrawal' } })).toBe(1);
  });

  it('callback mâu thuẫn failed → succeeded: needs_review, không trừ tiền', async () => {
    const { userId, id } = await requested();
    const op = await mockPayoutConsume(id);
    await callback(id, op, 'failed');
    await callback(id, op, 'succeeded');
    const w = await h.prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    expect(w.status).toBe('needs_review');
    expect(w.reviewReason).toBeTruthy();
    expect((await balanceOf(h, userId)).balance).toBe(100n);
  });

  it('callback thành công đến muộn sau khi user huỷ → needs_review, không tự động đổi tiền', async () => {
    const { userId, id } = await requested();
    const w0 = await h.prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    await h.withdrawals.cancel(userId, id);
    await expect(h.withdrawals.claim(id, { payoutOperationId: w0.payoutOperationId })).rejects.toMatchObject({ status: 409 });
    await callback(id, w0.payoutOperationId, 'succeeded');
    expect((await h.prisma.withdrawal.findUniqueOrThrow({ where: { id } })).status).toBe('needs_review');
    expect((await balanceOf(h, userId)).balance).toBe(100n);
  });

  it('payoutReference trùng giữa 2 withdrawal bị từ chối', async () => {
    const a = await requested();
    const b = await requested();
    const wa = await h.prisma.withdrawal.findUniqueOrThrow({ where: { id: a.id } });
    const wb = await h.prisma.withdrawal.findUniqueOrThrow({ where: { id: b.id } });
    await h.withdrawals.claim(a.id, { payoutOperationId: wa.payoutOperationId, payoutReference: 'dup' });
    await expect(
      h.withdrawals.claim(b.id, { payoutOperationId: wb.payoutOperationId, payoutReference: 'dup' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('callback terminal khi chưa claim bị từ chối', async () => {
    const { id } = await requested();
    const w = await h.prisma.withdrawal.findUniqueOrThrow({ where: { id } });
    await expect(callback(id, w.payoutOperationId, 'succeeded')).rejects.toMatchObject({ status: 409 });
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
