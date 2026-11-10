import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { Pool } from 'pg';
import { connect } from 'amqplib';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MessagePrisma } from '../src/persistence.js';
import { MessageService } from '../src/message.service.js';
import { AuthorityClient } from '../src/authority.js';
import { CursorCodec } from '../src/security.js';
import { MessageBroker } from '../src/broker.js';
import { NotificationPrismaService } from '../../../apps/notification-service/src/common/notification-prisma.service.js';
import { NotificationsRepository } from '../../../apps/notification-service/src/notifications/notifications.repository.js';
import { PreferencesRepository } from '../../../apps/notification-service/src/preferences/preferences.repository.js';
import { NotificationRouter } from '../../../apps/notification-service/src/events/notification-router.js';
import { NotificationPolicy } from '../../../apps/notification-service/src/events/notification-policy.js';
import { EventProcessorService } from '../../../apps/notification-service/src/events/event-processor.service.js';
import { EventConsumerService } from '../../../apps/notification-service/src/events/event-consumer.service.js';

const databaseUrl = process.env.MESSAGE_TEST_DATABASE_URL;
const rabbitUrl = process.env.MESSAGE_TEST_RABBITMQ_URL;
async function eventually<T>(
  read: () => Promise<T>,
  accept: (value: T) => boolean,
) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Disposable integration condition timed out');
}

describe.skipIf(!databaseUrl || !rabbitUrl)(
  'committed Message outbox through real RabbitMQ to Notification PostgreSQL',
  () => {
    let db: MessagePrisma;
    let notification: NotificationPrismaService;
    let broker: MessageBroker;
    let consumer: EventConsumerService;
    let admin: Pool;
    let messages: MessageService;
    const customer = randomUUID(),
      worker = randomUUID(),
      requestId = randomUUID();
    const suffix = randomUUID().replaceAll('-', '');
    const schema = `notification_test_${suffix}`;
    const exchange = `message_test.${suffix}`;
    let conversationId: string;
    let event: any;

    beforeAll(async () => {
      const url = new URL(databaseUrl!);
      if (
        !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        url.pathname !== '/handygo_message_disposable' ||
        process.env.NODE_ENV !== 'test'
      )
        throw new Error('Disposable loopback database required');
      admin = new Pool({ connectionString: databaseUrl });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const client = await admin.connect();
      try {
        await client.query(`SET search_path TO "${schema}"`);
        const root = new URL(
          '../../../apps/notification-service/prisma/migrations/',
          import.meta.url,
        );
        for (const entry of readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name))) {
          await client.query(
            readFileSync(new URL(`${entry.name}/migration.sql`, root), 'utf8'),
          );
        }
      } finally {
        client.release();
      }
      url.searchParams.set('schema', schema);
      const config = new ConfigService({
        DATABASE_URL_NOTIFICATION: url.toString(),
        NOTIFICATION_EVENTS_ENABLED: 'true',
        NOTIFICATION_SIMULATED_POLICIES: 'false',
        NOTIFICATION_EVENT_POLICIES: '{"events":{},"transitions":{}}',
      });
      notification = new NotificationPrismaService(config);
      await notification.$connect();
      db = new MessagePrisma(databaseUrl!);
      await db.$connect();
      const authority = {
        attachments: async () => [],
        permission: async (_user: string, pair: any, exists: boolean) => ({
          ...pair,
          customerId: customer,
          workerId: worker,
          requestId,
          orderId: null,
          permissions: { create: true, read: exists, send: exists },
        }),
      } as unknown as AuthorityClient;
      messages = new MessageService(
        db,
        authority,
        new CursorCodec('disposable-cursor-secret-32-characters'),
      );
      conversationId = (
        await db.conversation.create({
          data: { requestId, customerId: customer, workerId: worker },
        })
      ).id;
      process.env.RABBITMQ_URL = rabbitUrl!;
      process.env.RABBITMQ_EXCHANGE = exchange;
      process.env.MESSAGE_EVENT_QUEUE = `message_test.${suffix}`;
      process.env.NOTIFICATION_EVENT_QUEUE = `notification_test.${suffix}`;
      const processor = new EventProcessorService(
        notification,
        new NotificationsRepository(notification),
        new PreferencesRepository(notification),
        new NotificationRouter(),
        new NotificationPolicy(config),
      );
      consumer = new EventConsumerService(processor, config);
      await consumer.onModuleInit();
      broker = new MessageBroker(messages, rabbitUrl!);
    }, 30000);

    afterAll(async () => {
      await broker?.close();
      await consumer?.onModuleDestroy();
      await notification?.$disconnect();
      await db?.$disconnect();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      }
    }, 30000);

    it('ACK result is durable while publisher is stopped, then delivery creates one private generic recipient notification', async () => {
      const input = {
        conversationId,
        clientMessageId: randomUUID(),
        messageType: 'TEXT' as const,
        content: 'Tôi sẽ đến vào buổi sáng',
      };
      const sent = await messages.send(customer, input);
      const retry = await messages.send(customer, input);
      expect(retry.message.id).toBe(sent.message.id);
      expect(retry.duplicate).toBe(true);
      expect(await db.message.count()).toBe(1);
      const outbox = await db.outboxEvent.findMany();
      expect(outbox).toHaveLength(1);
      expect(outbox[0].status).toBe('pending');
      event = outbox[0].payload;
      expect(JSON.stringify(event)).not.toContain(input.content);
      broker.start();
      await eventually(
        () => broker.publishPending(),
        (count) => count === 1,
      );
      const rows = await eventually(
        () => notification.notification.findMany(),
        (rows) => rows.length === 1,
      );
      expect(rows[0]).toMatchObject({
        recipientUserId: worker,
        category: 'chat',
        title: 'Tin nhắn mới',
        sourceEntityId: conversationId,
        dedupeKey: `message.created:${sent.message.id}:${worker}`,
      });
      expect(rows[0].payload).toMatchObject({
        conversationId,
        requestId,
        entityId: conversationId,
      });
      expect(
        await db.outboxEvent.findUnique({ where: { id: outbox[0].id } }),
      ).toMatchObject({ status: 'published' });
    }, 30000);

    it('duplicate transport delivery and a different event ID for the same message create no duplicate notification', async () => {
      const connection = await connect(rabbitUrl!);
      const channel = await connection.createConfirmChannel();
      try {
        for (const payload of [event, { ...event, eventId: randomUUID() }]) {
          await new Promise<void>((resolve, reject) =>
            channel.publish(
              exchange,
              'message.created',
              Buffer.from(JSON.stringify(payload)),
              { persistent: true },
              (error) => (error ? reject(error) : resolve()),
            ),
          );
        }
        await eventually(
          () => notification.consumedEvent.count(),
          (count) => count === 2,
        );
        expect(await notification.notification.count()).toBe(1);
      } finally {
        await channel.close();
        await connection.close();
      }
    }, 30000);
  },
);
