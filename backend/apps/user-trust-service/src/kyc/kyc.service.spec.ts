import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KycService } from './kyc.service.js';
import { EVENT_PATTERNS } from '@app/common';

describe('KycService', () => {
  let service: KycService;
  let repoMock: any;
  let rabbitmqMock: any;

  beforeEach(() => {
    repoMock = {
      findWorkerByUserId: vi.fn(),
      findJobById: vi.fn(),
      findJobByIdempotencyKey: vi.fn(),
      findCaseById: vi.fn(),
      createKycCaseAndJob: vi.fn(),
      markJobProcessing: vi.fn(),
      recordJobSuccessAndMoveToReview: vi.fn(),
      recordJobFailure: vi.fn(),
      reviewKycCaseByAdmin: vi.fn(),
      listKycCases: vi.fn(),
    };

    rabbitmqMock = {
      emit: vi.fn().mockResolvedValue(true),
    };

    service = new KycService(repoMock, rabbitmqMock);
  });

  describe('submitKyc', () => {
    it('creates KYC case, job, and returns 202 Accepted', async () => {
      repoMock.findJobByIdempotencyKey.mockResolvedValue(null);
      repoMock.findWorkerByUserId.mockResolvedValue(null);
      repoMock.createKycCaseAndJob.mockResolvedValue({
        kycCase: { id: 'case-1', createdAt: new Date() },
        job: { id: 'job-1' },
        jobPayload: { jobId: 'job-1', kycCaseId: 'case-1' },
      });

      const res = await service.submitKyc('user-1', {
        idDocumentType: 'CCCD',
        documentFrontRef: 'https://example.com/front.jpg',
        selfieRef: 'https://example.com/selfie.jpg',
      });

      expect(res.statusCode).toBe(202);
      expect(res.data.kycCaseId).toBe('case-1');
      expect(res.data.jobId).toBe('job-1');
      expect(res.data.status).toBe('queued');
      expect(rabbitmqMock.emit).toHaveBeenCalledWith(
        EVENT_PATTERNS.KYC_JOB_PROCESS,
        expect.objectContaining({ jobId: 'job-1' }),
      );
    });

    it('returns existing job immediately when Idempotency-Key matches', async () => {
      repoMock.findJobByIdempotencyKey.mockResolvedValue({
        id: 'job-existing',
        kycCaseId: 'case-existing',
        status: 'pending',
        createdAt: new Date(),
      });

      const res = await service.submitKyc(
        'user-1',
        {
          idDocumentType: 'CCCD',
          documentFrontRef: 'https://example.com/front.jpg',
          selfieRef: 'https://example.com/selfie.jpg',
        },
        'idempotent-key-123',
      );

      expect(res.statusCode).toBe(202);
      expect(res.data.jobId).toBe('job-existing');
      expect(res.message).toContain('Idempotent');
      expect(repoMock.createKycCaseAndJob).not.toHaveBeenCalled();
    });

    it('returns 202 with existing job if user already has an active pending submission', async () => {
      repoMock.findWorkerByUserId.mockResolvedValue({
        kycCases: [
          {
            id: 'case-active',
            status: 'submitted',
            jobs: [{ id: 'job-active', status: 'pending', createdAt: new Date() }],
          },
        ],
      });

      const res = await service.submitKyc('user-1', {
        idDocumentType: 'CCCD',
        documentFrontRef: 'https://example.com/front.jpg',
        selfieRef: 'https://example.com/selfie.jpg',
      });

      expect(res.statusCode).toBe(202);
      expect(res.data.jobId).toBe('job-active');
      expect(repoMock.createKycCaseAndJob).not.toHaveBeenCalled();
    });
  });

  describe('getMyKycStatus', () => {
    it('returns draft status when user has no worker profile', async () => {
      repoMock.findWorkerByUserId.mockResolvedValue(null);

      const res = await service.getMyKycStatus('user-1');
      expect(res.statusCode).toBe(200);
      expect(res.data.workerStatus).toBe('draft');
      expect(res.data.latestKycCase).toBeNull();
    });

    it('returns worker status and latest case', async () => {
      repoMock.findWorkerByUserId.mockResolvedValue({
        status: 'under_review',
        kycCases: [
          {
            id: 'case-1',
            status: 'reviewing',
            jobs: [{ id: 'job-1', status: 'completed' }],
          },
        ],
      });

      const res = await service.getMyKycStatus('user-1');
      expect(res.statusCode).toBe(200);
      expect(res.data.workerStatus).toBe('under_review');
      expect(res.data.latestKycCase.id).toBe('case-1');
      expect(res.data.activeJob.id).toBe('job-1');
    });
  });

  describe('getKycJobStatus', () => {
    it('throws NotFoundException if job does not exist', async () => {
      repoMock.findJobById.mockResolvedValue(null);

      await expect(service.getKycJobStatus('user-1', 'job-999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if job belongs to another user', async () => {
      repoMock.findJobById.mockResolvedValue({
        id: 'job-1',
        kycCase: {
          workerProfile: { userId: 'different-user' },
        },
      });

      await expect(service.getKycJobStatus('user-1', 'job-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns job status when user is authorized', async () => {
      repoMock.findJobById.mockResolvedValue({
        id: 'job-1',
        kycCaseId: 'case-1',
        status: 'processing',
        retryCount: 0,
        createdAt: new Date(),
        kycCase: {
          workerProfile: { userId: 'user-1' },
        },
      });

      const res = await service.getKycJobStatus('user-1', 'job-1');
      expect(res.statusCode).toBe(200);
      expect(res.data.status).toBe('processing');
    });
  });

  describe('reviewKycCase', () => {
    it('approves case and emits kyc.completed event', async () => {
      repoMock.reviewKycCaseByAdmin.mockResolvedValue({
        id: 'case-1',
        workerProfileId: 'worker-1',
        status: 'approved',
      });

      const res = await service.reviewKycCase('admin-1', 'case-1', {
        decision: 'approved',
        note: 'Valid ID card and photo match',
      });

      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('phê duyệt');
      expect(rabbitmqMock.emit).toHaveBeenCalledWith(
        EVENT_PATTERNS.KYC_COMPLETED,
        expect.objectContaining({
          kycCaseId: 'case-1',
          decision: 'approved',
        }),
      );
    });

    it('rejects case and emits kyc.failed event', async () => {
      repoMock.reviewKycCaseByAdmin.mockResolvedValue({
        id: 'case-1',
        workerProfileId: 'worker-1',
        status: 'rejected',
      });

      const res = await service.reviewKycCase('admin-1', 'case-1', {
        decision: 'rejected',
        note: 'Image is too blurry',
      });

      expect(res.statusCode).toBe(200);
      expect(res.message).toContain('từ chối');
      expect(rabbitmqMock.emit).toHaveBeenCalledWith(
        EVENT_PATTERNS.KYC_FAILED,
        expect.objectContaining({
          kycCaseId: 'case-1',
          decision: 'rejected',
        }),
      );
    });

    it('throws BadRequestException if reviewing fails or already finalized', async () => {
      repoMock.reviewKycCaseByAdmin.mockRejectedValue(
        new Error('Hồ sơ KYC đã được xử lý trước đó'),
      );

      await expect(
        service.reviewKycCase('admin-1', 'case-1', { decision: 'approved' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
