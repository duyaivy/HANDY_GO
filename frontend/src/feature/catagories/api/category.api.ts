import http from "@/shared/api/http";
import { PaginationResponse, SuccessResponse } from "@/shared/constants/type";

import {
  CategoryDetailResType,
  CategoryResType,
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
};

export default categoryApiRequest;
