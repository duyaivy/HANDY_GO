import { skipToken, useQuery } from "@tanstack/react-query";
import paymentsApiRequest from "../api/payments.api";
import type { PaymentQuery, PaymentStatus } from "../types";

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

      const count = async (status?: PaymentStatus) => {
        try {
          return (
            await paymentsApiRequest.list({
              ...baseQuery,
              ...(status ? { status: [status] } : {}),
            })
          ).payload.data.total;
        } catch {
          return null;
        }
      };

      const [total, succeeded, pending, processing, failed] = await Promise.all([
        count(),
        count("succeeded"),
        count("pending"),
        count("processing"),
        count("failed"),
      ]);

      return {
        total,
        succeeded,
        processing:
          pending === null || processing === null ? null : pending + processing,
        failed,
        hasUnavailableCount: [total, succeeded, pending, processing, failed].some(
          (value) => value === null,
        ),
      };
    },
    staleTime: 60 * 1000,
    retry: false,
  });
