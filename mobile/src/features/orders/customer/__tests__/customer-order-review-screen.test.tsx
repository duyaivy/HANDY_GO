import * as React from 'react';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { ReviewsApi } from '@/services/reviews/reviews-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { OrdersApi } from '../../api/orders.api';
import { CustomerOrderDetailScreen } from '../screens/customer-order-detail-screen';
import { CustomerOrderReviewScreen } from '../screens/customer-order-review-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ id: 'ord-completed-123' })),
}));

jest.mock('@/features/tracking', () => {
  const actual = jest.requireActual('@/features/tracking');
  return {
    ...actual,
    useTrackingSummary: jest.fn(() => ({
      data: undefined,
      isLoading: false,
      isError: true,
    })),
    useTrackingEvents: jest.fn(() => ({
      connectionStatus: 'disconnected',
    })),
  };
});

const initialAuthState = useAuthStore.getState();

beforeEach(() => {
  jest.spyOn(Alert, 'alert');
  jest.spyOn(OrdersApi, 'getStatusHistory').mockResolvedValue({
    data: [],
    statusCode: 200,
    message: 'OK',
  } as any);
});

afterEach(() => {
  cleanup();
  useAuthStore.setState(initialAuthState, true);
  delete (globalThis as any).__USE_REAL_PHOTO_PICKER__;
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('CustomerOrderReviewScreen', () => {
  const mockOrder = {
    id: 'ord-completed-123',
    orderCode: 'ORD-8888',
    customerUserId: 'cust-uuid-1',
    workerUserId: 'worker-uuid-2',
    worker: {
      fullName: 'Bác Ba Thợ Điện',
      avatarUrl: 'https://example.com/avatar.jpg',
      headline: 'Thợ điện dân dụng 15 năm kinh nghiệm',
    },
    service: {
      name: 'Lắp đặt công tơ điện và atomat',
    },
    agreedPrice: 350000,
    status: 'completed',
    paymentState: 'paid',
    completedAt: '2026-11-18T10:00:00Z',
    createdAt: '2026-11-18T08:00:00Z',
  };

  beforeEach(() => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      statusCode: 200,
      data: mockOrder,
      message: 'OK',
    } as any);
    jest.spyOn(ReviewsApi, 'getOrderReview').mockResolvedValue(null);
  });

  it('renders review screen with worker info, star ratings, criteria, tags, and submit button', async () => {
    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    expect(screen.getByText('Đánh giá dịch vụ')).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.getByText('Mã đơn: #ORD-8888')).toBeOnTheScreen();
      expect(screen.getByText('Bác Ba Thợ Điện')).toBeOnTheScreen();
      expect(screen.getByText('Lắp đặt công tơ điện và atomat')).toBeOnTheScreen();
    });
    expect(screen.getByText('Bạn đánh giá trải nghiệm dịch vụ thế nào?')).toBeOnTheScreen();
    expect(screen.getByTestId('star-rating-button-5')).toBeOnTheScreen();
    expect(screen.getByText('Đánh giá chi tiết tiêu chí')).toBeOnTheScreen();
    expect(screen.getByTestId('review-comment-input')).toBeOnTheScreen();
    expect(screen.getByTestId('add-review-photo-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('submit-review-btn')).toBeOnTheScreen();
  });

  it('changes star rating and updates dynamic sentiment feedback label', async () => {
    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    // Default is 5 stars: "Rất tuyệt vời! 🌟"
    expect(screen.getByTestId('rating-feedback-title')).toHaveTextContent('Rất tuyệt vời! 🌟');

    // Tap 1 star
    fireEvent.press(screen.getByTestId('star-rating-button-1'));
    expect(screen.getByTestId('rating-feedback-title')).toHaveTextContent('Rất không hài lòng 😞');

    // Tap 3 stars
    fireEvent.press(screen.getByTestId('star-rating-button-3'));
    expect(screen.getByTestId('rating-feedback-title')).toHaveTextContent('Bình thường 😐');

    // Tap 4 stars
    fireEvent.press(screen.getByTestId('star-rating-button-4'));
    expect(screen.getByTestId('rating-feedback-title')).toHaveTextContent('Hài lòng 🙂');
  });

  it('toggles criteria options (attitude, quality, speed)', async () => {
    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    // Tap bad attitude
    fireEvent.press(screen.getByTestId('criteria-attitude-bad'));
    // Tap neutral quality
    fireEvent.press(screen.getByTestId('criteria-quality-neutral'));
    // Tap good speed
    fireEvent.press(screen.getByTestId('criteria-speed-good'));

    expect(screen.getByTestId('criteria-attitude-bad')).toBeOnTheScreen();
    expect(screen.getByTestId('criteria-quality-neutral')).toBeOnTheScreen();
    expect(screen.getByTestId('criteria-speed-good')).toBeOnTheScreen();
  });

  it('toggles quick suggestion tags to append and remove comment text', async () => {
    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    const tag0 = screen.getByTestId('quick-tag-0'); // 'Thợ rất nhiệt tình, chu đáo'
    fireEvent.press(tag0);

    const input = screen.getByTestId('review-comment-input');
    expect(input.props.value).toContain('Thợ rất nhiệt tình, chu đáo');

    // Tap tag 1 to append
    const tag1 = screen.getByTestId('quick-tag-1'); // 'Đến đúng giờ hẹn'
    fireEvent.press(tag1);
    expect(input.props.value).toContain('Đến đúng giờ hẹn');

    // Tap tag 0 again to remove
    fireEvent.press(tag0);
    expect(input.props.value).not.toContain('Thợ rất nhiệt tình, chu đáo');
  });

  it('allows adding and removing photo attachments', async () => {
    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    expect(screen.queryByTestId('review-photo-item-0')).toBeNull();

    // Add first photo
    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    expect(screen.getByTestId('review-photo-item-0')).toBeOnTheScreen();

    // Add second photo
    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    expect(screen.getByTestId('review-photo-item-1')).toBeOnTheScreen();

    // Remove first photo
    fireEvent.press(screen.getByTestId('remove-review-photo-btn-0'));
    // Now only 1 photo remains
    expect(screen.queryByTestId('review-photo-item-1')).toBeNull();
    expect(screen.getByTestId('review-photo-item-0')).toBeOnTheScreen();
  });

  it('submits review successfully and triggers completion alert', async () => {
    const createReviewSpy = jest.spyOn(ReviewsApi, 'createReview').mockResolvedValue({
      id: 'rev-new-001',
      orderId: 'ord-completed-123',
      rating: 5,
      comment: 'Làm việc rất có tâm',
      attitudeRating: 'good',
      qualityRating: 'good',
      speedRating: 'good',
      status: 'published',
      createdAt: new Date().toISOString(),
    } as any);

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    // Type comment
    fireEvent.changeText(screen.getByTestId('review-comment-input'), 'Làm việc rất có tâm');

    // Press Submit
    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(createReviewSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'ord-completed-123',
          rating: 5,
          comment: 'Làm việc rất có tâm',
          attitudeRating: 'good',
          qualityRating: 'good',
          speedRating: 'good',
        }),
      );
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Cảm ơn bạn!',
      'Đánh giá của bạn đã được ghi nhận và gửi tới thợ.',
      expect.any(Array),
    );
  });

  it('displays existing review and handles edit mode within 48h', async () => {
    const existingReview = {
      id: 'rev-existing-1',
      orderId: 'ord-completed-123',
      rating: 4,
      comment: 'Thợ làm tốt nhưng đến trễ 10 phút',
      attitudeRating: 'good' as const,
      qualityRating: 'good' as const,
      speedRating: 'neutral' as const,
      status: 'published',
      isEdited: false,
      createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), // 2 hours ago
      media: [],
    };

    jest.spyOn(ReviewsApi, 'getOrderReview').mockResolvedValue(existingReview as any);
    const updateReviewSpy = jest.spyOn(ReviewsApi, 'updateReview').mockResolvedValue({
      ...existingReview,
      rating: 5,
      isEdited: true,
    } as any);

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    await waitFor(() => {
      expect(screen.getByTestId('review-comment-input').props.value).toBe(
        'Thợ làm tốt nhưng đến trễ 10 phút',
      );
    });

    // Update rating to 5
    fireEvent.press(screen.getByTestId('star-rating-button-5'));

    // Submit edit
    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(updateReviewSpy).toHaveBeenCalledWith(
        'rev-existing-1',
        expect.objectContaining({
          rating: 5,
        }),
      );
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Thành công',
      'Đánh giá đã được cập nhật thành công!',
      expect.any(Array),
    );
  });

  it('displays error alert when createReview fails', async () => {
    jest.spyOn(ReviewsApi, 'createReview').mockRejectedValue({
      response: { data: { message: 'Đơn hàng này đã được đánh giá trước đó' } },
    });

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Không thể gửi đánh giá',
        'Đơn hàng này đã được đánh giá trước đó',
      );
    });
  });
});

describe('CustomerOrderDetailScreen review integration', () => {
  const completedOrder = {
    id: 'ord-completed-456',
    orderCode: 'ORD-456',
    customerUserId: 'cust-uuid-1',
    workerUserId: 'worker-uuid-2',
    worker: {
      fullName: 'A CẢNH VĂN',
      phone: '0901234567',
      rating: 4.8,
      completedJobsCount: 42,
      headline: 'Chuyên điện nước dân dụng & xử lý rò rỉ',
    },
    service: {
      name: 'Sửa chữa điện nước',
    },
    agreedPrice: 250000,
    status: 'completed',
    paymentState: 'paid',
    completedAt: '2026-11-18T10:00:00Z',
    createdAt: '2026-11-18T08:00:00Z',
    evidences: [],
  };

  beforeEach(() => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      statusCode: 200,
      data: completedOrder,
      message: 'OK',
    } as any);
  });

  it('shows review banner and bottom review button when order is completed and not yet reviewed', async () => {
    jest.spyOn(ReviewsApi, 'getOrderReview').mockResolvedValue(null);

    render(<CustomerOrderDetailScreen orderId="ord-completed-456" />);

    await waitFor(() => {
      expect(screen.getByTestId('order-review-invite-banner')).toBeOnTheScreen();
      expect(screen.getByText('Đơn hàng đã hoàn thành!')).toBeOnTheScreen();
    });

    const bottomReviewBtn = screen.getByTestId('customer-review-order-btn');
    expect(bottomReviewBtn).toHaveTextContent('⭐ Đánh Giá Thợ');

    fireEvent.press(bottomReviewBtn);
    expect(mockPush).toHaveBeenCalledWith('/customer/orders/ord-completed-456/review');
  });

  it('renders OrderReviewCard and allows editing when review exists within 48h', async () => {
    const existingReview = {
      id: 'rev-456',
      orderId: 'ord-completed-456',
      rating: 5,
      comment: 'Thợ làm cực kỳ chuyên nghiệp và nhanh chóng!',
      attitudeRating: 'good' as const,
      qualityRating: 'good' as const,
      speedRating: 'good' as const,
      status: 'published',
      isEdited: false,
      createdAt: new Date().toISOString(),
      media: [
        {
          id: 'm1',
          mediaType: 'image' as const,
          mediaUrl: 'https://example.com/rev1.jpg',
        },
      ],
    };

    jest.spyOn(ReviewsApi, 'getOrderReview').mockResolvedValue(existingReview as any);

    render(<CustomerOrderDetailScreen orderId="ord-completed-456" />);

    await waitFor(() => {
      expect(screen.getByTestId('order-review-card')).toBeOnTheScreen();
      expect(screen.getByText('Đánh giá của bạn')).toBeOnTheScreen();
      expect(screen.getByText('Thợ làm cực kỳ chuyên nghiệp và nhanh chóng!')).toBeOnTheScreen();
      expect(screen.getByText('Thái độ tốt')).toBeOnTheScreen();
      expect(screen.getByText('Chất lượng cao')).toBeOnTheScreen();
      expect(screen.getByText('Thi công nhanh')).toBeOnTheScreen();
    });

    // Bottom review button switches to "Sửa Đánh Giá"
    const bottomReviewBtn = screen.getByTestId('customer-review-order-btn');
    expect(bottomReviewBtn).toHaveTextContent('📝 Sửa Đánh Giá');

    fireEvent.press(bottomReviewBtn);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/customer/orders/ord-completed-456/review',
      params: { mode: 'edit' },
    });
  });
});
