// import {
//   useQuery,
//   keepPreviousData,
//   useMutation,
//   useQueryClient,
// } from "@tanstack/react-query";

// import kycApiRequest from "../api/kyc.api";

// import type { KycListConfig } from "../types/kyc-list-config.types";
// import type { ReviewKycBodyType } from "../schema/kyc.schema";

// export const useKycListQuery = (queryConfig: KycListConfig) => {
//   return useQuery({
//     queryKey: ["kyc-cases", queryConfig],
//     queryFn: async () =>
//       (await kycApiRequest.list(queryConfig)).payload,
//     placeholderData: keepPreviousData,
//     staleTime: 1000 * 60 * 5,
//   });
// };

// export const useKycDetailQuery = (id?: string) => {
//   return useQuery({
//     queryKey: ["kyc-cases", "detail", id],
//     queryFn: async () =>
//       (await kycApiRequest.detail(id!)).payload.data,
//     enabled: !!id,
//     staleTime: 1000 * 60 * 5,
//   });
// };

// export const useReviewKyc = () => {
//   const queryClient = useQueryClient();

//   return useMutation({
//     mutationFn: async ({
//       id,
//       body,
//     }: {
//       id: string;
//       body: ReviewKycBodyType;
//     }) => {
//       try {
//         return await kycApiRequest.review(id, body);
//       } catch (reviewError) {
//         try {
//           const currentCase = (
//             await kycApiRequest.detail(id)
//           ).payload.data;

//           queryClient.setQueryData(
//             ["kyc-cases", "detail", id],
//             currentCase,
//           );

//           if (currentCase.status === body.decision) {
//             return;
//           }
//         } catch (verificationError) {
//           console.error(
//             "Không thể xác minh kết quả xét duyệt hồ sơ KYC",
//             verificationError,
//           );
//         }

//         throw reviewError;
//       }
//     },

//     onSettled: async () => {
//       await queryClient.invalidateQueries({
//         queryKey: ["kyc-cases"],
//       });
//     },
//   });
// };

import {
  useQuery,
  keepPreviousData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import kycApiRequest from "../api/kyc.api";

import type { KycListConfig } from "../types/kyc-list-config.types";
import type {
  KycDetailResType,
  ReviewKycBodyType,
} from "../schema/kyc.schema";

export const useKycListQuery = (queryConfig: KycListConfig) => {
  return useQuery({
    queryKey: ["kyc-cases", queryConfig],
    queryFn: async () => (await kycApiRequest.list(queryConfig)).payload,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });
};

export const useKycDetailQuery = (id?: string) => {
  return useQuery({
    queryKey: ["kyc-cases", "detail", id],
    queryFn: async () => (await kycApiRequest.detail(id!)).payload.data,
    enabled: !!id,
    staleTime: 0,
  });
};

export const useReviewKyc = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReviewKycBodyType }) =>
      kycApiRequest.review(id, body),

    onSuccess: async (response, { id }) => {
      const detailQueryKey = ["kyc-cases", "detail", id] as const;
      const currentDetail =
        queryClient.getQueryData<KycDetailResType>(detailQueryKey);

      if (currentDetail?.workerProfile?.user) {
        const reviewedCase = response.payload.data;
        queryClient.setQueryData<KycDetailResType>(detailQueryKey, {
          ...currentDetail,
          ...reviewedCase,
          workerProfile:
            reviewedCase.workerProfile ?? currentDetail.workerProfile,
          jobs: reviewedCase.jobs ?? currentDetail.jobs,
          reviewHistories:
            reviewedCase.reviewHistories ?? currentDetail.reviewHistories,
          reviewer: reviewedCase.reviewer ?? currentDetail.reviewer,
        });
      } else {
        await queryClient.invalidateQueries({ queryKey: detailQueryKey });
      }

      await queryClient.invalidateQueries({
        queryKey: ["kyc-cases"],
        predicate: (query) => query.queryKey[1] !== "detail",
      });
    },
  });
};
