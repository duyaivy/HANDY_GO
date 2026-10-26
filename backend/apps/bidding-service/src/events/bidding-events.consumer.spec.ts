import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BiddingEventsConsumer } from './bidding-events.consumer.js';
import { RoundsService } from '../rounds/rounds.service.js';

describe('BiddingEventsConsumer', () => {
  let consumer: BiddingEventsConsumer;
  let prismaMock: any;
  let roundsServiceMock: any;
  let contextMock: any;
  let channelMock: any;

  beforeEach(() => {
    prismaMock = {
      consumedEvent: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      outboxEvent: {
        create: vi.fn(),
      },
    };

    roundsServiceMock = {
      openRound: vi.fn().mockResolvedValue({ id: 'round-1', status: 'open' }),
      cancelRound: vi.fn().mockResolvedValue({ id: 'round-1', status: 'cancelled' }),
      finalizeRound: vi.fn().mockResolvedValue({ id: 'round-1', status: 'finalized' }),
      expireRoundById: vi.fn().mockResolvedValue({ id: 'round-1', status: 'closed' }),
    };

    channelMock = {
      ack: vi.fn(),
      nack: vi.fn(),
    };

    contextMock = {
      getChannelRef: () => channelMock,
      getMessage: () => ({ fields: { deliveryTag: 1 } }),
    };

    consumer = new BiddingEventsConsumer(
      prismaMock,
      roundsServiceMock as unknown as RoundsService,
    );
  });

  describe('handleServiceRequestPublished (R04/F07)', () => {
    it('should forward eventId to roundsService.openRound for transactional atomic inbox and ack message', async () => {
      const eventPayload = {
        eventId: 'evt-100',
        serviceRequestId: 'req-1',
        payload: {
          serviceRequestId: 'req-1',
          durationHours: 48,
        },
      };

      await consumer.handleServiceRequestPublished(eventPayload, contextMock);

      expect(roundsServiceMock.openRound).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceRequestId: 'req-1',
          durationHours: 48,
          eventId: 'evt-100',
        }),
      );
      expect(channelMock.ack).toHaveBeenCalled();
    });

    it('should retry on transient error up to 3 times then nack without requeue and persist dead letter (R06/F10/P1-03)', async () => {
      roundsServiceMock.openRound.mockRejectedValue(new Error('DB Connection Timeout'));

      const eventPayload = {
        eventId: 'evt-retry-1',
        serviceRequestId: 'req-retry',
        payload: { serviceRequestId: 'req-retry' },
      };

      // 1st attempt -> requeue: true
      await consumer.handleServiceRequestPublished(eventPayload, contextMock);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);

      // 2nd attempt -> requeue: true
      await consumer.handleServiceRequestPublished(eventPayload, contextMock);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);

      // 3rd attempt -> requeue: false (DLQ dead-lettered)
      await consumer.handleServiceRequestPublished(eventPayload, contextMock);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, false);
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            aggregateType: 'dead_letter',
            eventType: 'bidding.dead_letter',
            status: 'failed',
          }),
        }),
      );
    });

    it('should requeue message if DB fails during dead-letter persistence (zero message loss F-A)', async () => {
      roundsServiceMock.openRound.mockRejectedValue(new Error('DB Connection Timeout'));
      prismaMock.outboxEvent.create.mockRejectedValue(new Error('Database unavailable'));

      const eventPayload = {
        eventId: 'evt-db-outage',
        serviceRequestId: 'req-db-outage',
        payload: { serviceRequestId: 'req-db-outage' },
      };

      // 1st attempt -> requeue: true
      await consumer.handleServiceRequestPublished(eventPayload, contextMock);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);

      // 2nd attempt -> requeue: true
      await consumer.handleServiceRequestPublished(eventPayload, contextMock);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);

      // 3rd attempt -> DB fails when saving dead-letter -> requeue MUST be true!
      await consumer.handleServiceRequestPublished(eventPayload, contextMock);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);
    });

    it('fault injection lifecycle: DB down during dead-letter -> requeued -> service restarts -> DB recovers -> event successfully processed (ACK)', async () => {
      // Phase 1: DB is down for both business logic and dead-letter storage
      roundsServiceMock.openRound.mockRejectedValue(new Error('DB Connection Refused'));
      prismaMock.outboxEvent.create.mockRejectedValue(new Error('PostgreSQL unavailable'));

      const eventPayload = {
        eventId: 'evt-fault-recovery',
        serviceRequestId: 'req-fault-1',
        payload: { serviceRequestId: 'req-fault-1' },
      };

      // Attempt 1, 2, 3 all fail and dead-letter fails -> message is requeued (requeue=true)
      await consumer.handleServiceRequestPublished(eventPayload, contextMock);
      await consumer.handleServiceRequestPublished(eventPayload, contextMock);
      await consumer.handleServiceRequestPublished(eventPayload, contextMock);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);

      // Phase 2: Consumer service restarts (clean in-memory state)
      const restartedConsumer = new BiddingEventsConsumer(
        prismaMock,
        roundsServiceMock as unknown as RoundsService,
      );

      // Phase 3: DB recovers
      roundsServiceMock.openRound.mockResolvedValue({ id: 'round-recovered', status: 'open' });

      // Broker redelivers the requeued message
      await restartedConsumer.handleServiceRequestPublished(eventPayload, contextMock);

      // Verified: Message was NEVER discarded and is now successfully ACKed!
      expect(channelMock.ack).toHaveBeenCalled();
    });

    it('tracks retry attempts across requeues via content hash even if deliveryTag changes and messageId is absent', async () => {
      roundsServiceMock.openRound.mockRejectedValue(new Error('Transient lock timeout'));
      prismaMock.outboxEvent.create.mockResolvedValue({ id: 'dlq-ok' });

      const rawJson = JSON.stringify({
        serviceRequestId: 'req-hash-test',
        payload: { serviceRequestId: 'req-hash-test' },
      });
      const messageContent = Buffer.from(rawJson);

      // Delivery 1: deliveryTag = 101, no messageId
      const context1 = {
        getChannelRef: () => channelMock,
        getMessage: () => ({
          fields: { deliveryTag: 101 },
          content: messageContent,
        }),
      };
      await consumer.handleServiceRequestPublished(JSON.parse(rawJson), context1);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);

      // Delivery 2: broker assigns deliveryTag = 102
      const context2 = {
        getChannelRef: () => channelMock,
        getMessage: () => ({
          fields: { deliveryTag: 102 },
          content: messageContent,
        }),
      };
      await consumer.handleServiceRequestPublished(JSON.parse(rawJson), context2);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, true);

      // Delivery 3: broker assigns deliveryTag = 103 -> reaches max retry (3) and dead-letters
      const context3 = {
        getChannelRef: () => channelMock,
        getMessage: () => ({
          fields: { deliveryTag: 103 },
          content: messageContent,
        }),
      };
      await consumer.handleServiceRequestPublished(JSON.parse(rawJson), context3);
      expect(channelMock.nack).toHaveBeenLastCalledWith(expect.anything(), false, false);
      expect(prismaMock.outboxEvent.create).toHaveBeenCalled();
    });
  });

  describe('handleServiceRequestCancelled (R04/F07)', () => {
    it('should pass eventId to roundsService.cancelRound and ack message', async () => {
      const eventPayload = {
        eventId: 'evt-200',
        serviceRequestId: 'req-1',
        payload: { serviceRequestId: 'req-1' },
      };

      await consumer.handleServiceRequestCancelled(eventPayload, contextMock);

      expect(roundsServiceMock.cancelRound).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceRequestId: 'req-1',
          eventId: 'evt-200',
        }),
      );
      expect(channelMock.ack).toHaveBeenCalled();
    });
  });

  describe('handleOrderCreated (R04/F07 & R05/F09)', () => {
    it('should pass eventId and winner data to roundsService.finalizeRound and ack message', async () => {
      const eventPayload = {
        eventId: 'evt-300',
        payload: {
          orderId: 'order-1',
          serviceRequestId: 'req-1',
          selectedBidId: 'bid-winning',
          workerId: 'worker-1',
        },
      };

      await consumer.handleOrderCreated(eventPayload, contextMock);

      expect(roundsServiceMock.finalizeRound).toHaveBeenCalledWith({
        serviceRequestId: 'req-1',
        orderId: 'order-1',
        selectedBidId: 'bid-winning',
        winningWorkerId: 'worker-1',
        eventId: 'evt-300',
      });
      expect(channelMock.ack).toHaveBeenCalled();
    });
  });

  describe('handleRoundExpireCheck', () => {
    it('should call expireRoundById and ack message', async () => {
      const eventPayload = {
        payload: {
          roundId: 'round-123',
        },
      };

      await consumer.handleRoundExpireCheck(eventPayload, contextMock);

      expect(roundsServiceMock.expireRoundById).toHaveBeenCalledWith('round-123');
      expect(channelMock.ack).toHaveBeenCalled();
    });
  });
});
