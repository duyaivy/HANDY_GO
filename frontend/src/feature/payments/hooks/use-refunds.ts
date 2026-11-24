import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import refundsApi from "../api/refunds.api";
import type {
  CreateRefundInput,
  RefundDecisionInput,
  RefundListParams,
  RefundStatus,
} from "../types/refund";

const REFUND_QUERY_KEY = ["payments", "refunds"] as const;

export const useRefundListQuery = (params: RefundListParams) =>
  useQuery({
    queryKey: [...REFUND_QUERY_KEY, "list", params],
    queryFn: async () => (await refundsApi.list(params)).payload.data,
    retry: false,
  });

const RESERVED_STATUSES = new Set<RefundStatus>([
  "pending",
  "processing",
  "needs_review",
  "completed",
]);

/** Tính tổng refund chiếm hạn mức, chỉ khi đã tải đầy đủ tất cả trang. */
export const useRefundReservedAmountQuery = (paymentId: string | null) =>
  useQuery({
    queryKey: [...REFUND_QUERY_KEY, "reserved-amount", paymentId],
    enabled: Boolean(paymentId),
    queryFn: async () => {
      if (!paymentId) throw new Error("Thiếu mã giao dịch.");
      const limit = 100;
      let page = 1;
      let expectedTotal: number | null = null;
      let reserved = BigInt(0);
      const seenIds = new Set<string>();

      while (true) {
        const result = (await refundsApi.list({ paymentId, page, limit }))
          .payload.data;
        if (
          !result ||
          !Array.isArray(result.items) ||
          !Number.isSafeInteger(result.total) ||
          result.total < 0 ||
          !Number.isSafeInteger(result.totalPages) ||
          result.totalPages < 0 ||
          result.page !== page
        ) {
          throw new Error("Dữ liệu phân trang refund không hợp lệ.");
        }
        if (expectedTotal === null) expectedTotal = result.total;
        else if (expectedTotal !== result.total) {
          throw new Error(
            "Danh sách refund đã thay đổi khi đang tải. Vui lòng thử lại.",
          );
        }

        for (const refund of result.items) {
          if (
            refund.paymentId.toLowerCase() !== paymentId.toLowerCase() ||
            seenIds.has(refund.id)
          ) {
            throw new Error(
              "Dữ liệu refund bị trùng hoặc không đúng giao dịch.",
            );
          }
          seenIds.add(refund.id);
          if (RESERVED_STATUSES.has(refund.status)) {
            if (!/^\d+$/.test(refund.amount))
              throw new Error("Số tiền refund không hợp lệ.");
            reserved += BigInt(refund.amount);
          }
        }

        if (
          seenIds.size > expectedTotal ||
          (result.items.length === 0 && seenIds.size < expectedTotal)
        ) {
          throw new Error("Thiếu dữ liệu lịch sử hoàn tiền.");
        }
        if (seenIds.size === expectedTotal) break;
        if (page >= result.totalPages)
          throw new Error("Không lấy đủ refund từ API.");
        page += 1;
      }
      return reserved.toString();
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

export function useCreateRefund() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      paymentId,
      input,
    }: {
      paymentId: string;
      input: CreateRefundInput;
    }) => refundsApi.create(paymentId, input),

    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["payments"],
      }),
  });
}

export function useRefundDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      refundId,
      input,
    }: {
      refundId: string;
      input: RefundDecisionInput;
    }) => refundsApi.decide(refundId, input),

    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["payments"],
      }),
  });
}
