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
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('customerOrdersScreen and CustomerOrderDetailScreen', () => {
  it('renders CustomerOrdersScreen with title and route', () => {
    render(<CustomerOrdersScreen />);
    expect(screen.getByText('Danh sách đơn hàng của Khách')).toBeOnTheScreen();
    expect(screen.getByText('Route: /customer/orders')).toBeOnTheScreen();
    expect(screen.getByText('Customer Orders Owner')).toBeOnTheScreen();
  });

  it('navigates to customer order detail demo-001 when pressing open demo button', () => {
    render(<CustomerOrdersScreen />);
    const openDemoBtn = screen.getByTestId('orders-customer-open-demo');
    fireEvent.press(openDemoBtn);
    expect(mockPush).toHaveBeenCalledWith('/customer/orders/demo-001');
  });

  it('renders CustomerOrderDetailScreen displaying orderId passed as prop', () => {
    render(<CustomerOrderDetailScreen orderId="demo-001" />);
    expect(screen.getByText('Chi tiết đơn hàng của Khách')).toBeOnTheScreen();
    expect(screen.getByText('Route: /customer/orders/[id]')).toBeOnTheScreen();
    expect(screen.getByTestId('orders-customer-detail-order-id')).toHaveTextContent('demo-001');
  });

  it('navigates back when pressing back button in detail screen', () => {
    render(<CustomerOrderDetailScreen orderId="demo-001" />);
    const backBtn = screen.getByTestId('orders-customer-detail-back-btn');
    fireEvent.press(backBtn);
    expect(mockBack).toHaveBeenCalled();
  });
});
