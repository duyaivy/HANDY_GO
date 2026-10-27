import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/order-client';
import { InternalOrderService } from './internal-order.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('InternalOrderService', () => {
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
  const mockOrderId = '22222222-2222-2222-2222-222222222222';
  const mockServiceId = '33333333-3333-3333-3333-333333333333';
  const mockCustomerId = '44444444-4444-4444-4444-444444444444';
  const mockWorkerId = '55555555-5555-5555-5555-555555555555';

  const futureDate = new Date(Date.now() + 12 * 3600 * 1000);
  const pastDate = new Date(Date.now() - 3600 * 1000);

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

  describe('getBiddingEligibility', () => {
    it('should return isEligible = true when request is open_for_bidding and before deadline', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        status: 'open_for_bidding',
        biddingClosesAt: futureDate,
        serviceId: mockServiceId,
        customerUserId: mockCustomerId,
      });

      const result = await service.getBiddingEligibility(mockRequestId);

      expect(result.serviceRequestId).toBe(mockRequestId);
      expect(result.isEligible).toBe(true);
      expect(result.status).toBe('open_for_bidding');
      expect(result.reason).toBeUndefined();
    });

    it('should return isEligible = false when bidding deadline has expired', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        status: 'open_for_bidding',
        biddingClosesAt: pastDate,
        serviceId: mockServiceId,
        customerUserId: mockCustomerId,
      });

      const result = await service.getBiddingEligibility(mockRequestId);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('Bidding deadline has expired');
    });

    it('should return isEligible = false when status is not open_for_bidding', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        status: 'bidding_closed',
        biddingClosesAt: futureDate,
        serviceId: mockServiceId,
        customerUserId: mockCustomerId,
      });

      const result = await service.getBiddingEligibility(mockRequestId);

      expect(result.isEligible).toBe(false);
      expect(result.reason).toContain('bidding_closed');
    });

    it('should throw NotFoundException if service request not found', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.getBiddingEligibility('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPaymentEligibility', () => {
    it('should return isEligibleForSettlement = true with exact decimal price when completed and unpaid', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: mockOrderId,
        orderCode: 'ORD-20261023-A1B2',
        status: 'completed',
        paymentState: 'unpaid',
        customerUserId: mockCustomerId,
        workerUserId: mockWorkerId,
        serviceId: mockServiceId,
        agreedPrice: new Prisma.Decimal('450000.00'),
      });

      const result = await service.getPaymentEligibility(mockOrderId);

      expect(result.orderId).toBe(mockOrderId);
      expect(result.orderCode).toBe('ORD-20261023-A1B2');
      expect(result.status).toBe('completed');
      expect(result.paymentState).toBe('unpaid');
      expect(result.isEligibleForSettlement).toBe(true);
      expect(result.agreedPrice).toBe('450000');
      expect(result.currency).toBe('VND');
      expect(result.reason).toBeUndefined();
    });

    it('should return isEligibleForSettlement = false when order is not completed', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: mockOrderId,
        orderCode: 'ORD-20261023-A1B2',
        status: 'in_progress',
        paymentState: 'unpaid',
        customerUserId: mockCustomerId,
        workerUserId: mockWorkerId,
        serviceId: mockServiceId,
        agreedPrice: new Prisma.Decimal('450000.00'),
      });

      const result = await service.getPaymentEligibility(mockOrderId);

      expect(result.isEligibleForSettlement).toBe(false);
      expect(result.reason).toContain('in_progress');
    });

    it('should return isEligibleForSettlement = false when order is already paid', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: mockOrderId,
        orderCode: 'ORD-20261023-A1B2',
        status: 'completed',
        paymentState: 'paid',
        customerUserId: mockCustomerId,
        workerUserId: mockWorkerId,
        serviceId: mockServiceId,
        agreedPrice: new Prisma.Decimal('450000.00'),
      });

      const result = await service.getPaymentEligibility(mockOrderId);

      expect(result.isEligibleForSettlement).toBe(false);
      expect(result.reason).toContain('paid');
    });

    it('should throw NotFoundException if order is not found', async () => {
      prismaMock.order.findUnique.mockResolvedValue(null);

      await expect(
        service.getPaymentEligibility('non-existent-order'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
