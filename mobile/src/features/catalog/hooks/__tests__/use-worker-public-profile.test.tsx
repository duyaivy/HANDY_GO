import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { WorkersApi } from '@/services/workers/workers-api';
import {
  fetchWorkerPublicProfile,
  getWorkerPublicProfileQueryKey,
  useWorkerPublicProfile,
} from '../use-worker-public-profile';

describe('useWorkerPublicProfile - Shared Cache & Response Shape', () => {
  const mockWorkerData = {
    id: 'worker-real-123',
    userId: 'user-real-123',
    fullName: 'Lê Thu Hà',
    phone: '0912345678',
    avatarUrl: 'https://example.com/avatar.jpg',
    status: 'active',
    isVerified: true,
    stats: {
      averageRating: 4.8,
      ratingCount: 30,
      completedOrderCount: 32,
      orderCountTotal: 35,
      ratingDistribution: { 5: 25, 4: 5, 3: 0, 2: 0, 1: 0 },
    },
    services: [
      {
        id: 's-1',
        serviceId: 'srv-1',
        title: 'Sửa điện',
        experienceYears: 5,
        isActive: true,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('unwraps ApiResponse and returns pure WorkerPublicProfileData shape', async () => {
    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValueOnce({
      statusCode: 200,
      data: mockWorkerData as any,
    } as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () => useWorkerPublicProfile('worker-real-123'),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual(mockWorkerData);
    expect(result.current.data?.phone).toBe('0912345678');
    expect(result.current.data?.stats.completedOrderCount).toBe(32);
    expect(WorkersApi.getWorkerPublicProfile).toHaveBeenCalledTimes(1);
    expect(WorkersApi.getWorkerPublicProfile).toHaveBeenCalledWith('worker-real-123');
  });

  it('shares cache between multiple consumers regardless of mount order', async () => {
    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      data: mockWorkerData as any,
    } as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    // Consumer A mounts first (e.g. OrderWorkerCard or Radar)
    const { result: consumerA } = renderHook(
      () => useWorkerPublicProfile('worker-real-123'),
      { wrapper },
    );

    await waitFor(() => expect(consumerA.current.isSuccess).toBe(true));
    expect(consumerA.current.data?.phone).toBe('0912345678');

    // Consumer B mounts later (e.g. WorkerDetailScreen)
    const { result: consumerB } = renderHook(
      () => useWorkerPublicProfile('worker-real-123'),
      { wrapper },
    );

    // Consumer B instantly receives data from shared cache without re-fetching
    expect(consumerB.current.data?.phone).toBe('0912345678');
    expect(consumerB.current.data?.stats.completedOrderCount).toBe(32);
    expect(consumerB.current.data?.fullName).toBe('Lê Thu Hà');
    // API is only called once
    expect(WorkersApi.getWorkerPublicProfile).toHaveBeenCalledTimes(1);

    // Verify cache shape directly in query client
    const cachedData = queryClient.getQueryData(getWorkerPublicProfileQueryKey('worker-real-123'));
    expect(cachedData).toEqual(mockWorkerData);
    expect((cachedData as any).data).toBeUndefined(); // Must NOT be nested inside an extra envelope
  });

  it('fetchWorkerPublicProfile helper unwraps data correctly', async () => {
    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValueOnce({
      statusCode: 200,
      data: mockWorkerData as any,
    } as any);

    const unwrapped = await fetchWorkerPublicProfile('worker-real-123');
    expect(unwrapped).toEqual(mockWorkerData);
    expect(unwrapped.phone).toBe('0912345678');
  });
});
