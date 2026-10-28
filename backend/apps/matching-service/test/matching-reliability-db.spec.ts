import { fork } from 'node:child_process';
import { once } from 'node:events';
import amqp from 'amqplib';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { MatchingEventConsumer } from '../src/consumers/matching-event.consumer.js';
import { MatchingJobQueueService } from '../src/queue/matching-job-queue.service.js';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/matching-client';
import { PrismaPg } from '@prisma/adapter-pg';
import { MatchRunRepository } from '../src/persistence/match-run.repository.js';
import { ConsumedEventRepository } from '../src/persistence/consumed-event.repository.js';
import { ServiceRequestProjectionService } from '../src/projections/service-request-projection.service.js';
import { validateNotificationEvent } from '../../notification-service/src/events/event-contracts.js';

const url = process.env.PR34_TEST_DATABASE_URL;
describe.skipIf(!url)(
  'Matching reliability against migrated PostgreSQL',
  () => {
    let db: PrismaClient;
    let runs: MatchRunRepository;
    let projections: ServiceRequestProjectionService;
    let inbox: ConsumedEventRepository;
    const requestIds: string[] = [];
    const deliveryIds: string[] = [];
    beforeAll(() => {
      if (
        !url ||
        !/^pr34_test_[a-f0-9]{32}$/.test(
          new URL(url).searchParams.get('schema') || '',
        )
      ) {
        throw new Error(
          'Run scripts/verify-pr34.mjs to provision an isolated schema using .env',
        );
      }
      db = new PrismaClient({
        adapter: new PrismaPg(
          { connectionString: url },
          {
            schema:
              new URL(url).searchParams.get('schema') || 'matching_service',
          },
        ),
      });
      Object.assign(db, {
        schema: new URL(url).searchParams.get('schema') || 'matching_service',
      });
      runs = new MatchRunRepository(db as any);
      projections = new ServiceRequestProjectionService(db as any);
      inbox = new ConsumedEventRepository(db as any);
    });
    afterAll(async () => {
      if (!db) return;
      const rows = await db.matchRun.findMany({
        where: { serviceRequestId: { in: requestIds } },
        select: { id: true },
      });
      await db.outboxEvent.deleteMany({
        where: { aggregateId: { in: rows.map((r) => r.id) } },
      });
      await db.matchRun.deleteMany({
        where: { serviceRequestId: { in: requestIds } },
      });
      await db.serviceRequestProjection.deleteMany({
        where: { id: { in: requestIds } },
      });
      await db.eventDelivery.deleteMany({
        where: { eventId: { in: deliveryIds } },
      });
      await db.$disconnect();
    });
    async function fixture() {
      const id = randomUUID();
      requestIds.push(id);
      const data = {
        id,
        requestCode: `REQ-${id.slice(0, 8)}`,
        customerUserId: randomUUID(),
        serviceId: randomUUID(),
        latitude: 10.77,
        longitude: 106.7,
        matchingRevision: 1,
      };
      await projections.upsertPublishedRequest(data);
      const run = await runs.createOrGetRun({
        serviceRequestId: id,
        serviceId: data.serviceId,
        requestRevision: 1,
      });
      return { data, run };
    }
    function persist(run: any, token: string) {
      const worker = randomUUID();
      return {
        matchRunId: run.id,
        attemptToken: token,
        serviceRequestId: run.serviceRequestId,
        requestRevision: 1,
        candidateCount: 1,
        modelVersion: 'test',
        eligibleWorkerIds: [worker],
        results: [
          {
            workerUserId: worker,
            rank: 1,
            matchingScore: 90,
            scoreBreakdown: {},
          } as any,
        ],
        outboxPayload: { eventId: randomUUID() },
      };
    }
    it('allows one claim across parallel workers and preserves IDs/outbox on replay', async () => {
      const { run } = await fixture();
      const tokens = [randomUUID(), randomUUID(), randomUUID()];
      const claims = await Promise.all(
        tokens.map((t) =>
          runs.claimRun(run.id, t, new Date(Date.now() + 30000)),
        ),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
      const token = tokens[claims.indexOf(true)];
      const args = persist(run, token);
      const writes = await Promise.allSettled([
        runs.persistMatchResults(args),
        runs.persistMatchResults(args),
      ]);
      expect(writes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const original = await db.matchResult.findMany({
        where: { matchRunId: run.id },
      });
      await expect(runs.persistMatchResults(args)).rejects.toThrow(
        'lease lost',
      );
      expect(
        await db.matchResult.findMany({ where: { matchRunId: run.id } }),
      ).toEqual(original);
      const events = await db.outboxEvent.findMany({
        where: { aggregateId: run.id },
      });
      expect(
        events.filter((e) => e.eventType === 'matching.completed'),
      ).toHaveLength(1);
      const notification = events.find(
        (e) => e.eventType === 'matching.eligible_workers.ready',
      )!;
      expect(
        validateNotificationEvent(notification.payload, notification.eventType)
          .eventType,
      ).toBe('matching.eligible_workers.ready');
      await runs.failMatchRun({
        matchRunId: run.id,
        attemptToken: token,
        errorMessage: 'late',
        outboxPayload: {},
      });
      expect(
        (await db.matchRun.findUniqueOrThrow({ where: { id: run.id } })).status,
      ).toBe('completed');
    });
    it('recovers expired leases and fences both late success and late failure', async () => {
      const { run } = await fixture();
      const old = randomUUID();
      const current = randomUUID();
      await runs.claimRun(run.id, old, new Date(Date.now() - 1));
      expect(
        await runs.claimRun(run.id, current, new Date(Date.now() + 30000)),
      ).toBe(true);
      await expect(runs.persistMatchResults(persist(run, old))).rejects.toThrow(
        'lease lost',
      );
      await runs.failMatchRun({
        matchRunId: run.id,
        attemptToken: old,
        errorMessage: 'late',
        outboxPayload: {},
      });
      expect(
        (await db.matchRun.findUniqueOrThrow({ where: { id: run.id } }))
          .attemptToken,
      ).toBe(current);
      await runs.persistMatchResults(persist(run, current));
    });
    it('rolls back an aborted/expired attempt without results or completion events', async () => {
      const { run } = await fixture();
      const token = randomUUID();
      await runs.claimRun(run.id, token, new Date(Date.now() - 1));
      await expect(
        runs.persistMatchResults(persist(run, token)),
      ).rejects.toThrow('lease lost');
      expect(
        await db.matchResult.count({ where: { matchRunId: run.id } }),
      ).toBe(0);
      expect(
        await db.outboxEvent.count({ where: { aggregateId: run.id } }),
      ).toBe(0);
    });
    it('does not roll back revision or reopen expired requests after delayed publish/close', async () => {
      const { data, run } = await fixture();
      await projections.updateMatchingInputs({
        id: data.id,
        matchingRevision: 2,
      });
      await projections.updateMatchingInputs({
        id: data.id,
        matchingRevision: 1,
      });
      await projections.updateRequestStatus(data.id, 'expired');
      await projections.upsertPublishedRequest(data);
      await projections.updateRequestStatus(data.id, 'bidding_closed');
      expect(await projections.getProjection(data.id)).toMatchObject({
        matchingRevision: 2,
        status: 'expired',
      });
      const token = randomUUID();
      await runs.claimRun(run.id, token, new Date(Date.now() + 30000));
      await expect(
        runs.persistMatchResults(persist(run, token)),
      ).rejects.toThrow('no longer available');
      await expect(
        projections.updateRequestStatus(randomUUID(), 'expired'),
      ).rejects.toThrow('not yet available');
    });
    it('filters distance and paginates in SQL, excluding closed/expired requests', async () => {
      const { data } = await fixture();
      const second = { ...data, id: randomUUID(), requestCode: 'REQ-second' };
      requestIds.push(second.id);
      await projections.upsertPublishedRequest(second);
      const query = {
        workerUserId: randomUUID(),
        serviceIds: [data.serviceId],
        serviceAreas: [{ latitude: 10.77, longitude: 106.7, radiusKm: 10 }],
        page: 1,
        limit: 1,
      };
      const first = await projections.findMatchingRequestsForWorker(query);
      const next = await projections.findMatchingRequestsForWorker({
        ...query,
        page: 2,
      });
      expect(first.total).toBe(2);
      expect(first.items).toHaveLength(1);
      expect(next.items[0].id).not.toBe(first.items[0].id);
      await projections.updateRequestStatus(data.id, 'bidding_closed');
      await projections.updateRequestStatus(second.id, 'expired');
      expect(
        (await projections.findMatchingRequestsForWorker(query)).total,
      ).toBe(0);
    });
    it('retains exhausted event payload durably and recognizes it after repository restart', async () => {
      const id = randomUUID();
      deliveryIds.push(id);
      for (let i = 1; i <= 5; i++) {
        expect(
          await inbox.recordFailure(
            id,
            'service_request.expired',
            { eventId: id },
            new Error('offline'),
          ),
        ).toBe(i === 5);
      }
      const restarted = new ConsumedEventRepository(db as any);
      expect(await restarted.isEventConsumed(id)).toBe(true);
      expect(
        await db.eventDelivery.findUnique({ where: { eventId: id } }),
      ).toMatchObject({
        attempts: 5,
        deadLetter: true,
        payload: { eventId: id },
      });
    });
    it('enforces deadlines even before delayed lifecycle events arrive', async () => {
      const { data } = await fixture();
      await db.serviceRequestProjection.update({
        where: { id: data.id },
        data: {
          biddingClosesAt: new Date(Date.now() - 1000),
          selectionExpiresAt: new Date(Date.now() + 60000),
        },
      });
      expect((await projections.getProjection(data.id))?.status).toBe(
        'bidding_closed',
      );
      expect(
        (
          await projections.findMatchingRequestsForWorker({
            workerUserId: randomUUID(),
            serviceIds: [data.serviceId],
            serviceAreas: [{ latitude: 10.77, longitude: 106.7, radiusKm: 10 }],
          })
        ).total,
      ).toBe(0);
      await db.serviceRequestProjection.update({
        where: { id: data.id },
        data: { selectionExpiresAt: new Date(Date.now() - 1) },
      });
      expect((await projections.getProjection(data.id))?.status).toBe(
        'expired',
      );
    });

    it('upgrades the old schema with existing completed runs without changing IDs', async () => {
      const schema = `pr34_test_${randomUUID().replaceAll('-', '')}`;
      const migrationUrl = new URL(url!);
      if (
        migrationUrl.hostname.endsWith('.pooler.supabase.com') &&
        migrationUrl.port === '6543'
      )
        migrationUrl.port = '5432';
      const client = new pg.Client({
        connectionString: migrationUrl.toString(),
      });
      await client.connect();
      try {
        await client.query('BEGIN');
        await client.query(`CREATE SCHEMA "${schema}"`);
        await client.query(`SET LOCAL search_path TO "${schema}"`);
        for (const name of [
          '20261024000000_init_matching_service',
          '20261025000000_add_service_request_projections',
        ]) {
          await client.query(
            await readFile(
              `apps/matching-service/prisma/migrations/${name}/migration.sql`,
              'utf8',
            ),
          );
        }
        const runId = randomUUID();
        const resultId = randomUUID();
        await client.query(
          'INSERT INTO match_runs (id, service_request_id, service_id, status) VALUES ($1,$2,$3, $4)',
          [runId, randomUUID(), randomUUID(), 'completed'],
        );
        await client.query(
          'INSERT INTO match_results (id, match_run_id, worker_user_id, rank, matching_score) VALUES ($1,$2,$3,1,90)',
          [resultId, runId, randomUUID()],
        );
        await client.query(
          await readFile(
            'apps/matching-service/prisma/migrations/20261028000000_matching_reliability/migration.sql',
            'utf8',
          ),
        );
        expect(
          (await client.query('SELECT id FROM match_results')).rows,
        ).toEqual([{ id: resultId }]);
        expect(
          (await client.query('SELECT status, attempt_token FROM match_runs'))
            .rows[0],
        ).toEqual({ status: 'completed', attempt_token: null });
      } finally {
        // Roll back the entire temporary upgrade schema, including test rows.
        await client.query('ROLLBACK');
        await client.end();
      }
    }, 30000);

    it.skipIf(!process.env.RABBITMQ_URL)(
      'recovers after SIGKILL between enqueue and ACK, then handles replay once',
      async () => {
        const { data, run } = await fixture();
        const connection = await amqp.connect(process.env.RABBITMQ_URL!);
        const channel = await connection.createConfirmChannel();
        const queueName = `pr34_test_${randomUUID()}`;
        const eventId = randomUUID();
        deliveryIds.push(eventId);
        const packet = {
          eventId,
          data: { serviceRequestId: data.id, ...data },
        };
        const queue = new MatchingJobQueueService();
        queue.setProcessor(async (job) => {
          const current = await runs.createOrGetRun(job);
          if (current.status === 'completed') return;
          const token = randomUUID();
          if (
            !(await runs.claimRun(
              current.id,
              token,
              new Date(Date.now() + 30000),
            ))
          )
            throw new Error('lease unavailable');
          await runs.persistMatchResults(persist(current, token));
        });
        const consumer = new MatchingEventConsumer(inbox, projections, queue);
        let child: ReturnType<typeof fork> | undefined;
        try {
          await channel.assertQueue(queueName, {
            durable: true,
            arguments: { 'x-expires': 300000 },
          });
          await channel.prefetch(1);
          child = fork('scripts/pr34-crash-worker.mjs', [], {
            execArgv: [],
            stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
            env: {
              ...process.env,
              PR34_TEST_QUEUE: queueName,
              PR34_TEST_RUN_ID: run.id,
            },
          });
          const queued = once(child, 'message');
          channel.sendToQueue(queueName, Buffer.from(JSON.stringify(packet)), {
            persistent: true,
          });
          await channel.waitForConfirms();
          expect((await queued)[0]).toBe('queued-without-ack');
          const exited = once(child, 'exit');
          child.kill('SIGKILL');
          await exited;
          await new Promise((resolve) => setTimeout(resolve, 250));
          let deliveries = 0;
          let originalIds: string[] = [];
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('Broker redelivery timed out')),
              20000,
            );
            void channel
              .consume(
                queueName,
                async (message) => {
                  if (!message) return;
                  try {
                    const result = await consumer.handleServiceRequestPublished(
                      JSON.parse(message.content.toString()),
                      {
                        getChannelRef: () => channel,
                        getMessage: () => message,
                      },
                    );
                    deliveries++;
                    if (deliveries === 1) {
                      expect(message.fields.redelivered).toBe(true);
                      originalIds = (
                        await db.matchResult.findMany({
                          where: { matchRunId: run.id },
                        })
                      ).map((r) => r.id);
                      channel.sendToQueue(
                        queueName,
                        Buffer.from(JSON.stringify(packet)),
                        { persistent: true },
                      );
                    } else {
                      expect(result.status).toBe('duplicate');
                      clearTimeout(timeout);
                      resolve();
                    }
                  } catch (error) {
                    clearTimeout(timeout);
                    reject(error);
                  }
                },
                { noAck: false },
              )
              .catch((error) => {
                clearTimeout(timeout);
                reject(error);
              });
          });
          expect(
            (
              await db.matchResult.findMany({ where: { matchRunId: run.id } })
            ).map((r) => r.id),
          ).toEqual(originalIds);
          expect(
            await db.outboxEvent.count({
              where: { aggregateId: run.id, eventType: 'matching.completed' },
            }),
          ).toBe(1);
        } finally {
          child?.kill('SIGKILL');
          await queue.onModuleDestroy();
          await channel.deleteQueue(queueName);
          await channel.close();
          await connection.close();
          await db.consumedEvent.deleteMany({ where: { eventId } });
        }
      },
      60000,
    );
  },
);
