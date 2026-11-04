import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { TrackingServiceModule } from '../src/tracking-service.module.js';
import { PrismaService } from '../src/common/prisma/prisma.service.js';
import { TrackingEventsService } from '../src/events/tracking-events.service.js';
import { TrackingEventsConsumer } from '../src/events/tracking-events.consumer.js';
import { RedisService } from '@app/redis';
import { ConfigService } from '@app/config';

describe('Tracking Service — Reliability & E2E Tests (TRK-05)', () => {
  let app: INestApplication;
  let eventsService: TrackingEventsService;
  let consumer: TrackingEventsConsumer;

  const mockPrismaService = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    pendingTrackingEvent: { deleteMany: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    consumedEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    trackingFlow: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn().mockResolvedValue({ eventSequence: 1 }),
    },
    trackingEvent: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((cb) => cb(mockPrismaService)),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  };

  let actualSecret: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TrackingServiceModule],
    })
      .overrideProvider(RedisService)
      .useValue({ subscribe: vi.fn().mockResolvedValue(async () => {}), publishStrict: vi.fn(), delByPattern: vi.fn(), get: vi.fn(), set: vi.fn() })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    await app.init();
    await app.listen(0);


    const config = moduleFixture.get<ConfigService>(ConfigService);
    actualSecret = config.internalServiceSecret;

    eventsService = moduleFixture.get<TrackingEventsService>(TrackingEventsService);
    consumer = moduleFixture.get<TrackingEventsConsumer>(TrackingEventsConsumer);
  });

  afterAll(async () => {
    await app.close();
  });

  // ========================================================================
  // 1. HTTP HEALTH CHECK
  // ========================================================================
  describe('Health Endpoint', () => {
    it('GET /health should return 200 OK with status ok', async () => {
      const res = await request(app.getHttpServer()).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  // ========================================================================
  // 2. IDEMPOTENCY & TIMELINE DEDUPLICATION
  // ========================================================================
  describe('Idempotency & Deduplication', () => {
    it('should NOT record duplicate timeline event when same eventId is ingested twice', async () => {
      const eventId = randomUUID();
      const serviceRequestId = randomUUID();

      // First run: Event not consumed yet -> successfully records
      mockPrismaService.consumedEvent.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.trackingFlow.upsert.mockResolvedValueOnce({
        id: randomUUID(),
        serviceRequestId,
      });

      const firstResult = await eventsService.recordDomainEvent({
        eventId,
        eventType: 'service_request.created',
        serviceRequestId,
      });

      expect(firstResult.recorded).toBe(true);
      expect(mockPrismaService.trackingEvent.create).toHaveBeenCalledTimes(1);

      // Second run: Event already exists in consumed_events -> must be skipped
      mockPrismaService.consumedEvent.findUnique.mockResolvedValueOnce({
        eventId,
        eventType: 'service_request.created',
        consumedAt: new Date(),
      });

      const secondResult = await eventsService.recordDomainEvent({
        eventId,
        eventType: 'service_request.created',
        serviceRequestId,
      });

      expect(secondResult.recorded).toBe(false);
      expect(secondResult.reason).toBe('ALREADY_CONSUMED');
      // Create count must remain 1 (no duplicate timeline event)
      expect(mockPrismaService.trackingEvent.create).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // 3. OUT-OF-ORDER EVENT INGESTION
  // ========================================================================
  describe('Out-of-Order Event Handling', () => {
    it('should safely ingest order.created before service_request.created without crashing', async () => {
      const serviceRequestId = randomUUID();
      const orderId = randomUUID();
      const eventId = randomUUID();

      mockPrismaService.consumedEvent.findUnique.mockResolvedValue(null);
      mockPrismaService.trackingFlow.upsert.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        orderId,
      });

      const result = await eventsService.recordDomainEvent({
        eventId,
        eventType: 'order.created',
        serviceRequestId,
        orderId,
      });

      expect(result.recorded).toBe(true);
      expect(mockPrismaService.trackingFlow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { serviceRequestId },
          create: expect.objectContaining({ serviceRequestId, orderId }),
        }),
      );
    });
  });

  // ========================================================================
  // 4. RABBITMQ RETRY ON TRANSIENT ERROR
  // ========================================================================
  describe('RabbitMQ Retry Handling', () => {
    it('should nack with requeue=true when database is temporarily unavailable', async () => {
      const channelMock = { ack: vi.fn(), nack: vi.fn() };
      const contextMock = {
        getChannelRef: () => channelMock,
        getMessage: () => ({ properties: { messageId: 'm1' } }),
      };

      vi.spyOn(eventsService, 'recordDomainEvent').mockRejectedValueOnce(
        new Error('Connection terminated unexpectedly'),
      );

      await consumer.handleMatchingStarted(
        { eventId: randomUUID(), serviceRequestId: randomUUID() },
        contextMock,
      );

      expect(channelMock.nack).toHaveBeenCalledWith(
        expect.anything(),
        false,
        true, // requeue=true ensures RabbitMQ retry
      );
      expect(channelMock.ack).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 5. DEAD LETTER QUEUE (DLQ) ON PERMANENT ERROR
  // ========================================================================
  describe('Dead Letter Queue (DLQ) Handling', () => {
    it('should nack with requeue=false on unrecoverable data error to forward to DLQ', async () => {
      const channelMock = { ack: vi.fn(), nack: vi.fn() };
      const contextMock = {
        getChannelRef: () => channelMock,
        getMessage: () => ({ properties: { messageId: 'm2' } }),
      };

      vi.spyOn(eventsService, 'recordDomainEvent').mockRejectedValueOnce(
        new Error('SyntaxError: Unexpected token in JSON at position 0'),
      );

      await consumer.handleBidSubmitted(
        { eventId: randomUUID(), serviceRequestId: randomUUID() },
        contextMock,
      );

      expect(channelMock.nack).toHaveBeenCalledWith(
        expect.anything(),
        false,
        false, // requeue=false routes to DLQ / DLX
      );
      expect(channelMock.ack).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // 6. HTTP API SECURITY & RESPONSE FORMAT
  // ========================================================================
  describe('API Authorization & Response Format', () => {
    it('GET /api/v1/tracking/requests/:id/summary should reject untrusted caller without secret', async () => {
      const requestId = randomUUID();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tracking/requests/${requestId}/summary`)
        .set('x-user-id', randomUUID())
        .set('x-user-roles', 'customer');

      expect(res.status).toBe(403);
    });

    it('GET /api/v1/tracking/requests/:id/timeline should return 200 with valid secret and identity', async () => {
      const requestId = randomUUID();
      const userId = randomUUID();

      mockPrismaService.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId: requestId,
        customerId: userId,
      });
      mockPrismaService.trackingEvent.count.mockResolvedValue(0);
      mockPrismaService.trackingEvent.findMany.mockResolvedValue([]);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tracking/requests/${requestId}/timeline`)
        .set('x-internal-secret', actualSecret)
        .set('x-user-id', userId)
        .set('x-user-roles', 'customer');

      expect(res.status).toBe(200);
      expect(res.body.statusCode).toBe(200);
      expect(res.body.data).toHaveProperty('items');
      expect(res.body.data).toHaveProperty('total', 0);
    });
  });

  // ========================================================================
  // 7. REAL-TIME TIMELINE SSE STREAM (GET /requests/:id/live)
  // ========================================================================
  describe('Real-time Timeline SSE Stream Endpoint', () => {
    it('GET /api/v1/tracking/requests/:id/live should reject untrusted caller without secret', async () => {
      const requestId = randomUUID();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/tracking/requests/${requestId}/live`)
        .set('x-user-id', randomUUID())
        .set('x-user-roles', 'customer');

      expect(res.status).toBe(403);
    });

    it('GET /api/v1/tracking/requests/:id/live should return 404 when request does not exist', async () => {
      const requestId = randomUUID();
      mockPrismaService.trackingFlow.findUnique.mockResolvedValue(null);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tracking/requests/${requestId}/live`)
        .set('x-internal-secret', actualSecret)
        .set('x-user-id', randomUUID())
        .set('x-user-roles', 'customer');

      expect(res.status).toBe(404);
    });

    it('GET /api/v1/tracking/requests/:id/live should return 403 when customer does not own request', async () => {
      const requestId = randomUUID();
      mockPrismaService.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId: requestId,
        customerId: randomUUID(), // different owner
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/tracking/requests/${requestId}/live`)
        .set('x-internal-secret', actualSecret)
        .set('x-user-id', randomUUID()) // caller
        .set('x-user-roles', 'customer');

      expect(res.status).toBe(403);
    });

    it('GET /api/v1/tracking/requests/:id/live should establish SSE stream with text/event-stream header and initial connected message', async () => {
      const requestId = randomUUID();
      const userId = randomUUID();

      mockPrismaService.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId: requestId,
        customerId: userId,
      });

      const address: any = app.getHttpServer().address();
      const port = address.port;

      const res = await new Promise<any>((resolve, reject) => {
        const clientReq = http.get(
          {
            hostname: '127.0.0.1',
            port,
            path: `/api/v1/tracking/requests/${requestId}/live`,
            headers: {
              'x-internal-secret': actualSecret,
              'x-user-id': userId,
              'x-user-roles': 'customer',
            },
          },
          (clientRes) => {
            let data = '';
            clientRes.on('data', (chunk: Buffer) => {
              data += chunk.toString();
              if (data.includes('connected')) {
                clientReq.destroy();
                resolve({
                  statusCode: clientRes.statusCode,
                  headers: clientRes.headers,
                  data,
                });
              }
            });
          },
        );

        clientReq.on('error', (err) => {
          if ((err as any).code === 'ECONNRESET') return;
          reject(err);
        });
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.data).toContain('connected');
      expect(res.data).toContain(requestId);
    });

  });
});
