import type { BookingProposal, Order, UploadEvidencePayload } from '../types/order.types';
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

export function useWorkerJobs() {
  const proposalsQuery = useQuery({
    queryKey: ordersQueryKeys.workerProposals(),
    queryFn: async () => {
      const res = await OrdersApi.getMyWorkerProposals();
      return res.data;
    },
  });

  const ordersQuery = useQuery({
    queryKey: ordersQueryKeys.workerOrders(),
    queryFn: async () => {
      const res = await OrdersApi.getMyOrders();
      return res.data;
    },
  });

  const rawProposals = extractItems<BookingProposal>(proposalsQuery.data);
  const proposals: BookingProposal[] = rawProposals.filter(
    p => p.status === 'proposed',
  );

  const rawOrders = extractItems<Order>(ordersQuery.data);
  const activeOrders: Order[] = rawOrders.filter(
    o => o.status !== 'completed' && o.status !== 'cancelled',
  );

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
