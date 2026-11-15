"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ordersApiRequest from "@/feature/orders/api/orders.api";
import type { DisputeAction } from "@/feature/orders/types";

export function useComplaints(page: number, limit = 10) {
  return useQuery({
    queryKey: ["orders", "complaints", page, limit],
    queryFn: async () =>
      (await ordersApiRequest.list({ page, limit, status: "disputed" })).payload.data,
    placeholderData: keepPreviousData,
  });
}

export function useComplaintDetail(id: string | null) {
  const detail = useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: async () => (await ordersApiRequest.detail(id!)).payload.data,
    enabled: !!id,
  });
  const history = useQuery({
    queryKey: ["orders", "history", id],
    queryFn: async () => (await ordersApiRequest.history(id!)).payload.data,
    enabled: !!id,
  });
  const evidences = useQuery({
    queryKey: ["orders", "evidence", id],
    queryFn: async () => (await ordersApiRequest.evidences(id!)).payload.data,
    enabled: !!id,
  });
  return { detail, history, evidences };
}

export function useResolveComplaint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, resolutionNote }: { id: string; action: DisputeAction; resolutionNote: string }) =>
      ordersApiRequest.resolveDispute(id, action, resolutionNote),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}
