import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller.js';
import type { OrdersService } from './orders.service.js';
import type { AdminQueryOrderDto } from './dto/admin-query-order.dto.js';
import type { ResolveDisputeDto } from './dto/resolve-dispute.dto.js';

describe('AdminOrdersController', () => {
  let controller: AdminOrdersController;
  let serviceMock: {
    adminFindAll: ReturnType<typeof vi.fn>;
    resolveDispute: ReturnType<typeof vi.fn>;
  };

  const mockAdminId = '99999999-9999-9999-9999-999999999999';
  const mockOrderId = '55555555-5555-5555-5555-555555555555';

  beforeEach(() => {
    serviceMock = {
      adminFindAll: vi.fn(),
      resolveDispute: vi.fn(),
    };

    controller = new AdminOrdersController(
      serviceMock as unknown as OrdersService,
    );
  });

  describe('findAll', () => {
    it('should return admin global list of orders with 200 status', async () => {
      const paginated = {
        items: [{ id: mockOrderId, orderCode: 'ORD-123' }],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      };
      serviceMock.adminFindAll.mockResolvedValue(paginated);

      const user = { userId: mockAdminId, roles: ['Admin'], permissions: [] };
      const query: AdminQueryOrderDto = { page: 1, limit: 10, status: 'disputed' };

      const response = await controller.findAll(user, query);

      expect(serviceMock.adminFindAll).toHaveBeenCalledWith(query);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Admin orders retrieved successfully');
      expect(response.data).toEqual(paginated);
    });
  });

  describe('resolveDispute', () => {
    it('should resolve dispute and return 200 wrapped response', async () => {
      const order = { id: mockOrderId, status: 'completed' };
      serviceMock.resolveDispute.mockResolvedValue(order);

      const user = { userId: mockAdminId, roles: ['Admin'], permissions: [] };
      const dto: ResolveDisputeDto = {
        action: 'complete',
        resolutionNote: 'Đã hoàn tất việc phân xử',
      };

      const response = await controller.resolveDispute(mockOrderId, user, dto);

      expect(serviceMock.resolveDispute).toHaveBeenCalledWith(
        mockOrderId,
        mockAdminId,
        dto,
        ['Admin'],
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Dispute resolved successfully');
      expect(response.data).toEqual(order);
    });
  });
});
