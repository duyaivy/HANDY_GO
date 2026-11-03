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
        findMany: vi.fn().mockResolvedValue([]),
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

    it('should deliver concurrently published events in database write order', async () => {
      const serviceRequestId = randomUUID();
      const customerId = randomUUID();
      const flowId = randomUUID();
      const firstEvent = {
        id: randomUUID(),
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 1,
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.created',
        sourceService: 'order-service',
        fromStatus: null,
        toStatus: null,
        actorUserId: null,
        reason: null,
        metadata: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };
      const secondEvent = {
        ...firstEvent,
        id: randomUUID(),
        eventId: randomUUID(),
        writeSequence: 2,
        eventType: 'order.in_progress',
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId,
      });
      prismaMock.trackingEvent.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([firstEvent, secondEvent]);

      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };
      const stream$ = await service.getLiveStream(serviceRequestId, user);
      const messages: any[] = [];
      const subscription = stream$.subscribe((message) => messages.push(message));

      service.broadcastEvent({
        serviceRequestId,
        ...secondEvent,
      });
      service.broadcastEvent({
        serviceRequestId,
        ...firstEvent,
      });

      await vi.waitFor(() => expect(messages).toHaveLength(3));
      expect(messages.slice(1).map((message) => message.id)).toEqual([
        firstEvent.id,
        secondEvent.id,
      ]);
      subscription.unsubscribe();
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

    it('should shield order and payment events from worker who is not assigned to the order', async () => {
      const serviceRequestId = randomUUID();
      const workerId = randomUUID();
      const assignedWorkerId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId: randomUUID(),
      });
      // 1. Participation check returns true
      // 2. assignedWorkerId check returns order.created for assignedWorkerId
      prismaMock.trackingEvent.findFirst
        .mockResolvedValueOnce({ id: randomUUID() })
        .mockResolvedValueOnce({
          actorUserId: assignedWorkerId,
          metadata: { workerId: assignedWorkerId },
        });

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      const stream$ = await service.getLiveStream(serviceRequestId, user);
      const messagesPromise = firstValueFrom(stream$.pipe(take(2), toArray()));

      // 1. Order event for assignedWorkerId -> should be shielded from workerId
      service.broadcastEvent({
        serviceRequestId,
        id: randomUUID(),
        eventId: randomUUID(),
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.in_progress',
        sourceService: 'order-service',
        actorUserId: workerId,
        metadata: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      });

      // 2. My proposal event -> should pass through
      service.broadcastEvent({
        serviceRequestId,
        id: randomUUID(),
        eventId: randomUUID(),
        entityType: TrackingEntityType.booking_proposal,
        entityId: randomUUID(),
        eventType: 'booking_proposal.rejected',
        sourceService: 'order-service',
        actorUserId: workerId,
        metadata: { workerId },
        occurredAt: new Date(),
        recordedAt: new Date(),
      });

      const messages = await messagesPromise;
      expect(messages).toHaveLength(2);
      expect((messages[0].data as any).type).toBe('connected');
      expect((messages[1].data as any).type).toBe('timeline_event');
      expect((messages[1].data as any).payload.eventType).toBe('booking_proposal.rejected');
    });

    it('should update order-event access when order.created arrives after the worker connects', async () => {
      const serviceRequestId = randomUUID();
      const flowId = randomUUID();
      const workerId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId: randomUUID(),
      });
      prismaMock.trackingEvent.findFirst
        .mockResolvedValueOnce({ id: randomUUID() })
        .mockResolvedValueOnce(null);

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      const stream$ = await service.getLiveStream(serviceRequestId, user);
      const messagesPromise = firstValueFrom(stream$.pipe(take(3), toArray()));

      service.broadcastEvent({
        serviceRequestId,
        id: randomUUID(),
        eventId: randomUUID(),
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.created',
        sourceService: 'order-service',
        actorUserId: randomUUID(),
        metadata: { workerUserId: workerId },
        occurredAt: new Date(),
        recordedAt: new Date(),
      });

      service.broadcastEvent({
        serviceRequestId,
        id: randomUUID(),
        eventId: randomUUID(),
        entityType: TrackingEntityType.payment,
        entityId: randomUUID(),
        eventType: 'payment.succeeded',
        sourceService: 'payment-service',
        actorUserId: randomUUID(),
        metadata: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      });

      const messages = await messagesPromise;
      expect(messages).toHaveLength(3);
      expect((messages[1].data as any).payload.eventType).toBe('order.created');
      expect((messages[2].data as any).payload.eventType).toBe('payment.succeeded');
    });

    it('should replay missed events on reconnect when lastEventId is provided', async () => {
      const serviceRequestId = randomUUID();
      const customerId = randomUUID();
      const lastEventId = randomUUID();
      const flowId = randomUUID();
      const baseTime = new Date('2026-11-01T10:00:00Z');

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId,
      });

      // Mock finding base event
      prismaMock.trackingEvent.findFirst.mockResolvedValue({
        id: lastEventId,
        writeSequence: 4,
        recordedAt: baseTime,
      });

      // Mock a late-arriving event with an earlier business timestamp.
      const missedEventId = randomUUID();
      const missedEvent = {
        id: missedEventId,
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 5,
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.in_progress',
        sourceService: 'order-service',
        fromStatus: 'confirmed',
        toStatus: 'in_progress',
        actorUserId: randomUUID(),
        reason: null,
        metadata: {},
        occurredAt: new Date('2026-11-01T09:55:00Z'),
        recordedAt: new Date('2026-11-01T10:05:01Z'),
      };
      prismaMock.trackingEvent.findMany.mockImplementationOnce(async (query) => {
        expect(query.where).toEqual({
          trackingFlowId: flowId,
          writeSequence: { gt: 4 },
        });
        expect(query.orderBy).toEqual({ writeSequence: 'asc' });

        service.broadcastEvent({
          serviceRequestId,
          ...missedEvent,
        });
        return [missedEvent];
      });

      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const stream$ = await service.getLiveStream(serviceRequestId, user, lastEventId);
      const messages: any[] = [];
      const subscription = stream$.subscribe((message) => messages.push(message));

      expect(messages).toHaveLength(2);
      expect((messages[0].data as any).type).toBe('connected');
      expect(messages[1].id).toBe(missedEventId);
      expect((messages[1].data as any).type).toBe('timeline_event');
      expect((messages[1].data as any).payload.eventType).toBe('order.in_progress');
      expect(messages.filter((message) => message.id === missedEventId)).toHaveLength(1);
      subscription.unsubscribe();
    });
  });
});
