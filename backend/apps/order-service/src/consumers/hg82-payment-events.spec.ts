import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PaymentEventsConsumer } from './payment-events.consumer.js';
import { DisputeRefundReconciliationService } from '../common/inbox/dispute-refund-reconciliation.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { ConsumedEventRepository } from '../common/inbox/consumed-event.repository.js';
import type { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';
import { ORDER_ERROR_CODES } from '../common/constants/order-errors.js';

const orderId = randomUUID();
const resolutionId = randomUUID();
const paymentId = randomUUID();
const refundId = randomUUID();
const customerUserId = randomUUID();
const workerUserId = randomUUID();
const adminUserId = randomUUID();

function fixture() {
  const order: Record<string, any> = {
    id: orderId,
    orderCode: 'ORD-HG82',
    status: 'disputed',
    paymentState: 'paid',
    version: 4,
    customerUserId,
    workerUserId,
  };
  const resolution: Record<string, any> = {
    id: resolutionId,
    orderId,
    action: 'refund',
    state: 'refund_pending',
    paymentId,
    refundId: null,
    refundAmountVnd: 150000n,
    adminUserId,
    resolutionNote: 'Hoàn tiền theo kết luận',
    failureCode: null,
    resolvedAt: null,
  };
  const consumed = new Set<string>();
  const reconciliations = new Map<string, Record<string, any>>();

  const inboundEventReconciliation = {
    upsert: vi.fn(async ({ where, create, update }: any) => {
      const existing = reconciliations.get(where.eventId);
      if (existing) {
        const next = {
          ...existing,
          ...update,
          attempts: existing.attempts + (update.attempts?.increment ?? 0),
        };
        reconciliations.set(where.eventId, next);
        return next;
      }
      const created = { ...create, createdAt: new Date(), updatedAt: new Date() };
      reconciliations.set(where.eventId, created);
      return created;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const existing = reconciliations.get(where.eventId);
      if (!existing) return { count: 0 };
      if (where.status?.in && !where.status.in.includes(existing.status)) {
        return { count: 0 };
      }
      Object.assign(existing, data);
      return { count: 1 };
    }),
    findUnique: vi.fn(async ({ where }: any) => reconciliations.get(where.eventId) ?? null),
    findMany: vi.fn(async ({ where }: any) =>
      [...reconciliations.values()].filter(
        (r) =>
          (!where?.status || r.status === where.status) &&
          (!where?.orderId || r.orderId === where.orderId),
      ),
    ),
    count: vi.fn(async ({ where }: any) =>
      [...reconciliations.values()].filter(
        (r) =>
          (!where?.status || r.status === where.status) &&
          (!where?.orderId || r.orderId === where.orderId),
      ).length,
    ),
  };

  const tx = {
    $queryRaw: vi.fn(),
    order: {
      findUnique: vi.fn(async () => order),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (
          (where.status !== undefined && where.status !== order.status) ||
          (where.version !== undefined && where.version !== order.version)
        ) {
          return { count: 0 };
        }
        Object.assign(order, data, {
          version: order.version + (data.version?.increment ?? 0),
        });
        return { count: 1 };
      }),
    },
    orderDisputeResolution: {
      findUnique: vi.fn(async () => resolution),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(resolution, data);
        return resolution;
      }),
    },
    orderStatusHistory: { create: vi.fn() },
    inboundEventReconciliation,
  };
  const db = {
    $transaction: vi.fn(async (run: any) => run(tx)),
    inboundEventReconciliation,
  };
  const inbox = {
    isEventConsumed: vi.fn(async (eventId: string) => consumed.has(eventId)),
    recordEventIfNew: vi.fn(async (eventId: string) => {
      if (consumed.has(eventId)) return false;
      consumed.add(eventId);
      return true;
    }),
  };
  const outbox = { createEvent: vi.fn() };
  const reconciliationService = new DisputeRefundReconciliationService(
    db as unknown as PrismaService,
    inbox as unknown as ConsumedEventRepository,
    outbox as unknown as OrderOutboxRepository,
  );
  const consumer = new PaymentEventsConsumer(
    db as unknown as PrismaService,
    inbox as unknown as ConsumedEventRepository,
    outbox as unknown as OrderOutboxRepository,
    reconciliationService,
  );
  const data = {
    eventId: randomUUID(),
    payload: {
      resolutionId,
      orderId,
      paymentId,
      refundId,
      refundAmountVnd: '150000',
      paymentStatus: 'partially_refunded',
    },
  };
  return {
    consumer,
    reconciliationService,
    tx,
    db,
    inbox,
    outbox,
    data,
    order,
    resolution,
    consumed,
    reconciliations,
  };
}

describe('Order HG-82 Payment outcome & durable reconciliation', () => {
  it('closes the dispute exactly once after Payment confirms the refund', async () => {
    const f = fixture();
    await f.consumer.handleDisputeRefundCompleted(f.data);
    expect(f.tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'disputed', version: 4 }),
        data: expect.objectContaining({
          status: 'completed',
          paymentState: 'partially_refunded',
        }),
      }),
    );
    expect(f.resolution.state).toBe('completed');
    expect(f.resolution.refundId).toBe(refundId);
    expect(f.outbox.createEvent.mock.calls.map(([event]) => event.eventType)).toEqual([
      ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
      ORDER_CONSTANTS.EVENT_ORDER_DISPUTE_RESOLVED,
    ]);
    await f.consumer.handleDisputeRefundCompleted(f.data);
    expect(f.tx.order.updateMany).toHaveBeenCalledTimes(1);
    expect(f.outbox.createEvent).toHaveBeenCalledTimes(2);
  });

  it('flags a definitive review outcome without completing the order', async () => {
    const f = fixture();
    await f.consumer.handleDisputeRefundNeedsReview({
      eventId: randomUUID(),
      payload: {
        resolutionId,
        orderId,
        paymentId,
        failureCode: 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE',
      },
    });
    expect(f.resolution.state).toBe('needs_review');
    expect(f.tx.order.updateMany).not.toHaveBeenCalled();
    expect(f.outbox.createEvent).not.toHaveBeenCalled();
  });

  it('accepts a full refund outcome and records the refunded payment state', async () => {
    const f = fixture();
    await f.consumer.handleDisputeRefundCompleted({
      eventId: randomUUID(),
      payload: {
        ...f.data.payload,
        paymentStatus: 'refunded',
      },
    });
    expect(f.order.paymentState).toBe('refunded');
    expect(f.order.status).toBe('completed');
  });

  it('parks recoverable mismatches without consuming eventId, sanitizes payload, and replays original eventId once after fix', async () => {
    const f = fixture();
    const ack = vi.fn();
    const msg = {};
    const ctx = {
      getChannelRef: () => ({ ack, nack: vi.fn() }),
      getMessage: () => msg,
    };
    const eventId = randomUUID();
    const mismatchedPayload = {
      ...f.data.payload,
      paymentId: randomUUID(),
      sensitiveSecret: 'must-never-be-persisted',
    };

    // 1. Mismatched paymentId arrives
    await f.consumer.handleDisputeRefundCompleted(
      { eventId, payload: mismatchedPayload },
      ctx,
    );

    expect(ack).toHaveBeenCalledWith(msg);
    expect(f.consumed.has(eventId)).toBe(false);
    expect(f.inbox.recordEventIfNew).not.toHaveBeenCalled();
    expect(f.tx.order.updateMany).not.toHaveBeenCalled();

    const parked = f.reconciliations.get(eventId);
    expect(parked).toMatchObject({
      eventId,
      classification: 'recoverable',
      reasonCode: 'PAYMENT_ID_MISMATCH',
      status: 'pending_reconciliation',
      attempts: 1,
    });
    expect(JSON.stringify(parked?.safePayload)).not.toContain(
      'must-never-be-persisted',
    );

    // 2. Replay before fixing cause fails with 409 and increments attempts without consuming
    await expect(
      f.reconciliationService.replayEvent(eventId, adminUserId, ['Admin']),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: ORDER_ERROR_CODES.RECONCILIATION_REPLAY_STILL_MISMATCHED,
        reasonCode: 'PAYMENT_ID_MISMATCH',
      }),
    });
    expect(f.consumed.has(eventId)).toBe(false);
    expect(f.reconciliations.get(eventId)?.attempts).toBe(2);

    // 3. Fix underlying mismatch (update resolution paymentId to match Payment truth)
    f.resolution.paymentId = mismatchedPayload.paymentId;

    // 4. Replay original eventId via Admin reconciliation replay -> Order completes strictly once
    const replayResult = await f.reconciliationService.replayEvent(
      eventId,
      adminUserId,
      ['Admin'],
    );
    expect(replayResult).toMatchObject({ eventId, outcome: 'processed' });
    expect(f.order.status).toBe('completed');
    expect(f.order.paymentState).toBe('partially_refunded');
    expect(f.resolution.state).toBe('completed');
    expect(f.consumed.has(eventId)).toBe(true);
    expect(f.reconciliations.get(eventId)?.status).toBe('replayed');
    expect(f.reconciliations.get(eventId)?.replayedByUserId).toBe(adminUserId);
    expect(f.tx.order.updateMany).toHaveBeenCalledTimes(1);

    // 5. Replaying again (via Admin API or direct broker redelivery) is rejected / idempotent no-op
    await expect(
      f.reconciliationService.replayEvent(eventId, adminUserId, ['Admin']),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: ORDER_ERROR_CODES.RECONCILIATION_REPLAY_NOT_ALLOWED,
      }),
    });
    await f.consumer.handleDisputeRefundCompleted({
      eventId,
      payload: mismatchedPayload,
    });
    expect(f.tx.order.updateMany).toHaveBeenCalledTimes(1);
    expect(f.outbox.createEvent).toHaveBeenCalledTimes(2);
  });

  it('supports direct redelivery replay of original eventId after fixing refundAmountVnd or order.status mismatch', async () => {
    const f = fixture();
    const eventId = randomUUID();
    f.order.status = 'in_progress'; // wrong order status initially

    await f.consumer.handleDisputeRefundCompleted({
      eventId,
      payload: f.data.payload,
    });
    expect(f.consumed.has(eventId)).toBe(false);
    expect(f.reconciliations.get(eventId)).toMatchObject({
      classification: 'recoverable',
      reasonCode: 'ORDER_STATUS_NOT_DISPUTED',
      status: 'pending_reconciliation',
    });

    // Repair order status & re-deliver original eventId
    f.order.status = 'disputed';
    await f.consumer.handleDisputeRefundCompleted({
      eventId,
      payload: f.data.payload,
    });
    expect(f.order.status).toBe('completed');
    expect(f.consumed.has(eventId)).toBe(true);
    expect(f.reconciliations.get(eventId)?.status).toBe('replayed');
    expect(f.tx.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it('quarantines invalid mismatches without consuming eventId and refuses replay', async () => {
    const f = fixture();
    const invalidRefundEventId = randomUUID();

    await f.consumer.handleDisputeRefundCompleted({
      eventId: invalidRefundEventId,
      payload: { ...f.data.payload, refundId: 'not-a-uuid' },
    });

    expect(f.consumed.has(invalidRefundEventId)).toBe(false);
    expect(f.reconciliations.get(invalidRefundEventId)).toMatchObject({
      classification: 'invalid',
      reasonCode: 'INVALID_REFUND_ID',
      status: 'quarantined',
    });
    await expect(
      f.reconciliationService.replayEvent(invalidRefundEventId, adminUserId, [
        'Admin',
      ]),
    ).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: ORDER_ERROR_CODES.RECONCILIATION_REPLAY_NOT_ALLOWED,
      }),
    });
  });

  it('reconciles a late completion event for a superseded resolution without losing paymentState sync', async () => {
    const f = fixture();
    f.resolution.state = 'superseded';
    f.order.status = 'completed'; // e.g. Admin overrode with dismiss
    f.order.paymentState = 'paid';
    const lateEventId = randomUUID();

    await f.consumer.handleDisputeRefundCompleted({
      eventId: lateEventId,
      payload: {
        ...f.data.payload,
        paymentStatus: 'partially_refunded',
      },
    });

    expect(f.consumed.has(lateEventId)).toBe(true);
    expect(f.order.paymentState).toBe('partially_refunded');
    expect(f.resolution.refundId).toBe(refundId);
    expect(f.resolution.failureCode).toBe('LATE_COMPLETION_AFTER_SUPERSEDE');
    expect(f.reconciliations.get(lateEventId)).toMatchObject({
      reasonCode: 'LATE_COMPLETION_FOR_SUPERSEDED_RESOLUTION',
      status: 'reconciled_late',
    });
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

  it('parks missing resolution as recoverable without recording eventId in consumed_events', async () => {
    const f = fixture();
    f.tx.orderDisputeResolution.findUnique.mockResolvedValueOnce(null);

    await f.consumer.handleDisputeRefundCompleted(f.data);

    expect(f.consumed.has(f.data.eventId)).toBe(false);
    expect(f.reconciliations.get(f.data.eventId)).toMatchObject({
      classification: 'recoverable',
      reasonCode: 'MISSING_RESOLUTION_OR_ORDER',
      status: 'pending_reconciliation',
    });
    expect(f.tx.order.updateMany).not.toHaveBeenCalled();
  });
});
