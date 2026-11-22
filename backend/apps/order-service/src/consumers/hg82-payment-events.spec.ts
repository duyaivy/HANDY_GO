import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PaymentEventsConsumer } from './payment-events.consumer.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ConsumedEventRepository } from '../common/inbox/consumed-event.repository.js';
import type { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';

const orderId = randomUUID();
const resolutionId = randomUUID();
const paymentId = randomUUID();
const refundId = randomUUID();
const customerUserId = randomUUID();
const workerUserId = randomUUID();
const adminUserId = randomUUID();

function fixture() {
  const order = { id: orderId, orderCode: 'ORD-HG82', status: 'disputed', version: 4, customerUserId, workerUserId };
  const resolution = { id: resolutionId, orderId, action: 'refund', state: 'refund_pending', paymentId,
    refundAmountVnd: 150000n, adminUserId, resolutionNote: 'Hoàn tiền theo kết luận' };
  const tx = {
    $queryRaw: vi.fn(),
    order: { findUnique: vi.fn().mockResolvedValue(order), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    orderDisputeResolution: { findUnique: vi.fn().mockResolvedValue(resolution), update: vi.fn() },
    orderStatusHistory: { create: vi.fn() },
  };
  const db = { $transaction: vi.fn(async (run: any) => run(tx)) };
  const inbox = { recordEventIfNew: vi.fn().mockResolvedValue(true) };
  const outbox = { createEvent: vi.fn() };
  const consumer = new PaymentEventsConsumer(db as unknown as PrismaService,
    inbox as unknown as ConsumedEventRepository, outbox as unknown as OrderOutboxRepository);
  const data = { eventId: randomUUID(), payload: { resolutionId, orderId, paymentId, refundId,
    refundAmountVnd: '150000', paymentStatus: 'partially_refunded' } };
  return { consumer, tx, db, inbox, outbox, data };
}

describe('Order HG-82 Payment outcome', () => {
  it('closes the dispute exactly after Payment confirms the refund', async () => {
    const f = fixture();
    await f.consumer.handleDisputeRefundCompleted(f.data);
    expect(f.tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'disputed', version: 4 }),
      data: expect.objectContaining({ status: 'completed', paymentState: 'partially_refunded' }),
    }));
    expect(f.tx.orderDisputeResolution.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ state: 'completed', refundId }),
    }));
    expect(f.outbox.createEvent.mock.calls.map(([event]) => event.eventType)).toEqual([
      ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED, ORDER_CONSTANTS.EVENT_ORDER_DISPUTE_RESOLVED,
    ]);
    f.inbox.recordEventIfNew.mockResolvedValue(false);
    await f.consumer.handleDisputeRefundCompleted(f.data);
    expect(f.tx.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it('flags a definitive review outcome without completing the order', async () => {
    const f = fixture();
    await f.consumer.handleDisputeRefundNeedsReview({ eventId: randomUUID(), payload: {
      resolutionId, orderId, paymentId, failureCode: 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE',
    } });
    expect(f.tx.orderDisputeResolution.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ state: 'needs_review' }),
    }));
    expect(f.tx.order.updateMany).not.toHaveBeenCalled();
    expect(f.outbox.createEvent).not.toHaveBeenCalled();
  });

  it('does not complete when the outcome amount disagrees with the decision', async () => {
    const f = fixture();
    await f.consumer.handleDisputeRefundCompleted({ eventId: randomUUID(), payload: {
      ...f.data.payload, refundAmountVnd: '150001',
    } });
    expect(f.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('accepts a full refund outcome and records the refunded payment state', async () => {
    const f = fixture();
    await f.consumer.handleDisputeRefundCompleted({ eventId: randomUUID(), payload: {
      ...f.data.payload, paymentStatus: 'refunded',
    } });
    expect(f.tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentState: 'refunded', status: 'completed' }),
    }));
  });

  it('ignores a completion for another payment or a missing refund ID', async () => {
    const f = fixture();
    const warnSpy = vi.spyOn((f.consumer as any).logger, 'warn');
    const mismatchedPaymentEventId = randomUUID();
    const missingRefundEventId = randomUUID();
    await f.consumer.handleDisputeRefundCompleted({ eventId: mismatchedPaymentEventId, payload: {
      ...f.data.payload, paymentId: randomUUID(),
    } });
    await f.consumer.handleDisputeRefundCompleted({ eventId: missingRefundEventId, payload: {
      ...f.data.payload, refundId: undefined,
    } });
    expect(f.tx.order.updateMany).not.toHaveBeenCalled();
    expect(f.outbox.createEvent).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(mismatchedPaymentEventId));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(missingRefundEventId));
  });

  it('rejects a blank or whitespace eventId with nack(requeue=false) and logs a warning without querying DB', async () => {
    const f = fixture();
    const warnSpy = vi.spyOn((f.consumer as any).logger, 'warn');
    const nack = vi.fn();
    const msg = {};
    const ctx = {
      getChannelRef: () => ({ nack, ack: vi.fn() }),
      getMessage: () => msg,
    };

    await f.consumer.handleDisputeRefundCompleted(
      { eventId: '   ', payload: f.data.payload },
      ctx,
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Rejected malformed dispute refund event (completed)'),
    );
    expect(nack).toHaveBeenCalledWith(msg, false, false);
    expect(f.db.$transaction).not.toHaveBeenCalled();
    expect(f.inbox.recordEventIfNew).not.toHaveBeenCalled();
  });

  it('does not record eventId in consumed_events and logs a warning when resolution is missing', async () => {
    const f = fixture();
    const warnSpy = vi.spyOn((f.consumer as any).logger, 'warn');
    f.tx.orderDisputeResolution.findUnique.mockResolvedValueOnce(null);

    await f.consumer.handleDisputeRefundCompleted(f.data);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`missing resolution=false or order=true (resolutionId=${resolutionId}, orderId=${orderId})`),
    );
    expect(f.inbox.recordEventIfNew).not.toHaveBeenCalled();
    expect(f.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it('logs a detailed warning when order is not disputed or refundAmountVnd mismatches', async () => {
    const f = fixture();
    const warnSpy = vi.spyOn((f.consumer as any).logger, 'warn');
    const amountMismatchEventId = randomUUID();

    await f.consumer.handleDisputeRefundCompleted({
      eventId: amountMismatchEventId,
      payload: { ...f.data.payload, refundAmountVnd: '999999' },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Ignored ${ORDER_CONSTANTS.EVENT_PAYMENT_DISPUTE_REFUND_COMPLETED} (eventId=${amountMismatchEventId}): completion guard failed`),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`resolutionId=${resolutionId}, orderId=${orderId}`),
    );
    expect(f.tx.order.updateMany).not.toHaveBeenCalled();
  });
});
