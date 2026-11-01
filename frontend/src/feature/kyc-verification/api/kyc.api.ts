import http from "@/shared/api/http";
import queryString from "query-string";

import type {
  KycResType,
  KycDetailResType,
  ReviewKycBodyType,
} from "../schema/kyc.schema";

import type { KycListConfig } from "../types/kyc-list-config.types";

export type KycListResponse = {
  statusCode: number;
  data: KycResType[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type KycDetailResponse = {
  statusCode: number;
  data: KycDetailResType;
};

export type ReviewKycResponse = {
  statusCode: number;
  message: string;
  data: KycDetailResType;
};

const kycApiRequest = {
  list: (queryParams: KycListConfig) =>
    http.get<KycListResponse>(
      "/api/kyc-cases?" + queryString.stringify(queryParams),
      { baseUrl: "" },
    ),

  detail: (id: string) =>
    http.get<KycDetailResponse>(`/api/kyc-cases/${encodeURIComponent(id)}`, {
      baseUrl: "",
      cache: "no-store",
    }),

  review: (id: string, body: ReviewKycBodyType) =>
    http.post<ReviewKycResponse>(
      `/api/kyc-cases/${encodeURIComponent(id)}/review`,
      body,
      { baseUrl: "" },
    ),
};

export default kycApiRequest;
