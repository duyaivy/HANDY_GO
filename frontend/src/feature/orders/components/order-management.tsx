"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";

import OrderDetailModal from "./order-detail-modal";
import OrdersTable from "./order-table";

import {
  useCancelOrderMutation,
  useOrderDetailQuery,
  useOrderEvidenceQuery,
  useOrderHistoryQuery,
  useOrderListQuery,
  useResolveOrderDisputeMutation,
} from "../hooks/use-orders";

import type {
  DisputeAction,
  Order,
  OrderQuery,
  OrderResponse,
  OrderStatus,
  PaymentState,
} from "../types";

import { PAYMENT_LABELS, STATUS_LABELS } from "@/lib/order-utils";

const PAGE_SIZE = 10;

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapOrder(order: OrderResponse): Order {
  return {
    id: order.id,
    orderCode: order.orderCode,
    service: order.agreedScope || order.serviceId,
    customer: order.customerUserId,
    worker: order.workerUserId,
    price: Number(order.agreedPrice),
    status: order.status,
    paymentState: order.paymentState,
    createdAt: order.createdAt,
    address: order.addressText,
    disputeReason: order.disputeReason ?? undefined,
    previousStatus: order.disputePreviousStatus ?? undefined,
    evidenceCount: order.evidences?.length ?? 0,
    resolutionNote: order.disputeResolutionNote ?? undefined,
  };
}

export default function OrderManagement() {
  // FILTER STATE
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [payment, setPayment] = useState<PaymentState | "all">("all");
  const [customerUserId, setCustomerUserId] = useState("");
  const [workerUserId, setWorkerUserId] = useState("");
  const [page, setPage] = useState(1);

  // MODAL STATE
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<Order | null>(null);

  // VALIDATE UUID
  const isValidCustomerId =
    !customerUserId.trim() || UUID_V4_PATTERN.test(customerUserId.trim());

  const isValidWorkerId =
    !workerUserId.trim() || UUID_V4_PATTERN.test(workerUserId.trim());

  const isValidFilters = isValidCustomerId && isValidWorkerId;

  // QUERY PARAMS
  const query: OrderQuery = {
    page,
    limit: PAGE_SIZE,

    ...(status !== "all" ? { status } : {}),
    ...(payment !== "all" ? { paymentState: payment } : {}),

    ...(customerUserId.trim() && isValidCustomerId
      ? { customerUserId: customerUserId.trim() }
      : {}),

    ...(workerUserId.trim() && isValidWorkerId
      ? { workerUserId: workerUserId.trim() }
      : {}),
  };

  // DANH SÁCH ĐƠN HÀNG
  const ordersQuery = useOrderListQuery(query, isValidFilters);

  // TỔNG SỐ ĐƠN TRANH CHẤP TOÀN HỆ THỐNG
  const disputedOrdersQuery = useOrderListQuery({
    page: 1,
    limit: 1,
    status: "disputed",
  });

  const orders = isValidFilters
    ? (ordersQuery.data?.items ?? []).map(mapOrder)
    : [];

  const total = isValidFilters ? (ordersQuery.data?.total ?? 0) : 0;

  const totalPages = Math.max(
    1,
    isValidFilters ? (ordersQuery.data?.totalPages ?? 1) : 1,
  );

  const currentPage = isValidFilters ? (ordersQuery.data?.page ?? page) : 1;

  const disputedCount = disputedOrdersQuery.data?.total ?? 0;

  // PHÂN TRANG GIỐNG KYC
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const visiblePages: (number | "ellipsis-left" | "ellipsis-right")[] = [];

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

  // DETAIL DATA
  const selectedOrder =
    orders.find((item) => item.id === selectedOrderId) ?? selectedSnapshot;

  const detailQuery = useOrderDetailQuery(selectedOrderId ?? undefined);
  const historyQuery = useOrderHistoryQuery(selectedOrderId ?? undefined);
  const evidenceQuery = useOrderEvidenceQuery(selectedOrderId ?? undefined);

  // MUTATIONS
  const cancelMutation = useCancelOrderMutation();
  const resolveMutation = useResolveOrderDisputeMutation();

  // HANDLERS
  const resetFilters = () => {
    setStatus("all");
    setPayment("all");
    setCustomerUserId("");
    setWorkerUserId("");
    setPage(1);
  };

  const handleViewDisputes = () => {
    setStatus("disputed");
    setPayment("all");
    setCustomerUserId("");
    setWorkerUserId("");
    setPage(1);
  };

  const handleViewDetail = (id: string) => {
    const nextOrder = orders.find((order) => order.id === id);

    if (nextOrder) {
      setSelectedSnapshot(nextOrder);
      setSelectedOrderId(id);
    }
  };

  const handleCancelOrder = async (id: string, reason: string) => {
    await cancelMutation.mutateAsync({ id, reason });
  };

  const handleResolveDispute = async (
    id: string,
    action: DisputeAction,
    resolutionNote: string,
  ) => {
    await resolveMutation.mutateAsync({
      id,
      action,
      resolutionNote,
    });

    await disputedOrdersQuery.refetch();
  };

  // STYLES
  const inputClassName =
    "h-10 w-full min-w-0 rounded-xl border border-slate-200 " +
    "bg-white px-3.5 text-[13px] text-[#0F172A] " +
    "placeholder:text-slate-400 outline-none transition-colors " +
    "focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14]";

  const selectClassName =
    "h-10 w-full min-w-0 appearance-none cursor-pointer " +
    "rounded-xl border border-slate-200 bg-white pl-3.5 pr-9 " +
    "text-[13px] text-[#0F172A] outline-none transition-colors " +
    "focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14]";

  return (
    <div className="w-full min-w-0 font-['Inter',sans-serif] leading-[1.6] text-[#0F172A] antialiased">
      <div className="w-full min-w-0 space-y-4">
        {/* HEADER */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[#0F172A] sm:text-[24px]">
            Quản lý đơn hàng
          </h1>

          <p className="mt-1 text-[14px] text-[#64748B]">
            Theo dõi và xử lý đơn hàng trong hệ thống HandyGo
          </p>
        </div>

        {/* CẢNH BÁO TRANH CHẤP */}
        {!disputedOrdersQuery.isPending &&
          !disputedOrdersQuery.isError &&
          disputedCount > 0 && (
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-semibold text-[#0F172A]">
                      Đơn hàng cần xử lý
                    </h3>

                    <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-semibold text-red-600">
                      {disputedCount} tranh chấp
                    </span>
                  </div>

                  <p className="mt-1 text-[13px] text-[#64748B]">
                    Có đơn hàng đang chờ xem xét phản ánh và bằng chứng.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleViewDisputes}
                className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-red-600 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 sm:self-auto"
              >
                Xem tranh chấp
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}

        {/* DANH SÁCH ĐƠN HÀNG */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* TIÊU ĐỀ + BỘ LỌC */}
          <div className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-[#0F172A]">
                  Danh sách đơn hàng
                </h2>

                <p className="mt-1 text-[12px] text-[#64748B]">
                  {total} đơn hàng phù hợp
                </p>
              </div>

              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-[#FF5E14]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Xóa lọc
              </button>
            </div>

            {/* BỘ LỌC */}
            <div className="flex flex-wrap items-center gap-3">
              {/* MÃ KHÁCH HÀNG */}
              <div className="w-full min-w-0 sm:w-[220px]">
                <input
                  type="text"
                  value={customerUserId}
                  onChange={(event) => {
                    setCustomerUserId(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Mã khách hàng"
                  aria-label="Lọc theo mã khách hàng"
                  aria-invalid={!isValidCustomerId}
                  className={`${inputClassName} ${
                    !isValidCustomerId
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : ""
                  }`}
                />
              </div>

              {/* MÃ THỢ */}
              <div className="w-full min-w-0 sm:w-[220px]">
                <input
                  type="text"
                  value={workerUserId}
                  onChange={(event) => {
                    setWorkerUserId(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Mã thợ"
                  aria-label="Lọc theo mã thợ"
                  aria-invalid={!isValidWorkerId}
                  className={`${inputClassName} ${
                    !isValidWorkerId
                      ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                      : ""
                  }`}
                />
              </div>

              {/* TRẠNG THÁI ĐƠN HÀNG */}
              <div className="relative w-full min-w-0 sm:w-[170px]">
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as OrderStatus | "all");
                    setPage(1);
                  }}
                  aria-label="Trạng thái đơn hàng"
                  className={selectClassName}
                >
                  <option value="all">Tất cả trạng thái</option>

                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>

              {/* TRẠNG THÁI THANH TOÁN */}
              <div className="relative w-full min-w-0 sm:w-[170px]">
                <select
                  value={payment}
                  onChange={(event) => {
                    setPayment(event.target.value as PaymentState | "all");
                    setPage(1);
                  }}
                  aria-label="Trạng thái thanh toán"
                  className={selectClassName}
                >
                  <option value="all">Tất cả thanh toán</option>

                  {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>

                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            {/* VALIDATION */}
            {!isValidFilters && (
              <p role="alert" className="text-[12px] text-red-600">
                Mã khách hàng và mã thợ phải là UUID phiên bản 4 hợp lệ.
              </p>
            )}
          </div>

          {/* BẢNG ĐƠN HÀNG */}
          {ordersQuery.isError && isValidFilters ? (
            <div className="px-5 py-10 text-center">
              <p className="text-[14px] text-red-600">
                {ordersQuery.error.message ||
                  "Không thể tải danh sách đơn hàng."}
              </p>

              <button
                type="button"
                onClick={() => void ordersQuery.refetch()}
                className="mt-3 text-[13px] font-semibold text-[#FF5E14] hover:text-orange-700"
              >
                Thử lại
              </button>
            </div>
          ) : (
            <OrdersTable
              orders={orders}
              isLoading={isValidFilters && ordersQuery.isPending}
              onViewDetail={handleViewDetail}
            />
          )}

          {/* PHÂN TRANG GIỐNG KYC */}
          <div className="border-t border-slate-100 px-3 py-4 sm:px-6">
            <div className="flex flex-col items-center justify-between gap-3 text-[13px] text-[#64748B] sm:flex-row">
              <div className="flex items-center gap-2">
                <span>· Tổng {total} đơn hàng</span>

                {ordersQuery.isFetching && !ordersQuery.isPending && (
                  <span>· Đang cập nhật...</span>
                )}
              </div>

              <nav
                aria-label="Phân trang đơn hàng"
                className="flex max-w-full flex-wrap items-center justify-center gap-1 sm:gap-2"
              >
                {/* PREVIOUS */}
                <button
                  type="button"
                  disabled={
                    !isValidFilters ||
                    safeCurrentPage <= 1 ||
                    ordersQuery.isPending ||
                    ordersQuery.isFetching
                  }
                  onClick={() =>
                    setPage((previous) => Math.max(1, previous - 1))
                  }
                  className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>

                {/* SỐ TRANG */}
                {visiblePages.map((pageNumber) =>
                  typeof pageNumber === "number" ? (
                    <button
                      key={pageNumber}
                      type="button"
                      disabled={
                        !isValidFilters ||
                        ordersQuery.isPending ||
                        ordersQuery.isFetching
                      }
                      onClick={() => setPage(pageNumber)}
                      aria-current={
                        safeCurrentPage === pageNumber ? "page" : undefined
                      }
                      className={`h-10 min-w-10 rounded-xl px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        safeCurrentPage === pageNumber
                          ? "bg-[#FF5E14] text-white shadow-sm"
                          : "bg-white text-slate-900 hover:bg-slate-100"
                      }`}
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
                    !isValidFilters ||
                    safeCurrentPage >= totalPages ||
                    ordersQuery.isPending ||
                    ordersQuery.isFetching
                  }
                  onClick={() =>
                    setPage((previous) => Math.min(totalPages, previous + 1))
                  }
                  className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL CHI TIẾT */}
      <OrderDetailModal
        key={selectedOrder?.id ?? "closed"}
        order={selectedOrder}
        detail={detailQuery.data ?? null}
        history={historyQuery.data ?? []}
        evidences={evidenceQuery.data ?? []}
        isLoading={
          detailQuery.isPending ||
          historyQuery.isPending ||
          evidenceQuery.isPending
        }
        error={
          detailQuery.error?.message ??
          historyQuery.error?.message ??
          evidenceQuery.error?.message ??
          null
        }
        onRetry={() => {
          void detailQuery.refetch();
          void historyQuery.refetch();
          void evidenceQuery.refetch();
        }}
        isSubmitting={cancelMutation.isPending || resolveMutation.isPending}
        onClose={() => {
          setSelectedOrderId(null);
          setSelectedSnapshot(null);
        }}
        onCancelOrder={handleCancelOrder}
        onResolveDispute={handleResolveDispute}
      />
    </div>
  );
}
