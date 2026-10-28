import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CustomerMatchingController } from '../src/controllers/customer-matching.controller.js';
import { InternalMatchingController } from '../src/controllers/internal-matching.controller.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AuthenticatedUser } from '@app/auth';

describe('Matching REST API Controllers', () => {
  let mockMatchRunRepo: any;
  let mockProjectionService: any;
  let mockCandidateProvider: any;
  let customerController: CustomerMatchingController;
  let internalController: InternalMatchingController;

  const mockCustomerUser: AuthenticatedUser = {
    accountId: 'acc-cust-1',
    userId: 'cust-123',
    sessionId: 'sess-1',
    roles: ['Customer'],
    permissions: [],
  };

  const mockOtherUser: AuthenticatedUser = {
    accountId: 'acc-other',
    userId: 'other-user',
    sessionId: 'sess-2',
    roles: ['Customer'],
    permissions: [],
  };

  const mockAdminUser: AuthenticatedUser = {
    accountId: 'acc-admin',
    userId: 'admin-123',
    sessionId: 'sess-3',
    roles: ['Admin'],
    permissions: [],
  };

  const mockWorkerUser: AuthenticatedUser = {
    accountId: 'acc-worker',
    userId: 'worker-456',
    sessionId: 'sess-4',
    roles: ['Worker'],
    permissions: [],
  };

  beforeEach(() => {
    mockMatchRunRepo = {
      getLatestCompletedRun: vi.fn(),
      getLatestRun: vi.fn(),
      getResultById: vi.fn(),
    };

    mockProjectionService = {
      getProjection: vi.fn(),
      findMatchingRequestsForWorker: vi.fn(),
    };

    mockCandidateProvider = {
      getWorkerMatchProfile: vi.fn(),
    };

    customerController = new CustomerMatchingController(
      mockMatchRunRepo,
      mockProjectionService,
      mockCandidateProvider,
    );

    internalController = new InternalMatchingController(
      mockMatchRunRepo,
      mockProjectionService,
    );
  });

  describe('CustomerMatchingController - GET /matching/requests/:id/recommendations', () => {
    it('should return Top 5 recommendations to the request owner', async () => {
      mockProjectionService.getProjection.mockResolvedValueOnce({
        id: 'req-1',
        customerUserId: 'cust-123',
        matchingRevision: 1,
        status: 'open_for_bidding',
      });

      // 7 results in DB (persisted up to 20)
      const results = [1, 2, 3, 4, 5, 6, 7].map((rank) => ({
        id: `res-${rank}`,
        workerUserId: `worker-${rank}`,
        rank,
        matchingScore: 100 - rank * 5,
      }));

      mockMatchRunRepo.getLatestCompletedRun.mockResolvedValueOnce({
        id: 'run-1',
        serviceRequestId: 'req-1',
        requestRevision: 1,
        status: 'completed',
        displayLimit: 5,
        results,
        createdAt: new Date(),
        completedAt: new Date(),
        modelVersion: 'mock-ai-v1.0',
      });

      const response = await customerController.getRecommendations(
        'req-1',
        mockCustomerUser,
      );

      expect(response.statusCode).toBe(200);
      expect(response.data.status).toBe('completed');
      expect(response.data.displayLimit).toBe(5);
      // Strictly limited to Top 5 for customer display
      expect(response.data.recommendations).toHaveLength(5);
      expect(response.data.recommendations[0].workerUserId).toBe('worker-1');
      expect(response.data.recommendations[4].workerUserId).toBe('worker-5');
    });

    it('should throw 403 Forbidden if non-owner Customer tries to access recommendations', async () => {
      mockProjectionService.getProjection.mockResolvedValueOnce({
        id: 'req-1',
        customerUserId: 'cust-123',
        status: 'open_for_bidding',
      });

      await expect(
        customerController.getRecommendations('req-1', mockOtherUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow Admin user to access any request recommendations', async () => {
      mockProjectionService.getProjection.mockResolvedValueOnce({
        id: 'req-1',
        customerUserId: 'cust-123',
        status: 'open_for_bidding',
      });

      mockMatchRunRepo.getLatestCompletedRun.mockResolvedValueOnce({
        id: 'run-1',
        requestRevision: 1,
        status: 'completed',
        displayLimit: 5,
        results: [],
        createdAt: new Date(),
      });

      const response = await customerController.getRecommendations(
        'req-1',
        mockAdminUser,
      );
      expect(response.statusCode).toBe(200);
      expect(response.data.status).toBe('completed');
    });

    it('should not expose active recommendations if request is cancelled', async () => {
      mockProjectionService.getProjection.mockResolvedValueOnce({
        id: 'req-1',
        customerUserId: 'cust-123',
        matchingRevision: 1,
        status: 'cancelled',
      });

      const response = await customerController.getRecommendations(
        'req-1',
        mockCustomerUser,
      );
      expect(response.statusCode).toBe(200);
      expect(response.data.status).toBe('cancelled');
      expect(response.data.recommendations).toHaveLength(0);
      expect(mockMatchRunRepo.getLatestCompletedRun).not.toHaveBeenCalled();
    });
  });

  describe('CustomerMatchingController - GET /matching/me/requests', () => {
    it('should allow verified worker to discover matching open requests', async () => {
      mockCandidateProvider.getWorkerMatchProfile.mockResolvedValueOnce({
        workerUserId: 'worker-456',
        workerProfileId: 'profile-456',
        isVerified: true,
        serviceIds: ['srv-plumbing'],
        serviceAreas: [{ latitude: 10.77, longitude: 106.7, radiusKm: 15.0 }],
      });

      mockProjectionService.findMatchingRequestsForWorker.mockResolvedValueOnce({
        items: [
          {
            id: 'req-10',
            requestCode: 'REQ-10',
            serviceId: 'srv-plumbing',
            description: 'Sửa bồn rửa chén',
            distanceKm: 3.2,
            createdAt: new Date(),
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
      });

      const response = await customerController.getDiscoverableRequests(
        mockWorkerUser,
        '1',
        '10',
      );

      expect(response.statusCode).toBe(200);
      expect(response.data.items).toHaveLength(1);
      expect(response.data.items[0].id).toBe('req-10');
      expect(response.data.items[0].distanceKm).toBe(3.2);
    });

    it('should throw 403 Forbidden if worker is unverified', async () => {
      mockCandidateProvider.getWorkerMatchProfile.mockResolvedValueOnce({
        workerUserId: 'worker-456',
        workerProfileId: 'profile-456',
        isVerified: false,
        serviceIds: [],
        serviceAreas: [],
      });

      await expect(
        customerController.getDiscoverableRequests(mockWorkerUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('InternalMatchingController - GET /internal/matching/requests/:id/recommendations', () => {
    it('should return up to Top 20 recommendations for Gateway/BFF', async () => {
      const results = Array.from({ length: 15 }, (_, i) => ({
        id: `res-${i + 1}`,
        workerUserId: `worker-${i + 1}`,
        rank: i + 1,
        matchingScore: 99 - i * 2,
        scoreBreakdown: { semanticScore: 90, geoScore: 90, ratingScore: 90, experienceScore: 90, completionScore: 90 },
      }));

      mockMatchRunRepo.getLatestCompletedRun.mockResolvedValueOnce({
        id: 'run-1',
        serviceRequestId: 'req-1',
        requestRevision: 1,
        status: 'completed',
        candidateCount: 15,
        results,
        createdAt: new Date(),
        completedAt: new Date(),
        modelVersion: 'mock-ai-v1.0',
      });

      const response = await internalController.getInternalRecommendations('req-1');

      expect(response.resultCount).toBe(15);
      expect(response.recommendations).toHaveLength(15);
      expect(response.recommendations[0].rank).toBe(1);
      expect(response.recommendations[14].rank).toBe(15);
    });

    it('should throw 404 NotFound if no completed run exists', async () => {
      mockMatchRunRepo.getLatestCompletedRun.mockResolvedValueOnce(null);

      await expect(
        internalController.getInternalRecommendations('req-not-found'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('InternalMatchingController - GET /internal/matching/results/:id/eligibility', () => {
    it('should return isEligible = true when result matches request, worker, and revision', async () => {
      mockMatchRunRepo.getResultById.mockResolvedValueOnce({
        id: 'res-valid',
        workerUserId: 'worker-1',
        matchingScore: 95.0,
        matchRun: {
          serviceRequestId: 'req-1',
          requestRevision: 1,
        },
      });

      mockMatchRunRepo.getLatestCompletedRun.mockResolvedValueOnce({
        requestRevision: 1, // matches current revision
      });

      mockProjectionService.getProjection.mockResolvedValueOnce({
        status: 'open_for_bidding',
      });

      const response = await internalController.checkResultEligibility(
        'res-valid',
        'req-1',
        'worker-1',
      );

      expect(response.isEligible).toBe(true);
      expect(response.matchResultId).toBe('res-valid');
      expect(response.matchingScore).toBe(95.0);
    });

    it('should return isEligible = false if result does not exist', async () => {
      mockMatchRunRepo.getResultById.mockResolvedValueOnce(null);

      const response = await internalController.checkResultEligibility('res-missing');
      expect(response.isEligible).toBe(false);
      expect(response.reason).toContain('không tồn tại');
    });

    it('should return isEligible = false if workerUserId does not match', async () => {
      mockMatchRunRepo.getResultById.mockResolvedValueOnce({
        id: 'res-1',
        workerUserId: 'worker-A',
        matchRun: {
          serviceRequestId: 'req-1',
          requestRevision: 1,
        },
      });

      const response = await internalController.checkResultEligibility(
        'res-1',
        'req-1',
        'worker-B', // Expected worker-B, but result is worker-A
      );

      expect(response.isEligible).toBe(false);
      expect(response.reason).toContain('Mismatched workerUserId');
    });

    it('should return isEligible = false if result belongs to a stale revision', async () => {
      mockMatchRunRepo.getResultById.mockResolvedValueOnce({
        id: 'res-stale',
        workerUserId: 'worker-1',
        matchRun: {
          serviceRequestId: 'req-1',
          requestRevision: 1, // Result from revision 1
        },
      });

      mockMatchRunRepo.getLatestCompletedRun.mockResolvedValueOnce({
        requestRevision: 2, // Latest completed revision is revision 2!
      });

      const response = await internalController.checkResultEligibility(
        'res-stale',
        'req-1',
        'worker-1',
      );

      expect(response.isEligible).toBe(false);
      expect(response.reason).toContain('đã bị thay thế bởi revision 2');
    });
  });
});
