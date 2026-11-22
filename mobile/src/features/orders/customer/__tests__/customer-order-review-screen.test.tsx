import * as ImagePicker from 'expo-image-picker';
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
    serviceRequestId: 'request-123',
    bookingProposalId: 'proposal-123',
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
    agreedScope: 'Lắp đặt công tơ điện và atomat',
    addressText: 'Địa chỉ đơn hàng',
    status: 'completed' as const,
    paymentState: 'paid' as const,
    completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
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

    await waitFor(() => {
      expect(screen.getByTestId('submit-review-btn')).not.toBeDisabled();
    });

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
    const existingPhoto = {
      mediaType: 'image' as const,
      mediaUrl: 'https://res.cloudinary.com/handygo/image/upload/review.jpg',
      thumbnailUrl: 'https://res.cloudinary.com/handygo/image/upload/w_100/review.jpg',
    };
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
      media: [existingPhoto],
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
          media: [existingPhoto],
        }),
      );
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Thành công',
      'Đánh giá đã được cập nhật thành công!',
      expect.any(Array),
    );
  });

  it('renders in read-only view mode when review exists but is expired or already edited', async () => {
    const expiredReview = {
      id: 'rev-expired-1',
      orderId: 'ord-completed-123',
      rating: 4,
      comment: 'Đã hoàn tất nghiệm thu',
      attitudeRating: 'good' as const,
      qualityRating: 'good' as const,
      speedRating: 'good' as const,
      status: 'published',
      isEdited: true, // Already edited -> cannot edit anymore
      createdAt: '2026-10-01T10:00:00Z',
    };

    jest.spyOn(ReviewsApi, 'getOrderReview').mockResolvedValue(expiredReview as any);

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    await waitFor(() => {
      expect(screen.getByText('Chi tiết đánh giá')).toBeOnTheScreen();
      expect(screen.getByText(/Đánh giá này đã được chỉnh sửa 1 lần/)).toBeOnTheScreen();
    });

    // Close/back button is displayed instead of submit button
    expect(screen.getByTestId('close-review-btn')).toBeOnTheScreen();
    expect(screen.queryByTestId('submit-review-btn')).toBeNull();
    expect(screen.queryByTestId('add-review-photo-btn')).toBeNull();

    // Comment input is not editable
    expect(screen.getByTestId('review-comment-input').props.editable).toBe(false);

    // Press close button
    fireEvent.press(screen.getByTestId('close-review-btn'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('prevents creating a review for a refunded order opened directly', async () => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      statusCode: 200,
      data: { ...mockOrder, paymentState: 'refunded' },
      message: 'OK',
    });

    render(<CustomerOrderReviewScreen orderId={mockOrder.id} />);

    expect(await screen.findByText('Đơn hàng này không đủ điều kiện để gửi đánh giá.')).toBeOnTheScreen();
    expect(screen.queryByTestId('submit-review-btn')).toBeNull();
  });

  it('displays error alert when createReview fails', async () => {
    jest.spyOn(ReviewsApi, 'createReview').mockRejectedValue({
      response: { data: { message: 'Đơn hàng này đã được đánh giá trước đó' } },
    });

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    await waitFor(() => {
      expect(screen.getByTestId('submit-review-btn')).not.toBeDisabled();
    });

    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Không thể gửi đánh giá',
        'Đơn hàng này đã được đánh giá trước đó',
      );
    });
  });

  it('supports attaching video and submitting with video signature receipt', async () => {
    (globalThis as any).__MOCK_VIDEO_PICKER__ = true;
    const createReviewSpy = jest.spyOn(ReviewsApi, 'createReview').mockResolvedValue({
      id: 'rev-vid-1',
      orderId: 'ord-completed-123',
      rating: 5,
      comment: 'Có video quay lại nghiệm thu công trình',
      status: 'published',
      createdAt: new Date().toISOString(),
    } as any);

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    await waitFor(() => {
      expect(screen.getByTestId('submit-review-btn')).not.toBeDisabled();
    });

    // Add video attachment
    fireEvent.press(screen.getByTestId('add-review-photo-btn'));

    // Video item 0 should be displayed with video badge
    expect(screen.getByTestId('review-photo-item-0')).toBeOnTheScreen();
    expect(screen.getByTestId('review-video-badge-0')).toBeOnTheScreen();
    expect(screen.getByText('VIDEO')).toBeOnTheScreen();

    // Type comment and submit
    fireEvent.changeText(screen.getByTestId('review-comment-input'), 'Có video quay lại nghiệm thu công trình');
    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(createReviewSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'ord-completed-123',
          rating: 5,
          comment: 'Có video quay lại nghiệm thu công trình',
          media: [
            expect.objectContaining({
              mediaType: 'video',
              mediaUrl: expect.stringContaining('.mp4'),
              uploadReceipt: 'mock-upload-receipt',
            }),
          ],
        }),
      );
    });

    delete (globalThis as any).__MOCK_VIDEO_PICKER__;
  });

  it('uploads photo with uploadReceipt and includes receipt in createReview payload', async () => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    jest.spyOn(ImagePicker, 'requestCameraPermissionsAsync').mockResolvedValue({ status: 'granted' } as any);
    jest.spyOn(ImagePicker, 'launchCameraAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///review-evidence.jpg' }],
    } as any);

    const uploadDetailedSpy = jest.spyOn(OrdersApi, 'uploadImageDetailed').mockResolvedValue({
      url: 'https://res.cloudinary.com/handygo/image/upload/v1/reviews/evidence.jpg',
      uploadReceipt: 'verified-receipt-hmac-photo',
      publicId: 'reviews/evidence',
      assetId: 'asset-img-1',
    });

    const createReviewSpy = jest.spyOn(ReviewsApi, 'createReview').mockResolvedValue({
      id: 'rev-photo-1',
      orderId: 'ord-completed-123',
      rating: 5,
      status: 'published',
      createdAt: new Date().toISOString(),
    } as any);

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    // Press add photo button and pick camera
    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      alertButtons.find(b => b.text === 'Hình ảnh').onPress();
    });
    const photoButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      photoButtons.find(b => b.text === 'Chụp ảnh mới').onPress();
    });

    expect(screen.getByTestId('review-photo-item-0')).toBeOnTheScreen();

    // Submit
    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(uploadDetailedSpy).toHaveBeenCalledWith('file:///review-evidence.jpg', 'review_photo');
      expect(createReviewSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          media: [
            expect.objectContaining({
              mediaType: 'image',
              mediaUrl: 'https://res.cloudinary.com/handygo/image/upload/v1/reviews/evidence.jpg',
              uploadReceipt: 'verified-receipt-hmac-photo',
            }),
          ],
        }),
      );
    });

    delete (globalThis as any).__USE_REAL_PHOTO_PICKER__;
  });

  it('displays error alert and aborts submit when photo upload fails', async () => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    jest.spyOn(ImagePicker, 'requestCameraPermissionsAsync').mockResolvedValue({ status: 'granted' } as any);
    jest.spyOn(ImagePicker, 'launchCameraAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///failed-photo.jpg' }],
    } as any);

    jest.spyOn(OrdersApi, 'uploadImageDetailed').mockRejectedValue(new Error('Network error'));
    const createReviewSpy = jest.spyOn(ReviewsApi, 'createReview');

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      alertButtons.find(b => b.text === 'Hình ảnh').onPress();
    });
    const photoButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      photoButtons.find(b => b.text === 'Chụp ảnh mới').onPress();
    });

    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Tải hình ảnh thất bại',
        expect.stringContaining('Không thể tải hình ảnh minh chứng'),
      );
    });

    expect(createReviewSpy).not.toHaveBeenCalled();
    delete (globalThis as any).__USE_REAL_PHOTO_PICKER__;
  });

  it('displays error alert and aborts submit when video upload fails', async () => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    jest.spyOn(ImagePicker, 'requestCameraPermissionsAsync').mockResolvedValue({ status: 'granted' } as any);
    jest.spyOn(ImagePicker, 'launchCameraAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///failed-video.mp4' }],
    } as any);

    jest.spyOn(ReviewsApi, 'getVideoUploadSignature').mockRejectedValue(new Error('Signature failure'));
    const createReviewSpy = jest.spyOn(ReviewsApi, 'createReview');

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      alertButtons.find(b => b.text === 'Video (tối đa 30s)').onPress();
    });
    const videoButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      videoButtons.find(b => b.text === 'Quay video mới').onPress();
    });

    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Tải video thất bại',
        expect.stringContaining('Không thể tải video minh chứng'),
      );
    });

    expect(createReviewSpy).not.toHaveBeenCalled();
    delete (globalThis as any).__USE_REAL_PHOTO_PICKER__;
  });

  it('rejects video if duration exceeds 30 seconds', async () => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    jest.spyOn(ImagePicker, 'requestCameraPermissionsAsync').mockResolvedValue({ status: 'granted' } as any);
    jest.spyOn(ImagePicker, 'launchCameraAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///long-video.mp4', duration: 45_000, fileSize: 10 * 1024 * 1024 }],
    } as any);

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      alertButtons.find(b => b.text === 'Video (tối đa 30s)').onPress();
    });
    const videoButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      videoButtons.find(b => b.text === 'Quay video mới').onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Video quá dài',
      'Vui lòng chọn hoặc quay video có thời lượng tối đa 30 giây.',
    );
    expect(screen.queryByTestId('review-photo-item-0')).toBeNull();
    delete (globalThis as any).__USE_REAL_PHOTO_PICKER__;
  });

  it('rejects video if file size exceeds 50MB', async () => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    jest.spyOn(ImagePicker, 'requestCameraPermissionsAsync').mockResolvedValue({ status: 'granted' } as any);
    jest.spyOn(ImagePicker, 'launchCameraAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///heavy-video.mp4', duration: 15_000, fileSize: 60 * 1024 * 1024 }],
    } as any);

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      alertButtons.find(b => b.text === 'Video (tối đa 30s)').onPress();
    });
    const videoButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as any[];
    await act(async () => {
      videoButtons.find(b => b.text === 'Quay video mới').onPress();
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Video quá lớn',
      'Dung lượng video không được vượt quá 50MB.',
    );
    expect(screen.queryByTestId('review-photo-item-0')).toBeNull();
    delete (globalThis as any).__USE_REAL_PHOTO_PICKER__;
  });

  it.each([
    { duration: 30_001, fileSize: 1024, alertTitle: 'Video quá dài' },
    { duration: 15_000, fileSize: 50 * 1024 * 1024 + 1, alertTitle: 'Video quá lớn' },
  ])('rejects invalid library video with "$alertTitle"', async ({ duration, fileSize, alertTitle }) => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    jest.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///library-video.mp4', width: 1920, height: 1080, duration, fileSize }],
    });

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    const [, , choices] = jest.mocked(Alert.alert).mock.calls.at(-1)!;
    choices?.find(choice => choice.text === 'Video (tối đa 30s)')?.onPress?.();
    const [, , sources] = jest.mocked(Alert.alert).mock.calls.at(-1)!;
    await act(async () => {
      sources?.find(source => source.text === 'Chọn từ thư viện')?.onPress?.();
    });

    expect(Alert.alert).toHaveBeenCalledWith(alertTitle, expect.any(String));
    expect(screen.queryByTestId('review-video-badge-0')).toBeNull();
  });

  it('uploads a short library video with its original file metadata and receipt', async () => {
    (globalThis as any).__USE_REAL_PHOTO_PICKER__ = true;
    const fileName = 'review.mov';
    const mimeType = 'video/quicktime';
    const fileSize = 82_431;
    jest.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: `file:///${fileName}`, width: 1920, height: 1080, duration: 700, fileName, mimeType, fileSize }],
    });
    const uploadUrl = 'https://api.cloudinary.com/v1_1/handygo/video/upload';
    const mediaUrl = 'https://res.cloudinary.com/handygo/video/upload/review.mov';
    const signatureSpy = jest.spyOn(ReviewsApi, 'getVideoUploadSignature').mockResolvedValue({
      signature: 'signature',
      timestamp: 123,
      apiKey: 'key',
      cloudName: 'handygo',
      folder: '',
      uploadUrl,
      uploadReceipt: 'video-receipt',
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ secure_url: mediaUrl }),
    } as Response);
    const createReviewSpy = jest.spyOn(ReviewsApi, 'createReview').mockResolvedValue({
      id: 'created-review',
      orderId: mockOrder.id,
      rating: 5,
      status: 'published',
      createdAt: new Date().toISOString(),
    });

    render(<CustomerOrderReviewScreen orderId={mockOrder.id} />);

    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    const [, , choices] = jest.mocked(Alert.alert).mock.calls.at(-1)!;
    choices?.find(choice => choice.text === 'Video (tối đa 30s)')?.onPress?.();
    const [, , sources] = jest.mocked(Alert.alert).mock.calls.at(-1)!;
    await act(async () => {
      sources?.find(source => source.text === 'Chọn từ thư viện')?.onPress?.();
    });
    expect(screen.getByTestId('review-video-badge-0')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByTestId('submit-review-btn')).toBeEnabled());
    fireEvent.press(screen.getByTestId('submit-review-btn'));

    await waitFor(() => {
      expect(signatureSpy).toHaveBeenCalledWith({ fileName, mimeType, fileSize });
      expect(createReviewSpy).toHaveBeenCalledWith(expect.objectContaining({
        media: [{
          mediaType: 'video',
          mediaUrl,
          thumbnailUrl: mediaUrl.replace('.mov', '.jpg'),
          uploadReceipt: 'video-receipt',
        }],
      }));
    });
  });

  it('enforces maximum 1 video limit when trying to attach a second video', async () => {
    (globalThis as any).__MOCK_VIDEO_PICKER__ = true;

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    // Add first video
    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    expect(screen.getByTestId('review-photo-item-0')).toBeOnTheScreen();
    expect(screen.getByTestId('review-video-badge-0')).toBeOnTheScreen();

    // Try to add second video
    fireEvent.press(screen.getByTestId('add-review-photo-btn'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Giới hạn video',
      'Mỗi đánh giá chỉ được đính kèm tối đa 1 video.',
    );

    delete (globalThis as any).__MOCK_VIDEO_PICKER__;
  });

  it('disables submit button and displays loading indicator while review status is loading', async () => {
    // Keep getOrderReview pending
    jest.spyOn(ReviewsApi, 'getOrderReview').mockImplementation(() => new Promise(() => {}));

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    expect(screen.getByTestId('review-loading-indicator')).toBeOnTheScreen();
    const submitBtn = screen.getByTestId('submit-review-btn');
    expect(submitBtn).toBeOnTheScreen();
    expect(submitBtn).toHaveTextContent('Đang kiểm tra...');
    expect(submitBtn).toBeDisabled();
  });

  it('displays error banner with retry button and disables submit button when review query fails', async () => {
    const getReviewSpy = jest.spyOn(ReviewsApi, 'getOrderReview').mockRejectedValue(new Error('Network request failed'));

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    await waitFor(() => {
      expect(screen.getByTestId('review-fetch-error-banner')).toBeOnTheScreen();
    });

    const submitBtn = screen.getByTestId('submit-review-btn');
    expect(submitBtn).toBeDisabled();

    // Clicking retry button triggers refetch
    getReviewSpy.mockResolvedValueOnce(null);
    fireEvent.press(screen.getByTestId('review-fetch-retry-btn'));
    expect(getReviewSpy).toHaveBeenCalledTimes(2);
  });

  it('guards handleSubmit against duplicate review creation when already reviewed', async () => {
    const existingReview = {
      id: 'rev-existing-999',
      orderId: 'ord-completed-123',
      rating: 5,
      comment: 'Tuyệt vời',
      isEdited: false,
      createdAt: new Date().toISOString(),
    };
    jest.spyOn(ReviewsApi, 'getOrderReview').mockResolvedValue(existingReview as any);
    const createReviewSpy = jest.spyOn(ReviewsApi, 'createReview').mockResolvedValue({} as any);

    render(<CustomerOrderReviewScreen orderId="ord-completed-123" />);

    await waitFor(() => {
      expect(screen.getByText('Lưu thay đổi đánh giá')).toBeOnTheScreen();
    });

    expect(createReviewSpy).not.toHaveBeenCalled();
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
    completedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
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

  it('navigates with mode: view when review exists but cannot be edited', async () => {
    const nonEditableReview = {
      id: 'rev-expired-456',
      orderId: 'ord-completed-456',
      rating: 5,
      comment: 'Đã quá hạn 48h',
      status: 'published',
      isEdited: true,
      createdAt: '2026-10-01T10:00:00Z',
    };

    jest.spyOn(ReviewsApi, 'getOrderReview').mockResolvedValue(nonEditableReview as any);

    render(<CustomerOrderDetailScreen orderId="ord-completed-456" />);

    await waitFor(() => {
      expect(screen.getByTestId('order-review-card')).toBeOnTheScreen();
    });

    const bottomReviewBtn = screen.getByTestId('customer-review-order-btn');
    expect(bottomReviewBtn).toHaveTextContent('⭐ Xem Đánh Giá');

    fireEvent.press(bottomReviewBtn);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/customer/orders/ord-completed-456/review',
      params: { mode: 'view' },
    });
  });

  it('hides review invite banner and review button when order completed > 14 days ago and unreviewed', async () => {
    const expiredOrder = {
      ...completedOrder,
      id: 'ord-expired-14d',
      completedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    };

    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      statusCode: 200,
      data: expiredOrder,
      message: 'OK',
    } as any);
    jest.spyOn(ReviewsApi, 'getOrderReview').mockResolvedValue(null);

    render(<CustomerOrderDetailScreen orderId="ord-expired-14d" />);

    await waitFor(() => {
      expect(screen.queryByTestId('order-review-invite-banner')).toBeNull();
      expect(screen.queryByTestId('customer-review-order-btn')).toBeNull();
    });
  });

  it.each([
    ['missing completion timestamp', { completedAt: null }],
    ['refunded payment', { paymentState: 'refunded' }],
  ])('hides review actions for a completed order with %s', async (_, overrides) => {
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      statusCode: 200,
      data: { ...completedOrder, ...overrides },
      message: 'OK',
    } as any);
    const getReview = jest.spyOn(ReviewsApi, 'getOrderReview').mockResolvedValue(null);

    render(<CustomerOrderDetailScreen orderId={completedOrder.id} />);

    await waitFor(() => {
      expect(screen.getByText('Sửa chữa điện nước')).toBeOnTheScreen();
      expect(getReview).toHaveBeenCalledWith(completedOrder.id);
    });
    expect(screen.queryByTestId('order-review-invite-banner')).toBeNull();
    expect(screen.queryByTestId('customer-review-order-btn')).toBeNull();
  });

  it('does not prematurely display review CTA while review status is loading in order detail', async () => {
    // Keep review query pending
    jest.spyOn(ReviewsApi, 'getOrderReview').mockImplementation(() => new Promise(() => {}));

    render(<CustomerOrderDetailScreen orderId="ord-completed-456" />);

    await waitFor(() => {
      expect(screen.getByText('Sửa chữa điện nước')).toBeOnTheScreen();
    });

    // While review status is resolving, review invite banner & button must not flash prematurely
    expect(screen.queryByTestId('order-review-invite-banner')).toBeNull();
    expect(screen.queryByTestId('customer-review-order-btn')).toBeNull();
  });

  it('does NOT display review CTA when getOrderReview rejects with error, and renders retry error banner', async () => {
    jest.spyOn(ReviewsApi, 'getOrderReview').mockRejectedValueOnce(new Error('Network/500 error'));

    render(<CustomerOrderDetailScreen orderId="ord-completed-456" />);

    await waitFor(() => {
      expect(screen.getByText('Sửa chữa điện nước')).toBeOnTheScreen();
    });

    // Error banner must be displayed with retry button
    await waitFor(() => {
      expect(screen.getByTestId('customer-order-review-error-banner')).toBeOnTheScreen();
    });
    expect(screen.getByTestId('customer-order-review-retry-btn')).toBeOnTheScreen();

    // Review invite banner and review button must NOT appear
    expect(screen.queryByTestId('order-review-invite-banner')).toBeNull();
    expect(screen.queryByTestId('customer-review-order-btn')).toBeNull();
  });
});
