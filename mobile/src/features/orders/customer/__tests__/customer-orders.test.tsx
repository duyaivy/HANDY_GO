import * as React from 'react';

import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
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
});
