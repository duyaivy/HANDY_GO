import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import commissionRulesApi from "../api/commission-rules.api";
import type { CommissionRulesQuery } from "../types/commission-rule";

const QUERY_KEY = ["payments", "commission-rules"] as const;

export const useCommissionRulesQuery = (query: CommissionRulesQuery) =>
  useQuery({
    queryKey: [...QUERY_KEY, query],
    queryFn: async () => (await commissionRulesApi.list(query)).payload.data,
    retry: false,
  });

export function useCreateCommissionRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: commissionRulesApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
