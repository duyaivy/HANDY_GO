import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { BidsController } from './bids.controller.js';
import { BidsService } from './bids.service.js';
import { ConfigService } from '@app/config';

describe('BidsController', () => {
  let controller: BidsController;
  let bidsServiceMock: any;
  let configServiceMock: any;

  beforeEach(() => {
    bidsServiceMock = {
      submitBid: vi.fn(),
      reviseBid: vi.fn(),
      withdrawBid: vi.fn(),
      getBidsForRequest: vi.fn(),
      getMyBids: vi.fn(),
      getBidById: vi.fn(),
      checkEligibility: vi.fn(),
    };

    configServiceMock = {
      internalServiceSecret: 'super-secret-internal-key-1234567890',
    };

    controller = new BidsController(
      bidsServiceMock as unknown as BidsService,
      configServiceMock as unknown as ConfigService,
    );
  });

  describe('submitBid', () => {
    it('should throw UnauthorizedException if userId header is missing', async () => {
      await expect(
        controller.submitBid(
          '00000000-0000-0000-0000-000000000001',
          { amount: 200000 },
          undefined,
          'Worker',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if user does not have Worker role', async () => {
      await expect(
        controller.submitBid(
          '00000000-0000-0000-0000-000000000001',
          { amount: 200000 },
          'user-1',
          'Customer',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should call service and return 201 for verified worker', async () => {
      const mockResult = { id: 'bid-1', amount: 200000 };
      bidsServiceMock.submitBid.mockResolvedValue(mockResult);

      const response = await controller.submitBid(
        '00000000-0000-0000-0000-000000000001',
        { amount: 200000 },
        'worker-1',
        'Worker',
      );

      expect(bidsServiceMock.submitBid).toHaveBeenCalledWith(
        'worker-1',
        '00000000-0000-0000-0000-000000000001',
        { amount: 200000 },
      );
      expect(response.statusCode).toBe(201);
      expect(response.data).toEqual(mockResult);
    });
  });

  describe('reviseBid', () => {
    it('should call reviseBid with workerId from headers', async () => {
      const mockResult = { id: 'bid-1', amount: 220000, version: 2 };
      bidsServiceMock.reviseBid.mockResolvedValue(mockResult);

      const response = await controller.reviseBid(
        '00000000-0000-0000-0000-000000000001',
        { version: 1, amount: 220000 },
        'worker-1',
        'Worker',
      );

      expect(bidsServiceMock.reviseBid).toHaveBeenCalledWith(
        'worker-1',
        '00000000-0000-0000-0000-000000000001',
        { version: 1, amount: 220000 },
      );
      expect(response.statusCode).toBe(200);
      expect(response.data).toEqual(mockResult);
    });
  });

  describe('withdrawBid', () => {
    it('should call withdrawBid and return 200', async () => {
      const mockResult = { id: 'bid-1', status: 'withdrawn' };
      bidsServiceMock.withdrawBid.mockResolvedValue(mockResult);

      const response = await controller.withdrawBid(
        '00000000-0000-0000-0000-000000000001',
        { reason: 'Too busy' },
        'worker-1',
        'Worker',
      );

      expect(response.statusCode).toBe(200);
      expect(response.data).toEqual(mockResult);
    });
  });

  describe('checkEligibility (Internal API)', () => {
    it('should throw ForbiddenException if internal secret is missing or mismatched', async () => {
      await expect(
        controller.checkEligibility(
          '00000000-0000-0000-0000-000000000001',
          {
            requestId: '00000000-0000-0000-0000-000000000002',
            workerId: '00000000-0000-0000-0000-000000000003',
          },
          'wrong-secret',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should pass and return eligibility result when internal secret is valid', async () => {
      const mockResult = { eligible: true };
      bidsServiceMock.checkEligibility.mockResolvedValue(mockResult);

      const response = await controller.checkEligibility(
        '00000000-0000-0000-0000-000000000001',
        {
          requestId: '00000000-0000-0000-0000-000000000002',
          workerId: '00000000-0000-0000-0000-000000000003',
        },
        'super-secret-internal-key-1234567890',
      );

      expect(response.statusCode).toBe(200);
      expect(response.data).toEqual(mockResult);
    });
  });
});
