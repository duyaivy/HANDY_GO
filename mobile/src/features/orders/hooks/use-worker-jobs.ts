import type { BookingProposal, Order, UploadEvidencePayload } from '../types/order.types';
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

export function useWorkerJobs() {
  const proposalStatusFilter = 'proposed';
  const orderStatusFilter = 'created,confirmed,in_progress,awaiting_customer_confirmation,disputed';

  // Lấy danh sách Proposals với server filter + infinite pagination
  const proposalsQuery = useInfiniteQuery({
    queryKey: ordersQueryKeys.workerProposals({ status: proposalStatusFilter }),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await OrdersApi.getMyWorkerProposals({
        page: pageParam,
        limit: 10,
        status: proposalStatusFilter,
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: getNextPageFromResponse,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Lấy danh sách Active Orders với server filter + infinite pagination
  const ordersQuery = useInfiniteQuery({
    queryKey: ordersQueryKeys.workerOrders({ status: orderStatusFilter }),
    queryFn: async ({ pageParam = 1 }) => {
      const res = await OrdersApi.getMyOrders({
        page: pageParam,
        limit: 10,
        status: orderStatusFilter,
      });
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: getNextPageFromResponse,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const proposalsData = proposalsQuery.data;
  const proposals: BookingProposal[] = React.useMemo(() => {
    if (!proposalsData?.pages) {
      return [];
    }
    const all = proposalsData.pages.flatMap(p => extractItems<BookingProposal>(p));
    // Safe client-side deduplication / sanity filter
    return all.filter(p => p.status === 'proposed');
  }, [proposalsData]);

  const ordersData = ordersQuery.data;
  const activeOrders: Order[] = React.useMemo(() => {
    if (!ordersData?.pages) {
      return [];
    }
    const all = ordersData.pages.flatMap(p => extractItems<Order>(p));
    return all.filter(o => o.status !== 'completed' && o.status !== 'cancelled');
  }, [ordersData]);

  const isLoading = proposalsQuery.isLoading || ordersQuery.isLoading;
  const isRefetching = proposalsQuery.isRefetching || ordersQuery.isRefetching;

  const refetch = async () => {
    await Promise.all([proposalsQuery.refetch(), ordersQuery.refetch()]);
  };

  return {
    proposals,
    activeOrders,
    isLoading,
    isRefetching,
    refetch,

    // Infinite query pagination helpers
    hasNextProposals: Boolean(proposalsQuery.hasNextPage),
    isFetchingNextProposals: proposalsQuery.isFetchingNextPage,
    fetchNextProposals: () => proposalsQuery.fetchNextPage(),

    hasNextOrders: Boolean(ordersQuery.hasNextPage),
    isFetchingNextOrders: ordersQuery.isFetchingNextPage,
    fetchNextOrders: () => ordersQuery.fetchNextPage(),
  };
}

export function useAcceptProposal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (proposalId: string) => {
      const res = await OrdersApi.acceptProposal(proposalId);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    },
  });
}

export function useWorkerJobDetail(jobId?: string) {
  const queryClient = useQueryClient();

  const orderQuery = useQuery({
    queryKey: ordersQueryKeys.orderDetail(jobId ?? ''),
    queryFn: async () => {
      if (!jobId) {
        throw new Error('Job ID is required');
      }
      const res = await OrdersApi.getOrderDetail(jobId);
      return res.data;
    },
    enabled: !!jobId && jobId !== 'JOB-1020',
  });

  const historyQuery = useQuery({
    queryKey: ordersQueryKeys.orderStatusHistory(jobId ?? ''),
    queryFn: async () => {
      if (!jobId) {
        return [];
      }
      const res = await OrdersApi.getStatusHistory(jobId);
      return res.data;
    },
    enabled: !!jobId && jobId !== 'JOB-1020',
  });

  const confirmReadinessMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) {
        throw new Error('Job ID is required');
      }
      const res = await OrdersApi.confirmReadiness(jobId);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(ordersQueryKeys.orderDetail(jobId!), updated);
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    },
  });

  const startOrderMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) {
        throw new Error('Job ID is required');
      }
      const res = await OrdersApi.startOrder(jobId);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(ordersQueryKeys.orderDetail(jobId!), updated);
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    },
  });

  const uploadEvidenceMutation = useMutation({
    mutationFn: async (payload: UploadEvidencePayload) => {
      if (!jobId) {
        throw new Error('Job ID is required');
      }
      const res = await OrdersApi.uploadEvidence(jobId, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.orderDetail(jobId!) });
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    },
  });

  const finishOrderMutation = useMutation({
    mutationFn: async () => {
      if (!jobId) {
        throw new Error('Job ID is required');
      }
      const res = await OrdersApi.finishOrder(jobId);
      return res.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(ordersQueryKeys.orderDetail(jobId!), updated);
      queryClient.invalidateQueries({ queryKey: ordersQueryKeys.all });
    },
  });

  return {
    order: orderQuery.data,
    statusHistory: historyQuery.data ?? orderQuery.data?.statusHistory ?? [],
    isLoading: orderQuery.isLoading,
    isRefetching: orderQuery.isRefetching,
    refetch: orderQuery.refetch,
    confirmReadiness: confirmReadinessMutation.mutateAsync,
    isConfirmingReadiness: confirmReadinessMutation.isPending,
    startOrder: startOrderMutation.mutateAsync,
    isStartingOrder: startOrderMutation.isPending,
    uploadEvidence: uploadEvidenceMutation.mutateAsync,
    isUploadingEvidence: uploadEvidenceMutation.isPending,
    finishOrder: finishOrderMutation.mutateAsync,
    isFinishingOrder: finishOrderMutation.isPending,
  };
}
