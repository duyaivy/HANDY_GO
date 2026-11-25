import queryString from "query-string";
import http from "@/shared/api/http";
import type { SuccessResponse } from "@/shared/constants/type";
import type {
  CommissionRule,
  CommissionRulesQuery,
  CommissionRulesResponse,
  CreateCommissionRule,
} from "../types/commission-rule";

const BASE_PATH = "/api/payments/commission-rules";

const commissionRulesApi = {
  list: (query: CommissionRulesQuery) =>
    http.get<SuccessResponse<CommissionRulesResponse>>(
      `${BASE_PATH}?${queryString.stringify(query)}`,
      { baseUrl: "", cache: "no-store" },
    ),
  create: (input: CreateCommissionRule) =>
    http.post<SuccessResponse<CommissionRule>>(BASE_PATH, input, { baseUrl: "" }),
};

export default commissionRulesApi;
