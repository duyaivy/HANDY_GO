import * as amqp from 'amqplib';
import { assertTestTarget } from '../global-setup.js';

export async function withChannel<T>(fn: (ch: amqp.Channel) => Promise<T>): Promise<T> {
  assertTestTarget();
  const conn = await amqp.connect(process.env.RABBITMQ_URL as string);
  try {
    const ch = await conn.createChannel();
    try {
      return await fn(ch);
    } finally {
      await ch.close();
    }
  } finally {
    await conn.close();
  }
}

export async function publishAndConsumeOnce(queue: string, payload: unknown): Promise<unknown> {
  return withChannel(async (ch) => {
    await ch.assertQueue(queue, { durable: false, autoDelete: true });
    await ch.purgeQueue(queue);
    ch.sendToQueue(queue, Buffer.from(JSON.stringify(payload)));
    for (let i = 0; i < 50; i++) {
      const msg = await ch.get(queue, { noAck: true });
      if (msg) return JSON.parse(msg.content.toString());
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('Không nhận được message từ RabbitMQ test');
  });
}
