import http from "@/shared/api/http";
import { PaginationResponse, SuccessResponse } from "@/shared/constants/type";

import {
  CategoryDetailResType,
  CategoryResType,
  CreateCategoryBodyType,
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
    http.post<SuccessResponse<CategoryDetailResType>>(
      "/api/categories",
      body,
      { baseUrl: "" },
    ),
};

export default categoryApiRequest;
