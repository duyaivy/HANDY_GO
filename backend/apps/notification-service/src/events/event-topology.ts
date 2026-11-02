import type { ConfirmChannel } from 'amqplib';
import { createRabbitMQOptions, RABBITMQ_QUEUES } from '@app/rabbitmq';
import { NOTIFICATION_EVENTS } from './event-contracts.js';

export interface EventTransportOptions {
  url: string;
  exchange: string;
  queue: string;
  prefetch: number;
  retryDelays: number[];
}

export function eventTransportOptions(): EventTransportOptions {
  const shared = createRabbitMQOptions(RABBITMQ_QUEUES.NOTIFICATION).options!;
  const prefetch = Number(
    process.env.NOTIFICATION_EVENT_PREFETCH ?? shared.prefetchCount,
  );
  if (!Number.isInteger(prefetch) || prefetch < 1 || prefetch > 50)
    throw new Error('INVALID_NOTIFICATION_EVENT_PREFETCH');
  const queue =
    process.env.NOTIFICATION_EVENT_QUEUE ??
    `${RABBITMQ_QUEUES.NOTIFICATION}.events.v1`;
  if (!/^[a-zA-Z0-9._-]{1,150}$/.test(queue))
    throw new Error('INVALID_NOTIFICATION_EVENT_QUEUE');
  return {
    url: shared.urls![0] as string,
    exchange: shared.exchange!,
    queue,
    prefetch,
    retryDelays: [2000, 10000, 30000],
  };
}

/** Quorum queues retain dead letters until the destination confirms receipt. */
export async function assertEventTopology(
  channel: ConfirmChannel,
  options: EventTransportOptions,
) {
  const { queue, exchange } = options;
  const quorum = { 'x-queue-type': 'quorum', 'x-overflow': 'reject-publish' };
  const deadLetter = {
    ...quorum,
    'x-dead-letter-strategy': 'at-least-once',
    'x-dead-letter-exchange': '',
  };
  await channel.assertExchange(exchange, 'topic', { durable: true });
  await channel.assertQueue(`${queue}.dlq`, {
    durable: true,
    arguments: quorum,
  });
  await channel.assertQueue(queue, {
    durable: true,
    arguments: {
      ...deadLetter,
      'x-dead-letter-routing-key': `${queue}.dlq`,
      'x-delivery-limit': 20,
    },
  });
  for (const type of NOTIFICATION_EVENTS)
    await channel.bindQueue(queue, exchange, type);
  for (const [index, delay] of options.retryDelays.entries()) {
    await channel.assertQueue(`${queue}.retry.${index + 1}`, {
      durable: true,
      arguments: {
        ...deadLetter,
        'x-message-ttl': delay,
        'x-dead-letter-routing-key': queue,
      },
    });
  }
  await channel.prefetch(options.prefetch);
}
