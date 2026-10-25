import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { BidsService } from './bids.service.js';
import { RoundsService } from '../rounds/rounds.service.js';
import { EVENT_PATTERNS } from '@app/common';

describe('BidsService', () => {
  let service: BidsService;
  let prismaMock: any;
  let roundsServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      biddingRound: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      bid: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      bidRevision: {
        create: vi.fn(),
      },
      outboxEvent: {
        create: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      $transaction: vi.fn(async (cb: (tx: any) => any) => {
        return cb(prismaMock);
      }),
    };

    roundsServiceMock = {
      expireRoundIfNeeded: vi.fn(),
    };

    service = new BidsService(
      prismaMock,
      roundsServiceMock as unknown as RoundsService,
    );
  });

  describe('submitBid (BID-03)', () => {
    it('should throw NotFoundException if round does not exist', async () => {
      prismaMock.biddingRound.findUnique.mockResolvedValue(null);

      await expect(
        service.submitBid('worker-1', 'req-1', { amount: 200000 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if round is not open', async () => {
      prismaMock.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        status: 'closed',
        closesAt: new Date(Date.now() + 10000),
      });

      await expect(
        service.submitBid('worker-1', 'req-1', { amount: 200000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if round deadline has expired', async () => {
      prismaMock.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        status: 'open',
        closesAt: new Date(Date.now() - 10000),
      });

      await expect(
        service.submitBid('worker-1', 'req-1', { amount: 200000 }),
      ).rejects.toThrow(BadRequestException);
      expect(roundsServiceMock.expireRoundIfNeeded).toHaveBeenCalled();
    });

    it('should throw BadRequestException if validUntil is in the past', async () => {
      prismaMock.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        status: 'open',
        closesAt: new Date(Date.now() + 100000),
      });

      await expect(
        service.submitBid('worker-1', 'req-1', {
          amount: 200000,
          validUntil: new Date(Date.now() - 10000).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if worker already submitted a bid for this round', async () => {
      prismaMock.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        status: 'open',
        closesAt: new Date(Date.now() + 100000),
      });
      prismaMock.bid.findUnique.mockResolvedValue({
        id: 'existing-bid-1',
        workerId: 'worker-1',
      });

      await expect(
        service.submitBid('worker-1', 'req-1', { amount: 200000 }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully submit bid, increment round count, and create outbox event', async () => {
      prismaMock.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
        closesAt: new Date(Date.now() + 100000),
      });
      prismaMock.bid.findUnique.mockResolvedValue(null);

      const createdBid = {
        id: 'bid-1',
        biddingRoundId: 'round-1',
        serviceRequestId: 'req-1',
        workerId: 'worker-1',
        amount: 250000,
        message: 'Báo giá nhanh',
        validUntil: null,
        status: 'active',
        version: 1,
        submittedAt: new Date(),
      };
      prismaMock.bid.create.mockResolvedValue(createdBid);

      const result = await service.submitBid('worker-1', 'req-1', {
        amount: 250000,
        message: 'Báo giá nhanh',
      });

      expect(result.id).toBe('bid-1');
      expect(result.amount).toBe(250000);
      expect(result.version).toBe(1);
      expect(prismaMock.biddingRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'round-1' },
          data: { bidCount: { increment: 1 } },
        }),
      );
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EVENT_PATTERNS.BID_SUBMITTED,
          }),
        }),
      );
    });
  });

  describe('reviseBid (BID-04)', () => {
    it('should throw NotFoundException if bid not found', async () => {
      prismaMock.bid.findUnique.mockResolvedValue(null);

      await expect(
        service.reviseBid('worker-1', 'bid-999', { version: 1, amount: 230000 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if worker does not own the bid', async () => {
      prismaMock.bid.findUnique.mockResolvedValue({
        id: 'bid-1',
        workerId: 'worker-2',
        status: 'active',
        biddingRound: { status: 'open', closesAt: new Date(Date.now() + 10000) },
        revisions: [],
      });

      await expect(
        service.reviseBid('worker-1', 'bid-1', { version: 1, amount: 230000 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if version does not match (optimistic lock collision)', async () => {
      prismaMock.bid.findUnique.mockResolvedValue({
        id: 'bid-1',
        workerId: 'worker-1',
        status: 'active',
        version: 2,
        biddingRound: { status: 'open', closesAt: new Date(Date.now() + 10000) },
        revisions: [],
      });

      await expect(
        service.reviseBid('worker-1', 'bid-1', { version: 1, amount: 230000 }),
      ).rejects.toThrow(ConflictException);
    });

    it('should revise bid, save revision history, increment version and emit bid.revised', async () => {
      const existingBid = {
        id: 'bid-1',
        biddingRoundId: 'round-1',
        serviceRequestId: 'req-1',
        workerId: 'worker-1',
        amount: 250000,
        message: 'Gia cu',
        validUntil: null,
        status: 'active',
        version: 1,
        submittedAt: new Date(),
        biddingRound: { status: 'open', closesAt: new Date(Date.now() + 100000) },
        revisions: [],
      };
      prismaMock.bid.findUnique.mockResolvedValue(existingBid);

      const updatedBid = {
        ...existingBid,
        amount: 220000,
        message: 'Gia moi',
        version: 2,
        revisions: [
          {
            id: 'rev-1',
            revisionNo: 1,
            previousAmount: 250000,
            newAmount: 220000,
            previousMessage: 'Gia cu',
            newMessage: 'Gia moi',
            revisedAt: new Date(),
          },
        ],
      };
      prismaMock.bid.update.mockResolvedValue(updatedBid);

      const result = await service.reviseBid('worker-1', 'bid-1', {
        version: 1,
        amount: 220000,
        message: 'Gia moi',
      });

      expect(result.amount).toBe(220000);
      expect(result.version).toBe(2);
      expect(prismaMock.bidRevision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bidId: 'bid-1',
            revisionNo: 1,
            previousAmount: 250000,
            newAmount: 220000,
          }),
        }),
      );
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EVENT_PATTERNS.BID_REVISED,
          }),
        }),
      );
    });
  });

  describe('withdrawBid (BID-04)', () => {
    it('should withdraw bid successfully and write outbox event', async () => {
      const existingBid = {
        id: 'bid-1',
        biddingRoundId: 'round-1',
        serviceRequestId: 'req-1',
        workerId: 'worker-1',
        amount: 250000,
        status: 'active',
        version: 1,
        submittedAt: new Date(),
        biddingRound: { status: 'open', closesAt: new Date(Date.now() + 100000) },
        revisions: [],
      };
      prismaMock.bid.findUnique.mockResolvedValue(existingBid);

      const updatedBid = {
        ...existingBid,
        status: 'withdrawn',
        version: 2,
      };
      prismaMock.bid.update.mockResolvedValue(updatedBid);

      const result = await service.withdrawBid('worker-1', 'bid-1', {
        version: 1,
        reason: 'Bận việc đột xuất',
      });

      expect(result.status).toBe('withdrawn');
      expect(result.version).toBe(2);
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: EVENT_PATTERNS.BID_WITHDRAWN,
          }),
        }),
      );
    });
  });

  describe('checkEligibility (BID-06)', () => {
    it('should return eligible: false if bid does not exist', async () => {
      prismaMock.bid.findUnique.mockResolvedValue(null);

      const result = await service.checkEligibility('bid-999', {
        requestId: 'req-1',
        workerId: 'worker-1',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('không tồn tại');
    });

    it('should return eligible: false if requestId does not match', async () => {
      prismaMock.bid.findUnique.mockResolvedValue({
        id: 'bid-1',
        serviceRequestId: 'other-req',
        workerId: 'worker-1',
        status: 'active',
        biddingRound: { status: 'open' },
      });

      const result = await service.checkEligibility('bid-1', {
        requestId: 'req-1',
        workerId: 'worker-1',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('không thuộc về yêu cầu');
    });

    it('should return eligible: false if workerId does not match', async () => {
      prismaMock.bid.findUnique.mockResolvedValue({
        id: 'bid-1',
        serviceRequestId: 'req-1',
        workerId: 'worker-2',
        status: 'active',
        biddingRound: { status: 'open' },
      });

      const result = await service.checkEligibility('bid-1', {
        requestId: 'req-1',
        workerId: 'worker-1',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('không thuộc về thợ');
    });

    it('should return eligible: false if bid is not active', async () => {
      prismaMock.bid.findUnique.mockResolvedValue({
        id: 'bid-1',
        serviceRequestId: 'req-1',
        workerId: 'worker-1',
        status: 'withdrawn',
        biddingRound: { status: 'open' },
      });

      const result = await service.checkEligibility('bid-1', {
        requestId: 'req-1',
        workerId: 'worker-1',
      });

      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('không còn ở trạng thái khả dụng');
    });

    it('should return eligible: true when all conditions are satisfied', async () => {
      prismaMock.bid.findUnique.mockResolvedValue({
        id: 'bid-1',
        serviceRequestId: 'req-1',
        workerId: 'worker-1',
        amount: 250000,
        status: 'active',
        version: 1,
        validUntil: new Date(Date.now() + 100000),
        biddingRound: { status: 'open' },
      });

      const result = await service.checkEligibility('bid-1', {
        requestId: 'req-1',
        workerId: 'worker-1',
      });

      expect(result.eligible).toBe(true);
      expect(result.bid?.amount).toBe(250000);
      expect(result.bid?.status).toBe('active');
    });
  });

  describe('Anti-Abuse & Fair Play features', () => {
    it('should throw BadRequestException when worker exceeds max 5 revisions', async () => {
      prismaMock.bid.findUnique.mockResolvedValue({
        id: 'bid-1',
        workerId: 'worker-1',
        status: 'active',
        version: 5,
        amount: 200000,
        submittedAt: new Date(Date.now() - 1000000),
        biddingRound: {
          status: 'open',
          closesAt: new Date(Date.now() + 100000),
        },
        revisions: [
          { revisionNo: 1, revisedAt: new Date(Date.now() - 500000) },
          { revisionNo: 2, revisedAt: new Date(Date.now() - 400000) },
          { revisionNo: 3, revisedAt: new Date(Date.now() - 300000) },
          { revisionNo: 4, revisedAt: new Date(Date.now() - 200000) },
          { revisionNo: 5, revisedAt: new Date(Date.now() - 100000) },
        ],
      });

      await expect(
        service.reviseBid('worker-1', 'bid-1', { version: 5, amount: 190000 }),
      ).rejects.toThrow('Bạn đã đạt giới hạn tối đa 5 lần điều chỉnh báo giá');
    });

    it('should trigger Anti-Sniping and extend closesAt when bid submitted in last 30s', async () => {
      const now = Date.now();
      const closesAtSoon = new Date(now + 20 * 1000); // Còn 20 giây (< 30s)

      prismaMock.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
        closesAt: closesAtSoon,
      });

      prismaMock.bid.findUnique.mockResolvedValue(null);
      prismaMock.bid.create.mockResolvedValue({
        id: 'bid-new',
        biddingRoundId: 'round-1',
        serviceRequestId: 'req-1',
        workerId: 'worker-1',
        amount: 250000,
        status: 'active',
        version: 1,
        submittedAt: new Date(),
      });

      await service.submitBid('worker-1', 'req-1', { amount: 250000 });

      // Round closesAt should be updated with +2 minutes extension
      expect(prismaMock.biddingRound.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'round-1' },
          data: expect.objectContaining({
            closesAt: expect.any(Date),
          }),
        }),
      );

      // Outbox event bidding.round.extended should be created
      expect(prismaMock.outboxEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'bidding.round.extended',
          }),
        }),
      );
    });

    it('should NOT extend closesAt when anti-sniping has reached max extensions cap (3 times)', async () => {
      const now = Date.now();
      const closesAtSoon = new Date(now + 20 * 1000); // 20s remaining

      prismaMock.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        serviceRequestId: 'req-1',
        status: 'open',
        closesAt: closesAtSoon,
      });

      prismaMock.bid.findUnique.mockResolvedValue(null);
      prismaMock.outboxEvent.count.mockResolvedValue(3); // Already extended 3 times
      prismaMock.bid.create.mockResolvedValue({
        id: 'bid-new',
        biddingRoundId: 'round-1',
        serviceRequestId: 'req-1',
        workerId: 'worker-1',
        amount: 250000,
        status: 'active',
        version: 1,
        submittedAt: new Date(),
      });

      await service.submitBid('worker-1', 'req-1', { amount: 250000 });

      // Round closesAt should NOT be updated with extension
      expect(prismaMock.biddingRound.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            closesAt: expect.any(Date),
          }),
        }),
      );

      // No bidding.round.extended event should be created
      expect(prismaMock.outboxEvent.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'bidding.round.extended',
          }),
        }),
      );
    });

    it('should mask competitor bid amounts (Blind Bidding) when viewer is another worker', async () => {
      prismaMock.bid.count.mockResolvedValue(2);
      prismaMock.bid.findMany.mockResolvedValue([
        {
          id: 'bid-own',
          biddingRoundId: 'round-1',
          serviceRequestId: 'req-1',
          workerId: 'worker-1',
          amount: 250000,
          message: 'Tin nhắn của tôi',
          validUntil: null,
          status: 'active',
          version: 1,
          submittedAt: new Date(),
          _count: { revisions: 0 },
        },
        {
          id: 'bid-competitor',
          biddingRoundId: 'round-1',
          serviceRequestId: 'req-1',
          workerId: 'worker-2',
          amount: 200000,
          message: 'Báo giá của đối thủ',
          validUntil: null,
          status: 'active',
          version: 1,
          submittedAt: new Date(),
          _count: { revisions: 0 },
        },
      ]);

      // Worker 1 viewing bids: Worker 2's bid should be masked
      const res = await service.getBidsForRequest(
        'req-1',
        { page: 1, limit: 10 },
        'worker-1',
        'worker',
      );

      expect(res.items.length).toBe(2);
      const ownBid = res.items.find((b) => b.id === 'bid-own');
      const competitorBid = res.items.find((b) => b.id === 'bid-competitor');

      expect(ownBid?.isMasked).toBe(false);
      expect(ownBid?.amount).toBe(250000);

      expect(competitorBid?.isMasked).toBe(true);
      expect(competitorBid?.amount).toBe(0);
      expect(competitorBid?.message).toContain('Báo giá kín');
    });

    it('should NOT mask bids when viewer is customer or admin', async () => {
      prismaMock.bid.count.mockResolvedValue(1);
      prismaMock.bid.findMany.mockResolvedValue([
        {
          id: 'bid-1',
          biddingRoundId: 'round-1',
          serviceRequestId: 'req-1',
          workerId: 'worker-2',
          amount: 200000,
          message: 'Báo giá thợ 2',
          validUntil: null,
          status: 'active',
          version: 1,
          submittedAt: new Date(),
          _count: { revisions: 0 },
        },
      ]);

      const res = await service.getBidsForRequest(
        'req-1',
        { page: 1, limit: 10 },
        'customer-1',
        'customer',
      );

      expect(res.items[0].isMasked).toBe(false);
      expect(res.items[0].amount).toBe(200000);
      expect(res.items[0].message).toBe('Báo giá thợ 2');
    });
  });
});
