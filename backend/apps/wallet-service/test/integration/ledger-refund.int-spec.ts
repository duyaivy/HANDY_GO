import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { withDb } from './helpers/db.js';
import {
  balanceOf,
  createHarness,
  resetDb,
  seedPayment,
  seedPlatform,
  seedWallet,
  sumOfAllBalances,
  type Harness,
} from './helpers/harness.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await resetDb();
  await seedPlatform(h);
});

describe('ledger locking & double spend (F01)', () => {
  it('raw SQL FOR UPDATE trên "wallet_service"."wallets" chạy được trên DB sạch', async () => {
    const w = await seedWallet(h, { balance: 10n });
    await expect(
      h.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "wallet_service"."wallets" WHERE id = ${w.id}::uuid FOR UPDATE`;
      }),
    ).resolves.toBeUndefined();
  });

  it('2 payment đồng thời không làm số dư khách âm và bảo toàn tổng Point', async () => {
    const customerUserId = randomUUID();
    const workerUserId = randomUUID();
    await seedWallet(h, { userId: customerUserId, balance: 100n });
    await seedWallet(h, { userId: workerUserId });
    const before = await sumOfAllBalances(h);

    const attempt = (n: number) =>
      h.payments.debit(customerUserId, {
        paymentId: randomUUID(),
        attemptId: `a${n}`,
        workerUserId,
        grossAmount: '80',
        workerEarning: '70',
        platformFee: '10',
      });
    const results = await Promise.allSettled([attempt(1), attempt(2)]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const customer = await balanceOf(h, customerUserId);
    expect(customer.balance).toBe(20n);
    expect(customer.balance).toBeGreaterThanOrEqual(0n);
    expect(await sumOfAllBalances(h)).toBe(before);
  });

  it('retry cùng idempotency key trả replay và không trừ tiền lần hai', async () => {
    const { customerUserId, workerUserId } = await seedPayment(h, {
      customerBalance: 100n, gross: 40n, worker: 30n, fee: 10n,
    });
    const paymentId = randomUUID();
    const dto = { paymentId, attemptId: 'x', workerUserId, grossAmount: '10', workerEarning: '10', platformFee: '0' };
    const first = await h.payments.debit(customerUserId, dto);
    const second = await h.payments.debit(customerUserId, dto);
    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect((await balanceOf(h, customerUserId)).balance).toBe(50n);
  });
});

describe('refund (F04, F13, R01)', () => {
  it('2 refund 60/60 đồng thời trên payment 100 → tổng hoàn ≤ 100', async () => {
    const { customerUserId, paymentId } = await seedPayment(h, {
      customerBalance: 100n, gross: 100n, worker: 80n, fee: 20n,
    });
    const before = await sumOfAllBalances(h);
    const results = await Promise.allSettled([
      h.refunds.refund(customerUserId, { paymentId, refundId: 'r1', amount: '60' }),
      h.refunds.refund(customerUserId, { paymentId, refundId: 'r2', amount: '60' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const refunded = await h.prisma.walletTransfer.aggregate({
      where: { kind: 'refund' }, _sum: { totalAmount: true },
    });
    expect(refunded._sum.totalAmount ?? 0n).toBeLessThanOrEqual(100n);
    expect(await sumOfAllBalances(h)).toBe(before);
  });

  it('100 lần hoàn 1 với split 80/20 → thu hồi đúng 80 từ worker và 20 từ platform', async () => {
    const { customerUserId, workerUserId, paymentId } = await seedPayment(h, {
      customerBalance: 100n, gross: 100n, worker: 80n, fee: 20n,
    });
    for (let i = 0; i < 100; i++) {
      await h.refunds.refund(customerUserId, { paymentId, refundId: `r${i}`, amount: '1' });
    }
    expect((await balanceOf(h, customerUserId)).balance).toBe(100n);
    expect((await balanceOf(h, workerUserId)).balance).toBe(0n);
    expect((await balanceOf(h, undefined, 'PLATFORM_FEES')).balance).toBe(0n);
  });

  it('retry refund toàn phần trả replay, không hoàn lần hai', async () => {
    const { customerUserId, paymentId } = await seedPayment(h, {
      customerBalance: 100n, gross: 100n, worker: 80n, fee: 20n,
    });
    const dto = { paymentId, refundId: 'full', amount: '100' };
    await h.refunds.refund(customerUserId, dto);
    const replay = await h.refunds.refund(customerUserId, dto);
    expect(replay.idempotentReplay).toBe(true);
    expect((await balanceOf(h, customerUserId)).balance).toBe(100n);
  });

  it('nguồn không đủ → từ chối (needs_review), không credit tiền mới, không lấy Platform bù', async () => {
    const { customerUserId, workerUserId, paymentId } = await seedPayment(h, {
      customerBalance: 100n, gross: 100n, worker: 80n, fee: 20n,
    });
    await h.prisma.wallet.update({ where: { userId: workerUserId }, data: { balance: 0n } });
    const platformBefore = (await balanceOf(h, undefined, 'PLATFORM_FEES')).balance;
    const customerBefore = (await balanceOf(h, customerUserId)).balance;

    await expect(
      h.refunds.refund(customerUserId, { paymentId, refundId: 'nsf', amount: '100' }),
    ).rejects.toThrow(/needs review/i);

    expect((await balanceOf(h, customerUserId)).balance).toBe(customerBefore);
    expect((await balanceOf(h, undefined, 'PLATFORM_FEES')).balance).toBe(platformBefore);
    expect(await h.prisma.walletTransfer.count({ where: { kind: 'refund' } })).toBe(0);
    expect(await h.prisma.outboxEvent.count({ where: { eventType: 'wallet.refunded' } })).toBe(0);
  });

  it('replay bởi user khác → forbidden; cùng key khác payload → conflict', async () => {
    const { customerUserId, paymentId } = await seedPayment(h, {
      customerBalance: 100n, gross: 100n, worker: 80n, fee: 20n,
    });
    await h.refunds.refund(customerUserId, { paymentId, refundId: 'own', amount: '10' });
    await expect(
      h.refunds.refund(randomUUID(), { paymentId, refundId: 'own', amount: '10' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      h.refunds.refund(customerUserId, { paymentId, refundId: 'own', amount: '11' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('hoàn vượt payment gốc → conflict', async () => {
    const { customerUserId, paymentId } = await seedPayment(h, {
      customerBalance: 100n, gross: 100n, worker: 80n, fee: 20n,
    });
    await expect(
      h.refunds.refund(customerUserId, { paymentId, refundId: 'big', amount: '101' }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('adjustment audit (F14)', () => {
  it('ghi wallet_audit_logs cùng transaction với ledger', async () => {
    const userId = randomUUID();
    await seedWallet(h, { userId });
    await h.prisma.wallet.update({ where: { systemKey: 'PLATFORM_FEES' }, data: { balance: 1000n } });
    const actorId = randomUUID();

    await h.refunds.adjust(userId, { amount: '50', direction: 'credit', reason: 'goodwill', idempotencyKey: 'adj-1' } as never, actorId);

    const logs = await h.prisma.walletAuditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ actorId, targetUserId: userId, action: 'wallet.adjustment', reason: 'goodwill' });
    expect((await balanceOf(h, userId)).balance).toBe(50n);
  });

  it('adjustment lỗi (platform không đủ tiền) rollback → không còn audit log', async () => {
    const userId = randomUUID();
    await seedWallet(h, { userId });
    await expect(
      h.refunds.adjust(userId, { amount: '50', direction: 'credit', reason: 'x', idempotencyKey: 'adj-2' } as never, randomUUID()),
    ).rejects.toThrow();
    expect(await h.prisma.walletAuditLog.count()).toBe(0);
    expect(await h.prisma.walletTransfer.count()).toBe(0);
  });

  it('audit log và transfer cùng tồn tại trong DB sau commit (kiểm tra bằng SQL thô)', async () => {
    const userId = randomUUID();
    await seedWallet(h, { userId });
    await h.prisma.wallet.update({ where: { systemKey: 'PLATFORM_FEES' }, data: { balance: 100n } });
    await h.refunds.adjust(userId, { amount: '5', direction: 'credit', reason: 'r', idempotencyKey: 'adj-3' } as never, randomUUID());
    const rows = await withDb((c) =>
      c.query('SELECT a.transfer_id FROM wallet_service.wallet_audit_logs a JOIN wallet_service.wallet_transfers t ON t.id = a.transfer_id'),
    );
    expect(rows.rowCount).toBe(1);
  });
});
