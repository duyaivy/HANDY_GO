import http from "@/shared/api/http";
import { PaginationResponse, SuccessResponse } from "@/shared/constants/type";

import {
  CategoryDetailResType,
  CategoryResType,
  CreateCategoryBodyType,
  UpdateCategoryBodyType,
} from "../schema/category.schema";

import queryString from "query-string";
import { CategoryListConfig } from "../types/category-list-config.types";

const categoryApiRequest = {
  list: (queryParams: CategoryListConfig) =>
    http.get<SuccessResponse<PaginationResponse<CategoryResType>>>(
      "categories?" + queryString.stringify(queryParams),
    ),
  detail: (id: string) =>
    http.get<SuccessResponse<CategoryDetailResType>>(`categories/${id}`),
  create: (body: CreateCategoryBodyType) =>
    http.post<SuccessResponse<CategoryDetailResType>>("/api/categories", body, {
      baseUrl: "",
    }),
  update: (id: string, body: UpdateCategoryBodyType) =>
    http.patch<SuccessResponse<CategoryDetailResType>>(
      `/api/categories/${id}`,
      body,
      { baseUrl: "" },
    ),

updateStatus: (id: string, isActive: boolean) =>
  http.patch<SuccessResponse<CategoryDetailResType>>(
    `/api/categories/${id}/status?isActive=${isActive}`,
    undefined,
    { baseUrl: "" },
  ),

deletePermanently: (id: string) =>
  http.delete<SuccessResponse<unknown>>(
    `/api/categories/${id}?hard=true`,
    { baseUrl: "" },
  ),

    
};

export default categoryApiRequest;
