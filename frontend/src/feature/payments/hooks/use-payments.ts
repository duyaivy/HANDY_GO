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
