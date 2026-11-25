"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ReceiptText,
  RotateCcw,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { HttpError } from "@/shared/api/http";

import {
  usePaymentDetailQuery,
  usePaymentListQuery,
  usePaymentStatisticsQuery,
} from "../hooks/use-payments";

import {
  getPaymentErrorMessage,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "../payment-utils";

import { PAYMENT_ID_PATTERN } from "../schemas/payment.schema";
import type { PaymentMethod, PaymentStatus } from "../types";

import PaymentDetailModal from "./payment-detail-modal";
import MultiStatusSelect from "./multi-status-select";
import PaymentTable from "./payment-table";

// ===================== CONSTANTS =====================

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];

const SELECT_CLASS =
  "h-11 w-full min-w-0 appearance-none truncate rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-[#FF5E14] focus:ring-2 focus:ring-[#FF5E14]/20";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

// ===================== PAGINATION HELPER =====================
// Giữ cùng logic windowSize = 5 như OrderManagement.

function getVisiblePages(page: number, totalPages: number) {
  const visiblePages: (number | "ellipsis-left" | "ellipsis-right")[] = [];

  const safeCurrentPage = Math.min(Math.max(1, page), totalPages);

  const windowSize = 5;

  const start = Math.max(
    1,
    Math.min(
      safeCurrentPage - Math.floor(windowSize / 2),
      totalPages - windowSize + 1,
    ),
  );

  const end = Math.min(totalPages, start + windowSize - 1);

  const pageNumbers = new Set<number>([1, totalPages]);

  for (let pageNumber = start; pageNumber <= end; pageNumber++) {
    pageNumbers.add(pageNumber);
  }

  const sortedPages = [...pageNumbers].sort((a, b) => a - b);

  for (let index = 0; index < sortedPages.length; index++) {
    const pageNumber = sortedPages[index];
    const previous = sortedPages[index - 1];

    if (previous !== undefined && pageNumber - previous === 2) {
      visiblePages.push(previous + 1);
    } else if (previous !== undefined && pageNumber - previous > 2) {
      visiblePages.push(previous === 1 ? "ellipsis-left" : "ellipsis-right");
    }

    visiblePages.push(pageNumber);
  }

  return visiblePages;
}

// ===================== MAIN COMPONENT =====================

export default function PaymentManagement() {
  // ===================== STATE =====================

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [statuses, setStatuses] = useState<PaymentStatus[]>([]);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ===================== SEARCH =====================

  const searchTerm = search.trim().toLowerCase();

  const exactId = PAYMENT_ID_PATTERN.test(searchTerm) ? searchTerm : null;

  // ===================== QUERIES =====================

  const listQuery = usePaymentListQuery({
    page,
    limit,
    status: statuses.length ? statuses : undefined,
    method: method || undefined,
  });

  const detailQuery = usePaymentDetailQuery(exactId);

  const statisticsQuery = usePaymentStatisticsQuery();

  const { data } = listQuery;

  // ===================== PAGINATION DATA =====================

  const total = data?.total ?? 0;

  const totalPages = Math.max(data?.totalPages ?? Math.ceil(total / limit), 1);

  // Trang hợp lệ dùng để hiển thị UI.
  const safeCurrentPage = Math.min(Math.max(1, page), totalPages);

  const visiblePages = getVisiblePages(safeCurrentPage, totalPages);

  // ===================== SEARCH RESULTS =====================

  const exactPayment = detailQuery.isError ? undefined : detailQuery.data;

  const exactMatches =
    exactPayment &&
    (!statuses.length || statuses.includes(exactPayment.status)) &&
    (!method || exactPayment.method === method);

  const payments = exactId
    ? exactMatches
      ? [exactPayment]
      : []
    : (data?.items ?? []).filter((payment) =>
        payment.id.toLowerCase().includes(searchTerm),
      );

  const resultsQuery = exactId ? detailQuery : listQuery;

  const notFound = Boolean(
    exactId &&
    detailQuery.error instanceof HttpError &&
    detailQuery.error.status === 404,
  );

  const resultsError = notFound ? null : resultsQuery.error;

  const resultCount = searchTerm ? payments.length : data?.total;

  // ===================== STATISTICS =====================

  const paymentStats = statisticsQuery.data ?? {
    total: null,
    succeeded: null,
    processing: null,
    failed: null,
    hasUnavailableCount: false,
  };

  const statsUnavailable = statisticsQuery.isPending;

  const totalTransactions = paymentStats.total;

  const statCards = [
    {
      label: "Tổng giao dịch",
      value: totalTransactions,
      icon: ReceiptText,
      iconClass: "text-slate-500",
      iconBg: "bg-slate-100",
    },
    {
      label: "Thành công",
      value: paymentStats.succeeded,
      icon: CheckCircle2,
      iconClass: "text-emerald-600",
      iconBg: "bg-emerald-50",
    },
    {
      label: "Đang xử lý",
      value: paymentStats.processing,
      icon: Clock3,
      iconClass: "text-amber-600",
      iconBg: "bg-amber-50",
    },
    {
      label: "Thất bại",
      value: paymentStats.failed,
      icon: AlertCircle,
      iconClass: "text-rose-600",
      iconBg: "bg-rose-50",
    },
  ];

  // ===================== HANDLERS =====================

  function resetFilters() {
    setStatuses([]);
    setMethod("");
    setPage(1);
  }

  function handleLimitChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const nextLimit = Number(event.target.value);

    if (!PAGE_SIZE_OPTIONS.includes(nextLimit)) {
      return;
    }

    setLimit(nextLimit);
    setPage(1);
  }

  function changePage(nextPage: number) {
    if (
      nextPage < 1 ||
      nextPage > totalPages ||
      nextPage === page ||
      listQuery.isFetching
    ) {
      return;
    }

    setPage(nextPage);
  }

  // ===================== RENDER =====================

  return (
    <div className="w-full min-w-0 space-y-5 font-['Inter',sans-serif] leading-[1.6] text-[#0F172A] antialiased">
      {/* ===================== STATISTICS ===================== */}

      <section
        aria-label="Thống kê giao dịch toàn hệ thống"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {statCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-slate-500">
                  {card.label}
                </p>

                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconBg}`}
                >
                  <Icon
                    size={20}
                    className={card.iconClass}
                    aria-hidden="true"
                  />
                </div>
              </div>

              <p
                className="mt-3 text-2xl font-semibold tracking-tight text-slate-900"
                aria-live="polite"
              >
                {statsUnavailable || card.value === null
                  ? "—"
                  : card.value.toLocaleString("vi-VN")}
              </p>

              <p className="mt-1 text-xs text-slate-400">Toàn hệ thống</p>
            </div>
          );
        })}
      </section>

      {/* ===================== STATISTICS WARNING ===================== */}

      {paymentStats.hasUnavailableCount && !statsUnavailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>Một số số liệu thống kê chưa tải được.</p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-amber-200 bg-white text-amber-800 hover:bg-amber-100"
            onClick={() => void statisticsQuery.refetch()}
            disabled={statisticsQuery.isFetching}
          >
            Thử lại
          </Button>
        </div>
      )}

      {/* ===================== PAYMENT LIST ===================== */}

      <section
        aria-labelledby="payment-list-title"
        className="relative min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        {/* HEADER */}

        <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="payment-list-title"
                className="text-[16px] font-semibold text-[#0F172A]"
              >
                Danh sách giao dịch
              </h2>

              {resultCount !== undefined &&
                !resultsQuery.isPending &&
                !resultsError && (
                  <p
                    className="mt-1 text-[12px] text-[#64748B]"
                    aria-live="polite"
                  >
                    {searchTerm
                      ? `${resultCount} giao dịch phù hợp`
                      : `Tổng cộng ${resultCount} giao dịch`}
                  </p>
                )}
            </div>

            <Button
              type="button"
              variant="ghost"
              className="text-slate-500 hover:text-[#FF5E14]"
              disabled={!statuses.length && !method}
              onClick={resetFilters}
            >
              <RotateCcw data-icon="inline-start" />
              Xóa lọc
            </Button>
          </div>

          {/* ===================== FILTERS ===================== */}

          <div
            role="search"
            aria-label="Tìm giao dịch thanh toán"
            className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_220px_180px]"
          >
            {/* SEARCH */}

            <div className="relative col-span-2 w-full min-w-0 max-w-[320px] xl:col-span-1">
              <input
                aria-label="Tìm theo mã giao dịch"
                type="search"
                placeholder="Tìm theo mã giao dịch..."
                autoComplete="off"
                spellCheck={false}
                value={search}
                aria-describedby={
                  searchTerm && !exactId ? "payment-search-scope" : undefined
                }
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#FF5E14] focus:ring-2 focus:ring-[#FF5E14]/20"
              />

              <Search
                size={17}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>

            {/* METHOD */}

            <div className="relative min-w-0">
              <select
                aria-label="Phương thức"
                className={SELECT_CLASS}
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value as PaymentMethod | "");
                  setPage(1);
                }}
              >
                <option value="">Tất cả phương thức</option>

                {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <ChevronDown
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>

            {/* STATUS */}

            <MultiStatusSelect
              ariaLabel="Trạng thái giao dịch"
              value={statuses}
              options={Object.entries(PAYMENT_STATUSES).map(
                ([value, { label }]) => ({
                  value: value as PaymentStatus,
                  label,
                }),
              )}
              onChange={(nextStatuses) => {
                setStatuses(nextStatuses);
                setPage(1);
              }}
            />

            {searchTerm && !exactId && (
              <p
                id="payment-search-scope"
                className="col-span-full text-xs text-slate-500"
              >
                Đang tìm trên trang hiện tại. Nhập mã đầy đủ để tra cứu trên tất
                cả các trang.
              </p>
            )}
          </div>
        </div>

        {/* ===================== PAYMENT TABLE ===================== */}

        {resultsError ? (
          <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700 sm:mx-5">
            <p role="alert">
              {getPaymentErrorMessage(resultsError, "Không thể tải giao dịch.")}
            </p>

            <Button
              type="button"
              variant="outline"
              onClick={() => void resultsQuery.refetch()}
              disabled={resultsQuery.isFetching}
            >
              Thử lại
            </Button>
          </div>
        ) : (
          <PaymentTable
            payments={payments}
            isLoading={resultsQuery.isPending}
            onViewDetail={setPaymentId}
          />
        )}

        {/* ===================== PAGINATION - SAME AS ORDER ===================== */}

        {!exactId && !resultsError && (
          <div className="border-t border-slate-100 px-3 py-4 sm:px-6">
            <div className="flex flex-col items-center justify-between gap-3 text-[13px] text-[#64748B] xl:flex-row">
              {/* TOTAL & LIMIT */}

              <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                <span>· Tổng {total} giao dịch</span>

                {listQuery.isFetching && !listQuery.isPending && (
                  <span>· Đang cập nhật...</span>
                )}

                {/* LIMIT SELECT */}

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="payment-page-limit"
                    className="whitespace-nowrap text-[12px] text-[#64748B]"
                  >
                    Số dòng/trang
                  </label>

                  <div className="relative">
                    <select
                      id="payment-page-limit"
                      value={limit}
                      onChange={handleLimitChange}
                      className={`
                        h-9 min-w-[74px]
                        appearance-none rounded-lg
                        border border-slate-200
                        bg-white py-1.5 pl-3 pr-8
                        text-[13px] font-medium
                        text-slate-700 outline-none
                        transition-colors
                        focus:border-[#FF5E14]
                        focus:ring-1 focus:ring-[#FF5E14]
                        ${FOCUS_RING}
                      `}
                    >
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>

                    <ChevronDown
                      size={14}
                      aria-hidden="true"
                      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* PAGE NAVIGATION */}

              <nav
                aria-label="Phân trang giao dịch"
                className="flex max-w-full flex-wrap items-center justify-center gap-1 sm:gap-2"
              >
                {/* PREVIOUS */}

                <button
                  type="button"
                  disabled={
                    safeCurrentPage <= 1 ||
                    listQuery.isPending ||
                    listQuery.isFetching
                  }
                  onClick={() => changePage(safeCurrentPage - 1)}
                  className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>

                {/* PAGE NUMBERS */}

                {visiblePages.map((pageNumber) =>
                  typeof pageNumber === "number" ? (
                    <button
                      key={pageNumber}
                      type="button"
                      disabled={listQuery.isPending || listQuery.isFetching}
                      onClick={() => changePage(pageNumber)}
                      aria-current={
                        safeCurrentPage === pageNumber ? "page" : undefined
                      }
                      className={`h-10 min-w-10 rounded-xl px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        safeCurrentPage === pageNumber
                          ? "bg-[#FF5E14] text-white shadow-sm"
                          : "bg-white text-slate-900 hover:bg-slate-100"
                      } ${FOCUS_RING}`}
                    >
                      {pageNumber}
                    </button>
                  ) : (
                    <span
                      key={pageNumber}
                      aria-hidden="true"
                      className="flex h-9 min-w-5 items-center justify-center text-sm font-semibold text-slate-900 sm:h-10 sm:min-w-8"
                    >
                      ...
                    </span>
                  ),
                )}

                {/* NEXT */}

                <button
                  type="button"
                  disabled={
                    safeCurrentPage >= totalPages ||
                    listQuery.isPending ||
                    listQuery.isFetching
                  }
                  onClick={() => changePage(safeCurrentPage + 1)}
                  className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            </div>
          </div>
        )}
      </section>

      {/* ===================== DETAIL MODAL ===================== */}

      <PaymentDetailModal
        paymentId={paymentId}
        onClose={() => setPaymentId(null)}
      />
    </div>
  );
}
