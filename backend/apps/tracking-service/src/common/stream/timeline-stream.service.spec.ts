import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { firstValueFrom, take, toArray } from 'rxjs';
import { TrackingEntityType } from '@prisma/tracking-client';
import { TimelineStreamService, type LiveTimelineEvent } from './timeline-stream.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { GatewayUser } from '../security/tracking-security.util.js';
import type { RedisService } from '@app/redis';

describe('TimelineStreamService', () => {
  let service: TimelineStreamService;
  let prismaMock: any;
  let mockDbEvents: any[];

  beforeEach(() => {
    mockDbEvents = [];
    prismaMock = {
      trackingFlow: {
        findUnique: vi.fn(),
      },
      trackingEvent: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockImplementation(async (params?: any) => {
          if (!params) return mockDbEvents;
          let filtered = [...mockDbEvents];
          if (params.where?.trackingFlowId) {
            filtered = filtered.filter(
              (e) => e.trackingFlowId === params.where.trackingFlowId,
            );
          }
          if (params.where?.writeSequence?.gt !== undefined) {
            filtered = filtered.filter(
              (e) => e.writeSequence > params.where.writeSequence.gt,
            );
          }
          if (params.orderBy?.writeSequence === 'asc') {
            filtered.sort((a, b) => a.writeSequence - b.writeSequence);
          } else if (params.orderBy?.writeSequence === 'desc') {
            filtered.sort((a, b) => b.writeSequence - a.writeSequence);
          }
          return filtered;
        }),
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
      const flowId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
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
        writeSequence: 1,
      };

      mockDbEvents.push({ ...mockEvent, trackingFlowId: flowId });
      service.broadcastEvent(mockEvent);

      const messages = await messagesPromise;

      expect(messages).toHaveLength(2);
      expect((messages[0].data as any).type).toBe('connected');
      expect((messages[0].data as any).serviceRequestId).toBe(serviceRequestId);
      expect((messages[1].data as any).type).toBe('timeline_event');
      expect((messages[1].data as any).payload.eventType).toBe('order.in_progress');
      expect((messages[1].data as any).payload.writeSequence).toBe(1);
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
      const flowId = randomUUID();
      const workerId = randomUUID();
      const competitorWorkerId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
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
      const messagesPromise = firstValueFrom(stream$.pipe(take(2), toArray()));

      // 1. Competitor bid event -> should be shielded/filtered
      const competitorBid: LiveTimelineEvent = {
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
        writeSequence: 1,
      };
      mockDbEvents.push({ ...competitorBid, trackingFlowId: flowId });
      service.broadcastEvent(competitorBid);

      // 2. My bid event -> should pass through
      const myBid: LiveTimelineEvent = {
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
        writeSequence: 2,
      };
      mockDbEvents.push({ ...myBid, trackingFlowId: flowId });
      service.broadcastEvent(myBid);

      const messages = await messagesPromise;

      expect(messages).toHaveLength(2);
      expect((messages[0].data as any).type).toBe('connected');
      expect((messages[1].data as any).type).toBe('timeline_event');
      expect((messages[1].data as any).payload.actorUserId).toBe(workerId);
      expect((messages[1].data as any).payload.writeSequence).toBe(2);
    });

    it('should shield order and payment events from worker who is not assigned to the order', async () => {
      const serviceRequestId = randomUUID();
      const flowId = randomUUID();
      const workerId = randomUUID();
      const assignedWorkerId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
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
      const orderEvent: LiveTimelineEvent = {
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
        writeSequence: 1,
      };
      mockDbEvents.push({ ...orderEvent, trackingFlowId: flowId });
      service.broadcastEvent(orderEvent);

      // 2. My proposal event -> should pass through
      const proposalEvent: LiveTimelineEvent = {
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
        writeSequence: 2,
      };
      mockDbEvents.push({ ...proposalEvent, trackingFlowId: flowId });
      service.broadcastEvent(proposalEvent);

      const messages = await messagesPromise;
      expect(messages).toHaveLength(2);
      expect((messages[0].data as any).type).toBe('connected');
      expect((messages[1].data as any).type).toBe('timeline_event');
      expect((messages[1].data as any).payload.eventType).toBe('booking_proposal.rejected');
      expect((messages[1].data as any).payload.writeSequence).toBe(2);
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

      const orderCreatedEvent: LiveTimelineEvent = {
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
        writeSequence: 1,
      };
      mockDbEvents.push({ ...orderCreatedEvent, trackingFlowId: flowId });
      service.broadcastEvent(orderCreatedEvent);

      const paymentEvent: LiveTimelineEvent = {
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
        writeSequence: 2,
      };
      mockDbEvents.push({ ...paymentEvent, trackingFlowId: flowId });
      service.broadcastEvent(paymentEvent);

      const messages = await messagesPromise;
      expect(messages).toHaveLength(3);
      expect((messages[1].data as any).payload.eventType).toBe('order.created');
      expect((messages[1].data as any).payload.writeSequence).toBe(1);
      expect((messages[2].data as any).payload.eventType).toBe('payment.succeeded');
      expect((messages[2].data as any).payload.writeSequence).toBe(2);
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
      prismaMock.trackingEvent.findMany.mockImplementationOnce(async (query: any) => {
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
      expect((messages[1].data as any).payload.writeSequence).toBe(5);
      expect(messages.filter((message) => message.id === missedEventId)).toHaveLength(1);
      subscription.unsubscribe();
    });

    it('should deliver event exactly once when event is present in both replay query and live buffer', async () => {
      const serviceRequestId = randomUUID();
      const customerId = randomUUID();
      const flowId = randomUUID();
      const lastEventId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId,
      });

      prismaMock.trackingEvent.findFirst.mockResolvedValue({
        id: lastEventId,
        writeSequence: 1,
      });

      const duplicateTargetEvent = {
        id: randomUUID(),
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 2,
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.in_progress',
        sourceService: 'order-service',
        fromStatus: 'arrived',
        toStatus: 'in_progress',
        actorUserId: randomUUID(),
        reason: null,
        metadata: {},
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      // Replay query returns duplicateTargetEvent
      prismaMock.trackingEvent.findMany.mockImplementationOnce(async () => {
        // While replay query is executing, live Pub/Sub signal for the SAME event arrives
        service.broadcastEvent({
          serviceRequestId,
          ...duplicateTargetEvent,
        });
        return [duplicateTargetEvent];
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
      const subscription = stream$.subscribe((m) => messages.push(m));

      // Wait a moment for any live drain loop to finish
      await vi.waitFor(() => expect(messages).toHaveLength(2));

      // Must only receive the event once, deduplicated by cursor sequence
      const targetMessages = messages.filter((m) => m.id === duplicateTargetEvent.id);
      expect(targetMessages).toHaveLength(1);
      expect((targetMessages[0].data as any).payload.writeSequence).toBe(2);
      subscription.unsubscribe();
    });

    it('should reorder and deliver events in ascending sequence order when Pub/Sub signals arrive out of order (sequence 2 then 1)', async () => {
      const serviceRequestId = randomUUID();
      const customerId = randomUUID();
      const flowId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId,
      });

      const eventSeq1 = {
        id: randomUUID(),
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 1,
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.created',
        sourceService: 'order-service',
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      const eventSeq2 = {
        id: randomUUID(),
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 2,
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.in_progress',
        sourceService: 'order-service',
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      // Both committed in DB
      mockDbEvents.push(eventSeq1, eventSeq2);

      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const stream$ = await service.getLiveStream(serviceRequestId, user);
      const messages: any[] = [];
      const subscription = stream$.subscribe((m) => messages.push(m));

      // Broadcast out-of-order: sequence 2 arrives BEFORE sequence 1
      service.broadcastEvent({ serviceRequestId, ...eventSeq2 });
      service.broadcastEvent({ serviceRequestId, ...eventSeq1 });

      await vi.waitFor(() => expect(messages).toHaveLength(3));

      // Client must receive them ordered by writeSequence ASC (1 then 2)
      expect(messages[0].data.type).toBe('connected');
      expect((messages[1].data as any).payload.writeSequence).toBe(1);
      expect((messages[1].data as any).payload.eventType).toBe('order.created');
      expect((messages[2].data as any).payload.writeSequence).toBe(2);
      expect((messages[2].data as any).payload.eventType).toBe('order.in_progress');

      subscription.unsubscribe();
    });

    it('should capture events committed during stream registration without gaps or duplicates', async () => {
      const serviceRequestId = randomUUID();
      const customerId = randomUUID();
      const flowId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId,
      });

      // Latest event in DB when stream registration began was sequence 5
      prismaMock.trackingEvent.findFirst.mockResolvedValue({
        id: randomUUID(),
        writeSequence: 5,
      });

      const eventDuringRegistration = {
        id: randomUUID(),
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 6,
        entityType: TrackingEntityType.order,
        entityId: randomUUID(),
        eventType: 'order.in_progress',
        sourceService: 'order-service',
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      // Registration query catches this event
      mockDbEvents.push(eventDuringRegistration);

      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      // Also simulate live signal arriving right as registration completes
      const stream$ = await service.getLiveStream(serviceRequestId, user);
      service.broadcastEvent({ serviceRequestId, ...eventDuringRegistration });

      const messages: any[] = [];
      const subscription = stream$.subscribe((m) => messages.push(m));

      await vi.waitFor(() => expect(messages).toHaveLength(2));
      expect(messages[0].data.type).toBe('connected');
      expect(messages[1].id).toBe(eventDuringRegistration.id);
      expect((messages[1].data as any).payload.writeSequence).toBe(6);

      // Verify no duplicates
      expect(
        messages.filter((m) => m.id === eventDuringRegistration.id),
      ).toHaveLength(1);

      subscription.unsubscribe();
    });

    it('should advance lastDeliveredSequence for permission-shielded events without leaking them', async () => {
      const serviceRequestId = randomUUID();
      const flowId = randomUUID();
      const workerId = randomUUID();
      const otherWorkerId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId: randomUUID(),
      });
      prismaMock.trackingEvent.findFirst.mockResolvedValue({ id: randomUUID() });

      const competitorBid = {
        id: randomUUID(),
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 1,
        entityType: TrackingEntityType.bid,
        entityId: randomUUID(),
        eventType: 'bid.submitted',
        sourceService: 'bidding-service',
        actorUserId: otherWorkerId,
        metadata: { workerId: otherWorkerId },
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      const myProposal = {
        id: randomUUID(),
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 2,
        entityType: TrackingEntityType.booking_proposal,
        entityId: randomUUID(),
        eventType: 'booking_proposal.created',
        sourceService: 'booking-service',
        actorUserId: workerId,
        metadata: { workerId },
        occurredAt: new Date(),
        recordedAt: new Date(),
      };

      mockDbEvents.push(competitorBid, myProposal);

      const user: GatewayUser = {
        userId: workerId,
        roles: ['Worker'],
        isAdmin: false,
        isCustomer: false,
        isWorker: true,
      };

      const stream$ = await service.getLiveStream(serviceRequestId, user);
      const messages: any[] = [];
      const subscription = stream$.subscribe((m) => messages.push(m));

      service.broadcastEvent({ serviceRequestId, ...competitorBid });
      service.broadcastEvent({ serviceRequestId, ...myProposal });

      await vi.waitFor(() => expect(messages).toHaveLength(2));

      // Connected + my proposal (competitor bid strictly filtered out)
      expect(messages[0].data.type).toBe('connected');
      expect(messages[1].id).toBe(myProposal.id);
      expect((messages[1].data as any).payload.writeSequence).toBe(2);

      // Verify competitor bid was never delivered
      expect(messages.some((m) => m.id === competitorBid.id)).toBe(false);

      // Now broadcast another valid event; competitor bid must not be re-evaluated
      const myPayment = {
        id: randomUUID(),
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 3,
        entityType: TrackingEntityType.booking_proposal,
        entityId: randomUUID(),
        eventType: 'booking_proposal.accepted',
        sourceService: 'booking-service',
        actorUserId: workerId,
        metadata: { workerId },
        occurredAt: new Date(),
        recordedAt: new Date(),
      };
      mockDbEvents.push(myPayment);
      service.broadcastEvent({ serviceRequestId, ...myPayment });

      await vi.waitFor(() => expect(messages).toHaveLength(3));
      expect(messages[2].id).toBe(myPayment.id);
      expect((messages[2].data as any).payload.writeSequence).toBe(3);

      subscription.unsubscribe();
    });

    it('should recover missed events via periodic sync when Pub/Sub notification is lost', async () => {
      vi.useFakeTimers();
      try {
        const serviceRequestId = randomUUID();
        const customerId = randomUUID();
        const flowId = randomUUID();

        prismaMock.trackingFlow.findUnique.mockResolvedValue({
          id: flowId,
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
        const messages: any[] = [];
        const subscription = stream$.subscribe((m) => messages.push(m));

        expect(messages).toHaveLength(1); // connected

        // An event commits to DB, but Pub/Sub broadcast fails / is lost (never called)
        const droppedPubSubEvent = {
          id: randomUUID(),
          eventId: randomUUID(),
          trackingFlowId: flowId,
          writeSequence: 1,
          entityType: TrackingEntityType.order,
          entityId: randomUUID(),
          eventType: 'order.in_progress',
          sourceService: 'order-service',
          occurredAt: new Date(),
          recordedAt: new Date(),
        };
        mockDbEvents.push(droppedPubSubEvent);

        // Advance timer to trigger 5s periodic sync
        await vi.advanceTimersByTimeAsync(5000);

        // Periodic sync triggers drainLiveEvents, recovering dropped event
        expect(messages.some((m) => m.id === droppedPubSubEvent.id)).toBe(true);

        const recoveredMsg = messages.find((m) => m.id === droppedPubSubEvent.id);
        expect(recoveredMsg).toBeDefined();
        expect((recoveredMsg!.data as any).payload.writeSequence).toBe(1);

        subscription.unsubscribe();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should recover missed events across replicas when Redis publish fails on Replica B and SSE is on Replica A', async () => {
      vi.useFakeTimers();
      try {
        const serviceRequestId = randomUUID();
        const customerId = randomUUID();
        const flowId = randomUUID();

        prismaMock.trackingFlow.findUnique.mockResolvedValue({
          id: flowId,
          serviceRequestId,
          customerId,
        });

        // Replica A: SSE Server where client connects
        const redisMockA: any = {
          subscribe: vi.fn().mockResolvedValue(async () => {}),
          publishStrict: vi.fn(),
        };
        const replicaA = new TimelineStreamService(
          prismaMock as unknown as PrismaService,
          redisMockA as unknown as RedisService,
        );

        // Replica B: Ingestion Server where event commits
        const redisMockB: any = {
          subscribe: vi.fn().mockResolvedValue(async () => {}),
          publishStrict: vi
            .fn()
            .mockRejectedValue(new Error('Redis connection lost on publish')),
        };
        const replicaB = new TimelineStreamService(
          prismaMock as unknown as PrismaService,
          redisMockB as unknown as RedisService,
        );

        const user: GatewayUser = {
          userId: customerId,
          roles: ['Customer'],
          isAdmin: false,
          isCustomer: true,
          isWorker: false,
        };

        // Client connects to Replica A
        const stream$ = await replicaA.getLiveStream(serviceRequestId, user);
        const messages: any[] = [];
        const subscription = stream$.subscribe((m) => messages.push(m));

        expect(messages).toHaveLength(1); // initial 'connected'

        // Replica B commits event to DB
        const eventRecordedOnB: LiveTimelineEvent = {
          serviceRequestId,
          id: randomUUID(),
          eventId: randomUUID(),
          entityType: TrackingEntityType.order,
          entityId: randomUUID(),
          eventType: 'order.in_progress',
          sourceService: 'order-service',
          occurredAt: new Date(),
          recordedAt: new Date(),
          writeSequence: 1,
        };
        mockDbEvents.push({ ...eventRecordedOnB, trackingFlowId: flowId });

        // Replica B attempts to broadcast, but publish fails!
        // broadcastEvent must not throw, must fallback cleanly
        await expect(replicaB.broadcastEvent(eventRecordedOnB)).resolves.toBeUndefined();

        // Replica A received no Redis message. Client on A has not received it yet.
        expect(messages).toHaveLength(1);

        // Advance 5s timer for Replica A's periodic DB sync
        await vi.advanceTimersByTimeAsync(5000);

        // Client on Replica A receives eventRecordedOnB from DB exactly once
        expect(messages).toHaveLength(2);
        expect(messages[1].id).toBe(eventRecordedOnB.id);
        expect((messages[1].data as any).payload.writeSequence).toBe(1);

        subscription.unsubscribe();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should deliver event on Replica A when Replica B commits to DB but crashes before broadcast', async () => {
      vi.useFakeTimers();
      try {
        const serviceRequestId = randomUUID();
        const customerId = randomUUID();
        const flowId = randomUUID();

        prismaMock.trackingFlow.findUnique.mockResolvedValue({
          id: flowId,
          serviceRequestId,
          customerId,
        });

        const replicaA = new TimelineStreamService(
          prismaMock as unknown as PrismaService,
        );

        const user: GatewayUser = {
          userId: customerId,
          roles: ['Customer'],
          isAdmin: false,
          isCustomer: true,
          isWorker: false,
        };

        const stream$ = await replicaA.getLiveStream(serviceRequestId, user);
        const messages: any[] = [];
        const subscription = stream$.subscribe((m) => messages.push(m));

        // Event committed to PostgreSQL by Replica B, but process crashes before broadcastEvent
        const crashedEvent = {
          id: randomUUID(),
          eventId: randomUUID(),
          trackingFlowId: flowId,
          writeSequence: 1,
          entityType: TrackingEntityType.order,
          entityId: randomUUID(),
          eventType: 'order.created',
          sourceService: 'order-service',
          occurredAt: new Date(),
          recordedAt: new Date(),
        };
        mockDbEvents.push(crashedEvent);

        // Advance Replica A timer (5s periodic sync)
        await vi.advanceTimersByTimeAsync(5000);

        expect(messages).toHaveLength(2);
        expect(messages[1].id).toBe(crashedEvent.id);
        expect((messages[1].data as any).payload.writeSequence).toBe(1);

        subscription.unsubscribe();
      } finally {
        vi.useRealTimers();
      }
    });

    it('should trigger immediate catch-up drain on active streams when Redis subscriber reconnects', async () => {
      const serviceRequestId = randomUUID();
      const customerId = randomUUID();
      const flowId = randomUUID();

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: flowId,
        serviceRequestId,
        customerId,
      });

      let reconnectCallback: (() => void) | undefined;
      const redisMock: any = {
        subscribe: vi.fn().mockImplementation(
          async (_chan: string, _onMsg: any, onReconnect?: () => void) => {
            reconnectCallback = onReconnect;
            return async () => {};
          },
        ),
        publishStrict: vi.fn(),
      };

      const replica = new TimelineStreamService(
        prismaMock as unknown as PrismaService,
        redisMock as unknown as RedisService,
      );

      // Initialize Redis subscription
      await replica.onModuleInit();
      expect(redisMock.subscribe).toHaveBeenCalledTimes(1);

      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const stream$ = await replica.getLiveStream(serviceRequestId, user);
      const messages: any[] = [];
      const subscription = stream$.subscribe((m) => messages.push(m));

      expect(messages).toHaveLength(1); // connected

      // An event is committed while Redis is down
      const missedWhileDisconnected = {
        id: randomUUID(),
        eventId: randomUUID(),
        trackingFlowId: flowId,
        writeSequence: 1,
        entityType: TrackingEntityType.payment,
        entityId: randomUUID(),
        eventType: 'payment.succeeded',
        sourceService: 'payment-service',
        occurredAt: new Date(),
        recordedAt: new Date(),
      };
      mockDbEvents.push(missedWhileDisconnected);

      // Simulate Redis subscriber reconnecting
      expect(reconnectCallback).toBeDefined();
      reconnectCallback!();

      // Active streams must be immediately drained and missed event delivered without delay
      await vi.waitFor(() => expect(messages).toHaveLength(2));
      expect(messages[1].id).toBe(missedWhileDisconnected.id);
      expect((messages[1].data as any).payload.eventType).toBe('payment.succeeded');
      expect((messages[1].data as any).payload.writeSequence).toBe(1);

      subscription.unsubscribe();
      await replica.onModuleDestroy();
    });
  });
});
