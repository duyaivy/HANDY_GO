import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PermanentInboundError, RetryableInboundError } from '../common/inbound/inbound-event.js';
import { CommissionRuleMissingError } from '../commission-rules/commission-rule.service.js';
import { OrderEventsService, parseOrderEvent } from './order-events.service.js';

const orderId = randomUUID();
const customerUserId = randomUUID();
const workerUserId = randomUUID();
const created = { orderId, customerUserId, workerUserId, agreedPrice: '350000.00', currency: 'VND', createdAt: '2026-11-05T01:00:00.000Z' };

function setup(payment: Record<string, unknown> | null = null) {
  const tx = {
    payment: {
      findUnique: vi.fn().mockResolvedValue(payment),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockImplementation(async ({ data }) => ({ ...payment, ...data })),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const commission = { snapshotFor: vi.fn().mockResolvedValue({ commissionRuleId: 'rule', commissionRatePercent: '10.00', platformFee: 35000n, workerEarning: 315000n }) };
  const outbox = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const inbox = { register: vi.fn() };
  const service = new OrderEventsService(inbox as never, commission as never, outbox as never);
  return { service, tx: tx as never, txMock: tx, commission, outbox, inbox };
}

const stored = (status = 'pending', extra: Record<string, unknown> = {}) => ({
  id: randomUUID(), orderId, customerUserId, workerUserId, amount: 350000n, status, method: null, orderCompletedAt: null, ...extra,
});

describe('parseOrderEvent', () => {
  it('accepts exact whole VND and legacy id aliases', () => {
    const parsed = parseOrderEvent({ ...created, customerUserId: undefined, customerId: customerUserId }, 'createdAt');
    expect(parsed).toMatchObject({ orderId, customerUserId, workerUserId, amount: 350000n });
  });

  it('rejects fractional VND, foreign currency and identical parties as permanent', () => {
    expect(() => parseOrderEvent({ ...created, agreedPrice: '350000.50' }, 'createdAt')).toThrow(PermanentInboundError);
    expect(() => parseOrderEvent({ ...created, currency: 'USD' }, 'createdAt')).toThrow(PermanentInboundError);
    expect(() => parseOrderEvent({ ...created, workerUserId: customerUserId }, 'createdAt')).toThrow(PermanentInboundError);
    expect(() => parseOrderEvent({ ...created, orderId: 'nope' }, 'createdAt')).toThrow(PermanentInboundError);
  });
});

describe('OrderEventsService', () => {
  it('registers the three order handlers', () => {
    const { service, inbox } = setup();
    service.onModuleInit();
    expect(inbox.register.mock.calls.map(([type]) => type)).toEqual(['order.created', 'order.completed', 'order.cancelled']);
  });

  it('pre-creates the payment with the commission snapshot and does not charge', async () => {
    const { service, tx, txMock, commission } = setup(null);
    await service.onCreated(created, tx);
    expect(commission.snapshotFor).toHaveBeenCalledWith(tx, 350000n, new Date('2026-11-05T01:00:00.000Z'));
    expect(txMock.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId, amount: 350000n, platformFee: 35000n, workerEarning: 315000n, commissionRuleId: 'rule' }),
    });
  });

  it('fails closed (retryable) while no commission rule exists', async () => {
    const { service, tx, commission, txMock } = setup(null);
    commission.snapshotFor.mockRejectedValue(new CommissionRuleMissingError());
    await expect(service.onCreated(created, tx)).rejects.toBeInstanceOf(RetryableInboundError);
    expect(txMock.payment.create).not.toHaveBeenCalled();
  });

  it('treats a replayed order.created as a no-op but rejects a contradicting one', async () => {
    const same = setup(stored());
    await same.service.onCreated(created, same.tx);
    expect(same.txMock.payment.create).not.toHaveBeenCalled();
    const different = setup(stored('pending', { amount: 1n }));
    await expect(different.service.onCreated(created, different.tx)).rejects.toBeInstanceOf(PermanentInboundError);
  });

  it('opens the payment on order.completed and emits payment.pending once', async () => {
    const { service, tx, txMock, outbox } = setup(stored());
    await service.onCompleted({ ...created, completedAt: '2026-11-05T02:00:00.000Z' }, tx);
    expect(txMock.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: { orderCompletedAt: new Date('2026-11-05T02:00:00.000Z') } }));
    expect(outbox.enqueue).toHaveBeenCalledWith(tx, expect.objectContaining({ eventType: 'payment.pending' }));

    const again = setup(stored('pending', { orderCompletedAt: new Date() }));
    await again.service.onCompleted(created, again.tx);
    expect(again.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('waits (retryable) when order.completed arrives before order.created', async () => {
    const { service, tx } = setup(null);
    await expect(service.onCompleted(created, tx)).rejects.toBeInstanceOf(RetryableInboundError);
  });

  it('cancels only open payments using compare-and-set', async () => {
    const open = setup(stored('pending'));
    await open.service.onCancelled(created, open.tx);
    expect(open.txMock.payment.updateMany).toHaveBeenCalledWith({
      where: { id: expect.any(String), status: { in: ['pending', 'failed'] } },
      data: { status: 'cancelled' },
    });
    expect(open.outbox.enqueue).toHaveBeenCalledWith(open.tx, expect.objectContaining({ eventType: 'payment.cancelled' }));

    const settled = setup(stored('succeeded'));
    await settled.service.onCancelled(created, settled.tx);
    expect(settled.txMock.payment.updateMany).not.toHaveBeenCalled();

    const inFlight = setup(stored('processing'));
    await expect(inFlight.service.onCancelled(created, inFlight.tx)).rejects.toBeInstanceOf(RetryableInboundError);
  });
});
