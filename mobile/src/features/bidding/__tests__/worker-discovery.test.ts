import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { WorkerDiscoveryApi } from '../api/worker-discovery.api';
import { useWorkerDiscovery } from '../hooks/use-worker-discovery';

// Mock ApiClient
jest.mock('@/services/api/api-client', () => ({
  ApiClient: {
    get: jest.fn(),
  },
}));

const mockJobsResponse = {
  items: [
    {
      id: 'req-job-1',
      requestCode: 'REQ-20261028-A1B2',
      serviceId: 'srv-1',
      serviceName: 'Sửa van nước',
      categoryName: 'Điện nước',
      description: 'Sửa rò rỉ van nước',
      distanceKm: 2.4,
      scheduledAt: '2026-10-29T08:00:00.000Z',
      addressText: '123 Hải Phòng, Hải Châu, Đà Nẵng',
      createdAt: '2026-10-28T07:00:00.000Z',
    },
    {
      id: 'req-job-2',
      requestCode: 'REQ-20261028-C3D4',
      serviceId: 'srv-2',
      serviceName: 'Lắp quạt trần',
      categoryName: 'Điện gia dụng',
      description: 'Lắp quạt trần',
      distanceKm: 4.1,
      scheduledAt: '2026-10-29T14:00:00.000Z',
      addressText: '456 Lê Duẩn, Thanh Khê, Đà Nẵng',
      createdAt: '2026-10-28T08:00:00.000Z',
    },
  ],
  total: 12,
  page: 1,
  limit: 10,
};

describe('Worker Discovery Feed & Hook Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  describe('WorkerDiscoveryApi', () => {
    it('calls GET /api/v1/matching/me/requests with pagination', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.get.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: mockJobsResponse,
      });

      const res = await WorkerDiscoveryApi.getDiscoverableRequestsData({ page: 2, limit: 5 });

      expect(ApiClient.get).toHaveBeenCalledWith('/matching/me/requests', {
        params: { page: 2, limit: 5 },
        signal: undefined,
      });
      expect(res.items.length).toBe(2);
      expect(res.total).toBe(12);
    });
  });

  describe('useWorkerDiscovery hook', () => {
    it('fetches discoverable jobs with Haversine distance, schedule, address, category, and calculates totalPages', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.get.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: mockJobsResponse,
      });

      const { result } = renderHook(() => useWorkerDiscovery({ page: 1, limit: 10 }), {
        wrapper,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.jobs.length).toBe(2);
      const firstJob = result.current.jobs[0];
      expect(firstJob.requestCode).toBe('REQ-20261028-A1B2');
      expect(firstJob.distanceKm).toBe(2.4);
      expect(firstJob.scheduledAt).toBe('2026-10-29T08:00:00.000Z');
      expect(firstJob.addressText).toBe('123 Hải Phòng, Hải Châu, Đà Nẵng');
      expect(firstJob.serviceName).toBe('Sửa van nước');
      expect(firstJob.categoryName).toBe('Điện nước');
      expect(result.current.total).toBe(12);
      expect(result.current.page).toBe(1);
      expect(result.current.totalPages).toBe(2); // 12 / 10 rounded up = 2
    });

    it('handles empty response gracefully', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.get.mockResolvedValueOnce({
        statusCode: 200,
        message: 'Success',
        data: { items: [], total: 0, page: 1, limit: 10 },
      });

      const { result } = renderHook(() => useWorkerDiscovery(), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.jobs).toEqual([]);
      expect(result.current.total).toBe(0);
      expect(result.current.totalPages).toBe(0);
    });

    it('handles query error state', async () => {
      const { ApiClient } = require('@/services/api/api-client');
      ApiClient.get.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useWorkerDiscovery(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(result.current.error?.message).toBe('Network error');
      expect(result.current.jobs).toEqual([]);
    });
  });
});
