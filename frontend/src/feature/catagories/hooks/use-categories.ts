import {
  useQuery,
  keepPreviousData,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import categoryApiRequest from "../api/category.api";
import type { QueryCategoryConfig } from "./use-category-query-config";
import { CategoryDetailResType, UpdateCategoryBodyType } from "../schema/category.schema";

export const useCategoryListQuery = (queryConfig: QueryCategoryConfig) => {
  return useQuery({
    queryKey: ["categories", queryConfig],
    queryFn: async () =>
      (await categoryApiRequest.list(queryConfig)).payload.data,
    placeholderData: keepPreviousData,
    staleTime: 1000 * 60 * 5,
  });
};
export const useCategoryDetailQuery = (id?: string) =>
  useQuery({
    queryKey: ["categories", "detail", id],
    queryFn: async () => (await categoryApiRequest.detail(id!)).payload.data,
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });

export const useCreateCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: categoryApiRequest.create,

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["categories"],
      });
    },
  });
};
export const useUpdateCategory = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateCategoryBodyType;
    }) => categoryApiRequest.update(id, body),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["categories"],
      });
    },
  });
};
export const useUpdateCategoryStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      isActive,
    }: {
      id: string;
      isActive: boolean;
    }) => categoryApiRequest.updateStatus(id, isActive),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["categories"],
      });
    },
  });
};

export const useDeleteCategoryPermanently = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      categoryApiRequest.deletePermanently(id),

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["categories"],
      });
    },
  });
};