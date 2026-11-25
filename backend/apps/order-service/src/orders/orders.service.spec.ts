import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/order-client';
import { OrdersService } from './orders.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { OrderOutboxRepository } from '../common/outbox/order-outbox.repository.js';
import { ORDER_CONSTANTS } from '../common/constants/order.constants.js';
import { ORDER_ERROR_CODES } from '../common/constants/order-errors.js';
import { DisputeCategory } from './dto/dispute-order.dto.js';
import {
  AdminQueryDisputesDto,
  DisputePreviousStatus,
  DisputeSortBy,
  SortOrder,
} from './dto/admin-query-disputes.dto.js';

describe('OrdersService', () => {
  let service: OrdersService;
  let prismaMock: {
    $transaction: ReturnType<typeof vi.fn>;
    order: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      aggregate: ReturnType<typeof vi.fn>;
    };
    bookingProposal: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    serviceRequest: {
      update: ReturnType<typeof vi.fn>;
    };
    orderStatusHistory: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    orderEvidence: {
      create: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
  };
  let txMock: {
    $queryRaw: ReturnType<typeof vi.fn>;
    bookingProposal: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    serviceRequest: {
      update: ReturnType<typeof vi.fn>;
    };
    order: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    orderEvidence: {
      create: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    orderStatusHistory: {
      create: ReturnType<typeof vi.fn>;
    };
  };
  let outboxRepoMock: {
    createEvent: ReturnType<typeof vi.fn>;
  };

  const mockCustomerId = '11111111-1111-1111-1111-111111111111';
  const mockWorkerId = '22222222-2222-2222-2222-222222222222';
  const mockAdminId = '99999999-9999-9999-9999-999999999999';
  const mockRequestId = '33333333-3333-3333-3333-333333333333';
  const mockProposalId = '44444444-4444-4444-4444-444444444444';
  const mockOrderId = '55555555-5555-5555-5555-555555555555';
  const mockEvidenceId = '66666666-6666-6666-6666-666666666666';
  const mockServiceId = '77777777-7777-7777-7777-777777777777';

  const mockFutureDate = new Date(Date.now() + 24 * 3600 * 1000);
  const mockPastDate = new Date(Date.now() - 3600 * 1000);

  const validServiceRequest = {
    id: mockRequestId,
    requestCode: 'REQ-20261023-A1B2',
    customerUserId: mockCustomerId,
    serviceId: mockServiceId,
    description: 'Sửa đường ống nước',
    scheduledAt: mockFutureDate,
    addressText: '123 Đường Nguyễn Tri Phương, Đà Nẵng',
    latitude: new Prisma.Decimal('16.054407'),
    longitude: new Prisma.Decimal('108.202167'),
    status: 'open_for_bidding',
    selectionExpiresAt: mockFutureDate,
  };

  const validProposal = {
    id: mockProposalId,
    serviceRequestId: mockRequestId,
    customerUserId: mockCustomerId,
    workerUserId: mockWorkerId,
    selectionSource: 'bid',
    sourceBidId: '88888888-8888-8888-8888-888888888888',
    sourceMatchResultId: null,
    agreedPrice: new Prisma.Decimal('350000.00'),
    agreedScope: 'Thay van nước và kiểm tra rò rỉ',
    scheduledAt: mockFutureDate,
    status: 'proposed',
    expiresAt: mockFutureDate,
    serviceRequest: validServiceRequest,
  };

  const validBaseOrder = {
    id: mockOrderId,
    orderCode: 'ORD-20261023-A1B2',
    serviceRequestId: mockRequestId,
    bookingProposalId: mockProposalId,
    customerUserId: mockCustomerId,
    workerUserId: mockWorkerId,
    serviceId: mockServiceId,
    selectionSource: 'bid',
    selectedBidId: '88888888-8888-8888-8888-888888888888',
    selectedMatchResultId: null,
    agreedPrice: new Prisma.Decimal('350000.00'),
    agreedScope: 'Thay van nước và kiểm tra rò rỉ',
    scheduledAt: mockFutureDate,
    addressText: '123 Đường Nguyễn Tri Phương, Đà Nẵng',
    latitude: new Prisma.Decimal('16.054407'),
    longitude: new Prisma.Decimal('108.202167'),
    status: 'created',
    paymentState: 'unpaid',
    confirmedAt: null,
    startedAt: null,
    workerFinishedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    disputedAt: null,
    disputeReason: null,
    disputePreviousStatus: null,
    disputeResolvedAt: null,
    disputeResolutionNote: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    evidences: [],
    statusHistory: [],
  };

  const expectSingleStatusTransition = (
    previousStatus: string,
    nextStatus: string,
    timestampField: 'confirmedAt' | 'startedAt' | 'finishedAt',
  ) => {
    expect(outboxRepoMock.createEvent).toHaveBeenCalledTimes(1);
    expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
        aggregateId: mockOrderId,
        eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
        payload: expect.objectContaining({
          orderId: mockOrderId,
          customerId: mockCustomerId,
          customerUserId: mockCustomerId,
          workerId: mockWorkerId,
          workerUserId: mockWorkerId,
          previousStatus,
          nextStatus,
          notificationKind: 'status_update',
          [timestampField]: expect.any(String),
        }),
      }),
      txMock,
    );
  };

  beforeEach(() => {
    let lastOrderUpdatedData: any = null;

    prismaMock = {
      $transaction: vi.fn().mockImplementation(async (callback) => {
        return callback(txMock);
      }),
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(async (args) => {
          const current = await prismaMock.order.findUnique(args);
          if (lastOrderUpdatedData && current) {
            return { ...current, ...lastOrderUpdatedData };
          }
          return current;
        }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(async ({ where, data }: any) => {
          lastOrderUpdatedData = data;
          txMock.order.update({ where: { id: where?.id }, data });
          return { count: 1 };
        }),
        count: vi.fn(),
        aggregate: vi.fn(),
      },
      bookingProposal: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      serviceRequest: {
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      orderStatusHistory: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
      orderEvidence: {
        create: vi.fn(),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        delete: vi.fn(),
      },
    };

    txMock = {
      $queryRaw: prismaMock.$queryRaw,
      $executeRaw: prismaMock.$executeRaw,
      bookingProposal: prismaMock.bookingProposal,
      serviceRequest: prismaMock.serviceRequest,
      order: prismaMock.order,
      orderEvidence: prismaMock.orderEvidence,
      orderStatusHistory: prismaMock.orderStatusHistory,
    };

    outboxRepoMock = {
      createEvent: vi.fn().mockResolvedValue({ id: 'evt-1' }),
    };

    service = new OrdersService(
      prismaMock as unknown as PrismaService,
      outboxRepoMock as unknown as OrderOutboxRepository,
    );
  });

  describe('acceptProposal', () => {
    it('should successfully accept proposal and create order atomically', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue(validProposal);
      txMock.order.findUnique.mockResolvedValue(null);

      const createdOrder = {
        ...validBaseOrder,
        id: mockOrderId,
        orderCode: 'ORD-20261023-X9Y1',
      };
      txMock.order.create.mockResolvedValue(createdOrder);

      const historyEntry = {
        id: 'hist-1',
        orderId: mockOrderId,
        fromStatus: null,
        toStatus: 'created',
        changedByUserId: mockWorkerId,
        reason: 'Order created upon worker acceptance of booking proposal',
        createdAt: new Date(),
      };
      txMock.orderStatusHistory.create.mockResolvedValue(historyEntry);

      const result = await service.acceptProposal(mockProposalId, mockWorkerId);

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.bookingProposal.updateMany).toHaveBeenCalledWith({
        where: { id: mockProposalId, status: 'proposed' },
        data: expect.objectContaining({
          status: 'finalized',
          finalizedAt: expect.any(Date),
        }),
      });

      expect(txMock.bookingProposal.updateMany).toHaveBeenCalledWith({
        where: {
          serviceRequestId: mockRequestId,
          id: { not: mockProposalId },
          status: { in: ['proposed', 'changes_requested'] },
        },
        data: {
          status: 'superseded',
        },
      });

      expect(txMock.serviceRequest.updateMany).toHaveBeenCalledWith({
        where: {
          id: mockRequestId,
          status: { in: ['open_for_bidding', 'bidding_closed'] },
        },
        data: expect.objectContaining({
          status: 'converted_to_order',
        }),
      });

      expect(txMock.order.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          addressText: validServiceRequest.addressText,
          latitude: validServiceRequest.latitude,
          longitude: validServiceRequest.longitude,
        }),
      });

      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          aggregateType: ORDER_CONSTANTS.AGGREGATE_ORDER,
          aggregateId: mockOrderId,
          eventType: ORDER_CONSTANTS.EVENT_ORDER_CREATED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            serviceRequestId: mockRequestId,
            requestId: mockRequestId,
            bookingProposalId: mockProposalId,
            customerId: mockCustomerId,
            customerUserId: mockCustomerId,
            workerId: mockWorkerId,
            workerUserId: mockWorkerId,
            agreedPrice: validProposal.agreedPrice.toString(),
            currency: 'VND',
            addressText: '123 Đường Nguyễn Tri Phương, Đà Nẵng',
            latitude: 16.054407,
            longitude: 108.202167,
          }),
        }),
        txMock,
      );

      expect(result.id).toBe(mockOrderId);
      expect(result.status).toBe('created');
    });

    it('should throw NotFoundException if proposal does not exist', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptProposal('unknown-id', mockWorkerId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if caller is not the assigned worker', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue(validProposal);

      await expect(
        service.acceptProposal(mockProposalId, 'different-worker'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if proposal is already finalized', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue({
        ...validProposal,
        status: 'finalized',
      });

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if proposal is not in proposed status', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue({
        ...validProposal,
        status: 'worker_rejected',
      });

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if proposal has expired', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue({
        ...validProposal,
        expiresAt: mockPastDate,
      });

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if service request is missing', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue({
        ...validProposal,
        serviceRequest: null,
      });

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if request was already converted to order', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue({
        ...validProposal,
        serviceRequest: {
          ...validServiceRequest,
          status: 'converted_to_order',
        },
      });

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if request status is neither open_for_bidding nor bidding_closed', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue({
        ...validProposal,
        serviceRequest: {
          ...validServiceRequest,
          status: 'draft',
        },
      });

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if request selection deadline has expired', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue({
        ...validProposal,
        serviceRequest: {
          ...validServiceRequest,
          selectionExpiresAt: mockPastDate,
        },
      });

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if an order already exists (Double Order Protection)', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue(validProposal);
      txMock.order.findUnique.mockResolvedValue({ id: 'existing-order-id' });

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if worker capacity exceeded (>= 3 active orders)', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue(validProposal);
      txMock.order.findUnique.mockResolvedValue(null);
      txMock.order.count.mockResolvedValue(3);

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if schedule conflict exists (< 60 minutes gap)', async () => {
      txMock.bookingProposal.findUnique.mockResolvedValue(validProposal);
      txMock.order.findUnique.mockResolvedValue(null);
      txMock.order.count.mockResolvedValue(1);
      txMock.order.findMany.mockResolvedValue([
        {
          id: 'existing-conflict-order',
          orderCode: 'ORD-EXISTING-1',
          scheduledAt: new Date(
            validProposal.scheduledAt.getTime() + 30 * 60 * 1000,
          ),
        },
      ]);

      await expect(
        service.acceptProposal(mockProposalId, mockWorkerId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('confirmReadiness', () => {
    it('should confirm readiness (created -> confirmed) with one status event', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'created',
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'confirmed',
        confirmedAt: new Date(),
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'confirmed',
      });

      const result = await service.confirmReadiness(mockOrderId, mockWorkerId);

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockOrderId },
          data: expect.objectContaining({ status: 'confirmed' }),
        }),
      );
      expectSingleStatusTransition('created', 'confirmed', 'confirmedAt');
      expect(result.status).toBe('confirmed');
    });

    it('should throw ForbiddenException if caller is not assigned worker', async () => {
      prismaMock.order.findUnique.mockResolvedValue(validBaseOrder);

      await expect(
        service.confirmReadiness(mockOrderId, 'other-worker'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if order is not in created status', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'confirmed',
      });

      await expect(
        service.confirmReadiness(mockOrderId, mockWorkerId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('start', () => {
    it('should start work (confirmed -> in_progress) with one status event', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'confirmed',
        scheduledAt: new Date(Date.now() + 15 * 60 * 1000), // Within 30 minutes
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
        startedAt: new Date(),
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'in_progress',
      });

      const result = await service.start(mockOrderId, mockWorkerId);

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'in_progress' }),
        }),
      );
      expectSingleStatusTransition('confirmed', 'in_progress', 'startedAt');
      expect(result.status).toBe('in_progress');
    });

    it('should throw ConflictException if order is not confirmed', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'created',
      });

      await expect(service.start(mockOrderId, mockWorkerId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if worker already has an order in_progress (Rule 3: Single in_progress)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'confirmed',
        scheduledAt: new Date(Date.now() + 15 * 60 * 1000),
      });
      txMock.order.findFirst.mockResolvedValue({
        id: 'other-working-order-id',
        orderCode: 'ORD-BUSY-123',
      });

      await expect(service.start(mockOrderId, mockWorkerId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw BadRequestException if trying to start too early (> 30 minutes before scheduledAt)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'confirmed',
        scheduledAt: new Date(Date.now() + 50 * 60 * 1000),
      });
      txMock.order.findFirst.mockResolvedValue(null);

      await expect(service.start(mockOrderId, mockWorkerId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('finish', () => {
    it('should mark order finished when in_progress and work evidence count >= 1', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      txMock.orderEvidence.count = vi.fn().mockResolvedValue(1);
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'awaiting_customer_confirmation',
        workerFinishedAt: new Date(),
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'awaiting_customer_confirmation',
      });

      const result = await service.finish(mockOrderId, mockWorkerId);

      expect(txMock.orderEvidence.count).toHaveBeenCalledWith({
        where: {
          orderId: mockOrderId,
          evidenceType: 'work',
        },
      });
      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'awaiting_customer_confirmation',
          }),
        }),
      );
      expectSingleStatusTransition(
        'in_progress',
        'awaiting_customer_confirmation',
        'finishedAt',
      );
      expect(result.status).toBe('awaiting_customer_confirmation');
    });

    it('should throw BadRequestException if worker did not attach any work evidence even when dispute evidence exists (ORD-10)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
        _count: { evidences: 2 },
      });
      txMock.orderEvidence.count = vi.fn().mockResolvedValue(0);

      await expect(service.finish(mockOrderId, mockWorkerId)).rejects.toMatchObject({
        status: 400,
        response: expect.objectContaining({
          code: ORDER_ERROR_CODES.MISSING_EVIDENCE,
        }),
      });
      expect(txMock.orderEvidence.count).toHaveBeenCalledWith({
        where: {
          orderId: mockOrderId,
          evidenceType: 'work',
        },
      });
      expect(txMock.order.updateMany).not.toHaveBeenCalled();
    });

    it('should throw ConflictException if order is not in_progress', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'confirmed',
      });

      await expect(service.finish(mockOrderId, mockWorkerId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('confirmCompletion', () => {
    it('should complete order, set firstCompletedAt, and emit order.completed event for first completion', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'awaiting_customer_confirmation',
        firstCompletedAt: null,
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'completed',
        completedAt: new Date(),
        firstCompletedAt: new Date(),
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'completed',
      });

      const result = await service.confirmCompletion(
        mockOrderId,
        mockCustomerId,
      );

      expect(txMock.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockOrderId, status: 'awaiting_customer_confirmation' },
          data: expect.objectContaining({
            status: 'completed',
            completedAt: expect.any(Date),
            firstCompletedAt: expect.any(Date),
          }),
        }),
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_COMPLETED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            agreedPrice: validBaseOrder.agreedPrice.toString(),
            currency: 'VND',
          }),
        }),
        txMock,
      );
      expect(result.status).toBe('completed');
    });

    it('should preserve firstCompletedAt and emit order.warranty.completed (not order.completed) after warranty rework', async () => {
      const initialFirstCompletedAt = new Date('2026-11-15T10:00:00.000Z');
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'awaiting_customer_confirmation',
        firstCompletedAt: initialFirstCompletedAt,
        completedAt: null,
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-2',
        toStatus: 'completed',
      });

      const result = await service.confirmCompletion(
        mockOrderId,
        mockCustomerId,
      );

      const updateData = txMock.order.updateMany.mock.calls[0][0].data;
      expect(updateData.status).toBe('completed');
      expect(updateData.completedAt).toBeInstanceOf(Date);
      expect(updateData.firstCompletedAt).toBeUndefined();
      expect(outboxRepoMock.createEvent).toHaveBeenCalledTimes(1);
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_WARRANTY_COMPLETED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            agreedPrice: validBaseOrder.agreedPrice.toString(),
            currency: 'VND',
          }),
        }),
        txMock,
      );
      expect(result.status).toBe('completed');
      expect(result.firstCompletedAt).toEqual(initialFirstCompletedAt);
    });

    it('should throw ForbiddenException if caller is not the customer owner', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'awaiting_customer_confirmation',
      });

      await expect(
        service.confirmCompletion(mockOrderId, 'other-customer'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('requestRework', () => {
    it('should return order to in_progress with customer reason', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'awaiting_customer_confirmation',
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'in_progress',
      });

      const dto = { reason: 'Mối nối vẫn bị rò rỉ nước' };
      const result = await service.requestRework(
        mockOrderId,
        mockCustomerId,
        dto,
      );

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'in_progress' }),
        }),
      );
      expect(txMock.orderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromStatus: 'awaiting_customer_confirmation',
            toStatus: 'in_progress',
            reason: dto.reason,
          }),
        }),
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_REWORK_REQUESTED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            customerUserId: mockCustomerId,
            reason: dto.reason,
          }),
        }),
        txMock,
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            previousStatus: 'awaiting_customer_confirmation',
            nextStatus: 'in_progress',
            reason: dto.reason,
          }),
        }),
        txMock,
      );
      expect(result.status).toBe('in_progress');
    });
  });

  describe('cancel', () => {
    it('should cancel order in created status and emit order.cancelled', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'created',
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'cancelled',
        cancelReason: 'Bận việc',
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'cancelled',
      });

      const dto = { reason: 'Bận việc đột xuất' };
      const result = await service.cancel(mockOrderId, mockCustomerId, dto, [
        'Customer',
      ]);

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'cancelled' }),
        }),
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_CANCELLED,
        }),
        txMock,
      );
      expect(result.status).toBe('cancelled');
    });

    it('should throw ConflictException if trying to cancel an order in_progress', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });

      const dto = { reason: 'Muốn hủy' };
      await expect(
        service.cancel(mockOrderId, mockCustomerId, dto, ['Customer']),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('addEvidence & deleteEvidence', () => {
    it('should add evidence when order is in_progress', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      const evidence = {
        id: mockEvidenceId,
        orderId: mockOrderId,
        mediaType: 'image',
        mediaUrl: 'https://example.com/img.jpg',
        description: 'Ảnh van nước',
        createdAt: new Date(),
      };
      prismaMock.orderEvidence.create.mockResolvedValue(evidence);

      const dto = {
        mediaType: 'image',
        mediaUrl: 'https://example.com/img.jpg',
        description: 'Ảnh van nước',
      };
      const result = await service.addEvidence(mockOrderId, mockWorkerId, dto);

      expect(prismaMock.orderEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: mockOrderId,
          mediaType: 'image',
        }),
      });
      expect(result.id).toBe(mockEvidenceId);
    });

    it('should add evidence with clientEvidenceId when provided', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      const clientEvidenceId = 'client-id-12345';
      const evidence = {
        id: mockEvidenceId,
        orderId: mockOrderId,
        clientEvidenceId,
        mediaType: 'image',
        mediaUrl: 'https://example.com/img-new.jpg',
        description: 'Ảnh mới',
        createdAt: new Date(),
      };
      prismaMock.orderEvidence.findFirst.mockResolvedValue(null);
      prismaMock.orderEvidence.create.mockResolvedValue(evidence);

      const dto = {
        clientEvidenceId,
        mediaType: 'image',
        mediaUrl: 'https://example.com/img-new.jpg',
        description: 'Ảnh mới',
      };
      const result = await service.addEvidence(mockOrderId, mockWorkerId, dto);

      expect(prismaMock.orderEvidence.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: mockOrderId,
          clientEvidenceId,
          mediaType: 'image',
          mediaUrl: 'https://example.com/img-new.jpg',
        }),
      });
      expect(result.clientEvidenceId).toBe(clientEvidenceId);
    });

    it('should return existing evidence when clientEvidenceId already exists (idempotency ORD-10)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      const clientEvidenceId = 'client-id-idempotent';
      const existingEvidence = {
        id: mockEvidenceId,
        orderId: mockOrderId,
        clientEvidenceId,
        mediaType: 'image',
        mediaUrl: 'https://example.com/img-existing.jpg',
        description: 'Ảnh đã lưu từ trước',
        createdAt: new Date(),
      };
      // findFirst returns the existing record for clientEvidenceId
      prismaMock.orderEvidence.findFirst.mockResolvedValue(existingEvidence);

      const dto = {
        clientEvidenceId,
        mediaType: 'image',
        mediaUrl: 'https://example.com/img-existing.jpg',
        description: 'Ảnh thử lại',
      };
      const result = await service.addEvidence(mockOrderId, mockWorkerId, dto);

      expect(prismaMock.orderEvidence.create).not.toHaveBeenCalled();
      expect(result.id).toBe(mockEvidenceId);
      expect(result.clientEvidenceId).toBe(clientEvidenceId);
      expect(result.mediaUrl).toBe('https://example.com/img-existing.jpg');
    });

    it('should return existing evidence when mediaUrl already exists for order (idempotency ORD-10)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      const existingEvidence = {
        id: mockEvidenceId,
        orderId: mockOrderId,
        clientEvidenceId: 'key-old',
        mediaType: 'image',
        mediaUrl: 'https://example.com/img-same-url.jpg',
        description: 'Ảnh đã lưu',
        createdAt: new Date(),
      };
      // First call for clientEvidenceId returns null, second call for mediaUrl returns existingEvidence
      prismaMock.orderEvidence.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingEvidence);

      const dto = {
        clientEvidenceId: 'key-new-attempt',
        mediaType: 'image',
        mediaUrl: 'https://example.com/img-same-url.jpg',
      };
      const result = await service.addEvidence(mockOrderId, mockWorkerId, dto);

      expect(prismaMock.orderEvidence.findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          orderId: mockOrderId,
          mediaUrl: 'https://example.com/img-same-url.jpg',
          evidenceType: 'work',
        },
      });
      expect(prismaMock.orderEvidence.create).not.toHaveBeenCalled();
      expect(result.id).toBe(mockEvidenceId);
      expect(result.mediaUrl).toBe('https://example.com/img-same-url.jpg');
    });

    it('should catch P2002 race condition error and return existing duplicate evidence', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      const clientEvidenceId = 'race-condition-id';
      const existingEvidence = {
        id: mockEvidenceId,
        orderId: mockOrderId,
        clientEvidenceId,
        mediaType: 'image',
        mediaUrl: 'https://example.com/race.jpg',
        description: 'Ảnh race',
        createdAt: new Date(),
      };

      let transactionActive = false;
      prismaMock.$transaction.mockImplementation(async (callback) => {
        transactionActive = true;
        try {
          return await callback(txMock);
        } finally {
          transactionActive = false;
        }
      });

      // PostgreSQL rejects further queries in the transaction after a unique violation.
      prismaMock.orderEvidence.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockImplementationOnce(async () => {
          if (transactionActive) {
            throw new Error('current transaction is aborted (25P02)');
          }
          return existingEvidence;
        });

      const p2002Error = new Error(
        'Unique constraint failed on the fields: (order_id, client_evidence_id)',
      );
      (p2002Error as any).code = 'P2002';
      prismaMock.orderEvidence.create.mockRejectedValue(p2002Error);

      const dto = {
        clientEvidenceId,
        mediaType: 'image',
        mediaUrl: 'https://example.com/race.jpg',
      };
      const result = await service.addEvidence(mockOrderId, mockWorkerId, dto);

      expect(result.id).toBe(mockEvidenceId);
      expect(result.clientEvidenceId).toBe(clientEvidenceId);
      expect(prismaMock.orderEvidence.findFirst).toHaveBeenNthCalledWith(3, {
        where: { orderId: mockOrderId, clientEvidenceId },
      });
    });

    it('should throw ConflictException if adding evidence when order is not in_progress', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'confirmed',
      });

      const dto = {
        mediaType: 'image',
        mediaUrl: 'https://example.com/img.jpg',
      };
      await expect(
        service.addEvidence(mockOrderId, mockWorkerId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('should delete evidence when in_progress', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      prismaMock.orderEvidence.findFirst.mockResolvedValue({
        id: mockEvidenceId,
        orderId: mockOrderId,
      });
      prismaMock.orderEvidence.delete.mockResolvedValue({ id: mockEvidenceId });

      await service.deleteEvidence(mockOrderId, mockEvidenceId, mockWorkerId);

      expect(prismaMock.orderEvidence.delete).toHaveBeenCalledWith({
        where: { id: mockEvidenceId },
      });
    });

    it('does not let a worker delete dispute evidence after the order resumes', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      prismaMock.orderEvidence.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteEvidence(mockOrderId, mockEvidenceId, mockWorkerId),
      ).rejects.toMatchObject({
        response: { code: ORDER_ERROR_CODES.EVIDENCE_NOT_FOUND },
        status: 404,
      });
      expect(prismaMock.orderEvidence.findFirst).toHaveBeenCalledWith({
        where: {
          id: mockEvidenceId,
          orderId: mockOrderId,
          evidenceType: 'work',
        },
      });
      expect(prismaMock.orderEvidence.delete).not.toHaveBeenCalled();
    });
  });

  describe('dispute', () => {
    const now = new Date('2026-11-21T12:00:00.000Z');
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(now);
    });

    afterEach(() => vi.useRealTimers());

    it('allows the customer at the exact seven-day boundary and saves evidence with both outbox events', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'completed',
        completedAt: new Date(now.getTime() - sevenDaysMs),
      });
      txMock.orderStatusHistory.create.mockResolvedValue({ id: 'hist-1' });
      const dto = {
        reason: 'Dịch vụ bị lỗi sau khi nghiệm thu',
        category: DisputeCategory.SERVICE_QUALITY,
        evidenceUrls: [
          'https://example.com/photo.jpg',
          'https://example.com/video.mp4',
          'https://example.com/photo.jpg',
        ],
      };

      const result = await service.dispute(mockOrderId, mockCustomerId, dto);

      expect(result.status).toBe('disputed');
      expect(txMock.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockOrderId, status: 'completed' },
          data: expect.objectContaining({
            status: 'disputed',
            disputePreviousStatus: 'completed',
            disputedAt: now,
            disputeReason: dto.reason,
            disputeCategory: DisputeCategory.SERVICE_QUALITY,
            version: { increment: 1 },
          }),
        }),
      );
      expect(txMock.orderEvidence.createMany).toHaveBeenCalledWith({
        data: [
          {
            orderId: mockOrderId,
            mediaUrl: dto.evidenceUrls[0],
            mediaType: 'image',
            evidenceType: 'dispute',
            submittedByUserId: mockCustomerId,
          },
          {
            orderId: mockOrderId,
            mediaUrl: dto.evidenceUrls[1],
            mediaType: 'video',
            evidenceType: 'dispute',
            submittedByUserId: mockCustomerId,
          },
        ],
      });
      expect(txMock.orderStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: mockOrderId,
          fromStatus: 'completed',
          toStatus: 'disputed',
          changedByUserId: mockCustomerId,
          reason: dto.reason,
        }),
      });
      expect(outboxRepoMock.createEvent).toHaveBeenCalledTimes(2);
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_DISPUTED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            orderCode: validBaseOrder.orderCode,
            customerUserId: mockCustomerId,
            workerUserId: mockWorkerId,
            disputedByUserId: mockCustomerId,
            reason: dto.reason,
            category: dto.category,
            evidences: dto.evidenceUrls.slice(0, 2),
            disputePreviousStatus: 'completed',
            completedAt: new Date(now.getTime() - sevenDaysMs).toISOString(),
            disputedAt: now.toISOString(),
          }),
        }),
        txMock,
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
          payload: expect.objectContaining({
            previousStatus: 'completed',
            nextStatus: 'disputed',
          }),
        }),
        txMock,
      );
    });

    it('rejects opening a new post-completion dispute when the order is already fully refunded (paymentState=refunded)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'completed',
        paymentState: 'refunded',
        completedAt: now,
      });

      await expect(
        service.dispute(mockOrderId, mockCustomerId, {
          reason: 'Thử khiếu nại lại sau khi đã hoàn tiền 100%',
        }),
      ).rejects.toMatchObject({
        response: {
          code: ORDER_ERROR_CODES.ORDER_ALREADY_FULLY_REFUNDED,
        },
        status: 409,
      });
      expect(txMock.order.updateMany).not.toHaveBeenCalled();
      expect(outboxRepoMock.createEvent).not.toHaveBeenCalled();
    });

    it('still allows opening a post-completion dispute within 7 days after a partial refund (paymentState=partially_refunded)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'completed',
        paymentState: 'partially_refunded',
        completedAt: now,
      });
      txMock.orderStatusHistory.create.mockResolvedValue({ id: 'hist-partial' });

      const result = await service.dispute(mockOrderId, mockCustomerId, {
        reason: 'Vẫn còn lỗi nghiêm trọng sau hoàn tiền một phần',
      });

      expect(result.status).toBe('disputed');
      expect(txMock.order.updateMany).toHaveBeenCalled();
    });

    it.each([
      ['expired', new Date(now.getTime() - sevenDaysMs - 1)],
      ['missing completion time', null],
    ])('rejects a completed order with %s', async (_case, completedAt) => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'completed',
        completedAt,
      });

      await expect(
        service.dispute(mockOrderId, mockCustomerId, {
          reason: 'Dịch vụ bị lỗi',
        }),
      ).rejects.toMatchObject({
        response: { code: ORDER_ERROR_CODES.COMPLAINT_WINDOW_EXPIRED },
        status: 400,
      });
      expect(txMock.order.updateMany).not.toHaveBeenCalled();
      expect(outboxRepoMock.createEvent).not.toHaveBeenCalled();
    });

    it.each([mockWorkerId, mockAdminId])(
      'rejects non-customer %s for a completed order',
      async (userId) => {
        prismaMock.order.findUnique.mockResolvedValue({
          ...validBaseOrder,
          status: 'completed',
          completedAt: now,
        });

        await expect(
          service.dispute(mockOrderId, userId, { reason: 'Dịch vụ bị lỗi' }),
        ).rejects.toMatchObject({
          response: {
            code: ORDER_ERROR_CODES.DISPUTE_ONLY_CUSTOMER_AFTER_COMPLETION,
          },
          status: 403,
        });
        expect(txMock.order.updateMany).not.toHaveBeenCalled();
      },
    );

    it('lets the worker dispute while awaiting confirmation without evidence', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'awaiting_customer_confirmation',
      });
      txMock.orderStatusHistory.create.mockResolvedValue({ id: 'hist-1' });

      await service.dispute(mockOrderId, mockWorkerId, {
        reason: 'Khách hàng phản ánh sai tiến độ',
      });

      expect(txMock.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockOrderId, status: 'awaiting_customer_confirmation' },
        }),
      );
      expect(txMock.orderEvidence.createMany).not.toHaveBeenCalled();
    });

    it('rejects a non-participant on an active order', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      await expect(
        service.dispute(mockOrderId, mockAdminId, { reason: 'Dịch vụ bị lỗi' }),
      ).rejects.toMatchObject({
        response: { code: ORDER_ERROR_CODES.NOT_ORDER_OWNER },
        status: 403,
      });
    });

    it('does not create events when evidence persistence fails', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'completed',
        completedAt: now,
      });
      txMock.orderEvidence.createMany.mockRejectedValue(
        new Error('write failed'),
      );
      await expect(
        service.dispute(mockOrderId, mockCustomerId, {
          reason: 'Dịch vụ bị lỗi',
          evidenceUrls: ['https://example.com/photo.jpg'],
        }),
      ).rejects.toThrow('write failed');
      expect(outboxRepoMock.createEvent).not.toHaveBeenCalled();
    });

    it('rejects a concurrent status change before writing evidence or events', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'completed',
        completedAt: now,
      });
      txMock.order.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.dispute(mockOrderId, mockCustomerId, {
          reason: 'Dịch vụ bị lỗi',
          evidenceUrls: ['https://example.com/photo.jpg'],
        }),
      ).rejects.toMatchObject({
        response: { code: ORDER_ERROR_CODES.INVALID_STATE_TRANSITION },
        status: 409,
      });
      expect(txMock.orderEvidence.createMany).not.toHaveBeenCalled();
      expect(outboxRepoMock.createEvent).not.toHaveBeenCalled();
    });

    it('should open dispute when order is in_progress and emit order.disputed', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'disputed',
        disputePreviousStatus: 'in_progress',
        disputeReason: 'Thợ làm hỏng sàn',
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'disputed',
      });

      const dto = { reason: 'Thợ làm hỏng sàn gạch trong lúc sửa' };
      const result = await service.dispute(mockOrderId, mockCustomerId, dto);

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'disputed',
            disputePreviousStatus: 'in_progress',
            disputeReason: dto.reason,
          }),
        }),
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_DISPUTED,
        }),
        txMock,
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            nextStatus: 'disputed',
            reason: dto.reason,
            disputeReason: dto.reason,
          }),
        }),
        txMock,
      );
      expect(result.status).toBe('disputed');
    });

    it('should throw ConflictException if opening dispute on created order', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'created',
      });

      await expect(
        service.dispute(mockOrderId, mockCustomerId, { reason: 'Lỗi' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resolveDispute', () => {
    it('should resolve dispute with resume_previous_state action', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'disputed',
        disputePreviousStatus: 'in_progress',
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
        disputeResolutionNote: 'Tiếp tục làm việc',
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'in_progress',
      });

      const dto = {
        action: 'resume_previous_state' as const,
        resolutionNote: 'Đã hòa giải thành công, tiếp tục thi công',
      };
      const result = await service.resolveDispute(
        mockOrderId,
        mockAdminId,
        dto,
        ['Admin'],
      );

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'in_progress' }),
        }),
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            previousStatus: 'disputed',
            nextStatus: 'in_progress',
            reason: dto.resolutionNote,
            resolution: 'resume_previous_state',
          }),
        }),
        txMock,
      );
      expect(result.status).toBe('in_progress');
    });

    it('should resolve dispute with complete action and emit order.completed event', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'disputed',
        disputePreviousStatus: 'awaiting_customer_confirmation',
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'completed',
        disputeResolutionNote: 'Xác nhận hoàn thành',
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'completed',
      });

      const dto = {
        action: 'complete' as const,
        resolutionNote: 'Admin xác nhận thợ đã làm đúng thỏa thuận',
      };
      const result = await service.resolveDispute(
        mockOrderId,
        mockAdminId,
        dto,
        ['Admin'],
      );

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'completed' }),
        }),
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_COMPLETED,
        }),
        txMock,
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            previousStatus: 'disputed',
            nextStatus: 'completed',
            reason: dto.resolutionNote,
            resolution: 'complete',
          }),
        }),
        txMock,
      );
      expect(result.status).toBe('completed');
    });

    it('should resolve dispute with cancel action and emit order.cancelled event', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'disputed',
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'cancelled',
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'cancelled',
      });

      const dto = {
        action: 'cancel' as const,
        resolutionNote: 'Hủy đơn do bất khả kháng',
      };
      const result = await service.resolveDispute(
        mockOrderId,
        mockAdminId,
        dto,
        ['Admin'],
      );

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'cancelled' }),
        }),
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_CANCELLED,
        }),
        txMock,
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STATUS_CHANGED,
          payload: expect.objectContaining({
            orderId: mockOrderId,
            previousStatus: 'disputed',
            nextStatus: 'cancelled',
            reason: dto.resolutionNote,
            resolution: 'cancel',
          }),
        }),
        txMock,
      );
      expect(result.status).toBe('cancelled');
    });

    it('should throw ForbiddenException if caller is not Admin', async () => {
      await expect(
        service.resolveDispute(
          mockOrderId,
          mockCustomerId,
          { action: 'cancel', resolutionNote: 'Hủy' },
          ['Customer'],
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findById & findAll', () => {
    it('should return order details for customer owner', async () => {
      prismaMock.order.findUnique.mockResolvedValue(validBaseOrder);

      const result = await service.findById(mockOrderId, mockCustomerId, [
        'Customer',
      ]);
      expect(result.id).toBe(mockOrderId);
      expect(result.agreedPrice).toBe('350000');
    });

    it('should return paginated list of orders for customer', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      const result = await service.findAll(
        mockCustomerId,
        { page: 1, limit: 10 },
        ['Customer'],
      );
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should filter by multiple comma-separated statuses (MOB-01)', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      const result = await service.findAll(
        mockCustomerId,
        { page: 1, limit: 10, status: 'created,confirmed,in_progress' },
        ['Customer'],
      );
      expect(result.items).toHaveLength(1);
      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['created', 'confirmed', 'in_progress'] },
          }),
        }),
      );
    });


    it('should filter by role worker matching only workerUserId (isolating dual-role customer orders)', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      const result = await service.findAll(
        mockWorkerId,
        { page: 1, limit: 10, role: 'worker' },
        ['Worker', 'Customer'],
      );
      expect(result.items).toHaveLength(1);
      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workerUserId: mockWorkerId,
          }),
        }),
      );
    });

    it('should filter by role customer matching only customerUserId', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      const result = await service.findAll(
        mockCustomerId,
        { page: 1, limit: 10, role: 'customer' },
        ['Worker', 'Customer'],
      );
      expect(result.items).toHaveLength(1);

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerUserId: mockCustomerId,
          }),
        }),
      );
      expect(prismaMock.order.findMany).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workerUserId: mockCustomerId,
          }),
        }),
      );
    });

    it('should isolate role by workerUserId when role=worker (HG-72)', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      await service.findAll(
        mockWorkerId,
        { page: 1, limit: 10, role: 'worker' },
        ['Customer', 'Worker'],
      );

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workerUserId: mockWorkerId,
          }),
        }),
      );
    });

    it('should fallback to where.OR when no role is provided for non-admin user', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      await service.findAll(
        mockCustomerId,
        { page: 1, limit: 10 },
        ['Customer'],
      );
      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ customerUserId: mockCustomerId }, { workerUserId: mockCustomerId }],
          }),
        }),
      );
    });

    it('should filter by search keyword across orderCode, addressText, and agreedScope (HG-72)', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      await service.findAll(
        mockCustomerId,
        { page: 1, limit: 10, search: 'Sửa điện' },
        ['Customer'],
      );

      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { orderCode: { contains: 'Sửa điện', mode: 'insensitive' } },
                  { addressText: { contains: 'Sửa điện', mode: 'insensitive' } },
                  { agreedScope: { contains: 'Sửa điện', mode: 'insensitive' } },
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it('should return order summary statistics (HG-72)', async () => {
      prismaMock.order.aggregate.mockResolvedValue({
        _count: { id: 5 },
        _sum: { agreedPrice: 2500000n as any },
      } as any);
      prismaMock.order.count.mockResolvedValue(2);
      (prismaMock.order as any).groupBy = vi.fn().mockResolvedValue([
        {
          serviceId: 'svc-1',
          _count: { id: 5 },
          _sum: { agreedPrice: 2500000n },
        },
      ]);

      const summary = await service.getOrderSummary(mockWorkerId, 'worker', ['Worker']);
      expect(summary.completedCount).toBe(5);
      expect(summary.cancelledCount).toBe(2);
      expect(summary.totalCompletedAmount).toBe(2500000);
      expect(summary.byService).toEqual([
        { serviceId: 'svc-1', orderCount: 5, revenue: 2500000 },
      ]);
      expect(prismaMock.order.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workerUserId: mockWorkerId,
            status: 'completed',
          }),
        }),
      );
    });
  });

  describe('adminFindDisputes (HG-82)', () => {
    it.each(['refund_pending', 'needs_review'])('projects the current %s refund in the active dispute queue', async (state) => {
      const disputedAt = new Date('2026-11-20T09:00:00.000Z');
      const resolutionId = '88888888-8888-8888-8888-888888888888';
      const findResolutions = vi.fn().mockResolvedValue([{
        id: resolutionId, orderId: mockOrderId, disputedAt, action: 'refund', state,
        refundAmountVnd: 200000n, decidedAt: new Date('2026-11-20T10:00:00.000Z'),
        failureCode: state === 'needs_review' ? 'PAYMENT_NOT_REFUNDABLE' : null,
      }]);
      (prismaMock as any).orderDisputeResolution = { findMany: findResolutions };
      prismaMock.order.count.mockResolvedValue(1);
      prismaMock.order.findMany.mockResolvedValue([{
        ...validBaseOrder, status: 'disputed', disputePreviousStatus: 'completed', disputedAt, evidences: [],
      }]);

      const result = await service.adminFindDisputes(new AdminQueryDisputesDto(), ['Admin']);

      expect(findResolutions).toHaveBeenCalledWith({
        where: { state: { not: 'superseded' }, OR: [{ orderId: mockOrderId, disputedAt }] },
        orderBy: { decidedAt: 'asc' },
      });
      expect(result.items[0].resolution).toEqual(expect.objectContaining({
        resolutionId, state, refundAmountVnd: '200000',
      }));
      expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
    });

    it('ignores superseded resolutions and projects only the active decision for the current dispute', async () => {
      const disputedAt = new Date('2026-11-20T09:00:00.000Z');
      const activeResolutionId = '99999999-9999-9999-9999-999999999999';
      const findResolutions = vi.fn().mockResolvedValue([
        {
          id: '77777777-7777-7777-7777-777777777777',
          orderId: mockOrderId,
          disputedAt,
          action: 'refund',
          state: 'superseded',
          refundAmountVnd: 200000n,
          decidedAt: new Date('2026-11-20T10:00:00.000Z'),
          failureCode: 'REFUND_AMOUNT_EXCEEDS_REFUNDABLE',
        },
        {
          id: activeResolutionId,
          orderId: mockOrderId,
          disputedAt,
          action: 'refund',
          state: 'refund_pending',
          refundAmountVnd: 100000n,
          decidedAt: new Date('2026-11-20T10:05:00.000Z'),
          failureCode: null,
        },
      ]);
      (prismaMock as any).orderDisputeResolution = { findMany: findResolutions };
      prismaMock.order.count.mockResolvedValue(1);
      prismaMock.order.findMany.mockResolvedValue([{
        ...validBaseOrder, status: 'disputed', disputePreviousStatus: 'completed', disputedAt, evidences: [],
      }]);

      const result = await service.adminFindDisputes(new AdminQueryDisputesDto(), ['Admin']);

      expect(result.items[0].resolution).toEqual(expect.objectContaining({
        resolutionId: activeResolutionId,
        state: 'refund_pending',
        refundAmountVnd: '100000',
      }));
    });

    it('does not project a decision from an earlier dispute cycle', async () => {
      const disputedAt = new Date('2026-11-20T09:00:00.000Z');
      const findResolutions = vi.fn().mockResolvedValue([{
        id: '88888888-8888-8888-8888-888888888888', orderId: mockOrderId,
        disputedAt: new Date('2026-11-18T09:00:00.000Z'), action: 'refund', state: 'completed',
      }]);
      (prismaMock as any).orderDisputeResolution = { findMany: findResolutions };
      prismaMock.order.count.mockResolvedValue(1);
      prismaMock.order.findMany.mockResolvedValue([{
        ...validBaseOrder, status: 'disputed', disputePreviousStatus: 'completed', disputedAt, evidences: [],
      }]);

      const result = await service.adminFindDisputes(new AdminQueryDisputesDto(), ['Admin']);

      expect(result.items[0].resolution).toBeNull();
    });

    it('returns only active disputes with dispute evidence and party IDs', async () => {
      const evidence = {
        id: mockEvidenceId,
        mediaUrl: 'https://example.com/dispute.jpg',
        mediaType: 'image',
        submittedByUserId: mockCustomerId,
        createdAt: new Date('2026-11-20T10:00:00.000Z'),
      };
      const disputedAt = new Date('2026-11-20T09:00:00.000Z');
      prismaMock.order.count.mockResolvedValue(1);
      prismaMock.order.findMany.mockResolvedValue([
        {
          ...validBaseOrder,
          status: 'disputed',
          disputePreviousStatus: 'completed',
          disputeReason: 'Rò rỉ nước sau sửa chữa',
          disputeCategory: DisputeCategory.SERVICE_QUALITY,
          disputedAt,
          completedAt: new Date('2026-11-18T09:00:00.000Z'),
          evidences: [evidence],
        },
      ]);

      const result = await service.adminFindDisputes(
        new AdminQueryDisputesDto(),
        ['ADMIN'],
      );

      expect(prismaMock.order.count).toHaveBeenCalledWith({
        where: { status: 'disputed' },
      });
      expect(prismaMock.order.findMany).toHaveBeenCalledWith({
        where: { status: 'disputed' },
        include: {
          evidences: {
            where: { evidenceType: 'dispute' },
            orderBy: { createdAt: 'desc' },
          },
        },
        skip: 0,
        take: 10,
        orderBy: [{ disputedAt: 'desc' }, { id: 'asc' }],
      });
      expect(result).toEqual({
        items: [
          {
            orderId: mockOrderId,
            orderCode: validBaseOrder.orderCode,
            status: 'disputed',
            disputePreviousStatus: 'completed',
            customerUserId: mockCustomerId,
            workerUserId: mockWorkerId,
            customer: { id: mockCustomerId },
            worker: { id: mockWorkerId },
            serviceId: mockServiceId,
            agreedPrice: '350000',
            currency: 'VND',
            disputeReason: 'Rò rỉ nước sau sửa chữa',
            disputeCategory: DisputeCategory.SERVICE_QUALITY,
            disputedAt,
            completedAt: new Date('2026-11-18T09:00:00.000Z'),
            resolution: null,
            evidences: [evidence],
            createdAt: validBaseOrder.createdAt,
          },
        ],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });
    });

    it('applies search, previous status, date range, pagination and price sorting', async () => {
      prismaMock.order.count.mockResolvedValue(8);
      prismaMock.order.findMany.mockResolvedValue([]);
      const query = Object.assign(new AdminQueryDisputesDto(), {
        page: 2,
        limit: 3,
        search: '  rò rỉ  ',
        previousStatus: DisputePreviousStatus.COMPLETED,
        disputedFrom: '2026-11-01T00:00:00.000Z',
        disputedTo: '2026-11-21T23:59:59.000Z',
        sortBy: DisputeSortBy.AGREED_PRICE,
        sortOrder: SortOrder.ASC,
      });

      const result = await service.adminFindDisputes(query, ['Admin']);

      const where = {
        status: 'disputed',
        disputePreviousStatus: 'completed',
        disputedAt: {
          gte: new Date(query.disputedFrom),
          lte: new Date(query.disputedTo),
        },
        OR: [
          { orderCode: { contains: 'rò rỉ', mode: 'insensitive' } },
          { disputeReason: { contains: 'rò rỉ', mode: 'insensitive' } },
        ],
      };
      expect(prismaMock.order.count).toHaveBeenCalledWith({ where });
      expect(prismaMock.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where,
          skip: 3,
          take: 3,
          orderBy: [{ agreedPrice: 'asc' }, { id: 'asc' }],
        }),
      );
      expect(result.pagination).toEqual({
        page: 2,
        limit: 3,
        total: 8,
        totalPages: 3,
      });
    });

    it('returns an empty queue without applying a blank search term', async () => {
      prismaMock.order.count.mockResolvedValue(0);
      prismaMock.order.findMany.mockResolvedValue([]);

      const result = await service.adminFindDisputes(
        Object.assign(new AdminQueryDisputesDto(), { search: '   ' }),
        ['Admin'],
      );

      expect(prismaMock.order.count).toHaveBeenCalledWith({
        where: { status: 'disputed' },
      });
      expect(result).toEqual({
        items: [],
        pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
      });
    });

    it.each([{ roles: [] }, { roles: ['Customer'] }, { roles: ['Worker'] }])(
      'rejects non-admin roles %j before querying the database',
      async ({ roles }) => {
        await expect(
          service.adminFindDisputes(new AdminQueryDisputesDto(), roles),
        ).rejects.toMatchObject({
          response: { code: ORDER_ERROR_CODES.FORBIDDEN_ROLE },
          status: 403,
        });
        expect(prismaMock.order.count).not.toHaveBeenCalled();
        expect(prismaMock.order.findMany).not.toHaveBeenCalled();
      },
    );

    it('rejects reversed date ranges before querying the database', async () => {
      const query = Object.assign(new AdminQueryDisputesDto(), {
        disputedFrom: '2026-11-21T00:00:00.000Z',
        disputedTo: '2026-11-20T00:00:00.000Z',
      });

      await expect(service.adminFindDisputes(query, ['Admin'])).rejects.toThrow(
        BadRequestException,
      );
      expect(prismaMock.order.count).not.toHaveBeenCalled();
    });
  });

  describe('adminFindAll (BE-02)', () => {
    it('should allow Admin to query all orders globally', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      const result = await service.adminFindAll({ page: 1, limit: 10 }, [
        'Admin',
      ]);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(prismaMock.order.findMany).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if caller has Customer role only', async () => {
      await expect(
        service.adminFindAll({ page: 1, limit: 10 }, ['Customer']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if caller has Worker role only', async () => {
      await expect(
        service.adminFindAll({ page: 1, limit: 10 }, ['Worker']),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
