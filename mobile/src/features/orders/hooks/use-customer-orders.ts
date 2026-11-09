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
  const isFinishedTab = activeTab === 'Finished';
  const isInProcessTab = activeTab === 'In process';
  const isDisputedTab = activeTab === 'Disputed';

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
      : isDisputedTab
        ? 'disputed'
        : isCancelledTab
          ? 'cancelled'
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
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
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
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
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
    isDisputedTab,
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
        return 3000;
      }
      if (data.status === 'disputed') {
        return 8000;
      }
      if (!['completed', 'cancelled', 'expired'].includes(data.status)) {
        return 3000;
      }
      return false;
    },
    refetchIntervalInBackground: false,
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
    refetchInterval: () => {
      const order = orderQuery.data;
      if (order?.status === 'disputed') {
        return 8000;
      }
      if (order && !['completed', 'cancelled', 'expired'].includes(order.status)) {
        return 3000;
      }
      return false;
    },
    refetchIntervalInBackground: false,
  });

  const workerProfileQuery = useQuery({
    queryKey: ['order-worker-profile', orderQuery.data?.workerUserId, (orderQuery.data as any)?.selectedBidId, orderQuery.data?.serviceRequestId],
    queryFn: async () => {
      const order = orderQuery.data;
      if (!order) {
        return null;
      }

      // 1. Snapshot worker từ Order API nếu có dữ liệu hợp lệ
      const workerSnapshot = (order as any)?.worker;
      if (workerSnapshot?.fullName && typeof workerSnapshot.fullName === 'string' && workerSnapshot.fullName.trim()) {
        return {
          fullName: workerSnapshot.fullName.trim(),
          avatarUrl: workerSnapshot.avatarUrl || undefined,
          rating: typeof workerSnapshot.rating === 'number'
            ? workerSnapshot.rating
            : (typeof workerSnapshot.averageRating === 'number' ? workerSnapshot.averageRating : undefined),
          completedJobsCount: typeof workerSnapshot.completedJobsCount === 'number'
            ? workerSnapshot.completedJobsCount
            : (typeof workerSnapshot.completedOrderCount === 'number' ? workerSnapshot.completedOrderCount : undefined),
          phone: workerSnapshot.phone || workerSnapshot.phoneNumber || undefined,
          headline: workerSnapshot.headline || undefined,
        };
      }

      let profileData: {
        fullName?: string;
        avatarUrl?: string;
        rating?: number;
        completedJobsCount?: number;
        phone?: string;
        headline?: string;
      } | null = null;

      // 2. Lấy hồ sơ trực tiếp theo order.workerUserId qua OrdersApi.getWorkerProfile
      if (order.workerUserId) {
        try {
          const profileRes = await OrdersApi.getWorkerProfile(order.workerUserId);
          const rawProfile = profileRes?.data;
          if (rawProfile?.fullName) {
            profileData = {
              fullName: rawProfile.fullName,
              avatarUrl: rawProfile.avatarUrl || undefined,
              rating: typeof rawProfile.averageRating === 'number'
                ? rawProfile.averageRating
                : (typeof (rawProfile as any).rating === 'number' ? (rawProfile as any).rating : undefined),
              completedJobsCount: typeof rawProfile.completedOrderCount === 'number'
                ? rawProfile.completedOrderCount
                : (typeof (rawProfile as any).completedJobsCount === 'number' ? (rawProfile as any).completedJobsCount : undefined),
              phone: rawProfile.phoneNumber || rawProfile.phone || undefined,
              headline: rawProfile.headline || undefined,
            };
          }
        }
        catch {
          // ignore và chuyển sang các fallback tiếp theo
        }
      }

      // 3. Fallback / Merge: Lấy chi tiết từ selectedBidId nếu có
      const selectedBidId = (order as any)?.selectedBidId;
      if (selectedBidId) {
        try {
          const res = await OrdersApi.getBidDetail(selectedBidId);
          if (res?.data?.workerProfile) {
            const bidWorker = res.data.workerProfile;
            return {
              fullName: profileData?.fullName || bidWorker.fullName,
              avatarUrl: profileData?.avatarUrl || bidWorker.avatarUrl || undefined,
              rating: typeof profileData?.rating === 'number'
                ? profileData.rating
                : (typeof bidWorker.averageRating === 'number' ? bidWorker.averageRating : undefined),
              completedJobsCount: typeof profileData?.completedJobsCount === 'number'
                ? profileData.completedJobsCount
                : (typeof bidWorker.completedOrderCount === 'number' ? bidWorker.completedOrderCount : undefined),
              phone: profileData?.phone || (bidWorker as any)?.phoneNumber || (bidWorker as any)?.phone || undefined,
              headline: profileData?.headline || (bidWorker as any)?.headline || undefined,
            };
          }
        }
        catch {
          // ignore
        }
      }

      // Nếu đã lấy được profile trực tiếp thành công, trả về ngay
      if (profileData?.fullName) {
        return profileData;
      }

      // 4. Fallback: Tìm trong candidates (bidding / recommendations) của serviceRequestId
      if (order.serviceRequestId) {
        try {
          const candRes = await OrdersApi.getCandidates(order.serviceRequestId);
          const biddingItems = candRes?.data?.bidding?.items || [];
          const matchedBid = biddingItems.find(
            (b: any) => b.workerId === order.workerUserId || b.workerUserId === order.workerUserId,
          );
          if (matchedBid?.workerProfile) {
            return {
              fullName: matchedBid.workerProfile.fullName,
              avatarUrl: matchedBid.workerProfile.avatarUrl || undefined,
              rating: typeof matchedBid.workerProfile.averageRating === 'number' ? matchedBid.workerProfile.averageRating : undefined,
              completedJobsCount: typeof matchedBid.workerProfile.completedOrderCount === 'number' ? matchedBid.workerProfile.completedOrderCount : undefined,
              phone: (matchedBid.workerProfile as any)?.phoneNumber || (matchedBid.workerProfile as any)?.phone || undefined,
              headline: (matchedBid.workerProfile as any)?.headline || undefined,
            };
          }

          const recItems = candRes?.data?.matching?.recommendations || [];
          const matchedRec = recItems.find(
            (r: any) => r.workerId === order.workerUserId || r.workerUserId === order.workerUserId,
          );
          if (matchedRec?.workerProfile) {
            return {
              fullName: matchedRec.workerProfile.fullName,
              avatarUrl: matchedRec.workerProfile.avatarUrl || undefined,
              rating: typeof matchedRec.workerProfile.averageRating === 'number' ? matchedRec.workerProfile.averageRating : undefined,
              completedJobsCount: typeof matchedRec.workerProfile.completedOrderCount === 'number' ? matchedRec.workerProfile.completedOrderCount : undefined,
              phone: (matchedRec.workerProfile as any)?.phoneNumber || (matchedRec.workerProfile as any)?.phone || undefined,
              headline: (matchedRec.workerProfile as any)?.headline || undefined,
            };
          }
        }
        catch {
          // ignore and fall back to request bids
        }

        try {
          const res = await OrdersApi.getRequestBids(order.serviceRequestId);
          const rawItems = (res?.data as any)?.items || res?.data || [];
          const items = Array.isArray(rawItems) ? rawItems : [];
          const matched = items.find((b: any) => b.workerId === order.workerUserId || b.workerUserId === order.workerUserId);
          if (matched?.workerProfile) {
            return {
              fullName: matched.workerProfile.fullName,
              avatarUrl: matched.workerProfile.avatarUrl || undefined,
              rating: typeof matched.workerProfile.averageRating === 'number' ? matched.workerProfile.averageRating : undefined,
              completedJobsCount: typeof matched.workerProfile.completedOrderCount === 'number' ? matched.workerProfile.completedOrderCount : undefined,
              phone: (matched.workerProfile as any)?.phoneNumber || (matched.workerProfile as any)?.phone || undefined,
              headline: (matched.workerProfile as any)?.headline || undefined,
            };
          }
        }
        catch {
          // ignore
        }
      }

      return null;
    },
    enabled: Boolean(orderQuery.data && orderId && orderId !== '224466' && orderId !== 'demo-001'),
    staleTime: 60000,
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
    worker: workerProfileQuery.data || (orderQuery.data as any)?.worker || null,
    statusHistory: historyQuery.data ?? orderQuery.data?.statusHistory ?? [],
    isLoading: orderQuery.isLoading,
    isRefetching: orderQuery.isRefetching,
    refetch: async () => {
      await Promise.all([orderQuery.refetch(), historyQuery.refetch(), workerProfileQuery.refetch()]);
    },
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
