import { request } from '@/services/api/api-client';
import { TrackingApi } from '../api/tracking.api';
import { TRACKING_QUERY_KEYS } from '../hooks/use-tracking-summary';

jest.mock('@/services/api/api-client', () => ({
  request: jest.fn(),
  resolveApiBaseUrl: jest.fn(() => 'http://127.0.0.1:3000/api/v1'),
}));

describe('Tracking API & Hooks Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('TrackingApi', () => {
    it('shows work finished and payment pending while awaiting customer confirmation', async () => {
      const finishedAt = '2026-11-10T10:00:00.000Z';
      (request as jest.Mock).mockResolvedValue({
        serviceRequestId: 'req-finished',
        orderId: 'order-finished',
        currentPhase: 'AWAITING_CONFIRMATION',
        order: {
          orderId: 'order-finished',
          status: 'awaiting_customer_confirmation',
          createdAt: '2026-11-10T09:00:00.000Z',
          finishedAt,
        },
      });

      const result = await TrackingApi.getSummary('req-finished');
      expect(result.milestones.find(item => item.key === 'order_execution')).toMatchObject({
        status: 'completed',
        reachedAt: finishedAt,
        description: 'Thợ đã hoàn thành công việc',
      });
      expect(result.milestones.find(item => item.key === 'payment_completion')).toMatchObject({
        status: 'in_progress',
        description: 'Chờ khách hàng nghiệm thu và thanh toán',
      });
    });

    it('shows bidding closure without implying a worker was selected', async () => {
      const biddingClosedAt = '2026-11-10T10:00:00.000Z';
      (request as jest.Mock).mockResolvedValue({
        serviceRequestId: 'req-closed', currentPhase: 'BIDDING_CLOSED',
        serviceRequest: { status: 'bidding_closed', createdAt: '2026-11-10T09:00:00.000Z', biddingClosedAt },
        bidding: { status: 'open', bidCount: 2 },
      });

      const result = await TrackingApi.getSummary('req-closed');
      const bidding = result.milestones.find(item => item.key === 'bidding');
      expect(result.serviceRequest?.biddingClosedAt).toBe(biddingClosedAt);
      expect(bidding).toMatchObject({
        status: 'completed', reachedAt: biddingClosedAt,
        description: 'Đã hết thời hạn nhận báo giá (2 báo giá)',
      });
    });

    it('getSummary should call request with correct endpoint and enrich milestones', async () => {
      const mockRawResponse = {
        flowId: 'flow-123',
        serviceRequestId: 'req-123',
        orderId: 'ord-123',
        customerId: 'cus-123',
        currentPhase: 'ORDER_IN_PROGRESS',
        serviceRequest: {
          status: 'converted_to_order',
          createdAt: '2026-11-06T08:00:00Z',
          publishedAt: '2026-11-06T08:05:00Z',
        },
        order: {
          orderId: 'ord-123',
          status: 'in_progress',
          createdAt: '2026-11-06T08:30:00Z',
        },
      };

      (request as jest.Mock).mockResolvedValue(mockRawResponse);

      const result = await TrackingApi.getSummary('req-123');

      expect(request).toHaveBeenCalledWith({
        url: '/api/v1/tracking/requests/req-123/summary',
        method: 'GET',
      });
      expect(result.serviceRequestId).toBe('req-123');
      expect(result.currentPhase).toBe('ORDER_IN_PROGRESS');
      expect(result.milestones).toHaveLength(5);
      expect(result.milestones[0].key).toBe('service_request');
      expect(result.milestones[0].status).toBe('completed');
      expect(result.lastUpdatedAt).toBeDefined();
    });

    it('getTimeline should call request with pagination query params and normalize response', async () => {
      const mockRawTimeline = {
        serviceRequestId: 'req-123',
        items: [
          {
            id: 'evt-1',
            eventId: 'orig-1',
            entityType: 'service_request',
            entityId: 'req-123',
            eventType: 'service_request.published',
            sourceService: 'order-service',
            occurredAt: '2026-11-06T08:05:00Z',
            recordedAt: '2026-11-06T08:05:01Z',
          },
        ],
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
      };

      (request as jest.Mock).mockResolvedValue(mockRawTimeline);

      const result = await TrackingApi.getTimeline('req-123', { page: 1, limit: 10 });

      expect(request).toHaveBeenCalledWith({
        url: '/api/v1/tracking/requests/req-123/timeline',
        method: 'GET',
        params: { page: 1, limit: 10 },
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].eventType).toBe('service_request.published');
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
    });
  });

  describe('TRACKING_QUERY_KEYS', () => {
    it('should generate consistent query keys for React Query cache', () => {
      expect(TRACKING_QUERY_KEYS.all).toEqual(['tracking']);
      expect(TRACKING_QUERY_KEYS.summaries()).toEqual(['tracking', 'summary']);
      expect(TRACKING_QUERY_KEYS.summary('req-abc')).toEqual(['tracking', 'summary', 'req-abc']);
      expect(TRACKING_QUERY_KEYS.timelines()).toEqual(['tracking', 'timeline']);
      expect(TRACKING_QUERY_KEYS.timeline('req-abc')).toEqual(['tracking', 'timeline', 'req-abc']);
      expect(TRACKING_QUERY_KEYS.timeline('req-abc', { page: 2 })).toEqual([
        'tracking',
        'timeline',
        'req-abc',
        { page: 2 },
      ]);
    });
  });
});
