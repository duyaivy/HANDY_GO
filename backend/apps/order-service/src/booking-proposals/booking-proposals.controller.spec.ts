import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { BookingProposalsController } from './booking-proposals.controller.js';
import type { BookingProposalsService } from './booking-proposals.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { CreateBookingProposalDto } from './dto/create-booking-proposal.dto.js';
import type { RequestChangesProposalDto } from './dto/request-changes-proposal.dto.js';
import type { RejectProposalDto } from './dto/reject-proposal.dto.js';
import type { QueryBookingProposalDto } from './dto/query-booking-proposal.dto.js';

describe('BookingProposalsController', () => {
  let controller: BookingProposalsController;
  let serviceMock: {
    create: ReturnType<typeof vi.fn>;
    findAll: ReturnType<typeof vi.fn>;
    findMyReceivedProposals: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    findByServiceRequestId: ReturnType<typeof vi.fn>;
    requestChanges: ReturnType<typeof vi.fn>;
    reject: ReturnType<typeof vi.fn>;
    withdraw: ReturnType<typeof vi.fn>;
  };
  let ordersServiceMock: {
    acceptProposal: ReturnType<typeof vi.fn>;
  };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockWorkerId = '22222222-2222-2222-2222-222222222222';
  const mockProposalId = '33333333-3333-3333-3333-333333333333';
  const mockRequestId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    serviceMock = {
      create: vi.fn(),
      findAll: vi.fn(),
      findMyReceivedProposals: vi.fn(),
      findById: vi.fn(),
      findByServiceRequestId: vi.fn(),
      requestChanges: vi.fn(),
      reject: vi.fn(),
      withdraw: vi.fn(),
    };

    ordersServiceMock = {
      acceptProposal: vi.fn(),
    };

    controller = new BookingProposalsController(
      serviceMock as unknown as BookingProposalsService,
      ordersServiceMock as unknown as OrdersService,
    );
  });

  describe('create', () => {
    it('should create proposal and return 201 wrapped response', async () => {
      const dto: CreateBookingProposalDto = {
        serviceRequestId: mockRequestId,
        workerUserId: mockWorkerId,
        selectionSource: 'bid' as any,
        sourceBidId: '55555555-5555-5555-5555-555555555555',
        agreedPrice: 200000,
        agreedScope: 'Ghi chú',
      };
      const created = { id: mockProposalId, ...dto, revisionNo: 1 };
      serviceMock.create.mockResolvedValue(created);

      const response = await controller.create(mockUserId, dto);

      expect(serviceMock.create).toHaveBeenCalledWith(mockUserId, dto);
      expect(response.statusCode).toBe(HttpStatus.CREATED);
      expect(response.message).toBe('Booking proposal created successfully');
      expect(response.data).toEqual(created);
    });

    it('should throw BadRequestException when autoAccept=true is provided (BE-01)', async () => {
      const dto: CreateBookingProposalDto = {
        serviceRequestId: mockRequestId,
        workerUserId: mockWorkerId,
        selectionSource: 'bid' as any,
        sourceBidId: '55555555-5555-5555-5555-555555555555',
        agreedPrice: 200000,
        agreedScope: 'Ghi chú',
        autoAccept: true,
      };

      await expect(controller.create(mockUserId, dto)).rejects.toThrow(
        'autoAccept=true is not supported. Booking proposals must be accepted by the assigned worker.',
      );
      expect(serviceMock.create).not.toHaveBeenCalled();
      expect(ordersServiceMock.acceptProposal).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated proposals for current user', async () => {
      const query: QueryBookingProposalDto = { page: 1, limit: 10 };
      const paginated = {
        items: [{ id: mockProposalId }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      serviceMock.findAll.mockResolvedValue(paginated);

      const user = { userId: mockUserId, roles: ['Customer'], permissions: [] };
      const response = await controller.findAll(user, query);

      expect(serviceMock.findAll).toHaveBeenCalledWith(mockUserId, query, ['Customer']);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(paginated);
    });
  });

  describe('findMyReceived', () => {
    it('should return received proposals for worker', async () => {
      const query: QueryBookingProposalDto = { page: 1, limit: 10 };
      const paginated = {
        items: [{ id: mockProposalId, workerUserId: mockWorkerId }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      serviceMock.findMyReceivedProposals.mockResolvedValue(paginated);

      const response = await controller.findMyReceived(mockWorkerId, query);

      expect(serviceMock.findMyReceivedProposals).toHaveBeenCalledWith(mockWorkerId, query);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('should return details of proposal', async () => {
      const detail = { id: mockProposalId, revisionNo: 1 };
      serviceMock.findById.mockResolvedValue(detail);

      const user = { userId: mockUserId, roles: ['Customer'], permissions: [] };
      const response = await controller.findOne(mockProposalId, user);

      expect(serviceMock.findById).toHaveBeenCalledWith(mockProposalId, mockUserId, ['Customer']);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(detail);
    });
  });

  describe('requestChanges', () => {
    it('should record changes requested and return 200 wrapped response', async () => {
      const dto: RequestChangesProposalDto = {
        responseNote: 'Vui lòng tăng giá thêm 50k do địa điểm xa',
      };
      const updated = {
        id: mockProposalId,
        status: 'changes_requested',
        responseNote: dto.responseNote,
      };
      serviceMock.requestChanges.mockResolvedValue(updated);

      const response = await controller.requestChanges(mockProposalId, mockWorkerId, dto);

      expect(serviceMock.requestChanges).toHaveBeenCalledWith(mockProposalId, mockWorkerId, dto);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Change request recorded successfully');
      expect(response.data).toEqual(updated);
    });
  });

  describe('reject', () => {
    it('should record worker rejection and return 200 wrapped response', async () => {
      const dto: RejectProposalDto = {
        responseNote: 'Bận lịch trình',
      };
      const rejected = {
        id: mockProposalId,
        status: 'worker_rejected',
        responseNote: dto.responseNote,
      };
      serviceMock.reject.mockResolvedValue(rejected);

      const response = await controller.reject(mockProposalId, mockWorkerId, dto);

      expect(serviceMock.reject).toHaveBeenCalledWith(mockProposalId, mockWorkerId, dto);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Booking proposal rejected successfully');
      expect(response.data).toEqual(rejected);
    });
  });

  describe('withdraw', () => {
    it('should record customer withdrawal and return 200 wrapped response', async () => {
      const withdrawn = {
        id: mockProposalId,
        status: 'withdrawn',
      };
      serviceMock.withdraw.mockResolvedValue(withdrawn);

      const response = await controller.withdraw(mockProposalId, mockUserId);

      expect(serviceMock.withdraw).toHaveBeenCalledWith(mockProposalId, mockUserId);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Booking proposal withdrawn successfully');
      expect(response.data).toEqual(withdrawn);
    });
  });

  describe('accept', () => {
    it('should accept proposal, call ordersService.acceptProposal and return 200 wrapped response', async () => {
      const order = {
        id: '55555555-5555-5555-5555-555555555555',
        orderCode: 'ORD-20261023-A1B2',
        status: 'created',
      };
      ordersServiceMock.acceptProposal.mockResolvedValue(order);

      const response = await controller.accept(mockProposalId, mockWorkerId);

      expect(ordersServiceMock.acceptProposal).toHaveBeenCalledWith(
        mockProposalId,
        mockWorkerId,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe(
        'Booking proposal accepted and order created successfully',
      );
      expect(response.data).toEqual(order);
    });
  });
});
