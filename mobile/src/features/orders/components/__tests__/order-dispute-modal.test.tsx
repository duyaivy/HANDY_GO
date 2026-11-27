import * as ImagePicker from 'expo-image-picker';
import * as React from 'react';
import { Alert } from 'react-native';
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
});
