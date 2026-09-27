/* eslint-disable max-lines-per-function */
import * as React from 'react';
import { Text } from 'react-native';
import { cleanup, render, screen } from '@/lib/test-utils';
import { AuthApi } from '@/services/auth/auth-api';
import { useAuthStore } from '@/stores/use-auth-store';
import { RoleGuard } from '../role-guard';
import { getToken, removeToken, setToken } from '../utils';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  })),
}));

afterEach(async () => {
  cleanup();
  jest.clearAllMocks();
  await removeToken();
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isHydrated: true,
  });
});

describe('secure Token Storage & Auth Store', () => {
  it('stores tokens in SecureStore and retrieves via in-memory sync cache', async () => {
    await setToken({ access: 'access_123', refresh: 'refresh_456' });
    const tokens = getToken();
    expect(tokens).toEqual({ access: 'access_123', refresh: 'refresh_456' });

    await removeToken();
    expect(getToken()).toBeNull();
  });

  it('hydrates tokens and verifies user profile from backend on app launch', async () => {
    await setToken({ access: 'access_123', refresh: 'refresh_456' });

    jest.spyOn(AuthApi, 'getMe').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'user-1',
        phone: '+84912345678',
        email: 'customer@example.com',
        roles: ['Customer'],
        permissions: ['profile:read'],
      },
    });

    await useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.roles).toContain('Customer');
  });

  it('clears invalid token during hydration if getMe and refresh both fail', async () => {
    await setToken({ access: 'expired_access', refresh: 'expired_refresh' });
    jest.spyOn(AuthApi, 'getMe').mockRejectedValue(new Error('Unauthorized'));
    jest.spyOn(AuthApi, 'refresh').mockRejectedValue(new Error('Refresh failed'));

    await useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(getToken()).toBeNull();
  });

  it('recovers session during hydration if access token expired but refresh token is valid', async () => {
    await setToken({ access: 'expired_access', refresh: 'valid_refresh' });

    let getMeCount = 0;
    jest.spyOn(AuthApi, 'getMe').mockImplementation(async () => {
      getMeCount++;
      if (getMeCount === 1) {
        throw new Error('Unauthorized');
      }
      return {
        statusCode: 200,
        message: 'OK',
        data: {
          id: 'user-recovered',
          phone: '+84912345678',
          email: 'recovered@example.com',
          roles: ['Customer'],
          permissions: ['profile:read'],
        },
      };
    });

    jest.spyOn(AuthApi, 'refresh').mockResolvedValue({
      statusCode: 200,
      message: 'Refreshed',
      data: {
        accessToken: 'rotated_access_token',
        refreshToken: 'rotated_refresh_token',
        expiresIn: 300,
      },
    });

    await useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe('user-recovered');
    expect(getToken()?.access).toBe('rotated_access_token');
    expect(getToken()?.refresh).toBe('rotated_refresh_token');
  });

  it('clears session on logout', async () => {
    await setToken({ access: 'access', refresh: 'refresh' });
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: 'u1',
        phone: '0912345678',
        email: 'u1@example.com',
        roles: ['Customer'],
        permissions: [],
      },
    });
    jest.spyOn(AuthApi, 'logout').mockResolvedValue({
      statusCode: 200,
      message: 'Logged out',
      data: undefined as any,
    });

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
    expect(getToken()).toBeNull();
  });
});

describe('roleGuard', () => {
  it('redirects unauthenticated user to login screen', () => {
    useAuthStore.setState({ isAuthenticated: false, user: null, isHydrated: true });

    render(
      <RoleGuard allowedRoles={['Customer']}>
        <Text>Protected Customer Content</Text>
      </RoleGuard>,
    );

    expect(screen.queryByText('Protected Customer Content')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
  });

  it('renders protected content when user has the allowed role', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isHydrated: true,
      user: {
        id: 'u1',
        phone: '0912345678',
        email: 'c@example.com',
        roles: ['Customer'],
        permissions: ['profile:read'],
      },
    });

    render(
      <RoleGuard allowedRoles={['Customer']}>
        <Text>Protected Customer Content</Text>
      </RoleGuard>,
    );

    expect(screen.getByText('Protected Customer Content')).toBeOnTheScreen();
  });

  it('redirects Worker trying to access Customer route to worker home', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      isHydrated: true,
      user: {
        id: 'worker-1',
        phone: '0987654321',
        email: 'w@example.com',
        roles: ['Worker'],
        permissions: [],
      },
    });

    render(
      <RoleGuard allowedRoles={['Customer']}>
        <Text>Customer Only Content</Text>
      </RoleGuard>,
    );

    expect(screen.queryByText('Customer Only Content')).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith('/worker');
  });
});
