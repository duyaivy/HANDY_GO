import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type GetMessage,
} from 'amqplib';
import { Test } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { HttpExceptionFilter } from '@app/common';
import { NotificationPrismaService } from '../src/common/notification-prisma.service.js';
import { NotificationsRepository } from '../src/notifications/notifications.repository.js';
import {
  NotificationPolicy,
  simulatedPolicies,
} from '../src/events/notification-policy.js';
import { EventProcessorService } from '../src/events/event-processor.service.js';
import { EventConsumerService } from '../src/events/event-consumer.service.js';
import { NotificationRouter } from '../src/events/notification-router.js';
import {
  NOTIFICATION_EVENTS,
  validateNotificationEvent,
  type NotificationEvent,
} from '../src/events/event-contracts.js';
import { eventFixture } from './event-fixtures.js';

const databaseUrl = process.env.NOTIFICATION_TEST_DATABASE_URL;
const rabbitUrl = process.env.NOTIFICATION_TEST_RABBITMQ_URL;

describe.skipIf(!databaseUrl || !rabbitUrl)(
  'Phase 2 — simulated RabbitMQ events, PostgreSQL and Phase 1 HTTP',
  () => {
    let app: INestApplication;
    let db: NotificationPrismaService;
    let admin: Pool;
    let broker: ChannelModel;
    let publisher: ConfirmChannel;
    const suffix = randomUUID().replaceAll('-', '');
    const schema = `notification_test_${suffix}`;
    const exchange = `notification_test.${suffix}`;
    const queue = `notification_test.${suffix}`;
    const secret = 'notification-events-test-secret';
    const headers = (userId: string) => ({
      'x-internal-secret': secret,
      'x-user-id': userId,
    });
    const base = '/api/v1/notifications';

    async function waitFor<T>(
      read: () => Promise<T>,
      predicate: (value: T) => boolean,
      timeout = 10000,
    ): Promise<T> {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const value = await read();
        if (predicate(value)) return value;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Timed out waiting for simulated event processing');
    }

    async function publish(
      event: unknown,
      type: string,
      nestPacket = true,
      direct = false,
    ) {
      const content = Buffer.from(
        JSON.stringify(nestPacket ? { pattern: type, data: event } : event),
      );
      await new Promise<void>((resolve, reject) => {
        publisher.publish(
          direct ? '' : exchange,
          direct ? queue : type,
          content,
          { persistent: true },
          (error) => (error ? reject(error) : resolve()),
        );
      });
    }

    async function consumed(event: NotificationEvent) {
      await waitFor(
        () => db.consumedEvent.count({ where: { eventId: event.eventId } }),
        (count) => count === 1,
      );
    }

    async function deadLetter(timeout = 10000): Promise<GetMessage> {
      return (await waitFor(
        () => publisher.get(`${queue}.dlq`, { noAck: true }),
        (message) => !!message,
        timeout,
      )) as GetMessage;
    }

    beforeAll(async () => {
      // Reject accidental use against shared or production infrastructure before any writes.
      const dbUrl = new URL(databaseUrl!);
      const amqpUrl = new URL(rabbitUrl!);
      const local = (host: string) =>
        ['localhost', '127.0.0.1', '[::1]'].includes(host);
      if (
        process.env.NODE_ENV !== 'test' ||
        !local(dbUrl.hostname) ||
        !local(amqpUrl.hostname) ||
        !dbUrl.pathname.slice(1).startsWith('notification_test') ||
        !decodeURIComponent(amqpUrl.pathname.slice(1)).startsWith(
          'notification_test',
        )
      )
        throw new Error(
          'Phase 2 tests require localhost, NODE_ENV=test and dedicated notification_test database/vhost',
        );
      admin = new Pool({ connectionString: dbUrl.toString() });
      await admin.query(`CREATE SCHEMA "${schema}"`);
      const migration = readFileSync(
        new URL(
          '../prisma/migrations/20261020000000_notification_phase1/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      const client = await admin.connect();
      try {
        await client.query(`SET search_path TO "${schema}"`);
        await client.query(migration.replaceAll('"public".', `"${schema}".`));
      } finally {
        client.release();
      }
      dbUrl.searchParams.set('schema', schema);
      vi.stubEnv('DATABASE_URL_NOTIFICATION', dbUrl.toString());
      vi.stubEnv('INTERNAL_SERVICE_SECRET', secret);
      vi.stubEnv('RABBITMQ_URL', rabbitUrl!);
      vi.stubEnv('RABBITMQ_EXCHANGE', exchange);
      vi.stubEnv('NOTIFICATION_EVENT_QUEUE', queue);
      vi.stubEnv('NOTIFICATION_EVENT_PREFETCH', '10');
      vi.stubEnv('NOTIFICATION_EVENTS_ENABLED', 'true');
      vi.stubEnv('NOTIFICATION_SIMULATED_POLICIES', 'true');
      vi.stubEnv('LOG_LEVEL', 'silent');
      const { NotificationServiceModule } =
        await import('../src/notification-service.module.js');
      const module = await Test.createTestingModule({
        imports: [NotificationServiceModule],
      }).compile();
      app = module.createNestApplication({ logger: false });
      app.setGlobalPrefix('api/v1');
      app.useGlobalFilters(new HttpExceptionFilter());
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await app.init();
      db = app.get(NotificationPrismaService);
      broker = await connect(rabbitUrl!);
      publisher = await broker.createConfirmChannel();
    }, 30000);

    beforeEach(async () => {
      await db.notification.deleteMany();
      await db.consumedEvent.deleteMany();
      await db.notificationPreference.deleteMany();
      await publisher.purgeQueue(`${queue}.dlq`);
    });

    afterEach(() => vi.restoreAllMocks());

    afterAll(async () => {
      await app?.close();
      if (publisher) {
        for (const name of [
          queue,
          `${queue}.dlq`,
          ...[1, 2, 3].map((i) => `${queue}.retry.${i}`),
        ])
          await publisher.deleteQueue(name);
        await publisher.deleteExchange(exchange);
        await publisher.close();
      }
      await broker?.close();
      if (admin) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
      }
      vi.unstubAllEnvs();
    }, 20000);

    it.each(NOTIFICATION_EVENTS)(
      'routes %s from RabbitMQ and exposes only intended recipients through HTTP',
      async (type) => {
        const event = eventFixture(type);
        await publish(event, type);
        await consumed(event);
        const candidates = new NotificationRouter().resolve(event).recipients;
        const recipients =
          type === 'order.status.changed'
            ? []
            : type === 'order.completed'
              ? candidates.filter((r) => r.role === 'customer')
              : candidates;
        const rows = await db.notification.findMany({
          where: { sourceEventId: event.eventId },
        });
        expect(rows.map((r) => r.recipientUserId).sort()).toEqual(
          recipients.map((r) => r.userId).sort(),
        );
        for (const recipient of recipients) {
          const result = await request(app.getHttpServer())
            .get(base)
            .set(headers(recipient.userId))
            .expect(200);
          expect(result.body.data.items).toHaveLength(1);
          expect(result.body.data.items[0].payload).toMatchObject({
            eventType: type,
            recipientRole: recipient.role,
          });
          expect(result.body.data.items[0].readAt).toBeNull();
          const unread = await request(app.getHttpServer())
            .get(`${base}/unread-count`)
            .set(headers(recipient.userId))
            .expect(200);
          expect(unread.body.data.count).toBe(1);
        }
        const outsider = await request(app.getHttpServer())
          .get(base)
          .set(headers(randomUUID()))
          .expect(200);
        expect(outsider.body.data.items).toEqual([]);
        expect(await db.notificationDeliveryAttempt.count()).toBe(0);
        expect(await db.outboxEvent.count()).toBe(0);
      },
    );

    it('applies optional opt-out, mandatory policy and default preferences without creating delivery work', async () => {
      const optional = eventFixture('matching.eligible_workers.ready');
      if (optional.eventType !== 'matching.eligible_workers.ready')
        throw new Error('fixture');
      const [optedOut, defaultUser] = optional.data.eligibleWorkerIds;
      await db.notificationPreference.create({
        data: { userId: optedOut, inAppEnabled: false },
      });
      await publish(optional, optional.eventType);
      await consumed(optional);
      expect(
        await db.notification.count({ where: { recipientUserId: optedOut } }),
      ).toBe(0);
      expect(
        await db.notification.count({
          where: { recipientUserId: defaultUser },
        }),
      ).toBe(1);
      const mandatory = eventFixture('order.created');
      if (mandatory.eventType !== 'order.created') throw new Error('fixture');
      mandatory.data.customerId = optedOut;
      await publish(mandatory, mandatory.eventType);
      await consumed(mandatory);
      expect(
        await db.notification.count({ where: { recipientUserId: optedOut } }),
      ).toBe(1);
    });

    it('atomically fans out to 200 workers and deduplicates concurrent repeated deliveries', async () => {
      const event = eventFixture('matching.eligible_workers.ready');
      if (event.eventType !== 'matching.eligible_workers.ready')
        throw new Error('fixture');
      event.data.eligibleWorkerIds = Array.from({ length: 200 }, () =>
        randomUUID(),
      );
      await Promise.all(
        Array.from({ length: 8 }, () => publish(event, event.eventType)),
      );
      await consumed(event);
      await waitFor(
        () => publisher.checkQueue(queue),
        (state) => state.messageCount === 0,
      );
      expect(await db.notification.count()).toBe(200);
      expect(await db.consumedEvent.count()).toBe(1);
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          app.get(EventProcessorService).process(event),
        ),
      );
      expect(results.every((r) => r.status === 'duplicate')).toBe(true);
      expect(await db.notification.count()).toBe(200);
    });

    it('rolls back a partially inserted batch and retries the same event safely', async () => {
      const event = eventFixture('matching.eligible_workers.ready');
      if (event.eventType !== 'matching.eligible_workers.ready')
        throw new Error('fixture');
      event.data.eligibleWorkerIds = Array.from({ length: 200 }, () =>
        randomUUID(),
      );
      const repository = app.get(NotificationsRepository);
      const spy = vi
        .spyOn(repository, 'createInAppBatch')
        .mockImplementationOnce(async (tx, rows) => {
          await tx.notification.createMany({ data: rows.slice(0, 100) });
          throw new Error('simulated failure before commit');
        });
      await publish(event, event.eventType);
      await waitFor(
        () => publisher.checkQueue(`${queue}.retry.1`),
        (state) => state.messageCount === 1,
      );
      expect(await db.notification.count()).toBe(0);
      expect(await db.consumedEvent.count()).toBe(0);
      await consumed(event);
      expect(await db.notification.count()).toBe(200);
      expect(spy).toHaveBeenCalledTimes(2);
    }, 15000);

    it('handles a lost acknowledgement after database commit without duplicate effects', async () => {
      const processor = app.get(EventProcessorService);
      const spy = vi.spyOn(processor, 'process');
      const consumer = app.get(EventConsumerService);
      const realHandle = consumer.handle.bind(consumer);
      vi.spyOn(consumer, 'handle').mockImplementationOnce(
        (channel, message, options) => {
          vi.spyOn(channel, 'ack').mockImplementationOnce(() => {
            void channel.close();
            throw new Error('simulated channel loss after commit before ACK');
          });
          return realHandle(channel, message, options);
        },
      );
      const event = eventFixture('order.created');
      await publish(event, event.eventType);
      await waitFor(
        async () => spy.mock.calls.length,
        (count) => count >= 2,
      );
      expect(await db.notification.count()).toBe(2);
      expect(await db.consumedEvent.count()).toBe(1);
    }, 15000);

    it.each([
      [
        'invalid required recipient',
        (event: NotificationEvent) => ({ ...event, data: {} }),
      ],
      [
        'unsupported version',
        (event: NotificationEvent) => ({ ...event, eventVersion: 99 }),
      ],
      [
        'unsupported event',
        (event: NotificationEvent) => ({
          ...event,
          eventType: 'unknown.event',
        }),
      ],
    ] as const)(
      'dead-letters %s once without database effects',
      async (_, change) => {
        const event = change(eventFixture('order.created'));
        await publish(event, event.eventType, false, true);
        const failed = await deadLetter();
        expect(failed.properties.headers?.['x-notification-attempt']).toBe(1);
        expect(await db.notification.count()).toBe(0);
        expect(await db.consumedEvent.count()).toBe(0);
      },
    );

    it('bounds database retries with durable backoff queues, then preserves the original event in DLQ', async () => {
      vi.spyOn(app.get(EventProcessorService), 'process').mockRejectedValue(
        new Error('simulated storage unavailable'),
      );
      const event = eventFixture('payment.succeeded');
      await publish(event, event.eventType);
      const failed = await deadLetter(60000);
      expect(failed.properties.headers).toMatchObject({
        'x-notification-attempt': 4,
        'x-notification-error-code': 'EVENT_PROCESSING_FAILED',
      });
      expect(JSON.parse(failed.content.toString()).data.eventId).toBe(
        event.eventId,
      );
      expect(await db.consumedEvent.count()).toBe(0);
      expect(await db.notification.count()).toBe(0);
    }, 65000);

    it('supports reviewed status policies while suppressing terminal status duplicates', async () => {
      const config = simulatedPolicies();
      config.transitions['TEST_BEFORE->TEST_AFTER'] = {
        mode: 'mandatory',
        roles: ['worker'],
        template: {
          title: 'Cập nhật thử nghiệm',
          body: '{{audience}} có cập nhật thử nghiệm.',
        },
      };
      const policy = new NotificationPolicy(
        new ConfigService({
          NOTIFICATION_SIMULATED_POLICIES: 'false',
          NOTIFICATION_EVENT_POLICIES: JSON.stringify(config),
        }),
      );
      vi.spyOn(app.get(NotificationPolicy), 'resolve').mockImplementation(
        (event) => policy.resolve(event),
      );
      const event = eventFixture('order.status.changed');
      await publish(event, event.eventType);
      await consumed(event);
      expect(await db.notification.count()).toBe(1);
      expect((await db.notification.findFirstOrThrow()).payload).toMatchObject({
        recipientRole: 'worker',
      });
      expect((await db.notification.findFirstOrThrow()).body).toBe(
        'Công việc bạn nhận có cập nhật thử nghiệm.',
      );
      for (const kind of ['completed', 'cancelled'] as const) {
        const terminal = validateNotificationEvent({
          ...event,
          eventId: randomUUID(),
          data: { ...event.data, notificationKind: kind },
        });
        const dedicated = validateNotificationEvent({
          ...event,
          eventId: randomUUID(),
          eventType: `order.${kind}`,
        });
        await publish(terminal, terminal.eventType);
        await publish(dedicated, dedicated.eventType);
        await consumed(terminal);
        await consumed(dedicated);
        expect(
          await db.notification.count({
            where: { sourceEventId: terminal.eventId },
          }),
        ).toBe(0);
        expect(
          await db.notification.count({
            where: { sourceEventId: dedicated.eventId },
          }),
        ).toBe(kind === 'completed' ? 1 : 2);
      }
    });

    it('quarantines pending policies and safely replays the same event after policy review', async () => {
      const pending = new NotificationPolicy(
        new ConfigService({
          NOTIFICATION_SIMULATED_POLICIES: 'false',
          NOTIFICATION_EVENT_POLICIES: JSON.stringify({
            events: {},
            transitions: {},
          }),
        }),
      );
      const spy = vi
        .spyOn(app.get(NotificationPolicy), 'resolve')
        .mockImplementationOnce((event) => pending.resolve(event));
      const event = eventFixture('order.created');
      await publish(event, event.eventType);
      const failed = await deadLetter();
      expect(failed.properties.headers?.['x-notification-error-code']).toBe(
        'BUSINESS_POLICY_PENDING',
      );
      expect(await db.consumedEvent.count()).toBe(0);
      expect(await db.notification.count()).toBe(0);
      spy.mockRestore();
      const replay = JSON.parse(failed.content.toString()).data;
      await publish(replay, replay.eventType);
      await consumed(event);
      expect(await db.notification.count()).toBe(2);
    });

    it('does not merge distinct wallet effects solely because they share a transaction reference', async () => {
      const credited = eventFixture('wallet.credited');
      const debited = validateNotificationEvent({
        ...credited,
        eventId: randomUUID(),
        eventType: 'wallet.debited',
      });
      await publish(credited, credited.eventType);
      await publish(debited, debited.eventType);
      await consumed(credited);
      await consumed(debited);
      expect(await db.notification.count()).toBe(2);
      expect(await db.consumedEvent.count()).toBe(2);
    });

    it('preserves Phase 1 ownership, unread counts, mark-read and read-all on consumed notifications', async () => {
      const event = eventFixture('order.created');
      if (event.eventType !== 'order.created') throw new Error('fixture');
      const next = { ...event, eventId: randomUUID() };
      await publish(event, event.eventType, false);
      await publish(next, next.eventType);
      await consumed(event);
      await consumed(next);
      const rows = await db.notification.findMany({
        where: { recipientUserId: event.data.customerId },
      });
      await request(app.getHttpServer())
        .get(`${base}/${rows[0].id}`)
        .set(headers(event.data.workerId))
        .expect(404);
      await request(app.getHttpServer())
        .patch(`${base}/${rows[0].id}/read`)
        .set(headers(event.data.workerId))
        .expect(404);
      const first = await request(app.getHttpServer())
        .patch(`${base}/${rows[0].id}/read`)
        .set(headers(event.data.customerId))
        .expect(200);
      const second = await request(app.getHttpServer())
        .patch(`${base}/${rows[0].id}/read`)
        .set(headers(event.data.customerId))
        .expect(200);
      expect(second.body.data.readAt).toBe(first.body.data.readAt);
      const all = await request(app.getHttpServer())
        .post(`${base}/read-all`)
        .set(headers(event.data.customerId))
        .expect(200);
      expect(all.body.data.updatedCount).toBe(1);
      const unread = await request(app.getHttpServer())
        .get(`${base}/unread-count`)
        .set(headers(event.data.customerId))
        .expect(200);
      expect(unread.body.data.count).toBe(0);
      expect(
        await db.notification.count({
          where: { recipientUserId: event.data.workerId, readAt: null },
        }),
      ).toBe(2);
    });
  },
);
