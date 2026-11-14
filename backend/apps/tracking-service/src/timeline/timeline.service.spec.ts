import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TrackingEntityType } from '@prisma/tracking-client';
import { TimelineService } from './timeline.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { GatewayUser } from '../common/security/tracking-security.util.js';

describe('TimelineService', () => {
  let service: TimelineService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      trackingFlow: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
      },
      trackingEvent: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };

    service = new TimelineService(prismaMock as unknown as PrismaService);
  });

  describe('getRequestTimeline Security & Filtering', () => {
    it('should allow customer who owns the request to view timeline', async () => {
      const customerId = randomUUID();
      const serviceRequestId = randomUUID();
      const flowId = randomUUID();

      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId,
      });

      prismaMock.trackingEvent.count.mockResolvedValue(1);
      prismaMock.trackingEvent.findMany.mockResolvedValue([
        {
          id: randomUUID(),
          eventId: randomUUID(),
          entityType: TrackingEntityType.service_request,
          entityId: serviceRequestId,
          eventType: 'service_request.published',
          sourceService: 'order-service',
          fromStatus: 'draft',
          toStatus: 'open_for_bidding',
          actorUserId: customerId,
          reason: null,
          metadata: {},
          occurredAt: new Date(),
          recordedAt: new Date(),
        },
      ]);

      const result = await service.getRequestTimeline(
        serviceRequestId,
        { page: 1, limit: 20 },
        user,
      );

      expect(result.items.length).toBe(1);
      expect(result.total).toBe(1);
    });

    it('should throw ForbiddenException if another customer tries to view the request timeline', async () => {
      const ownerCustomerId = randomUUID();
      const intruderCustomerId = randomUUID();
      const serviceRequestId = randomUUID();

      const user: GatewayUser = {
        userId: intruderCustomerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId: ownerCustomerId,
      });

      await expect(
        service.getRequestTimeline(serviceRequestId, {}, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if flow has null customerId (fail-closed)', async () => {
      const intruderCustomerId = randomUUID();
      const serviceRequestId = randomUUID();

      const user: GatewayUser = {
        userId: intruderCustomerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId: null,
      });

      await expect(
        service.getRequestTimeline(serviceRequestId, {}, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if worker previously submitted booking_proposal but is not assigned to order', async () => {
      const workerId = randomUUID();
      const orderId = randomUUID();
      const flowId = randomUUID();

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      prismaMock.trackingFlow.findFirst.mockResolvedValue({
        id: flowId,
        serviceRequestId: randomUUID(),
        orderId,
        customerId: randomUUID(),
      });

      // Worker is NOT found among order events for this orderId
      prismaMock.trackingEvent.findFirst.mockResolvedValue(null);

      await expect(
        service.getOrderTimeline(orderId, {}, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should shield order and payment events from participating worker who is not assigned to the order', async () => {
      const workerId = randomUUID();
      const otherWorkerId = randomUUID();
      const serviceRequestId = randomUUID();
      const flowId = randomUUID();

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId: randomUUID(),
      });

      // 1. Participation check returns true (worker participated in proposal/bid)
      // 2. getAssignedWorkerId check returns otherWorkerId
      prismaMock.trackingEvent.findFirst
        .mockResolvedValueOnce({
          id: randomUUID(),
          entityType: TrackingEntityType.booking_proposal,
          actorUserId: workerId,
        })
        .mockResolvedValueOnce({
          id: randomUUID(),
          entityType: TrackingEntityType.order,
          eventType: 'order.created',
          actorUserId: otherWorkerId,
          metadata: { workerId: otherWorkerId },
        });

      prismaMock.trackingEvent.count.mockResolvedValue(1);
      prismaMock.trackingEvent.findMany.mockResolvedValue([
        {
          id: randomUUID(),
          entityType: TrackingEntityType.service_request,
          eventType: 'service_request.published',
          occurredAt: new Date(),
          recordedAt: new Date(),
          metadata: {},
        },
      ]);

      const result = await service.getRequestTimeline(serviceRequestId, {}, user);

      expect(result.items).toHaveLength(1);
      const findManyCall = prismaMock.trackingEvent.findMany.mock.calls[0][0];
      const orConditions = findManyCall.where.AND[1].OR;
      const allowsOrder = orConditions.some(
        (c: any) => c.entityType === TrackingEntityType.order,
      );
      const allowsPayment = orConditions.some(
        (c: any) => c.entityType === TrackingEntityType.payment,
      );
      expect(allowsOrder).toBe(false);
      expect(allowsPayment).toBe(false);
    });

    it('should filter out competitor worker bids when a participating worker queries the timeline', async () => {
      const workerId = randomUUID();
      const serviceRequestId = randomUUID();
      const flowId = randomUUID();

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId: randomUUID(),
      });

      // Worker participated in this flow
      prismaMock.trackingEvent.findFirst.mockResolvedValue({
        id: randomUUID(),
        actorUserId: workerId,
      });

      prismaMock.trackingEvent.count.mockResolvedValue(2);
      prismaMock.trackingEvent.findMany.mockResolvedValue([
        {
          id: randomUUID(),
          eventId: randomUUID(),
          entityType: TrackingEntityType.service_request,
          entityId: serviceRequestId,
          eventType: 'service_request.published',
          sourceService: 'order-service',
          fromStatus: null,
          toStatus: null,
          actorUserId: null,
          reason: null,
          metadata: {},
          occurredAt: new Date(),
          recordedAt: new Date(),
        },
        {
          id: randomUUID(),
          eventId: randomUUID(),
          entityType: TrackingEntityType.bid,
          entityId: randomUUID(),
          eventType: 'bid.submitted',
          sourceService: 'bidding-service',
          fromStatus: null,
          toStatus: 'active',
          actorUserId: workerId,
          reason: null,
          metadata: { amount: 300000, workerId },
          occurredAt: new Date(),
          recordedAt: new Date(),
        },
      ]);

      const result = await service.getRequestTimeline(
        serviceRequestId,
        { page: 1, limit: 20 },
        user,
      );

      expect(result.items.length).toBe(2);
      // Ensure the query applied worker visibility filters
      const findManyCall = prismaMock.trackingEvent.findMany.mock.calls[0][0];
      expect(findManyCall.where.AND).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            OR: expect.any(Array),
          }),
        ]),
      );
    });

    it('should throw ForbiddenException if a non-participating worker tries to view the request timeline', async () => {
      const workerId = randomUUID();
      const serviceRequestId = randomUUID();

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId: randomUUID(),
      });

      // No participation found
      prismaMock.trackingEvent.findFirst.mockResolvedValue(null);

      await expect(
        service.getRequestTimeline(serviceRequestId, {}, user),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getBidTimeline Security', () => {
    it('should throw ForbiddenException if worker tries to access another workers bid timeline', async () => {
      const ownerWorkerId = randomUUID();
      const otherWorkerId = randomUUID();
      const bidId = randomUUID();

      const user: GatewayUser = {
        userId: otherWorkerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      prismaMock.trackingEvent.findFirst.mockResolvedValue({
        id: randomUUID(),
        entityType: TrackingEntityType.bid,
        entityId: bidId,
        actorUserId: ownerWorkerId,
        metadata: { workerId: ownerWorkerId },
        trackingFlow: {
          id: randomUUID(),
          customerId: randomUUID(),
        },
      });

      await expect(service.getBidTimeline(bidId, {}, user)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow worker to access their own bid timeline', async () => {
      const workerId = randomUUID();
      const bidId = randomUUID();

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      prismaMock.trackingEvent.findFirst.mockResolvedValue({
        id: randomUUID(),
        entityType: TrackingEntityType.bid,
        entityId: bidId,
        actorUserId: workerId,
        metadata: { workerId },
        trackingFlow: {
          id: randomUUID(),
          customerId: randomUUID(),
        },
      });

      prismaMock.trackingEvent.count.mockResolvedValue(1);
      prismaMock.trackingEvent.findMany.mockResolvedValue([
        {
          id: randomUUID(),
          eventId: randomUUID(),
          entityType: TrackingEntityType.bid,
          entityId: bidId,
          eventType: 'bid.submitted',
          sourceService: 'bidding-service',
          fromStatus: null,
          toStatus: 'active',
          actorUserId: workerId,
          reason: null,
          metadata: { amount: 200000 },
          occurredAt: new Date(),
          recordedAt: new Date(),
        },
      ]);

      const result = await service.getBidTimeline(bidId, {}, user);
      expect(result.items.length).toBe(1);
      expect(result.items[0].entityId).toBe(bidId);
    });
  });

  describe('getOrderTimeline Security', () => {
    it('should throw NotFoundException if order does not exist in tracking', async () => {
      const orderId = randomUUID();
      prismaMock.trackingFlow.findFirst.mockResolvedValue(null);

      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      await expect(service.getOrderTimeline(orderId, {}, user)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Redis Caching', () => {
    it('uses a new cache version after an event is committed even when old cache survives', async () => {
      const serviceRequestId = randomUUID();
      const user: GatewayUser = { userId: randomUUID(), roles: ['Admin'], isAdmin: true, isCustomer: false, isWorker: false };
      let eventSequence = 2;
      let eventCount = 2;
      prismaMock.trackingFlow.findUnique.mockImplementation(async () => ({ id: randomUUID(), serviceRequestId, eventSequence }));
      prismaMock.trackingEvent.count.mockImplementation(async () => eventCount);
      prismaMock.trackingEvent.findMany.mockResolvedValue([]);
      prismaMock.trackingEvent.findFirst.mockResolvedValue({ id: randomUUID() });
      const cache = new Map<string, any>();
      const redisMock: any = {
        get: vi.fn(async (key: string) => cache.get(key) ?? null),
        set: vi.fn(async (key: string, value: any) => { cache.set(key, value); }),
        delByPattern: vi.fn(async () => { /* Redis outage leaves old key behind. */ }),
      };
      const cachedService = new TimelineService(prismaMock, redisMock);
      expect((await cachedService.getRequestTimeline(serviceRequestId, {}, user)).total).toBe(2);
      eventSequence = 3;
      eventCount = 3;
      await redisMock.delByPattern(`tracking:*:${serviceRequestId}:*`);
      expect((await cachedService.getRequestTimeline(serviceRequestId, {}, user)).total).toBe(3);
      expect(cache.has(`tracking:timeline:${serviceRequestId}:admin:p1:l20:sasc:tall:v2`)).toBe(true);
      expect(redisMock.get).toHaveBeenLastCalledWith(`tracking:timeline:${serviceRequestId}:admin:p1:l20:sasc:tall:v3`);
    });

    it('checks ownership before returning a cached timeline', async () => {
      const serviceRequestId = randomUUID();
      const user: GatewayUser = { userId: randomUUID(), roles: ['Customer'], isAdmin: false, isCustomer: true, isWorker: false };
      prismaMock.trackingFlow.findUnique.mockResolvedValue({ id: randomUUID(), serviceRequestId, customerId: randomUUID(), eventSequence: 2 });
      const redisMock: any = { get: vi.fn().mockResolvedValue({ total: 2 }) };
      await expect(new TimelineService(prismaMock, redisMock).getRequestTimeline(serviceRequestId, {}, user)).rejects.toThrow(ForbiddenException);
      expect(redisMock.get).not.toHaveBeenCalled();
    });

    it('should return cached timeline immediately when key exists in Redis', async () => {
      const serviceRequestId = randomUUID();
      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Admin'],
        isAdmin: true,
        isCustomer: false,
        isWorker: false,
      };

      const cachedTimeline = {
        items: [],
        total: 10,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      const redisMock: any = {
        get: vi.fn().mockResolvedValue(cachedTimeline),
        set: vi.fn(),
      };
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(), serviceRequestId, eventSequence: 3,
      });

      const cachedService = new TimelineService(prismaMock, redisMock);
      const result = await cachedService.getRequestTimeline(
        serviceRequestId,
        { page: 1, limit: 20 },
        user,
      );

      expect(result).toBe(cachedTimeline);
      expect(redisMock.get).toHaveBeenCalledWith(
        `tracking:timeline:${serviceRequestId}:admin:p1:l20:sasc:tall:v3`,
      );
      expect(prismaMock.trackingFlow.findUnique).toHaveBeenCalledOnce();
    });

    it('should cache timeline in Redis when flow contains terminal event (COMPLETED)', async () => {
      const customerId = randomUUID();
      const serviceRequestId = randomUUID();
      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const redisMock: any = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
      };

      const flowId = randomUUID();
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId,
      });

      prismaMock.trackingEvent.count.mockResolvedValue(2);
      prismaMock.trackingEvent.findMany.mockResolvedValue([]);
      // Mock terminal event finding
      prismaMock.trackingEvent.findFirst.mockResolvedValue({ id: randomUUID() });

      const cachedService = new TimelineService(prismaMock, redisMock);
      const result = await cachedService.getRequestTimeline(
        serviceRequestId,
        { page: 1, limit: 10 },
        user,
      );

      expect(result.total).toBe(2);
      expect(redisMock.set).toHaveBeenCalledWith(
        `tracking:timeline:${serviceRequestId}:cust:${customerId}:p1:l10:sasc:tall:v0`,
        expect.objectContaining({ total: 2 }),
        7 * 24 * 3600,
      );
    });
  });
});
