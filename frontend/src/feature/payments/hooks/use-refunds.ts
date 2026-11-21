import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import refundsApi from "../api/refunds.api";
import type { CreateRefundInput, RefundDecisionInput } from "../types/refund";

const REFUND_QUERY_KEY = ["payments", "refunds"] as const;

export const useRefundListQuery = (paymentId: string | null, page: number, limit: number) =>
  useQuery({
    queryKey: [...REFUND_QUERY_KEY, paymentId, page, limit],
    queryFn: paymentId
      ? async () => (await refundsApi.list(paymentId, page, limit)).payload.data
      : skipToken,
    retry: false,
  });

export function useCreateRefund() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, input }: { paymentId: string; input: CreateRefundInput }) =>
      refundsApi.create(paymentId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REFUND_QUERY_KEY }),
  });
}

export function useRefundDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ refundId, input }: { refundId: string; input: RefundDecisionInput }) =>
      refundsApi.decide(refundId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: REFUND_QUERY_KEY }),
  });
}
