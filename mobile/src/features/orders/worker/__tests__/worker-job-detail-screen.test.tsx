import type { TrackingEventItem } from '@/features/tracking';
import * as React from 'react';
import { Alert } from 'react-native';
import { useTrackingEvents, useTrackingSummary } from '@/features/tracking';
import { act, cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useWorkerJobDetail } from '../../hooks/use-worker-jobs';
import { WorkerJobDetailScreen } from '../screens/worker-job-detail-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();
let capturedEventHandler: ((event: TrackingEventItem) => void) | undefined;

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ id: 'job-123' })),
}));

jest.mock('../../hooks/use-worker-jobs', () => ({
  useWorkerJobDetail: jest.fn(),
}));

jest.mock('@/features/tracking', () => {
  const actual = jest.requireActual('@/features/tracking');
  return {
    ...actual,
    useTrackingSummary: jest.fn(),
    useTrackingEvents: jest.fn((_serviceRequestId, onEvent) => {
      capturedEventHandler = onEvent;
      return { connectionStatus: 'connected' };
    }),
  };
});

describe('WorkerJobDetailScreen Tracking & Realtime Event Integration', () => {
  let alertSpy: jest.SpyInstance;

  const mockJobOrderBase = {
    id: 'job-123',
    orderCode: 'HG-JOB-123',
    serviceRequestId: 'sr-999',
    bookingProposalId: 'prop-999',
    customerUserId: 'usr-cust-99',
    workerUserId: 'usr-work-99',
    serviceId: 'srv-plumb',
    agreedPrice: 400000,
    agreedScope: 'Sửa đường ống cấp nước sinh hoạt',
    addressText: '456 Lê Duẩn, Hải Châu, Đà Nẵng',
    status: 'in_progress' as const,
    paymentState: 'pending' as const,
    createdAt: '2026-11-06T08:00:00.000Z',
    updatedAt: '2026-11-06T09:00:00.000Z',
  };

  const mockTrackingSummary = {
    serviceRequestId: 'sr-999',
    orderId: 'job-123',
    customerId: 'usr-cust-99',
    currentPhase: 'ORDER_IN_PROGRESS',
    lastUpdatedAt: '2026-11-06T09:30:00.000Z',
    milestones: [
      {
        key: 'service_request',
        title: 'Đăng yêu cầu',
        description: 'Yêu cầu dịch vụ đã được gửi',
        status: 'completed' as const,
        reachedAt: '2026-11-06T08:00:00.000Z',
      },
      {
        key: 'bidding',
        title: 'Tìm thợ & Báo giá',
        description: 'Đã nhận báo giá và chốt thợ',
        status: 'completed' as const,
        reachedAt: '2026-11-06T08:30:00.000Z',
      },
      {
        key: 'booking_proposal',
        title: 'Thỏa thuận dịch vụ',
        description: 'Đã thống nhất phương án',
        status: 'completed' as const,
        reachedAt: '2026-11-06T08:45:00.000Z',
      },
      {
        key: 'order_execution',
        title: 'Thực hiện dịch vụ',
        description: 'Thợ đang tiến hành thực hiện',
        status: 'in_progress' as const,
        reachedAt: '2026-11-06T09:00:00.000Z',
      },
      {
        key: 'payment_completion',
        title: 'Nghiệm thu & Thanh toán',
        description: 'Thanh toán sau khi hoàn thành',
        status: 'pending' as const,
        reachedAt: null,
      },
    ],
  };

  const defaultWorkerJobMock = {
    confirmReadiness: jest.fn(),
    isConfirmingReadiness: false,
    isLoading: false,
    isStartingOrder: false,
    order: mockJobOrderBase,
    refetch: jest.fn(),
    startOrder: jest.fn(),
    statusHistory: [
      {
        id: 'hist-1',
        orderId: 'job-123',
        fromStatus: null,
        toStatus: 'created' as const,
        createdAt: '2026-11-06T08:00:00.000Z',
      },
      {
        id: 'hist-2',
        orderId: 'job-123',
        fromStatus: 'created' as const,
        toStatus: 'in_progress' as const,
        createdAt: '2026-11-06T09:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (useWorkerJobDetail as jest.Mock).mockReturnValue(defaultWorkerJobMock);
    (useTrackingSummary as jest.Mock).mockReturnValue({
      data: mockTrackingSummary,
      isLoading: false,
      isError: false,
    });
    (useTrackingEvents as jest.Mock).mockImplementation((_serviceRequestId, onEvent) => {
      capturedEventHandler = onEvent;
      return { connectionStatus: 'connected' };
    });
  });

  afterEach(() => {
    cleanup();
    alertSpy.mockRestore();
  });

  it('renders Live Tracking Timeline and worker job details', () => {
    render(<WorkerJobDetailScreen jobId="job-123" />);

    expect(screen.getByText('Tiến trình công việc')).toBeOnTheScreen();
    expect(screen.getByText('Trực tiếp')).toBeOnTheScreen();
    expect(screen.getByText('Đăng yêu cầu')).toBeOnTheScreen();
    expect(screen.getByText('Thực hiện dịch vụ')).toBeOnTheScreen();
    expect(screen.getByText('Nghiệm thu & Thanh toán')).toBeOnTheScreen();

    // Check worker job action
    expect(screen.getByTestId('worker-complete-job-nav-btn')).toBeOnTheScreen();
  });

  it('displays connection transitions (reconnecting & disconnected)', () => {
    (useTrackingEvents as jest.Mock).mockReturnValue({
      connectionStatus: 'reconnecting',
    });

    const { rerender } = render(<WorkerJobDetailScreen jobId="job-123" />);
    expect(screen.getByText('Đang kết nối lại...')).toBeOnTheScreen();

    (useTrackingEvents as jest.Mock).mockReturnValue({
      connectionStatus: 'disconnected',
    });
    rerender(<WorkerJobDetailScreen jobId="job-123" />);
    expect(screen.getByText('Ngoại tuyến')).toBeOnTheScreen();
  });

  it('gracefully falls back to statusHistory if Tracking Service is offline or returns error', () => {
    (useTrackingSummary as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<WorkerJobDetailScreen jobId="job-123" />);

    expect(screen.queryByTestId('tracking-timeline-container')).toBeNull();
    expect(screen.getByText('Lịch sử trạng thái đơn hàng (Dự phòng)')).toBeOnTheScreen();
  });

  it('handles Rework event: triggers Alert, displays rework reason banner and enables completion button', () => {
    render(<WorkerJobDetailScreen jobId="job-123" />);

    act(() => {
      capturedEventHandler?.({
        id: 'evt-rework',
        eventId: 'evt-rework',
        entityType: 'order',
        entityId: 'job-123',
        eventType: 'order.status.changed',
        sourceService: 'order-service',
        fromStatus: 'awaiting_customer_confirmation',
        toStatus: 'in_progress',
        reason: 'Mối nối van nước còn rỉ, vui lòng siết chặt lại gioăng cao su',
        occurredAt: '2026-11-06T10:00:00.000Z',
        recordedAt: '2026-11-06T10:00:00.000Z',
      });
    });

    // Alert was shown to worker
    expect(alertSpy).toHaveBeenCalledWith(
      '⚠️ Yêu cầu chỉnh sửa công việc',
      expect.stringContaining('Mối nối van nước còn rỉ'),
      expect.any(Array),
    );
    expect(defaultWorkerJobMock.refetch).toHaveBeenCalledTimes(1);

    // Rework banner is visible
    expect(screen.getByTestId('worker-rework-alert-banner')).toBeOnTheScreen();
    expect(screen.getByText(/Mối nối van nước còn rỉ/)).toBeOnTheScreen();

    // Button to complete job remains active
    expect(screen.getByTestId('worker-complete-job-nav-btn')).toBeOnTheScreen();
  });

  it('handles Completion event: triggers congrats Alert and transitions screen to completed', () => {
    render(<WorkerJobDetailScreen jobId="job-123" />);

    act(() => {
      capturedEventHandler?.({
        id: 'evt-completed',
        eventId: 'evt-completed',
        entityType: 'order',
        entityId: 'job-123',
        eventType: 'order.completed',
        sourceService: 'order-service',
        toStatus: 'completed',
        occurredAt: '2026-11-06T10:30:00.000Z',
        recordedAt: '2026-11-06T10:30:00.000Z',
      });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      '🎉 Nghiệm thu thành công!',
      expect.stringContaining('Tiền công đang được quyết toán vào ví của bạn'),
      expect.any(Array),
    );

    expect(screen.getByText('🎉 Đơn hàng đã hoàn tất!')).toBeOnTheScreen();
    expect(screen.queryByTestId('worker-complete-job-nav-btn')).toBeNull();
  });

  it('handles Dispute event: triggers Alert and displays dispute card', () => {
    render(<WorkerJobDetailScreen jobId="job-123" />);

    act(() => {
      capturedEventHandler?.({
        id: 'evt-dispute',
        eventId: 'evt-dispute',
        entityType: 'order',
        entityId: 'job-123',
        eventType: 'order.disputed',
        sourceService: 'order-service',
        toStatus: 'disputed',
        occurredAt: '2026-11-06T11:00:00.000Z',
        recordedAt: '2026-11-06T11:00:00.000Z',
      });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      '🚨 Đơn hàng đang được khiếu nại',
      expect.stringContaining('Đơn hàng đang trong trạng thái xem xét tranh chấp'),
      expect.any(Array),
    );

    expect(screen.getByTestId('worker-disputed-banner')).toBeOnTheScreen();
  });

  it('navigates to job complete screen when worker presses complete job button', () => {
    render(<WorkerJobDetailScreen jobId="job-123" />);

    const completeBtn = screen.getByTestId('worker-complete-job-nav-btn');
    fireEvent.press(completeBtn);

    expect(mockPush).toHaveBeenCalledWith('/worker/jobs/job-123/complete');
  });

  it('handles onBack prop or router.back when app bar back button is pressed', () => {
    const mockOnBack = jest.fn();
    render(<WorkerJobDetailScreen jobId="job-123" onBack={mockOnBack} />);

    const backBtn = screen.getByTestId('app-bar-back-btn');
    fireEvent.press(backBtn);

    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});
