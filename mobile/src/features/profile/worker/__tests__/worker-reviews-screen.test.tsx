import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { WorkersApi } from '@/services/workers/workers-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { WorkerReviewsScreen } from '../screens/worker-reviews-screen';

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true,
  }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isHydrated: true,
  });
});

describe('workerReviewsScreen', () => {
  it('renders order stats on the same row, rating score, star distribution, and reviews', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-777',
        phone: '0977888999',
        email: 'worker777@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-777',
        fullName: 'Trần Văn Thợ Giỏi',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-777',
          userId: 'worker-777',
          status: 'verified',
          averageRating: 4.8,
          ratingCount: 15,
          completedOrderCount: 48,
          orderCountTotal: 50,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'wp-777',
        userId: 'worker-777',
        fullName: 'Trần Văn Thợ Giỏi',
        avatarUrl: null,
        bio: 'Thợ sửa điện gia dụng tận tâm',
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 4.8,
          ratingCount: 15,
          completedOrderCount: 48,
          orderCountTotal: 50,
          ratingDistribution: {
            5: 12,
            4: 2,
            3: 1,
            2: 0,
            1: 0,
          },
        },
        recentReviews: [
          {
            id: 'rev-1',
            orderId: 'ord-101',
            rating: 5,
            comment: 'Thợ đến đúng giờ, làm việc cẩn thận và nhiệt tình!',
            createdAt: '2026-11-01T10:00:00Z',
            customer: {
              id: 'cust-1',
              fullName: 'Chị Lan',
              avatarUrl: null,
            },
          },
        ],
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerReviews').mockResolvedValue({
      statusCode: 200,
      data: [
        {
          id: 'rev-1',
          orderId: 'ord-101',
          rating: 5,
          comment: 'Thợ đến đúng giờ, làm việc cẩn thận và nhiệt tình!',
          createdAt: '2026-11-01T10:00:00Z',
          customer: {
            id: 'cust-1',
            fullName: 'Chị Lan',
            avatarUrl: null,
          },
        },
      ],
      pagination: {
        page: 1,
        limit: 30,
        total: 1,
        totalPages: 1,
      },
    });

    render(<WorkerReviewsScreen />);

    // Header title
    expect(screen.getByText('Công việc và đánh giá')).toBeOnTheScreen();

    // 1. Row of 3 stats
    await waitFor(() => {
      expect(screen.getByTestId('worker-order-stats-row')).toBeOnTheScreen();
      expect(screen.getByTestId('worker-total-orders')).toHaveTextContent('50');
      expect(screen.getByTestId('worker-completed-orders')).toHaveTextContent('48');
      expect(screen.getByTestId('worker-completion-rate')).toHaveTextContent('96%');
    });

    // 2. Rating overview card
    expect(screen.getByTestId('worker-rating-overview-card')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-average-rating-score')).toHaveTextContent('4.8');
    expect(screen.getByText(/15 đánh giá/)).toBeOnTheScreen();

    // 3. Customer review item
    await waitFor(() => {
      expect(screen.getByText('Chị Lan')).toBeOnTheScreen();
      expect(screen.getByText('Thợ đến đúng giờ, làm việc cẩn thận và nhiệt tình!')).toBeOnTheScreen();
    });
  });

  it('navigates back when pressing back button', () => {
    render(<WorkerReviewsScreen />);
    fireEvent.press(screen.getByTestId('worker-reviews-back-btn'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('displays real zero data honestly when worker has no orders or reviews (no fake fallback)', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-new-001',
        phone: '0911222333',
        email: 'newworker@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-new-001',
        fullName: 'Thợ Mới Vào Nghề',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-new-001',
          userId: 'worker-new-001',
          status: 'verified',
          averageRating: 0,
          ratingCount: 0,
          completedOrderCount: 0,
          orderCountTotal: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'wp-new-001',
        userId: 'worker-new-001',
        fullName: 'Thợ Mới Vào Nghề',
        avatarUrl: null,
        bio: null,
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 0,
          ratingCount: 0,
          completedOrderCount: 0,
          orderCountTotal: 0,
          ratingDistribution: {
            5: 0,
            4: 0,
            3: 0,
            2: 0,
            1: 0,
          },
        },
        recentReviews: [],
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerReviews').mockResolvedValue({
      statusCode: 200,
      data: [],
      pagination: {
        page: 1,
        limit: 30,
        total: 0,
        totalPages: 0,
      },
    });

    render(<WorkerReviewsScreen />);

    await waitFor(() => {
      // 0 total orders, 0 completed, 0% rate
      expect(screen.getByTestId('worker-total-orders')).toHaveTextContent('0');
      expect(screen.getByTestId('worker-completed-orders')).toHaveTextContent('0');
      expect(screen.getByTestId('worker-completion-rate')).toHaveTextContent('0%');
      // 0.0 rating score and 0 reviews
      expect(screen.getByTestId('worker-average-rating-score')).toHaveTextContent('0.0');
      expect(screen.getByText(/0 đánh giá/)).toBeOnTheScreen();
      // Empty reviews indicator
      expect(screen.getByTestId('worker-reviews-empty')).toBeOnTheScreen();
      expect(screen.getByText('Chưa có đánh giá nào')).toBeOnTheScreen();
    });
  });
});
