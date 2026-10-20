/* eslint-disable max-lines-per-function */
/* eslint-disable react/no-unnecessary-use-prefix */
import * as React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { WorkerProfileScreen } from '../screens/worker-profile-screen';

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

describe('workerProfileScreen', () => {
  it('renders worker profile with details, App Thợ badge, and draft status notice', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-123',
        phone: '0977777777',
        email: 'worker@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-123',
        fullName: 'Trần Văn Thợ Điện',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-123',
          userId: 'worker-123',
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

    render(<WorkerProfileScreen />);

    expect(await screen.findByText('Trần Văn Thợ Điện')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-phone')).toHaveTextContent('0977777777');
    expect(screen.getByText('App Thợ')).toBeOnTheScreen();
    expect(screen.getByText('Chưa xác minh')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-avatar-fallback')).toBeOnTheScreen();
  });

  it('renders switch button to Customer app when account has both roles', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      activeMode: 'Worker',
      user: {
        id: 'user-dual',
        phone: '0966666666',
        email: 'dual@example.com',
        roles: ['Customer', 'Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'user-dual',
        fullName: 'Thợ Kiêm Khách',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-dual',
          userId: 'user-dual',
          status: 'verified',
          averageRating: 4.8,
          ratingCount: 15,
          completedOrderCount: 12,
          orderCountTotal: 12,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    render(<WorkerProfileScreen />);

    const switchBtn = await screen.findByTestId('switch-to-customer-btn');
    expect(switchBtn).toBeOnTheScreen();
    expect(screen.getAllByText('Chuyển sang App Khách').length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('Đã xác minh')).toBeOnTheScreen();

    // Press switch button
    fireEvent.press(switchBtn);

    expect(mockReplace).toHaveBeenCalledWith('/customer');
    expect(useAuthStore.getState().activeMode).toBe('Customer');
  });

  it('hides switch button when user has only Worker role', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-only',
        phone: '0955555555',
        email: 'worker-only@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    jest.spyOn(AuthApi, 'getMyProfile').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'worker-only',
        fullName: 'Chỉ Làm Thợ',
        avatarUrl: null,
        status: 'active',
        customerProfile: null,
        workerProfile: {
          id: 'wp-only',
          userId: 'worker-only',
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

    render(<WorkerProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText('Chỉ Làm Thợ')).toBeOnTheScreen();
    });

    expect(screen.queryByTestId('switch-to-customer-btn')).toBeNull();
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
        id: 'worker-logout',
        phone: '0944444444',
        email: 'logout@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    render(<WorkerProfileScreen />);

    fireEvent.press(screen.getByTestId('worker-logout-btn'));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('renders change password button next to logout button', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-123',
        phone: '0977777777',
        email: 'worker@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    render(<WorkerProfileScreen />);

    expect(screen.getByTestId('worker-change-password-btn')).toBeOnTheScreen();
    expect(screen.getByText('Đổi mật khẩu')).toBeOnTheScreen();
    expect(screen.getByTestId('worker-logout-btn')).toBeOnTheScreen();

    fireEvent.press(screen.getByTestId('worker-change-password-btn'));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/change-password');
  });

  it('navigates to HANDY_GO balance screen when balance card is pressed', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-123',
        phone: '0977777777',
        email: 'worker@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    render(<WorkerProfileScreen />);

    const balanceCard = screen.getByTestId('profile-balance-card');
    expect(balanceCard).toBeOnTheScreen();
    expect(screen.getByText('HANDY_GO balance')).toBeOnTheScreen();

    fireEvent.press(balanceCard);
    expect(mockPush).toHaveBeenCalledWith('/worker/balance');
  });

  it('navigates to Professional skills screen when skills item is pressed', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-123',
        phone: '0977777777',
        email: 'worker@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    render(<WorkerProfileScreen />);

    const skillsItem = screen.getByTestId('profile-skills-item');
    expect(skillsItem).toBeOnTheScreen();
    expect(screen.getByText('Professional skills')).toBeOnTheScreen();

    fireEvent.press(skillsItem);
    expect(mockPush).toHaveBeenCalledWith('/worker/skills');
  });

  it('navigates to Setting screen when setting item is pressed', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'worker-123',
        phone: '0977777777',
        email: 'worker@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    render(<WorkerProfileScreen />);

    const settingItem = screen.getByTestId('profile-setting-item');
    expect(settingItem).toBeOnTheScreen();
    expect(screen.getByText('Setting')).toBeOnTheScreen();

    fireEvent.press(settingItem);
    expect(mockPush).toHaveBeenCalledWith('/worker/settings');
  });
});
