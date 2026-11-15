"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import OrdersTable from "@/feature/orders/components/order-table";
import OrderDetailModal from "@/feature/orders/components/order-detail-modal";
import CustomerDetailModal from "@/feature/users/customers/components/customer-detail";
import WorkerDetailModal from "@/feature/users/workers/components/worker-detail";
import { useOrderUsersQuery } from "@/feature/users/hooks/use-users";

import {
  useOrderDetailQuery,
  useOrderListQuery,
  useCancelOrderMutation,
  useResolveOrderDisputeMutation,
} from "@/feature/orders/hooks/use-orders";

import type {
  DisputeAction,
  Order,
  OrderResponse,
} from "@/feature/orders/types";

const PAGE_SIZE = 10;

function mapOrder(item: OrderResponse): Order {
  return {
    id: item.id,
    orderCode: item.orderCode,
    service: item.agreedScope || item.serviceId,
    customer: item.customerUserId,
    worker: item.workerUserId,
    customerUserId: item.customerUserId,
    workerUserId: item.workerUserId,
    price: Number(item.agreedPrice),
    status: item.status,
    paymentState: item.paymentState,
    createdAt: item.createdAt,
    address: item.addressText,
    disputeReason: item.disputeReason ?? undefined,
    previousStatus: item.disputePreviousStatus ?? undefined,
    resolutionNote: item.disputeResolutionNote ?? undefined,
    evidenceCount: item.evidences?.length ?? 0,
  };
}

export default function ComplaintsTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const orderIdFromUrl = searchParams.get("orderId");

  const [page, setPage] = useState(1);

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const [selectedSnapshot, setSelectedSnapshot] = useState<Order | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  // DANH SÁCH ĐƠN HÀNG TRANH CHẤP
  const ordersQuery = useOrderListQuery({
    page,
    limit: PAGE_SIZE,
    status: "disputed",
  });

  const rawOrders = ordersQuery.data?.items ?? [];

  // LẤY THÔNG TIN KHÁCH HÀNG VÀ THỢ
  const userIds = [
    ...new Set(
      rawOrders
        .flatMap((order) => [order.customerUserId, order.workerUserId])
        .filter(Boolean),
    ),
  ];

  const userQueries = useOrderUsersQuery(userIds);

  const userMap = new Map(
    userIds.map((id, index) => [id, userQueries[index]] as const),
  );

  // CHUYỂN RESPONSE SANG ORDER UI
  const orders: Order[] = rawOrders.map((item) => {
    const customerQuery = userMap.get(item.customerUserId);
    const workerQuery = userMap.get(item.workerUserId);

    return {
      ...mapOrder(item),
      customerName: customerQuery?.data?.fullName || undefined,
      workerName: workerQuery?.data?.fullName || undefined,
      customerNameLoading: Boolean(customerQuery?.isPending),
      workerNameLoading: Boolean(workerQuery?.isPending),
    };
  });

  // PHÂN TRANG
  const total = ordersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, ordersQuery.data?.totalPages ?? 1);
  const currentPage = Math.min(page, totalPages);

  // CHI TIẾT ĐƠN HÀNG
  // Hỗ trợ mở từ URL khi đơn không nằm trong trang hiện tại.
  const activeId = selectedOrderId ?? orderIdFromUrl;

  const detailQuery = useOrderDetailQuery(activeId ?? undefined);
  const detail = detailQuery.data ?? null;

  const selectedOrder =
    orders.find((item) => item.id === activeId) ??
    (selectedSnapshot?.id === activeId ? selectedSnapshot : null) ??
    (detail ? mapOrder(detail) : null);

  // MUTATIONS
  const cancelMutation = useCancelOrderMutation();
  const resolveMutation = useResolveOrderDisputeMutation();

  // MỞ CHI TIẾT
  const openDetail = (id: string) => {
    setSelectedSnapshot(orders.find((order) => order.id === id) ?? null);
    setSelectedOrderId(id);
  };

  // ĐÓNG CHI TIẾT
  const closeDetail = () => {
    setSelectedOrderId(null);
    setSelectedSnapshot(null);

    if (orderIdFromUrl) {
      const params = new URLSearchParams(searchParams.toString());

      params.delete("orderId");

      router.replace(
        params.size ? `${pathname}?${params.toString()}` : pathname,
        { scroll: false },
      );
    }
  };

  // ĐIỀU CHỈNH TRANG KHI TỔNG SỐ TRANG GIẢM

  // TẠO DANH SÁCH SỐ TRANG
  const visiblePages: (number | string)[] = [];

  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));

  const end = Math.min(totalPages, start + 4);

  const numbers = [
    ...new Set([
      1,
      totalPages,
      ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
    ]),
  ].sort((a, b) => a - b);

  numbers.forEach((number, index) => {
    const previous = numbers[index - 1];

    if (previous !== undefined && number - previous > 1) {
      if (number - previous === 2) {
        visiblePages.push(previous + 1);
      } else {
        visiblePages.push(`ellipsis-${index}`);
      }
    }

    visiblePages.push(number);
  });

  return (
    <div className="w-full min-w-0 space-y-4 font-['Inter',sans-serif] leading-[1.6] text-[#0F172A] antialiased">
      {/* HEADER */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-[24px]">
          Quản lý khiếu nại
        </h1>

        <p className="mt-1 text-[14px] text-[#64748B]">
          Theo dõi và xử lý các đơn hàng tranh chấp trong hệ thống HandyGo
        </p>
      </div>

      {/* DANH SÁCH */}
      <div className="relative overflow-visible rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <div>
            <h2 className="text-[16px] font-semibold">
              Danh sách đơn hàng tranh chấp
            </h2>

            <p className="mt-1 text-[12px] text-[#64748B]">
              {total} đơn hàng cần xử lý
            </p>
          </div>

          <button
            type="button"
            onClick={() => void ordersQuery.refetch()}
            disabled={ordersQuery.isFetching}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-[#FF5E14] disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                ordersQuery.isFetching ? "animate-spin" : ""
              }`}
            />
            Làm mới
          </button>
        </div>

        {/* BẢNG - TÁI SỬ DỤNG ORDER */}
        {ordersQuery.isError ? (
          <div className="px-5 py-10 text-center">
            <p className="text-[14px] text-red-600">
              {ordersQuery.error.message ||
                "Không thể tải danh sách tranh chấp."}
            </p>

            <button
              type="button"
              onClick={() => void ordersQuery.refetch()}
              className="mt-3 text-[13px] font-semibold text-[#FF5E14]"
            >
              Thử lại
            </button>
          </div>
        ) : (
          <OrdersTable
            orders={orders}
            isLoading={ordersQuery.isPending}
            onViewDetail={openDetail}
            onViewUser={(id, type) => {
              if (type === "customer") {
                setSelectedCustomerId(id);
              } else {
                setSelectedWorkerId(id);
              }
            }}
          />
        )}

        {/* PHÂN TRANG - GIỐNG ORDER */}
        <div className="border-t border-slate-100 px-3 py-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-3 text-[13px] text-[#64748B] xl:flex-row">
            <span>
              · Tổng {total} đơn hàng
              {ordersQuery.isFetching && !ordersQuery.isPending
                ? " · Đang cập nhật..."
                : ""}
            </span>

            <nav
              aria-label="Phân trang tranh chấp"
              className="flex max-w-full flex-wrap items-center justify-center gap-1 sm:gap-2"
            >
              {/* PREVIOUS */}
              <button
                type="button"
                disabled={
                  currentPage <= 1 ||
                  ordersQuery.isPending ||
                  ordersQuery.isFetching
                }
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:text-slate-400"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>

              {/* PAGE NUMBERS */}
              {visiblePages.map((item) =>
                typeof item === "number" ? (
                  <button
                    key={item}
                    type="button"
                    disabled={ordersQuery.isPending || ordersQuery.isFetching}
                    onClick={() => setPage(item)}
                    aria-current={item === currentPage ? "page" : undefined}
                    className={`h-10 min-w-10 rounded-xl px-2 text-sm font-medium ${
                      item === currentPage
                        ? "bg-[#FF5E14] text-white shadow-sm"
                        : "text-slate-900 hover:bg-slate-100"
                    }`}
                  >
                    {item}
                  </button>
                ) : (
                  <span key={item} className="px-2">
                    ...
                  </span>
                ),
              )}

              {/* NEXT */}
              <button
                type="button"
                disabled={
                  currentPage >= totalPages ||
                  ordersQuery.isPending ||
                  ordersQuery.isFetching
                }
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:text-slate-400"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* MODAL KHÁCH HÀNG */}
      <CustomerDetailModal
        userId={selectedCustomerId}
        onClose={() => setSelectedCustomerId(null)}
      />

      {/* MODAL THỢ */}
      <WorkerDetailModal
        userId={selectedWorkerId}
        onClose={() => setSelectedWorkerId(null)}
      />

      {/* MODAL CHI TIẾT ORDER DÙNG CHUNG */}
      <OrderDetailModal
        key={activeId ?? "closed"}
        hasNestedModalOpen={Boolean(selectedCustomerId || selectedWorkerId)}
        order={selectedOrder}
        detail={detail}
        history={detail?.statusHistory ?? []}
        evidences={detail?.evidences ?? []}
        isLoading={Boolean(activeId) && detailQuery.isPending}
        error={detailQuery.error?.message ?? null}
        onRetry={() => void detailQuery.refetch()}
        isSubmitting={cancelMutation.isPending || resolveMutation.isPending}
        onClose={closeDetail}
        onCancelOrder={async (id, reason) => {
          await cancelMutation.mutateAsync({
            id,
            reason,
          });
        }}
        onResolveDispute={async (
          id: string,
          action: DisputeAction,
          resolutionNote: string,
        ) => {
          await resolveMutation.mutateAsync({
            id,
            action,
            resolutionNote,
          });
        }}
        onViewUser={(id, role) => {
          if (role === "customer") {
            setSelectedCustomerId(id);
          } else {
            setSelectedWorkerId(id);
          }
        }}
      />
    </div>
  );
}
