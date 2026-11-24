"use client";

import { useState } from "react";
import { AlertCircle, CreditCard, Plus, Search, X } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import { HttpError } from "@/shared/api/http";

import { usePaymentDetailQuery } from "../hooks/use-payments";
import { useRefundReservedAmountQuery } from "../hooks/use-refunds";

import { formatPaymentAmount, PAYMENT_METHODS } from "../payment-utils";

import { getRefundErrorMessage, REFUND_STATUSES } from "../refund-utils";

import { PAYMENT_ID_PATTERN } from "../schemas/payment.schema";

import type { Refund, RefundStatus } from "../types/refund";

import CreateRefundDialog from "./create-refund-dialog";
import MultiStatusSelect from "./multi-status-select";
import RefundDecisionDialog from "./refund-decision-dialog";
import RefundDetail from "./refund-detail";
import RefundTable from "./refund-table";

// ===================== CONSTANTS =====================

const STATUS_OPTIONS = Object.entries(REFUND_STATUSES) as [
  RefundStatus,
  { label: string; color: string },
][];

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

// ===================== MAIN COMPONENT =====================

export default function RefundManagement() {
  // ===================== FILTER STATE =====================

  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<RefundStatus[]>([]);

  // ===================== CREATE REFUND STATE =====================

  const [createOpen, setCreateOpen] = useState(false);
  const [createSearch, setCreateSearch] = useState("");
  const [isCreatingRefund, setIsCreatingRefund] = useState(false);

  // Dùng để làm mới RefundTable sau khi tạo thành công.
  const [refreshKey, setRefreshKey] = useState(0);

  // ===================== OTHER MODALS =====================

  const [decision, setDecision] = useState<{
    refund: Refund;
    approve: boolean;
  } | null>(null);

  const [detail, setDetail] = useState<Refund | null>(null);

  // ===================== FILTER LIST =====================

  const paymentId = PAYMENT_ID_PATTERN.test(search.trim())
    ? search.trim().toLowerCase()
    : undefined;

  const listKey = `${paymentId ?? "all"}-${statuses.join(",")}-${refreshKey}`;

  // ===================== CREATE REFUND =====================

  const createPaymentId = PAYMENT_ID_PATTERN.test(createSearch.trim())
    ? createSearch.trim().toLowerCase()
    : undefined;

  const paymentQuery = usePaymentDetailQuery(
    createOpen ? (createPaymentId ?? null) : null,
  );

  // Chỉ hiển thị giao dịch khớp với ID đang nhập.
  const payment =
    createOpen &&
    createPaymentId &&
    !paymentQuery.isError &&
    paymentQuery.data?.id?.toLowerCase() === createPaymentId
      ? paymentQuery.data
      : undefined;

  const paymentError =
    paymentQuery.error instanceof HttpError && paymentQuery.error.status !== 404
      ? getRefundErrorMessage(
          paymentQuery.error,
          "Không thể tra cứu giao dịch.",
        )
      : null;

  const paymentNotFound = Boolean(
    createPaymentId &&
    paymentQuery.error instanceof HttpError &&
    paymentQuery.error.status === 404,
  );

  const canCreateRefund =
    payment?.status === "succeeded" || payment?.status === "partially_refunded";

  // Backend không trả refundableAmount: tải đủ mọi trang refund đang chiếm hạn mức.
  const reservedQuery = useRefundReservedAmountQuery(
    canCreateRefund && createOpen ? (payment?.id ?? null) : null,
  );

  let refundableAmount: string | null = null;
  let invalidRefundAmount = false;
  if (payment && reservedQuery.data !== undefined) {
    try {
      if (!/^\d+$/.test(payment.amount))
        throw new Error("Invalid payment amount");
      const remaining = BigInt(payment.amount) - BigInt(reservedQuery.data);
      refundableAmount = (
        remaining > BigInt(0) ? remaining : BigInt(0)
      ).toString();
    } catch {
      invalidRefundAmount = true;
    }
  }

  const capacityError = invalidRefundAmount
    ? "Dữ liệu số tiền giao dịch không hợp lệ. Không thể xác định hạn mức hoàn."
    : reservedQuery.isError
      ? "Không thể tải đầy đủ lịch sử hoàn tiền để tính hạn mức. Vui lòng thử lại."
      : null;

  // ===================== HANDLERS =====================

  function openCreateModal() {
    setCreateSearch("");
    setCreateOpen(true);
  }

  function closeCreateModal() {
    if (isCreatingRefund) return;
    setCreateOpen(false);
  }

  function handleCreatedRefund() {
    setIsCreatingRefund(false);
    // Đóng modal hiện tại.
    setCreateOpen(false);

    // Xóa Payment ID tra cứu.
    setCreateSearch("");

    // Làm mới danh sách yêu cầu hoàn tiền.
    setRefreshKey((previous) => previous + 1);
  }

  function handleCreateOpenChange(open: boolean) {
    if (isCreatingRefund) return;
    if (!open) {
      closeCreateModal();
    } else {
      openCreateModal();
    }
  }

  // ===================== RENDER =====================

  return (
    <div className="w-full min-w-0 space-y-5 font-['Inter',sans-serif] leading-[1.6] text-[#0F172A] antialiased">
      {/* ===================== SEARCH ===================== */}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 sm:text-[16px]">
              Tra cứu hoàn tiền
            </h2>

            <p className="mt-1 text-[12px] text-slate-500 sm:text-[13px]">
              Tìm kiếm và quản lý các yêu cầu hoàn tiền trên hệ thống.
            </p>
          </div>

          {/* CREATE BUTTON */}

          <button
            type="button"
            onClick={openCreateModal}
            className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#FF5E14] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#E65310] ${FOCUS_RING}`}
          >
            <Plus size={16} />
            Tạo yêu cầu hoàn tiền
          </button>
        </div>

        {/* ===================== SEARCH FILTERS ===================== */}

        <div
          role="search"
          aria-label="Lọc yêu cầu hoàn tiền"
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]"
        >
          {/* SEARCH PAYMENT ID */}

          <div className="relative w-full min-w-0 max-w-[400px]">
            <Search
              size={17}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="search"
              aria-label="Tìm theo mã giao dịch"
              placeholder="Tìm theo mã giao dịch..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-[16px] text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#FF5E14] focus:ring-2 focus:ring-orange-100 sm:text-[13px]"
            />
          </div>

          {/* STATUS FILTER */}

          <div className="min-w-0">
            <MultiStatusSelect
              ariaLabel="Trạng thái hoàn tiền"
              value={statuses}
              options={STATUS_OPTIONS.map(([value, { label }]) => ({
                value,
                label,
              }))}
              onChange={setStatuses}
            />
          </div>
        </div>

        {search.trim() && !paymentId && (
          <p className="mt-2 text-[12px] text-slate-500">
            Nhập đầy đủ mã giao dịch để lọc kết quả.
          </p>
        )}
      </section>

      {/* ===================== REFUND LIST ===================== */}

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <h2 className="text-[15px] font-semibold text-slate-900 sm:text-[16px]">
            Danh sách yêu cầu hoàn tiền
          </h2>

          <p className="mt-1 text-[12px] text-slate-500 sm:text-[13px]">
            Theo dõi, xem chi tiết và xử lý yêu cầu hoàn tiền.
          </p>
        </div>

        <RefundTable
          key={listKey}
          paymentId={paymentId}
          statuses={statuses}
          onDecide={(refund, approve) => setDecision({ refund, approve })}
          onViewDetails={setDetail}
        />
      </section>

      {/* ===================== CREATE REFUND MODAL ===================== */}

      <Dialog open={createOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-0 overflow-hidden rounded-none border-0 bg-white p-0 font-['Inter',sans-serif] text-slate-900 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-[620px] sm:rounded-2xl sm:border"
        >
          {/* ===================== MODAL HEADER ===================== */}

          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-4 py-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#FF5E14]">
                <CreditCard size={19} />
              </div>

              <div className="min-w-0">
                <DialogTitle className="text-[17px] font-semibold tracking-tight text-slate-900 sm:text-[19px]">
                  Tạo yêu cầu hoàn tiền
                </DialogTitle>

                <DialogDescription className="mt-1 text-[12px] leading-5 text-slate-500 sm:text-[13px]">
                  Tra cứu giao dịch đã thanh toán để khởi tạo yêu cầu hoàn tiền.
                </DialogDescription>
              </div>
            </div>

            <button
              type="button"
              aria-label="Đóng"
              disabled={isCreatingRefund}
              onClick={closeCreateModal}
              className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 ${FOCUS_RING}`}
            >
              <X size={20} />
            </button>
          </div>

          {/* ===================== MODAL BODY ===================== */}

          <div className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
            {/* NOTE */}

            <div className="flex items-start gap-2.5 rounded-xl border border-orange-100 bg-orange-50/60 p-3.5">
              <AlertCircle
                size={17}
                className="mt-0.5 shrink-0 text-[#FF5E14]"
              />

              <p className="text-[12px] leading-5 text-slate-700 sm:text-[13px]">
                Chỉ tạo yêu cầu hoàn tiền sau khi đã xác minh khiếu nại, tranh
                chấp hoặc sự cố thanh toán của khách hàng.
              </p>
            </div>

            {/* ===================== PAYMENT ID INPUT ===================== */}

            <div>
              <label
                htmlFor="create-refund-payment-id"
                className="block text-[13px] font-medium text-slate-900"
              >
                Mã giao dịch thanh toán
                <span className="ml-1 text-rose-500">*</span>
              </label>

              <p className="mt-1 text-[12px] text-slate-500">
                Nhập Payment ID của giao dịch cần hoàn tiền.
              </p>

              <div className="relative mt-3">
                <Search
                  size={17}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />

                <input
                  id="create-refund-payment-id"
                  type="search"
                  value={createSearch}
                  disabled={isCreatingRefund}
                  onChange={(event) => setCreateSearch(event.target.value)}
                  placeholder="Nhập Payment ID..."
                  autoComplete="off"
                  spellCheck={false}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 font-mono text-[16px] text-slate-700 outline-none placeholder:font-sans placeholder:text-slate-400 focus:border-[#FF5E14] focus:ring-2 focus:ring-orange-100 sm:text-[13px]"
                />
              </div>

              {createSearch.trim() && !createPaymentId && (
                <p className="mt-2 text-[12px] text-slate-500">
                  Vui lòng nhập đầy đủ Payment ID hợp lệ.
                </p>
              )}
            </div>

            {/* ===================== PAYMENT LOADING ===================== */}

            {createPaymentId && paymentQuery.isPending && (
              <div
                role="status"
                aria-busy="true"
                className="space-y-3 rounded-xl border border-slate-200 p-4"
              >
                <span className="sr-only">Đang tra cứu giao dịch</span>

                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-7 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            )}

            {/* ===================== PAYMENT ERROR ===================== */}

            {(paymentError || paymentNotFound) && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-[13px] text-red-700"
              >
                <AlertCircle size={17} className="mt-0.5 shrink-0" />

                <span>
                  {paymentError || "Không tìm thấy giao dịch thanh toán này."}
                </span>
              </div>
            )}

            {/* ===================== PAYMENT INFORMATION ===================== */}

            {payment && (
              <div className="overflow-hidden rounded-xl border border-slate-200">
                {/* PAYMENT HEADER */}

                <div className="border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                  <h3 className="text-[13px] font-semibold text-slate-900">
                    Thông tin giao dịch
                  </h3>
                </div>

                {/* PAYMENT BODY */}

                <div className="space-y-4 p-4">
                  {/* PAYMENT AMOUNT */}

                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] text-slate-500">
                        Số tiền thanh toán
                      </p>

                      <p className="mt-1 text-[24px] font-semibold tracking-tight text-slate-900">
                        {formatPaymentAmount(payment.amount, payment.currency)}
                      </p>
                    </div>

                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium sm:text-[12px] ${
                        canCreateRefund
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {canCreateRefund ? "Đã thanh toán" : "Chưa đủ điều kiện"}
                    </span>
                  </div>

                  {/* PAYMENT EXTRA INFORMATION */}

                  <div className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[12px] text-slate-500">
                        Phương thức thanh toán
                      </p>

                      <p className="mt-1 text-[13px] font-medium text-slate-900">
                        {payment.method
                          ? PAYMENT_METHODS[payment.method]
                          : "Chưa chọn phương thức"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[12px] text-slate-500">Trạng thái</p>

                      <p className="mt-1 text-[13px] font-medium text-slate-900">
                        {payment.status}
                      </p>
                    </div>
                  </div>

                  {/* PAYMENT NOT ELIGIBLE */}

                  {!canCreateRefund && (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3">
                      <AlertCircle
                        size={16}
                        className="mt-0.5 shrink-0 text-amber-600"
                      />

                      <p className="text-[12px] leading-5 text-amber-700">
                        Giao dịch chưa đủ điều kiện tạo yêu cầu hoàn tiền.
                      </p>
                    </div>
                  )}

                  {/* ===================== REFUND FORM INLINE ===================== */}

                  {canCreateRefund && (
                    <CreateRefundDialog
                      key={payment.id}
                      paymentId={payment.id}
                      disabled={!canCreateRefund}
                      refundableAmount={refundableAmount}
                      capacityLoading={
                        reservedQuery.isPending || reservedQuery.isFetching
                      }
                      capacityError={capacityError}
                      onRetryCapacity={() => void reservedQuery.refetch()}
                      onCreated={handleCreatedRefund}
                      onSubmittingChange={setIsCreatingRefund}
                    />
                  )}
                </div>
              </div>
            )}

            {/* ===================== EMPTY STATE ===================== */}

            {!createSearch.trim() && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                <CreditCard
                  size={30}
                  strokeWidth={1.5}
                  className="mx-auto text-slate-400"
                />

                <p className="mt-3 text-[13px] font-medium text-slate-700">
                  Chưa chọn giao dịch
                </p>

                <p className="mt-1 text-[12px] text-slate-500">
                  Nhập mã giao dịch phía trên để kiểm tra thông tin thanh toán.
                </p>
              </div>
            )}
          </div>

          {/* ===================== MODAL FOOTER ===================== */}

          <div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50/50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <button
              type="button"
              onClick={closeCreateModal}
              disabled={isCreatingRefund}
              className={`inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-[13px] font-medium text-slate-700 transition-colors hover:bg-slate-50 sm:w-auto ${FOCUS_RING}`}
            >
              Đóng
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===================== DECISION MODAL ===================== */}

      <RefundDecisionDialog
        key={
          decision ? `${decision.refund.id}-${decision.approve}` : "no-decision"
        }
        decision={decision}
        onClose={() => setDecision(null)}
      />

      {/* ===================== REFUND DETAIL ===================== */}

      <RefundDetail refund={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
