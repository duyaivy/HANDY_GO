import * as React from 'react';

import { cleanup, fireEvent, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';
import { CustomerHomeScreen } from '../screens/customer-home-screen';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  })),
  useLocalSearchParams: jest.fn(() => ({})),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

describe('customerHomeScreen', () => {
  it('renders CustomerGuestOverview with title, role switch chip, and sticky CTA for unauthenticated guests', () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });
    render(<CustomerHomeScreen />);
    expect(screen.getByTestId('customer-guest-overview-screen')).toBeOnTheScreen();
    expect(screen.getByText('Tổng quan')).toBeOnTheScreen();
    expect(screen.getByTestId('customer-guest-role-switch-chip')).toBeOnTheScreen();
    expect(screen.getByText('App Thợ ⇄')).toBeOnTheScreen();
    expect(screen.getByTestId('customer-guest-search-input')).toBeOnTheScreen();
    expect(screen.getByTestId('customer-guest-cta-bottom')).toBeOnTheScreen();
    expect(screen.getByText('Bắt đầu ngay')).toBeOnTheScreen();
  });

  it('renders greeting, search bar, and popular services section when authenticated', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'u-1', phone: '0912345678', email: 'user@example.com', roles: ['Customer'], permissions: [] },
    });
    render(<CustomerHomeScreen />);
    expect(screen.getByText('Xin chào, bạn cần thợ gì hôm nay?')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Tìm thợ sửa máy lạnh, điện nước...')).toBeOnTheScreen();
    expect(screen.getByText('Dịch vụ phổ biến')).toBeOnTheScreen();
    expect(screen.getByText('Xem tất cả ›')).toBeOnTheScreen();
  });

  it('renders utility action buttons and navigates on press', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'u-1', phone: '0912345678', email: 'user@example.com', roles: ['Customer'], permissions: [] },
    });
    render(<CustomerHomeScreen />);

    // Check utility buttons render
    expect(screen.getByText('Lịch sử')).toBeOnTheScreen();
    expect(screen.getByText('Yêu thích')).toBeOnTheScreen();
    expect(screen.getByText('Giới thiệu')).toBeOnTheScreen();
    expect(screen.getByText('Hỗ trợ 24/7')).toBeOnTheScreen();

    // Press History
    fireEvent.press(screen.getByTestId('utility-link-history'));
    expect(mockPush).toHaveBeenCalledWith('/customer/history');

    // Press Favorites
    fireEvent.press(screen.getByTestId('utility-link-favorites'));
    expect(mockPush).toHaveBeenCalledWith('/customer/favorites');

    // Press Referral
    fireEvent.press(screen.getByTestId('utility-link-referral'));
    expect(mockPush).toHaveBeenCalledWith('/customer/referral');

    // Press Support
    fireEvent.press(screen.getByTestId('utility-link-support'));
    expect(mockPush).toHaveBeenCalledWith('/customer/support');
  });

  it('navigates to search address when clicking location selector bar', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'u-1', phone: '0912345678', email: 'user@example.com', roles: ['Customer'], permissions: [] },
    });
    render(<CustomerHomeScreen />);

    fireEvent.press(screen.getByTestId('home-location-selector'));
    expect(mockPush).toHaveBeenCalledWith('/customer/search-address');
  });

  it('navigates to AI assistant and worker profile from nearby technicians section', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'u-1', phone: '0912345678', email: 'user@example.com', roles: ['Customer'], permissions: [] },
    });
    render(<CustomerHomeScreen />);

    // Press AI Assistant button
    fireEvent.press(screen.getByTestId('nearby-ai-assistant-btn'));
    expect(mockPush).toHaveBeenCalledWith('/customer/ask-me');

    // Press Worker Card
    fireEvent.press(screen.getByTestId('nearby-technician-card'));
    expect(mockPush).toHaveBeenCalledWith('/customer/workers/th-01');
  });
});
