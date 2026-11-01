"use client";

import { useSearchParams } from "next/navigation";
import { ServiceListConfig } from "../types/service-list-config.types";

export const useServiceQueryConfig = (): ServiceListConfig => {
  const searchParams = useSearchParams();

  return {
    page: searchParams.get("page") ?? "1",
    limit: searchParams.get("limit") ?? "5",
    search: searchParams.get("search") ?? "",
    isActive: searchParams.get("isActive") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
  };
};