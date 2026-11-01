
"use client";

import isUndefined from "lodash/isUndefined";
import omitBy from "lodash/omitBy";
import { useSearchParams } from "next/navigation";

import type { CategoryListConfig } from "../types/category-list-config.types";

export type QueryCategoryConfig = {
  [key in keyof CategoryListConfig]: string;
};

export const useCategoryQueryConfig = () => {
  const searchParams = useSearchParams();

  const queryString = Object.fromEntries(
    searchParams.entries()
  );

  const queryConfig = omitBy(
    {
      page: queryString.page || "1",
      limit: queryString.limit || "5",
      search: queryString.search,
      isActive: queryString.isActive,
    },
    isUndefined
  ) as QueryCategoryConfig;

  return queryConfig;
};
