/* eslint-disable max-lines-per-function */
import type { Order, ServiceRequest } from '../types/order.types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { OrdersApi } from '../api/orders.api';
import { ordersQueryKeys } from './orders-query-keys';

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
      if (nested && typeof nested === 'object' && 'items' in nested && Array.isArray((nested as { items: unknown }).items)) {
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
  const meta: any = 'items' in lastPage
    ? lastPage
    : 'data' in lastPage && lastPage.data && typeof lastPage.data === 'object' && 'items' in (lastPage.data as any)
      ? (lastPage as any).data
      : null;

  if (!meta || typeof meta.page !== 'number' || typeof meta.totalPages !== 'number') {
    return undefined;
  }
  return meta.page < meta.totalPages ? meta.page + 1 : undefined;
}

export function useCustomerOrders(activeTab = 'Searching') {
  const isSearchingTab = activeTab === 'Searching';
  const isCancelledTab = activeTab === 'Cancelled';
  const isFinishedTab = activeTab === 'Finished' || activeTab === 'Reorder';
  const isInProcessTab = activeTab === 'In process';

  // Server status filter per tab
  const requestsStatusFilter = isSearchingTab
    ? 'open_for_bidding,draft,bidding_closed'
    : isCancelledTab
      ? 'cancelled,expired'
      : '';

  const ordersStatusFilter = isInProcessTab
    ? 'created,confirmed,in_progress,awaiting_customer_confirmation'
    : isFinishedTab
      ? 'completed'
      : isCancelledTab
        ? 'cancelled,disputed'
        : '';

  const shouldFetchRequests = isSearchingTab || isCancelledTab || activeTab === 'All';
  const shouldFetchOrders = !isSearchingTab;

  // Lấy danh sách Service Requests (phân trang + server filter + infinite query)
  const requestsQuery = useInfiniteQuery({
    queryKey: ordersQueryKeys.customerRequests({ tab: activeTab, status: requestsStatusFilter }),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await OrdersApi.getMyRequests({
        page: pageParam,
        limit: 10,
        status: requestsStatusFilter || undefined,
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: getNextPageFromResponse,
    enabled: shouldFetchRequests,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Lấy danh sách Orders (phân trang + server filter + infinite query)
  const ordersQuery = useInfiniteQuery({
    queryKey: ordersQueryKeys.customerOrders({ tab: activeTab, status: ordersStatusFilter }),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await OrdersApi.getMyOrders({
        page: pageParam,
        limit: 10,
        status: ordersStatusFilter || undefined,
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: getNextPageFromResponse,
    enabled: shouldFetchOrders,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const requestsData = requestsQuery.data;
  const requests: ServiceRequest[] = React.useMemo(() => {
    if (!shouldFetchRequests || !requestsData?.pages) {
      return [];
    }
    return requestsData.pages.flatMap(page => extractItems<ServiceRequest>(page));
  }, [shouldFetchRequests, requestsData]);

  const ordersData = ordersQuery.data;
  const orders: Order[] = React.useMemo(() => {
    if (!shouldFetchOrders || !ordersData?.pages) {
      return [];
    }
    return ordersData.pages.flatMap(page => extractItems<Order>(page));
  }, [shouldFetchOrders, ordersData]);

  const isLoading = (shouldFetchRequests && requestsQuery.isLoading)
    || (shouldFetchOrders && ordersQuery.isLoading);

  const isRefetching = requestsQuery.isRefetching || ordersQuery.isRefetching;

  const refetch = async () => {
    const promises: Promise<unknown>[] = [];
    if (shouldFetchRequests) {
      promises.push(requestsQuery.refetch());
    }
    if (shouldFetchOrders) {
      promises.push(ordersQuery.refetch());
    }
    await Promise.all(promises);
  };

  const hasNextPage = Boolean(
    (shouldFetchRequests && requestsQuery.hasNextPage)
    || (shouldFetchOrders && ordersQuery.hasNextPage),
  );

  const isFetchingNextPage = Boolean(
    requestsQuery.isFetchingNextPage || ordersQuery.isFetchingNextPage,
  );

  const fetchNextPage = async () => {
    const promises: Promise<unknown>[] = [];
    if (shouldFetchRequests && requestsQuery.hasNextPage && !requestsQuery.isFetchingNextPage) {
      promises.push(requestsQuery.fetchNextPage());
    }
    if (shouldFetchOrders && ordersQuery.hasNextPage && !ordersQuery.isFetchingNextPage) {
      promises.push(ordersQuery.fetchNextPage());
    }
    await Promise.all(promises);
  };

  return {
    activeTab,
    isSearchingTab,
    isCancelledTab,
    requests,
    orders,

    // Unified states
    isLoading,
    isRefetching,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,

    // Independent request source states (for Cancelled tab)
    requestsLoading: requestsQuery.isLoading,
    requestsRefetching: requestsQuery.isRefetching,
    requestsError: requestsQuery.error,
    isRequestsError: requestsQuery.isError,
    hasNextRequests: Boolean(requestsQuery.hasNextPage),
    isFetchingNextRequests: requestsQuery.isFetchingNextPage,
    fetchNextRequests: () => requestsQuery.fetchNextPage(),
    refetchRequests: () => requestsQuery.refetch(),

    // Independent order source states (for Cancelled tab)
    ordersLoading: ordersQuery.isLoading,
    ordersRefetching: ordersQuery.isRefetching,
    ordersError: ordersQuery.error,
    isOrdersError: ordersQuery.isError,
    hasNextOrders: Boolean(ordersQuery.hasNextPage),
    isFetchingNextOrders: ordersQuery.isFetchingNextPage,
    fetchNextOrders: () => ordersQuery.fetchNextPage(),
    refetchOrders: () => ordersQuery.refetch(),
  };
}

export function useCustomerOrderDetail(orderId?: string) {
  const queryClient = useQueryClient();

  const orderQuery = useQuery({
    queryKey: ordersQueryKeys.orderDetail(orderId ?? ''),
    queryFn: async () => {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      const res = await OrdersApi.getOrderDetail(orderId);
      return res.data;
    },
    enabled: !!orderId && orderId !== '224466' && orderId !== 'demo-001',
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) {
        return false;
      }
      // Tự động kiểm tra cập nhật mỗi 4s khi đơn đang thi công hoặc chờ nghiệm thu
      if (['in_progress', 'awaiting_customer_confirmation'].includes(data.status)) {
        return 4000;
      }
      return false;
    },
  });

  const historyQuery = useQuery({
    queryKey: ordersQueryKeys.orderStatusHistory(orderId ?? ''),
    queryFn: async () => {
      if (!orderId) {
        return [];
      }
      const res = await OrdersApi.getStatusHistory(orderId);
      return res.data;
    },
    enabled: !!orderId && orderId !== '224466' && orderId !== 'demo-001',
  });

  const confirmCompletionMutation = useMutation({
    mutationFn: async () => {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      const res = await OrdersApi.confirmCompletion(orderId);
      return res.data;
    },
    onSuccess: (updatedOrder) => {
      queryClient.setQueryData(ordersQueryKeys.orderDetail(orderId!), updatedOrder);
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    },
  });

  const requestReworkMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      const res = await OrdersApi.requestRework(orderId, reason);
      return res.data;
    },
    onSuccess: (updatedOrder) => {
      queryClient.setQueryData(ordersQueryKeys.orderDetail(orderId!), updatedOrder);
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    },
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async (reason?: string) => {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      const res = await OrdersApi.cancelOrder(orderId, reason);
      return res.data;
    },
    onSuccess: (updatedOrder) => {
      queryClient.setQueryData(ordersQueryKeys.orderDetail(orderId!), updatedOrder);
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    },
  });

  const openDisputeMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      const res = await OrdersApi.openDispute(orderId, reason);
      return res.data;
    },
    onSuccess: (updatedOrder) => {
      queryClient.setQueryData(ordersQueryKeys.orderDetail(orderId!), updatedOrder);
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    },
  });

  return {
    order: orderQuery.data,
    statusHistory: historyQuery.data ?? orderQuery.data?.statusHistory ?? [],
    isLoading: orderQuery.isLoading,
    isRefetching: orderQuery.isRefetching,
    refetch: orderQuery.refetch,
    confirmCompletion: confirmCompletionMutation.mutateAsync,
    isConfirming: confirmCompletionMutation.isPending,
    requestRework: requestReworkMutation.mutateAsync,
    isRequestingRework: requestReworkMutation.isPending,
    cancelOrder: cancelOrderMutation.mutateAsync,
    isCancelling: cancelOrderMutation.isPending,
    openDispute: openDisputeMutation.mutateAsync,
    isDisputing: openDisputeMutation.isPending,
  };
}
