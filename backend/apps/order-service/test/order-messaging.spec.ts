import { describe, expect, it, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createRabbitMQOptions,
  RABBITMQ_QUEUES,
  RABBITMQ_EXCHANGE,
} from '@app/rabbitmq';
import { PaymentEventsConsumer } from '../src/consumers/payment-events.consumer.js';
import { OrderOutboxPublisherService } from '../src/common/outbox/order-outbox-publisher.service.js';
import { ORDER_CONSTANTS } from '../src/common/constants/order.constants.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { BookingProposalsService } from '../src/booking-proposals/booking-proposals.service.js';
import {
  RequestStatus,
  BookingProposalStatus,
  WorkerSelectionSource,
  Prisma,
} from '@prisma/order-client';
import {
  validateNotificationEvent,
} from '../../notification-service/src/events/event-contracts.js';
import {
  NotificationRouter,
} from '../../notification-service/src/events/notification-router.js';
import { RoundsService } from '../../bidding-service/src/rounds/rounds.service.js';

describe('D3 — Messaging and Integration Suite (BE-04, BE-05, BE-06, BE-07, BE-11a, BE-11b)', () => {
  const CUSTOMER_ID = randomUUID();
  const WORKER_ID = randomUUID();
  const REQUEST_ID = randomUUID();
  const PROPOSAL_ID = randomUUID();
  const ORDER_ID = randomUUID();
  const BID_ID = randomUUID();

  const notificationRouter = new NotificationRouter();

  // ─────────────────────────────────────────────────────────────
  // 1. BE-04: Entrypoint RMQ Microservice Options & Topology
  // ─────────────────────────────────────────────────────────────
  describe('BE-04: RMQ Listener Options & Topology', () => {
    it('should configure Order Queue with durable queue, manual ACK, prefetch and topic exchange', () => {
      const options = createRabbitMQOptions(RABBITMQ_QUEUES.ORDER, 10);

      expect(options.transport).toBeDefined();
      expect(options.options.queue).toBe('order-service');
      expect(options.options.prefetchCount).toBe(10);
      expect(options.options.noAck).toBe(false); // Manual ACK required for reliability
      expect(options.options.queueOptions.durable).toBe(true);
      expect(options.options.exchange).toBe(RABBITMQ_EXCHANGE);
      expect(options.options.exchangeType).toBe('topic');
      expect(options.options.wildcards).toBe(true);
      expect(options.options.persistent).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. BE-05: PaymentEventsConsumer Transactional Inbox & ACK/NACK
  // ─────────────────────────────────────────────────────────────
  describe('BE-05: Payment Events Consumer', () => {
    let consumer: PaymentEventsConsumer;
    let prismaMock: any;
    let consumedRepoMock: any;
    let channelMock: any;
    let contextMock: any;
    const originalMsg = { fields: { deliveryTag: 1 } };

    beforeEach(() => {
      channelMock = {
        ack: vi.fn(),
        nack: vi.fn(),
      };
      contextMock = {
        getChannelRef: vi.fn().mockReturnValue(channelMock),
        getMessage: vi.fn().mockReturnValue(originalMsg),
      };

      prismaMock = {
        $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
        order: {
          update: vi.fn(),
        },
      };

      consumedRepoMock = {
        recordEventIfNew: vi.fn(),
      };

      consumer = new PaymentEventsConsumer(prismaMock, consumedRepoMock);
    });

    it('should update paymentState to paid within same transaction and ACK after commit', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(true);
      prismaMock.order.update.mockResolvedValue({ id: ORDER_ID, paymentState: 'paid' });

      await consumer.handlePaymentSucceeded(
        { eventId: 'evt-pay-1', orderId: ORDER_ID },
        contextMock,
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(consumedRepoMock.recordEventIfNew).toHaveBeenCalledWith(
        'evt-pay-1',
        ORDER_CONSTANTS.EVENT_PAYMENT_SUCCEEDED,
        prismaMock,
      );
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { paymentState: 'paid' },
      });
      expect(channelMock.ack).toHaveBeenCalledWith(originalMsg);
      expect(channelMock.nack).not.toHaveBeenCalled();
    });

    it('should update paymentState to failed within same transaction and ACK after commit', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(true);
      prismaMock.order.update.mockResolvedValue({ id: ORDER_ID, paymentState: 'failed' });

      await consumer.handlePaymentFailed(
        { eventId: 'evt-pay-2', payload: { orderId: ORDER_ID } },
        contextMock,
      );

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(consumedRepoMock.recordEventIfNew).toHaveBeenCalledWith(
        'evt-pay-2',
        ORDER_CONSTANTS.EVENT_PAYMENT_FAILED,
        prismaMock,
      );
      expect(prismaMock.order.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: { paymentState: 'failed' },
      });
      expect(channelMock.ack).toHaveBeenCalledWith(originalMsg);
      expect(channelMock.nack).not.toHaveBeenCalled();
    });

    it('should ACK valid duplicate events without updating order', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(false);

      await consumer.handlePaymentSucceeded(
        { eventId: 'evt-dup-1', orderId: ORDER_ID },
        contextMock,
      );

      expect(prismaMock.order.update).not.toHaveBeenCalled();
      expect(channelMock.ack).toHaveBeenCalledWith(originalMsg);
      expect(channelMock.nack).not.toHaveBeenCalled();
    });

    it('should rollback transaction and NACK with requeue when database error occurs', async () => {
      consumedRepoMock.recordEventIfNew.mockResolvedValue(true);
      prismaMock.order.update.mockRejectedValue(new Error('Connection failure'));

      await expect(
        consumer.handlePaymentSucceeded(
          { eventId: 'evt-err-1', orderId: ORDER_ID },
          contextMock,
        ),
      ).rejects.toThrow('Connection failure');

      expect(channelMock.nack).toHaveBeenCalledWith(originalMsg, false, true); // requeue = true
      expect(channelMock.ack).not.toHaveBeenCalled();
    });

    it('should reject poison pill without requeue when eventId is missing (no Date.now() generation)', async () => {
      await consumer.handlePaymentSucceeded(
        { orderId: ORDER_ID },
        contextMock,
      );

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(channelMock.nack).toHaveBeenCalledWith(originalMsg, false, false); // requeue = false
      expect(channelMock.ack).not.toHaveBeenCalled();
    });

    it('should reject poison pill without requeue when orderId is missing', async () => {
      await consumer.handlePaymentSucceeded(
        { eventId: 'evt-no-order' },
        contextMock,
      );

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
      expect(channelMock.nack).toHaveBeenCalledWith(originalMsg, false, false); // requeue = false
      expect(channelMock.ack).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. BE-06: Envelope Wrapping & Retry Preservation
  // ─────────────────────────────────────────────────────────────
  describe('BE-06: Order Outbox Publisher Envelope', () => {
    let publisher: OrderOutboxPublisherService;
    let repoMock: any;
    let rabbitmqMock: any;

    beforeEach(() => {
      repoMock = {
        findPendingEvents: vi.fn(),
        markPublished: vi.fn(),
        scheduleRetry: vi.fn(),
        markFailed: vi.fn(),
        scheduleDlqRetry: vi.fn(),
      };
      rabbitmqMock = {
        emit: vi.fn().mockResolvedValue(undefined),
      };
      publisher = new OrderOutboxPublisherService(repoMock, rabbitmqMock);
    });

    it('should wrap outbox event with Notification envelope and pass validateNotificationEvent', async () => {
      const fixedEventId = randomUUID();
      const fixedCreatedAt = new Date('2026-10-27T10:00:00.000Z');
      const eventRecord = {
        id: fixedEventId,
        aggregateType: 'Order',
        aggregateId: ORDER_ID,
        eventType: 'order.created',
        eventVersion: 1,
        payload: {
          orderId: ORDER_ID,
          customerId: CUSTOMER_ID,
          workerId: WORKER_ID,
          orderCode: 'ORD-20261027-0001',
        },
        status: 'pending',
        retryCount: 0,
        createdAt: fixedCreatedAt,
      };

      repoMock.findPendingEvents.mockResolvedValue([eventRecord]);

      await publisher.publishPendingEvents();

      expect(rabbitmqMock.emit).toHaveBeenCalledTimes(1);
      const [emittedPattern, emittedEnvelope] = rabbitmqMock.emit.mock.calls[0];

      expect(emittedPattern).toBe('order.created');
      expect(emittedEnvelope.eventId).toBe(fixedEventId);
      expect(emittedEnvelope.source).toBe('order-service');
      expect(emittedEnvelope.producer).toBe('order-service');
      expect(emittedEnvelope.occurredAt).toBe('2026-10-27T10:00:00.000Z');
      expect(emittedEnvelope.payload).toEqual(eventRecord.payload);
      expect(emittedEnvelope.data).toEqual(eventRecord.payload);

      // Verify contract compatibility with Notification Service validator
      const validated = validateNotificationEvent(emittedEnvelope, 'order.created');
      expect(validated.eventId).toBe(fixedEventId.toLowerCase());
      expect(validated.eventType).toBe('order.created');
      expect(validated.source).toBe('order-service');
      expect(validated.data.orderId).toBe(ORDER_ID.toLowerCase());
      expect(validated.data.customerId).toBe(CUSTOMER_ID.toLowerCase());
      expect(validated.data.workerId).toBe(WORKER_ID.toLowerCase());
    });

    it('should preserve eventId and occurredAt across retries', async () => {
      const fixedEventId = randomUUID();
      const fixedCreatedAt = new Date('2026-10-27T08:30:00.000Z');
      const eventRecord = {
        id: fixedEventId,
        eventType: 'order.confirmed',
        eventVersion: 1,
        payload: { orderId: ORDER_ID },
        createdAt: fixedCreatedAt,
        retryCount: 2,
      };

      const envelope1 = publisher.buildEnvelope(eventRecord);
      const envelope2 = publisher.buildEnvelope({
        ...eventRecord,
        retryCount: 3, // next retry attempt
      });

      expect(envelope1.eventId).toBe(fixedEventId);
      expect(envelope2.eventId).toBe(fixedEventId);
      expect(envelope1.occurredAt).toBe('2026-10-27T08:30:00.000Z');
      expect(envelope2.occurredAt).toBe('2026-10-27T08:30:00.000Z');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. BE-07: Bidding Service Compatibility
  // ─────────────────────────────────────────────────────────────
  describe('BE-07: Order.created compatibility with Bidding Service', () => {
    it('should properly finalize Bidding round and reject other bids when order is from bid', async () => {
      const roundId = randomUUID();
      const winningBidId = randomUUID();
      const otherBidId = randomUUID();

      const bids = new Map<string, any>([
        [
          winningBidId,
          {
            id: winningBidId,
            biddingRoundId: roundId,
            serviceRequestId: REQUEST_ID,
            workerId: WORKER_ID,
            status: 'active',
          },
        ],
        [
          otherBidId,
          {
            id: otherBidId,
            biddingRoundId: roundId,
            serviceRequestId: REQUEST_ID,
            workerId: randomUUID(),
            status: 'active',
          },
        ],
      ]);

      const round = {
        id: roundId,
        serviceRequestId: REQUEST_ID,
        status: 'open',
      };

      const txMock: any = {
        biddingRound: {
          findUnique: vi.fn(async () => round),
          update: vi.fn(async ({ data }: any) => Object.assign(round, data)),
        },
        bid: {
          findUnique: vi.fn(async ({ where }: any) => bids.get(where.id)),
          update: vi.fn(async ({ where, data }: any) => {
            const b = bids.get(where.id);
            Object.assign(b, data);
            return b;
          }),
          updateMany: vi.fn(async ({ where, data }: any) => {
            let count = 0;
            for (const b of bids.values()) {
              if (where.id?.not && b.id === where.id.not) continue;
              if (where.status && b.status !== where.status) continue;
              Object.assign(b, data);
              count++;
            }
            return { count };
          }),
        },
        outboxEvent: {
          create: vi.fn().mockResolvedValue({ id: randomUUID() }),
        },
      };

      const prismaBiddingMock: any = {
        $transaction: vi.fn(async (cb: any) => cb(txMock)),
        biddingRound: txMock.biddingRound,
      };

      const roundsService = new RoundsService(prismaBiddingMock);

      // Simulate finalizeRound triggered by order.created
      await roundsService.finalizeRound({
        serviceRequestId: REQUEST_ID,
        orderId: ORDER_ID,
        selectedBidId: winningBidId,
        winningWorkerId: WORKER_ID,
        eventId: randomUUID(),
      });

      expect(round.status).toBe('finalized');
      expect(bids.get(winningBidId).status).toBe('selected');
      expect(bids.get(otherBidId).status).toBe('rejected');
    });

    it('should reject all active bids and keep selectedBidId as null when order is from recommendation', async () => {
      const roundId = randomUUID();
      const bid1 = randomUUID();
      const bid2 = randomUUID();

      const bids = new Map<string, any>([
        [
          bid1,
          {
            id: bid1,
            biddingRoundId: roundId,
            serviceRequestId: REQUEST_ID,
            status: 'active',
          },
        ],
        [
          bid2,
          {
            id: bid2,
            biddingRoundId: roundId,
            serviceRequestId: REQUEST_ID,
            status: 'active',
          },
        ],
      ]);

      const round = {
        id: roundId,
        serviceRequestId: REQUEST_ID,
        status: 'open',
      };

      const txMock: any = {
        biddingRound: {
          findUnique: vi.fn(async () => round),
          update: vi.fn(async ({ data }: any) => Object.assign(round, data)),
        },
        bid: {
          updateMany: vi.fn(async ({ data }: any) => {
            for (const b of bids.values()) {
              Object.assign(b, data);
            }
            return { count: 2 };
          }),
        },
        outboxEvent: {
          create: vi.fn().mockResolvedValue({ id: randomUUID() }),
        },
      };

      const prismaBiddingMock: any = {
        $transaction: vi.fn(async (cb: any) => cb(txMock)),
        biddingRound: txMock.biddingRound,
      };

      const roundsService = new RoundsService(prismaBiddingMock);

      // Recommendation: selectedBidId is null (never fake a bid ID)
      await roundsService.finalizeRound({
        serviceRequestId: REQUEST_ID,
        orderId: ORDER_ID,
        selectedBidId: undefined, // null / undefined for recommendation
        winningWorkerId: WORKER_ID,
        eventId: randomUUID(),
      });

      expect(round.status).toBe('finalized');
      expect(bids.get(bid1).status).toBe('rejected');
      expect(bids.get(bid2).status).toBe('rejected');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. BE-11a: Booking Proposal Outbox Events & Notification Router
  // ─────────────────────────────────────────────────────────────
  describe('BE-11a: Booking Proposal Outbox Events', () => {
    let service: BookingProposalsService;
    let prismaMock: any;
    let verifierMock: any;
    let outboxRepoMock: any;
    let publisher: OrderOutboxPublisherService;
    let publishedEnvelopes: any[] = [];

    beforeEach(() => {
      publishedEnvelopes = [];
      const outboxEvents: any[] = [];

      outboxRepoMock = {
        createEvent: vi.fn(async (eventData: any) => {
          const rec = {
            id: randomUUID(),
            ...eventData,
            createdAt: new Date(),
          };
          outboxEvents.push(rec);
          return rec;
        }),
      };

      publisher = new OrderOutboxPublisherService(
        {
          findPendingEvents: vi.fn(async () => outboxEvents),
          markPublished: vi.fn(),
        } as any,
        {
          emit: vi.fn(async (pattern, envelope) => {
            publishedEnvelopes.push({ pattern, envelope });
          }),
        } as any,
      );

      const request = {
        id: REQUEST_ID,
        requestCode: 'REQ-20261027-001',
        customerUserId: CUSTOMER_ID,
        status: RequestStatus.open_for_bidding,
        selectionExpiresAt: new Date(Date.now() + 86400000),
      };

      const proposal = {
        id: PROPOSAL_ID,
        serviceRequestId: REQUEST_ID,
        customerUserId: CUSTOMER_ID,
        workerUserId: WORKER_ID,
        revisionNo: 1,
        agreedPrice: new Prisma.Decimal(500000),
        status: BookingProposalStatus.proposed,
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      };

      prismaMock = {
        $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
        $executeRaw: vi.fn().mockResolvedValue(1),
        serviceRequest: {
          findUnique: vi.fn().mockResolvedValue(request),
          findUniqueOrThrow: vi.fn().mockResolvedValue(request),
        },
        bookingProposal: {
          create: vi.fn().mockResolvedValue(proposal),
          findUnique: vi.fn().mockResolvedValue(proposal),
          findUniqueOrThrow: vi.fn().mockResolvedValue(proposal),
          findFirst: vi.fn().mockResolvedValue(null),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      verifierMock = {
        verifyProposalSource: vi.fn().mockResolvedValue(undefined),
      };

      service = new BookingProposalsService(
        prismaMock,
        verifierMock,
        outboxRepoMock,
      );
    });

    it('should emit booking_proposal.created and route notification to Worker', async () => {
      await service.create(CUSTOMER_ID, {
        serviceRequestId: REQUEST_ID,
        workerUserId: WORKER_ID,
        selectionSource: WorkerSelectionSource.bid,
        sourceBidId: BID_ID,
        agreedPrice: 500000,
        agreedScope: 'Thao lap bom nuoc',
      });

      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'booking_proposal.created',
          aggregateType: 'BookingProposal',
          payload: expect.objectContaining({
            proposalId: PROPOSAL_ID,
            requestId: REQUEST_ID,
            customerId: CUSTOMER_ID,
            workerId: WORKER_ID,
          }),
        }),
        prismaMock,
      );

      // Validate through publisher envelope & Notification Router
      await publisher.publishPendingEvents();
      const emitted = publishedEnvelopes.find(
        (p) => p.pattern === 'booking_proposal.created',
      );
      expect(emitted).toBeDefined();

      const validated = validateNotificationEvent(
        emitted.envelope,
        'booking_proposal.created',
      );
      const route = notificationRouter.resolve(validated);

      expect(route.category).toBe('proposal');
      expect(route.entityId).toBe(PROPOSAL_ID.toLowerCase());
      expect(route.recipients).toEqual([
        { userId: WORKER_ID.toLowerCase(), role: 'worker' },
      ]);
    });

    it('should emit booking_proposal.changes_requested and route notification to Customer', async () => {
      await service.requestChanges(PROPOSAL_ID, WORKER_ID, {
        responseNote: 'Vui long dời lịch sang buoi chieu',
      });

      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'booking_proposal.changes_requested',
          aggregateType: 'BookingProposal',
          payload: expect.objectContaining({
            proposalId: PROPOSAL_ID,
            requestId: REQUEST_ID,
            customerId: CUSTOMER_ID,
            workerId: WORKER_ID,
            responseNote: 'Vui long dời lịch sang buoi chieu',
          }),
        }),
        prismaMock,
      );

      await publisher.publishPendingEvents();
      const emitted = publishedEnvelopes.find(
        (p) => p.pattern === 'booking_proposal.changes_requested',
      );
      expect(emitted).toBeDefined();

      const validated = validateNotificationEvent(
        emitted.envelope,
        'booking_proposal.changes_requested',
      );
      const route = notificationRouter.resolve(validated);

      expect(route.category).toBe('proposal');
      expect(route.recipients).toEqual([
        { userId: CUSTOMER_ID.toLowerCase(), role: 'customer' },
      ]);
    });

    it('should emit booking_proposal.rejected and route notification to Customer', async () => {
      await service.reject(PROPOSAL_ID, WORKER_ID, {
        responseNote: 'Ban khong nhan duoc lich',
      });

      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'booking_proposal.rejected',
          aggregateType: 'BookingProposal',
          payload: expect.objectContaining({
            proposalId: PROPOSAL_ID,
            requestId: REQUEST_ID,
            customerId: CUSTOMER_ID,
            workerId: WORKER_ID,
          }),
        }),
        prismaMock,
      );

      await publisher.publishPendingEvents();
      const emitted = publishedEnvelopes.find(
        (p) => p.pattern === 'booking_proposal.rejected',
      );
      expect(emitted).toBeDefined();

      const validated = validateNotificationEvent(
        emitted.envelope,
        'booking_proposal.rejected',
      );
      const route = notificationRouter.resolve(validated);

      expect(route.category).toBe('proposal');
      expect(route.recipients).toEqual([
        { userId: CUSTOMER_ID.toLowerCase(), role: 'customer' },
      ]);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. BE-11b: Order Progress & Terminal Event Notifications
  // ─────────────────────────────────────────────────────────────
  describe('BE-11b: Order Status Changed and Dedicated Terminal Notifications', () => {
    let service: OrdersService;
    let prismaMock: any;
    let outboxRepoMock: any;
    let publisher: OrderOutboxPublisherService;
    let publishedEnvelopes: any[] = [];
    const outboxEvents: any[] = [];
    let currentOrder: any;

    beforeEach(() => {
      publishedEnvelopes = [];
      outboxEvents.length = 0;

      currentOrder = {
        id: ORDER_ID,
        orderCode: 'ORD-20261027-0099',
        serviceRequestId: REQUEST_ID,
        bookingProposalId: PROPOSAL_ID,
        customerUserId: CUSTOMER_ID,
        workerUserId: WORKER_ID,
        serviceId: randomUUID(),
        selectionSource: 'bid',
        selectedBidId: BID_ID,
        agreedPrice: new Prisma.Decimal(500000),
        agreedScope: 'Kiem tra sua chua',
        status: 'created',
        paymentState: 'unpaid',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      outboxRepoMock = {
        createEvent: vi.fn(async (eventData: any) => {
          const rec = {
            id: randomUUID(),
            ...eventData,
            createdAt: new Date(),
          };
          outboxEvents.push(rec);
          return rec;
        }),
      };

      publisher = new OrderOutboxPublisherService(
        {
          findPendingEvents: vi.fn(async () => outboxEvents),
          markPublished: vi.fn(),
        } as any,
        {
          emit: vi.fn(async (pattern, envelope) => {
            publishedEnvelopes.push({ pattern, envelope });
          }),
        } as any,
      );

      prismaMock = {
        $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
        $queryRaw: vi.fn().mockResolvedValue([]),
        order: {
          findUnique: vi.fn(async ({ where }: any) => {
            return currentOrder.id === where.id ? currentOrder : null;
          }),
          findUniqueOrThrow: vi.fn(async ({ where }: any) => {
            if (currentOrder.id === where.id) return currentOrder;
            throw new Error('Order not found');
          }),
          updateMany: vi.fn(async ({ data }: any) => {
            currentOrder = { ...currentOrder, ...data };
            return { count: 1 };
          }),
        },
        orderStatusHistory: {
          create: vi.fn().mockResolvedValue({ id: randomUUID() }),
        },
        orderEvidence: {
          count: vi.fn().mockResolvedValue(1),
        },
      };

      service = new OrdersService(prismaMock, outboxRepoMock);
    });

    it('should emit order.status.changed on confirmReadiness (created -> confirmed) and route to Customer & Worker', async () => {
      await service.confirmReadiness(ORDER_ID, WORKER_ID);

      await publisher.publishPendingEvents();
      const statusChanged = publishedEnvelopes.find(
        (p) => p.pattern === 'order.status.changed',
      );
      expect(statusChanged).toBeDefined();

      const validated = validateNotificationEvent(
        statusChanged.envelope,
        'order.status.changed',
      );
      expect(validated.data.orderId).toBe(ORDER_ID.toLowerCase());
      expect(validated.data.previousStatus).toBe('created');
      expect(validated.data.nextStatus).toBe('confirmed');
      expect(validated.data.notificationKind).toBe('status_update');

      const route = notificationRouter.resolve(validated);
      expect(route.recipients).toEqual([
        { userId: CUSTOMER_ID.toLowerCase(), role: 'customer' },
        { userId: WORKER_ID.toLowerCase(), role: 'worker' },
      ]);
    });

    it('should emit order.status.changed on start (confirmed -> in_progress)', async () => {
      currentOrder.status = 'confirmed';
      await service.start(ORDER_ID, WORKER_ID);

      await publisher.publishPendingEvents();
      const statusChanged = publishedEnvelopes.find(
        (p) => p.pattern === 'order.status.changed',
      );
      expect(statusChanged).toBeDefined();

      const validated = validateNotificationEvent(
        statusChanged.envelope,
        'order.status.changed',
      );
      expect(validated.data.previousStatus).toBe('confirmed');
      expect(validated.data.nextStatus).toBe('in_progress');
      expect(validated.data.notificationKind).toBe('status_update');
    });

    it('should emit order.status.changed on finish (in_progress -> awaiting_customer_confirmation)', async () => {
      currentOrder.status = 'in_progress';
      await service.finish(ORDER_ID, WORKER_ID);

      await publisher.publishPendingEvents();
      const statusChanged = publishedEnvelopes.find(
        (p) => p.pattern === 'order.status.changed',
      );
      expect(statusChanged).toBeDefined();

      const validated = validateNotificationEvent(
        statusChanged.envelope,
        'order.status.changed',
      );
      expect(validated.data.previousStatus).toBe('in_progress');
      expect(validated.data.nextStatus).toBe('awaiting_customer_confirmation');
      expect(validated.data.notificationKind).toBe('status_update');
    });

    it('should emit order.status.changed on requestRework (awaiting_customer_confirmation -> in_progress)', async () => {
      currentOrder.status = 'awaiting_customer_confirmation';
      await service.requestRework(ORDER_ID, CUSTOMER_ID, {
        reason: 'Chua dat yeu cau',
      });

      await publisher.publishPendingEvents();
      const statusChanged = publishedEnvelopes.find(
        (p) => p.pattern === 'order.status.changed',
      );
      expect(statusChanged).toBeDefined();

      const validated = validateNotificationEvent(
        statusChanged.envelope,
        'order.status.changed',
      );
      expect(validated.data.previousStatus).toBe('awaiting_customer_confirmation');
      expect(validated.data.nextStatus).toBe('in_progress');
      expect(validated.data.notificationKind).toBe('status_update');
    });

    it('should emit order.status.changed on dispute (in_progress -> disputed)', async () => {
      currentOrder.status = 'in_progress';
      await service.dispute(ORDER_ID, CUSTOMER_ID, {
        reason: 'Tranh chap tien cong',
      });

      await publisher.publishPendingEvents();
      const statusChanged = publishedEnvelopes.find(
        (p) => p.pattern === 'order.status.changed',
      );
      expect(statusChanged).toBeDefined();

      const validated = validateNotificationEvent(
        statusChanged.envelope,
        'order.status.changed',
      );
      expect(validated.data.previousStatus).toBe('in_progress');
      expect(validated.data.nextStatus).toBe('disputed');
      expect(validated.data.notificationKind).toBe('status_update');
    });

    it('should emit dedicated order.completed ONLY (no order.status.changed) on confirmCompletion to avoid double notifications', async () => {
      currentOrder.status = 'awaiting_customer_confirmation';
      await service.confirmCompletion(ORDER_ID, CUSTOMER_ID);

      await publisher.publishPendingEvents();

      // Verify order.completed IS emitted
      const completedEvent = publishedEnvelopes.find(
        (p) => p.pattern === 'order.completed',
      );
      expect(completedEvent).toBeDefined();

      const validated = validateNotificationEvent(
        completedEvent.envelope,
        'order.completed',
      );
      const route = notificationRouter.resolve(validated);
      expect(route.category).toBe('order');
      expect(route.recipients).toEqual([
        { userId: CUSTOMER_ID.toLowerCase(), role: 'customer' },
        { userId: WORKER_ID.toLowerCase(), role: 'worker' },
      ]);

      // CRITICAL: Ensure NO order.status.changed was emitted for completed state
      const duplicateStatusChanged = publishedEnvelopes.find(
        (p) => p.pattern === 'order.status.changed',
      );
      expect(duplicateStatusChanged).toBeUndefined();
    });

    it('should emit dedicated order.cancelled ONLY (no order.status.changed) on cancel to avoid double notifications', async () => {
      currentOrder.status = 'confirmed';
      await service.cancel(ORDER_ID, CUSTOMER_ID, {
        reason: 'Khong con nhu cau',
      });

      await publisher.publishPendingEvents();

      // Verify order.cancelled IS emitted
      const cancelledEvent = publishedEnvelopes.find(
        (p) => p.pattern === 'order.cancelled',
      );
      expect(cancelledEvent).toBeDefined();

      const validated = validateNotificationEvent(
        cancelledEvent.envelope,
        'order.cancelled',
      );
      const route = notificationRouter.resolve(validated);
      expect(route.category).toBe('order');
      expect(route.recipients).toEqual([
        { userId: CUSTOMER_ID.toLowerCase(), role: 'customer' },
        { userId: WORKER_ID.toLowerCase(), role: 'worker' },
      ]);

      // CRITICAL: Ensure NO order.status.changed was emitted for cancelled state
      const duplicateStatusChanged = publishedEnvelopes.find(
        (p) => p.pattern === 'order.status.changed',
      );
      expect(duplicateStatusChanged).toBeUndefined();
    });
  });
});
