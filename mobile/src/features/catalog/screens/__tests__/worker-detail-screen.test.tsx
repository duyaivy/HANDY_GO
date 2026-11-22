import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { Linking } from 'react-native';
import { render } from '@/lib/test-utils';
import { WorkersApi } from '@/services/workers/workers-api';
import { WorkerDetailScreen } from '../worker-detail-screen';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = {};

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
    jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true as any);
    jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders worker profile header with avatar, name, and phone', () => {
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
    expect(screen.getByTestId('worker-profile-phone')).toHaveTextContent('0988 777 666');
    expect(screen.getByTestId('worker-call-btn')).toBeOnTheScreen();
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

  it('triggers phone call on pressing Gọi điện button', async () => {
    render(
      <WorkerDetailScreen
        workerId="w-101"
        phoneNumber="0988 777 666"
      />,
    );

    const callBtn = screen.getByTestId('worker-call-btn');
    fireEvent.press(callBtn);

    expect(Linking.canOpenURL).toHaveBeenCalledWith('tel:0988777666');
  });

  it('navigates to chat on pressing Nhắn tin button', () => {
    render(
      <WorkerDetailScreen
        workerId="w-101"
        workerName="Nguyễn Văn Thợ"
      />,
    );

    const chatBtn = screen.getByTestId('worker-chat-btn');
    fireEvent.press(chatBtn);

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/customer/chat',
      params: {
        workerId: 'w-101',
        workerName: 'Nguyễn Văn Thợ',
      },
    });
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

  describe('Phone number fallback & call CTA safety', () => {
    it('does NOT fallback to mock phone for real worker with no phone, disables call CTA', async () => {
      render(
        <WorkerDetailScreen
          workerId="worker-real-999-uuid"
          workerName="Thợ Thật Không Số"
        />,
      );

      // Verify header phone does not show fake numbers
      expect(screen.queryByText('0912 345 678')).toBeNull();
      expect(screen.queryByText('0977 888 999')).toBeNull();
      expect(screen.queryByText('0988 123 456')).toBeNull();
      expect(screen.getByText('Chưa cập nhật số điện thoại')).toBeOnTheScreen();

      // Pressing call button should show alert and not open tel:
      const callBtn = screen.getByTestId('worker-call-btn');
      fireEvent.press(callBtn);

      expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('opens phone URL when real worker has valid phone', async () => {
      render(
        <WorkerDetailScreen
          workerId="worker-real-999-uuid"
          workerName="Thợ Thật Có Số"
          phoneNumber="0933 444 555"
        />,
      );

      expect(screen.getByText('0933 444 555')).toBeOnTheScreen();

      const callBtn = screen.getByTestId('worker-call-btn');
      fireEvent.press(callBtn);

      expect(Linking.canOpenURL).toHaveBeenCalledWith('tel:0933444555');
      await waitFor(() => {
        expect(Linking.openURL).toHaveBeenCalledWith('tel:0933444555');
      });
    });

    it('falls back to demo phone only for explicit mock worker (th-01)', () => {
      render(
        <WorkerDetailScreen
          workerId="th-01"
        />,
      );

      expect(screen.getByText('0977 888 999')).toBeOnTheScreen();
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
