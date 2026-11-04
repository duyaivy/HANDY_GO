import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SseController } from '../src/sse/sse.controller.js';
import type { SseService } from '../src/sse/sse.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { ConfigService } from '@app/config';
import type { RequestEligibilityVerifierService } from '../src/bids/services/request-eligibility-verifier.service.js';
import {
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';

describe('SseController (BE-01 / BE-07)', () => {
  let controller: SseController;
  let mockSseService: { registerClient: ReturnType<typeof vi.fn> };
  let mockPrisma: any;
  let mockConfig: any;
  let mockVerifier: { verifyEligibility: ReturnType<typeof vi.fn> };

  const INTERNAL_SECRET = 'correct-internal-secret';
  const requestId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const customerUserId = 'cust-uuid-1';
  const workerUserId = 'work-uuid-1';

  beforeEach(() => {
    mockSseService = {
      registerClient: vi.fn(),
    };
    mockPrisma = {
      biddingRound: {
        findUnique: vi.fn(),
      },
      bid: {
        findFirst: vi.fn(),
      },
    };
    mockConfig = {
      internalServiceSecret: INTERNAL_SECRET,
      get: vi.fn((key: string) => {
        if (key === 'INTERNAL_SERVICE_SECRET') return INTERNAL_SECRET;
        return undefined;
      }),
    };
    mockVerifier = {
      verifyEligibility: vi.fn(),
    };

    controller = new SseController(
      mockSseService as unknown as SseService,
      mockPrisma as unknown as PrismaService,
      mockConfig as unknown as ConfigService,
      mockVerifier as unknown as RequestEligibilityVerifierService,
    );
  });

  function createMockReq(headers: Record<string, string> = {}) {
    return {
      headers: {
        'x-internal-secret': INTERNAL_SECRET,
        ...headers,
      },
    } as any;
  }

  function createMockRes() {
    return {
      writeHead: vi.fn(),
      write: vi.fn(),
      flushHeaders: vi.fn(),
      on: vi.fn(),
    } as any;
  }

  it('should throw ForbiddenException if x-internal-secret is invalid or missing', async () => {
    const req = createMockReq({ 'x-internal-secret': 'wrong-secret' });
    const res = createMockRes();

    await expect(
      controller.streamEvents(requestId, req, res),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw UnauthorizedException if x-user-id is missing', async () => {
    const req = createMockReq({ 'x-user-id': '' });
    const res = createMockRes();

    await expect(
      controller.streamEvents(requestId, req, res),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw NotFoundException if bidding round does not exist', async () => {
    mockPrisma.biddingRound.findUnique.mockResolvedValue(null);

    const req = createMockReq({
      'x-user-id': customerUserId,
      'x-user-roles': 'customer',
    });
    const res = createMockRes();

    await expect(
      controller.streamEvents(requestId, req, res),
    ).rejects.toThrow(NotFoundException);
  });

  it('Customer: should register SSE client if user is the request customer owner', async () => {
    mockPrisma.biddingRound.findUnique.mockResolvedValue({
      id: 'round-1',
      serviceRequestId: requestId,
      customerId: customerUserId,
    });

    const req = createMockReq({
      'x-user-id': customerUserId,
      'x-user-roles': 'customer',
    });
    const res = createMockRes();

    await controller.streamEvents(requestId, req, res);

    expect(mockSseService.registerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        userId: customerUserId,
        roles: ['customer'],
        res,
      }),
    );
  });

  it('Customer: should throw ForbiddenException if user is NOT the customer owner', async () => {
    mockPrisma.biddingRound.findUnique.mockResolvedValue({
      id: 'round-1',
      serviceRequestId: requestId,
      customerId: 'other-customer-id',
    });

    const req = createMockReq({
      'x-user-id': customerUserId,
      'x-user-roles': 'customer',
    });
    const res = createMockRes();

    await expect(
      controller.streamEvents(requestId, req, res),
    ).rejects.toThrow(ForbiddenException);
  });

  it('Worker: should register SSE client if worker already submitted a bid', async () => {
    mockPrisma.biddingRound.findUnique.mockResolvedValue({
      id: 'round-1',
      serviceRequestId: requestId,
      customerId: customerUserId,
    });
    mockPrisma.bid.findFirst.mockResolvedValue({
      id: 'bid-1',
      workerId: workerUserId,
    });

    const req = createMockReq({
      'x-user-id': workerUserId,
      'x-user-roles': 'worker',
    });
    const res = createMockRes();

    await controller.streamEvents(requestId, req, res);

    expect(mockSseService.registerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        userId: workerUserId,
        roles: ['worker'],
      }),
    );
    expect(mockVerifier.verifyEligibility).not.toHaveBeenCalled();
  });

  it('Worker: should verify trade eligibility if worker has no bid yet', async () => {
    mockPrisma.biddingRound.findUnique.mockResolvedValue({
      id: 'round-1',
      serviceRequestId: requestId,
      customerId: customerUserId,
    });
    mockPrisma.bid.findFirst.mockResolvedValue(null);
    mockVerifier.verifyEligibility.mockResolvedValue({ eligible: true });

    const req = createMockReq({
      'x-user-id': workerUserId,
      'x-user-roles': 'worker',
    });
    const res = createMockRes();

    await controller.streamEvents(requestId, req, res);

    expect(mockVerifier.verifyEligibility).toHaveBeenCalledWith(
      requestId,
      workerUserId,
    );
    expect(mockSseService.registerClient).toHaveBeenCalled();
  });

  it('Admin: should allow access without checking round ownership', async () => {
    const req = createMockReq({
      'x-user-id': 'admin-1',
      'x-user-roles': 'admin',
    });
    const res = createMockRes();

    await controller.streamEvents(requestId, req, res);

    expect(mockPrisma.biddingRound.findUnique).not.toHaveBeenCalled();
    expect(mockSseService.registerClient).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        userId: 'admin-1',
        roles: ['admin'],
      }),
    );
  });

  describe('Multi-role Authorization & Fail-Closed Behavior (BE-FIX-05)', () => {
    it('Dual-role (Customer+Worker): should authorize as customer owner when round.customerId === userId', async () => {
      mockPrisma.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        serviceRequestId: requestId,
        customerId: 'dual-user-1',
      });

      const req = createMockReq({
        'x-user-id': 'dual-user-1',
        'x-user-roles': 'customer,worker',
      });
      const res = createMockRes();

      await controller.streamEvents(requestId, req, res);

      expect(mockSseService.registerClient).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId,
          userId: 'dual-user-1',
          roles: ['customer', 'worker'],
        }),
      );
      // Owner does not need worker eligibility verification
      expect(mockVerifier.verifyEligibility).not.toHaveBeenCalled();
    });

    it('Dual-role (Customer+Worker): should authorize as worker when round.customerId !== userId and worker is eligible', async () => {
      mockPrisma.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        serviceRequestId: requestId,
        customerId: 'other-customer',
      });
      mockPrisma.bid.findFirst.mockResolvedValue(null);
      mockVerifier.verifyEligibility.mockResolvedValue({ eligible: true });

      const req = createMockReq({
        'x-user-id': 'dual-worker-1',
        'x-user-roles': 'customer,worker',
      });
      const res = createMockRes();

      await controller.streamEvents(requestId, req, res);

      expect(mockVerifier.verifyEligibility).toHaveBeenCalledWith(
        requestId,
        'dual-worker-1',
      );
      expect(mockSseService.registerClient).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId,
          userId: 'dual-worker-1',
          roles: ['customer', 'worker'],
        }),
      );
    });

    it('Dual-role (Customer+Worker): should reject with ForbiddenException when round.customerId !== userId and worker is ineligible', async () => {
      mockPrisma.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        serviceRequestId: requestId,
        customerId: 'other-customer',
      });
      mockPrisma.bid.findFirst.mockResolvedValue(null);
      mockVerifier.verifyEligibility.mockRejectedValue(
        new ForbiddenException('Thợ không đủ điều kiện'),
      );

      const req = createMockReq({
        'x-user-id': 'dual-worker-2',
        'x-user-roles': 'customer,worker',
      });
      const res = createMockRes();

      await expect(
        controller.streamEvents(requestId, req, res),
      ).rejects.toThrow(ForbiddenException);
    });

    it('Unrecognized role: should fail closed and throw ForbiddenException', async () => {
      mockPrisma.biddingRound.findUnique.mockResolvedValue({
        id: 'round-1',
        serviceRequestId: requestId,
        customerId: 'other-customer',
      });

      const req = createMockReq({
        'x-user-id': 'guest-1',
        'x-user-roles': 'guest',
      });
      const res = createMockRes();

      await expect(
        controller.streamEvents(requestId, req, res),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
