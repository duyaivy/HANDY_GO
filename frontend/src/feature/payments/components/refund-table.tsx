"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Copy, Inbox } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useRefundListQuery } from "../hooks/use-refunds";
import { formatPaymentAmount, formatPaymentDate } from "../payment-utils";
import { getRefundErrorMessage, REFUND_STATUSES } from "../refund-utils";
import type { Refund, RefundStatus } from "../types/refund";

const PAGE_SIZE = 20;
const SKELETON_ROWS = 5;

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

type RefundTableProps = {
  paymentId?: string;
  statuses: RefundStatus[];
  onDecide: (refund: Refund, approve: boolean) => void;
  onViewDetails: (refund: Refund) => void;
};

const shortId = (id: string) => (id.length > 12 ? `${id.slice(0, 8)}…` : id);

function RefundStatusBadge({ status }: { status: RefundStatus }) {
  const display = REFUND_STATUSES[status];

  return (
    <span
      className={`
        inline-flex max-w-full items-center
        whitespace-nowrap rounded-full px-2.5 py-1
        text-[11px] font-medium sm:text-[12px]
        ${display.color}
      `}
    >
      {display.label}
    </span>
  );
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (error) {
      console.error("Không thể sao chép mã:", error);
    }
  };

  return (
    <button
      type="button"
      title={copied ? "Đã sao chép" : `Sao chép ${id}`}
      aria-label={copied ? "Đã sao chép" : "Sao chép mã"}
      onClick={(event) => {
        event.stopPropagation();
        void handleCopy();
      }}
      className={`
        inline-flex h-6 w-6 shrink-0
        items-center justify-center rounded-md
        text-slate-400 transition-colors
        hover:bg-orange-50 hover:text-[#FF5E14]
        ${FOCUS_RING}
      `}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  );
}

function RefundSkeletonRow() {
  return (
    <tr aria-hidden="true">
      <td className="px-4 py-4 lg:px-5 xl:px-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-36 max-w-full rounded-md" />
          <Skeleton className="h-3 w-24 max-w-full rounded-md" />
        </div>
      </td>

      <td className="px-3 py-4 xl:px-4">
        <Skeleton className="h-4 w-24 max-w-full rounded-md" />
      </td>

      <td className="px-3 py-4 xl:px-4">
        <Skeleton className="h-4 w-24 max-w-full rounded-md" />
      </td>

      <td className="px-3 py-4 xl:px-4">
        <Skeleton className="h-7 w-24 max-w-full rounded-full" />
      </td>

      <td className="px-3 py-4 xl:px-4">
        <Skeleton className="h-4 w-28 max-w-full rounded-md" />
      </td>

      <td className="px-3 py-4">
        <div className="flex justify-center">
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
      </td>
    </tr>
  );
}

function RefundSkeletonCard() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4 rounded-md" />
          <Skeleton className="h-3.5 w-1/2 rounded-md" />
        </div>

        <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
      </div>

      <Skeleton className="mt-4 h-6 w-32 rounded-md" />

      <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-3">
        <Skeleton className="h-4 w-full rounded-md" />
        <Skeleton className="h-4 w-3/4 rounded-md" />
      </div>

      <Skeleton className="mt-4 h-10 w-full rounded-lg" />
    </div>
  );
}

function ActionButton({
  refund,
  onViewDetails,
  fullWidth = false,
}: {
  refund: Refund;
  onViewDetails: (refund: Refund) => void;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onViewDetails(refund);
      }}
      className={`
        inline-flex shrink-0 items-center justify-center
        gap-1 whitespace-nowrap rounded-lg
        border border-slate-200 bg-white
        font-semibold text-slate-700
        transition-colors duration-200
        hover:border-orange-200 hover:bg-orange-50
        hover:text-[#FF5E14]
        ${
          fullWidth ? "h-9 w-full px-3.5 text-[13px]" : "h-8 px-2.5 text-[12px]"
        }
        ${FOCUS_RING}
      `}
    >
      Chi tiết
      <ChevronRight size={14} strokeWidth={2} />
    </button>
  );
}

export default function RefundTable({
  paymentId,
  statuses,
  onDecide,
  onViewDetails,
}: RefundTableProps) {
  const [page, setPage] = useState(1);

  const refundsQuery = useRefundListQuery({
    page,
    limit: PAGE_SIZE,
    paymentId,
    statuses,
  });

  const { data, error, isFetching, isPending } = refundsQuery;

  const totalPages = data?.totalPages ?? 0;
  const refunds = data?.items ?? [];

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <Inbox size={30} strokeWidth={1.5} className="text-slate-400" />

      <p className="text-[14px] text-slate-400">
        Chưa có yêu cầu hoàn tiền phù hợp.
      </p>
    </div>
  );

  if (error) {
    return (
      <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-[13px] text-red-700 sm:m-5">
        <p role="alert">
          {getRefundErrorMessage(error, "Không thể tải danh sách hoàn tiền.")}
        </p>

        <button
          type="button"
          disabled={isFetching}
          onClick={() => void refundsQuery.refetch()}
          className={`
            rounded-lg border border-red-200 bg-white
            px-4 py-2 font-medium transition-colors
            hover:bg-red-50
            disabled:cursor-not-allowed disabled:opacity-50
            ${FOCUS_RING}
          `}
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div
      className="
        w-full min-w-0
        font-['Inter',sans-serif]
        leading-[1.6] text-[#0F172A] antialiased
      "
      aria-busy={isPending}
    >
      {/* MOBILE: CARD */}
      <div className="space-y-3 p-3 md:hidden">
        {isPending
          ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <RefundSkeletonCard key={index} />
            ))
          : refunds.length === 0
            ? emptyState
            : refunds.map((refund) => (
                <div
                  key={refund.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Xem yêu cầu hoàn tiền ${refund.id}`}
                  onClick={() => onViewDetails(refund)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onViewDetails(refund);
                    }
                  }}
                  className={`
                cursor-pointer rounded-2xl
                border border-slate-200 bg-white
                p-4 shadow-sm transition-colors
                active:bg-slate-50
                ${FOCUS_RING}
              `}
                >
                  {/* LÝ DO + TRẠNG THÁI */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        title={refund.reason}
                        className="
                      line-clamp-2 break-words
                      text-[15px] font-semibold
                      leading-snug text-[#0F172A]
                    "
                      >
                        {refund.reason || "Yêu cầu hoàn tiền"}
                      </p>

                      <div className="mt-1 flex min-w-0 items-center gap-1">
                        <span className="shrink-0 text-[12px] text-[#64748B]">
                          Mã yêu cầu:
                        </span>

                        <span
                          title={refund.id}
                          className="truncate font-mono text-[12px] text-[#64748B]"
                        >
                          {shortId(refund.id)}
                        </span>

                        <CopyId id={refund.id} />
                      </div>
                    </div>

                    <div className="shrink-0">
                      <RefundStatusBadge status={refund.status} />
                    </div>
                  </div>

                  {/* SỐ TIỀN */}
                  <p className="mt-4 text-[20px] font-semibold leading-none text-[#0F172A]">
                    {formatPaymentAmount(refund.amount, "VND")}
                  </p>

                  {/* THÔNG TIN */}
                  <dl className="mt-4 divide-y divide-slate-200/70 rounded-xl bg-slate-50 px-3">
                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="shrink-0 text-[13px] text-[#64748B]">
                        Giao dịch
                      </dt>

                      <dd className="flex min-w-0 items-center gap-1">
                        <span
                          title={refund.paymentId}
                          className="truncate font-mono text-[12px] font-medium text-slate-700"
                        >
                          {shortId(refund.paymentId)}
                        </span>

                        <CopyId id={refund.paymentId} />
                      </dd>
                    </div>

                    <div className="flex items-center justify-between gap-3 py-2.5">
                      <dt className="text-[13px] text-[#64748B]">Ngày tạo</dt>

                      <dd className="text-right text-[13px] font-medium text-slate-700">
                        {formatPaymentDate(refund.createdAt)}
                      </dd>
                    </div>
                  </dl>

                  {/* THAO TÁC MOBILE */}
                  <div className="mt-4 space-y-2">
                    <ActionButton
                      refund={refund}
                      onViewDetails={onViewDetails}
                      fullWidth
                    />

                    {refund.status === "pending" && (
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDecide(refund, false);
                          }}
                          className={`
                        h-10 rounded-lg border
                        border-slate-200 bg-white
                        text-[13px] font-medium text-slate-700
                        transition-colors hover:bg-slate-50
                        ${FOCUS_RING}
                      `}
                        >
                          Từ chối
                        </button>

                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDecide(refund, true);
                          }}
                          className={`
                        h-10 rounded-lg bg-[#FF5E14]
                        text-[13px] font-medium text-white
                        transition-colors hover:bg-[#E65310]
                        ${FOCUS_RING}
                      `}
                        >
                          Duyệt
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
      </div>

      {/* TABLET / DESKTOP: TABLE */}
      <div
        className="
          hidden w-full min-w-0 overflow-x-auto
          overscroll-x-contain md:block
          [scrollbar-width:thin]
          [scrollbar-color:#CBD5E1_transparent]
        "
      >
        <table
          aria-label="Danh sách yêu cầu hoàn tiền"
          className="
            w-full min-w-[1050px]
            table-fixed border-collapse text-left
          "
        >
          {/* TĂNG ĐỘ RỘNG CỘT THAO TÁC */}
          <colgroup>
            <col className="w-[25%]" />
            <col className="w-[13%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[14%]" />
            <col className="w-[24%]" />
          </colgroup>

          <thead>
            <tr
              className="
                border-b border-slate-100
                bg-slate-50/70
                text-[12px] font-semibold text-[#0F172A]
                lg:text-[13px]
              "
            >
              <th scope="col" className="px-4 py-3.5 lg:px-5 xl:px-6">
                Yêu cầu hoàn tiền
              </th>

              <th scope="col" className="px-3 py-3.5 xl:px-4">
                Giao dịch
              </th>

              <th scope="col" className="px-3 py-3.5 xl:px-4">
                Số tiền
              </th>

              <th scope="col" className="px-3 py-3.5 xl:px-4">
                Trạng thái
              </th>

              <th scope="col" className="px-3 py-3.5 xl:px-4">
                Ngày tạo
              </th>

              <th
                scope="col"
                className="whitespace-nowrap px-3 py-3.5 text-center"
              >
                Thao tác
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-[13px] lg:text-[14px]">
            {isPending ? (
              Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <RefundSkeletonRow key={index} />
              ))
            ) : refunds.length === 0 ? (
              <tr>
                <td colSpan={6}>{emptyState}</td>
              </tr>
            ) : (
              refunds.map((refund) => (
                <tr
                  key={refund.id}
                  tabIndex={0}
                  aria-label={`Xem chi tiết yêu cầu hoàn tiền ${refund.id}`}
                  onClick={() => onViewDetails(refund)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) {
                      return;
                    }

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onViewDetails(refund);
                    }
                  }}
                  className="
                    group cursor-pointer transition-colors
                    hover:bg-slate-50/60
                    focus-visible:bg-slate-50/60
                    focus-visible:outline-2
                    focus-visible:outline-offset-[-2px]
                    focus-visible:outline-[#FF5E14]
                  "
                >
                  {/* YÊU CẦU: LÝ DO TRÊN, ID DƯỚI */}
                  <td className="px-4 py-4 lg:px-5 xl:px-6">
                    <div className="min-w-0">
                      <p
                        title={refund.reason}
                        className="
                          line-clamp-2 break-words
                          text-[13px] font-medium
                          leading-snug text-[#0F172A]
                          lg:text-[14px]
                        "
                      >
                        {refund.reason || "Yêu cầu hoàn tiền"}
                      </p>

                      <div className="mt-1 flex min-w-0 items-center gap-1">
                        <span
                          title={refund.id}
                          className="
                            truncate font-mono
                            text-[12px] font-normal
                            text-[#64748B]
                          "
                        >
                          {shortId(refund.id)}
                        </span>

                        <CopyId id={refund.id} />
                      </div>
                    </div>
                  </td>

                  {/* GIAO DỊCH */}
                  <td className="px-3 py-4 xl:px-4">
                    <div className="flex min-w-0 items-center gap-1">
                      <span
                        title={refund.paymentId}
                        className="
                          truncate font-mono
                          text-[12px] text-[#64748B]
                        "
                      >
                        {shortId(refund.paymentId)}
                      </span>

                      <CopyId id={refund.paymentId} />
                    </div>
                  </td>

                  {/* SỐ TIỀN */}
                  <td className="whitespace-nowrap px-3 py-4 xl:px-4">
                    <span className="text-[13px] font-medium text-[#0F172A] lg:text-[14px]">
                      {formatPaymentAmount(refund.amount, "VND")}
                    </span>
                  </td>

                  {/* TRẠNG THÁI */}
                  <td className="px-3 py-4 xl:px-4">
                    <RefundStatusBadge status={refund.status} />
                  </td>

                  {/* NGÀY TẠO */}
                  <td className="px-3 py-4 text-[12px] text-[#64748B] lg:text-[13px] xl:px-4">
                    {formatPaymentDate(refund.createdAt)}
                  </td>

                  {/* THAO TÁC: LUÔN CÙNG MỘT HÀNG */}
                  <td className="px-3 py-4">
                    <div
                      className="
                        flex flex-nowrap items-center
                        justify-center gap-1.5
                        whitespace-nowrap
                      "
                    >
                      <ActionButton
                        refund={refund}
                        onViewDetails={onViewDetails}
                      />

                      {refund.status === "pending" && (
                        <>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDecide(refund, false);
                            }}
                            className={`
                              inline-flex h-8 shrink-0
                              items-center justify-center
                              whitespace-nowrap rounded-lg
                              border border-slate-200 bg-white
                              px-2.5 text-[12px] font-medium
                              text-slate-700 transition-colors
                              hover:bg-slate-50
                              ${FOCUS_RING}
                            `}
                          >
                            Từ chối
                          </button>

                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDecide(refund, true);
                            }}
                            className={`
                              inline-flex h-8 shrink-0
                              items-center justify-center
                              whitespace-nowrap rounded-lg
                              bg-[#FF5E14] px-2.5
                              text-[12px] font-medium
                              text-white transition-colors
                              hover:bg-[#E65310]
                              ${FOCUS_RING}
                            `}
                          >
                            Duyệt
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {!isPending && totalPages > 1 && (
        <nav
          aria-label="Phân trang yêu cầu hoàn tiền"
          className="
            flex flex-col gap-3
            border-t border-slate-100
            px-4 py-4
            sm:flex-row sm:items-center
            sm:justify-between sm:px-5
          "
        >
          <p className="text-[13px] text-[#64748B]">
            Hiển thị {(page - 1) * PAGE_SIZE + 1}
            {" – "}
            {Math.min(page * PAGE_SIZE, data?.total ?? page * PAGE_SIZE)} trong
            tổng số {data?.total ?? 0} yêu cầu
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((current) => current - 1)}
              className={`
                inline-flex h-9 items-center gap-1
                rounded-lg border border-slate-200
                bg-white px-3 text-[13px] font-medium
                text-slate-600 hover:bg-slate-50
                disabled:cursor-not-allowed
                disabled:opacity-40
                ${FOCUS_RING}
              `}
            >
              <ChevronLeft size={15} />
              Trước
            </button>

            <span className="px-2 text-[13px] text-slate-500">
              {data?.page ?? page} / {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((current) => current + 1)}
              className={`
                inline-flex h-9 items-center gap-1
                rounded-lg border border-slate-200
                bg-white px-3 text-[13px] font-medium
                text-slate-600 hover:bg-slate-50
                disabled:cursor-not-allowed
                disabled:opacity-40
                ${FOCUS_RING}
              `}
            >
              Sau
              <ChevronRight size={15} />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
