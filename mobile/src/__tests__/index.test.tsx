/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import IndexScreen from '@/app/index';
import { cleanup, render, screen } from '@/lib/test-utils';
import { useAuthStore } from '@/stores/use-auth-store';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
  }),
  useRootNavigationState: () => ({
    key: 'root-test',
  }),
}));

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

describe('indexScreen Session Restoration & Gatekeeper', () => {
  it('renders loading state when session is hydrating', () => {
    useAuthStore.setState({
      isHydrated: false,
      isAuthenticated: false,
      user: null,
      hydrationError: null,
    });

    render(<IndexScreen />);
    expect(screen.getByTestId('session-loading-screen')).toBeOnTheScreen();
    expect(screen.getByText('Đang khôi phục phiên đăng nhập...')).toBeOnTheScreen();
  });

  it('redirects to login when user is unauthenticated after hydration', () => {
    useAuthStore.setState({
      isHydrated: true,
      isAuthenticated: false,
      user: null,
      hydrationError: null,
    });

    render(<IndexScreen />);
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('redirects to customer home when user has Customer role', () => {
    useAuthStore.setState({
      isHydrated: true,
      isAuthenticated: true,
      user: {
        id: 'user-cust',
        phone: '0912345678',
        email: 'cust@handygo.vn',
        roles: ['Customer'],
        permissions: [],
      },
      hydrationError: null,
    });

    render(<IndexScreen />);
    expect(mockReplace).toHaveBeenCalledWith('/customer');
  });

  it('redirects to worker home when user is Worker-only', () => {
    useAuthStore.setState({
      isHydrated: true,
      isAuthenticated: true,
      user: {
        id: 'user-wrk',
        phone: '0987654321',
        email: 'worker@handygo.vn',
        roles: ['Worker'],
        permissions: [],
      },
      hydrationError: null,
    });

    render(<IndexScreen />);
    expect(mockReplace).toHaveBeenCalledWith('/worker');
  });

  it('renders network error screen when session hydration encounters network outage', () => {
    useAuthStore.setState({
      isHydrated: true,
      isAuthenticated: false,
      user: null,
      hydrationError: 'NETWORK_ERROR',
    });

    render(<IndexScreen />);
    expect(screen.getByTestId('session-network-error')).toBeOnTheScreen();
    expect(screen.getByText('Không thể kết nối máy chủ')).toBeOnTheScreen();
    expect(screen.getByTestId('retry-hydration-btn')).toBeOnTheScreen();
    expect(screen.getByTestId('goto-login-btn')).toBeOnTheScreen();
  });
});
