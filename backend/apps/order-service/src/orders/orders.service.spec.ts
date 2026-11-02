import { describe, expect, it, vi, beforeEach } from 'vitest';
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
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(async ({ where, data }: any) => {
          lastOrderUpdatedData = data;
          txMock.order.update({ where: { id: where?.id }, data });
          return { count: 1 };
        }),
        count: vi.fn(),
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
  });

  describe('confirmReadiness', () => {
    it('should confirm readiness (created -> confirmed) and emit order.confirmed', async () => {
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
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_CONFIRMED,
        }),
        txMock,
      );
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
    it('should start work (confirmed -> in_progress) and emit order.started', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'confirmed',
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
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_STARTED,
        }),
        txMock,
      );
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
  });

  describe('finish', () => {
    it('should mark order finished when in_progress and evidence count >= 1', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
        _count: { evidences: 1 },
      });
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

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'awaiting_customer_confirmation',
          }),
        }),
      );
      expect(outboxRepoMock.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: ORDER_CONSTANTS.EVENT_ORDER_FINISHED,
        }),
        txMock,
      );
      expect(result.status).toBe('awaiting_customer_confirmation');
    });

    it('should throw BadRequestException if worker did not attach any evidence (ORD-10)', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'in_progress',
        _count: { evidences: 0 },
      });

      await expect(service.finish(mockOrderId, mockWorkerId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ConflictException if order is not in_progress', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'confirmed',
        _count: { evidences: 1 },
      });

      await expect(service.finish(mockOrderId, mockWorkerId)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('confirmCompletion', () => {
    it('should complete order and emit order.completed event for payment settlement', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        ...validBaseOrder,
        status: 'awaiting_customer_confirmation',
      });
      txMock.order.update.mockResolvedValue({
        ...validBaseOrder,
        status: 'completed',
        completedAt: new Date(),
      });
      txMock.orderStatusHistory.create.mockResolvedValue({
        id: 'hist-1',
        toStatus: 'completed',
      });

      const result = await service.confirmCompletion(mockOrderId, mockCustomerId);

      expect(txMock.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'completed' }),
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
      const result = await service.requestRework(mockOrderId, mockCustomerId, dto);

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
      const result = await service.cancel(mockOrderId, mockCustomerId, dto, ['Customer']);

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
  });

  describe('dispute', () => {
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

      const result = await service.findById(mockOrderId, mockCustomerId, ['Customer']);
      expect(result.id).toBe(mockOrderId);
      expect(result.agreedPrice).toBe('350000');
    });

    it('should return paginated list of orders for customer', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      const result = await service.findAll(mockCustomerId, { page: 1, limit: 10 }, ['Customer']);
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
  });

  describe('adminFindAll (BE-02)', () => {
    it('should allow Admin to query all orders globally', async () => {
      prismaMock.order.findMany.mockResolvedValue([validBaseOrder]);
      prismaMock.order.count.mockResolvedValue(1);

      const result = await service.adminFindAll({ page: 1, limit: 10 }, ['Admin']);
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
