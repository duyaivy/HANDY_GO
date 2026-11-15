import {
  useQuery,
  keepPreviousData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import workerApplicationsApiRequest from "../api/worker-applications.api";
import { ReviewWorkerApplicationBody, WorkerApplicationQuery } from "../types/type";



export const useWorkerApplications = (
  queryConfig: WorkerApplicationQuery,
) => {
  return useQuery({
    queryKey: ["worker-registrations", queryConfig],

    queryFn: async () =>
      (await workerApplicationsApiRequest.list(queryConfig)).payload,

    placeholderData: keepPreviousData,

    staleTime: 1000 * 60 * 5,
  });
};

export const useWorkerApplicationDetail = (
  id?: string | null,
) => {
  return useQuery({
    queryKey: ["worker-registrations", "detail", id],

    queryFn: async () =>
      (await workerApplicationsApiRequest.detail(id!)).payload.data,

    enabled: !!id,

    staleTime: 0,
  });
};

export const useReviewWorkerApplication = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: ReviewWorkerApplicationBody;
    }) => workerApplicationsApiRequest.review(id, body),

    onSuccess: async (_response, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["worker-registrations", "detail", id],
        }),

        queryClient.invalidateQueries({
          queryKey: ["worker-registrations"],
          predicate: (query) =>
            query.queryKey[1] !== "detail",
        }),
      ]);
    },
  });
};