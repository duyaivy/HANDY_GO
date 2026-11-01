import http from "@/shared/api/http";
import { PaginationResponse, SuccessResponse } from "@/shared/constants/type";

import queryString from "query-string";
import { ServiceListConfig } from "../types/service-list-config.types";
import {
  CreateServiceBodyType,
  ServiceDetailResType,
  ServiceResType,
  UpdateServiceBodyType,
} from "../schema/service.schema";

const serviceApiRequest = {
  list: (queryParams: ServiceListConfig) =>
    http.get<SuccessResponse<PaginationResponse<ServiceResType>>>(
      "services?" + queryString.stringify(queryParams),
    ),
  detail: (id: string) =>
    http.get<SuccessResponse<ServiceResType>>(`services/${id}`),
  create: (body: CreateServiceBodyType) =>
    http.post<SuccessResponse<ServiceDetailResType>>("/api/services", body, {
      baseUrl: "",
    }),
  update: (id: string, body: UpdateServiceBodyType) =>
    http.patch<SuccessResponse<ServiceDetailResType>>(
      `/api/services/${id}`,
      body,
      { baseUrl: "" },
    ),
  updateStatus: (id: string, isActive: boolean) =>
    http.patch<SuccessResponse<ServiceResType>>(
      `/api/services/${id}/status?isActive=${isActive}`,
      undefined,
      { baseUrl: "" },
    ),

  deletePermanently: (id: string) =>
    http.delete<SuccessResponse<unknown>>(`/api/services/${id}?hard=true`, {
      baseUrl: "",
    }),
};

export default serviceApiRequest;
