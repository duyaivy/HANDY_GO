import type { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios from 'axios';
import Env from 'env';

import { AppConstants } from '@/constants/app-constants';
import { getToken } from '@/lib/auth/utils';
import { Logger } from '@/services/logger/logger';
import { ApiError } from './api-error';

const baseURL = Env.EXPO_PUBLIC_API_URL || 'https://api.handygo.vn/v1';

export const axiosInstance: AxiosInstance = axios.create({
  baseURL,
  timeout: AppConstants.API_TIMEOUT_MS,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

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

// Response Interceptor: Log response and classify errors
axiosInstance.interceptors.response.use(
  (response: AxiosResponse) => {
    Logger.debug('API_RESPONSE', `${response.status} ${response.config.url}`, response.data);
    return response;
  },
  (error) => {
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
