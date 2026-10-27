import { describe, expect, it, vi, beforeEach } from 'vitest';
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
    prismaMock = {
      serviceRequest: {
        findUnique: vi.fn(),
      },
      bookingProposal: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
    };

    service = new BookingProposalsService(prismaMock as unknown as PrismaService);
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

    it('should throw 400 if selectionSource is recommendation but sourceMatchResultId is missing', async () => {
      prismaMock.serviceRequest.findUnique.mockResolvedValue(mockOpenRequest);

      await expect(
        service.create(mockCustomerId, {
          serviceRequestId: mockRequestId,
          workerUserId: mockWorkerId,
          selectionSource: WorkerSelectionSource.recommendation,
          agreedPrice: 100000,
          agreedScope: 'Scope',
        }),
      ).rejects.toThrow(AppException);
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

      expect(prismaMock.bookingProposal.update).toHaveBeenCalledWith({
        where: { id: mockProposalId },
        data: expect.objectContaining({
          status: BookingProposalStatus.changes_requested,
          responseNote: 'Cần tăng 50k',
        }),
      });
      expect(result.status).toBe(BookingProposalStatus.changes_requested);
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
});
