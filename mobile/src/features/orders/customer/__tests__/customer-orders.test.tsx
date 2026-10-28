import * as React from 'react';
import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { CustomerBookingScreen } from '../screens/customer-booking-screen';
import { CustomerOrderCancelDialog } from '../screens/customer-order-cancel-dialog';
import { CustomerOrderDetailScreen } from '../screens/customer-order-detail-screen';
import { CustomerOrdersScreen } from '../screens/customer-orders-screen';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
  })),
  useLocalSearchParams: jest.fn(() => ({ id: 'demo-001' })),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('customerOrdersScreen and CustomerOrderDetailScreen', () => {
  it('renders CustomerOrdersScreen with title and placeholder text', () => {
    render(<CustomerOrdersScreen />);
    expect(screen.getByText('Hoạt động')).toBeOnTheScreen();
    expect(screen.getByTestId('orders-customer-screen')).toBeOnTheScreen();
    expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
  });

  it('renders CustomerOrderDetailScreen displaying orderId passed as prop and placeholder text', () => {
    render(<CustomerOrderDetailScreen orderId="demo-001" />);
    expect(screen.getByText('Báo giá thợ')).toBeOnTheScreen();
    expect(screen.getByText('Mã đơn: #demo-001')).toBeOnTheScreen();
    expect(screen.getByText('Chức năng đang được phát triển')).toBeOnTheScreen();
  });

  it('navigates back when pressing back button in detail screen app bar', () => {
    render(<CustomerOrderDetailScreen orderId="demo-001" />);
    const backBtn = screen.getByTestId('app-bar-back-btn');
    fireEvent.press(backBtn);
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders CustomerBookingScreen and handles photo attachment and next navigation', () => {
    useAuthStore.setState({ isAuthenticated: true });
    render(<CustomerBookingScreen serviceId="srv-01" />);

    expect(screen.getByText('Mô tả sự cố')).toBeOnTheScreen();
    expect(screen.getByTestId('customer-booking-screen')).toBeOnTheScreen();

    const addPhotoBtn = screen.getByTestId('booking-add-photo-btn');
    fireEvent.press(addPhotoBtn);

    const nextBtn = screen.getByTestId('booking-next-btn');
    fireEvent.press(nextBtn);
    expect(mockPush).toHaveBeenCalledWith('/customer/booking/select-address');
  });

  it('renders CustomerOrderCancelDialog and handles cancel dismissal and confirm action', () => {
    render(<CustomerOrderCancelDialog orderId="demo-001" />);

    expect(screen.getByText('Hủy đơn #demo-001')).toBeOnTheScreen();
    expect(screen.getByTestId('order-cancel-dialog')).toBeOnTheScreen();

    const confirmCancelBtn = screen.getByTestId('cancel-dialog-confirm-btn');
    fireEvent.press(confirmCancelBtn);

    const dismissBtn = screen.getByTestId('cancel-dialog-dismiss-btn');
    fireEvent.press(dismissBtn);
    expect(mockBack).toHaveBeenCalled();
  });

  it('handles switching between activity filter tabs without filter errors', () => {
    render(<CustomerOrdersScreen />);

    const inProcessTab = screen.getByTestId('activity-filter-tab-in-process');
    fireEvent.press(inProcessTab);

    const finishedTab = screen.getByTestId('activity-filter-tab-finished');
    fireEvent.press(finishedTab);

    const cancelledTab = screen.getByTestId('activity-filter-tab-cancelled');
    fireEvent.press(cancelledTab);

    expect(screen.getByTestId('orders-customer-screen')).toBeOnTheScreen();
  });
});
