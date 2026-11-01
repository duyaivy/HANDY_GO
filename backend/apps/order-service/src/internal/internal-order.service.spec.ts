import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { InternalOrderService } from './internal-order.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { RequestEligibilityResult } from '../../../../bidding-service/src/bids/services/request-eligibility-verifier.service.js';

describe('InternalOrderService (BE-03)', () => {
  let service: InternalOrderService;
  let prismaMock: {
    serviceRequest: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    order: {
      findUnique: ReturnType<typeof vi.fn>;
    };
  };

  const mockRequestId = '11111111-1111-1111-1111-111111111111';
  const mockCustomerId = 'cust-1111-1111';
  const mockWorkerId = 'work-2222-2222';

  beforeEach(() => {
    prismaMock = {
      serviceRequest: {
        findUnique: vi.fn(),
      },
      order: {
        findUnique: vi.fn(),
      },
    };

    service = new InternalOrderService(prismaMock as unknown as PrismaService);
  });

  describe('getBiddingEligibility (BE-03)', () => {
    it('returns eligible=true and compatible contract when request is open for bidding', async () => {
      const futureDate = new Date(Date.now() + 24 * 3600 * 1000);
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        status: 'open_for_bidding',
        biddingClosesAt: futureDate,
        serviceId: 'srv-1',
        customerUserId: mockCustomerId,
      });

      const response = await service.getBiddingEligibility(mockRequestId, mockWorkerId);

      // Verify BE-03 contract fields
      expect(response.eligible).toBe(true);
      expect(response.isEligible).toBe(true);
      expect(response.status).toBe('open_for_bidding');
      expect(response.requestStatus).toBe('open_for_bidding');
      expect(response.serviceRequestId).toBe(mockRequestId);
      expect(response.reason).toBeUndefined();

      // Verify that Bidding service consumer can read data.eligible directly without throwing
      const biddingConsumerCheck = (data: RequestEligibilityResult) => {
        if (!data.eligible) {
          throw new ForbiddenException(data.reason || 'Thợ không đủ điều kiện');
        }
        return data;
      };

      expect(() => biddingConsumerCheck(response)).not.toThrow();
      expect(biddingConsumerCheck(response).eligible).toBe(true);
    });

    it('returns eligible=false when request status is draft or not open_for_bidding', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        status: 'draft',
        biddingClosesAt: null,
        serviceId: 'srv-1',
        customerUserId: mockCustomerId,
      });

      const response = await service.getBiddingEligibility(mockRequestId, mockWorkerId);

      expect(response.eligible).toBe(false);
      expect(response.isEligible).toBe(false);
      expect(response.reason).toContain('draft');

      // Verify that Bidding consumer correctly rejects ineligible response
      const biddingConsumerCheck = (data: RequestEligibilityResult) => {
        if (!data.eligible) {
          throw new ForbiddenException(data.reason || 'Thợ không đủ điều kiện');
        }
        return data;
      };

      expect(() => biddingConsumerCheck(response)).toThrow(ForbiddenException);
    });

    it('returns eligible=false when bidding deadline has passed', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000);
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        status: 'open_for_bidding',
        biddingClosesAt: pastDate,
        serviceId: 'srv-1',
        customerUserId: mockCustomerId,
      });

      const response = await service.getBiddingEligibility(mockRequestId, mockWorkerId);

      expect(response.eligible).toBe(false);
      expect(response.reason).toContain('deadline has expired');
    });

    it('returns eligible=false when worker is the customer owner', async () => {
      const futureDate = new Date(Date.now() + 24 * 3600 * 1000);
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        status: 'open_for_bidding',
        biddingClosesAt: futureDate,
        serviceId: 'srv-1',
        customerUserId: mockCustomerId,
      });

      const response = await service.getBiddingEligibility(mockRequestId, mockCustomerId);

      expect(response.eligible).toBe(false);
      expect(response.reason).toContain('chính mình');
    });

    it('throws NotFoundException when service request does not exist', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(null);

      await expect(service.getBiddingEligibility('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
