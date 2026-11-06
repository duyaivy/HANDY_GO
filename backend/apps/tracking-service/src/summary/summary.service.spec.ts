import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { TrackingEntityType } from '@prisma/tracking-client';
import { SummaryService } from './summary.service.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';
import type { GatewayUser } from '../common/security/tracking-security.util.js';

describe('SummaryService', () => {
  let service: SummaryService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      trackingFlow: {
        findUnique: vi.fn(),
      },
    };

    service = new SummaryService(prismaMock as unknown as PrismaService);
  });

  it('should generate accurate summary and COMPLETED phase for a full lifecycle flow', async () => {
    const customerId = randomUUID();
    const serviceRequestId = randomUUID();
    const orderId = randomUUID();
    const proposalId = randomUUID();
    const workerId = randomUUID();
    const flowId = randomUUID();

    const user: GatewayUser = {
      userId: customerId,
      roles: ['Customer'],
      isAdmin: false,
      isCustomer: true,
      isWorker: false,
    };

    const now = new Date();

    prismaMock.trackingFlow.findUnique.mockResolvedValue({
      id: flowId,
      serviceRequestId,
      orderId,
      customerId,
      createdAt: now,
      updatedAt: now,
      events: [
        {
          eventType: 'service_request.created',
          entityType: TrackingEntityType.service_request,
          entityId: serviceRequestId,
          occurredAt: new Date(now.getTime() - 600000),
          metadata: {},
        },
        {
          eventType: 'service_request.published',
          entityType: TrackingEntityType.service_request,
          entityId: serviceRequestId,
          occurredAt: new Date(now.getTime() - 500000),
          metadata: {},
        },
        {
          eventType: 'matching.completed',
          entityType: TrackingEntityType.matching,
          entityId: randomUUID(),
          occurredAt: new Date(now.getTime() - 450000),
          metadata: { matchCount: 3 },
        },
        {
          eventType: 'bidding.round.opened',
          entityType: TrackingEntityType.bidding_round,
          entityId: randomUUID(),
          occurredAt: new Date(now.getTime() - 400000),
          metadata: {},
        },
        {
          eventType: 'bid.submitted',
          entityType: TrackingEntityType.bid,
          entityId: randomUUID(),
          actorUserId: workerId,
          occurredAt: new Date(now.getTime() - 350000),
          metadata: { amount: 400000, workerId },
        },
        {
          eventType: 'bidding.round.closed',
          entityType: TrackingEntityType.bidding_round,
          entityId: randomUUID(),
          occurredAt: new Date(now.getTime() - 300000),
          metadata: {},
        },
        {
          eventType: 'booking_proposal.finalized',
          entityType: TrackingEntityType.booking_proposal,
          entityId: proposalId,
          actorUserId: workerId,
          occurredAt: new Date(now.getTime() - 250000),
          metadata: { workerId, price: 400000, revisionNo: 1 },
        },
        {
          eventType: 'order.created',
          entityType: TrackingEntityType.order,
          entityId: orderId,
          occurredAt: new Date(now.getTime() - 200000),
          toStatus: 'created',
          metadata: { orderId, workerId },
        },
        {
          eventType: 'order.completed',
          entityType: TrackingEntityType.order,
          entityId: orderId,
          occurredAt: new Date(now.getTime() - 100000),
          toStatus: 'completed',
          metadata: {},
        },
        {
          eventType: 'payment.succeeded',
          entityType: TrackingEntityType.payment,
          entityId: randomUUID(),
          occurredAt: now,
          metadata: {},
        },
      ],
    });

    const summary = await service.getRequestSummary(serviceRequestId, user);

    expect(summary.currentPhase).toBe('COMPLETED');
    expect(summary.serviceRequest.status).toBe('open_for_bidding');
    expect(summary.matching.status).toBe('completed');
    expect(summary.matching.matchCount).toBe(3);
    expect(summary.bidding.status).toBe('closed');
    expect(summary.bidding.bidCount).toBe(1);
    expect(summary.bookingProposal?.status).toBe('finalized');
    expect(summary.order?.status).toBe('completed');
    expect(summary.payment?.status).toBe('succeeded');
    expect(summary.totalEvents).toBe(10);
  });

  it('should initialize tracking flow and compute DRAFT phase when request is in draft status', async () => {
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

    const now = new Date();

    prismaMock.trackingFlow.findUnique.mockResolvedValue({
      id: flowId,
      serviceRequestId,
      orderId: null,
      customerId,
      createdAt: now,
      updatedAt: now,
      events: [
        {
          eventType: 'service_request.created',
          entityType: TrackingEntityType.service_request,
          entityId: serviceRequestId,
          occurredAt: now,
          actorUserId: customerId,
          metadata: { status: 'draft' },
        },
      ],
    });

    const summary = await service.getRequestSummary(serviceRequestId, user);

    expect(summary.currentPhase).toBe('DRAFT');
    expect(summary.serviceRequest.status).toBe('draft');
    expect(summary.bidding.status).toBe('idle');
    expect(summary.order).toBeUndefined();
  });

  it('should isolate worker private bids when another worker views the summary', async () => {
    const customerId = randomUUID();
    const serviceRequestId = randomUUID();
    const worker1 = randomUUID();
    const worker2 = randomUUID();
    const flowId = randomUUID();

    const workerUser: GatewayUser = {
      userId: worker1,
      roles: ['Worker'],
      isAdmin: false,
      isCustomer: false,
      isWorker: true,
    };

    prismaMock.trackingFlow.findUnique.mockResolvedValue({
      id: flowId,
      serviceRequestId,
      customerId,
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [
        {
          eventType: 'service_request.published',
          entityType: TrackingEntityType.service_request,
          entityId: serviceRequestId,
          occurredAt: new Date(),
          metadata: {},
        },
        // Worker 1 bid
        {
          eventType: 'bid.submitted',
          entityType: TrackingEntityType.bid,
          entityId: randomUUID(),
          actorUserId: worker1,
          toStatus: 'active',
          occurredAt: new Date(),
          metadata: { amount: 350000, workerId: worker1 },
        },
        // Competitor worker 2 bid
        {
          eventType: 'bid.submitted',
          entityType: TrackingEntityType.bid,
          entityId: randomUUID(),
          actorUserId: worker2,
          toStatus: 'active',
          occurredAt: new Date(),
          metadata: { amount: 280000, workerId: worker2 },
        },
        // Proposal with competitor worker 2
        {
          eventType: 'booking_proposal.created',
          entityType: TrackingEntityType.booking_proposal,
          entityId: randomUUID(),
          actorUserId: customerId,
          occurredAt: new Date(),
          metadata: { workerId: worker2, price: 280000 },
        },
      ],
    });

    const summary = await service.getRequestSummary(
      serviceRequestId,
      workerUser,
    );

    // Total bid count is 2
    expect(summary.bidding.bidCount).toBe(2);
    // Worker 1 only sees their own bid info
    expect(summary.bidding.myBid?.amount).toBe(350000);
    // Proposal was with worker 2, so worker 1 must NOT see proposal details
    expect(summary.bookingProposal).toBeUndefined();
  });

  it('should not leak order or payment milestones to a worker who participated in a rejected proposal but was not assigned to the order', async () => {
    const customerId = randomUUID();
    const serviceRequestId = randomUUID();
    const rejectedWorker = randomUUID();
    const assignedWorker = randomUUID();
    const flowId = randomUUID();
    const orderId = randomUUID();

    const workerUser: GatewayUser = {
      userId: rejectedWorker,
      roles: ['Worker'],
      isAdmin: false,
      isCustomer: false,
      isWorker: true,
    };

    prismaMock.trackingFlow.findUnique.mockResolvedValue({
      id: flowId,
      serviceRequestId,
      orderId,
      customerId,
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [
        {
          eventType: 'service_request.published',
          entityType: TrackingEntityType.service_request,
          entityId: serviceRequestId,
          occurredAt: new Date(),
          metadata: {},
        },
        // Rejected proposal with rejectedWorker
        {
          eventType: 'booking_proposal.rejected',
          entityType: TrackingEntityType.booking_proposal,
          entityId: randomUUID(),
          actorUserId: rejectedWorker,
          occurredAt: new Date(),
          metadata: { workerId: rejectedWorker, price: 300000 },
        },
        // Finalized proposal with assignedWorker
        {
          eventType: 'booking_proposal.finalized',
          entityType: TrackingEntityType.booking_proposal,
          entityId: randomUUID(),
          actorUserId: customerId,
          occurredAt: new Date(),
          metadata: { workerId: assignedWorker, price: 250000 },
        },
        // Order created for assignedWorker
        {
          eventType: 'order.created',
          entityType: TrackingEntityType.order,
          entityId: orderId,
          actorUserId: assignedWorker,
          occurredAt: new Date(),
          metadata: { workerId: assignedWorker, workerUserId: assignedWorker },
        },
        // Payment succeeded
        {
          eventType: 'payment.succeeded',
          entityType: TrackingEntityType.payment,
          entityId: randomUUID(),
          occurredAt: new Date(),
          metadata: { orderId },
        },
      ],
    });

    const summary = await service.getRequestSummary(
      serviceRequestId,
      workerUser,
    );

    // Rejected worker has participation rights to view the flow, but must NOT see the order or payment of the assigned worker
    expect(summary.order).toBeUndefined();
    expect(summary.payment).toBeUndefined();
  });

  it('should throw ForbiddenException if unauthorized customer tries to view summary', async () => {
    const ownerId = randomUUID();
    const intruderId = randomUUID();
    const serviceRequestId = randomUUID();

    const user: GatewayUser = {
      userId: intruderId,
      roles: ['Customer'],
      isAdmin: false,
      isCustomer: true,
      isWorker: false,
    };

    prismaMock.trackingFlow.findUnique.mockResolvedValue({
      id: randomUUID(),
      serviceRequestId,
      customerId: ownerId,
      events: [],
    });

    await expect(
      service.getRequestSummary(serviceRequestId, user),
    ).rejects.toThrow(ForbiddenException);
  });

  describe('Redis Caching', () => {
    it('should return cached summary immediately if present in Redis', async () => {
      const serviceRequestId = randomUUID();
      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Admin'],
        isAdmin: true,
        isCustomer: false,
        isWorker: false,
      };

      const cachedData = {
        flowId: randomUUID(),
        serviceRequestId,
        currentPhase: 'COMPLETED',
      } as any;

      const redisMock: any = {
        get: vi.fn().mockResolvedValue(cachedData),
        set: vi.fn(),
      };

      const cachedService = new SummaryService(prismaMock, redisMock);
      const result = await cachedService.getRequestSummary(
        serviceRequestId,
        user,
      );

      expect(result).toBe(cachedData);
      expect(redisMock.get).toHaveBeenCalledWith(
        `tracking:summary:${serviceRequestId}:admin`,
      );
      // DB should not be called on cache hit
      expect(prismaMock.trackingFlow.findUnique).not.toHaveBeenCalled();
    });

    it('should cache summary in Redis with TTL when currentPhase is COMPLETED', async () => {
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

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
        createdAt: new Date(),
        updatedAt: new Date(),
        events: [
          {
            eventType: 'order.created',
            entityType: TrackingEntityType.order,
            entityId: randomUUID(),
            occurredAt: new Date(),
          },
          {
            eventType: 'order.completed',
            entityType: TrackingEntityType.order,
            entityId: randomUUID(),
            occurredAt: new Date(),
          },
          {
            eventType: 'payment.succeeded',
            entityType: TrackingEntityType.payment,
            entityId: randomUUID(),
            occurredAt: new Date(),
          },
        ],
      });

      const cachedService = new SummaryService(prismaMock, redisMock);
      const _result = await cachedService.getRequestSummary(
        serviceRequestId,
        user,
      );

      expect(redisMock.set).toHaveBeenCalledWith(
        `tracking:summary:${serviceRequestId}:cust:${customerId}`,
        expect.objectContaining({ currentPhase: 'COMPLETED' }),
        7 * 24 * 3600,
      );
    });

    it('should throw ForbiddenException if flow has null customerId (fail-closed)', async () => {
      const serviceRequestId = randomUUID();
      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId: null,
        events: [],
      });

      await expect(
        service.getRequestSummary(serviceRequestId, user),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should accurately compute ORDER_IN_PROGRESS and DISPUTED phases', async () => {
      const customerId = randomUUID();
      const serviceRequestId = randomUUID();
      const orderId = randomUUID();
      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      // 1. Order in progress
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
        orderId,
        createdAt: new Date(),
        updatedAt: new Date(),
        events: [
          {
            eventType: 'order.created',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(),
            toStatus: 'created',
          },
          {
            eventType: 'order.started',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(),
          },
        ],
      });

      const inProgressSummary = await service.getRequestSummary(
        serviceRequestId,
        user,
      );
      expect(inProgressSummary.currentPhase).toBe('ORDER_IN_PROGRESS');
      expect(inProgressSummary.order?.status).toBe('in_progress');

      // 2. Order disputed
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
        orderId,
        createdAt: new Date(),
        updatedAt: new Date(),
        events: [
          {
            eventType: 'order.created',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(),
            toStatus: 'created',
          },
          {
            eventType: 'order.status.changed',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(),
            toStatus: 'disputed',
          },
        ],
      });

      const disputedSummary = await service.getRequestSummary(
        serviceRequestId,
        user,
      );
      expect(disputedSummary.currentPhase).toBe('DISPUTED');
      expect(disputedSummary.order?.status).toBe('disputed');

      // 3. Order status changed with exact Order Service payload { previousStatus, nextStatus }
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
        orderId,
        createdAt: new Date(),
        updatedAt: new Date(),
        events: [
          {
            eventType: 'order.created',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(),
            toStatus: 'created',
          },
          {
            eventType: 'order.status.changed',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(),
            fromStatus: 'confirmed',
            toStatus: 'in_progress',
            metadata: {
              previousStatus: 'confirmed',
              nextStatus: 'in_progress',
              orderId,
            },
          },
        ],
      });

      const nextStatusSummary = await service.getRequestSummary(
        serviceRequestId,
        user,
      );
      expect(nextStatusSummary.currentPhase).toBe('ORDER_IN_PROGRESS');
      expect(nextStatusSummary.order?.status).toBe('in_progress');
    });

    it('should transition to ORDER_IN_PROGRESS and record reworkReason when rework is requested', async () => {
      const customerId = randomUUID();
      const serviceRequestId = randomUUID();
      const orderId = randomUUID();
      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
        orderId,
        createdAt: new Date(),
        updatedAt: new Date(),
        events: [
          {
            eventType: 'order.created',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(Date.now() - 30000),
            toStatus: 'created',
          },
          {
            eventType: 'order.finished',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(Date.now() - 20000),
            toStatus: 'awaiting_customer_confirmation',
          },
          {
            eventType: 'order.status.changed',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(Date.now() - 10000),
            fromStatus: 'finished',
            toStatus: 'in_progress',
            reason: 'Vòi nước vẫn còn rò rỉ sau khi sửa',
            metadata: {
              previousStatus: 'finished',
              nextStatus: 'in_progress',
              reworkReason: 'Vòi nước vẫn còn rò rỉ sau khi sửa',
              notificationKind: 'rework_requested',
            },
          },
        ],
      });

      const summary = await service.getRequestSummary(serviceRequestId, user);
      expect(summary.currentPhase).toBe('ORDER_IN_PROGRESS');
      expect(summary.order?.status).toBe('in_progress');
      expect(summary.order?.reworkReason).toBe(
        'Vòi nước vẫn còn rò rỉ sau khi sửa',
      );
    });

    it('should compute DISPUTED phase and record disputeReason when dispute is filed', async () => {
      const customerId = randomUUID();
      const serviceRequestId = randomUUID();
      const orderId = randomUUID();
      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
        orderId,
        createdAt: new Date(),
        updatedAt: new Date(),
        events: [
          {
            eventType: 'order.created',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(Date.now() - 30000),
            toStatus: 'created',
          },
          {
            eventType: 'order.disputed',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(Date.now() - 10000),
            toStatus: 'disputed',
            reason: 'Thợ không đến đúng hẹn và làm hỏng tường',
            metadata: {
              disputeReason: 'Thợ không đến đúng hẹn và làm hỏng tường',
            },
          },
        ],
      });

      const summary = await service.getRequestSummary(serviceRequestId, user);
      expect(summary.currentPhase).toBe('DISPUTED');
      expect(summary.order?.status).toBe('disputed');
      expect(summary.order?.disputeReason).toBe(
        'Thợ không đến đúng hẹn và làm hỏng tường',
      );
    });

    it('should accurately compute phase when dispute is resolved by Admin', async () => {
      const customerId = randomUUID();
      const serviceRequestId = randomUUID();
      const orderId = randomUUID();
      const user: GatewayUser = {
        userId: customerId,
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      // 1. Resolved with resume_previous_state -> ORDER_IN_PROGRESS
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
        orderId,
        createdAt: new Date(),
        updatedAt: new Date(),
        events: [
          {
            eventType: 'order.created',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(Date.now() - 30000),
            toStatus: 'created',
          },
          {
            eventType: 'order.status.changed',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(Date.now() - 20000),
            toStatus: 'disputed',
          },
          {
            eventType: 'order.status.changed',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(Date.now() - 10000),
            fromStatus: 'disputed',
            toStatus: 'in_progress',
            reason: 'Hòa giải thành công',
            metadata: {
              previousStatus: 'disputed',
              nextStatus: 'in_progress',
              resolution: 'resume_previous_state',
            },
          },
        ],
      });

      const resumedSummary = await service.getRequestSummary(
        serviceRequestId,
        user,
      );
      expect(resumedSummary.currentPhase).toBe('ORDER_IN_PROGRESS');
      expect(resumedSummary.order?.status).toBe('in_progress');

      // 2. Resolved with cancel -> CANCELLED
      prismaMock.trackingFlow.findUnique.mockResolvedValue({
        id: randomUUID(),
        serviceRequestId,
        customerId,
        orderId,
        createdAt: new Date(),
        updatedAt: new Date(),
        events: [
          {
            eventType: 'order.status.changed',
            entityType: TrackingEntityType.order,
            entityId: orderId,
            occurredAt: new Date(Date.now() - 10000),
            fromStatus: 'disputed',
            toStatus: 'cancelled',
            metadata: {
              previousStatus: 'disputed',
              nextStatus: 'cancelled',
              resolution: 'cancel',
            },
          },
        ],
      });

      const cancelledSummary = await service.getRequestSummary(
        serviceRequestId,
        user,
      );
      expect(cancelledSummary.currentPhase).toBe('CANCELLED');
      expect(cancelledSummary.order?.status).toBe('cancelled');
    });
  });
});
