import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import { MessageBroker } from './broker.js';

describe('durable message outbox failure recovery', () => {
  afterEach(() => vi.restoreAllMocks());
  function setup() {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const row = {
      id: randomUUID(),
      eventType: 'message.created',
      payload: { eventId: randomUUID() },
      status: 'pending',
      retryCount: 0,
      nextRetryAt: new Date(0),
      lastError: null,
    };
    const db = {
      outboxEvent: {
        findMany: vi.fn(async () =>
          row.status === 'pending' && row.nextRetryAt <= new Date()
            ? [{ ...row }]
            : [],
        ),
        update: vi.fn(async ({ data }) => Object.assign(row, data)),
      },
    };
    const channel = Object.assign(new EventEmitter(), {
      publish: vi.fn((_exchange, _type, _payload, _options, done) =>
        done(null),
      ),
    });
    const create = () => {
      const broker = new MessageBroker({ db } as any, 'amqp://test');
      Object.assign(broker, {
        publisher: {},
        publisherChannel: channel,
        connection: { isConnected: () => true },
      });
      return broker;
    };
    return { row, db, channel, create };
  }

  it('retains failed publications with bounded retry and recovers through a replacement worker', async () => {
    const { row, db, channel, create } = setup();
    channel.publish.mockImplementationOnce((_e, _t, _p, _o, done) =>
      done(new Error('provider credentials')),
    );
    const started = Date.now();
    expect(await create().publishPending()).toBe(0);
    expect(row).toMatchObject({
      status: 'pending',
      retryCount: 1,
      lastError: 'BROKER_UNAVAILABLE',
    });
    expect(row.nextRetryAt.getTime()).toBeGreaterThan(started);
    expect(row.nextRetryAt.getTime() - Date.now()).toBeLessThanOrEqual(60000);
    expect(await create().publishPending()).toBe(0);
    expect(channel.publish).toHaveBeenCalledTimes(1);
    row.nextRetryAt = new Date(0);
    expect(await create().publishPending()).toBe(1);
    expect(row.status).toBe('published');
    expect(db.outboxEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'pending', nextRetryAt: { lte: expect.any(Date) } },
      }),
    );
  });

  it('replays the same event identity when publication succeeds but marking it published fails', async () => {
    const { row, db, channel, create } = setup();
    db.outboxEvent.update.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    expect(await create().publishPending()).toBe(0);
    expect(row.status).toBe('pending');
    row.nextRetryAt = new Date(0);
    expect(await create().publishPending()).toBe(1);
    expect(channel.publish).toHaveBeenCalledTimes(2);
    const [first, second] = channel.publish.mock.calls;
    expect(first[2]).toEqual(second[2]);
    expect(first[3]).toMatchObject({
      persistent: true,
      mandatory: true,
      messageId: row.id,
    });
    expect(second[3].messageId).toBe(first[3].messageId);
  });

  it('retains an unroutable event even if the broker confirms the publish', async () => {
    const { row, channel, create } = setup();
    channel.publish.mockImplementationOnce((_e, _t, _p, options, done) => {
      channel.emit('return', { properties: { messageId: options.messageId } });
      done(null);
    });
    expect(await create().publishPending()).toBe(0);
    expect(row).toMatchObject({ status: 'pending', retryCount: 1 });
    expect(channel.listenerCount('return')).toBe(0);
    expect(channel.listenerCount('close')).toBe(0);
  });
});
