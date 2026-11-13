import * as React from 'react';
import { Alert } from 'react-native';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { OrdersApi } from '../../api/orders.api';
import { CustomerOrderCancelDialog } from '../screens/customer-order-cancel-dialog';

const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    back: mockBack,
    push: jest.fn(),
    replace: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe('customerOrderCancelDialog', () => {
  it('renders missing orderId state when no prop or param is passed', () => {
    render(<CustomerOrderCancelDialog />);

    expect(screen.getByText('Hủy đơn hàng')).toBeOnTheScreen();
    expect(screen.getByText('Không tìm thấy mã đơn hàng. Vui lòng quay lại danh sách.')).toBeOnTheScreen();

    const confirmBtn = screen.getByTestId('cancel-dialog-confirm-btn');
    expect(confirmBtn).toBeDisabled();
  });

  it('renders order id in header and allows editing reason when orderId is provided', () => {
    render(<CustomerOrderCancelDialog orderId="ord-12345" />);

    expect(screen.getByText('Hủy đơn #ord-12345')).toBeOnTheScreen();
    const reasonInput = screen.getByPlaceholderText('Nhập lý do hủy...');
    expect(reasonInput).toBeOnTheScreen();

    fireEvent.changeText(reasonInput, 'Tôi bận việc đột xuất');
    expect(reasonInput.props.value).toBe('Tôi bận việc đột xuất');
  });

  it('successfully cancels order when API returns 200', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const cancelSpy = jest.spyOn(OrdersApi, 'cancelOrder').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { id: 'ord-12345', status: 'cancelled' } as any,
    });

    render(<CustomerOrderCancelDialog orderId="ord-12345" />);

    const confirmBtn = screen.getByTestId('cancel-dialog-confirm-btn');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(cancelSpy).toHaveBeenCalledWith('ord-12345', expect.any(String));
      expect(alertSpy).toHaveBeenCalledWith(
        'Đã hủy đơn',
        'Đơn hàng đã được hủy thành công.',
        expect.any(Array),
      );
    });

    // Dismiss alert should call router.back()
    const alertButtons = alertSpy.mock.calls[0][2];
    if (typeof alertButtons?.[0]?.onPress === 'function') {
      alertButtons[0].onPress();
    }
    expect(mockBack).toHaveBeenCalled();
  });

  it('handles API error without showing fake success notification', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(OrdersApi, 'cancelOrder').mockRejectedValue(new Error('Network error'));
    jest.spyOn(OrdersApi, 'getOrderDetail').mockRejectedValue(new Error('Network error'));

    render(<CustomerOrderCancelDialog orderId="ord-12345" />);

    const confirmBtn = screen.getByTestId('cancel-dialog-confirm-btn');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Hủy đơn thất bại',
        'Lỗi kết nối mạng. Vui lòng kiểm tra internet và thử lại.',
        expect.any(Array),
      );
    });

    expect(mockBack).not.toHaveBeenCalled();
  });

  it('recovers when server already cancelled the order (GET verification fallback)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(OrdersApi, 'cancelOrder').mockRejectedValue({
      status: 409,
      response: { data: { message: 'Conflict' } },
    });
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { id: 'ord-12345', status: 'cancelled' } as any,
    });

    render(<CustomerOrderCancelDialog orderId="ord-12345" />);

    const confirmBtn = screen.getByTestId('cancel-dialog-confirm-btn');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Đã hủy đơn',
        'Đơn hàng đã được hủy thành công.',
        expect.any(Array),
      );
    });
  });

  it('notifies customer when order is in-progress and cannot be cancelled automatically', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(OrdersApi, 'cancelOrder').mockRejectedValue({
      status: 400,
      response: { data: { message: 'Invalid transition' } },
    });
    jest.spyOn(OrdersApi, 'getOrderDetail').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { id: 'ord-12345', status: 'in_progress' } as any,
    });

    render(<CustomerOrderCancelDialog orderId="ord-12345" />);

    const confirmBtn = screen.getByTestId('cancel-dialog-confirm-btn');
    fireEvent.press(confirmBtn);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Không thể hủy đơn',
        'Đơn hàng đang trong quá trình thực hiện hoặc đã hoàn thành, không thể hủy tự động.',
        expect.any(Array),
      );
    });
  });

  it('closes dialog on close icon and dismiss button press', () => {
    render(<CustomerOrderCancelDialog orderId="ord-12345" />);

    const closeIcon = screen.getByTestId('cancel-dialog-close-icon');
    fireEvent.press(closeIcon);
    expect(mockBack).toHaveBeenCalledTimes(1);

    const dismissBtn = screen.getByTestId('cancel-dialog-dismiss-btn');
    fireEvent.press(dismissBtn);
    expect(mockBack).toHaveBeenCalledTimes(2);
  });
});
