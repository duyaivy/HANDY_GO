import * as ImagePicker from 'expo-image-picker';
import * as React from 'react';
import { Alert, Modal } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { OrdersApi } from '../../api/orders.api';
import { OrderDisputeModal } from '../order-dispute-modal';

describe('OrderDisputeModal', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('validates minimum reason length before submitting', async () => {
    const onSubmit = jest.fn();
    render(
      <OrderDisputeModal
        visible
        orderCode="ORD-001"
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    fireEvent.changeText(screen.getByTestId('dispute-reason-input'), 'Ngắn');
    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    expect(await screen.findByText(/tối thiểu 5 ký tự/i)).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits selected category, reason, and uploaded evidence URLs', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const libraryBtn = buttons?.find(btn => btn.text === 'Chọn từ thư viện');
      libraryBtn?.onPress?.();
    });
    jest.spyOn(ImagePicker, 'requestMediaLibraryPermissionsAsync').mockResolvedValue({
      granted: true,
      status: 'granted',
    } as any);
    jest.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///evidence-1.jpg' }],
    } as any);
    jest.spyOn(OrdersApi, 'uploadImageDetailed').mockResolvedValue({
      url: 'https://cdn.handygo.vn/dispute-1.jpg',
    });

    const onSubmit = jest.fn().mockResolvedValue({});
    const onSuccess = jest.fn();
    const onClose = jest.fn();

    render(
      <OrderDisputeModal
        visible
        orderCode="ORD-002"
        isPostCompletion
        remainingDays={5}
        onSubmit={onSubmit}
        onSuccess={onSuccess}
        onClose={onClose}
      />,
    );

    expect(screen.getByTestId('dispute-warranty-notice')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('dispute-category-property_damage'));
    fireEvent.changeText(screen.getByTestId('dispute-reason-input'), 'Thợ làm vỡ gạch nhà vệ sinh khi khoan.');
    fireEvent.press(screen.getByTestId('dispute-add-evidence-btn'));

    await waitFor(() => {
      expect(OrdersApi.uploadImageDetailed).toHaveBeenCalledWith(
        'file:///evidence-1.jpg',
        expect.stringContaining('dispute_'),
      );
    });

    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        reason: 'Thợ làm vỡ gạch nhà vệ sinh khi khoan.',
        category: 'property_damage',
        evidenceUrls: ['https://cdn.handygo.vn/dispute-1.jpg'],
      });
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('displays server error message when onSubmit rejects', async () => {
    const onSubmit = jest.fn().mockRejectedValue({
      response: { data: { code: 'COMPLAINT_WINDOW_EXPIRED' } },
    });

    render(
      <OrderDisputeModal
        visible
        orderCode="ORD-003"
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('dispute-quick-reason-0'));
    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    expect(await screen.findByTestId('dispute-submit-error')).toBeOnTheScreen();
    expect(screen.getByText(/quá thời hạn bảo hành 7 ngày/i)).toBeOnTheScreen();
  });

  it('supports capturing evidence photo from camera', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const cameraBtn = buttons?.find(btn => btn.text === 'Chụp ảnh');
      cameraBtn?.onPress?.();
    });
    jest.spyOn(ImagePicker, 'requestCameraPermissionsAsync').mockResolvedValue({
      granted: true,
      status: 'granted',
    } as any);
    jest.spyOn(ImagePicker, 'launchCameraAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///camera-evidence.jpg' }],
    } as any);
    jest.spyOn(OrdersApi, 'uploadImageDetailed').mockResolvedValue({
      url: 'https://cdn.handygo.vn/camera-evidence.jpg',
    });

    const onSubmit = jest.fn().mockResolvedValue({});

    render(
      <OrderDisputeModal
        visible
        orderCode="ORD-004"
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('dispute-add-evidence-btn'));

    await waitFor(() => {
      expect(ImagePicker.launchCameraAsync).toHaveBeenCalled();
      expect(OrdersApi.uploadImageDetailed).toHaveBeenCalledWith(
        'file:///camera-evidence.jpg',
        expect.stringContaining('dispute_'),
      );
    });

    fireEvent.press(screen.getByTestId('dispute-quick-reason-0'));
    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceUrls: ['https://cdn.handygo.vn/camera-evidence.jpg'],
        }),
      );
    });
  });

  it('P2-01: blocks submit on partial upload failure, supports retry and removing failed image', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(btn => btn.text === 'Chọn từ thư viện')?.onPress?.();
    });
    jest.spyOn(ImagePicker, 'requestMediaLibraryPermissionsAsync').mockResolvedValue({
      granted: true,
      status: 'granted',
    } as any);
    jest.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///ok.jpg' }, { uri: 'file:///fail.jpg' }],
    } as any);

    const uploadSpy = jest.spyOn(OrdersApi, 'uploadImageDetailed')
      .mockResolvedValueOnce({ url: 'https://cdn.handygo.vn/ok.jpg' })
      .mockRejectedValueOnce(new Error('Upload failed'));

    const onSubmit = jest.fn().mockResolvedValue({});

    render(
      <OrderDisputeModal
        visible
        orderCode="ORD-005"
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('dispute-add-evidence-btn'));

    const retryBtn = await screen.findByTestId(/dispute-retry-media-/);
    fireEvent.press(screen.getByTestId('dispute-quick-reason-0'));
    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    expect(await screen.findByText(/Có ảnh tải lên thất bại/i)).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();

    uploadSpy.mockResolvedValueOnce({ url: 'https://cdn.handygo.vn/retried.jpg' });
    fireEvent.press(retryBtn);

    await waitFor(() => {
      expect(screen.queryByTestId(/dispute-retry-media-/)).toBeNull();
      expect(screen.getByTestId('dispute-submit-btn')).not.toBeDisabled();
    });

    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceUrls: ['https://cdn.handygo.vn/ok.jpg', 'https://cdn.handygo.vn/retried.jpg'],
        }),
      );
    });
  });

  it('P2-01: allows removing failed image and submitting remaining completed images', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(btn => btn.text === 'Chọn từ thư viện')?.onPress?.();
    });
    jest.spyOn(ImagePicker, 'requestMediaLibraryPermissionsAsync').mockResolvedValue({
      granted: true,
      status: 'granted',
    } as any);
    jest.spyOn(ImagePicker, 'launchImageLibraryAsync').mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///ok2.jpg' }, { uri: 'file:///fail2.jpg' }],
    } as any);

    jest.spyOn(OrdersApi, 'uploadImageDetailed')
      .mockResolvedValueOnce({ url: 'https://cdn.handygo.vn/ok2.jpg' })
      .mockRejectedValueOnce(new Error('Upload failed'));

    const onSubmit = jest.fn().mockResolvedValue({});

    render(
      <OrderDisputeModal
        visible
        orderCode="ORD-006"
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('dispute-add-evidence-btn'));
    const retryBtn = await screen.findByTestId(/dispute-retry-media-/);
    const failedId = retryBtn.props.testID.replace('dispute-retry-media-', '');

    fireEvent.press(screen.getByTestId(`dispute-remove-media-${failedId}`));
    fireEvent.press(screen.getByTestId('dispute-quick-reason-0'));
    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          evidenceUrls: ['https://cdn.handygo.vn/ok2.jpg'],
        }),
      );
    });
  });

  it('P2-02: locks modal close/cancel/double-submit while submitting and preserves draft on error', async () => {
    let rejectSubmit!: (reason?: unknown) => void;
    const onSubmit = jest.fn(
      () => new Promise((_resolve, reject) => {
        rejectSubmit = reject;
      }),
    );
    const onClose = jest.fn();

    const view = render(
      <OrderDisputeModal
        visible
        orderCode="ORD-007"
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );

    fireEvent.press(screen.getByTestId('dispute-category-price_fraud'));
    fireEvent.changeText(screen.getByTestId('dispute-reason-input'), 'Thu phí sai so với thỏa thuận ban đầu.');

    fireEvent.press(screen.getByTestId('dispute-submit-btn'));
    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('dispute-modal-close-btn'));
    fireEvent.press(screen.getByTestId('dispute-cancel-btn'));
    view.UNSAFE_getByType(Modal).props.onRequestClose?.();

    expect(onClose).not.toHaveBeenCalled();

    rejectSubmit(new Error('Lỗi mạng tạm thời'));

    expect(await screen.findByTestId('dispute-submit-error')).toBeOnTheScreen();
    expect(screen.getByTestId('dispute-reason-input').props.value).toBe('Thu phí sai so với thỏa thuận ban đầu.');
  });

  it('P3-01: defaults category to other for worker and service_quality for customer on initial mount and reopen', async () => {
    const onSubmit = jest.fn().mockResolvedValue({});

    const { rerender } = render(
      <OrderDisputeModal
        visible
        role="worker"
        orderCode="ORD-W1"
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByTestId('dispute-quick-reason-0'));
    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'other' }),
      );
    });

    onSubmit.mockClear();
    rerender(
      <OrderDisputeModal
        visible
        role="customer"
        orderCode="ORD-C1"
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );

    // Trigger close/reset so category syncs when role prop changes on same mounted instance
    fireEvent.press(screen.getByTestId('dispute-cancel-btn'));
    fireEvent.press(screen.getByTestId('dispute-quick-reason-0'));
    fireEvent.press(screen.getByTestId('dispute-submit-btn'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'service_quality' }),
      );
    });
  });
});
