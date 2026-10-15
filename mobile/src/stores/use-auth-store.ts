/* eslint-disable max-lines-per-function */
import type { AuthSessionData, AuthUser, LoginPayload, VerifyOtpPayload } from '@/services/auth/auth-api';
import { create } from 'zustand';
import { queryClient } from '@/lib/api/query-client';
import { getToken, hydrateTokens, removeToken, setToken } from '@/lib/auth/utils';
import { storage } from '@/lib/storage';
import { createSelectors } from '@/lib/utils';
import { setOnUnauthorizedCallback } from '@/services/api/api-client';
import { AuthApi } from '@/services/auth/auth-api';

export type AppMode = 'Customer' | 'Worker';

export const getActiveModeKey = (userId: string) => `handy_go_active_mode_${userId}`;

export function getStoredActiveMode(userId: string): AppMode | null {
  try {
    const raw = storage.getString(getActiveModeKey(userId));
    if (raw === 'Customer' || raw === 'Worker') {
      return raw;
    }
    return null;
  }
  catch {
    return null;
  }
}

export function setStoredActiveMode(userId: string, mode: AppMode): void {
  try {
    storage.set(getActiveModeKey(userId), mode);
  }
  catch {
    // ignore
  }
}

export function resolveActiveMode(user: AuthUser | null): AppMode | null {
  if (!user || !user.roles || user.roles.length === 0) {
    return null;
  }

  const stored = getStoredActiveMode(user.id);
  // Stored mode is only used if user currently has that role
  if (stored && user.roles.includes(stored)) {
    return stored;
  }

  // Fallback: Default to Customer if account has Customer role (or both)
  if (user.roles.includes('Customer')) {
    return 'Customer';
  }

  if (user.roles.includes('Worker')) {
    return 'Worker';
  }

  return null;
}

type AuthState = {
  user: AuthUser | null;
  activeMode: AppMode | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  isLoading: boolean;
  error: string | null;
  hydrationError: string | null;

  login: (payload: LoginPayload) => Promise<AuthSessionData>;
  verifyOtp: (payload: VerifyOtpPayload) => Promise<AuthSessionData>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  clearError: () => void;
  setUser: (user: AuthUser | null) => void;
  setActiveMode: (mode: AppMode) => void;
};

const _useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  activeMode: null,
  isAuthenticated: false,
  isHydrated: false,
  isLoading: false,
  error: null,
  hydrationError: null,

  clearError: () => set({ error: null }),

  setUser: (user) => {
    const activeMode = resolveActiveMode(user);
    if (user && activeMode) {
      setStoredActiveMode(user.id, activeMode);
    }
    set({ user, activeMode, isAuthenticated: Boolean(user) });
  },

  setActiveMode: (mode: AppMode) => {
    const currentUser = get().user;
    if (!currentUser || !currentUser.roles?.includes(mode)) {
      return;
    }
    setStoredActiveMode(currentUser.id, mode);
    set({ activeMode: mode });
  },

  login: async (payload: LoginPayload) => {
    set({ isLoading: true, error: null });
    try {
      const response = await AuthApi.login(payload);
      const session = response.data;

      await setToken({
        access: session.accessToken,
        refresh: session.refreshToken,
      });

      const activeMode = resolveActiveMode(session.user);
      if (activeMode) {
        setStoredActiveMode(session.user.id, activeMode);
      }

      set({
        user: session.user,
        activeMode,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        hydrationError: null,
      });

      // Prefetch profile immediately using React Query (failure does not cancel auth session)
      queryClient.prefetchQuery({
        queryKey: ['user-profile', session.user.id],
        queryFn: async () => {
          const res = await AuthApi.getMyProfile();
          return res.data;
        },
      }).catch(() => {});

      return session;
    }
    catch (err: any) {
      const errorMessage = err?.message || 'Đăng nhập không thành công. Vui lòng thử lại.';
      set({ isLoading: false, error: errorMessage });
      throw err;
    }
  },

  verifyOtp: async (payload: VerifyOtpPayload) => {
    set({ isLoading: true, error: null });
    try {
      const response = await AuthApi.verifyOtp(payload);
      const session = response.data;

      await setToken({
        access: session.accessToken,
        refresh: session.refreshToken,
      });

      const activeMode = resolveActiveMode(session.user);
      if (activeMode) {
        setStoredActiveMode(session.user.id, activeMode);
      }

      set({
        user: session.user,
        activeMode,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        hydrationError: null,
      });

      // Prefetch profile immediately using React Query (failure does not cancel auth session)
      queryClient.prefetchQuery({
        queryKey: ['user-profile', session.user.id],
        queryFn: async () => {
          const res = await AuthApi.getMyProfile();
          return res.data;
        },
      }).catch(() => {});

      return session;
    }
    catch (err: any) {
      const errorMessage = err?.message || 'Xác thực OTP không thành công.';
      set({ isLoading: false, error: errorMessage });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      const tokens = getToken();
      await AuthApi.logout(tokens?.refresh).catch(() => {});
    }
    finally {
      queryClient.removeQueries({ queryKey: ['user-profile'] });
      await removeToken();
      set({
        user: null,
        activeMode: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        hydrationError: null,
      });
    }
  },

  hydrate: async () => {
    try {
      const tokens = await hydrateTokens();
      if (!tokens) {
        set({ isHydrated: true, isAuthenticated: false, user: null, activeMode: null, hydrationError: null });
        return;
      }

      // Fetch user profile; api-client will automatically refresh access token if needed
      try {
        const meResponse = await AuthApi.getMe();
        const activeMode = resolveActiveMode(meResponse.data);
        if (activeMode) {
          setStoredActiveMode(meResponse.data.id, activeMode);
        }
        set({
          user: meResponse.data,
          activeMode,
          isAuthenticated: true,
          isHydrated: true,
          hydrationError: null,
        });
      }
      catch (apiErr: any) {
        const latestTokens = getToken() || tokens;
        if (latestTokens?.refresh) {
          try {
            const refreshRes = await AuthApi.refresh(latestTokens.refresh);
            const newTokens = refreshRes.data;
            await setToken({
              access: newTokens.accessToken,
              refresh: newTokens.refreshToken,
            });

            const retryMeResponse = await AuthApi.getMe();
            const activeMode = resolveActiveMode(retryMeResponse.data);
            if (activeMode) {
              setStoredActiveMode(retryMeResponse.data.id, activeMode);
            }
            set({
              user: retryMeResponse.data,
              activeMode,
              isAuthenticated: true,
              isHydrated: true,
              hydrationError: null,
            });
            return;
          }
          catch (refreshErr: any) {
            const isAuthRejection
              = refreshErr?.statusCode === 400
                || refreshErr?.statusCode === 401
                || refreshErr?.statusCode === 403
                || refreshErr?.statusCode === 422
                || refreshErr?.code === 'INVALID_REFRESH_TOKEN'
                || refreshErr?.code === 'VALIDATION_ERROR'
                || refreshErr?.message?.includes('Unauthorized')
                || refreshErr?.message?.includes('Refresh failed');

            if (isAuthRejection) {
              await removeToken();
              set({
                user: null,
                activeMode: null,
                isAuthenticated: false,
                isHydrated: true,
                hydrationError: null,
              });
              return;
            }
          }
        }

        const isAuthError
          = apiErr?.statusCode === 400
            || apiErr?.statusCode === 401
            || apiErr?.statusCode === 403
            || apiErr?.statusCode === 422
            || apiErr?.code === 'INVALID_REFRESH_TOKEN'
            || apiErr?.code === 'VALIDATION_ERROR'
            || apiErr?.message?.includes('Unauthorized');

        if (isAuthError) {
          await removeToken();
          set({
            user: null,
            activeMode: null,
            isAuthenticated: false,
            isHydrated: true,
            hydrationError: null,
          });
        }
        else {
          // Network error or server downtime: preserve tokens and record hydrationError
          set({
            user: null,
            activeMode: null,
            isAuthenticated: false,
            isHydrated: true,
            hydrationError: 'NETWORK_ERROR',
          });
        }
      }
    }
    catch {
      await removeToken();
      set({
        user: null,
        activeMode: null,
        isAuthenticated: false,
        isHydrated: true,
        hydrationError: null,
      });
    }
  },
}));

setOnUnauthorizedCallback(() => {
  _useAuthStore.setState({
    user: null,
    activeMode: null,
    isAuthenticated: false,
  });
});

export const useAuthStore = createSelectors(_useAuthStore);
