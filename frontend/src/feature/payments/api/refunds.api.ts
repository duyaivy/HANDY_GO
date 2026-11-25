
import queryString from "query-string";
import http from "@/shared/api/http";

import type { SuccessResponse } from "@/shared/constants/type";

import type {
  CreateRefundInput,
  Refund,
  RefundDecisionInput,
  RefundListParams,
  RefundListResponse,
} from "../types/refund";

const BASE_PATH = "/api/payments";

const refundsApi = {
  // ===================== LIST REFUNDS =====================

  list: ({
    page,
    limit,
    paymentId,
    statuses,
  }: RefundListParams) => {
    const status = statuses?.length
      ? statuses.join(",")
      : undefined;

    const pagination = queryString.stringify({
      page,
      limit,
    });

    // Danh sách refund của một giao dịch cụ thể
    if (paymentId && !status) {
      return http.get<SuccessResponse<RefundListResponse>>(
        `${BASE_PATH}/${encodeURIComponent(paymentId)}/refunds?${pagination}`,
        {
          baseUrl: "",
          cache: "no-store",
        },
      );
    }

    // Danh sách tất cả refund, có thể lọc theo
    // paymentId và nhiều trạng thái
    return http.get<SuccessResponse<RefundListResponse>>(
      `${BASE_PATH}/refunds?${queryString.stringify({
        page,
        limit,
        paymentId,
        status,
      })}`,
      {
        baseUrl: "",
        cache: "no-store",
      },
    );
  },

  // ===================== CREATE REFUND =====================

  create: (
    paymentId: string,
    input: CreateRefundInput,
  ) =>
    http.post<SuccessResponse<Refund>>(
      `${BASE_PATH}/${encodeURIComponent(paymentId)}/refunds`,
      input,
      {
        baseUrl: "",
      },
    ),

  // ===================== APPROVE / REJECT =====================

  decide: (
    refundId: string,
    input: RefundDecisionInput,
  ) =>
    http.post<SuccessResponse<Refund>>(
      `${BASE_PATH}/refunds/${encodeURIComponent(refundId)}/decision`,
      input,
      {
        baseUrl: "",
      },
    ),
};

export default refundsApi;
