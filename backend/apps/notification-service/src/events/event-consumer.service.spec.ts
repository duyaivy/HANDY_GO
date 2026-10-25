import 'reflect-metadata';
import { EventEmitter } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { eventFixture } from '../../test/event-fixtures.js';
import {
  EventConsumerService,
  transferEvent,
} from './event-consumer.service.js';
import type { EventProcessorService } from './event-processor.service.js';
import type { EventTransportOptions } from './event-topology.js';
import { MAX_EVENT_BYTES } from './event-contracts.js';

describe('Event consumer acknowledgement and transfer guarantees', () => {
  const options: EventTransportOptions = {
    url: 'amqp://localhost',
    exchange: 'events',
    queue: 'notification.events',
    prefetch: 10,
    retryDelays: [2000, 10000, 30000],
  };
  const result = {
    status: 'processed',
    recipientCount: 2,
    notificationCount: 2,
  };
  const message = (): ConsumeMessage =>
    ({
      content: Buffer.from(JSON.stringify(eventFixture('order.created'))),
      properties: { headers: {} },
      fields: {
        routingKey: 'order.created',
        deliveryTag: 1,
        redelivered: false,
        exchange: 'events',
        consumerTag: 'test',
      },
    }) as ConsumeMessage;

  function setup(process = vi.fn().mockResolvedValue(result)) {
    const emitter = new EventEmitter();
    const channel = Object.assign(emitter, {
      ack: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
      sendToQueue: vi.fn((_queue, _content, _options, callback) => {
        callback(null);
        return true;
      }),
    });
    const consumer = new EventConsumerService(
      { process } as unknown as EventProcessorService,
      new ConfigService(),
    );
    return {
      consumer,
      channel,
      process,
      raw: channel as unknown as ConfirmChannel,
    };
  }

  beforeAll(() => Logger.overrideLogger(false));

  it('never ACKs until the processor transaction resolves', async () => {
    let commit!: () => void;
    const { consumer, raw, channel } = setup(
      vi.fn(
        () =>
          new Promise((resolve) => {
            commit = () => resolve(result);
          }),
      ),
    );
    const work = consumer.handle(raw, message(), options);
    expect(channel.ack).not.toHaveBeenCalled();
    commit();
    await work;
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('ACKs duplicate committed events without transferring them', async () => {
    const { consumer, raw, channel } = setup(
      vi.fn().mockResolvedValue({ ...result, status: 'duplicate' }),
    );
    await consumer.handle(raw, message(), options);
    expect(channel.ack).toHaveBeenCalledTimes(1);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it('waits for retry publisher confirmation before acknowledging the original', async () => {
    const { consumer, raw, channel } = setup(
      vi.fn().mockRejectedValue(new Error('storage outage')),
    );
    let confirm!: (error: Error | null) => void;
    channel.sendToQueue.mockImplementation(
      (_queue, _content, _options, callback) => {
        confirm = callback;
        return true;
      },
    );
    const work = consumer.handle(raw, message(), options);
    await vi.waitFor(() => expect(channel.sendToQueue).toHaveBeenCalled());
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.sendToQueue.mock.calls[0][0]).toBe(
      `${options.queue}.retry.1`,
    );
    confirm(null);
    await work;
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('leaves the delivery unacknowledged and closes its channel when transfer fails', async () => {
    const { consumer, raw, channel } = setup(
      vi.fn().mockRejectedValue(new Error('storage outage')),
    );
    channel.sendToQueue.mockImplementation(
      (_queue, _content, _options, callback) => {
        callback(new Error('broker nack'));
        return false;
      },
    );
    await consumer.handle(raw, message(), options);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.close).toHaveBeenCalledTimes(1);
  });

  it.each(['invalid-json', 'oversized'])(
    'dead-letters %s without invoking processing',
    async (kind) => {
      const { consumer, raw, channel, process } = setup();
      const input = message();
      input.content =
        kind === 'invalid-json'
          ? Buffer.from('{')
          : Buffer.alloc(MAX_EVENT_BYTES + 1);
      await consumer.handle(raw, input, options);
      expect(process).not.toHaveBeenCalled();
      expect(channel.sendToQueue.mock.calls[0][0]).toBe(`${options.queue}.dlq`);
      expect(channel.ack).toHaveBeenCalledTimes(1);
    },
  );

  it('sends exhausted transient retries to DLQ', async () => {
    const { consumer, raw, channel } = setup(
      vi.fn().mockRejectedValue(new Error('database')),
    );
    const input = message();
    input.properties.headers = { 'x-notification-attempt': 3 };
    await consumer.handle(raw, input, options);
    expect(channel.sendToQueue.mock.calls[0][0]).toBe(`${options.queue}.dlq`);
    expect(channel.ack).toHaveBeenCalledTimes(1);
  });

  it('treats mandatory unroutable returns as failure even if the broker confirms publishing', async () => {
    const { channel, raw } = setup();
    channel.sendToQueue.mockImplementation(
      (_queue, _content, properties, callback) => {
        channel.emit('return', { properties });
        callback(null);
        return true;
      },
    );
    await expect(transferEvent(raw, 'missing', message(), {})).rejects.toThrow(
      'UNROUTABLE_EVENT_TRANSFER',
    );
    expect(channel.listenerCount('return')).toBe(0);
    expect(channel.listenerCount('close')).toBe(0);
  });
});
