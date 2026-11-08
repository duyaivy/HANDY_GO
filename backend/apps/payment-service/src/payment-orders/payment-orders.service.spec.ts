import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PaymentOrdersService } from './payment-orders.service.js';

const customerId = randomUUID();
const workerId = randomUUID();
const orderId = randomUUID();

function build(initial: Partial<Record<string, unknown>> = {}) {
  const state = {
    payment: {
      id: randomUUID(), orderId, customerUserId: customerId, workerUserId: workerId, amount: 100000n,
      platformFee: 10000n, workerEarning: 90000n, status: 'pending', method: 'point', orderCompletedAt: new Date(),
      ...initial,
    } as Record<string, any>,
    attempts: [] as Array<Record<string, any>>,
  };
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    payment: {
      findUnique: vi.fn(async () => state.payment),
      update: vi.fn(async ({ data }) => Object.assign(state.payment, data)),
    },
    paymentAttempt: {
      aggregate: vi.fn(async () => ({ _max: { attemptNo: state.attempts.length || null } })),
      create: vi.fn(async ({ data }) => {
        const attempt = { id: randomUUID(), ...data };
        state.attempts.push(attempt);
        return attempt;
      }),
      findFirst: vi.fn(async () => state.attempts.find((a) => a.status === 'processing') ?? null),
      findUnique: vi.fn(async ({ where }) => state.attempts.find((a) => a.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }) => Object.assign(state.attempts.find((a) => a.id === where.id)!, data)),
    },
    paymentSettlement: { create: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
    commissionReceivable: { create: vi.fn(), updateMany: vi.fn() },
  };
  const database = {
    client: {
      $transaction: (cb: (t: typeof tx) => unknown) => cb(tx),
      commissionReceivable: { findUnique: vi.fn(), findMany: vi.fn() },
      paymentAttempt: { findMany: vi.fn() },
      payment: { findUnique: vi.fn() },
    },
  };
  const orders = { getEligibility: vi.fn() };
  const wallet = { debitPayment: vi.fn(), getOperation: vi.fn(), collectCommission: vi.fn() };
  const outbox = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const query = { findById: vi.fn(async () => ({ id: state.payment.id, status: state.payment.status })) };
  const service = new PaymentOrdersService(database as never, orders as never, wallet as never, outbox as never, query as never);
  return { service, state, tx, database, orders, wallet, outbox, query };
}

const eligible = (overrides = {}) => ({
  orderId, customerUserId: customerId, workerUserId: workerId, status: 'completed', paymentState: 'unpaid',
  amount: 100000n, currency: 'VND', isEligibleForSettlement: true, ...overrides,
});

describe('PaymentOrdersService.open', () => {
  it('replays after Order is paid without creating a charge or allowing a method change', async () => {
    const h = build({ status: 'succeeded' });
    h.orders.getEligibility.mockResolvedValue(eligible({ paymentState: 'paid', isEligibleForSettlement: false }));
    await expect(h.service.open(customerId, { orderId, method: 'point' })).resolves.toMatchObject({ status: 'succeeded' });
    expect(h.wallet.debitPayment).not.toHaveBeenCalled();
    expect(h.tx.payment.update).not.toHaveBeenCalled();
    await expect(h.service.open(customerId, { orderId, method: 'cash' })).rejects.toMatchObject({ status: 409 });
  });
  it('hides payments from users other than the order customer', async () => {
    const { service, orders } = build();
    orders.getEligibility.mockResolvedValue(eligible());
    await expect(service.open(randomUUID(), { orderId, method: 'cash' })).rejects.toMatchObject({ status: 404 });
  });

  it('rejects orders that are not eligible or whose amount differs from the snapshot', async () => {
    const closed = build();
    closed.orders.getEligibility.mockResolvedValue(eligible({ isEligibleForSettlement: false }));
    await expect(closed.service.open(customerId, { orderId, method: 'cash' })).rejects.toMatchObject({ status: 409 });

    const mismatch = build();
    mismatch.orders.getEligibility.mockResolvedValue(eligible({ amount: 99999n }));
    await expect(mismatch.service.open(customerId, { orderId, method: 'cash' })).rejects.toMatchObject({ status: 409 });
  });

  it('switches the method of an open payment without charging', async () => {
    const { service, orders, tx, wallet, state } = build({ method: null, orderCompletedAt: null });
    orders.getEligibility.mockResolvedValue(eligible());
    await service.open(customerId, { orderId, method: 'cash' });
    expect(state.payment.method).toBe('cash');
    expect(tx.paymentAttempt.create).not.toHaveBeenCalled();
    expect(wallet.debitPayment).not.toHaveBeenCalled();
  });

  it('refuses to change the method while the payment is processing or settled with another method', async () => {
    const processing = build({ status: 'processing' });
    processing.orders.getEligibility.mockResolvedValue(eligible());
    await expect(processing.service.open(customerId, { orderId, method: 'cash' })).rejects.toMatchObject({ status: 409 });

    const settled = build({ status: 'succeeded', method: 'point' });
    settled.orders.getEligibility.mockResolvedValue(eligible());
    await expect(settled.service.open(customerId, { orderId, method: 'cash' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('PaymentOrdersService.confirmCash', () => {
  it('only the order worker can confirm and records receivable without crediting the worker', async () => {
    const { service, state, tx, outbox, wallet, database } = build({ method: 'cash' });
    await expect(service.confirmCash(customerId, state.payment.id)).rejects.toMatchObject({ status: 404 });

    database.client.commissionReceivable.findUnique.mockResolvedValue(null);
    await service.confirmCash(workerId, state.payment.id);
    expect(state.payment.status).toBe('succeeded');
    expect(state.payment.cashConfirmedByUserId).toBe(workerId);
    expect(tx.paymentSettlement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'receivable' }) });
    expect(tx.commissionReceivable.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amountDue: 10000n }) });
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({ eventType: 'payment.succeeded' }));
    expect(wallet.debitPayment).not.toHaveBeenCalled();
  });

  it('is idempotent once succeeded and rejects non-cash or unopened payments', async () => {
    const done = build({ method: 'cash', status: 'succeeded' });
    await done.service.confirmCash(workerId, done.state.payment.id);
    expect(done.tx.paymentAttempt.create).not.toHaveBeenCalled();

    const point = build({ method: 'point' });
    await expect(point.service.confirmCash(workerId, point.state.payment.id)).rejects.toMatchObject({ status: 409 });

    const unopened = build({ method: 'cash', orderCompletedAt: null });
    await expect(unopened.service.confirmCash(workerId, unopened.state.payment.id)).rejects.toMatchObject({ status: 409 });
  });

  it('keeps the commission due when Wallet cannot collect it', async () => {
    const { service, wallet, database } = build();
    database.client.commissionReceivable.findUnique.mockResolvedValue({
      status: 'due', amountDue: 10000n, amountCollected: 0n, workerUserId: workerId,
    });
    wallet.collectCommission.mockResolvedValue({ outcome: 'rejected', status: 409, message: 'Insufficient' });
    await expect(service.collectCommission('p')).resolves.toBe('pending');
    wallet.collectCommission.mockResolvedValue({ outcome: 'ok', status: 200, data: {} });
    await expect(service.collectCommission('p')).resolves.toBe('collected');
    expect(wallet.collectCommission).toHaveBeenLastCalledWith(expect.objectContaining({ amount: '10000', idempotencyKey: 'p' }));
  });
});

describe('PaymentOrdersService.payWithPoints', () => {
  it('settles only after Wallet commits and uses a fixed operation id', async () => {
    const { service, state, wallet, outbox } = build();
    wallet.debitPayment.mockResolvedValue({ outcome: 'ok', status: 200, data: { status: 'completed' } });
    await service.payWithPoints(customerId, state.payment.id);
    expect(wallet.debitPayment).toHaveBeenCalledWith(customerId, expect.objectContaining({
      paymentId: state.payment.id, attemptId: state.attempts[0].id, grossAmount: '100000', workerEarning: '90000', platformFee: '10000',
    }));
    expect(state.payment.status).toBe('succeeded');
    expect(state.attempts[0].status).toBe('succeeded');
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'payment.succeeded' }));
  });

  it('marks the payment failed on a definite Wallet refusal and allows a later new attempt', async () => {
    const { service, state, wallet, outbox } = build();
    wallet.debitPayment.mockResolvedValue({ outcome: 'rejected', status: 409, message: 'Insufficient available balance' });
    await service.payWithPoints(customerId, state.payment.id);
    expect(state.payment.status).toBe('failed');
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ eventType: 'payment.failed' }));

    wallet.debitPayment.mockResolvedValue({ outcome: 'ok', status: 200, data: { status: 'completed' } });
    await service.payWithPoints(customerId, state.payment.id);
    expect(state.attempts).toHaveLength(2);
    expect(state.payment.status).toBe('succeeded');
  });

  it('never creates a new attempt or fails the payment when the outcome is unknown', async () => {
    const { service, state, wallet } = build();
    wallet.debitPayment.mockResolvedValue({ outcome: 'unknown', message: 'timeout' });
    wallet.getOperation.mockResolvedValue({ outcome: 'missing' });
    await service.payWithPoints(customerId, state.payment.id);
    expect(state.payment.status).toBe('processing');
    const firstAttemptId = state.attempts[0].id;

    wallet.debitPayment.mockResolvedValue({ outcome: 'ok', status: 200, data: { status: 'completed' } });
    await service.payWithPoints(customerId, state.payment.id);
    expect(state.attempts).toHaveLength(1);
    expect(wallet.debitPayment).toHaveBeenLastCalledWith(customerId, expect.objectContaining({ attemptId: firstAttemptId }));
    expect(state.payment.status).toBe('succeeded');
  });

  it('resolves an unknown debit by looking the operation up before giving up', async () => {
    const { service, state, wallet } = build();
    wallet.debitPayment.mockResolvedValue({ outcome: 'unknown', message: 'timeout' });
    wallet.getOperation.mockResolvedValue({ outcome: 'ok', status: 200, data: { status: 'completed' } });
    await service.payWithPoints(customerId, state.payment.id);
    expect(wallet.getOperation).toHaveBeenCalledWith(`${state.payment.id}:${state.attempts[0].id}`);
    expect(state.payment.status).toBe('succeeded');
  });

  it('fails closed for other customers, non-point payments and zero worker earnings', async () => {
    const { service, state } = build();
    await expect(service.payWithPoints(randomUUID(), state.payment.id)).rejects.toMatchObject({ status: 404 });

    const cash = build({ method: 'cash' });
    await expect(cash.service.payWithPoints(customerId, cash.state.payment.id)).rejects.toMatchObject({ status: 409 });

    const zero = build({ workerEarning: 0n, platformFee: 100000n });
    await expect(zero.service.payWithPoints(customerId, zero.state.payment.id)).rejects.toMatchObject({ status: 409 });
    expect(zero.wallet.debitPayment).not.toHaveBeenCalled();
  });

  it('does not touch Wallet again for an already succeeded point payment', async () => {
    const { service, state, wallet } = build({ status: 'succeeded' });
    await service.payWithPoints(customerId, state.payment.id);
    expect(wallet.debitPayment).not.toHaveBeenCalled();
  });
});

describe('PaymentOrdersService reconciliation', () => {
  it('re-drives stale processing attempts with the same operation', async () => {
    const { service, state, wallet, database } = build({ status: 'processing' });
    const attempt = { id: randomUUID(), paymentId: state.payment.id, method: 'point', status: 'processing' };
    state.attempts.push(attempt);
    database.client.paymentAttempt.findMany.mockResolvedValue([attempt]);
    database.client.payment.findUnique.mockResolvedValue(state.payment);
    wallet.debitPayment.mockResolvedValue({ outcome: 'ok', status: 200, data: { status: 'completed' } });
    await expect(service.resumeStaleAttempts(1000)).resolves.toBe(1);
    expect(wallet.debitPayment).toHaveBeenCalledWith(customerId, expect.objectContaining({ attemptId: attempt.id }));
    expect(state.payment.status).toBe('succeeded');
  });
});
