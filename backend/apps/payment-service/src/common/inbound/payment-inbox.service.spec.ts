import { describe, expect, it, vi } from 'vitest';
import { PermanentInboundError, RetryableInboundError, unwrapInboundEvent } from './inbound-event.js';
import { inboundRetryDelayMs, PaymentInboxService } from './payment-inbox.service.js';

function setup(options: { duplicate?: boolean; previousAttempts?: number } = {}) {
  const tx = {
    consumedEvent: { createMany: vi.fn().mockResolvedValue({ count: options.duplicate ? 0 : 1 }) },
    failedInboundEvent: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const failed = {
    findUnique: vi.fn().mockResolvedValue(options.previousAttempts ? { attempts: options.previousAttempts } : null),
    upsert: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const database = { client: { $transaction: (cb: (t: typeof tx) => unknown) => cb(tx), failedInboundEvent: failed } };
  const rabbit = { ack: vi.fn(), nack: vi.fn() };
  const service = new PaymentInboxService(database as never, rabbit as never);
  return { service, tx, failed, rabbit };
}

const envelope = { eventId: 'evt-1', data: { orderId: 'o-1' } };

describe('unwrapInboundEvent', () => {
  it('reads the shared envelope and flat payloads', () => {
    expect(unwrapInboundEvent(envelope)).toEqual({ eventId: 'evt-1', data: { orderId: 'o-1' } });
    expect(unwrapInboundEvent({ eventId: 'wallet.topup.credited:1', userId: 'u' }).eventId).toBe('wallet.topup.credited:1');
  });

  it('rejects payloads without an event id', () => {
    expect(() => unwrapInboundEvent({ data: {} })).toThrow(PermanentInboundError);
    expect(() => unwrapInboundEvent(null)).toThrow(PermanentInboundError);
  });
});

describe('PaymentInboxService', () => {
  it('runs the handler once and marks the event consumed in the same transaction', async () => {
    const { service, tx } = setup();
    const handler = vi.fn().mockResolvedValue(undefined);
    service.register('order.created', handler);
    await expect(service.handle('order.created', envelope)).resolves.toBe('processed');
    expect(handler).toHaveBeenCalledWith({ orderId: 'o-1' }, tx, expect.objectContaining({ eventId: 'evt-1' }));
    expect(tx.failedInboundEvent.deleteMany).toHaveBeenCalledWith({ where: { eventId: 'evt-1' } });
  });

  it('skips duplicates without calling the handler', async () => {
    const { service } = setup({ duplicate: true });
    const handler = vi.fn();
    service.register('order.created', handler);
    await expect(service.handle('order.created', envelope)).resolves.toBe('duplicate');
    expect(handler).not.toHaveBeenCalled();
  });

  it('schedules a bounded retry for transient failures', async () => {
    const { service, failed } = setup({ previousAttempts: 1 });
    service.register('order.completed', vi.fn().mockRejectedValue(new RetryableInboundError('not ready')));
    await expect(service.handle('order.completed', envelope)).resolves.toBe('retry_scheduled');
    expect(failed.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'retrying', attempts: 2 }) }),
    );
  });

  it('parks permanent failures and exhausted retries as dead', async () => {
    const permanent = setup();
    permanent.service.register('order.created', vi.fn().mockRejectedValue(new PermanentInboundError('bad')));
    await expect(permanent.service.handle('order.created', envelope)).resolves.toBe('dead');

    const exhausted = setup({ previousAttempts: 7 });
    exhausted.service.register('order.created', vi.fn().mockRejectedValue(new RetryableInboundError('still not ready')));
    await expect(exhausted.service.handle('order.created', envelope)).resolves.toBe('dead');
  });

  it('does not leak raw error messages into stored errors', async () => {
    const { service, failed } = setup();
    service.register('order.created', vi.fn().mockRejectedValue(new Error('connection string postgres://secret')));
    await service.handle('order.created', envelope);
    const stored = failed.upsert.mock.calls[0][0].create.lastError as string;
    expect(stored).not.toContain('secret');
  });

  it('ACKs after persisting a failure and NACKs only when persistence itself fails', async () => {
    const ok = setup();
    ok.service.register('order.created', vi.fn().mockRejectedValue(new RetryableInboundError('x')));
    await ok.service.consume('order.created', envelope, {} as never);
    expect(ok.rabbit.ack).toHaveBeenCalled();

    const broken = setup();
    broken.failed.upsert.mockRejectedValue(new Error('db down'));
    broken.service.register('order.created', vi.fn().mockRejectedValue(new RetryableInboundError('x')));
    await broken.service.consume('order.created', envelope, {} as never);
    expect(broken.rabbit.nack).toHaveBeenCalledWith({}, true);
  });

  it('caps the retry delay with exponential backoff', () => {
    expect(inboundRetryDelayMs(1)).toBe(5_000);
    expect(inboundRetryDelayMs(3)).toBe(20_000);
    expect(inboundRetryDelayMs(30)).toBe(15 * 60_000);
  });

  it('replays due retrying events', async () => {
    const { service, failed } = setup();
    failed.findMany.mockResolvedValue([{ eventType: 'order.created', payload: envelope }]);
    const handler = vi.fn().mockResolvedValue(undefined);
    service.register('order.created', handler);
    await expect(service.retryDue()).resolves.toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
