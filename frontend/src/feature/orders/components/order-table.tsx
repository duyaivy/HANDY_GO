"use client";

import { ChevronRight, Copy, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Order } from "../types";
import {
  formatCurrency,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/order-utils";

interface OrdersTableProps {
  orders: Order[];
  onViewDetail: (id: string) => void;
  isLoading?: boolean;
}

export default function OrdersTable({
  orders,
  onViewDetail,
  isLoading = false,
}: OrdersTableProps) {
  const shortenId = (id?: string) => {
    if (!id) return "Chưa cập nhật";
    return `${id.slice(0, 8)}…`;
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
    } catch (error) {
      console.error("Không thể sao chép UUID:", error);
    }
  };

  const renderUserId = (id?: string) => (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className="truncate font-mono text-[13px] text-slate-700"
        title={id || "Chưa cập nhật"}
      >
        {shortenId(id)}
      </span>

      {id && (
        <button
          type="button"
          title="Sao chép UUID"
          aria-label={`Sao chép UUID ${id}`}
          onClick={(event) => {
            event.stopPropagation();
            void copyId(id);
          }}
          className="
            shrink-0 cursor-pointer rounded-md p-1
            text-slate-400 transition-colors
            hover:bg-slate-100 hover:text-[#FF5E14]
            focus-visible:outline-2
            focus-visible:outline-offset-2
            focus-visible:outline-[#FF5E14]
          "
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  const renderStatus = (order: Order) => (
    <span
      className={`
        inline-flex max-w-full items-center
        rounded-full px-2.5 py-1
        text-[12px] font-medium whitespace-nowrap
        ${STATUS_COLORS[order.status]}
      `}
    >
      {STATUS_LABELS[order.status] ?? order.status}
    </span>
  );

  const renderAction = (order: Order, mobile = false) => {
    const isDisputed = order.status === "disputed";

    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onViewDetail(order.id);
        }}
        aria-label={`${
          isDisputed ? "Xem tranh chấp" : "Xem chi tiết"
        } đơn hàng ${order.orderCode}`}
        className={`
          inline-flex items-center justify-center gap-1
          rounded-lg border border-slate-200 bg-white
          font-semibold text-slate-700
          transition-all duration-200
          hover:border-slate-300 hover:bg-slate-50
          focus-visible:outline-2
          focus-visible:outline-offset-2
          focus-visible:outline-slate-400
          ${mobile ? "w-full px-4 py-2.5 text-[13px]" : "px-3 py-2 text-[12px]"}
        `}
      >
        <span>
          {isDisputed ? "Tranh chấp" : mobile ? "Xem chi tiết" : "Chi tiết"}
        </span>

        <ChevronRight className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      </button>
    );
  };

  const emptyState = (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <Inbox size={30} strokeWidth={1.5} className="text-slate-400" />

      <p className="text-[14px] text-slate-400">Không tìm thấy đơn hàng nào</p>
    </div>
  );

  return (
    <div
      className="w-full min-w-0 font-['Inter',sans-serif] leading-[1.6] text-[#0F172A] antialiased"
      aria-busy={isLoading}
    >
      {/* DESKTOP TABLE */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] table-fixed border-collapse text-left">
          {/* Điều chỉnh tỷ lệ chiều rộng các cột */}
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[16%]" />
            <col className="w-[16%]" />
            <col className="w-[14%]" />
            <col className="w-[17%]" />
            <col className="w-[11%]" />
          </colgroup>

          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/70 text-[13px] font-semibold text-[#0F172A]">
              <th className="px-6 py-3.5">Đơn hàng</th>

              <th className="px-4 py-3.5">Khách hàng</th>

              <th className="px-4 py-3.5">Thợ thực hiện</th>

              <th className="px-4 py-3.5 text-left">Tổng tiền</th>

              <th className="px-4 py-3.5">Trạng thái</th>

              <th className="px-3 py-3.5 text-center">Thao tác</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 text-[14px]">
            {isLoading ? (
              Array.from({ length: 5 }, (_, index) => (
                <tr key={`order-skeleton-${index}`} aria-hidden="true">
                  {/* Tên công việc / Mã đơn */}
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-36 max-w-full rounded-md" />
                      <Skeleton className="h-3 w-28 max-w-full rounded-md" />
                    </div>
                  </td>

                  {/* Khách hàng */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-20 rounded-md" />
                      <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                    </div>
                  </td>

                  {/* Thợ thực hiện */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-20 rounded-md" />
                      <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                    </div>
                  </td>

                  {/* Tổng tiền */}
                  <td className="px-4 py-4">
                    <Skeleton className="h-4 w-24 max-w-full rounded-md" />
                  </td>

                  {/* Trạng thái */}
                  <td className="px-4 py-4">
                    <Skeleton className="h-7 w-24 rounded-full" />
                  </td>

                  {/* Thao tác */}
                  <td className="px-3 py-4">
                    <div className="flex justify-center">
                      <Skeleton className="h-8 w-20 rounded-lg" />
                    </div>
                  </td>
                </tr>
              ))
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={6}>{emptyState}</td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id}
                  tabIndex={0}
                  onClick={() => onViewDetail(order.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;

                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onViewDetail(order.id);
                    }
                  }}
                  aria-label={`Xem đơn hàng ${order.orderCode}`}
                  className="
                    group cursor-pointer
                    transition-colors
                    hover:bg-slate-50/60
                    focus-visible:bg-slate-50/60
                    focus-visible:outline-2
                    focus-visible:outline-offset-[-2px]
                    focus-visible:outline-slate-400
                  "
                >
                  {/* Đơn hàng */}
                  <td className="px-6 py-4">
                    <div className="min-w-0">
                      <p
                        className="truncate text-[14px] font-medium leading-tight text-[#0F172A]"
                        title={order.service}
                      >
                        {order.service}
                      </p>

                      <p
                        className="mt-1 truncate text-[12px] font-normal text-[#64748B]"
                        title={order.orderCode}
                      >
                        {order.orderCode}
                      </p>
                    </div>
                  </td>

                  {/* Khách hàng */}
                  <td className="px-4 py-4">{renderUserId(order.customer)}</td>

                  {/* Thợ thực hiện */}
                  <td className="px-4 py-4">{renderUserId(order.worker)}</td>

                  {/* Tổng tiền - căn trái */}
                  <td className="whitespace-nowrap px-4 py-4 text-left">
                    <span className="text-[14px] font-medium text-[#0F172A]">
                      {formatCurrency(order.price)}
                    </span>
                  </td>

                  {/* Trạng thái */}
                  <td className="px-4 py-4">{renderStatus(order)}</td>

                  {/* Thao tác */}
                  <td className="whitespace-nowrap px-3 py-4">
                    <div className="flex items-center justify-center">
                      {renderAction(order)}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS */}
      <div className="divide-y divide-slate-100 md:hidden">
        {isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <div
                key={`order-mobile-skeleton-${index}`}
                className="space-y-4 p-4 sm:p-5"
                aria-hidden="true"
              >
                {/* Tên công việc + trạng thái */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40 max-w-full rounded-md" />
                    <Skeleton className="h-3 w-32 max-w-full rounded-md" />
                  </div>

                  <Skeleton className="h-7 w-20 shrink-0 rounded-full" />
                </div>

                {/* Thông tin đơn hàng */}
                <div className="space-y-3 rounded-xl bg-slate-50/70 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="min-w-0 space-y-2">
                      <Skeleton className="h-3 w-20 rounded-md" />
                      <Skeleton className="h-4 w-24 max-w-full rounded-md" />
                    </div>

                    <div className="min-w-0 space-y-2">
                      <Skeleton className="h-3 w-20 rounded-md" />
                      <Skeleton className="h-4 w-24 max-w-full rounded-md" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                    <Skeleton className="h-3 w-20 rounded-md" />
                    <Skeleton className="h-4 w-24 rounded-md" />
                  </div>
                </div>

                {/* Nút chi tiết */}
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
            ))
          : orders.length === 0
            ? emptyState
            : orders.map((order) => (
                <div key={order.id} className="space-y-4 p-4 sm:p-5">
                  {/* Tên công việc / Mã đơn / Trạng thái */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p
                        className="break-words text-[14px] font-medium leading-tight text-[#0F172A]"
                        title={order.service}
                      >
                        {order.service}
                      </p>

                      <p className="mt-1 break-all text-[12px] text-[#64748B]">
                        {order.orderCode}
                      </p>
                    </div>

                    {renderStatus(order)}
                  </div>

                  {/* Thông tin đơn hàng */}
                  <div className="space-y-3 rounded-xl bg-slate-50/70 p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="min-w-0">
                        <p className="mb-1 text-[12px] text-slate-500">
                          Khách hàng
                        </p>

                        {renderUserId(order.customer)}
                      </div>

                      <div className="min-w-0">
                        <p className="mb-1 text-[12px] text-slate-500">
                          Thợ thực hiện
                        </p>

                        {renderUserId(order.worker)}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                      <span className="text-[12px] text-slate-500">
                        Tổng tiền
                      </span>

                      <span className="text-[14px] font-medium text-[#0F172A]">
                        {formatCurrency(order.price)}
                      </span>
                    </div>
                  </div>

                  {/* Thao tác */}
                  {renderAction(order, true)}
                </div>
              ))}
      </div>
    </div>
  );
}
