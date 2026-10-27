import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RequestStatus, BookingProposalStatus } from '@prisma/order-client';
import { OrderDeadlineSchedulerService } from './order-deadline-scheduler.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { OrderOutboxRepository } from '../../common/outbox/order-outbox.repository.js';
import { ORDER_CONSTANTS } from '../../common/constants/order.constants.js';

describe('OrderDeadlineSchedulerService', () => {
  let service: OrderDeadlineSchedulerService;
  let prismaMock: any;
  let outboxRepoMock: any;

  beforeEach(() => {
    prismaMock = {
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
      serviceRequest: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      bookingProposal: {
        updateMany: vi.fn(),
      },
    };

    outboxRepoMock = {
      createEvent: vi.fn().mockResolvedValue({ id: 'outbox-1' }),
    };

    service = new OrderDeadlineSchedulerService(
      prismaMock as unknown as PrismaService,
      outboxRepoMock as unknown as OrderOutboxRepository,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('checkDeadlines', () => {
    it('should close bidding for requests whose bidding deadline passed', async () => {
      const now = new Date('2026-10-23T12:00:00Z');
      const pastBiddingRequest = {
        id: 'req-1',
        requestCode: 'REQ-20261022-A1B2',
        customerUserId: 'user-1',
      };

      // Mock finding 1 request for closing bidding, 0 for expiring
      prismaMock.serviceRequest.findMany
        .mockResolvedValueOnce([pastBiddingRequest])
        .mockResolvedValueOnce([]);

      const result = await service.checkDeadlines(now);

      expect(result.biddingClosedCount).toBe(1);
      expect(result.expiredCount).toBe(0);

      expect(prismaMock.serviceRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-1' },
        data: {
          status: RequestStatus.bidding_closed,
          version: { increment: 1 },
        },
      });

      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateType: ORDER_CONSTANTS.AGGREGATE_SERVICE_REQUEST,
          aggregateId: 'req-1',
          eventType: ORDER_CONSTANTS.EVENT_SERVICE_REQUEST_BIDDING_CLOSED,
        }),
        expect.anything(),
      );
    });

    it('should expire requests and their open proposals whose selection deadline passed', async () => {
      const now = new Date('2026-10-23T12:00:00Z');
      const expiredRequest = {
        id: 'req-2',
        requestCode: 'REQ-20261021-X9Y8',
        customerUserId: 'user-2',
      };

      // Mock 0 for closing bidding, 1 for expiring
      prismaMock.serviceRequest.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([expiredRequest]);

      const result = await service.checkDeadlines(now);

      expect(result.biddingClosedCount).toBe(0);
      expect(result.expiredCount).toBe(1);

      expect(prismaMock.bookingProposal.updateMany).toHaveBeenCalledWith({
        where: {
          serviceRequestId: 'req-2',
          status: BookingProposalStatus.proposed,
        },
        data: {
          status: BookingProposalStatus.expired,
        },
      });

      expect(prismaMock.serviceRequest.update).toHaveBeenCalledWith({
        where: { id: 'req-2' },
        data: {
          status: RequestStatus.expired,
          version: { increment: 1 },
        },
      });

      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateType: ORDER_CONSTANTS.AGGREGATE_SERVICE_REQUEST,
          aggregateId: 'req-2',
          eventType: ORDER_CONSTANTS.EVENT_SERVICE_REQUEST_EXPIRED,
        }),
        expect.anything(),
      );
    });

    it('should gracefully handle errors on individual request processing', async () => {
      const now = new Date();
      prismaMock.serviceRequest.findMany
        .mockResolvedValueOnce([{ id: 'req-err' }])
        .mockResolvedValueOnce([]);

      prismaMock.serviceRequest.update.mockRejectedValue(
        new Error('Database lock timeout'),
      );

      const result = await service.checkDeadlines(now);

      expect(result.biddingClosedCount).toBe(0);
      expect(result.expiredCount).toBe(0);
    });

    it('should skip execution if already running', async () => {
      (service as any).isProcessing = true;

      const result = await service.checkDeadlines();

      expect(result).toEqual({ biddingClosedCount: 0, expiredCount: 0 });
      expect(prismaMock.serviceRequest.findMany).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('should initialize and destroy interval cleanly', () => {
      service.onModuleInit();
      expect((service as any).timer).not.toBeNull();
      service.onModuleDestroy();
      expect((service as any).timer).toBeNull();
    });
  });
});
