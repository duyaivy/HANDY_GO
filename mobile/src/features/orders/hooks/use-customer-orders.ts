import type { Order, ServiceRequest } from '../types/order.types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OrdersApi } from '../api/orders.api';
import { ordersQueryKeys } from './orders-query-keys';

function extractItems<T>(data: unknown): T[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && 'items' in data && Array.isArray((data as { items: unknown }).items)) {
    return (data as { items: T[] }).items;
  }
  return [];
}

export function useCustomerOrders(activeTab = 'Searching') {
  const isSearchingTab = activeTab === 'Searching';
  const isCancelledTab = activeTab === 'Cancelled';

  // Lấy danh sách Service Requests (Searching, Cancelled)
  const shouldFetchRequests = isSearchingTab || isCancelledTab;
  const requestsQuery = useQuery({
    queryKey: ordersQueryKeys.customerRequests(),
    queryFn: async () => {
      const res = await OrdersApi.getMyRequests();
      return res.data;
    },
    enabled: shouldFetchRequests,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Lấy danh sách Orders (In process, Finished, Cancelled, All, Reorder)
  const shouldFetchOrders = !isSearchingTab;
  const ordersQuery = useQuery({
    queryKey: ordersQueryKeys.customerOrders(activeTab),
    queryFn: async () => {
      const res = await OrdersApi.getMyOrders();
      return res.data;
    },
    enabled: shouldFetchOrders,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const filterOrders = (orders: Order[]) => {
    if (!Array.isArray(orders)) {
      return [];
    }
    switch (activeTab) {
      case 'In process':
        return orders.filter(o =>
          ['created', 'confirmed', 'in_progress', 'awaiting_customer_confirmation'].includes(
            o.status,
          ),
        );
      case 'Finished':
      case 'Reorder':
        return orders.filter(o => o.status === 'completed');
      case 'Cancelled':
        return orders.filter(o => ['cancelled', 'disputed'].includes(o.status));
      case 'All':
      default:
        return orders;
    }
  };

  const filterRequests = (reqs: ServiceRequest[]) => {
    if (!Array.isArray(reqs)) {
      return [];
    }
    switch (activeTab) {
      case 'Searching':
        return reqs.filter(r =>
          ['open_for_bidding', 'draft', 'bidding_closed'].includes(r.status),
        );
      case 'Cancelled':
        return reqs.filter(r => ['cancelled', 'expired'].includes(r.status));
      default:
        return [];
    }
  };

  const rawRequests = extractItems<ServiceRequest>(requestsQuery.data);
  const requests: ServiceRequest[] = shouldFetchRequests
    ? filterRequests(rawRequests)
    : [];

  const rawOrders = extractItems<Order>(ordersQuery.data);
  const orders: Order[] = shouldFetchOrders
    ? filterOrders(rawOrders)
    : [];

  const isLoading = (shouldFetchRequests && requestsQuery.isLoading)
    || (shouldFetchOrders && ordersQuery.isLoading);

  const isRefetching = requestsQuery.isRefetching || ordersQuery.isRefetching;

  const refetch = async () => {
    if (shouldFetchRequests) {
      await requestsQuery.refetch();
    }
    if (shouldFetchOrders) {
      await ordersQuery.refetch();
    }
  };

  return {
    activeTab,
    isSearchingTab,
    requests,
    orders,
    isLoading,
    isRefetching,
    refetch,
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
