import * as React from 'react';
import { Alert } from 'react-native';
import { OrdersApi } from '@/features/orders/api/orders.api';
import { useBookingDraftStore } from '@/features/orders/stores/use-booking-draft-store';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import CustomerBookingRadarScreen from '../radar';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => true,
  })),
  useLocalSearchParams: jest.fn(() => mockParams),
}));

jest.mock('@/components/map/handy-map', () => ({
  HandyMap: () => null,
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockParams = {};
  useBookingDraftStore.getState().resetDraft();
});

describe('customerBookingRadarScreen cancellation flow (TASK-04)', () => {
  it('blocks cancellation when no valid requestId is found', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useBookingDraftStore.setState({ createdRequestId: null });
    mockParams = {};

    render(<CustomerBookingRadarScreen />);

    // Open order details modal
    fireEvent.press(screen.getByTestId('radar-order-details-btn'));
    // Press Cancel order button
    fireEvent.press(screen.getByTestId('cancel-order-modal-btn'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Không tìm thấy mã yêu cầu',
      'Không tìm thấy mã yêu cầu dịch vụ hợp lệ để hủy. Vui lòng quay lại danh sách yêu cầu.',
      expect.any(Array),
    );

    // Press navigate to orders list in alert
    const alertButtons = alertSpy.mock.calls[0][2];
    if (typeof alertButtons?.[0]?.onPress === 'function') {
      alertButtons[0].onPress();
    }
    expect(mockReplace).toHaveBeenCalledWith('/customer/orders');
  });

  it('cancels service request successfully on server, clears draft, and navigates to Cancelled tab', async () => {
    mockParams = { requestId: 'req-real-123' };
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const cancelSpy = jest.spyOn(OrdersApi, 'cancelRequest').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { id: 'req-real-123', status: 'cancelled' } as any,
    });

    render(<CustomerBookingRadarScreen />);

    // Open modal
    fireEvent.press(screen.getByTestId('radar-order-details-btn'));
    // Click Cancel order
    fireEvent.press(screen.getByTestId('cancel-order-modal-btn'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Hủy tìm thợ',
      'Bạn có chắc chắn muốn hủy yêu cầu tìm thợ này không?',
      expect.any(Array),
    );

    // Confirm cancel in confirmation Alert
    const confirmAlertButtons = alertSpy.mock.calls[0][2];
    const confirmAction = confirmAlertButtons?.find((b: any) => b.text === 'Xác nhận hủy');
    await act(async () => {
      if (typeof confirmAction?.onPress === 'function') {
        await confirmAction.onPress();
      }
    });

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledWith('req-real-123');
      expect(useBookingDraftStore.getState().createdRequestId).toBeNull();
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/customer/orders',
        params: { tab: 'Cancelled' },
      });
    });
  });

  it('handles API failure without clearing draft or navigating away', async () => {
    mockParams = { requestId: 'req-real-123' };
    useBookingDraftStore.setState({ createdRequestId: 'req-real-123', serviceName: 'Sửa điện' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(OrdersApi, 'cancelRequest').mockRejectedValue(new Error('Network connection timeout'));
    jest.spyOn(OrdersApi, 'getRequestDetail').mockRejectedValue(new Error('Network connection timeout'));

    render(<CustomerBookingRadarScreen />);

    fireEvent.press(screen.getByTestId('radar-order-details-btn'));
    fireEvent.press(screen.getByTestId('cancel-order-modal-btn'));

    const confirmAlertButtons = alertSpy.mock.calls[0][2];
    const confirmAction = confirmAlertButtons?.find((b: any) => b.text === 'Xác nhận hủy');
    await act(async () => {
      if (typeof confirmAction?.onPress === 'function') {
        await confirmAction.onPress();
      }
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Không thể hủy yêu cầu',
        'Yêu cầu xử lý quá thời gian chờ. Vui lòng kiểm tra lại danh sách đơn hàng.',
        expect.any(Array),
      );
    });

    // Draft should NOT be cleared on failure
    expect(useBookingDraftStore.getState().serviceName).toBe('Sửa điện');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('recovers when server actually cancelled the request during conflict/timeout', async () => {
    mockParams = { requestId: 'req-real-123' };
    useBookingDraftStore.setState({ createdRequestId: 'req-real-123' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(OrdersApi, 'cancelRequest').mockRejectedValue({
      status: 409,
      response: { data: { message: 'Conflict' } },
    });
    jest.spyOn(OrdersApi, 'getRequestDetail').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { id: 'req-real-123', status: 'cancelled' } as any,
    });

    render(<CustomerBookingRadarScreen />);

    fireEvent.press(screen.getByTestId('radar-order-details-btn'));
    fireEvent.press(screen.getByTestId('cancel-order-modal-btn'));

    const confirmAlertButtons = alertSpy.mock.calls[0][2];
    const confirmAction = confirmAlertButtons?.find((b: any) => b.text === 'Xác nhận hủy');
    await act(async () => {
      if (typeof confirmAction?.onPress === 'function') {
        await confirmAction.onPress();
      }
    });

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: '/customer/orders',
        params: { tab: 'Cancelled' },
      });
    });
  });

  it('notifies customer when request has already been converted to an order', async () => {
    mockParams = { requestId: 'req-real-123' };
    useBookingDraftStore.setState({ createdRequestId: 'req-real-123' });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(OrdersApi, 'cancelRequest').mockRejectedValue({
      status: 400,
      response: { data: { message: 'Cannot cancel request that has already been converted to an order' } },
    });
    jest.spyOn(OrdersApi, 'getRequestDetail').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { id: 'req-real-123', status: 'converted_to_order' } as any,
    });

    render(<CustomerBookingRadarScreen />);

    fireEvent.press(screen.getByTestId('radar-order-details-btn'));
    fireEvent.press(screen.getByTestId('cancel-order-modal-btn'));

    const confirmAlertButtons = alertSpy.mock.calls[0][2];
    const confirmAction = confirmAlertButtons?.find((b: any) => b.text === 'Xác nhận hủy');
    await act(async () => {
      if (typeof confirmAction?.onPress === 'function') {
        await confirmAction.onPress();
      }
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Yêu cầu đã được tiếp nhận',
        'Yêu cầu dịch vụ đã được thợ tiếp nhận thành đơn hàng, không thể hủy tự động.',
        expect.any(Array),
      );
    });

    const alertButtons = alertSpy.mock.calls[1][2];
    if (typeof alertButtons?.[0]?.onPress === 'function') {
      alertButtons[0].onPress();
    }
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/customer/orders',
      params: { tab: 'In process' },
    });
  });
});
