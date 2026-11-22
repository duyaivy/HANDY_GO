import type { Order, ServiceRequest } from '../types/order.types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { OrdersApi } from '../api/orders.api';
import { ordersQueryKeys } from './orders-query-keys';

export type CustomerOrderHistoryTab = 'all' | 'completed' | 'cancelled';

function extractItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object') {
    if ('items' in data && Array.isArray((data as { items: unknown }).items)) {
      return (data as { items: T[] }).items;
    }
    if ('data' in data && (data as { data: unknown }).data) {
      const nested = (data as { data: unknown }).data;
      if (Array.isArray(nested)) {
        return nested;
      }
      if (
        nested
        && typeof nested === 'object'
        && 'items' in nested
        && Array.isArray((nested as { items: unknown }).items)
      ) {
        return (nested as { items: T[] }).items;
      }
    }
  }
  return [];
}

function getNextPageFromResponse(lastPage: unknown): number | undefined {
  if (!lastPage || typeof lastPage !== 'object') {
    return undefined;
  }
  const meta: any
    = 'items' in lastPage
      ? lastPage
      : 'data' in lastPage
        && lastPage.data
        && typeof lastPage.data === 'object'
        && 'items' in (lastPage.data as any)
        ? (lastPage as any).data
        : null;

  if (!meta || typeof meta.page !== 'number' || typeof meta.totalPages !== 'number') {
    return undefined;
  }
  return meta.page < meta.totalPages ? meta.page + 1 : undefined;
}

export function useCustomerOrderHistory(
  activeTab: CustomerOrderHistoryTab = 'all',
  searchQuery = '',
) {
  const trimmedSearch = searchQuery.trim();

  // Status filters for server-side query
  const ordersStatusFilter
    = activeTab === 'completed'
      ? 'completed'
      : activeTab === 'cancelled'
        ? 'cancelled,disputed'
        : 'completed,cancelled,disputed';

  const requestsStatusFilter
    = activeTab === 'completed'
      ? null
      : 'cancelled,expired';

  // 1. Paginated Orders Query (server filters status, customer role, and optional search)
  const ordersQuery = useInfiniteQuery({
    queryKey: ordersQueryKeys.customerHistory({
      tab: activeTab,
      status: ordersStatusFilter,
      search: trimmedSearch,
    }),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await OrdersApi.getMyOrders({
        page: pageParam,
        limit: 10,
        status: ordersStatusFilter,
        role: 'customer',
        search: trimmedSearch || undefined,
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: getNextPageFromResponse,
    staleTime: 30000,
  });

  // 2. Paginated Requests Query (cancelled or expired requests for 'all' and 'cancelled' tabs)
  const requestsQuery = useInfiniteQuery({
    queryKey: ordersQueryKeys.customerRequests({
      tab: `history-${activeTab}`,
      status: requestsStatusFilter ?? '',
    }),
    queryFn: async ({ pageParam = 1 }) => {
      if (!requestsStatusFilter) {
        return [];
      }
      const res = await OrdersApi.getMyRequests({
        page: pageParam,
        limit: 10,
        status: requestsStatusFilter,
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: getNextPageFromResponse,
    enabled: requestsStatusFilter !== null,
    staleTime: 30000,
  });

  // 3. High-level Summary Query (role: 'customer') for stable stats across tabs
  const summaryQuery = useQuery({
    queryKey: ordersQueryKeys.orderSummary({ role: 'customer' }),
    queryFn: async () => {
      const res = await OrdersApi.getOrderSummary({ role: 'customer' });
      return res.data;
    },
    staleTime: 30000,
  });

  const orders: Order[] = React.useMemo(() => {
    if (!ordersQuery.data?.pages) {
      return [];
    }
    const all = ordersQuery.data.pages.flatMap(p => extractItems<Order>(p));
    // Exclude active orders just in case
    return all.filter(o => o.status === 'completed' || o.status === 'cancelled' || o.status === 'disputed');
  }, [ordersQuery.data]);

  const requests: ServiceRequest[] = React.useMemo(() => {
    if (!requestsQuery.data?.pages || requestsStatusFilter === null) {
      return [];
    }
    const all = requestsQuery.data.pages.flatMap(p => extractItems<ServiceRequest>(p));
    return all.filter(r => r.status === 'cancelled' || r.status === 'expired');
  }, [requestsQuery.data, requestsStatusFilter]);

  const totalCompletedCount
    = summaryQuery.data?.completedCount
      ?? orders.filter(o => o.status === 'completed').length;

  return {
    orders,
    requests,
    totalCompletedCount,
    isLoading: ordersQuery.isLoading || (requestsStatusFilter !== null && requestsQuery.isLoading),
    isRefetching: ordersQuery.isRefetching || (requestsStatusFilter !== null && requestsQuery.isRefetching),
    isError: ordersQuery.isError || (requestsStatusFilter !== null && requestsQuery.isError),
    refetch: async () => {
      await Promise.all([
        ordersQuery.refetch(),
        requestsStatusFilter !== null ? requestsQuery.refetch() : Promise.resolve(),
        summaryQuery.refetch(),
      ]);
    },
    hasNextPage: Boolean(ordersQuery.hasNextPage),
    isFetchingNextPage: Boolean(ordersQuery.isFetchingNextPage),
    fetchNextPage: () => {
      if (ordersQuery.hasNextPage && !ordersQuery.isFetchingNextPage) {
        ordersQuery.fetchNextPage();
      }
    },
  };
}
