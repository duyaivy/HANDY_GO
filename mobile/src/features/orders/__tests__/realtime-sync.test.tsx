import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import { OrdersApi } from '../api/orders.api';
import { useCustomerOrderDetail, useCustomerOrders } from '../hooks/use-customer-orders';
import { useWorkerJobs } from '../hooks/use-worker-jobs';

jest.mock('../api/orders.api', () => ({
  OrdersApi: {
    getMyWorkerProposals: jest.fn(),
    getMyOrders: jest.fn(),
    getMyRequests: jest.fn(),
    getOrderDetail: jest.fn(),
    getStatusHistory: jest.fn(),
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

describe('Realtime Sync Configuration Tests', () => {
  let queryClient: QueryClient;
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = createTestQueryClient();
    wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    jest.mocked(OrdersApi.getMyWorkerProposals).mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    } as any);

    jest.mocked(OrdersApi.getMyOrders).mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    } as any);

    jest.mocked(OrdersApi.getMyRequests).mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: { items: [], page: 1, limit: 10, total: 0, totalPages: 1 },
    } as any);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('useWorkerJobs sets refetchInterval and refetchIntervalInBackground on proposals & orders queries', async () => {
    renderHook(() => useWorkerJobs(), { wrapper });

    await waitFor(() => {
      const queries = queryClient.getQueryCache().getAll();
      expect(queries.length).toBeGreaterThanOrEqual(2);

      const proposalQuery = queries.find(q =>
        Array.isArray(q.queryKey) && q.queryKey.includes('proposals')
      );
      expect(proposalQuery).toBeDefined();
      expect(proposalQuery?.options.refetchInterval).toBe(4000);
      expect(proposalQuery?.options.refetchIntervalInBackground).toBe(false);

      const orderQuery = queries.find(q =>
        Array.isArray(q.queryKey) && q.queryKey.includes('worker') && !q.queryKey.includes('proposals')
      );
      expect(orderQuery).toBeDefined();
      expect(orderQuery?.options.refetchInterval).toBe(5000);
      expect(orderQuery?.options.refetchIntervalInBackground).toBe(false);
    });
  });

  it('useCustomerOrders sets refetchInterval on requests and orders queries', async () => {
    renderHook(() => useCustomerOrders('Searching'), { wrapper });

    await waitFor(() => {
      const queries = queryClient.getQueryCache().getAll();
      const requestQuery = queries.find(q =>
        Array.isArray(q.queryKey) && q.queryKey.includes('customer') && q.queryKey.includes('requests')
      );
      expect(requestQuery).toBeDefined();
      expect(requestQuery?.options.refetchInterval).toBe(5000);
      expect(requestQuery?.options.refetchIntervalInBackground).toBe(false);
    });
  });

  it('useCustomerOrderDetail dynamic refetchInterval checks created, in_progress, awaiting_customer_confirmation', async () => {
    jest.mocked(OrdersApi.getOrderDetail).mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: {
        id: 'ord-123',
        orderCode: 'ORD-123',
        status: 'created',
      },
    } as any);

    jest.mocked(OrdersApi.getStatusHistory).mockResolvedValue({
      statusCode: 200,
      message: 'OK',
      data: [],
    } as any);

    renderHook(() => useCustomerOrderDetail('ord-123'), { wrapper });

    await waitFor(() => {
      const queries = queryClient.getQueryCache().getAll();
      const detailQuery = queries.find(q =>
        Array.isArray(q.queryKey) && q.queryKey.includes('detail') && q.queryKey.includes('ord-123')
      );
      expect(detailQuery).toBeDefined();
      expect(typeof detailQuery?.options.refetchInterval).toBe('function');

      const intervalFn = detailQuery?.options.refetchInterval as (query: any) => number | false;

      // When status is 'created' -> 3000
      expect(intervalFn({ state: { data: { status: 'created' } } })).toBe(3000);
      // When status is 'in_progress' -> 3000
      expect(intervalFn({ state: { data: { status: 'in_progress' } } })).toBe(3000);
      // When status is 'awaiting_customer_confirmation' -> 3000
      expect(intervalFn({ state: { data: { status: 'awaiting_customer_confirmation' } } })).toBe(3000);
      // When status is 'completed' -> false
      expect(intervalFn({ state: { data: { status: 'completed' } } })).toBe(false);
      // When status is 'cancelled' -> false
      expect(intervalFn({ state: { data: { status: 'cancelled' } } })).toBe(false);
    });
  });
});
