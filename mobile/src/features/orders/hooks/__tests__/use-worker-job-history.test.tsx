import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { OrdersApi } from '../../api/orders.api';
import { useWorkerJobHistory } from '../use-worker-job-history';

jest.mock('../../api/orders.api', () => ({
  OrdersApi: {
    getMyOrders: jest.fn(),
    getOrderSummary: jest.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

describe('useWorkerJobHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queries strictly status=cancelled (without disputed) on "cancelled" tab (HG-72 P2)', async () => {
    (OrdersApi.getMyOrders as jest.Mock).mockResolvedValue({
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    (OrdersApi.getOrderSummary as jest.Mock).mockResolvedValue({
      data: { completedCount: 10, cancelledCount: 3, totalCompletedAmount: 2500000 },
    });

    const { result } = renderHook(() => useWorkerJobHistory('cancelled', ''), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Orders status filter must be strictly 'cancelled'
    expect(OrdersApi.getMyOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled',
        role: 'worker',
      }),
    );
  });

  it('passes search query to worker orders query (HG-72 P2)', async () => {
    (OrdersApi.getMyOrders as jest.Mock).mockResolvedValue({
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    (OrdersApi.getOrderSummary as jest.Mock).mockResolvedValue({
      data: { completedCount: 0, cancelledCount: 0, totalCompletedAmount: 0 },
    });

    const { result } = renderHook(() => useWorkerJobHistory('all', 'điều hòa'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(OrdersApi.getMyOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'điều hòa',
        role: 'worker',
      }),
    );
  });

  it('returns null values in stats when summary fails instead of partially counting loaded orders (HG-72 P2)', async () => {
    const loadedOrders = [
      {
        id: 'job-1',
        orderCode: 'JOB-01',
        status: 'completed',
        agreedPrice: 500000,
        createdAt: '2026-11-20T10:00:00.000Z',
      },
    ];

    (OrdersApi.getMyOrders as jest.Mock).mockResolvedValue({
      data: { items: loadedOrders, page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    // Summary endpoint returns 500
    (OrdersApi.getOrderSummary as jest.Mock).mockRejectedValue(new Error('Internal Server Error 500'));

    const { result } = renderHook(() => useWorkerJobHistory('all', ''), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.orders).toHaveLength(1);
    // Stats must have null values and flag error, NOT fallback to 500.000 / 1 việc
    expect(result.current.stats.completedCount).toBeNull();
    expect(result.current.stats.cancelledCount).toBeNull();
    expect(result.current.stats.totalEarnings).toBeNull();
    expect(result.current.isStatsError).toBe(true);
  });
});
