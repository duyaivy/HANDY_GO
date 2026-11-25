import queryString from "query-string";
import http from "@/shared/api/http";
import type { SuccessResponse } from "@/shared/constants/type";
import type { PaymentListResponse, PaymentQuery, PaymentRecord } from "../types";

const BASE_PATH = "/api/payments";

const paymentsApiRequest = {
  list: (query: PaymentQuery) => {
    const status = query.status?.length ? query.status.join(",") : undefined;
    return http.get<SuccessResponse<PaymentListResponse>>(
      `${BASE_PATH}?${queryString.stringify({ ...query, status })}`,
      { baseUrl: "", cache: "no-store" },
    );
  },

  detail: (id: string) =>
    http.get<SuccessResponse<PaymentRecord>>(
      `${BASE_PATH}/${encodeURIComponent(id)}`,
      { baseUrl: "", cache: "no-store" },
    ),
};

export default paymentsApiRequest;
