import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { OrdersController } from './orders.controller.js';
import type { OrdersService } from './orders.service.js';
import type { QueryOrderDto } from './dto/query-order.dto.js';
import type { CreateOrderEvidenceDto } from './dto/create-order-evidence.dto.js';
import type { RequestReworkDto } from './dto/request-rework.dto.js';
import type { CancelOrderDto } from './dto/cancel-order.dto.js';
import type { DisputeOrderDto } from './dto/dispute-order.dto.js';

describe('OrdersController', () => {
  let controller: OrdersController;
  let serviceMock: {
    findAll: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    getStatusHistory: ReturnType<typeof vi.fn>;
    confirmReadiness: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    finish: ReturnType<typeof vi.fn>;
    confirmCompletion: ReturnType<typeof vi.fn>;
    requestRework: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
    addEvidence: ReturnType<typeof vi.fn>;
    getEvidences: ReturnType<typeof vi.fn>;
    deleteEvidence: ReturnType<typeof vi.fn>;
    dispute: ReturnType<typeof vi.fn>;
  };

  const mockUserId = '11111111-1111-1111-1111-111111111111';
  const mockWorkerId = '22222222-2222-2222-2222-222222222222';
  const mockOrderId = '55555555-5555-5555-5555-555555555555';
  const mockEvidenceId = '66666666-6666-6666-6666-666666666666';

  beforeEach(() => {
    serviceMock = {
      findAll: vi.fn(),
      findById: vi.fn(),
      getStatusHistory: vi.fn(),
      confirmReadiness: vi.fn(),
      start: vi.fn(),
      finish: vi.fn(),
      confirmCompletion: vi.fn(),
      requestRework: vi.fn(),
      cancel: vi.fn(),
      addEvidence: vi.fn(),
      getEvidences: vi.fn(),
      deleteEvidence: vi.fn(),
      dispute: vi.fn(),
    };

    controller = new OrdersController(serviceMock as unknown as OrdersService);
  });

  describe('findAll', () => {
    it('should return paginated orders with 200 status', async () => {
      const paginated = {
        items: [{ id: mockOrderId, orderCode: 'ORD-123' }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      serviceMock.findAll.mockResolvedValue(paginated);

      const user = { userId: mockUserId, roles: ['Customer'], permissions: [] };
      const query: QueryOrderDto = { page: 1, limit: 10 };

      const response = await controller.findAll(user, query);

      expect(serviceMock.findAll).toHaveBeenCalledWith(
        mockUserId,
        query,
        ['Customer'],
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Orders retrieved successfully');
      expect(response.data).toEqual(paginated);
    });
  });

  describe('findOne', () => {
    it('should return single order details with 200 status', async () => {
      const order = { id: mockOrderId, orderCode: 'ORD-123', status: 'created' };
      serviceMock.findById.mockResolvedValue(order);

      const user = { userId: mockUserId, roles: ['Customer'], permissions: [] };

      const response = await controller.findOne(mockOrderId, user);

      expect(serviceMock.findById).toHaveBeenCalledWith(
        mockOrderId,
        mockUserId,
        ['Customer'],
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Order retrieved successfully');
      expect(response.data).toEqual(order);
    });
  });

  describe('getStatusHistory', () => {
    it('should return status timeline with 200 status', async () => {
      const history = [{ id: 'hist-1', toStatus: 'created' }];
      serviceMock.getStatusHistory.mockResolvedValue(history);

      const user = { userId: mockUserId, roles: ['Customer'], permissions: [] };

      const response = await controller.getStatusHistory(mockOrderId, user);

      expect(serviceMock.getStatusHistory).toHaveBeenCalledWith(
        mockOrderId,
        mockUserId,
        ['Customer'],
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Status history retrieved successfully');
      expect(response.data).toEqual(history);
    });
  });

  describe('confirmReadiness', () => {
    it('should confirm readiness and return 200 wrapped response', async () => {
      const order = { id: mockOrderId, status: 'confirmed' };
      serviceMock.confirmReadiness.mockResolvedValue(order);

      const response = await controller.confirmReadiness(mockOrderId, mockWorkerId);

      expect(serviceMock.confirmReadiness).toHaveBeenCalledWith(
        mockOrderId,
        mockWorkerId,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(order);
    });
  });

  describe('start', () => {
    it('should start order and return 200 wrapped response', async () => {
      const order = { id: mockOrderId, status: 'in_progress' };
      serviceMock.start.mockResolvedValue(order);

      const response = await controller.start(mockOrderId, mockWorkerId);

      expect(serviceMock.start).toHaveBeenCalledWith(mockOrderId, mockWorkerId);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(order);
    });
  });

  describe('finish', () => {
    it('should report order finished and return 200 wrapped response', async () => {
      const order = { id: mockOrderId, status: 'awaiting_customer_confirmation' };
      serviceMock.finish.mockResolvedValue(order);

      const response = await controller.finish(mockOrderId, mockWorkerId);

      expect(serviceMock.finish).toHaveBeenCalledWith(mockOrderId, mockWorkerId);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(order);
    });
  });

  describe('confirmCompletion', () => {
    it('should confirm completion and return 200 wrapped response', async () => {
      const order = { id: mockOrderId, status: 'completed' };
      serviceMock.confirmCompletion.mockResolvedValue(order);

      const response = await controller.confirmCompletion(mockOrderId, mockUserId);

      expect(serviceMock.confirmCompletion).toHaveBeenCalledWith(
        mockOrderId,
        mockUserId,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(order);
    });
  });

  describe('requestRework', () => {
    it('should request rework and return 200 wrapped response', async () => {
      const order = { id: mockOrderId, status: 'in_progress' };
      serviceMock.requestRework.mockResolvedValue(order);

      const dto: RequestReworkDto = { reason: 'Sửa lại van nước' };
      const response = await controller.requestRework(mockOrderId, mockUserId, dto);

      expect(serviceMock.requestRework).toHaveBeenCalledWith(
        mockOrderId,
        mockUserId,
        dto,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(order);
    });
  });

  describe('cancel', () => {
    it('should cancel order and return 200 wrapped response', async () => {
      const order = { id: mockOrderId, status: 'cancelled' };
      serviceMock.cancel.mockResolvedValue(order);

      const user = { userId: mockUserId, roles: ['Customer'], permissions: [] };
      const dto: CancelOrderDto = { reason: 'Bận đột xuất' };
      const response = await controller.cancel(mockOrderId, user, dto);

      expect(serviceMock.cancel).toHaveBeenCalledWith(
        mockOrderId,
        mockUserId,
        dto,
        ['Customer'],
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(order);
    });
  });

  describe('evidence operations', () => {
    it('should upload evidence and return 201 wrapped response', async () => {
      const evidence = {
        id: mockEvidenceId,
        orderId: mockOrderId,
        mediaUrl: 'https://example.com/pic.jpg',
      };
      serviceMock.addEvidence.mockResolvedValue(evidence);

      const dto: CreateOrderEvidenceDto = {
        mediaType: 'image',
        mediaUrl: 'https://example.com/pic.jpg',
      };
      const response = await controller.addEvidence(mockOrderId, mockWorkerId, dto);

      expect(serviceMock.addEvidence).toHaveBeenCalledWith(
        mockOrderId,
        mockWorkerId,
        dto,
      );
      expect(response.statusCode).toBe(HttpStatus.CREATED);
      expect(response.data).toEqual(evidence);
    });

    it('should get evidences and return 200 wrapped response', async () => {
      const evidences = [{ id: mockEvidenceId }];
      serviceMock.getEvidences.mockResolvedValue(evidences);

      const user = { userId: mockUserId, roles: ['Customer'], permissions: [] };
      const response = await controller.getEvidences(mockOrderId, user);

      expect(serviceMock.getEvidences).toHaveBeenCalledWith(
        mockOrderId,
        mockUserId,
        ['Customer'],
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(evidences);
    });

    it('should delete evidence and return 200 wrapped response', async () => {
      serviceMock.deleteEvidence.mockResolvedValue(undefined);

      const response = await controller.deleteEvidence(
        mockOrderId,
        mockEvidenceId,
        mockWorkerId,
      );

      expect(serviceMock.deleteEvidence).toHaveBeenCalledWith(
        mockOrderId,
        mockEvidenceId,
        mockWorkerId,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
    });
  });

  describe('dispute', () => {
    it('should open dispute and return 200 wrapped response', async () => {
      const order = { id: mockOrderId, status: 'disputed' };
      serviceMock.dispute.mockResolvedValue(order);

      const dto: DisputeOrderDto = { reason: 'Tranh chấp tiến độ' };
      const response = await controller.dispute(mockOrderId, mockUserId, dto);

      expect(serviceMock.dispute).toHaveBeenCalledWith(
        mockOrderId,
        mockUserId,
        dto,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(order);
    });
  });
});
