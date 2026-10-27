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
});
