import { useQuery, keepPreviousData } from "@tanstack/react-query";

import categoryApiRequest from "../api/category.api";
import type { QueryCategoryConfig } from "./use-category-query-config";

export const useCategoryListQuery = (
  queryConfig: QueryCategoryConfig
) => {
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
    queryFn: async () =>
      (await categoryApiRequest.detail(id!)).payload.data,
    enabled: !!id,
    staleTime: 1000 * 60 * 5,
  });