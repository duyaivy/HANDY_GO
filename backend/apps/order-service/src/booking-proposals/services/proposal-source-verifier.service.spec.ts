import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { WorkerSelectionSource } from '@prisma/order-client';
import { ProposalSourceVerifierService } from './proposal-source-verifier.service.js';
import type { ConfigService } from '@app/config';

describe('ProposalSourceVerifierService (BE-10)', () => {
  let service: ProposalSourceVerifierService;
  let configMock: {
    get: ReturnType<typeof vi.fn>;
    internalServiceSecret: string;
    isProduction: boolean;
  };

  const originalFetch = globalThis.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    globalThis.fetch = mockFetch;
    configMock = {
      get: vi.fn((key: string) => {
        if (key === 'BIDDING_SERVICE_URL') return 'http://localhost:3003';
        if (key === 'ORDER_ENABLE_MOCK_VERIFIER') return 'false';
        return undefined;
      }),
      internalServiceSecret: 'secret-12345',
      isProduction: false,
    };

    service = new ProposalSourceVerifierService(configMock as unknown as ConfigService);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('Production safety & mock prevention', () => {
    it('throws critical security violation when mock verifier is enabled in production', () => {
      configMock.isProduction = true;
      configMock.get = vi.fn((key: string) => {
        if (key === 'ORDER_ENABLE_MOCK_VERIFIER') return 'true';
        return undefined;
      });

      expect(() => new ProposalSourceVerifierService(configMock as unknown as ConfigService)).toThrow(
        'CRITICAL SECURITY VIOLATION: Mock verifier cannot be enabled in production environments.',
      );
    });

    it('allows mock verifier in non-production when explicitly enabled', async () => {
      configMock.isProduction = false;
      configMock.get = vi.fn((key: string) => {
        if (key === 'ORDER_ENABLE_MOCK_VERIFIER') return 'true';
        return undefined;
      });

      const devService = new ProposalSourceVerifierService(configMock as unknown as ConfigService);
      await expect(
        devService.verifyProposalSource({
          selectionSource: WorkerSelectionSource.bid,
          serviceRequestId: 'req-1',
          workerUserId: 'worker-1',
          sourceBidId: 'bid-dev-mock-1',
        }),
      ).resolves.not.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Real run: Bid source verification against Bidding Service', () => {
    const validParams = {
      selectionSource: WorkerSelectionSource.bid,
      serviceRequestId: 'req-1111',
      workerUserId: 'worker-2222',
      sourceBidId: 'bid-3333',
    };

    it('passes when Bidding Service returns 200 with eligible=true', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {
            eligible: true,
            bid: { id: 'bid-3333', amount: 300000 },
          },
        }),
      });

      await expect(service.verifyProposalSource(validParams)).resolves.not.toThrow();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3003/api/v1/internal/bids/bid-3333/eligibility?requestId=req-1111&workerId=worker-2222',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-internal-secret': 'secret-12345',
          }),
        }),
      );
    });

    it('throws 400 when Bidding Service returns 200 with eligible=false (bid expired or status inactive)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          data: {
            eligible: false,
            reason: 'Báo giá đã hết hạn hiệu lực',
          },
        }),
      });

      await expect(service.verifyProposalSource(validParams)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Báo giá đã hết hạn hiệu lực',
      });
    });

    it('throws 400 when Bidding Service returns 404/400 (bid not found or mismatched request/worker)', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 404,
        json: async () => ({
          message: 'Báo giá không tồn tại',
        }),
      });

      await expect(service.verifyProposalSource(validParams)).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: 'Báo giá không tồn tại',
      });
    });

    it('throws 503 fail-closed when Bidding Service returns 500 error', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 500,
      });

      await expect(service.verifyProposalSource(validParams)).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    });

    it('throws 503 fail-closed when Bidding Service call times out or throws network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection timeout'));

      await expect(service.verifyProposalSource(validParams)).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    });
  });

  describe('Real run: Recommendation source verification (fail-closed for Matching)', () => {
    it('strictly fails-closed on real run when recommendation is selected because Matching lacks contract', async () => {
      await expect(
        service.verifyProposalSource({
          selectionSource: WorkerSelectionSource.recommendation,
          serviceRequestId: 'req-1',
          workerUserId: 'worker-1',
          sourceMatchResultId: 'match-1',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('chưa có hợp đồng xác thực'),
      });
    });
  });
});
