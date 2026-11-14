import type { TrackingEventItem, TrackingSummaryResponse } from '../types/tracking.types';
import * as React from 'react';
import { Alert } from 'react-native';
import { CustomerOrderDetailScreen } from '@/features/orders/customer/screens/customer-order-detail-screen';
import { WorkerJobDetailScreen } from '@/features/orders/worker/screens/worker-job-detail-screen';
import { act, cleanup, render, screen } from '@/lib/test-utils';
import { TrackingSseClient } from '@/services/sse/tracking-sse-client';
import { computeMilestonesFromSummary } from '../types/tracking.types';

// Mocks
const mockPush = jest.fn();
const mockBack = jest.fn();
let capturedWorkerEventHandler: ((event: TrackingEventItem) => void) | undefined;

let mockCustomerSummary: TrackingSummaryResponse | undefined;
let mockWorkerSummary: TrackingSummaryResponse | undefined;
let mockIsCustomerTrackingError = false;
let mockIsWorkerTrackingError = false;
const mockWorkerOrderBase = {
  id: 'ord-e2e-1',
  serviceRequestId: 'sr-e2e-1',
  status: 'in_progress',
  agreedPrice: 500000,
  agreedScope: 'Lắp đặt máy nước nóng năng lượng mặt trời',
  addressText: '789 Trần Hưng Đạo, Đà Nẵng',
  createdAt: '2026-11-06T08:00:00.000Z',
  statusHistory: [{
    id: 'hist-1',
    orderId: 'ord-e2e-1',
    fromStatus: null,
    toStatus: 'created',
    createdAt: '2026-11-06T08:00:00.000Z',
  }],
};
let mockWorkerOrder: any = mockWorkerOrderBase;

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ id: 'ord-e2e-1' })),
}));

jest.mock('@/features/orders/hooks/use-customer-orders', () => ({
  useCustomerOrderDetail: jest.fn(() => ({
    order: {
      id: 'ord-e2e-1',
      serviceRequestId: 'sr-e2e-1',
      status: 'in_progress',
      agreedPrice: 500000,
      agreedScope: 'Lắp đặt máy nước nóng năng lượng mặt trời',
      addressText: '789 Trần Hưng Đạo, Đà Nẵng',
      createdAt: '2026-11-06T08:00:00.000Z',
    },
    statusHistory: [
      {
        id: 'hist-1',
        orderId: 'ord-e2e-1',
        fromStatus: null,
        toStatus: 'created',
        createdAt: '2026-11-06T08:00:00.000Z',
      },
      {
        id: 'hist-2',
        orderId: 'ord-e2e-1',
        fromStatus: 'created',
        toStatus: 'in_progress',
        createdAt: '2026-11-06T09:00:00.000Z',
      },
    ],
    isLoading: false,
    cancelOrder: jest.fn(),
    confirmCompletion: jest.fn(),
    requestRework: jest.fn(),
    openDispute: jest.fn(),
    refetch: jest.fn(),
  })),
}));

jest.mock('@/features/orders/hooks/use-worker-jobs', () => ({
  useWorkerJobDetail: jest.fn(() => ({
    order: mockWorkerOrder,
    statusHistory: mockWorkerOrder.statusHistory,
    isLoading: false,
    refetch: jest.fn().mockResolvedValue({ data: mockWorkerOrder }),
    confirmReadiness: jest.fn(),
    startOrder: jest.fn(),
  })),
}));

jest.mock('@/features/tracking/hooks/use-tracking-summary', () => ({
  TRACKING_QUERY_KEYS: {
    all: ['tracking'] as const,
    summaries: () => ['tracking', 'summary'] as const,
    summary: (id: string) => ['tracking', 'summary', id] as const,
    timelines: () => ['tracking', 'timeline'] as const,
    timeline: (id: string) => ['tracking', 'timeline', id] as const,
  },
  useTrackingSummary: jest.fn((serviceRequestId?: string) => {
    if (!serviceRequestId) {
      return { data: undefined, isLoading: false, isError: false };
    }
    // Return mock summary depending on customer or worker context
    return {
      data: mockCustomerSummary || mockWorkerSummary,
      isLoading: false,
      isError: mockIsCustomerTrackingError || mockIsWorkerTrackingError,
    };
  }),
}));

jest.mock('@/features/tracking/hooks/use-tracking-events', () => ({
  useTrackingEvents: jest.fn((_serviceRequestId?: string, onEvent?: (e: TrackingEventItem) => void) => {
    if (onEvent) {
      capturedWorkerEventHandler = onEvent;
    }
    return { connectionStatus: 'connected' as const };
  }),
}));

describe('HG-64 Phase 5: End-to-End Live Tracking & Resilience Test Suite', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockIsCustomerTrackingError = false;
    mockIsWorkerTrackingError = false;
    mockCustomerSummary = undefined;
    mockWorkerSummary = undefined;
    mockWorkerOrder = mockWorkerOrderBase;
  });

  afterEach(() => {
    cleanup();
    alertSpy.mockRestore();
  });

  describe('2. Kịch bản E2E Live 8 Bước (Customer <-> Worker)', () => {
    it('Step 1-3: correctly computes milestones from Service Request creation through Bidding and Proposal', () => {
      // Step 1: Request published
      const summaryStep1: Partial<TrackingSummaryResponse> = {
        serviceRequestId: 'sr-e2e-1',
        currentPhase: 'SEEKING_WORKERS',
        serviceRequest: {
          status: 'published',
          createdAt: '2026-11-06T08:00:00.000Z',
          publishedAt: '2026-11-06T08:05:00.000Z',
        },
        bidding: {
          status: 'open',
          bidCount: 2,
        },
      };

      const milestonesStep1 = computeMilestonesFromSummary(summaryStep1);
      expect(milestonesStep1).toHaveLength(5);
      expect(milestonesStep1[0].status).toBe('completed'); // Service request created
      expect(milestonesStep1[1].status).toBe('in_progress'); // Bidding in progress
      expect(milestonesStep1[2].status).toBe('pending'); // Booking proposal pending

      // Step 3: Proposal created
      const summaryStep3: Partial<TrackingSummaryResponse> = {
        ...summaryStep1,
        currentPhase: 'BOOKING_PROPOSAL',
        bookingProposal: {
          status: 'proposed',
          proposalId: 'prop-1',
        },
      };
      const milestonesStep3 = computeMilestonesFromSummary(summaryStep3);
      expect(milestonesStep3[1].status).toBe('completed'); // Bidding done once proposal is chosen
      expect(milestonesStep3[2].status).toBe('in_progress'); // Proposal in progress
    });

    it('Step 4-6: Order confirmed, started, and finished with live timeline updating', () => {
      // Step 4 & 5: Order started
      const summaryStep5: TrackingSummaryResponse = {
        serviceRequestId: 'sr-e2e-1',
        orderId: 'ord-e2e-1',
        customerId: 'usr-cust-1',
        currentPhase: 'ORDER_IN_PROGRESS',
        lastUpdatedAt: '2026-11-06T09:00:00.000Z',
        order: {
          status: 'in_progress',
          createdAt: '2026-11-06T08:30:00.000Z',
        },
        milestones: [
          {
            key: 'service_request',
            title: 'Đăng yêu cầu',
            description: 'Đã xuất bản yêu cầu',
            status: 'completed',
            reachedAt: '2026-11-06T08:00:00.000Z',
          },
          {
            key: 'bidding',
            title: 'Tìm thợ & Báo giá',
            description: 'Đã chốt thợ',
            status: 'completed',
            reachedAt: '2026-11-06T08:20:00.000Z',
          },
          {
            key: 'order_execution',
            title: 'Thực hiện dịch vụ',
            description: 'Thợ đang thi công',
            status: 'in_progress',
            reachedAt: '2026-11-06T09:00:00.000Z',
          },
          {
            key: 'payment_completion',
            title: 'Nghiệm thu & Thanh toán',
            description: 'Chờ nghiệm thu',
            status: 'pending',
            reachedAt: null,
          },
        ],
      };

      mockCustomerSummary = summaryStep5;
      render(<CustomerOrderDetailScreen orderId="ord-e2e-1" />);

      expect(screen.getByText('Tiến trình công việc')).toBeOnTheScreen();
      expect(screen.getByText('Trực tiếp')).toBeOnTheScreen();
      expect(screen.getByText('Thợ đang thi công')).toBeOnTheScreen();
    });

    it('Step 7: Customer requests rework -> Worker receives immediate Alert and rework banner appears', () => {
      mockWorkerSummary = {
        serviceRequestId: 'sr-e2e-1',
        orderId: 'ord-e2e-1',
        customerId: 'usr-cust-1',
        currentPhase: 'ORDER_IN_PROGRESS',
        lastUpdatedAt: '2026-11-06T09:30:00.000Z',
        milestones: [],
      };

      const { rerender } = render(<WorkerJobDetailScreen jobId="ord-e2e-1" />);

      // Realtime rework SSE event arriving at Worker device
      act(() => {
        capturedWorkerEventHandler?.({
          id: 'evt-rework-7',
          eventId: 'evt-rework-7',
          entityType: 'order',
          entityId: 'ord-e2e-1',
          eventType: 'order.rework_requested',
          sourceService: 'order-service',
          metadata: { reworkReason: 'Cần kiểm tra lại dây tiếp đất an toàn của máy nước nóng' },
          occurredAt: '2026-11-06T09:35:00.000Z',
          recordedAt: '2026-11-06T09:35:00.000Z',
        });
      });

      expect(alertSpy).toHaveBeenCalledWith(
        '⚠️ Yêu cầu chỉnh sửa công việc',
        expect.stringContaining('Cần kiểm tra lại dây tiếp đất'),
        expect.any(Array),
      );

      mockWorkerOrder = {
        ...mockWorkerOrderBase,
        statusHistory: [...mockWorkerOrderBase.statusHistory, {
          id: 'hist-rework',
          orderId: 'ord-e2e-1',
          fromStatus: 'awaiting_customer_confirmation',
          toStatus: 'in_progress',
          reason: 'Cần kiểm tra lại dây tiếp đất an toàn của máy nước nóng',
          createdAt: '2026-11-06T09:35:00.000Z',
        }],
      };
      rerender(<WorkerJobDetailScreen jobId="ord-e2e-1" />);
      // Verify rework banner follows the refreshed Order and complete button stays active.
      expect(screen.getByTestId('worker-rework-alert-banner')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-complete-job-nav-btn')).toBeOnTheScreen();
    });

    it('Step 8: Customer confirms completion -> Worker receives completion Alert and screen finalizes', () => {
      mockWorkerSummary = {
        serviceRequestId: 'sr-e2e-1',
        orderId: 'ord-e2e-1',
        customerId: 'usr-cust-1',
        currentPhase: 'COMPLETED',
        lastUpdatedAt: '2026-11-06T10:00:00.000Z',
        milestones: [],
      };

      const { rerender } = render(<WorkerJobDetailScreen jobId="ord-e2e-1" />);

      act(() => {
        capturedWorkerEventHandler?.({
          id: 'evt-complete-8',
          eventId: 'evt-complete-8',
          entityType: 'order',
          entityId: 'ord-e2e-1',
          eventType: 'order.completed',
          sourceService: 'order-service',
          toStatus: 'completed',
          occurredAt: '2026-11-06T10:00:00.000Z',
          recordedAt: '2026-11-06T10:00:00.000Z',
        });
      });

      expect(alertSpy).toHaveBeenCalledWith(
        '🎉 Nghiệm thu thành công!',
        expect.stringContaining('Tiền công đang được quyết toán vào ví của bạn'),
        expect.any(Array),
      );

      mockWorkerOrder = { ...mockWorkerOrderBase, status: 'completed' };
      rerender(<WorkerJobDetailScreen jobId="ord-e2e-1" />);
      expect(screen.getByText('🎉 Đơn hàng đã hoàn tất!')).toBeOnTheScreen();
    });
  });

  describe('3. Kiểm thử Khả năng Phục hồi & Phòng vệ (Resilience Testing)', () => {
    it('3.1 Network drop: TrackingSseClient tracks lastEventId and rebuilds stream URL on reconnect', () => {
      const client = new TrackingSseClient('sr-e2e-1', {
        baseUrl: 'https://api.handygo.vn',
        maxBackoffMs: 50,
      });

      // Initially null lastEventId
      expect(client.getLastEventId()).toBeNull();

      // Dispatch an event with ID evt-seq-42
      (client as any).handleParsedEvent(
        'timeline_event',
        JSON.stringify({
          type: 'timeline_event',
          payload: {
            id: 'evt-seq-42',
            writeSequence: 42,
            eventType: 'order.status.changed',
          },
        }),
      );

      // Event ID stored as lastEventId for recovery
      expect(client.getLastEventId()).toBe('evt-seq-42');

      // Reconstructed stream URL includes lastEventId
      const url = (client as any).buildStreamUrl();
      expect(url).toContain('lastEventId=evt-seq-42');

      client.disconnect();
    });

    it('3.2 Graceful Fallback: When Tracking Service stops or returns error, Customer screen falls back to statusHistory without white screen', () => {
      mockIsCustomerTrackingError = true;
      mockCustomerSummary = undefined;

      render(<CustomerOrderDetailScreen orderId="ord-e2e-1" />);

      // Should not show live tracking timeline
      expect(screen.queryByTestId('tracking-timeline-container')).toBeNull();

      // Should gracefully fall back to Order Service status history
      expect(screen.getByText('Lịch sử trạng thái đơn hàng (Dự phòng)')).toBeOnTheScreen();
      expect(screen.getByText(/Chuyển sang: Đang thi công/)).toBeOnTheScreen();
    });

    it('3.3 Graceful Fallback: When Tracking Service stops or returns error, Worker screen falls back to statusHistory without white screen', () => {
      mockIsWorkerTrackingError = true;
      mockWorkerSummary = undefined;

      render(<WorkerJobDetailScreen jobId="ord-e2e-1" />);

      expect(screen.queryByTestId('tracking-timeline-container')).toBeNull();
      expect(screen.getByText('Lịch sử trạng thái đơn hàng (Dự phòng)')).toBeOnTheScreen();
    });

    it('3.4 Out-of-order tolerance: computeMilestonesFromSummary handles out-of-order state transitions', () => {
      // Summary where order is completed but bidding milestone records closedAt after order
      const outOfOrderSummary: Partial<TrackingSummaryResponse> = {
        serviceRequestId: 'sr-e2e-ooo',
        currentPhase: 'COMPLETED',
        serviceRequest: { status: 'converted_to_order', createdAt: '2026-11-06T08:00:00.000Z' },
        bidding: { status: 'finalized', bidCount: 1, closedAt: '2026-11-06T09:00:00.000Z' },
        bookingProposal: { status: 'finalized', proposalId: 'prop-1' },
        order: { status: 'completed', completedAt: '2026-11-06T10:00:00.000Z' },
        payment: { status: 'succeeded', lastEventAt: '2026-11-06T10:05:00.000Z' },
      };

      const milestones = computeMilestonesFromSummary(outOfOrderSummary);
      expect(milestones[0].status).toBe('completed');
      expect(milestones[1].status).toBe('completed');
      expect(milestones[2].status).toBe('completed');
      expect(milestones[3].status).toBe('completed');
      expect(milestones[4].status).toBe('completed');
    });
  });
});
