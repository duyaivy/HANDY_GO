import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import operationsApi from "../api/operations.api";
import type { ReconcileInput, ReplayInput, SandboxPayoutInput } from "../types/operations";

const OPERATIONS_KEY = ["payments", "operations"] as const;

export const useDeadLettersQuery = (page: number, limit: number) =>
  useQuery({
    queryKey: [...OPERATIONS_KEY, "dead-letters", page, limit],
    queryFn: async () => (await operationsApi.deadLetters(page, limit)).payload.data,
    retry: false,
  });

export const useReportsQuery = (page: number, limit: number) =>
  useQuery({
    queryKey: [...OPERATIONS_KEY, "reports", page, limit],
    queryFn: async () => (await operationsApi.reports(page, limit)).payload.data,
    retry: false,
  });

export function useReplayDeadLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReplayInput) => operationsApi.replay(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...OPERATIONS_KEY, "dead-letters"] }),
  });
}

export function useReconcilePayments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReconcileInput) => operationsApi.reconcile(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...OPERATIONS_KEY, "reports"] }),
  });
}

export function useResolveSandboxPayout() {
  return useMutation({
    mutationFn: ({ payoutId, input }: { payoutId: string; input: SandboxPayoutInput }) =>
      operationsApi.resolveSandboxPayout(payoutId, input),
  });
}
