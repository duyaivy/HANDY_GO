import * as React from 'react';

import { cleanup, render, screen } from '@/lib/test-utils';
import { CustomerHomeScreen } from '../screens/customer-home-screen';

afterEach(cleanup);

describe('customerHomeScreen', () => {
  it('renders greeting, search bar, and popular services section', () => {
    render(<CustomerHomeScreen />);
    expect(screen.getByText('Xin chào, bạn cần thợ gì hôm nay?')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Tìm thợ sửa máy lạnh, điện nước...')).toBeOnTheScreen();
    expect(screen.getByText('Dịch vụ phổ biến')).toBeOnTheScreen();
    expect(screen.getByText('Xem tất cả ›')).toBeOnTheScreen();
  });

  it('renders quick action buttons', () => {
    render(<CustomerHomeScreen />);
    expect(screen.getByText('Đặt thợ')).toBeOnTheScreen();
    expect(screen.getByText('Giới thiệu')).toBeOnTheScreen();
    expect(screen.getByText('Hỗ trợ 24/7')).toBeOnTheScreen();
  });
});
