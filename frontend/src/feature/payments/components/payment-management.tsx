
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
import PaymentTable from "./payment-table";

const PAGE_SIZE = 20;

const SELECT_CLASS =
  "h-11 w-full min-w-0 appearance-none truncate rounded-xl border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-[#FF5E14] focus:ring-2 focus:ring-[#FF5E14]/20";

export default function PaymentManagement() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const searchTerm = search.trim().toLowerCase();

  const exactId = PAYMENT_ID_PATTERN.test(searchTerm)
    ? searchTerm
    : null;

  // Danh sách giao dịch có phân trang
  const listQuery = usePaymentListQuery({
    page,
    limit: PAGE_SIZE,
    status: status || undefined,
    method: method || undefined,
  });

  // Tra cứu chi tiết giao dịch bằng ID
  const detailQuery = usePaymentDetailQuery(exactId);

  // Thống kê toàn hệ thống
  const statisticsQuery = usePaymentStatisticsQuery();

  const { data } = listQuery;

  const totalPages = Math.max(data?.totalPages ?? 0, 1);

  const exactPayment = detailQuery.isError
    ? undefined
    : detailQuery.data;

  const exactMatches =
    exactPayment &&
    (!status || exactPayment.status === status) &&
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

  const resultCount = searchTerm
    ? payments.length
    : data?.total;

  // Lấy số liệu thống kê toàn hệ thống từ API
  const paymentStats = statisticsQuery.data ?? {
    total: null,
    succeeded: null,
    processing: null,
    failed: null,
    hasUnavailableCount: false,
  };

  const statsUnavailable = statisticsQuery.isPending;
  const totalTransactions = paymentStats.total ?? data?.total ?? null;

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

  function resetFilters() {
    setStatus("");
    setMethod("");
    setPage(1);
  }

  return (
    <div className="w-full min-w-0 space-y-5">
      {/* Thống kê toàn hệ thống */}
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

              <p className="mt-1 text-xs text-slate-400">
                Toàn hệ thống
              </p>
            </div>
          );
        })}
      </section>

      {paymentStats.hasUnavailableCount && !statsUnavailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p>Một số số liệu thống kê chưa tải được.</p>
          <Button
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

      {/* Danh sách giao dịch */}
      <section
        aria-labelledby="payment-list-title"
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="payment-list-title"
                className="text-base font-semibold text-slate-900"
              >
                Danh sách giao dịch
              </h2>

              {resultCount !== undefined &&
                !resultsQuery.isPending &&
                !resultsError && (
                  <p
                    className="mt-1 text-xs text-slate-500"
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
              disabled={!status && !method}
              onClick={resetFilters}
            >
              <RotateCcw data-icon="inline-start" />
              Xóa lọc
            </Button>
          </div>

          {/* Tìm kiếm và bộ lọc */}
          <div
            role="search"
            aria-label="Tìm giao dịch thanh toán"
            className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-[minmax(0,1fr)_220px_180px]"
          >
            {/* Tìm kiếm */}
            <div className="relative col-span-2 w-full min-w-0 max-w-[320px] xl:col-span-1">
              <input
                aria-label="Tìm theo mã giao dịch"
                type="search"
                placeholder="Tìm theo mã giao dịch..."
                autoComplete="off"
                spellCheck={false}
                value={search}
                aria-describedby={
                  searchTerm && !exactId
                    ? "payment-search-scope"
                    : undefined
                }
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                className="h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#FF5E14] focus:ring-2 focus:ring-[#FF5E14]/20"
              />

              <Search
                size={17}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
              />
            </div>

            {/* Phương thức */}
            <div className="relative min-w-0">
              <select
                aria-label="Phương thức"
                className={SELECT_CLASS}
                value={method}
                onChange={(event) => {
                  setMethod(
                    event.target.value as PaymentMethod | "",
                  );
                  setPage(1);
                }}
              >
                <option value="">Tất cả phương thức</option>

                {Object.entries(PAYMENT_METHODS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>

              <ChevronDown
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400"
              />
            </div>

            {/* Trạng thái */}
            <div className="relative min-w-0">
              <select
                aria-label="Trạng thái"
                className={SELECT_CLASS}
                value={status}
                onChange={(event) => {
                  setStatus(
                    event.target.value as PaymentStatus | "",
                  );
                  setPage(1);
                }}
              >
                <option value="">Tất cả trạng thái</option>

                {Object.entries(PAYMENT_STATUSES).map(
                  ([value, { label }]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </select>

              <ChevronDown
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400"
              />
            </div>

            {searchTerm && !exactId && (
              <p
                id="payment-search-scope"
                className="col-span-full text-xs text-slate-500"
              >
                Đang tìm trên trang hiện tại. Nhập mã đầy đủ
                để tra cứu trên tất cả các trang.
              </p>
            )}
          </div>
        </div>

        {/* Bảng giao dịch */}
        {resultsError ? (
          <div className="mx-4 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-700 sm:mx-5">
            <p role="alert">
              {getPaymentErrorMessage(
                resultsError,
                "Không thể tải giao dịch.",
              )}
            </p>

            <Button
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

        {/* Phân trang */}
        {!exactId &&
          data &&
          !resultsError &&
          (page > 1 || totalPages > 1) && (
            <nav
              aria-label="Phân trang giao dịch"
              className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5"
            >
              <p className="text-sm text-slate-500">
                {page > totalPages
                  ? "Trang này không còn kết quả"
                  : `Trang ${page} / ${totalPages}`}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setPage(Math.min(page - 1, totalPages))
                  }
                  disabled={
                    page <= 1 || listQuery.isFetching
                  }
                >
                  <ChevronLeft data-icon="inline-start" />
                  Trang trước
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setPage(page + 1)}
                  disabled={
                    page >= totalPages ||
                    listQuery.isFetching
                  }
                >
                  Trang sau
                  <ChevronRight data-icon="inline-end" />
                </Button>
              </div>
            </nav>
          )}
      </section>

      {/* Modal chi tiết giao dịch */}
      <PaymentDetailModal
        paymentId={paymentId}
        onClose={() => setPaymentId(null)}
      />
    </div>
  );
}
