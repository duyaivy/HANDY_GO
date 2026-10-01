/* eslint-disable max-lines-per-function */
import axios from 'axios';
import { getToken, removeToken, setToken } from '@/lib/auth/utils';
import { ApiClient, axiosInstance, setOnUnauthorizedCallback } from '../api-client';

jest.mock('axios', () => {
  const original = jest.requireActual('axios');
  return {
    ...original,
    post: jest.fn(),
  };
});

describe('apiClient 401 refresh flow', () => {
  const mockOnUnauthorized = jest.fn();
  const originalAdapter = axiosInstance.defaults.adapter;

  beforeEach(async () => {
    jest.clearAllMocks();
    await setToken({ access: 'old-access-token', refresh: 'valid-refresh-token' });
    setOnUnauthorizedCallback(mockOnUnauthorized);
  });

  afterEach(async () => {
    await removeToken();
    setOnUnauthorizedCallback(null);
    axiosInstance.defaults.adapter = originalAdapter;
  });

  it('rotates tokens and retries request once when receiving 401', async () => {
    let callCount = 0;
    axiosInstance.defaults.adapter = async (config: any) => {
      callCount++;
      if (callCount === 1) {
        const error: any = new Error('Request failed with status code 401');
        error.isAxiosError = true;
        error.response = {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
          data: { message: 'Token expired' },
        };
        error.config = config;
        throw error;
      }

      return {
        data: { success: true, authHeader: config.headers?.Authorization },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    (axios.post as jest.Mock).mockResolvedValueOnce({
      status: 200,
      data: {
        statusCode: 200,
        data: {
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
        },
      },
    });

    const result = await ApiClient.get<any>('/users/me');

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      { refreshToken: 'valid-refresh-token' },
      expect.any(Object),
    );

    const savedTokens = getToken();
    expect(savedTokens?.access).toBe('new-access-token');
    expect(savedTokens?.refresh).toBe('new-refresh-token');
    expect(result.success).toBe(true);
    expect(result.authHeader).toBe('Bearer new-access-token');
  });

  it('merges concurrent 401 requests into a single refresh request', async () => {
    const attempts = new Map<string, number>();

    (axios.post as jest.Mock).mockImplementation(async () => {
      await new Promise(res => setTimeout(res, 20));
      return {
        status: 200,
        data: {
          statusCode: 200,
          data: {
            accessToken: 'shared-new-access',
            refreshToken: 'shared-new-refresh',
          },
        },
      };
    });

    axiosInstance.defaults.adapter = async (config: any) => {
      const url = config.url;
      const count = (attempts.get(url) || 0) + 1;
      attempts.set(url, count);

      if (count === 1) {
        const error: any = new Error('401');
        error.isAxiosError = true;
        error.response = {
          status: 401,
          statusText: 'Unauthorized',
          headers: {},
          config,
          data: { message: 'Expired' },
        };
        error.config = config;
        throw error;
      }

      return {
        data: { url, authHeader: config.headers?.Authorization },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };

    const [res1, res2] = await Promise.all([
      ApiClient.get<any>('/resource-1'),
      ApiClient.get<any>('/resource-2'),
    ]);

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(res1.authHeader).toBe('Bearer shared-new-access');
    expect(res2.authHeader).toBe('Bearer shared-new-access');
  });

  it('wipes tokens and triggers unauthorized callback when refresh fails', async () => {
    axiosInstance.defaults.adapter = async (config: any) => {
      const error: any = new Error('401');
      error.isAxiosError = true;
      error.response = {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: { message: 'Unauthorized' },
      };
      error.config = config;
      throw error;
    };

    (axios.post as jest.Mock).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401, data: { message: 'Refresh token revoked' } },
    });

    await expect(ApiClient.get('/protected')).rejects.toThrow();

    expect(getToken()).toBeNull();
    expect(mockOnUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not attempt to refresh when /auth/refresh itself returns 401', async () => {
    axiosInstance.defaults.adapter = async (config: any) => {
      const error: any = new Error('401');
      error.isAxiosError = true;
      error.response = {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: { message: 'Refresh invalid' },
      };
      error.config = config;
      throw error;
    };

    await expect(ApiClient.post('/auth/refresh', { refreshToken: 'bad' })).rejects.toThrow();

    expect(axios.post).not.toHaveBeenCalled();
    expect(getToken()).toBeNull();
    expect(mockOnUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('wipes tokens and triggers unauthorized callback when refresh returns 400 validation error', async () => {
    axiosInstance.defaults.adapter = async (config: any) => {
      const error: any = new Error('401');
      error.isAxiosError = true;
      error.response = {
        status: 401,
        statusText: 'Unauthorized',
        headers: {},
        config,
        data: { message: 'Unauthorized' },
      };
      error.config = config;
      throw error;
    };

    (axios.post as jest.Mock).mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu yêu cầu không hợp lệ',
          fieldErrors: { refreshToken: ['Refresh token không đúng định dạng JWT'] },
        },
      },
    });

    await expect(ApiClient.get('/protected')).rejects.toThrow();

    expect(getToken()).toBeNull();
    expect(mockOnUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('wipes tokens when direct /auth/refresh returns 400 validation error', async () => {
    axiosInstance.defaults.adapter = async (config: any) => {
      const error: any = new Error('400');
      error.isAxiosError = true;
      error.response = {
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        config,
        data: {
          code: 'VALIDATION_ERROR',
          message: 'Dữ liệu yêu cầu không hợp lệ',
        },
      };
      error.config = config;
      throw error;
    };

    await expect(ApiClient.post('/auth/refresh', { refreshToken: 'invalid-hex' })).rejects.toThrow();

    expect(getToken()).toBeNull();
    expect(mockOnUnauthorized).toHaveBeenCalledTimes(1);
  });
});
