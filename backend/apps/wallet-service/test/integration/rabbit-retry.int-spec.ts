import { randomUUID } from 'node:crypto';
import * as amqp from 'amqplib';
import type { RmqContext } from '@nestjs/microservices';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ConsumerRetryService,
  DEAD_REASON_HEADER,
  RETRY_COUNT_HEADER,
} from '../../src/common/messaging/consumer-retry.service.js';
import { TopupSettlementConsumer } from '../../src/topup-settlement/topup-settlement.consumer.js';
import { TopupSettlementService } from '../../src/topup-settlement/topup-settlement.service.js';
import {
  AmqpDeadLetterPublisher,
  DeadLetterPublisher,
  DeadLetterService,
} from '../../src/dead-letter/dead-letter.service.js';
import { WALLET_EVENTS_QUEUE } from '../../src/common/messaging/consumer-retry.service.js';
import { assertTestTarget } from './global-setup.js';
import { createHarness, resetDb, seedWallet, balanceOf, type Harness } from './helpers/harness.js';

const MAIN = 'wallet-test-retry-main';
const DELAYS = [150, 250];
let conn: amqp.ChannelModel;
let ch: amqp.Channel;
let h: Harness;
let retry: ConsumerRetryService;

const ctxFor = (msg: amqp.GetMessage) =>
  ({ getChannelRef: () => ch, getMessage: () => msg }) as unknown as RmqContext;

async function nextMessage(queue: string, timeoutMs = 3000): Promise<amqp.GetMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const msg = await ch.get(queue, { noAck: false });
    if (msg) return msg;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`Không có message trong ${queue}`);
}

async function purgeAll(): Promise<void> {
  const admin = await conn.createChannel();
  admin.on('error', () => undefined);
  for (const q of [MAIN, `${MAIN}.dlq`, ...DELAYS.map((d) => `${MAIN}.retry.${d}`), WALLET_EVENTS_QUEUE]) {
    await admin.deleteQueue(q);
  }
  await admin.close();
}

beforeAll(async () => {
  assertTestTarget();
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  conn = await amqp.connect(process.env.RABBITMQ_URL as string);
  ch = await conn.createChannel();
  await purgeAll();
  await ch.assertQueue(MAIN, { durable: true });
  retry = ConsumerRetryService.withConfig({ queue: MAIN, delaysMs: DELAYS });
  await resetDb();
});
afterEach(async () => {
  await purgeAll();
  await conn.close();
});

describe('consumer retry & DLQ (RabbitMQ thật)', () => {
  it('lỗi tạm thời → retry qua queue TTL → xử lý thành công, tăng header retry', async () => {
    ch.sendToQueue(MAIN, Buffer.from(JSON.stringify({ pattern: 'x', data: { n: 1 } })), { persistent: true });
    const seenAttempts: number[] = [];
    let succeeded = false;
    for (let i = 0; i < 5 && !succeeded; i++) {
      const msg = await nextMessage(MAIN);
      const attempt = Number(msg.properties.headers?.[RETRY_COUNT_HEADER] ?? 0);
      seenAttempts.push(attempt);
      if (attempt < 2) {
        const outcome = await retry.retryOrDeadLetter(ctxFor(msg), 'transient db error');
        expect(outcome.action).toBe('retry');
      } else {
        ch.ack(msg);
        succeeded = true;
      }
    }
    expect(seenAttempts).toEqual([0, 1, 2]);
    expect(succeeded).toBe(true);
    const probe = await conn.createChannel();
    probe.on('error', () => undefined);
    const dlqCount = await probe.checkQueue(`${MAIN}.dlq`).then((r) => r.messageCount, () => 0);
    expect(dlqCount).toBe(0);
  });

  it('vượt số lần retry → DLQ kèm lý do, queue chính trống', async () => {
    ch.sendToQueue(MAIN, Buffer.from('{"pattern":"x","data":{}}'), { persistent: true });
    let lastOutcome: Awaited<ReturnType<ConsumerRetryService['retryOrDeadLetter']>> | undefined;
    for (let i = 0; i < DELAYS.length + 1; i++) {
      const msg = await nextMessage(MAIN);
      lastOutcome = await retry.retryOrDeadLetter(ctxFor(msg), 'still failing');
    }
    expect(lastOutcome).toEqual({ action: 'dead_letter', attempts: DELAYS.length });
    const dead = await nextMessage(`${MAIN}.dlq`);
    expect(String(dead.properties.headers?.[DEAD_REASON_HEADER])).toContain('retries exhausted');
    expect(dead.content.toString()).toBe('{"pattern":"x","data":{}}');
    ch.ack(dead);
    expect((await ch.checkQueue(MAIN)).messageCount).toBe(0);
  });

  it('payload sai định dạng → quarantine DB + DLQ ngay, không retry', async () => {
    const consumer = new TopupSettlementConsumer(new TopupSettlementService(h.prisma), retry);
    const bad = { eventId: 'bad-1', userId: 'nope', paymentId: 'nope', idempotencyKey: 'k', amount: '10' };
    ch.sendToQueue(MAIN, Buffer.from(JSON.stringify({ pattern: 'payment.topup.succeeded', data: bad })));
    const msg = await nextMessage(MAIN);
    await consumer.onTopupSucceeded(bad as never, ctxFor(msg));

    expect(await h.prisma.deadLetterEvent.count({ where: { eventId: 'bad-1' } })).toBe(1);
    const dead = await nextMessage(`${MAIN}.dlq`);
    expect(String(dead.properties.headers?.[DEAD_REASON_HEADER])).toContain('userId');
    ch.ack(dead);
  });

  it('consumer: lỗi tạm thời được retry; hết retry thì quarantine vào DB và DLQ', async () => {
    const failing = {
      settle: async () => { throw new Error('connection reset'); },
      quarantine: new TopupSettlementService(h.prisma).quarantine.bind(new TopupSettlementService(h.prisma)),
    } as unknown as TopupSettlementService;
    const consumer = new TopupSettlementConsumer(failing, retry);
    const event = {
      eventId: 'ev-transient', userId: randomUUID(), paymentId: randomUUID(), idempotencyKey: 'idem', amount: '10',
    };
    ch.sendToQueue(MAIN, Buffer.from(JSON.stringify({ pattern: 'payment.topup.succeeded', data: event })), { persistent: true });
    for (let i = 0; i < DELAYS.length + 1; i++) {
      await consumer.onTopupSucceeded(event as never, ctxFor(await nextMessage(MAIN)));
    }
    const dead = await nextMessage(`${MAIN}.dlq`);
    ch.ack(dead);
    const row = await h.prisma.deadLetterEvent.findUniqueOrThrow({ where: { eventId: 'ev-transient' } });
    expect(row.reason).toBe('retries exhausted');
  });

  it('duplicate topup event được ACK và chỉ cộng tiền một lần (idempotency theo paymentId)', async () => {
    const userId = randomUUID();
    await seedWallet(h, { userId });
    const service = new TopupSettlementService(h.prisma);
    const consumer = new TopupSettlementConsumer(service, retry);
    const paymentId = randomUUID();
    const event = { eventId: 'ev-dup', userId, paymentId, idempotencyKey: 'idem-dup', amount: '500' };
    for (let i = 0; i < 2; i++) {
      ch.sendToQueue(MAIN, Buffer.from(JSON.stringify({ pattern: 'payment.topup.succeeded', data: event })));
      await consumer.onTopupSucceeded(event as never, ctxFor(await nextMessage(MAIN)));
    }
    expect((await balanceOf(h, userId)).balance).toBe(500n);
    expect((await ch.checkQueue(MAIN)).messageCount).toBe(0);
  });
});

describe('DLQ replay có kiểm soát + audit', () => {
  it('replay publish lại message vào queue chính và ghi audit log', async () => {
    const actorId = randomUUID();
    const userId = randomUUID();
    const row = await h.prisma.deadLetterEvent.create({
      data: {
        eventId: 'dl-1', eventType: 'payment.topup.succeeded',
        payload: { userId, paymentId: randomUUID(), idempotencyKey: 'k', amount: '5' }, reason: 'x',
      },
    });
    await ch.assertQueue(WALLET_EVENTS_QUEUE, { durable: true });
    const service = new DeadLetterService(h.prisma, new AmqpDeadLetterPublisher());

    const res = await service.replay(row.id, actorId);
    expect(res.replayed).toBe(true);

    const msg = await nextMessage(WALLET_EVENTS_QUEUE);
    ch.ack(msg);
    expect(JSON.parse(msg.content.toString())).toMatchObject({ pattern: 'payment.topup.succeeded', data: { userId } });
    const audit = await h.prisma.walletAuditLog.findFirstOrThrow({ where: { action: 'wallet.dlq.replay' } });
    expect(audit).toMatchObject({ actorId, targetUserId: userId });
  });

  it('publish lỗi → ghi audit replay_failed, không báo thành công', async () => {
    const row = await h.prisma.deadLetterEvent.create({
      data: { eventId: 'dl-2', eventType: 'user.registered', payload: { data: {} }, reason: 'x' },
    });
    const failing = { publish: async () => { throw new Error('broker down'); } } as DeadLetterPublisher;
    const service = new DeadLetterService(h.prisma, failing);
    await expect(service.replay(row.id, randomUUID())).rejects.toMatchObject({ status: 502 });
    expect(await h.prisma.walletAuditLog.count({ where: { action: 'wallet.dlq.replay_failed' } })).toBe(1);
    expect(await h.prisma.walletAuditLog.count({ where: { action: 'wallet.dlq.replay' } })).toBe(0);
  });

  it('chỉ replay event type nằm trong whitelist; list không lộ payload', async () => {
    const row = await h.prisma.deadLetterEvent.create({
      data: { eventId: 'dl-3', eventType: 'something.else', payload: { secret: 'x' }, reason: 'x' },
    });
    const service = new DeadLetterService(h.prisma, { publish: async () => undefined } as DeadLetterPublisher);
    await expect(service.replay(row.id, randomUUID())).rejects.toMatchObject({ status: 400 });
    const listed = await service.list();
    expect(listed[0]).not.toHaveProperty('payload');
  });
});
