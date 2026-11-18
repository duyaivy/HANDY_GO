import { skipToken, useQuery } from "@tanstack/react-query";
import paymentsApiRequest from "../api/payments.api";
import type { PaymentQuery } from "../types";

const PAYMENT_QUERY_KEY = ["payments"] as const;

export const usePaymentListQuery = (query: PaymentQuery) =>
  useQuery({
    queryKey: [...PAYMENT_QUERY_KEY, "list", query],
    queryFn: async () => (await paymentsApiRequest.list(query)).payload.data,
    retry: false,
  });

export const usePaymentDetailQuery = (id: string | null) =>
  useQuery({
    queryKey: [...PAYMENT_QUERY_KEY, "detail", id],
    queryFn: id
      ? async () => (await paymentsApiRequest.detail(id)).payload.data
      : skipToken,
    retry: false,
  });
export const usePaymentStatisticsQuery = () =>
  useQuery({
    queryKey: [...PAYMENT_QUERY_KEY, "statistics"],
    queryFn: async () => {
      const baseQuery = {
        page: 1,
        limit: 1,
      };

      const [
        allResponse,
        succeededResponse,
        pendingResponse,
        processingResponse,
        failedResponse,
      ] = await Promise.all([
        paymentsApiRequest.list(baseQuery),
        paymentsApiRequest.list({
          ...baseQuery,
          status: "succeeded",
        }),
        paymentsApiRequest.list({
          ...baseQuery,
          status: "pending",
        }),
        paymentsApiRequest.list({
          ...baseQuery,
          status: "processing",
        }),
        paymentsApiRequest.list({
          ...baseQuery,
          status: "failed",
        }),
      ]);

      return {
        total: allResponse.payload.data.total,
        succeeded: succeededResponse.payload.data.total,
        processing:
          pendingResponse.payload.data.total +
          processingResponse.payload.data.total,
        failed: failedResponse.payload.data.total,
      };
    },
    staleTime: 60 * 1000,
    retry: false,
  });
