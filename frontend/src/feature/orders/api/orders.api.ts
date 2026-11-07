import queryString from "query-string";
import http from "@/shared/api/http";
import type {
  DisputeAction,
  OrderDetail,
  OrderEvidence,
  OrderListResponse,
  OrderQuery,
  OrderStatusHistoryItem,
} from "../types";
import type { SuccessResponse } from "@/shared/constants/type";

const BASE_PATH = "/api/orders";

const ordersApiRequest = {
  list: (query: OrderQuery) =>
    http.get<SuccessResponse<OrderListResponse>>(
      `${BASE_PATH}?${queryString.stringify(query)}`,
      { baseUrl: "", cache: "no-store" },
    ),

  detail: (id: string) =>
    http.get<SuccessResponse<OrderDetail>>(
      `${BASE_PATH}/${encodeURIComponent(id)}`,
      { baseUrl: "", cache: "no-store" },
    ),

  history: (id: string) =>
    http.get<SuccessResponse<OrderStatusHistoryItem[]>>(
      `${BASE_PATH}/${encodeURIComponent(id)}/status-history`,
      { baseUrl: "", cache: "no-store" },
    ),

  evidences: (id: string) =>
    http.get<SuccessResponse<OrderEvidence[]>>(
      `${BASE_PATH}/${encodeURIComponent(id)}/evidence`,
      { baseUrl: "", cache: "no-store" },
    ),

  cancel: (id: string, reason: string) =>
    http.post<SuccessResponse<OrderDetail>>(
      `${BASE_PATH}/${encodeURIComponent(id)}/cancel`,
      { reason },
      { baseUrl: "" },
    ),

  resolveDispute: (
    id: string,
    action: DisputeAction,
    resolutionNote: string,
  ) =>
    http.post<SuccessResponse<OrderDetail>>(
      `${BASE_PATH}/${encodeURIComponent(id)}/resolve-dispute`,
      { action, resolutionNote },
      { baseUrl: "" },
    ),
};

export default ordersApiRequest;
