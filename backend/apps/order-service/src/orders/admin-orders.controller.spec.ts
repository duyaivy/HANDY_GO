import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminOrdersController } from './admin-orders.controller.js';
import { TrustedGatewayGuard } from '../common/guards/trusted-gateway.guard.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import type { OrdersService } from './orders.service.js';
import type { AdminQueryOrderDto } from './dto/admin-query-order.dto.js';
import type { AdminQueryDisputesDto } from './dto/admin-query-disputes.dto.js';
import type { ResolveDisputeDto } from './dto/resolve-dispute.dto.js';

describe('AdminOrdersController', () => {
  let controller: AdminOrdersController;
  let serviceMock: {
    adminFindAll: ReturnType<typeof vi.fn>;
    adminFindDisputes: ReturnType<typeof vi.fn>;
    adminFindDisputeResolution: ReturnType<typeof vi.fn>;
    resolveDispute: ReturnType<typeof vi.fn>;
    resolveCompletedDispute: ReturnType<typeof vi.fn>;
  };

  const mockAdminId = '99999999-9999-9999-9999-999999999999';
  const mockOrderId = '55555555-5555-5555-5555-555555555555';

  beforeEach(() => {
    serviceMock = {
      adminFindAll: vi.fn(),
      adminFindDisputes: vi.fn(),
      adminFindDisputeResolution: vi.fn(),
      resolveDispute: vi.fn(),
      resolveCompletedDispute: vi.fn(),
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

      expect(serviceMock.adminFindAll).toHaveBeenCalledWith(query, ['Admin']);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Admin orders retrieved successfully');
      expect(response.data).toEqual(paginated);
    });
  });

  describe('findDisputes', () => {
    it('registers the dispute path behind trusted gateway and admin guards', () => {
      expect(Reflect.getMetadata(PATH_METADATA, AdminOrdersController)).toBe(
        'admin/orders',
      );
      expect(
        Reflect.getMetadata(
          PATH_METADATA,
          AdminOrdersController.prototype.findDisputes,
        ),
      ).toBe('disputes');
      expect(Reflect.getMetadata(GUARDS_METADATA, AdminOrdersController)).toEqual(
        [TrustedGatewayGuard, AdminGuard],
      );
    });

    it('returns the admin dispute queue in the standard response envelope', async () => {
      const queue = {
        items: [{ orderId: mockOrderId, status: 'disputed' }],
        pagination: { page: 2, limit: 5, total: 6, totalPages: 2 },
      };
      serviceMock.adminFindDisputes.mockResolvedValue(queue);
      const user = { userId: mockAdminId, roles: ['Admin'], permissions: [] };
      const query = { page: 2, limit: 5 } as AdminQueryDisputesDto;

      const response = await controller.findDisputes(user, query);

      expect(serviceMock.adminFindDisputes).toHaveBeenCalledWith(query, ['Admin']);
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Admin disputes retrieved successfully');
      expect(response.data).toEqual(queue);
    });
  });

  describe('resolveDispute', () => {
    it('returns HTTP 202 while a new refund decision is pending', async () => {
      const decision = { id: mockOrderId, status: 'disputed', resolutionId: '77777777-7777-7777-7777-777777777777', state: 'refund_pending' };
      serviceMock.resolveCompletedDispute.mockResolvedValue(decision);
      const response = { status: vi.fn() };
      const user = { userId: mockAdminId, roles: ['Admin'], permissions: [] };
      const dto: ResolveDisputeDto = { action: 'refund', resolutionNote: 'Hoàn tiền cho khách hàng', idempotencyKey: 'hg82-1' };
      const result = await controller.resolveDispute(mockOrderId, user, dto, response);
      expect(response.status).toHaveBeenCalledWith(HttpStatus.ACCEPTED);
      expect(result.statusCode).toBe(HttpStatus.ACCEPTED);
      expect(result.data).toEqual(decision);
    });
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

  describe('findDisputeResolution', () => {
    it('returns the dispute resolution progress in the standard response envelope', async () => {
      const resolutionId = '88888888-8888-8888-8888-888888888888';
      const detail = {
        resolutionId,
        orderId: mockOrderId,
        action: 'refund',
        state: 'completed',
        refundAmountVnd: '150000',
        paymentId: '12121212-1212-1212-1212-121212121212',
        refundId: '34343434-3434-3434-3434-343434343434',
        failureCode: null,
      };
      serviceMock.adminFindDisputeResolution.mockResolvedValue(detail);
      const user = { userId: mockAdminId, roles: ['Admin'], permissions: [] };

      const response = await controller.findDisputeResolution(
        resolutionId,
        user,
      );

      expect(serviceMock.adminFindDisputeResolution).toHaveBeenCalledWith(
        resolutionId,
        ['Admin'],
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.data).toEqual(detail);
    });
  });
});
