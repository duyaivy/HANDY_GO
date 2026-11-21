"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Inbox, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HttpError } from "@/shared/api/http";
import { usePaymentDetailQuery } from "../hooks/use-payments";
import { useRefundListQuery } from "../hooks/use-refunds";
import { formatPaymentAmount, formatPaymentDate, PAYMENT_METHODS } from "../payment-utils";
import { getRefundErrorMessage, REFUND_STATUSES } from "../refund-utils";
import { PAYMENT_ID_PATTERN } from "../schemas/payment.schema";
import type { Refund } from "../types/refund";
import CreateRefundDialog from "./create-refund-dialog";
import RefundDecisionDialog from "./refund-decision-dialog";

const PAGE_SIZE = 20;

function RefundStatusBadge({ status }: { status: Refund["status"] }) {
  const display = REFUND_STATUSES[status];
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${display.color}`}>{display.label}</span>;
}

function RefundList({
  paymentId,
  onDecide,
}: {
  paymentId: string;
  onDecide: (refund: Refund, approve: boolean) => void;
}) {
  const [page, setPage] = useState(1);
  const refundsQuery = useRefundListQuery(paymentId, page, PAGE_SIZE);
  const { data, error, isFetching, isPending } = refundsQuery;
  const totalPages = data?.totalPages ?? 0;

  if (error) {
    return (
      <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700 sm:m-5">
        <p role="alert">{getRefundErrorMessage(error, "Không thể tải danh sách hoàn tiền.")}</p>
        <Button variant="outline" disabled={isFetching} onClick={() => void refundsQuery.refetch()}>Thử lại</Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div role="status" className="space-y-3 p-4 sm:p-5">
        <span className="sr-only">Đang tải yêu cầu hoàn tiền</span>
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }

  if (data.items.length === 0) {
    return (
      <div role="status" className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-slate-500">
        <Inbox size={30} strokeWidth={1.5} className="text-slate-400" />
        Chưa có yêu cầu hoàn tiền cho giao dịch này.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table aria-label="Danh sách yêu cầu hoàn tiền" className="w-full min-w-[790px] text-left text-sm">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-900">
            <tr>
              <th scope="col" className="px-4 py-3.5 sm:px-5">Yêu cầu</th>
              <th scope="col" className="px-3 py-3.5">Số tiền</th>
              <th scope="col" className="px-3 py-3.5">Trạng thái</th>
              <th scope="col" className="px-3 py-3.5">Ngày tạo</th>
              <th scope="col" className="px-3 py-3.5">Ghi chú quyết định</th>
              <th scope="col" className="px-4 py-3.5 text-right sm:px-5">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((refund) => (
              <tr key={refund.id} className="hover:bg-slate-50/60">
                <td className="max-w-60 px-4 py-4 sm:px-5">
                  <p title={refund.id} className="truncate font-medium text-slate-900">{refund.id}</p>
                  <p title={refund.reason} className="mt-1 line-clamp-2 text-xs text-slate-500">{refund.reason}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-4 font-medium text-slate-900">{formatPaymentAmount(refund.amount, "VND")}</td>
                <td className="px-3 py-4"><RefundStatusBadge status={refund.status} /></td>
                <td className="whitespace-nowrap px-3 py-4 text-slate-600">{formatPaymentDate(refund.createdAt)}</td>
                <td className="max-w-48 px-3 py-4 text-slate-600"><p className="line-clamp-2">{refund.decisionNote || "—"}</p></td>
                <td className="whitespace-nowrap px-4 py-4 text-right sm:px-5">
                  {refund.status === "pending" ? (
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" className="border-slate-200" onClick={() => onDecide(refund, false)}>Từ chối</Button>
                      <Button size="sm" className="bg-[#FF5E14] text-white hover:bg-[#E65310]" onClick={() => onDecide(refund, true)}>Duyệt</Button>
                    </div>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <nav aria-label="Phân trang yêu cầu hoàn tiền" className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
          <p className="text-sm text-slate-500">Trang {data.page} / {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page <= 1 || isFetching} onClick={() => setPage(page - 1)}><ChevronLeft data-icon="inline-start" /> Trang trước</Button>
            <Button variant="outline" disabled={page >= totalPages || isFetching} onClick={() => setPage(page + 1)}>Trang sau <ChevronRight data-icon="inline-end" /></Button>
          </div>
        </nav>
      )}
    </>
  );
}

export default function RefundManagement() {
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<{ refund: Refund; approve: boolean } | null>(null);
  const paymentId = PAYMENT_ID_PATTERN.test(search.trim()) ? search.trim().toLowerCase() : null;
  const paymentQuery = usePaymentDetailQuery(paymentId);
  const payment = paymentQuery.isError ? undefined : paymentQuery.data;
  const searchError = paymentQuery.error instanceof HttpError && paymentQuery.error.status !== 404
    ? getRefundErrorMessage(paymentQuery.error, "Không thể tra cứu giao dịch.")
    : null;
  const canCreateRefund = payment?.status === "succeeded" || payment?.status === "partially_refunded";

  return (
    <div className="space-y-5">
      <section aria-labelledby="refund-search-title" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 id="refund-search-title" className="text-base font-semibold text-slate-900">Tra cứu hoàn tiền</h2>
        <p className="mt-1 text-sm text-slate-500">Nhập mã giao dịch để xem và xử lý các yêu cầu hoàn tiền liên quan.</p>
        <div role="search" aria-label="Tìm giao dịch để hoàn tiền" className="relative mt-4 max-w-xl">
          <input
            aria-label="Tìm theo mã giao dịch"
            type="search"
            placeholder="Tìm theo mã giao dịch..."
            autoComplete="off"
            spellCheck={false}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#FF5E14] focus:ring-2 focus:ring-[#FF5E14]/20"
          />
          <Search size={17} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
        </div>
        {search.trim() && !paymentId && <p className="mt-2 text-xs text-slate-500">Nhập mã giao dịch đầy đủ để tra cứu.</p>}
        {searchError && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{searchError}</p>}
      </section>

      {paymentQuery.isPending && paymentId && (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" role="status">
          <span className="sr-only">Đang tải giao dịch</span>
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </section>
      )}

      {paymentId && paymentQuery.error instanceof HttpError && paymentQuery.error.status === 404 && (
        <section className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">Không tìm thấy giao dịch này.</section>
      )}

      {payment && (
        <section aria-labelledby="refund-list-title" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
            <div>
              <h2 id="refund-list-title" className="text-base font-semibold text-slate-900">Yêu cầu hoàn tiền</h2>
              <p className="mt-1 text-xs text-slate-500">Giao dịch {payment.id}</p>
            </div>
            <CreateRefundDialog paymentId={payment.id} disabled={!canCreateRefund} />
          </div>
          <div className="m-4 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4 sm:m-5">
            <div>
              <p className="text-xs text-slate-500">Số tiền đã thanh toán</p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{formatPaymentAmount(payment.amount, payment.currency)}</p>
              <p className="mt-1 text-sm text-slate-500">{payment.method ? PAYMENT_METHODS[payment.method] : "Chưa chọn phương thức"}</p>
            </div>
            {!canCreateRefund && <p className="max-w-xs text-sm text-slate-500">Chỉ giao dịch đã thanh toán mới có thể tạo yêu cầu hoàn tiền.</p>}
          </div>
          <RefundList paymentId={payment.id} onDecide={(refund, approve) => setDecision({ refund, approve })} />
        </section>
      )}

      <RefundDecisionDialog
        key={decision ? `${decision.refund.id}-${decision.approve}` : "no-decision"}
        decision={decision}
        onClose={() => setDecision(null)}
      />
    </div>
  );
}
