import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { BidsController } from './bids.controller.js';
import { BidsService } from './bids.service.js';
import { ConfigService } from '@app/config';

describe('BidsController', () => {
  let controller: BidsController;
  let bidsServiceMock: any;
  let configServiceMock: any;
  const validSecret = 'super-secret-internal-key-1234567890';

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
      internalServiceSecret: validSecret,
    };

    controller = new BidsController(
      bidsServiceMock as unknown as BidsService,
      configServiceMock as unknown as ConfigService,
    );
  });

  describe('submitBid', () => {
    it('should throw ForbiddenException if internal secret is missing or mismatched (F02)', async () => {
      await expect(
        controller.submitBid(
          '00000000-0000-0000-0000-000000000001',
          { amount: 200000 },
          'worker-1',
          'worker',
          'wrong-secret',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException if userId header is missing', async () => {
      await expect(
        controller.submitBid(
          '00000000-0000-0000-0000-000000000001',
          { amount: 200000 },
          undefined,
          'worker',
          validSecret,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ForbiddenException if user does not have Worker role', async () => {
      await expect(
        controller.submitBid(
          '00000000-0000-0000-0000-000000000001',
          { amount: 200000 },
          'user-1',
          'customer',
          validSecret,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should call service and return 201 for verified worker with valid secret', async () => {
      const mockResult = { id: 'bid-1', amount: 200000 };
      bidsServiceMock.submitBid.mockResolvedValue(mockResult);

      const response = await controller.submitBid(
        '00000000-0000-0000-0000-000000000001',
        { amount: 200000 },
        'worker-1',
        'worker',
        validSecret,
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
    it('should throw ForbiddenException if internal secret is missing (F02)', async () => {
      await expect(
        controller.reviseBid(
          '00000000-0000-0000-0000-000000000001',
          { version: 1, amount: 220000 },
          'worker-1',
          'worker',
          undefined,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should call reviseBid with workerId from headers and valid secret', async () => {
      const mockResult = { id: 'bid-1', amount: 220000, version: 2 };
      bidsServiceMock.reviseBid.mockResolvedValue(mockResult);

      const response = await controller.reviseBid(
        '00000000-0000-0000-0000-000000000001',
        { version: 1, amount: 220000 },
        'worker-1',
        'worker',
        validSecret,
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
    it('should throw ForbiddenException if internal secret is missing (F02)', async () => {
      await expect(
        controller.withdrawBid(
          '00000000-0000-0000-0000-000000000001',
          { version: 1, reason: 'Too busy' },
          'worker-1',
          'worker',
          undefined,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should call withdrawBid and return 200 with valid secret', async () => {
      const mockResult = { id: 'bid-1', status: 'withdrawn' };
      bidsServiceMock.withdrawBid.mockResolvedValue(mockResult);

      const response = await controller.withdrawBid(
        '00000000-0000-0000-0000-000000000001',
        { version: 1, reason: 'Too busy' },
        'worker-1',
        'worker',
        validSecret,
      );

      expect(response.statusCode).toBe(200);
      expect(response.data).toEqual(mockResult);
    });
  });

  describe('getBidById (F03 Sealed-Bid)', () => {
    it('should forward current user identity headers to getBidById', async () => {
      const mockResult = { id: 'bid-1', amount: 200000, isMasked: false };
      bidsServiceMock.getBidById.mockResolvedValue(mockResult);

      const response = await controller.getBidById(
        '00000000-0000-0000-0000-000000000001',
        'worker-1',
        'worker',
      );

      expect(bidsServiceMock.getBidById).toHaveBeenCalledWith(
        '00000000-0000-0000-0000-000000000001',
        'worker-1',
        'worker',
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
        validSecret,
      );

      expect(response.statusCode).toBe(200);
      expect(response.data).toEqual(mockResult);
    });
  });
});
