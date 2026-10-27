import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { AppException } from '@app/common';
import {
  BookingProposalStatus,
  RequestStatus,
  WorkerSelectionSource,
} from '@prisma/order-client';
import { BookingProposalsService } from './booking-proposals.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';

describe('BookingProposalsService', () => {
  let service: BookingProposalsService;
  let prismaMock: any;
  let verifierMock: {
    verifyProposalSource: ReturnType<typeof vi.fn>;
  };

  const mockCustomerId = '11111111-1111-1111-1111-111111111111';
  const mockWorkerId = '22222222-2222-2222-2222-222222222222';
  const mockRequestId = '33333333-3333-3333-3333-333333333333';
  const mockProposalId = '44444444-4444-4444-4444-444444444444';

  const validFutureDate = new Date(Date.now() + 24 * 3600 * 1000);

  const mockOpenRequest = {
    id: mockRequestId,
    requestCode: 'REQ-20261023-A1B2',
    customerUserId: mockCustomerId,
    status: RequestStatus.open_for_bidding,
    selectionExpiresAt: validFutureDate,
  };

  beforeEach(() => {
    let lastProposalUpdatedData: any = null;

    prismaMock = {
      $transaction: vi.fn(async (cb) => cb(prismaMock)),
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
      serviceRequest: {
        findUnique: vi.fn().mockResolvedValue(mockOpenRequest),
        findUniqueOrThrow: vi.fn(async (args) => (await prismaMock.serviceRequest.findUnique(args)) ?? mockOpenRequest),
      },
      bookingProposal: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(async (args) => {
          const current = await prismaMock.bookingProposal.findUnique(args);
          if (lastProposalUpdatedData && current) {
            return { ...current, ...lastProposalUpdatedData };
          }
          return current;
        }),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(async ({ data }: any) => {
          lastProposalUpdatedData = data;
          return { count: 1 };
        }),
      },
    };

    verifierMock = {
      verifyProposalSource: vi.fn().mockResolvedValue(undefined),
    };

    const outboxRepoMock = {
      createEvent: vi.fn().mockResolvedValue(undefined),
    };

    service = new BookingProposalsService(
      prismaMock as unknown as PrismaService,
      verifierMock as any,
      outboxRepoMock as any,
    );
  });

  describe('create', () => {
    it('should create revision 1 proposal from bid source', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);
      prismaMock.bookingProposal.findFirst.mockResolvedValue(null);

      const dto = {
        serviceRequestId: mockRequestId,
        workerUserId: mockWorkerId,
        selectionSource: WorkerSelectionSource.bid,
        sourceBidId: 'bid-uuid-1',
        agreedPrice: 200000,
        agreedScope: 'Sửa điện',
      };

      const mockCreated = {
        id: mockProposalId,
        ...dto,
        revisionNo: 1,
        status: BookingProposalStatus.proposed,
      };

      prismaMock.bookingProposal.create.mockResolvedValue(mockCreated);

      const result = await service.create(mockCustomerId, dto);

      expect(prismaMock.bookingProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            serviceRequestId: mockRequestId,
            workerUserId: mockWorkerId,
            customerUserId: mockCustomerId,
            revisionNo: 1,
            selectionSource: WorkerSelectionSource.bid,
            sourceBidId: 'bid-uuid-1',
            status: BookingProposalStatus.proposed,
          }),
        }),
      );
      expect(result).toEqual(mockCreated);
    });

    it('should create revision 1 proposal from recommendation source', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);
      prismaMock.bookingProposal.findFirst.mockResolvedValue(null);

      const dto = {
        serviceRequestId: mockRequestId,
        workerUserId: mockWorkerId,
        selectionSource: WorkerSelectionSource.recommendation,
        sourceMatchResultId: 'match-uuid-1',
        agreedPrice: 300000,
        agreedScope: 'Sửa nước',
      };

      prismaMock.bookingProposal.create.mockResolvedValue({ id: 'prop-rec', ...dto });

      const result = await service.create(mockCustomerId, dto);

      expect(prismaMock.bookingProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            selectionSource: WorkerSelectionSource.recommendation,
            sourceMatchResultId: 'match-uuid-1',
          }),
        }),
      );
      expect(result).toHaveProperty('id', 'prop-rec');
    });

    it('should throw 404 if service request does not exist', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(null);

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: 'non-existent',
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toThrow(AppException);
    });

    it('should throw 403 if caller is not request owner', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);

      await expect(
        service.create('other-user-id', {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toThrow(AppException);
    });

    it('should throw 400 if request is draft', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        ...mockOpenRequest,
        status: RequestStatus.draft,
      });

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toThrow(AppException);
    });

    it('should throw 409 if request is already converted to order', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        ...mockOpenRequest,
        status: RequestStatus.converted_to_order,
      });

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toThrow(AppException);
    });

    it('should throw 400 if selection window has expired', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        ...mockOpenRequest,
        selectionExpiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      });

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toThrow(AppException);
    });

    it('should throw 400 if selectionSource is bid but sourceBidId is missing', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toThrow(AppException);
    });

    it('should throw 400 if autoAccept=true is passed (BE-01)', async () => {
      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
          autoAccept: true,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('autoAccept=true is not supported'),
      });
    });

    it('should throw 400 if both sourceBidId and sourceMatchResultId are provided (BE-10 XOR)', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          sourceMatchResultId: 'match-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('Both sourceBidId and sourceMatchResultId were provided'),
      });
    });

    it('should throw 400 if neither sourceBidId nor sourceMatchResultId is provided (BE-10 XOR)', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('Either sourceBidId or sourceMatchResultId must be provided'),
      });
    });

    it('should throw 400 if selectionSource is recommendation but sourceBidId is sent (BE-10 XOR)', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.recommendation,
          sourceBidId: 'bid-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.BAD_REQUEST,
        message: expect.stringContaining('sourceMatchResultId is required'),
      });
    });

    it('should throw error when proposalSourceVerifier fails (fail-closed)', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);
      verifierMock.verifyProposalSource.mockRejectedValueOnce(
        new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'Verifier outage'),
      );

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    });

    it('should throw 409 if an active proposed proposal already exists for this worker', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);
      prismaMock.bookingProposal.findFirst.mockResolvedValue({ id: 'existing-prop' });

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toThrow(AppException);
    });

    it('should create revision 2 when supersedesProposalId is provided and old proposal is changes_requested', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);

      const oldProposal = {
        id: 'old-prop-1',
        serviceRequestId: mockRequestId,
        workerUserId: mockWorkerId,
        revisionNo: 1,
        status: BookingProposalStatus.changes_requested,
        supersededBy: null,
      };

      prismaMock.bookingProposal.findUnique.mockResolvedValue(oldProposal);

      const dto = {
        serviceRequestId: mockRequestId,
        workerUserId: mockWorkerId,
        selectionSource: WorkerSelectionSource.bid,
        sourceBidId: 'bid-1',
        agreedPrice: 250000,
        agreedScope: 'Sửa điện theo yêu cầu',
        supersedesProposalId: 'old-prop-1',
      };

      prismaMock.bookingProposal.create.mockResolvedValue({
        id: 'new-prop-2',
        ...dto,
        revisionNo: 2,
        status: BookingProposalStatus.proposed,
      });

      const result = await service.create(mockCustomerId, dto);

      expect(prismaMock.bookingProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            revisionNo: 2,
            supersedesProposalId: 'old-prop-1',
          }),
        }),
      );
      expect(result.revisionNo).toBe(2);
    });

    it('should throw 409 if superseded proposal is not changes_requested', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);

      prismaMock.bookingProposal.findUnique.mockResolvedValue({
        id: 'old-prop-1',
        serviceRequestId: mockRequestId,
        workerUserId: mockWorkerId,
        revisionNo: 1,
        status: BookingProposalStatus.proposed, // not changes_requested
        supersededBy: null,
      });

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 250000,
          agreedScope: 'Scope',
          supersedesProposalId: 'old-prop-1',
        }),
      ).rejects.toThrow(AppException);
    });

    it('should throw 409 if superseded proposal is already superseded', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);

      prismaMock.bookingProposal.findUnique.mockResolvedValue({
        id: 'old-prop-1',
        serviceRequestId: mockRequestId,
        workerUserId: mockWorkerId,
        revisionNo: 1,
        status: BookingProposalStatus.changes_requested,
        supersededBy: { id: 'already-superseded-by' },
      });

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.bid,
          sourceBidId: 'bid-1',
          agreedPrice: 250000,
          agreedScope: 'Scope',
          supersedesProposalId: 'old-prop-1',
        }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('findAll', () => {
    it('should query proposals involving user', async () => {
      prismaMock.bookingProposal.count.mockResolvedValue(1);
      prismaMock.bookingProposal.findMany.mockResolvedValue([{ id: mockProposalId }]);

      const result = await service.findAll(mockCustomerId, { page: 1, limit: 10 });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('findMyReceivedProposals', () => {
    it('should filter by workerUserId', async () => {
      prismaMock.bookingProposal.count.mockResolvedValue(1);
      prismaMock.bookingProposal.findMany.mockResolvedValue([{ id: mockProposalId }]);

      const result = await service.findMyReceivedProposals(mockWorkerId, { page: 1, limit: 10 });

      expect(prismaMock.bookingProposal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workerUserId: mockWorkerId }),
        }),
      );
      expect(result.items).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('should return proposal for participant', async () => {
      const proposal = {
        id: mockProposalId,
        customerUserId: mockCustomerId,
        workerUserId: mockWorkerId,
      };

      prismaMock.bookingProposal.findUnique.mockResolvedValue(proposal);

      const result = await service.findById(mockProposalId, mockCustomerId);
      expect(result).toEqual(proposal);
    });

    it('should throw 403 for non-participant', async () => {
      const proposal = {
        id: mockProposalId,
        customerUserId: mockCustomerId,
        workerUserId: mockWorkerId,
      };

      prismaMock.bookingProposal.findUnique.mockResolvedValue(proposal);

      await expect(
        service.findById(mockProposalId, 'stranger-id'),
      ).rejects.toThrow(AppException);
    });

    it('should throw 404 if proposal does not exist', async () => {
      prismaMock.bookingProposal.findUnique.mockResolvedValue(null);

      await expect(
        service.findById(mockProposalId, mockCustomerId),
      ).rejects.toThrow(AppException);
    });
  });

  describe('requestChanges', () => {
    it('should update status to changes_requested and record note', async () => {
      const proposal = {
        id: mockProposalId,
        workerUserId: mockWorkerId,
        status: BookingProposalStatus.proposed,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      };

      prismaMock.bookingProposal.findUnique.mockResolvedValue(proposal);
      prismaMock.bookingProposal.update.mockResolvedValue({
        ...proposal,
        status: BookingProposalStatus.changes_requested,
        responseNote: 'Cần tăng 50k',
      });

      const result = await service.requestChanges(mockProposalId, mockWorkerId, {
        responseNote: 'Cần tăng 50k',
      });

      expect(prismaMock.bookingProposal.updateMany).toHaveBeenCalledWith({
        where: { id: mockProposalId, status: BookingProposalStatus.proposed },
        data: expect.objectContaining({
          status: BookingProposalStatus.changes_requested,
          responseNote: 'Cần tăng 50k',
        }),
      });
      expect(result.status).toBe(BookingProposalStatus.changes_requested);
    });

    it('should throw 409 Conflict if proposal status changed concurrently during requestChanges', async () => {
      const proposal = {
        id: mockProposalId,
        serviceRequestId: mockRequestId,
        workerUserId: mockWorkerId,
        status: BookingProposalStatus.proposed,
        expiresAt: new Date(Date.now() + 60000),
      };

      prismaMock.bookingProposal.findUnique.mockResolvedValue(proposal);
      prismaMock.bookingProposal.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.requestChanges(mockProposalId, mockWorkerId, { responseNote: 'note' }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT });
    });

    it('should throw 403 if caller is not the assigned worker', async () => {
      prismaMock.bookingProposal.findUnique.mockResolvedValue({
        id: mockProposalId,
        workerUserId: mockWorkerId,
        status: BookingProposalStatus.proposed,
      });

      await expect(
        service.requestChanges(mockProposalId, 'different-worker', {
          responseNote: 'test',
        }),
      ).rejects.toThrow(AppException);
    });

    it('should throw 400 if proposal has expired', async () => {
      prismaMock.bookingProposal.findUnique.mockResolvedValue({
        id: mockProposalId,
        workerUserId: mockWorkerId,
        status: BookingProposalStatus.proposed,
        expiresAt: new Date(Date.now() - 60000), // past
      });

      await expect(
        service.requestChanges(mockProposalId, mockWorkerId, {
          responseNote: 'test',
        }),
      ).rejects.toThrow(AppException);
    });
  });

  describe('reject', () => {
    it('should update status to worker_rejected', async () => {
      const proposal = {
        id: mockProposalId,
        workerUserId: mockWorkerId,
        status: BookingProposalStatus.proposed,
      };

      prismaMock.bookingProposal.findUnique.mockResolvedValue(proposal);
      prismaMock.bookingProposal.update.mockResolvedValue({
        ...proposal,
        status: BookingProposalStatus.worker_rejected,
      });

      const result = await service.reject(mockProposalId, mockWorkerId, {
        responseNote: 'Kín lịch',
      });

      expect(result.status).toBe(BookingProposalStatus.worker_rejected);
    });
  });

  describe('withdraw', () => {
    it('should update status to withdrawn', async () => {
      const proposal = {
        id: mockProposalId,
        customerUserId: mockCustomerId,
        status: BookingProposalStatus.proposed,
      };

      prismaMock.bookingProposal.findUnique.mockResolvedValue(proposal);
      prismaMock.bookingProposal.update.mockResolvedValue({
        ...proposal,
        status: BookingProposalStatus.withdrawn,
      });

      const result = await service.withdraw(mockProposalId, mockCustomerId);

      expect(result.status).toBe(BookingProposalStatus.withdrawn);
    });

    it('should throw 403 if caller is not customer owner', async () => {
      prismaMock.bookingProposal.findUnique.mockResolvedValue({
        id: mockProposalId,
        customerUserId: mockCustomerId,
        status: BookingProposalStatus.proposed,
      });

      await expect(
        service.withdraw(mockProposalId, 'other-customer'),
      ).rejects.toThrow(AppException);
    });

    it('should throw 400 if proposal is not proposed', async () => {
      prismaMock.bookingProposal.findUnique.mockResolvedValue({
        id: mockProposalId,
        customerUserId: mockCustomerId,
        status: BookingProposalStatus.changes_requested,
      });

      await expect(
        service.withdraw(mockProposalId, mockCustomerId),
      ).rejects.toThrow(AppException);
    });
  });

  describe('findByServiceRequestId (BE-12)', () => {
    const proposalsList = [
      { id: 'prop-1', workerUserId: mockWorkerId, agreedPrice: 200000 },
      { id: 'prop-2', workerUserId: 'worker-b', agreedPrice: 350000 },
    ];

    it('allows request owner to see all proposals', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockCustomerId,
      });
      prismaMock.bookingProposal.findMany.mockResolvedValue(proposalsList);

      const result = await service.findByServiceRequestId(
        mockRequestId,
        mockCustomerId,
        ['Customer'],
      );

      expect(result).toHaveLength(2);
      expect(result).toEqual(proposalsList);
    });

    it('allows Admin to see all proposals', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockCustomerId,
      });
      prismaMock.bookingProposal.findMany.mockResolvedValue(proposalsList);

      const result = await service.findByServiceRequestId(
        mockRequestId,
        'admin-user',
        ['Admin'],
      );

      expect(result).toHaveLength(2);
    });

    it('throws 403 Forbidden if non-owner is Customer (not a worker)', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockCustomerId,
      });

      await expect(
        service.findByServiceRequestId(mockRequestId, 'other-customer', ['Customer']),
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
      });
    });

    it('filters proposals for Worker so they only see their own proposals', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue({
        id: mockRequestId,
        customerUserId: mockCustomerId,
      });
      prismaMock.bookingProposal.findMany.mockResolvedValue(proposalsList);

      const result = await service.findByServiceRequestId(
        mockRequestId,
        mockWorkerId,
        ['Worker'],
      );

      expect(result).toHaveLength(1);
      expect(result[0].workerUserId).toBe(mockWorkerId);
      expect(result[0].id).toBe('prop-1');
    });
  });
});
