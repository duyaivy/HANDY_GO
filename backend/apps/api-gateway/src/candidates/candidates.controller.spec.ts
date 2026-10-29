import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CandidatesController } from './candidates.controller.js';
import { CandidatesAggregationService } from './candidates-aggregation.service.js';
import { AppException } from '@app/common';
import type { Request } from 'express';

describe('CandidatesController', () => {
  let controller: CandidatesController;
  let mockAggregationService: { aggregateCandidates: ReturnType<typeof vi.fn> };

  const validRequestId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

  beforeEach(() => {
    mockAggregationService = {
      aggregateCandidates: vi.fn(),
    };
    controller = new CandidatesController(
      mockAggregationService as unknown as CandidatesAggregationService,
    );
  });

  it('rejects with 401 Unauthorized if user identity is missing', async () => {
    const req = {
      headers: {},
    } as unknown as Request;

    await expect(
      controller.getCandidates(validRequestId, { page: 1, limit: 20 }, req),
    ).rejects.toThrow(AppException);
  });

  it('extracts headers and passes correct arguments to aggregation service', async () => {
    const req = {
      headers: {
        'x-user-id': 'cust-user-1',
        'x-user-roles': 'Customer,Worker',
        'x-user-account-id': 'acc-1',
        'x-user-permissions': 'profile:read',
        'x-request-id': 'corr-1234',
      },
    } as unknown as Request;

    const mockData = {
      requestId: validRequestId,
      requestStatus: 'open_for_bidding',
      bidding: { status: 'open', total: 0, page: 1, limit: 20, items: [] },
      matching: { status: 'completed', displayLimit: 5, recommendations: [] },
      partial: false,
    };

    mockAggregationService.aggregateCandidates.mockResolvedValue(mockData);

    const response = await controller.getCandidates(
      validRequestId,
      { page: 1, limit: 20 },
      req,
    );

    expect(response.statusCode).toBe(200);
    expect(response.message).toBe('Lấy danh sách ứng viên thành công');
    expect(response.data).toEqual(mockData);

    expect(mockAggregationService.aggregateCandidates).toHaveBeenCalledWith(
      validRequestId,
      { page: 1, limit: 20 },
      {
        userId: 'cust-user-1',
        roles: ['Customer', 'Worker'],
        accountId: 'acc-1',
        permissions: ['profile:read'],
      },
      'corr-1234',
    );
  });

  it('extracts user from req.user if headers are not set directly', async () => {
    const req = {
      headers: {},
      user: {
        userId: 'user-from-token',
        roles: ['Customer'],
        accountId: 'acc-token',
        permissions: [],
      },
    } as unknown as Request;

    const mockData = {
      requestId: validRequestId,
      requestStatus: 'open_for_bidding',
      bidding: { status: 'open', total: 0, page: 1, limit: 20, items: [] },
      matching: { status: 'completed', displayLimit: 5, recommendations: [] },
      partial: false,
    };

    mockAggregationService.aggregateCandidates.mockResolvedValue(mockData);

    const response = await controller.getCandidates(
      validRequestId,
      { page: 1, limit: 20 },
      req,
    );

    expect(response.statusCode).toBe(200);
    expect(mockAggregationService.aggregateCandidates).toHaveBeenCalledWith(
      validRequestId,
      { page: 1, limit: 20 },
      expect.objectContaining({ userId: 'user-from-token' }),
      expect.any(String),
    );
  });
});
