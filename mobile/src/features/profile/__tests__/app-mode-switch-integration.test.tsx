/* eslint-disable max-lines-per-function */
import { getDestination } from '@/lib/auth/navigation';
import { storage } from '@/lib/storage';
import { AuthApi } from '@/services/auth/auth-api';
import {
  getActiveModeKey,
  getStoredActiveMode,
  resolveActiveMode,
  setStoredActiveMode,
  useAuthStore,
} from '@/stores/use-auth-store';

afterEach(() => {
  storage.clearAll();
  useAuthStore.setState({
    user: null,
    activeMode: null,
    isAuthenticated: false,
    isHydrated: true,
    isLoading: false,
    error: null,
    hydrationError: null,
  });
  jest.clearAllMocks();
});

describe('app Mode Switch & Persistence Lifecycle Integration', () => {
  const dualRoleUser = {
    id: 'user-dual-1',
    phone: '0987654321',
    email: 'dual@handygo.vn',
    roles: ['Customer', 'Worker'],
    permissions: [],
  };

  it('new account with both roles defaults to Customer App', () => {
    // No prior mode in MMKV
    expect(getStoredActiveMode(dualRoleUser.id)).toBeNull();

    const mode = resolveActiveMode(dualRoleUser);
    expect(mode).toBe('Customer');

    const dest = getDestination(dualRoleUser.roles, mode);
    expect(dest).toEqual({ type: 'ROUTE', path: '/customer' });
  });

  it('switches Customer -> Worker and Worker -> Customer without re-login', () => {
    useAuthStore.setState({
      user: dualRoleUser,
      isAuthenticated: true,
      activeMode: 'Customer',
    });

    // 1. Switch to Worker
    useAuthStore.getState().setActiveMode('Worker');
    expect(useAuthStore.getState().activeMode).toBe('Worker');
    expect(storage.getString(getActiveModeKey(dualRoleUser.id))).toBe('Worker');

    let dest = getDestination(dualRoleUser.roles, useAuthStore.getState().activeMode);
    expect(dest).toEqual({ type: 'ROUTE', path: '/worker' });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);

    // 2. Switch back to Customer
    useAuthStore.getState().setActiveMode('Customer');
    expect(useAuthStore.getState().activeMode).toBe('Customer');
    expect(storage.getString(getActiveModeKey(dualRoleUser.id))).toBe('Customer');

    dest = getDestination(dualRoleUser.roles, useAuthStore.getState().activeMode);
    expect(dest).toEqual({ type: 'ROUTE', path: '/customer' });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('remembers last active mode across app relaunch (hydrate)', async () => {
    // Simulate user previously set Worker mode
    setStoredActiveMode(dualRoleUser.id, 'Worker');

    // Simulate app cold launch
    jest.spyOn(AuthApi, 'getMe').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: dualRoleUser,
    });

    // Mock tokens exist in storage
    const tokenUtils = require('@/lib/auth/utils');
    jest.spyOn(tokenUtils, 'hydrateTokens').mockResolvedValue({
      access: 'access_mock',
      refresh: 'refresh_mock',
    });

    await useAuthStore.getState().hydrate();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.id).toBe(dualRoleUser.id);
    expect(state.activeMode).toBe('Worker');

    const dest = getDestination(state.user?.roles, state.activeMode);
    expect(dest).toEqual({ type: 'ROUTE', path: '/worker' });
  });

  it('remembers last active mode across re-login', async () => {
    // User previously used Worker mode
    setStoredActiveMode(dualRoleUser.id, 'Worker');

    jest.spyOn(AuthApi, 'login').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        accessToken: 'access_new',
        refreshToken: 'refresh_new',
        expiresIn: 3600,
        user: dualRoleUser,
      },
    });

    await useAuthStore.getState().login({
      phone: dualRoleUser.phone,
      password: 'Password123',
    });

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.activeMode).toBe('Worker');
  });

  it('does not leak mode when logging into a different account on same device', async () => {
    const userA = { ...dualRoleUser, id: 'user-a' };
    const userB = { ...dualRoleUser, id: 'user-b' };

    // User A sets Worker mode
    setStoredActiveMode(userA.id, 'Worker');

    // User B logs in for the first time
    jest.spyOn(AuthApi, 'login').mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        accessToken: 'access_b',
        refreshToken: 'refresh_b',
        expiresIn: 3600,
        user: userB,
      },
    });

    await useAuthStore.getState().login({
      phone: userB.phone,
      password: 'Password123',
    });

    // User B must default to Customer, not inherit User A's Worker mode
    expect(useAuthStore.getState().activeMode).toBe('Customer');
    expect(storage.getString(getActiveModeKey(userA.id))).toBe('Worker');
    expect(storage.getString(getActiveModeKey(userB.id))).toBe('Customer');
  });

  it('ignores invalid or revoked stored mode if user lacks the role', () => {
    const customerOnlyUser = {
      id: 'user-revoked',
      phone: '0911223344',
      email: 'revoked@handygo.vn',
      roles: ['Customer'], // No longer has Worker role
      permissions: [],
    };

    // Stored mode says Worker from the past
    setStoredActiveMode(customerOnlyUser.id, 'Worker');

    // Resolving mode must ignore Worker and fallback to Customer
    const mode = resolveActiveMode(customerOnlyUser);
    expect(mode).toBe('Customer');

    const dest = getDestination(customerOnlyUser.roles, mode);
    expect(dest).toEqual({ type: 'ROUTE', path: '/customer' });
  });

  it('prevents setActiveMode from setting a role user does not possess', () => {
    const customerOnlyUser = {
      id: 'user-single',
      phone: '0900000000',
      email: 'single@handygo.vn',
      roles: ['Customer'],
      permissions: [],
    };

    useAuthStore.setState({
      user: customerOnlyUser,
      activeMode: 'Customer',
      isAuthenticated: true,
    });

    // Try to set Worker mode
    useAuthStore.getState().setActiveMode('Worker');

    // Should remain Customer
    expect(useAuthStore.getState().activeMode).toBe('Customer');
    expect(storage.getString(getActiveModeKey(customerOnlyUser.id))).toBeUndefined();
  });
});
