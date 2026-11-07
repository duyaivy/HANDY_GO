"use client";

import { ChevronRight, Inbox } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import type { Order } from "../types";
import { formatCurrency, STATUS_COLORS, STATUS_LABELS } from "@/lib/order-utils";

interface OrdersTableProps {
  orders: Order[];
  onViewDetail: (id: string) => void;
  onViewUser: (id: string, type: "customer" | "worker") => void;
  isLoading?: boolean;
}

const SKELETON_ROWS = 5;

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

export default function OrdersTable({
  orders,
  onViewDetail,
  onViewUser,
  isLoading = false,
}: OrdersTableProps) {
  const renderUserName = (
    id: string,
    name: string | undefined,
    isLoading: boolean | undefined,
    type: "customer" | "worker",
  ) => {
    if (isLoading && !name) {
      return <Skeleton className="h-4 w-24 max-w-full rounded-md" />;
    }

    if (!id) return <span className="text-xs text-slate-500">Chưa cập nhật</span>;

    return (
      <button
        type="button"
        title={name || id}
        onClick={(event) => {
          event.stopPropagation();
          onViewUser(id, type);
        }}
        className={`block max-w-full truncate text-left text-[13px] font-medium text-slate-700 transition-colors hover:text-[#FF5E14] hover:underline ${FOCUS_RING}`}
      >
        {name || `${id.slice(0, 8)}…`}
      </button>
    );
  };

  const renderStatus = (order: Order) => (
    <span
      className={`
        inline-flex max-w-full items-center
        whitespace-nowrap rounded-full px-2.5 py-1
        text-[11px] font-medium sm:text-[12px]
        ${STATUS_COLORS[order.status]}
      `}
    >
      {STATUS_LABELS[order.status] ?? order.status}
    </span>
  );

  const renderAction = (order: Order, fullWidthOnMobile = false) => {
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
          inline-flex items-center justify-center
          whitespace-nowrap border font-semibold
          border-slate-200 bg-white text-slate-700
          transition-colors duration-200
          hover:border-orange-200 hover:bg-orange-50
          hover:text-[#FF5E14]
          ${
            fullWidthOnMobile
              ? "h-9 gap-1 rounded-lg px-3.5 text-[13px]"
              : "h-7 gap-0.5 rounded-md px-2 text-[11px] lg:px-2.5 lg:text-[12px]"
          }
          ${FOCUS_RING}
        `}
      >
        <span>{isDisputed ? "Tranh chấp" : "Chi tiết"}</span>
        <ChevronRight
          className={`shrink-0 ${
            fullWidthOnMobile ? "h-3.5 w-3.5" : "h-3 w-3"
          }`}
          strokeWidth={2}
        />
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
      className="
        w-full min-w-0 font-['Inter',sans-serif]
        leading-[1.6] text-[#0F172A] antialiased
      "
      aria-busy={isLoading}
    >
      {/* ===================== MOBILE (< md): DẠNG THẺ ===================== */}
      <div className="md:hidden">
        {isLoading ? (
          <ul className="space-y-3" aria-hidden="true">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li
                key={`order-card-skeleton-${index}`}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
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
                  <Skeleton className="h-4 w-full rounded-md" />
                </div>

                <Skeleton className="mt-4 h-11 w-full rounded-xl" />
              </li>
            ))}
          </ul>
        ) : orders.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white">
            {emptyState}
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((order) => (
              <li
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
                className={`
                  cursor-pointer rounded-2xl border border-slate-200
                  bg-white p-4 shadow-sm transition-colors
                  active:bg-slate-50
                  ${FOCUS_RING}
                `}
              >
                {/* 1. Tên dịch vụ + trạng thái */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p
                      className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-[#0F172A]"
                      title={order.service}
                    >
                      {order.service}
                    </p>
                    <p
                      className="mt-0.5 truncate text-[13px] text-[#64748B]"
                      title={order.orderCode}
                    >
                      Mã đơn: {order.orderCode}
                    </p>
                  </div>

                  <div className="shrink-0">{renderStatus(order)}</div>
                </div>

                {/* 2. Tổng tiền: thông tin quan trọng nhất */}
                <p className="mt-4 text-[20px] font-semibold leading-none text-[#0F172A]">
                  {formatCurrency(order.price)}
                </p>

                {/* 3. Người liên quan: mỗi dòng một thông tin */}
                <dl className="mt-4 divide-y divide-slate-200/70 rounded-xl bg-slate-50 px-3">
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="shrink-0 text-[13px] text-[#64748B]">
                      Khách hàng
                    </dt>
                    <dd className="min-w-0">
                      {renderUserName(order.customer, order.customerName, order.customerNameLoading, "customer")}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="shrink-0 text-[13px] text-[#64748B]">
                      Thợ thực hiện
                    </dt>
                    <dd className="min-w-0">
                      {renderUserName(order.worker, order.workerName, order.workerNameLoading, "worker")}
                    </dd>
                  </div>
                </dl>

                {/* 4. Nút thao tác full-width, dễ bấm bằng ngón cái */}
                <div className="mt-4 flex justify-end">
                  {renderAction(order, true)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ===================== TABLET / DESKTOP (>= md): DẠNG BẢNG ===================== */}
      <div
        className="
          hidden w-full min-w-0 overflow-x-auto
          overscroll-x-contain md:block
          [scrollbar-width:thin]
          [scrollbar-color:#CBD5E1_transparent]
        "
      >
        <table
          className="
            w-full min-w-[720px]
            table-fixed border-collapse text-left
            xl:min-w-0
          "
        >
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[15%]" />
            <col className="w-[17%]" />
            <col className="w-[14%]" />
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
              <th
                scope="col"
                className="whitespace-nowrap px-4 py-3.5 lg:px-5 xl:px-6"
              >
                Đơn hàng
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3.5 xl:px-4">
                Khách hàng
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3.5 xl:px-4">
                Thợ thực hiện
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3.5 xl:px-4">
                Tổng tiền
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-3.5 xl:px-4">
                Trạng thái
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
            {isLoading ? (
              Array.from({ length: SKELETON_ROWS }, (_, index) => (
                <tr key={`order-skeleton-${index}`} aria-hidden="true">
                  <td className="px-4 py-4 lg:px-5 xl:px-6">
                    <div className="min-w-0 space-y-2">
                      <Skeleton className="h-4 w-36 max-w-full rounded-md" />
                      <Skeleton className="h-3 w-28 max-w-full rounded-md" />
                    </div>
                  </td>

                  <td className="px-3 py-4 xl:px-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <Skeleton className="h-4 w-20 max-w-full rounded-md" />
                      <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                    </div>
                  </td>

                  <td className="px-3 py-4 xl:px-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <Skeleton className="h-4 w-20 max-w-full rounded-md" />
                      <Skeleton className="h-3.5 w-3.5 shrink-0 rounded" />
                    </div>
                  </td>

                  <td className="px-3 py-4 xl:px-4">
                    <Skeleton className="h-4 w-24 max-w-full rounded-md" />
                  </td>

                  <td className="px-3 py-4 xl:px-4">
                    <Skeleton className="h-7 w-24 max-w-full rounded-full" />
                  </td>

                  <td className="px-3 py-4">
                    <div className="flex justify-center">
                      <Skeleton className="h-8 w-20 max-w-full rounded-lg" />
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
                    group cursor-pointer transition-colors
                    hover:bg-slate-50/60
                    focus-visible:bg-slate-50/60
                    focus-visible:outline-2
                    focus-visible:outline-offset-[-2px]
                    focus-visible:outline-[#FF5E14]
                  "
                >
                  <td className="px-4 py-4 lg:px-5 xl:px-6">
                    <div className="min-w-0">
                      <p
                        className="truncate text-[13px] font-medium leading-tight text-[#0F172A] lg:text-[14px]"
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

                  <td className="px-3 py-4 xl:px-4">
                    {renderUserName(order.customer, order.customerName, order.customerNameLoading, "customer")}
                  </td>

                  <td className="px-3 py-4 xl:px-4">
                    {renderUserName(order.worker, order.workerName, order.workerNameLoading, "worker")}
                  </td>

                  <td className="whitespace-nowrap px-3 py-4 text-left xl:px-4">
                    <span className="text-[13px] font-medium text-[#0F172A] lg:text-[14px]">
                      {formatCurrency(order.price)}
                    </span>
                  </td>

                  <td className="px-3 py-4 xl:px-4">{renderStatus(order)}</td>

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
    </div>
  );
}
