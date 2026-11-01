import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { firstValueFrom, take, toArray } from 'rxjs';
import { TrackingEntityType } from '@prisma/tracking-client';
import { TimelineStreamService, type LiveTimelineEvent } from './timeline-stream.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { GatewayUser } from '../security/tracking-security.util.js';

describe('TimelineStreamService', () => {
  let service: TimelineStreamService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      trackingFlow: {
        findUnique: vi.fn(),
      },
      trackingEvent: {
        findFirst: vi.fn(),
      },
    };

    service = new TimelineStreamService(prismaMock as unknown as PrismaService);
  });

  describe('getLiveStream', () => {
    it('should throw NotFoundException if flow does not exist', async () => {
      const serviceRequestId = randomUUID();
      prismaMock.trackingFlow.findUnique.mockResolvedValue(null);

      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      await expect(service.getLiveStream(serviceRequestId, user)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if customer is not the request owner', async () => {
      const serviceRequestId = randomUUID();
      const customerOwnerId = randomUUID();
      const otherCustomerId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId: customerOwnerId,
      });

      const user: GatewayUser = {
        userId: otherCustomerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      await expect(service.getLiveStream(serviceRequestId, user)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException if worker has not participated in the flow', async () => {
      const serviceRequestId = randomUUID();
      const workerId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId: randomUUID(),
      });
      prismaMock.trackingEvent.findFirst.mockResolvedValue(null);

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      await expect(service.getLiveStream(serviceRequestId, user)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should emit initial connected event and stream live timeline events for customer', async () => {
      const serviceRequestId = randomUUID();
      const customerId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
      });

      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const stream$ = await service.getLiveStream(serviceRequestId, user);

      // Collect the first 2 messages: initial 'connected' + 1 broadcasted event
      const messagesPromise = firstValueFrom(stream$.pipe(take(2), toArray()));

      // Broadcast an event
      const mockEvent: LiveTimelineEvent = {
        serviceRequestId,
        id: randomUUID(),
        eventId: randomUUID(),
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.in_progress',
        sourceService: 'order-service',
        fromStatus: 'arrived',
        toStatus: 'in_progress',
        actorUserId: randomUUID(),
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      service.broadcastEvent(mockEvent);

      const messages = await messagesPromise;

      expect(messages).toHaveLength(2);
      expect((messages[0].data as any).type).toBe('connected');
      expect((messages[0].data as any).serviceRequestId).toBe(serviceRequestId);
      expect((messages[1].data as any).type).toBe('timeline_event');
      expect((messages[1].data as any).payload.eventType).toBe('order.in_progress');
    });

    it('should shield competitor bids from worker stream', async () => {
      const serviceRequestId = randomUUID();
      const workerId = randomUUID();
      const competitorWorkerId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId: randomUUID(),
      });
      prismaMock.trackingEvent.findFirst.mockResolvedValue({ id: randomUUID() });

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      const stream$ = await service.getLiveStream(serviceRequestId, user);

      // We expect initial 'connected' and our own bid event (competitor bid ignored)
      const messagesPromise = firstValueFrom(stream$.pipe(take(2), toArray()));

      // 1. Competitor bid event -> should be shielded/filtered
      service.broadcastEvent({
        serviceRequestId,
        id: randomUUID(),
        eventId: randomUUID(),
        entityType: TrackingEntityType.bid,
        entityId: randomUUID(),
        eventType: 'bid.submitted',
        sourceService: 'bidding-service',
        actorUserId: competitorWorkerId,
        metadata: { workerId: competitorWorkerId },
        occurredAt: new Date(),
        recordedAt: new Date(),
      });

      // 2. My bid event -> should pass through
      service.broadcastEvent({
        serviceRequestId,
        id: randomUUID(),
        eventId: randomUUID(),
        entityType: TrackingEntityType.bid,
        entityId: randomUUID(),
        eventType: 'bid.submitted',
        sourceService: 'bidding-service',
        actorUserId: workerId,
        metadata: { workerId },
        occurredAt: new Date(),
        recordedAt: new Date(),
      });

      const messages = await messagesPromise;

      expect(messages).toHaveLength(2);
      expect((messages[0].data as any).type).toBe('connected');
      expect((messages[1].data as any).type).toBe('timeline_event');
      expect((messages[1].data as any).payload.actorUserId).toBe(workerId);
    });
  });
});
