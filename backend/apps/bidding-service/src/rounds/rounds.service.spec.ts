import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { RoundsService } from './rounds.service.js';
import { EVENT_PATTERNS } from '@app/common';

describe('RoundsService', () => {
  let service: RoundsService;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      biddingRound: {
        findUnique: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      bid: {
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      outboxEvent: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb: (tx: any) => any) => {
        return cb(prismaMock);
      }),
    };

    service = new RoundsService(prismaMock);
  });

  describe('getBiddingStatus', () => {
    it('should throw NotFoundException if round does not exist', async () => {
      prismaMock.biddingRound.findUnique.mockResolvedValue(null);

      await expect(
        service.getBiddingStatus('non-existent-request'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return bidding status for open round with active bids', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000);
      const mockRound = {
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
        opensAt: new Date(),
        closesAt: futureDate,
        bidCount: 3,
      };

      prismaMock.biddingRound.findUnique.mockResolvedValue(mockRound);
      prismaMock.bid.count.mockResolvedValue(2);

      const result = await service.getBiddingStatus('req-1');

      expect(result.roundId).toBe('round-1');
      expect(result.status).toBe('open');
      expect(result.activeBidCount).toBe(2);
      expect(result.isExpired).toBe(false);
      expect(result.timeRemainingSeconds).toBeGreaterThan(0);
    });

    it('should automatically transition to closed if expired with active bids', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000);
      const mockRound = {
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
        opensAt: new Date(Date.now() - 7200 * 1000),
        closesAt: pastDate,
        bidCount: 2,
      };

      prismaMock.biddingRound.findUnique.mockResolvedValue(mockRound);
      // First count in expireRoundIfNeeded: 2 active bids
      // Second count in getBiddingStatus: 2 active bids
      prismaMock.bid.count.mockResolvedValue(2);
      prismaMock.biddingRound.update.mockResolvedValue({
        ...mockRound,
        status: 'closed',
      });

      const result = await service.getBiddingStatus('req-1');

      expect(prismaMock.biddingRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'round-1' },
          data: expect.objectContaining({ status: 'closed' }),
        }),
      );
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EVENT_PATTERNS.BIDDING_ROUND_CLOSED,
          }),
        }),
      );
      expect(result.status).toBe('closed');
      expect(result.isExpired).toBe(true);
    });

    it('should automatically transition to no_bid if expired with 0 active bids', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000);
      const mockRound = {
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
        opensAt: new Date(Date.now() - 7200 * 1000),
        closesAt: pastDate,
        bidCount: 0,
      };

      prismaMock.biddingRound.findUnique.mockResolvedValue(mockRound);
      prismaMock.bid.count.mockResolvedValue(0);
      prismaMock.biddingRound.update.mockResolvedValue({
        ...mockRound,
        status: 'no_bid',
      });

      const result = await service.getBiddingStatus('req-1');

      expect(prismaMock.biddingRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'round-1' },
          data: expect.objectContaining({ status: 'no_bid' }),
        }),
      );
      expect(result.status).toBe('no_bid');
      expect(result.activeBidCount).toBe(0);
    });
  });

  describe('openRound', () => {
    it('should create a new round and emit bidding.round.opened', async () => {
      prismaMock.biddingRound.findUnique.mockResolvedValue(null);
      const createdRound = {
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
        opensAt: new Date(),
        closesAt: new Date(Date.now() + 24 * 3600 * 1000),
        bidCount: 0,
      };
      prismaMock.biddingRound.create.mockResolvedValue(createdRound);

      const result = await service.openRound({ serviceRequestId: 'req-1' });

      expect(result.status).toBe('open');
      expect(prismaMock.biddingRound.create).toHaveBeenCalled();
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EVENT_PATTERNS.BIDDING_ROUND_OPENED,
          }),
        }),
      );
    });

    it('should update existing round if one already exists', async () => {
      const existing = {
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'pending',
      };
      prismaMock.biddingRound.findUnique.mockResolvedValue(existing);
      prismaMock.biddingRound.update.mockResolvedValue({
        ...existing,
        status: 'open',
        opensAt: new Date(),
        closesAt: new Date(),
      });

      const result = await service.openRound({ serviceRequestId: 'req-1' });

      expect(prismaMock.biddingRound.update).toHaveBeenCalled();
      expect(result.status).toBe('open');
    });
  });

  describe('cancelRound', () => {
    it('should cancel round and reject all active bids', async () => {
      const existing = {
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
      };
      prismaMock.biddingRound.findUnique.mockResolvedValue(existing);
      prismaMock.biddingRound.update.mockResolvedValue({
        ...existing,
        status: 'cancelled',
      });

      const result = await service.cancelRound('req-1');

      expect(result?.status).toBe('cancelled');
      expect(prismaMock.bid.updateMany).toHaveBeenCalledWith({
        where: {
          biddingRoundId: 'round-1',
          status: 'active',
        },
        data: {
          status: 'rejected',
        },
      });
    });
  });

  describe('finalizeRound', () => {
    it('should mark chosen bid as selected and other active bids as rejected', async () => {
      const mockRound = {
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
      };
      prismaMock.biddingRound.findUnique.mockResolvedValue(mockRound);
      prismaMock.biddingRound.update.mockResolvedValue({
        ...mockRound,
        status: 'finalized',
      });

      const result = await service.finalizeRound({
        serviceRequestId: 'req-1',
        orderId: 'order-1',
        selectedBidId: 'bid-winner',
        winningWorkerId: 'worker-winner',
      });

      expect(result?.status).toBe('finalized');
      expect(prismaMock.bid.update).toHaveBeenCalledWith({
        where: { id: 'bid-winner' },
        data: { status: 'selected' },
      });
      expect(prismaMock.bid.updateMany).toHaveBeenCalledWith({
        where: {
          biddingRoundId: 'round-1',
          id: { not: 'bid-winner' },
          status: 'active',
        },
        data: { status: 'rejected' },
      });
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EVENT_PATTERNS.BIDDING_ROUND_FINALIZED,
          }),
        }),
      );
    });

    it('should reject all active bids if worker won via recommendation (no selectedBidId)', async () => {
      const mockRound = {
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
      };
      prismaMock.biddingRound.findUnique.mockResolvedValue(mockRound);
      prismaMock.biddingRound.update.mockResolvedValue({
        ...mockRound,
        status: 'finalized',
      });

      await service.finalizeRound({
        serviceRequestId: 'req-1',
        orderId: 'order-1',
        winningWorkerId: 'worker-ai-recommendation',
      });

      expect(prismaMock.bid.update).not.toHaveBeenCalled();
      expect(prismaMock.bid.updateMany).toHaveBeenCalledWith({
        where: {
          biddingRoundId: 'round-1',
          status: 'active',
        },
        data: { status: 'rejected' },
      });
    });
  });
});
