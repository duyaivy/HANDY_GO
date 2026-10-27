import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { InternalOrderController } from './internal-order.controller.js';
import type { InternalOrderService } from './internal-order.service.js';

describe('InternalOrderController', () => {
  let controller: InternalOrderController;
  let serviceMock: {
    getBiddingEligibility: ReturnType<typeof vi.fn>;
    getPaymentEligibility: ReturnType<typeof vi.fn>;
  };

  const mockRequestId = '11111111-1111-1111-1111-111111111111';
  const mockOrderId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    serviceMock = {
      getBiddingEligibility: vi.fn(),
      getPaymentEligibility: vi.fn(),
    };

    controller = new InternalOrderController(
      serviceMock as unknown as InternalOrderService,
    );
  });

  describe('getBiddingEligibility', () => {
    it('should return bidding eligibility with 200 wrapped response', async () => {
      const eligibility = {
        serviceRequestId: mockRequestId,
        isEligible: true,
        status: 'open_for_bidding',
      };
      serviceMock.getBiddingEligibility.mockResolvedValue(eligibility);

      const response = await controller.getBiddingEligibility(mockRequestId);

      expect(serviceMock.getBiddingEligibility).toHaveBeenCalledWith(mockRequestId);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(eligibility);
    });
  });

  describe('getPaymentEligibility', () => {
    it('should return payment settlement eligibility with 200 wrapped response', async () => {
      const eligibility = {
        orderId: mockOrderId,
        orderCode: 'ORD-123',
        status: 'completed',
        agreedPrice: '450000',
        currency: 'VND',
        isEligibleForSettlement: true,
      };
      serviceMock.getPaymentEligibility.mockResolvedValue(eligibility);

      const response = await controller.getPaymentEligibility(mockOrderId);

      expect(serviceMock.getPaymentEligibility).toHaveBeenCalledWith(mockOrderId);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(eligibility);
    });
  });
});
