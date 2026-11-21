import queryString from "query-string";
import http from "@/shared/api/http";
import type { SuccessResponse } from "@/shared/constants/type";
import type {
  CreateRefundInput,
  Refund,
  RefundDecisionInput,
  RefundListResponse,
} from "../types/refund";

const BASE_PATH = "/api/payments";

const refundsApi = {
  list: (paymentId: string, page: number, limit: number) =>
    http.get<SuccessResponse<RefundListResponse>>(
      `${BASE_PATH}/${encodeURIComponent(paymentId)}/refunds?${queryString.stringify({ page, limit })}`,
      { baseUrl: "", cache: "no-store" },
    ),
  create: (paymentId: string, input: CreateRefundInput) =>
    http.post<SuccessResponse<Refund>>(
      `${BASE_PATH}/${encodeURIComponent(paymentId)}/refunds`,
      input,
      { baseUrl: "" },
    ),
  decide: (refundId: string, input: RefundDecisionInput) =>
    http.post<SuccessResponse<Refund>>(
      `${BASE_PATH}/refunds/${encodeURIComponent(refundId)}/decision`,
      input,
      { baseUrl: "" },
    ),
};

export default refundsApi;
