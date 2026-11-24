import type { Order } from '../types/order.types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import { OrdersApi } from '../api/orders.api';
import { ordersQueryKeys } from './orders-query-keys';

export type WorkerJobHistoryTab = 'all' | 'completed' | 'cancelled';

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

export function useWorkerJobHistory(
  activeTab: WorkerJobHistoryTab = 'all',
  searchQuery = '',
) {
  const trimmedSearch = searchQuery.trim();
  const statusFilter
    = activeTab === 'completed'
      ? 'completed'
      : activeTab === 'cancelled'
        ? 'cancelled'
        : 'completed,cancelled';

  const query = useInfiniteQuery({
    queryKey: ordersQueryKeys.workerHistory({
      tab: activeTab,
      status: statusFilter,
      search: trimmedSearch,
    }),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await OrdersApi.getMyOrders({
        page: pageParam,
        limit: 10,
        status: statusFilter,
        role: 'worker',
        search: trimmedSearch || undefined,
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: getNextPageFromResponse,
    staleTime: 30000,
  });

  const summaryQuery = useQuery({
    queryKey: ordersQueryKeys.orderSummary({ role: 'worker' }),
    queryFn: async () => {
      const res = await OrdersApi.getOrderSummary({ role: 'worker' });
      return res.data;
    },
    staleTime: 30000,
  });

  const orders: Order[] = React.useMemo(() => {
    if (!query.data?.pages) {
      return [];
    }
    const all = query.data.pages.flatMap(p => extractItems<Order>(p));
    // Filter out active states and disputed from history list
    return all.filter(o => o.status === 'completed' || o.status === 'cancelled');
  }, [query.data]);

  const isStatsLoading = summaryQuery.isLoading;
  const isStatsError = summaryQuery.isError;

  // Quick stats: independent of active tab and pagination
  const stats = React.useMemo(() => {
    if (summaryQuery.isSuccess && summaryQuery.data != null) {
      return {
        completedCount: summaryQuery.data.completedCount ?? 0,
        cancelledCount: summaryQuery.data.cancelledCount ?? 0,
        totalEarnings: summaryQuery.data.totalCompletedAmount ?? 0,
      };
    }
    return {
      completedCount: null,
      cancelledCount: null,
      totalEarnings: null,
    };
  }, [summaryQuery.isSuccess, summaryQuery.data]);

  return {
    orders,
    stats,
    isStatsLoading,
    isStatsError,
    isLoading: query.isLoading,
    isError: query.isError,
    isRefetching: query.isRefetching,
    refetch: async () => {
      await Promise.all([query.refetch(), summaryQuery.refetch()]);
    },
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: Boolean(query.isFetchingNextPage),
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        return query.fetchNextPage();
      }
    },
  };
}
