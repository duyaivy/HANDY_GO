import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import Env from 'env';

import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import { AppConstants } from '@/constants/app-constants';
import { getSessionVersion, getToken, removeToken, setToken } from '@/lib/auth/utils';

import { Logger } from '@/services/logger/logger';
import { ApiError } from './api-error';
import { privateApiPayload } from './api-log-policy';

export function resolveApiBaseUrl(configuredUrl = Env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:3000/api/v1'): string {
  // In development on Android, adapt the URL if running on emulator vs physical device via USB reverse
  if (__DEV__ && Platform.OS === 'android') {
    if (configuredUrl.includes('127.0.0.1') || configuredUrl.includes('localhost') || configuredUrl.includes('10.0.2.2')) {
      const hostUri = Constants.expoConfig?.hostUri;
      const scriptURL = (NativeModules?.SourceCode as { scriptURL?: string } | undefined)?.scriptURL;
      const devHost = hostUri
        ? hostUri.split(':')[0]
        : (scriptURL ? scriptURL.match(/https?:\/\/([^:/]+)/)?.[1] : null);

      // If bundle was loaded from 10.0.2.2 (standard Android Emulator route without reverse)
      if (devHost === '10.0.2.2') {
        return configuredUrl.replace(/127\.0\.0\.1|localhost/, '10.0.2.2');
      }

      // If bundle was loaded from a local LAN IP (e.g. 192.168.x.x)
      if (devHost && devHost !== 'localhost' && devHost !== '127.0.0.1') {
        return configuredUrl.replace(/127\.0\.0\.1|localhost|10\.0\.2\.2/, devHost);
      }

      // Default: physical device via USB reverse (127.0.0.1)
      return configuredUrl.replace('10.0.2.2', '127.0.0.1');
    }
  }

  return configuredUrl;
}

const baseURL = resolveApiBaseUrl();

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
  _retry429?: boolean;
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

      // Wipe session if the refresh token is rejected by the server (400, 401, 403, 422)
      const isAuthRejection
        = apiError.statusCode === 400
          || apiError.statusCode === 401
          || apiError.statusCode === 403
          || apiError.statusCode === 422;
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

export function isFormDataPayload(val: unknown): boolean {
  if (!val || typeof val !== 'object') {
    return false;
  }
  if (typeof FormData !== 'undefined' && val instanceof FormData) {
    return true;
  }
  const duckVal = val as { append?: unknown; _parts?: unknown };
  return (
    typeof duckVal.append === 'function'
    && (Array.isArray(duckVal._parts) || Object.prototype.toString.call(val) === '[object FormData]')
  );
}

// Request Interceptor: Auto attach Bearer token and log
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (isFormDataPayload(config.data)) {
      // Let the native networking layer generate the multipart boundary.
      if (typeof config.headers?.setContentType === 'function') {
        config.headers.setContentType(false);
      }
      else if (config.headers) {
        delete (config.headers as any)['Content-Type'];
        delete (config.headers as any)['content-type'];
      }
    }

    try {
      const token = getToken();
      if (token?.access && config.headers) {
        config.headers.Authorization = `Bearer ${token.access}`;
      }
    }
    catch {
      // Ignored if storage is not ready
    }

    Logger.debug('API_REQUEST', `${config.method?.toUpperCase()} ${config.baseURL}${config.url}`, privateApiPayload(config.url || '') ? undefined : config.data);
    return config;
  },
  (error) => {
    Logger.error('API_REQUEST_ERROR', 'Request failed to send');
    return Promise.reject(ApiError.fromAxiosError(error));
  },
);

// Response Interceptor: Log response, handle 401 token refresh queue, classify errors
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    Logger.debug('API_RESPONSE', `${response.status} ${response.config.url}`, privateApiPayload(response.config.url || '') ? undefined : response.data);
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

    // If client error (400, 401, 403, 422) on /auth/refresh itself, wipe session and invoke unauthorized callback
    const isRefreshFailure
      = (error.response?.status === 400
        || error.response?.status === 401
        || error.response?.status === 403
        || error.response?.status === 422)
      && url.includes('/auth/refresh');

    if (isRefreshFailure) {
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

    // 429 Rate Limit retry with jitter
    const is429 = error.response?.status === 429;
    if (is429 && originalRequest && !originalRequest._retry429) {
      originalRequest._retry429 = true;
      const retryAfterHeader = error.response?.headers?.['retry-after'];
      const retryAfterSec = retryAfterHeader ? Number.parseInt(String(retryAfterHeader), 10) : Number.NaN;
      const delayMs = !Number.isNaN(retryAfterSec) && retryAfterSec >= 0
        ? retryAfterSec * 1000
        : 2000 + Math.random() * 1000;
      Logger.warn('API_RATE_LIMIT_RETRY', `Request 429 rate limited. Retrying after ${Math.round(delayMs)}ms: ${url}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return axiosInstance(originalRequest);
    }

    const apiError = ApiError.fromAxiosError(error);
    Logger.warn(
      'API_RESPONSE_ERROR',
      `${originalRequest?.method?.toUpperCase() || 'REQUEST'} ${url}: ${apiError.kind} (${apiError.statusCode ?? 'no status'}): ${apiError.message}`,
      apiError.kind === 'RATE_LIMITED' || privateApiPayload(url) ? undefined : error?.response?.data,
    );
    return Promise.reject(apiError);
  },
);

/**
 * Generic request helper wrapping axiosInstance.
 * Automatically normalizes `/api/v1/` prefix if provided in URL (since baseURL already includes it),
 * and unwraps standard API success response envelopes ({ statusCode, message, data }).
 */
export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const normalizedConfig: AxiosRequestConfig = { ...config };
  if (normalizedConfig.url && normalizedConfig.url.startsWith('/api/v1/')) {
    normalizedConfig.url = normalizedConfig.url.slice('/api/v1'.length);
  }
  const response = await axiosInstance.request<any>(normalizedConfig);
  const body = response.data;
  if (body && typeof body === 'object' && 'data' in body && ('statusCode' in body || 'message' in body)) {
    return body.data as T;
  }
  return body as T;
}

/**
 * Standard API Client with typed helper methods.
 */
export const ApiClient = {
  request: async <T>(config: AxiosRequestConfig): Promise<T> => {
    return request<T>(config);
  },

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
