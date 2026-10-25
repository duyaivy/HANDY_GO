import http from "@/shared/api/http";
import {
  PaginationResponse,
  SuccessResponse,
} from "@/shared/constants/type";


import queryString from "query-string";
import { ServiceListConfig } from "../types/service-list-config.types";
import { CreateServiceBodyType, ServiceDetailResType, ServiceResType } from "../schema/service.schema";

const serviceApiRequest = {
  list: (queryParams: ServiceListConfig) =>
    http.get<SuccessResponse<PaginationResponse<ServiceResType>>>(
      "services?" + queryString.stringify(queryParams),
    ),
    create: (body: CreateServiceBodyType) =>
    http.post<SuccessResponse<ServiceDetailResType>>(
      "/api/services",
      body,
      { baseUrl: "" },
    ),
};

export default serviceApiRequest;