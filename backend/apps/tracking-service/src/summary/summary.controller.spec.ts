import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import { SummaryController } from './summary.controller.js';
import type { SummaryService } from './summary.service.js';
import type { GatewayUser } from '../common/security/tracking-security.util.js';

describe('SummaryController', () => {
  let controller: SummaryController;
  let summaryServiceMock: {
    getRequestSummary: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    summaryServiceMock = {
      getRequestSummary: vi.fn(),
    };

    controller = new SummaryController(
      summaryServiceMock as unknown as SummaryService,
    );
  });

  describe('getRequestSummary', () => {
    it('should return wrapped success response with 200 OK', async () => {
      const serviceRequestId = randomUUID();
      const user: GatewayUser = {
        userId: randomUUID(),
        roles: ['Customer'],
        isAdmin: false,
        isCustomer: true,
        isWorker: false,
      };

      const mockSummaryData = {
        flowId: randomUUID(),
        serviceRequestId,
        currentPhase: 'OPEN_FOR_BIDDING',
        serviceRequest: { status: 'open_for_bidding' },
        matching: { status: 'completed', matchCount: 5 },
        bidding: { status: 'open', bidCount: 2 },
        totalEvents: 6,
      } as any;

      summaryServiceMock.getRequestSummary.mockResolvedValue(mockSummaryData);

      const response = await controller.getRequestSummary(serviceRequestId, user);

      expect(summaryServiceMock.getRequestSummary).toHaveBeenCalledWith(
        serviceRequestId,
        user,
      );
      expect(response.statusCode).toBe(HttpStatus.OK);
      expect(response.message).toBe('Lấy tổng hợp tiến trình yêu cầu thành công');
      expect(response.data).toEqual(mockSummaryData);
    });
  });
});
