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

    it('should retry on transient error up to 3 times then nack without requeue (R06/F10)', async () => {
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
