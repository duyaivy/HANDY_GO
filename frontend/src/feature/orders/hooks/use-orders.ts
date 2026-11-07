import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import ordersApiRequest from "../api/orders.api";
import type { DisputeAction, OrderQuery } from "../types";

const ORDER_QUERY_KEY = ["orders"] as const;

export const useOrderListQuery = (queryConfig: OrderQuery, enabled = true) =>
  useQuery({
    queryKey: [...ORDER_QUERY_KEY, "list", queryConfig],
    queryFn: async () =>
      (await ordersApiRequest.list(queryConfig)).payload.data,
    placeholderData: keepPreviousData,
    enabled,
  });

export const useOrderDetailQuery = (id?: string) =>
  useQuery({
    queryKey: [...ORDER_QUERY_KEY, "detail", id],
    queryFn: async () => {
      if (!id) throw new Error("Thiếu mã đơn hàng");
      return (await ordersApiRequest.detail(id)).payload.data;
    },
    enabled: Boolean(id),
  });

export const useOrderHistoryQuery = (id?: string) =>
  useQuery({
    queryKey: [...ORDER_QUERY_KEY, "history", id],
    queryFn: async () => {
      if (!id) throw new Error("Thiếu mã đơn hàng");
      return (await ordersApiRequest.history(id)).payload.data;
    },
    enabled: Boolean(id),
  });

export const useOrderEvidenceQuery = (id?: string) =>
  useQuery({
    queryKey: [...ORDER_QUERY_KEY, "evidence", id],
    queryFn: async () => {
      if (!id) throw new Error("Thiếu mã đơn hàng");
      return (await ordersApiRequest.evidences(id)).payload.data;
    },
    enabled: Boolean(id),
  });

export const useCancelOrderMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      ordersApiRequest.cancel(id, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ORDER_QUERY_KEY });
    },
  });
};

export const useResolveOrderDisputeMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      resolutionNote,
    }: {
      id: string;
      action: DisputeAction;
      resolutionNote: string;
    }) => ordersApiRequest.resolveDispute(id, action, resolutionNote),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ORDER_QUERY_KEY });
    },
  });
};
