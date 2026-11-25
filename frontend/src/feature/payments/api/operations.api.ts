import queryString from "query-string";
import http from "@/shared/api/http";
import type { SuccessResponse } from "@/shared/constants/type";
import type {
  DeadLetterResponse,
  ReconciliationReport,
  ReconciliationResult,
  ReplayInput,
  ReconcileInput,
  SandboxPayoutInput,
} from "../types/operations";

const BASE_PATH = "/api/payments/operations";

const operationsApi = {
  deadLetters: (page: number, limit: number) =>
    http.get<SuccessResponse<DeadLetterResponse>>(
      `${BASE_PATH}/dead-letters?${queryString.stringify({ page, limit })}`,
      { baseUrl: "", cache: "no-store" },
    ),
  reports: (page: number, limit: number) =>
    http.get<SuccessResponse<ReconciliationReport[]>>(
      `${BASE_PATH}/reports?${queryString.stringify({ page, limit })}`,
      { baseUrl: "", cache: "no-store" },
    ),
  replay: (input: ReplayInput) =>
    http.post<SuccessResponse<{ eventId: string; status: string }>>(
      `${BASE_PATH}/replay`,
      input,
      { baseUrl: "" },
    ),
  reconcile: (input: ReconcileInput) =>
    http.post<SuccessResponse<ReconciliationResult>>(
      `${BASE_PATH}/reconcile`,
      input,
      { baseUrl: "" },
    ),
  resolveSandboxPayout: (payoutId: string, input: SandboxPayoutInput) =>
    http.post<SuccessResponse<unknown>>(
      `${BASE_PATH}/payouts/${encodeURIComponent(payoutId)}/resolve-sandbox`,
      input,
      { baseUrl: "" },
    ),
};

export default operationsApi;
