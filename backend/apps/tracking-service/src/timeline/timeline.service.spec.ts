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
});
