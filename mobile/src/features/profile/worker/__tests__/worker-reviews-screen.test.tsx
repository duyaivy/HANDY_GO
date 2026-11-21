import * as React from 'react';
import { Linking } from 'react-native';
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

  it('renders review media gallery and opens lightbox modal on tap', async () => {
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
          averageRating: 5.0,
          ratingCount: 1,
          completedOrderCount: 1,
          orderCountTotal: 1,
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
        bio: null,
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 5.0,
          ratingCount: 1,
          completedOrderCount: 1,
          orderCountTotal: 1,
          ratingDistribution: {
            5: 1,
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
      data: [
        {
          id: 'rev-media-1',
          orderId: 'ord-202',
          rating: 5,
          comment: 'Sửa bồn rửa bát rất sạch sẽ, có ảnh nghiệm thu đính kèm.',
          createdAt: '2026-11-05T10:00:00Z',
          customer: {
            id: 'cust-2',
            fullName: 'Anh Hoàng',
            avatarUrl: null,
          },
          media: [
            {
              id: 'media-1',
              mediaType: 'image',
              mediaUrl: 'https://storage.example.com/reviews/bon-rua.jpg',
            },
            {
              id: 'media-2',
              mediaType: 'video',
              mediaUrl: 'https://storage.example.com/reviews/video.mp4',
              thumbnailUrl: 'https://storage.example.com/reviews/thumb.jpg',
            },
          ],
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

    await waitFor(() => {
      expect(screen.getByText('Anh Hoàng')).toBeOnTheScreen();
      expect(screen.getByText('Sửa bồn rửa bát rất sạch sẽ, có ảnh nghiệm thu đính kèm.')).toBeOnTheScreen();
    });

    expect(screen.getByTestId('review-media-gallery-rev-media-1')).toBeOnTheScreen();
    const mediaItem0 = screen.getByTestId('review-media-item-rev-media-1-0');
    expect(mediaItem0).toBeOnTheScreen();

    // 1. Open image in lightbox
    fireEvent.press(mediaItem0);
    expect(screen.getByTestId('review-media-lightbox')).toBeOnTheScreen();
    expect(screen.getByText('Nhấn ra ngoài để đóng')).toBeOnTheScreen();

    // Close lightbox
    fireEvent.press(screen.getByTestId('review-media-lightbox'));

    // 2. Open video in lightbox and trigger fullscreen playback
    const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as any);
    const mediaItem1 = screen.getByTestId('review-media-item-rev-media-1-1');
    expect(mediaItem1).toBeOnTheScreen();

    fireEvent.press(mediaItem1);
    expect(screen.getByTestId('review-media-lightbox')).toBeOnTheScreen();
    expect(screen.getByText('VIDEO ĐÁNH GIÁ')).toBeOnTheScreen();

    const playBtn = screen.getByTestId('lightbox-play-video-btn');
    expect(playBtn).toBeOnTheScreen();
    expect(screen.getByText('Phát video toàn màn hình')).toBeOnTheScreen();

    fireEvent.press(playBtn);
    expect(openUrlSpy).toHaveBeenCalledWith('https://storage.example.com/reviews/video.mp4');

    fireEvent.press(screen.getByTestId('review-media-lightbox'));
  });

  it('supports infinite scroll / loading more reviews when totalPages > 1', async () => {
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
          averageRating: 4.9,
          ratingCount: 30,
          completedOrderCount: 40,
          orderCountTotal: 40,
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
        bio: null,
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 4.9,
          ratingCount: 30,
          completedOrderCount: 40,
          orderCountTotal: 40,
          ratingDistribution: { 5: 28, 4: 2, 3: 0, 2: 0, 1: 0 },
        },
        recentReviews: [],
      },
    });

    const getReviewsSpy = jest.spyOn(WorkersApi, 'getWorkerReviews').mockImplementation(async (_id, params) => {
      const page = params?.page || 1;
      if (page === 1) {
        return {
          statusCode: 200,
          data: [
            {
              id: 'rev-page-1',
              orderId: 'ord-p1',
              rating: 5,
              comment: 'Đánh giá trang 1',
              createdAt: '2026-11-01T10:00:00Z',
              customer: { id: 'cust-p1', fullName: 'Khách Trang 1', avatarUrl: null },
            },
          ],
          pagination: { page: 1, limit: 15, total: 2, totalPages: 2 },
        };
      }
      return {
        statusCode: 200,
        data: [
          {
            id: 'rev-page-2',
            orderId: 'ord-p2',
            rating: 5,
            comment: 'Đánh giá trang 2',
            createdAt: '2026-11-02T10:00:00Z',
            customer: { id: 'cust-p2', fullName: 'Khách Trang 2', avatarUrl: null },
          },
        ],
        pagination: { page: 2, limit: 15, total: 2, totalPages: 2 },
      };
    });

    render(<WorkerReviewsScreen />);

    await waitFor(() => {
      expect(screen.getByText('Đánh giá trang 1')).toBeOnTheScreen();
    });

    // Load more button should be visible because totalPages: 2 and currentPage: 1
    const loadMoreBtn = screen.getByTestId('worker-reviews-load-more-btn');
    expect(loadMoreBtn).toBeOnTheScreen();
    expect(screen.getByText('Xem thêm nhận xét')).toBeOnTheScreen();

    // Trigger load more
    fireEvent.press(loadMoreBtn);

    await waitFor(() => {
      expect(getReviewsSpy).toHaveBeenCalledWith(
        'wp-777',
        expect.objectContaining({ page: 2 }),
      );
      expect(screen.getByText('Đánh giá trang 2')).toBeOnTheScreen();
    });
  });

  it('translates good, neutral, bad criteria ratings to Vietnamese and renders without star symbol', async () => {
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
          averageRating: 5.0,
          ratingCount: 1,
          completedOrderCount: 1,
          orderCountTotal: 1,
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
        bio: null,
        status: 'verified',
        isVerified: true,
        stats: {
          averageRating: 5.0,
          ratingCount: 1,
          completedOrderCount: 1,
          orderCountTotal: 1,
          ratingDistribution: { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 },
        },
        recentReviews: [],
      },
    });

    jest.spyOn(WorkersApi, 'getWorkerReviews').mockResolvedValue({
      statusCode: 200,
      data: [
        {
          id: 'rev-crit-1',
          orderId: 'ord-303',
          rating: 5,
          comment: 'Dịch vụ rất hài lòng.',
          qualityRating: 'good',
          attitudeRating: 'neutral',
          speedRating: 'bad',
          createdAt: '2026-11-06T10:00:00Z',
          customer: {
            id: 'cust-3',
            fullName: 'Bác Minh',
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

    await waitFor(() => {
      expect(screen.getByText('Bác Minh')).toBeOnTheScreen();
    });

    expect(screen.getByTestId('review-criteria-row-rev-crit-1')).toBeOnTheScreen();
    expect(screen.getByTestId('review-criteria-quality-rev-crit-1')).toHaveTextContent('Chất lượng: Tốt');
    expect(screen.getByTestId('review-criteria-attitude-rev-crit-1')).toHaveTextContent('Thái độ: Bình thường');
    expect(screen.getByTestId('review-criteria-speed-rev-crit-1')).toHaveTextContent('Tốc độ: Chậm');

    expect(screen.queryByText(/good/i)).toBeNull();
    expect(screen.queryByText(/neutral/i)).toBeNull();
    expect(screen.queryByText(/★/)).toBeNull();
  });
});
