import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { queryClient as globalQueryClient } from '@/lib/api/query-client';
import { WorkersApi } from '@/services/workers/workers-api';
import { useAuthStore } from '@/stores/use-auth-store';
import {
  fetchWorkerPublicProfile,
  getWorkerPublicProfileQueryKey,
  resolveWorkerProfileViewerScope,
  useWorkerPublicProfile,
  WORKER_PUBLIC_PROFILE_QUERY_KEY,
} from '../use-worker-public-profile';

const initialAuthState = useAuthStore.getState();

describe('useWorkerPublicProfile - Role-Scoped Cache & Logout Cleanup', () => {
  const mockWorkerData = {
    id: 'worker-real-123',
    userId: 'user-real-123',
    fullName: 'Lê Thu Hà',
    phone: '09***78',
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
    useAuthStore.setState({
      ...initialAuthState,
      isAuthenticated: true,
      user: { id: 'cust-1', fullName: 'Khách', role: 'Customer', roles: ['Customer'] } as any,
      activeMode: 'Customer',
    });
  });

  afterEach(() => {
    useAuthStore.setState(initialAuthState, true);
    globalQueryClient.clear();
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
    expect(result.current.data?.phone).toBe('09***78');
    expect(result.current.data?.stats.completedOrderCount).toBe(32);
    expect(WorkersApi.getWorkerPublicProfile).toHaveBeenCalledTimes(1);
    expect(WorkersApi.getWorkerPublicProfile).toHaveBeenCalledWith('worker-real-123');
  });

  it('shares cache between consumers with the same viewer & role, but isolates across roles/viewers', async () => {
    const getProfileSpy = jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValue({
      statusCode: 200,
      data: mockWorkerData as any,
    } as any);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result: consumerA } = renderHook(
      () => useWorkerPublicProfile('worker-real-123'),
      { wrapper },
    );

    await waitFor(() => expect(consumerA.current.isSuccess).toBe(true));
    expect(consumerA.current.data?.phone).toBe('09***78');

    const { result: consumerB } = renderHook(
      () => useWorkerPublicProfile('worker-real-123'),
      { wrapper },
    );

    expect(consumerB.current.data?.phone).toBe('09***78');
    expect(getProfileSpy).toHaveBeenCalledTimes(1);

    const customerScope = resolveWorkerProfileViewerScope(
      { id: 'cust-1', roles: ['Customer'] },
      'Customer',
    );
    const cachedData = queryClient.getQueryData(
      getWorkerPublicProfileQueryKey('worker-real-123', customerScope),
    );
    expect(cachedData).toEqual(mockWorkerData);

    // Switch viewer to Admin -> must NOT reuse Customer cache entry
    getProfileSpy.mockResolvedValueOnce({
      statusCode: 200,
      data: { ...mockWorkerData, phone: '+84912345678' } as any,
    } as any);
    useAuthStore.setState({
      isAuthenticated: true,
      user: { id: 'admin-1', fullName: 'Admin', role: 'Admin', roles: ['Admin'] } as any,
      activeMode: null,
    });

    const { result: adminConsumer } = renderHook(
      () => useWorkerPublicProfile('worker-real-123'),
      { wrapper },
    );
    await waitFor(() => expect(adminConsumer.current.isSuccess).toBe(true));
    expect(adminConsumer.current.data?.phone).toBe('+84912345678');
    expect(getProfileSpy).toHaveBeenCalledTimes(2);
  });

  it('cancels and removes worker-public-profile cache on logout', async () => {
    const cancelSpy = jest.spyOn(globalQueryClient, 'cancelQueries');
    const removeSpy = jest.spyOn(globalQueryClient, 'removeQueries');
    globalQueryClient.setQueryData(
      getWorkerPublicProfileQueryKey('worker-real-123', 'admin-1:admin:'),
      { ...mockWorkerData, phone: '+84912345678' },
    );

    await useAuthStore.getState().logout();

    expect(cancelSpy).toHaveBeenCalledWith({ queryKey: [WORKER_PUBLIC_PROFILE_QUERY_KEY] });
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: [WORKER_PUBLIC_PROFILE_QUERY_KEY] });
    expect(
      globalQueryClient.getQueryData(
        getWorkerPublicProfileQueryKey('worker-real-123', 'admin-1:admin:'),
      ),
    ).toBeUndefined();
  });

  it('fetchWorkerPublicProfile helper unwraps data correctly', async () => {
    jest.spyOn(WorkersApi, 'getWorkerPublicProfile').mockResolvedValueOnce({
      statusCode: 200,
      data: mockWorkerData as any,
    } as any);

    const unwrapped = await fetchWorkerPublicProfile('worker-real-123');
    expect(unwrapped).toEqual(mockWorkerData);
    expect(unwrapped.phone).toBe('09***78');
  });
});
