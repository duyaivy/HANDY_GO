/* eslint-disable max-lines-per-function */
import type { AuthSessionData, AuthUser, LoginPayload, VerifyOtpPayload } from '@/services/auth/auth-api';
import { create } from 'zustand';
import { getToken, hydrateTokens, removeToken, setToken } from '@/lib/auth/utils';
import { createSelectors } from '@/lib/utils';
import { setOnUnauthorizedCallback } from '@/services/api/api-client';
import { AuthApi } from '@/services/auth/auth-api';

type AuthState = {
  user: AuthUser | null;
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
};

const _useAuthStore = create<AuthState>(set => ({
  user: null,
  isAuthenticated: false,
  isHydrated: false,
  isLoading: false,
  error: null,
  hydrationError: null,

  clearError: () => set({ error: null }),

  setUser: user => set({ user, isAuthenticated: Boolean(user) }),

  login: async (payload: LoginPayload) => {
    set({ isLoading: true, error: null });
    try {
      const response = await AuthApi.login(payload);
      const session = response.data;

      await setToken({
        access: session.accessToken,
        refresh: session.refreshToken,
      });

      set({
        user: session.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        hydrationError: null,
      });

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

      // Verification activates account on backend; do not auto-login to allow manual login
      set({
        isLoading: false,
        error: null,
        hydrationError: null,
      });

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
      await removeToken();
      set({
        user: null,
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
        set({ isHydrated: true, isAuthenticated: false, user: null, hydrationError: null });
        return;
      }

      // Fetch user profile; api-client will automatically refresh access token if needed
      try {
        const meResponse = await AuthApi.getMe();
        set({
          user: meResponse.data,
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
            set({
              user: retryMeResponse.data,
              isAuthenticated: true,
              isHydrated: true,
              hydrationError: null,
            });
            return;
          }
          catch (refreshErr: any) {
            const isAuthRejection
              = refreshErr?.statusCode === 401
                || refreshErr?.statusCode === 403
                || refreshErr?.code === 'INVALID_REFRESH_TOKEN'
                || refreshErr?.message?.includes('Unauthorized')
                || refreshErr?.message?.includes('Refresh failed');

            if (isAuthRejection) {
              await removeToken();
              set({
                user: null,
                isAuthenticated: false,
                isHydrated: true,
                hydrationError: null,
              });
              return;
            }
          }
        }

        const isAuthError
          = apiErr?.statusCode === 401
            || apiErr?.statusCode === 403
            || apiErr?.code === 'INVALID_REFRESH_TOKEN'
            || apiErr?.message?.includes('Unauthorized');

        if (isAuthError) {
          await removeToken();
          set({
            user: null,
            isAuthenticated: false,
            isHydrated: true,
            hydrationError: null,
          });
        }
        else {
          // Network error or server downtime: preserve tokens and record hydrationError
          set({
            user: null,
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
    isAuthenticated: false,
  });
});

export const useAuthStore = createSelectors(_useAuthStore);
