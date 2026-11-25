import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { OrdersApi } from '../../api/orders.api';
import { useCustomerOrderHistory } from '../use-customer-order-history';

jest.mock('../../api/orders.api', () => ({
  OrdersApi: {
    getMyOrders: jest.fn(),
    getMyRequests: jest.fn(),
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

describe('useCustomerOrderHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('combines pagination so hasNextPage is true and fetchNextPage fetches requests when requests > 10 and orders = 0 (HG-72 P1)', async () => {
    (OrdersApi.getMyOrders as jest.Mock).mockResolvedValue({
      data: {
        items: [],
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1,
      },
    });

    const requestsPage1 = Array.from({ length: 10 }).map((_, i) => ({
      id: `req-${i + 1}`,
      requestCode: `REQ-${i + 1}`,
      status: 'cancelled',
      createdAt: '2026-11-20T10:00:00.000Z',
    }));

    const requestsPage2 = Array.from({ length: 5 }).map((_, i) => ({
      id: `req-${i + 11}`,
      requestCode: `REQ-${i + 11}`,
      status: 'expired',
      createdAt: '2026-11-19T10:00:00.000Z',
    }));

    (OrdersApi.getMyRequests as jest.Mock).mockImplementation(async (params?: Record<string, unknown>) => {
      if (params?.page === 2) {
        return {
          data: {
            items: requestsPage2,
            page: 2,
            limit: 10,
            total: 15,
            totalPages: 2,
          },
        };
      }
      return {
        data: {
          items: requestsPage1,
          page: 1,
          limit: 10,
          total: 15,
          totalPages: 2,
        },
      };
    });

    (OrdersApi.getOrderSummary as jest.Mock).mockResolvedValue({
      data: {
        completedCount: 0,
        cancelledCount: 15,
        totalCompletedAmount: 0,
      },
    });

    const { result } = renderHook(() => useCustomerOrderHistory('all', ''), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Orders has 0 items and no next page, but requests has page 2
    expect(result.current.requests).toHaveLength(10);
    expect(result.current.hasNextPage).toBe(true);
    expect(result.current.hasNextRequestsPage).toBe(true);
    expect(result.current.hasNextOrdersPage).toBe(false);

    // Call fetchNextPage -> should trigger requests page 2
    result.current.fetchNextPage();

    await waitFor(() => {
      expect(result.current.requests).toHaveLength(15);
    });
    expect(OrdersApi.getMyRequests).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2 }),
    );
  });

  it('passes search query to both orders and requests server queries across pages (HG-72 P2)', async () => {
    (OrdersApi.getMyOrders as jest.Mock).mockResolvedValue({
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    (OrdersApi.getMyRequests as jest.Mock).mockResolvedValue({
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    (OrdersApi.getOrderSummary as jest.Mock).mockResolvedValue({
      data: { completedCount: 0, cancelledCount: 0, totalCompletedAmount: 0 },
    });

    const { result } = renderHook(() => useCustomerOrderHistory('all', 'sửa vòi nước'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(OrdersApi.getMyOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'sửa vòi nước',
        role: 'customer',
      }),
    );
    expect(OrdersApi.getMyRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        search: 'sửa vòi nước',
      }),
    );
  });

  it('queries strictly status=cancelled (without disputed) on "cancelled" tab (HG-72 P2)', async () => {
    (OrdersApi.getMyOrders as jest.Mock).mockResolvedValue({
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    (OrdersApi.getMyRequests as jest.Mock).mockResolvedValue({
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    (OrdersApi.getOrderSummary as jest.Mock).mockResolvedValue({
      data: { completedCount: 5, cancelledCount: 2, totalCompletedAmount: 1000000 },
    });

    const { result } = renderHook(() => useCustomerOrderHistory('cancelled', ''), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Orders status filter must be strictly 'cancelled'
    expect(OrdersApi.getMyOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled',
      }),
    );
    // Requests filter remains 'cancelled,expired'
    expect(OrdersApi.getMyRequests).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'cancelled,expired',
      }),
    );
  });

  it('returns null for totalCompletedCount when summary fails instead of partially counting loaded orders (HG-72 P2)', async () => {
    const loadedOrders = [
      {
        id: 'ord-1',
        orderCode: 'HDG-01',
        status: 'completed',
        agreedPrice: 200000,
        createdAt: '2026-11-20T10:00:00.000Z',
      },
      {
        id: 'ord-2',
        orderCode: 'HDG-02',
        status: 'completed',
        agreedPrice: 300000,
        createdAt: '2026-11-20T11:00:00.000Z',
      },
    ];

    (OrdersApi.getMyOrders as jest.Mock).mockResolvedValue({
      data: { items: loadedOrders, page: 1, limit: 10, total: 2, totalPages: 1 },
    });
    (OrdersApi.getMyRequests as jest.Mock).mockResolvedValue({
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    // Summary endpoint returns 500
    (OrdersApi.getOrderSummary as jest.Mock).mockRejectedValue(new Error('Internal Server Error 500'));

    const { result } = renderHook(() => useCustomerOrderHistory('all', ''), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.orders).toHaveLength(2);
    // Must be null and flag error, NOT fallback to 2
    expect(result.current.totalCompletedCount).toBeNull();
    expect(result.current.isStatsError).toBe(true);
  });
});
