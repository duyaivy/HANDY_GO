import * as React from 'react';
import { useTrackingEvents, useTrackingSummary } from '@/features/tracking';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useCustomerOrderDetail } from '../../hooks/use-customer-orders';
import { CustomerOrderDetailScreen } from '../screens/customer-order-detail-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ id: 'ord-123' })),
}));

jest.mock('../../hooks/use-customer-orders', () => ({
  useCustomerOrderDetail: jest.fn(),
}));

jest.mock('@/features/tracking', () => {
  const actual = jest.requireActual('@/features/tracking');
  return {
    ...actual,
    useTrackingSummary: jest.fn(),
    useTrackingEvents: jest.fn(),
  };
});

describe('CustomerOrderDetailScreen Tracking Integration', () => {
  const mockOrderBase = {
    id: 'ord-123',
    orderCode: 'HG-ORD-123',
    serviceRequestId: 'sr-456',
    bookingProposalId: 'prop-789',
    customerUserId: 'usr-cust-1',
    workerUserId: 'usr-work-1',
    serviceId: 'srv-clean',
    agreedPrice: 350000,
    agreedScope: 'Dọn dẹp căn hộ 2 phòng ngủ',
    addressText: '123 Đường Nguyễn Văn Linh, Quận 7',
    status: 'in_progress' as const,
    paymentState: 'pending' as const,
    createdAt: '2026-11-06T08:00:00.000Z',
    updatedAt: '2026-11-06T09:00:00.000Z',
  };

  const mockTrackingSummary = {
    serviceRequestId: 'sr-456',
    orderId: 'ord-123',
    customerId: 'usr-cust-1',
    currentPhase: 'ORDER_IN_PROGRESS',
    lastUpdatedAt: '2026-11-06T09:30:00.000Z',
    milestones: [
      {
        key: 'service_request',
        title: 'Đăng yêu cầu',
        description: 'Yêu cầu dịch vụ đã được gửi thành công',
        status: 'completed' as const,
        reachedAt: '2026-11-06T08:00:00.000Z',
      },
      {
        key: 'bidding',
        title: 'Tìm thợ & Báo giá',
        description: 'Đã nhận 4 báo giá và chốt thợ',
        status: 'completed' as const,
        reachedAt: '2026-11-06T08:30:00.000Z',
      },
      {
        key: 'booking_proposal',
        title: 'Thỏa thuận dịch vụ',
        description: 'Đã thống nhất phương án và chi phí',
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

  const defaultOrderDetailMock = {
    cancelOrder: jest.fn(),
    confirmCompletion: jest.fn(),
    isCancelling: false,
    isConfirming: false,
    isDisputing: false,
    isLoading: false,
    isRefetching: false,
    isRequestingRework: false,
    openDispute: jest.fn(),
    order: mockOrderBase,
    refetch: jest.fn(),
    requestRework: jest.fn(),
    statusHistory: [
      {
        id: 'hist-1',
        orderId: 'ord-123',
        fromStatus: null,
        toStatus: 'created' as const,
        createdAt: '2026-11-06T08:00:00.000Z',
      },
      {
        id: 'hist-2',
        orderId: 'ord-123',
        fromStatus: 'created' as const,
        toStatus: 'in_progress' as const,
        createdAt: '2026-11-06T09:00:00.000Z',
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useCustomerOrderDetail as jest.Mock).mockReturnValue(defaultOrderDetailMock);
    (useTrackingSummary as jest.Mock).mockReturnValue({
      data: mockTrackingSummary,
      isLoading: false,
      isError: false,
    });
    (useTrackingEvents as jest.Mock).mockReturnValue({
      connectionStatus: 'connected',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Live Tracking Timeline when tracking summary and SSE are connected', () => {
    render(<CustomerOrderDetailScreen orderId="ord-123" />);

    expect(screen.getByText('Tiến trình công việc')).toBeOnTheScreen();
    expect(screen.getByText('Trực tiếp')).toBeOnTheScreen();
    expect(screen.getByText('Đăng yêu cầu')).toBeOnTheScreen();
    expect(screen.getByText('Tìm thợ & Báo giá')).toBeOnTheScreen();
    expect(screen.getByText('Thỏa thuận dịch vụ')).toBeOnTheScreen();
    expect(screen.getByText('Thực hiện dịch vụ')).toBeOnTheScreen();
    expect(screen.getByText('Nghiệm thu & Thanh toán')).toBeOnTheScreen();

    // Ensure fallback statusHistory is NOT shown when live timeline is active
    expect(screen.queryByText(/Lịch sử trạng thái đơn hàng/)).toBeNull();
  });

  it('shows connection status transitions (reconnecting & disconnected)', () => {
    (useTrackingEvents as jest.Mock).mockReturnValue({
      connectionStatus: 'reconnecting',
    });

    const { rerender } = render(<CustomerOrderDetailScreen orderId="ord-123" />);
    expect(screen.getByText('Đang kết nối lại...')).toBeOnTheScreen();

    (useTrackingEvents as jest.Mock).mockReturnValue({
      connectionStatus: 'disconnected',
    });
    rerender(<CustomerOrderDetailScreen orderId="ord-123" />);
    expect(screen.getByText('Ngoại tuyến')).toBeOnTheScreen();
  });

  it('renders loading state when tracking data is loading', () => {
    (useTrackingSummary as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(<CustomerOrderDetailScreen orderId="ord-123" />);
    expect(screen.getByTestId('tracking-timeline-loading')).toBeOnTheScreen();
    expect(screen.getByText('Đang tải tiến trình công việc...')).toBeOnTheScreen();
  });

  it('gracefully falls back to statusHistory if Tracking Service returns an error', () => {
    (useTrackingSummary as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    render(<CustomerOrderDetailScreen orderId="ord-123" />);

    // Live timeline should not be rendered
    expect(screen.queryByTestId('tracking-timeline-container')).toBeNull();

    // Fallback status history should be displayed
    expect(screen.getByText('Lịch sử trạng thái đơn hàng (Dự phòng)')).toBeOnTheScreen();
    expect(screen.getByText(/Chuyển sang: Đang thi công/)).toBeOnTheScreen();
  });

  it('falls back to statusHistory if order does not have serviceRequestId', () => {
    (useCustomerOrderDetail as jest.Mock).mockReturnValue({
      ...defaultOrderDetailMock,
      order: {
        ...mockOrderBase,
        serviceRequestId: undefined,
      },
    });

    render(<CustomerOrderDetailScreen orderId="ord-123" />);

    expect(screen.queryByTestId('tracking-timeline-container')).toBeNull();
    expect(screen.getByText('Lịch sử trạng thái đơn hàng (Dự phòng)')).toBeOnTheScreen();
  });

  it('renders dispute action button when order is in_progress', () => {
    render(<CustomerOrderDetailScreen orderId="ord-123" />);
    expect(screen.getByTestId('customer-open-dispute-btn')).toBeOnTheScreen();
    expect(screen.getByText('Khiếu Nại / Mở Tranh Chấp')).toBeOnTheScreen();
  });

  it('renders confirm completion and rework buttons when order is awaiting confirmation', () => {
    (useCustomerOrderDetail as jest.Mock).mockReturnValue({
      ...defaultOrderDetailMock,
      order: {
        ...mockOrderBase,
        status: 'awaiting_customer_confirmation',
      },
    });

    render(<CustomerOrderDetailScreen orderId="ord-123" />);
    expect(screen.getByTestId('customer-confirm-completion-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('customer-request-rework-btn')).toBeOnTheScreen();
  });

  it('renders cancel button when order is created or confirmed', () => {
    (useCustomerOrderDetail as jest.Mock).mockReturnValue({
      ...defaultOrderDetailMock,
      order: {
        ...mockOrderBase,
        status: 'created',
      },
    });

    render(<CustomerOrderDetailScreen orderId="ord-123" />);
    expect(screen.getByTestId('customer-cancel-order-btn')).toBeOnTheScreen();
  });

  it('triggers onBack or navigates back when app bar back button is pressed', () => {
    const mockOnBack = jest.fn();
    render(<CustomerOrderDetailScreen orderId="ord-123" onBack={mockOnBack} />);

    const backBtn = screen.getByTestId('app-bar-back-btn');
    fireEvent.press(backBtn);
    expect(mockOnBack).toHaveBeenCalledTimes(1);
  });
});
