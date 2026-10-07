/* eslint-disable max-lines-per-function */
/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { CustomerProfileScreen } from '../screens/customer-profile-screen';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({
      replace: mockReplace,
      push: mockPush,
      back: jest.fn(),
    }),
    useFocusEffect: (cb: any) => {
      React.useEffect(() => {
        cb();
      }, [cb]);
    },
  };
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
  useAuthStore.setState({
    user: null,
    activeMode: null,
    isAuthenticated: false,
    isHydrated: true,
    isLoading: false,
    error: null,
    hydrationError: null,
  });
});

describe('customerProfileScreen', () => {
  it('renders customer profile with user details, phone, and App Khách badge', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'cust-123',
        phone: '0912345678',
        email: 'customer@example.com',
        roles: ['Customer'],
        permissions: ['profile:read'],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'cust-123',
        fullName: 'Nguyễn Văn Khách',
        avatarUrl: null,
        status: 'active',
        customerProfile: {
          id: 'cp-1',
          userId: 'cust-123',
          bio: 'Khách hàng thân thiết',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        workerProfile: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    render(<CustomerProfileScreen />);

    expect(await screen.findByText('Nguyễn Văn Khách')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-phone')).toHaveTextContent('0912345678');
    expect(screen.getByText('App Khách')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-avatar-fallback')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('profile-header-card-pressable'));

    expect(mockPush).toHaveBeenCalledWith('/customer/profile/detail');
  });

  it('renders switch button to Worker app when account has both roles', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      activeMode: 'Customer',
      user: {
        id: 'user-both',
        phone: '0988888888',
        email: 'both@example.com',
        roles: ['Customer', 'Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'user-both',
        fullName: 'Người Dùng Hai Vai Trò',
        avatarUrl: 'https://example.com/avatar.jpg',
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-1',
          userId: 'user-both',
          status: 'draft',
          averageRating: 0,
          ratingCount: 0,
          completedOrderCount: 0,
          orderCountTotal: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    render(<CustomerProfileScreen />);

    const switchBtn = await screen.findByTestId('switch-to-worker-btn');
    expect(switchBtn).toBeOnTheScreen();
    expect(screen.getByText('Chuyển sang App Thợ')).toBeOnTheScreen();
    // Worker status is draft, so notice is displayed
    expect(await screen.findByText(/Chưa xác minh/)).toBeOnTheScreen();

    // Press switch button
    fireEvent.press(switchBtn);

    expect(mockReplace).toHaveBeenCalledWith('/worker');
    expect(useAuthStore.getState().activeMode).toBe('Worker');
  });

  it('hides switch button when user has only Customer role', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'cust-only',
        phone: '0911111111',
        email: 'customer-only@example.com',
        roles: ['Customer'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'cust-only',
        fullName: 'Chỉ Làm Khách',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    render(<CustomerProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('Chỉ Làm Khách')).toBeOnTheScreen();
    });

    expect(screen.queryByTestId('switch-to-worker-btn')).toBeNull();
  });

  it('handles getMyProfile failure with retry button while keeping switch functionality intact', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'user-error',
        phone: '0922222222',
        email: 'error@example.com',
        roles: ['Customer', 'Worker'],
        permissions: [],
      },
    });

    const getProfileSpy = jest
      .spyOn(AuthApi, 'getMyProfile')
      .mockRejectedValueOnce(new Error('Mạng không ổn định'))
      .mockResolvedValueOnce({
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'user-error',
          fullName: 'Đã Tải Lại Thành Công',
          avatarUrl: null,
          status: 'active',
          customerProfile: null,
          workerProfile: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

    render(<CustomerProfileScreen />);

    // Shows retry notice
    expect(await screen.findByTestId('profile-fetch-error')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-retry-btn')).toBeOnTheScreen();

    // Switch card is STILL visible and functional based on auth session roles
    const switchBtn = screen.getByTestId('switch-to-worker-btn');
    expect(switchBtn).toBeOnTheScreen();

    // Press retry
    fireEvent.press(screen.getByTestId('profile-retry-btn'));

    await waitFor(() => {
      expect(getProfileSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Đã Tải Lại Thành Công')).toBeOnTheScreen();
    });
  });

  it('handles logout properly', async () => {
    jest.spyOn(AuthApi, 'logout').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: undefined,
    });

    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'user-logout',
        phone: '0933333333',
        email: 'logout@example.com',
        roles: ['Customer'],
        permissions: [],
      },
    });

    render(<CustomerProfileScreen />);

    fireEvent.press(screen.getByTestId('customer-logout-btn'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });
});
