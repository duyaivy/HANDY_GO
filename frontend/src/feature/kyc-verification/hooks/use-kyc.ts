import {
  useQuery,
  keepPreviousData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import kycApiRequest from "../api/kyc.api";

import type { KycListConfig } from "../types/kyc-list-config.types";
import type { ReviewKycBodyType } from "../schema/kyc.schema";

export const useKycListQuery = (queryConfig: KycListConfig) => {
  return useQuery({
    queryKey: ["kyc-cases", queryConfig],
    queryFn: async () =>
      (await kycApiRequest.list(queryConfig)).payload,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });
};

export const useKycDetailQuery = (id?: string) => {
  return useQuery({
    queryKey: ["kyc-cases", "detail", id],
    queryFn: async () =>
      (await kycApiRequest.detail(id!)).payload.data,
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });
};

export const useReviewKyc = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: ReviewKycBodyType;
    }) => kycApiRequest.review(id, body),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["kyc-cases"],
      });
    },
  });
};