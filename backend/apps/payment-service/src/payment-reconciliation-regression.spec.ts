import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaymentOrdersService } from './payment-orders/payment-orders.service.js';
import { OrderEventsService } from './order-events/order-events.service.js';
import { PayoutsService } from './payouts/payouts.service.js';

// Reproductions of the reviewed behavior. In-memory repositories honor the actual
// query filters/order/limit; these are service-level checks, not database E2E.
describe('Payment reconciliation and order completion regression', () => {
  afterEach(() => vi.useRealTimers());

  it('retains retry eligibility after restart and does not execute a claim lost to another sweep', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
    const row = {
      id: 'attempt',
      paymentId: 'payment',
      nextRetryAt: new Date(0),
    };
    const repository = {
      findMany: vi.fn(async ({ where }) =>
        row.nextRetryAt <= where.nextRetryAt.lte ? [row] : [],
      ),
      updateMany: vi.fn(async ({ data }) => {
        row.nextRetryAt = data.nextRetryAt;
        return { count: 1 };
      }),
    };
    const wallet = {
      debitPayment: vi.fn().mockResolvedValue({ outcome: 'unknown' }),
      getOperation: vi.fn().mockResolvedValue({ outcome: 'unknown' }),
    };
    const database = {
      client: {
        paymentAttempt: repository,
        payment: {
          findUnique: async () => ({
            id: 'payment',
            status: 'processing',
            amount: 100n,
            workerEarning: 90n,
            platformFee: 10n,
          }),
        },
      },
    };
    const build = () =>
      new PaymentOrdersService(
        database as never,
        {} as never,
        wallet as never,
        {} as never,
        {} as never,
      );
    await build().resumeStaleAttempts(1000);
    await build().resumeStaleAttempts(1000);
    expect(wallet.debitPayment).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    await build().resumeStaleAttempts(1000);
    expect(wallet.debitPayment).toHaveBeenCalledTimes(2);
    expect(wallet.getOperation.mock.calls).toEqual([
      ['payment:attempt'],
      ['payment:attempt'],
    ]);
    vi.advanceTimersByTime(30_000);
    repository.updateMany.mockResolvedValueOnce({ count: 0 });
    await build().resumeStaleAttempts(1000);
    expect(wallet.debitPayment).toHaveBeenCalledTimes(2);
  });
  it('visits the 21st Point attempt while earlier attempts remain unresolved', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `a${i}`,
      paymentId: `p${i}`,
      method: 'point',
      status: 'processing',
      nextRetryAt: new Date(i),
      attemptedAt: new Date(i),
    }));
    const findMany = vi.fn(async ({ where, take }) =>
      rows
        .filter(
          (r) =>
            r.nextRetryAt <= where.nextRetryAt.lte &&
            r.status === where.status &&
            r.attemptedAt < where.attemptedAt.lt,
        )
        .sort(
          (a, b) => +a.nextRetryAt - +b.nextRetryAt || a.id.localeCompare(b.id),
        )
        .slice(0, take),
    );
    const wallet = {
      debitPayment: vi.fn().mockResolvedValue({ outcome: 'unknown' }),
      getOperation: vi.fn().mockResolvedValue({ outcome: 'unknown' }),
    };
    const db = {
      client: {
        paymentAttempt: {
          findMany,
          updateMany: vi.fn(async ({ where, data }) => {
            Object.assign(
              rows.find((r) => r.id === where.id)!,
              data,
            );
            return { count: 1 };
          }),
        },
        payment: {
          findUnique: vi.fn(async ({ where }) => ({
            id: where.id,
            status: 'processing',
            amount: 100n,
            platformFee: 10n,
            workerEarning: 90n,
          })),
        },
      },
    };
    const service = new PaymentOrdersService(
      db as never,
      {} as never,
      wallet as never,
      {} as never,
      {} as never,
    );
    for (let i = 0; i < 3; i++) await service.resumeStaleAttempts(1000);
    expect(wallet.debitPayment).toHaveBeenCalledTimes(21);
    expect(
      wallet.debitPayment.mock.calls.some(
        ([, body]) => body.paymentId === 'p20',
      ),
    ).toBe(true);
  });

  it('visits the 21st commission while earlier commissions remain due', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      paymentId: `p${i}`,
      status: 'due',
      nextRetryAt: new Date(i),
      createdAt: new Date(i),
      amountDue: 10n,
      amountCollected: 0n,
    }));
    const repo = {
      findMany: vi.fn(async ({ where, take }) =>
        rows
          .filter(
            (r) =>
              r.nextRetryAt <= where.nextRetryAt.lte &&
              where.status.in.includes(r.status),
          )
          .sort((a, b) => +a.nextRetryAt - +b.nextRetryAt)
          .slice(0, take),
      ),
      findUnique: vi.fn(async ({ where }) =>
        rows.find((r) => r.paymentId === where.paymentId),
      ),
      updateMany: vi.fn(async ({ where, data }) => {
        Object.assign(
          rows.find((r) => r.paymentId === where.paymentId)!,
          data,
        );
        return { count: 1 };
      }),
    };
    const wallet = {
      collectCommission: vi
        .fn()
        .mockResolvedValue({ outcome: 'rejected', status: 409 }),
    };
    const service = new PaymentOrdersService(
      { client: { commissionReceivable: repo } } as never,
      {} as never,
      wallet as never,
      {} as never,
      {} as never,
    );
    for (let i = 0; i < 3; i++) await service.collectDueCommissions();
    expect(wallet.collectCommission).toHaveBeenCalledTimes(21);
    expect(
      wallet.collectCommission.mock.calls.some(
        ([body]) => body.paymentId === 'p20',
      ),
    ).toBe(true);
  });

  it('visits the eleventh payout despite ten missing bank snapshots', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      id: `p${i}`,
      userId: `u${i}`,
      bankAccountId: `b${i}`,
      status: 'pending',
      nextRetryAt: new Date(i),
      createdAt: new Date(i),
      bankAccountSnapshot: { state: 'unresolved' },
    }));
    const repo = {
      findMany: vi.fn(async ({ where, take }) =>
        rows
          .filter(
            (r) =>
              r.status === where.status &&
              r.nextRetryAt <= where.nextRetryAt.lte,
          )
          .sort((a, b) => +a.nextRetryAt - +b.nextRetryAt)
          .slice(0, take),
      ),
      updateMany: vi.fn(async ({ where, data }) => {
        Object.assign(
          rows.find((r) => r.id === where.id)!,
          data,
        );
        return { count: 1 };
      }),
    };
    Object.assign(repo, { update: vi.fn() });
    const snapshots = {
      fetch: vi.fn(async (userId) =>
        userId === 'u10' ? { owner: true } : null,
      ),
    };
    const wallet = {
      claimWithdrawal: vi.fn().mockResolvedValue({ outcome: 'unknown' }),
    };
    const service = new PayoutsService(
      { client: { payout: repo } } as never,
      wallet as never,
      { isEnabled: () => true } as never,
      snapshots as never,
      {} as never,
    );
    for (let i = 0; i < 3; i++) await service.processBatch();
    expect(snapshots.fetch).toHaveBeenCalledTimes(11);
    expect(snapshots.fetch.mock.calls.some(([id]) => id === 'u10')).toBe(true);
    expect(wallet.claimWithdrawal).toHaveBeenCalledTimes(1);
  });

  it('HTTP open before order.completed emits payment.pending once with Order time', async () => {
    const payment = {
      id: randomUUID(),
      orderId: randomUUID(),
      customerUserId: randomUUID(),
      workerUserId: randomUUID(),
      amount: 100n,
      status: 'pending',
      method: null,
      orderCompletedAt: null as Date | null,
    };
    const tx = {
      $queryRaw: vi.fn(),
      payment: {
        findUnique: vi.fn(async () => payment),
        update: vi.fn(async ({ data }) => Object.assign(payment, data)),
      },
    };
    const outbox = { enqueue: vi.fn() };
    const open = new PaymentOrdersService(
      {
        client: {
          $transaction: async (cb: (t: typeof tx) => unknown) => cb(tx),
        },
      } as never,
      {
        getEligibility: async () => ({
          ...payment,
          isEligibleForSettlement: true,
          completedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      } as never,
      {} as never,
      outbox as never,
      { findById: async () => payment } as never,
    );
    const events = new OrderEventsService(
      {} as never,
      {} as never,
      outbox as never,
    );
    await open.open(payment.customerUserId, {
      orderId: payment.orderId,
      method: 'point',
    });
    const httpTime = payment.orderCompletedAt;
    const event = {
      ...payment,
      agreedPrice: '100',
      completedAt: '2026-01-01T00:00:00.000Z',
    };
    await events.onCompleted(event, tx as never);
    expect(outbox.enqueue).toHaveBeenCalledTimes(1);
    expect(payment.orderCompletedAt).toBe(httpTime);
    expect(payment.orderCompletedAt).toEqual(new Date(event.completedAt));
  });
});
