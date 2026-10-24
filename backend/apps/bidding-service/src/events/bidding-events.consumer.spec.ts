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
    };

    roundsServiceMock = {
      openRound: vi.fn(),
      cancelRound: vi.fn(),
      finalizeRound: vi.fn(),
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

  describe('handleServiceRequestPublished', () => {
    it('should open round, record consumed event, and ack message', async () => {
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);

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
        }),
      );
      expect(prismaMock.consumedEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'evt-100',
          eventType: 'service_request.published',
        }),
      });
      expect(channelMock.ack).toHaveBeenCalled();
    });

    it('should deduplicate and ack without calling openRound if event was already consumed', async () => {
      prismaMock.consumedEvent.findUnique.mockResolvedValue({
        eventId: 'evt-already-consumed',
      });

      const eventPayload = {
        eventId: 'evt-already-consumed',
        serviceRequestId: 'req-1',
        payload: { serviceRequestId: 'req-1' },
      };

      await consumer.handleServiceRequestPublished(eventPayload, contextMock);

      expect(roundsServiceMock.openRound).not.toHaveBeenCalled();
      expect(channelMock.ack).toHaveBeenCalled();
    });
  });

  describe('handleServiceRequestCancelled', () => {
    it('should cancel round and ack message', async () => {
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);

      const eventPayload = {
        eventId: 'evt-200',
        serviceRequestId: 'req-1',
        payload: { serviceRequestId: 'req-1' },
      };

      await consumer.handleServiceRequestCancelled(eventPayload, contextMock);

      expect(roundsServiceMock.cancelRound).toHaveBeenCalledWith('req-1');
      expect(prismaMock.consumedEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'evt-200',
          eventType: 'service_request.cancelled',
        }),
      });
      expect(channelMock.ack).toHaveBeenCalled();
    });
  });

  describe('handleOrderCreated', () => {
    it('should finalize round with selectedBidId and ack message', async () => {
      prismaMock.consumedEvent.findUnique.mockResolvedValue(null);

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
      });
      expect(prismaMock.consumedEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: 'evt-300',
          eventType: 'order.created',
        }),
      });
      expect(channelMock.ack).toHaveBeenCalled();
    });
  });

  describe('handleRoundExpireCheck', () => {
    it('should call expireRoundById and ack message', async () => {
      roundsServiceMock.expireRoundById = vi.fn().mockResolvedValue({ id: 'round-123', status: 'closed' });

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
