import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Alert, Linking } from 'react-native';
import { ChatApi } from '@/features/chat/chat-api';
import { queryClient } from '@/lib/api/query-client';
import { render } from '@/lib/test-utils';
import { WorkersApi } from '@/services/workers/workers-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { WorkerDetailScreen } from '../worker-detail-screen';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};
const initialAuthState = useAuthStore.getState();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));

describe('WorkerDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    queryClient.clear();
    useAuthStore.setState({
      ...initialAuthState,
      isAuthenticated: true,
      user: { id: 'cust-1', fullName: 'Khách Hàng', role: 'Customer', roles: ['Customer'] } as any,
      activeMode: 'Customer',
    });
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true as any);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  });

  afterEach(() => {
    queryClient.clear();
    useAuthStore.setState(initialAuthState, true);
    jest.restoreAllMocks();
  });

  it('renders worker profile header without trusting unmasked phone prop and hides call button', () => {
    render(
      <WorkerDetailScreen
        workerId="w-101"
        workerName="Nguyễn Văn Thợ"
        phoneNumber="0988 777 666"
        headline="Thợ sửa điện gia dụng"
        avatarUrl="https://example.com/avatar.jpg"
      />,
    );

    // Header Card
    expect(screen.getByTestId('worker-profile-card')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-profile-name')).toHaveTextContent('Nguyễn Văn Thợ');
    expect(screen.queryByText('0988 777 666')).toBeNull();
    expect(screen.getByTestId('worker-profile-phone')).toHaveTextContent('Chưa cập nhật số điện thoại');
    expect(screen.queryByTestId('worker-call-btn')).toBeNull();
    expect(screen.getByTestId('worker-chat-btn')).toBeOnTheScreen();
  });

  it('renders 3 performance stats cards (total orders, completed orders, completion rate)', () => {
    render(
      <WorkerDetailScreen
        workerId="w-101"
        workerName="Nguyễn Văn Thợ"
      />,
    );

    expect(screen.getByTestId('worker-order-stats-row')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-total-orders')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-completed-orders')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-completion-rate')).toBeOnTheScreen();
    expect(screen.getByText('Đơn đã nhận')).toBeOnTheScreen();
    expect(screen.getByText('Đã hoàn thành')).toBeOnTheScreen();
    expect(screen.getByText('Tỉ lệ xong')).toBeOnTheScreen();
  });

  it('renders rating overview card and distribution bars', () => {
    render(
      <WorkerDetailScreen
        workerId="w-101"
        workerName="Nguyễn Văn Thợ"
      />,
    );

    expect(screen.getByTestId('worker-rating-overview-card')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-average-rating-score')).toBeOnTheScreen();
    expect(screen.getByText('Đánh giá của khách hàng')).toBeOnTheScreen();
  });

  it('renders filter chips and filters reviews by star rating', () => {
    render(
      <WorkerDetailScreen
        workerId="w-101"
        workerName="Nguyễn Văn Thợ"
      />,
    );

    expect(screen.getByTestId('filter-chip-all')).toBeOnTheScreen();
    expect(screen.getByTestId('filter-chip-5')).toBeOnTheScreen();
    expect(screen.getByTestId('filter-chip-4')).toBeOnTheScreen();

    // Default shows reviews list
    expect(screen.getByTestId('worker-reviews-list')).toBeOnTheScreen();

    // Filter by 1 star where mock has 0 reviews
    fireEvent.press(screen.getByTestId('filter-chip-1'));
    expect(screen.getByTestId('worker-reviews-empty')).toBeOnTheScreen();
    expect(screen.getByText('Hiện chưa có nhận xét nào đạt mức 1 sao.')).toBeOnTheScreen();

    // Filter back to all
    fireEvent.press(screen.getByTestId('filter-chip-all'));
    expect(screen.getByTestId('worker-reviews-list')).toBeOnTheScreen();
  });

  it('hides Gọi điện button on worker profile', () => {
    render(
      <WorkerDetailScreen
        workerId="w-101"
        phoneNumber="0988 777 666"
      />,
    );

    expect(screen.queryByTestId('worker-call-btn')).toBeNull();
  });

  it('resolves conversation and navigates to /chat/:id when eligible request/bid context is present', async () => {
    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValueOnce({
      statusCode: 200,
      data: { id: 'worker-prof-1', userId: 'worker-user-1', fullName: 'Nguyễn Văn Thợ', phone: '09***78', stats: { averageRating: 4.8, ratingCount: 1, completedOrderCount: 1, orderCountTotal: 1, ratingDistribution: {} }, services: [] } as any,
    } as any);
    jest.spyOn(ChatApi, 'list').mockResolvedValueOnce({ items: [], nextCursor: null });
    jest.spyOn(ChatApi, 'create').mockResolvedValueOnce({
      id: 'conv-detail-1',
      requestId: 'req-101',
      orderId: null,
      customerId: 'cust-1',
      workerId: 'worker-user-1',
      workerName: 'Nguyễn Văn Thợ',
      status: 'OPEN',
      lastSequence: '0',
      lastMessageAt: null,
      createdAt: '2026-11-01T00:00:00Z',
      updatedAt: '2026-11-01T00:00:00Z',
      permissions: { read: true, send: true, reason: null },
      readStates: [],
    });

    render(
      <WorkerDetailScreen
        workerId="worker-prof-1"
        workerName="Nguyễn Văn Thợ"
        requestId="req-101"
        bidId="bid-101"
      />,
    );

    const chatBtn = screen.getByTestId('worker-chat-btn');
    fireEvent.press(chatBtn);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/chat/conv-detail-1?name=Nguy%E1%BB%85n%20V%C4%83n%20Th%E1%BB%A3');
    });
  });

  it('disables chat CTA when profile lacks eligible bid/request/order context and surfaces BE denial alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    const { unmount } = render(
      <WorkerDetailScreen
        workerId="worker-real-no-ctx"
        workerName="Thợ Không Ngữ Cảnh"
      />,
    );

    const disabledBtn = screen.getByTestId('worker-chat-btn');
    expect(disabledBtn).toBeDisabled();
    fireEvent.press(disabledBtn);
    expect(mockPush).not.toHaveBeenCalled();
    unmount();

    jest.spyOn(ChatApi, 'list').mockResolvedValueOnce({ items: [], nextCursor: null });
    jest.spyOn(ChatApi, 'create').mockRejectedValueOnce({ code: 'CHAT_INELIGIBLE' });

    render(
      <WorkerDetailScreen
        workerId="worker-real-denied"
        workerName="Thợ Bị Từ Chối"
        requestId="req-denied"
        bidId="bid-denied"
      />,
    );

    fireEvent.press(screen.getByTestId('worker-chat-btn'));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Chưa thể nhắn tin', expect.any(String));
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('handles back button via onBack prop or router.back', () => {
    const onBackMock = jest.fn();
    render(
      <WorkerDetailScreen
        workerId="w-101"
        onBack={onBackMock}
      />,
    );

    const backBtn = screen.getByTestId('app-bar-back-btn');
    fireEvent.press(backBtn);

    expect(onBackMock).toHaveBeenCalled();
  });

  it('renders multiple services in header chips and dedicated services section', () => {
    const multiServices = [
      {
        id: 's-1',
        serviceId: 's-dien',
        title: 'Sửa điện gia dụng',
        experienceYears: 7,
        isActive: true,
        description: 'Chuyên sửa chập cháy, aptomat, công tắc đèn.',
      },
      {
        id: 's-2',
        serviceId: 's-lanh',
        title: 'Bảo dưỡng máy lạnh',
        experienceYears: 5,
        isActive: true,
        description: 'Vệ sinh máy lạnh, nạp gas, kiểm tra xì gas.',
      },
      {
        id: 's-3',
        serviceId: 's-nuoc',
        title: 'Sửa ống nước & vòi sen',
        experienceYears: 4,
        isActive: true,
        description: 'Xử lý rò rỉ nước, thay vòi, lắp bơm tăng áp.',
      },
    ];

    render(
      <WorkerDetailScreen
        workerId="w-101"
        workerName="Nguyễn Văn Thợ"
        services={multiServices}
      />,
    );

    // Dedicated Services Section
    expect(screen.getByTestId('worker-services-section')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-services-count')).toHaveTextContent('3 dịch vụ');
    expect(screen.getByTestId('worker-services-list')).toBeOnTheScreen();
    expect(screen.getAllByText('Sửa điện gia dụng').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Bảo dưỡng máy lạnh').length).toBeGreaterThanOrEqual(1);

    // Default renders first 2 services, and show "Xem tất cả"
    expect(screen.getByTestId('toggle-expand-services-btn')).toBeOnTheScreen();
    expect(screen.getByText('Xem tất cả')).toBeOnTheScreen();

    // Press expand button
    fireEvent.press(screen.getByTestId('toggle-expand-services-btn'));
    expect(screen.getByText('Thu gọn')).toBeOnTheScreen();
    expect(screen.getByText('Sửa ống nước & vòi sen')).toBeOnTheScreen();
    expect(screen.getByText('4 năm kinh nghiệm')).toBeOnTheScreen();

    // Press collapse button
    fireEvent.press(screen.getByTestId('toggle-expand-services-btn'));
    expect(screen.getByText('Xem tất cả')).toBeOnTheScreen();
  });

  describe('Phone number masking & route/prop safety', () => {
    it('never renders unmasked phone from props or route params while API is loading or returns null', async () => {
      mockParams = { id: 'worker-real-999-uuid', phone: '0988777666', phoneNumber: '0933 444 555' };
      jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValueOnce({
        statusCode: 200,
        data: {
          id: 'worker-real-999-uuid',
          userId: 'u-999',
          fullName: 'Thợ Thật Không Số',
          phone: null,
          status: 'verified',
          isVerified: true,
          stats: { averageRating: 0, ratingCount: 0, completedOrderCount: 0, orderCountTotal: 0, ratingDistribution: {} },
          services: [],
        } as any,
      } as any);

      render(
        <WorkerDetailScreen
          workerId="worker-real-999-uuid"
          workerName="Thợ Thật Không Số"
          phoneNumber="0911 222 333"
        />,
      );

      expect(screen.queryByText('0988777666')).toBeNull();
      expect(screen.queryByText('0933 444 555')).toBeNull();
      expect(screen.queryByText('0911 222 333')).toBeNull();
      expect(screen.queryByText('0912 345 678')).toBeNull();
      expect(screen.getByText('Chưa cập nhật số điện thoại')).toBeOnTheScreen();
      expect(screen.queryByTestId('worker-call-btn')).toBeNull();

      await waitFor(() => {
        expect(WorkersApi.getWorkerPublicProfile).toHaveBeenCalledWith('worker-real-999-uuid');
      });
      expect(screen.queryByText('0988777666')).toBeNull();
      expect(screen.queryByText('0933 444 555')).toBeNull();
      expect(screen.queryByText('0911 222 333')).toBeNull();
    });

    it('renders only backend-masked phone even if route params/props inject raw phone', async () => {
      mockParams = { id: 'worker-real-masked-uuid', phone: '0912345678', phoneNumber: '0912345678' };
      jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValueOnce({
        statusCode: 200,
        data: {
          id: 'worker-real-masked-uuid',
          userId: 'u-masked',
          fullName: 'Thợ Thật Đã Mask',
          phone: '09***78',
          status: 'verified',
          isVerified: true,
          stats: { averageRating: 4.8, ratingCount: 5, completedOrderCount: 10, orderCountTotal: 10, ratingDistribution: {} },
          services: [],
        } as any,
      } as any);

      render(
        <WorkerDetailScreen
          workerId="worker-real-masked-uuid"
          workerName="Thợ Thật Đã Mask"
          phoneNumber="0912345678"
        />,
      );

      expect(screen.queryByText('0912345678')).toBeNull();
      await waitFor(() => {
        expect(screen.getByTestId('worker-profile-phone')).toHaveTextContent('09***78');
      });
      expect(screen.queryByText('0912345678')).toBeNull();
      expect(screen.queryByTestId('worker-call-btn')).toBeNull();
    });

    it('does not expose hardcoded demo phone even for mock worker (th-01)', () => {
      render(
        <WorkerDetailScreen
          workerId="th-01"
        />,
      );

      expect(screen.queryByText('0977 888 999')).toBeNull();
      expect(screen.getByTestId('worker-profile-phone')).toHaveTextContent('Chưa cập nhật số điện thoại');
    });
  });

  describe('Reviews fallback & error handling for real worker vs mock', () => {
    it('shows empty reviews state and NO mock reviews for real worker with 0 reviews', async () => {
      jest.spyOn(WorkersApi, 'getWorkerReviews').mockResolvedValueOnce({
        statusCode: 200,
        data: [],
        pagination: { page: 1, limit: 15, total: 0, totalPages: 0 },
      });

      render(
        <WorkerDetailScreen
          workerId="worker-real-zero-reviews"
          workerName="Thợ Thật Chưa Review"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('worker-reviews-empty')).toBeOnTheScreen();
      });

      // Must NOT display fake mock review authors
      expect(screen.queryByText('Nguyễn Văn Hùng')).toBeNull();
      expect(screen.queryByText('Trần Thị Mai')).toBeNull();
      expect(screen.queryByText('Lê Hoàng Nam')).toBeNull();
    });

    it('shows error retry block when reviews API rejects for real worker', async () => {
      jest.spyOn(WorkersApi, 'getWorkerReviews').mockRejectedValueOnce(new Error('Internal Server Error (500)'));

      render(
        <WorkerDetailScreen
          workerId="worker-real-review-error"
          workerName="Thợ Thật Lỗi Review"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('worker-reviews-error')).toBeOnTheScreen();
      });
      expect(screen.getByTestId('worker-reviews-retry-btn')).toBeOnTheScreen();
      expect(screen.queryByText('Nguyễn Văn Hùng')).toBeNull();
    });

    it('renders sample mock reviews for demo mock worker (w-101)', () => {
      render(
        <WorkerDetailScreen
          workerId="w-101"
          workerName="Nguyễn Văn Thợ"
        />,
      );

      expect(screen.getByTestId('worker-reviews-list')).toBeOnTheScreen();
      expect(screen.getByText('Nguyễn Văn Hùng')).toBeOnTheScreen();
    });
  });

  describe('Performance stats & services fallback safety for real worker vs mock', () => {
    it('does NOT fallback to mock stats or mock services for real worker with null/zero stats', async () => {
      jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValueOnce({
        statusCode: 200,
        data: {
          id: 'worker-real-zero-stats',
          userId: 'u-1',
          fullName: 'Thợ Mới Tinh',
          phone: null,
          status: 'verified',
          isVerified: true,
          stats: {
            averageRating: 0,
            ratingCount: 0,
            completedOrderCount: 0,
            orderCountTotal: 0,
            ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
          },
          services: [],
        } as any,
      } as any);

      render(
        <WorkerDetailScreen
          workerId="worker-real-zero-stats"
          workerName="Thợ Mới Tinh"
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('worker-total-orders')).toHaveTextContent('0');
      });

      // Stats check
      expect(screen.getByTestId('worker-total-orders')).toHaveTextContent('0');
      expect(screen.getByTestId('worker-completed-orders')).toHaveTextContent('0');
      expect(screen.getByTestId('worker-completion-rate')).toHaveTextContent('—');
      expect(screen.queryByText('98%')).toBeNull();
      expect(screen.queryByText('28')).toBeNull();
      expect(screen.queryByText('27')).toBeNull();

      // Rating score
      expect(screen.getByTestId('worker-average-rating-score')).toHaveTextContent('—');
      expect(screen.getByText('0 đánh giá')).toBeOnTheScreen();
      expect(screen.queryByText('4.9')).toBeNull();
      expect(screen.queryByText('25 đánh giá')).toBeNull();

      // Services check: must be empty state, no mock services
      expect(screen.getByTestId('worker-services-empty')).toBeOnTheScreen();
      expect(screen.getByText('Thợ chưa cập nhật danh sách dịch vụ.')).toBeOnTheScreen();
      expect(screen.queryByText('Bảo dưỡng & vệ sinh máy lạnh')).toBeNull();
      expect(screen.queryByText('Sửa chữa ống nước & thiết bị vệ sinh')).toBeNull();
    });

    it('falls back to mock stats and default mock services for mock worker (w-101)', () => {
      render(
        <WorkerDetailScreen
          workerId="w-101"
          workerName="Nguyễn Văn Thợ"
        />,
      );

      // Total orders fallback for demo
      expect(screen.getByTestId('worker-total-orders')).toHaveTextContent('28');
      expect(screen.getByTestId('worker-completed-orders')).toHaveTextContent('27');
      expect(screen.getByTestId('worker-completion-rate')).toHaveTextContent('96%');

      // Mock services
      expect(screen.getByTestId('worker-services-section')).toBeOnTheScreen();
      expect(screen.getByText('Bảo dưỡng & vệ sinh máy lạnh')).toBeOnTheScreen();
    });
  });
});
