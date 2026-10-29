import { describe, expect, it } from 'vitest';
import type { RmqContext } from '@nestjs/microservices';
import { ConsumerRetryService } from './consumer-retry.service.js';
import { ConfirmedQueuePublisher } from './confirmed-queue-publisher.js';

function setup(publish: () => Promise<void>) {
  const events: string[] = [];
  const publisher = {
    publish: async () => {
      events.push('publish:start');
      try {
        await publish();
      } finally {
        events.push('publish:end');
      }
    },
    close: async () => undefined,
  } as ConfirmedQueuePublisher;
  const channel = {
    ack: () => events.push('ack'),
    nack: (_m: unknown, _a: boolean, requeue: boolean) => events.push(`nack:${requeue}`),
  };
  const message = { content: Buffer.from('{}'), properties: { headers: {} } };
  const ctx = { getChannelRef: () => channel, getMessage: () => message } as unknown as RmqContext;
  const retry = ConsumerRetryService.withConfig({ queue: 'q', delaysMs: [10] }, publisher);
  return { events, ctx, retry };
}

describe('ConsumerRetryService: ACK chỉ sau khi broker xác nhận', () => {
  it('retry: ACK sau khi publish được confirm', async () => {
    const { events, ctx, retry } = setup(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await retry.retryOrDeadLetter(ctx, 'x');
    expect(events).toEqual(['publish:start', 'publish:end', 'ack']);
  });

  it('retry: confirm lỗi → NACK requeue, không ACK', async () => {
    const { events, ctx, retry } = setup(async () => {
      throw new Error('nack from broker');
    });
    await retry.retryOrDeadLetter(ctx, 'x');
    expect(events).toEqual(['publish:start', 'publish:end', 'nack:true']);
  });

  it('DLQ: confirm lỗi → NACK requeue, không ACK', async () => {
    const { events, ctx, retry } = setup(async () => {
      throw new Error('channel closed');
    });
    await retry.deadLetter(ctx, 'bad');
    expect(events).toEqual(['publish:start', 'publish:end', 'nack:true']);
  });

  it('DLQ: ACK sau confirm', async () => {
    const { events, ctx, retry } = setup(async () => undefined);
    await retry.deadLetter(ctx, 'bad');
    expect(events).toEqual(['publish:start', 'publish:end', 'ack']);
  });
});
