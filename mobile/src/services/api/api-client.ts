import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import Env from 'env';

import { AppConstants } from '@/constants/app-constants';
import { getSessionVersion, getToken, removeToken, setToken } from '@/lib/auth/utils';
import { Logger } from '@/services/logger/logger';
import { ApiError } from './api-error';

const baseURL = Env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000/api/v1';

export const axiosInstance: AxiosInstance = axios.create({
  baseURL,
  timeout: AppConstants.API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

type CustomRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

let refreshPromise: Promise<string> | null = null;
let onUnauthorizedCallback: (() => Promise<void> | void) | null = null;

export function setOnUnauthorizedCallback(callback: (() => Promise<void> | void) | null) {
  onUnauthorizedCallback = callback;
}

/**
 * Single shared refresh implementation.
 * Ensures concurrent callers and interceptors share the exact same in-flight request.
 */
export async function refreshTokens(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const currentTokens = getToken();
  if (!currentTokens?.refresh) {
    await removeToken();
    if (onUnauthorizedCallback) {
      await onUnauthorizedCallback();
    }
    throw new ApiError('AUTH_ERROR', 'Phiên đăng nhập đã hết hạn.');
  }

  const versionBeforeRefresh = getSessionVersion();

  refreshPromise = (async () => {
    try {
      const response = await axios.post<{
        statusCode: number;
        message: string;
        data: { accessToken: string; refreshToken: string; expiresIn: number };
      }>(
        `${baseURL}/auth/refresh`,
        { refreshToken: currentTokens.refresh },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          timeout: AppConstants.API_TIMEOUT_MS,
        },
      );

      const newTokens = response.data.data;

      // Session version check: if user logged out or switched accounts during refresh, discard
      if (getSessionVersion() === versionBeforeRefresh) {
        await setToken({
          access: newTokens.accessToken,
          refresh: newTokens.refreshToken,
        });
      }

      return newTokens.accessToken;
    }
    catch (err: any) {
      const apiError = ApiError.fromAxiosError(err);

      // Only wipe session if the refresh token is rejected by the server
      const isAuthRejection = apiError.statusCode === 401 || apiError.statusCode === 403;
      if (isAuthRejection && getSessionVersion() === versionBeforeRefresh) {
        await removeToken();
        if (onUnauthorizedCallback) {
          await onUnauthorizedCallback();
        }
      }

      throw apiError;
    }
    finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Request Interceptor: Auto attach Bearer token and log
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    try {
      const token = getToken();
      if (token?.access && config.headers) {
        config.headers.Authorization = `Bearer ${token.access}`;
      }
    }
    catch {
      // Ignored if storage is not ready
    }

    Logger.debug('API_REQUEST', `${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, config.data);
    return config;
  },
  (error) => {
    Logger.error('API_REQUEST_ERROR', 'Request failed to send', error);
    return Promise.reject(ApiError.fromAxiosError(error));
  },
);

// Response Interceptor: Log response, handle 401 token refresh queue, classify errors
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    Logger.debug('API_RESPONSE', `${response.status} ${response.config.url}`, response.data);
    return response;
  },
  async (error) => {
    const originalRequest = error.config as CustomRequestConfig | undefined;
    const is401 = error.response?.status === 401;

    // Determine if this request had an Authorization header and is not an unauthenticated auth endpoint
    const url = originalRequest?.url || '';
    const isAuthEndpoint
      = url.includes('/auth/login')
        || url.includes('/auth/register')
        || url.includes('/auth/verify-email')
        || url.includes('/auth/resend-otp')
        || url.includes('/auth/refresh')
        || url.includes('/auth/logout');

    const hadAuthHeader = Boolean(originalRequest?.headers?.Authorization || originalRequest?.headers?.authorization);

    // If 401 on /auth/refresh itself, wipe session and invoke unauthorized callback
    if (is401 && url.includes('/auth/refresh')) {
      await removeToken();
      if (onUnauthorizedCallback) {
        await onUnauthorizedCallback();
      }
      return Promise.reject(ApiError.fromAxiosError(error));
    }

    // Refresh ONLY applies to authenticated requests that failed with 401 and have not been retried yet
    if (is401 && originalRequest && !originalRequest._retry && hadAuthHeader && !isAuthEndpoint) {
      originalRequest._retry = true;

      try {
        const newAccessToken = await refreshTokens();
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return axiosInstance(originalRequest);
      }
      catch (refreshError) {
        return Promise.reject(refreshError);
      }
    }

    const apiError = ApiError.fromAxiosError(error);
    Logger.error('API_RESPONSE_ERROR', `${apiError.kind}: ${apiError.message}`, error?.response?.data);
    return Promise.reject(apiError);
  },
);

/**
 * Standard API Client with typed helper methods.
 */
export const ApiClient = {
  get: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.get<T>(url, config);
    return response.data;
  },

  post: async <T, B = unknown>(url: string, data?: B, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.post<T>(url, data, config);
    return response.data;
  },

  put: async <T, B = unknown>(url: string, data?: B, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.put<T>(url, data, config);
    return response.data;
  },

  patch: async <T, B = unknown>(url: string, data?: B, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.patch<T>(url, data, config);
    return response.data;
  },

  delete: async <T>(url: string, config?: AxiosRequestConfig): Promise<T> => {
    const response = await axiosInstance.delete<T>(url, config);
    return response.data;
  },
};
