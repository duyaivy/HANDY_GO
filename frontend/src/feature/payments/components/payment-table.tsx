"use client";

import { useState } from "react";
import { Check, ChevronRight, Copy, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import {
  formatPaymentAmount,
  formatPaymentDate,
  PAYMENT_METHODS,
} from "../payment-utils";

import type { PaymentRecord } from "../types";
import PaymentStatusBadge from "./payment-status-badge";

type PaymentTableProps = {
  payments: PaymentRecord[];
  isLoading: boolean;
  onViewDetail: (id: string) => void;
};

const HEADERS = [
  "Giao dịch",
  "Số tiền",
  "Phương thức",
  "Trạng thái",
  "Ngày tạo",
  "Thao tác",
];

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

// ===================== COPY BUTTON =====================

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (error) {
      console.error("Không thể sao chép ID:", error);
    }
  };

  return (
    <button
      type="button"
      title={copied ? "Đã sao chép" : "Sao chép ID"}
      aria-label={copied ? "Đã sao chép" : "Sao chép ID"}
      onClick={(event) => void handleCopy(event)}
      onKeyDown={(event) => event.stopPropagation()}
      className={`
        inline-flex h-7 w-7 shrink-0
        items-center justify-center
        rounded-md text-slate-400
        transition-colors
        hover:bg-orange-50
        hover:text-[#FF5E14]
        ${FOCUS_RING}
      `}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

// ===================== ID DISPLAY =====================

function IdDisplay({
  value,
  label,
  muted = false,
}: {
  value: string;
  label?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      {label && (
        <span className="shrink-0 text-[12px] text-slate-500">{label}</span>
      )}

      <span
        title={value}
        className={`
          min-w-0 truncate font-mono text-[12px]
          ${muted ? "text-slate-500" : "font-medium text-[#0F172A]"}
        `}
      >
        {value.slice(0, 8)}...
      </span>

      <CopyButton value={value} />
    </div>
  );
}

// ===================== SKELETON =====================

function SkeletonRow() {
  return (
    <tr>
      {/* Giao dịch */}
      <td className="px-4 py-4 sm:px-5">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24 max-w-full" />
            <Skeleton className="h-6 w-6 rounded-md" />
          </div>

          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-20 max-w-full" />
            <Skeleton className="h-3 w-24 max-w-full" />
            <Skeleton className="h-6 w-6 rounded-md" />
          </div>

          {/* Thông tin mobile */}
          <div className="mt-3 space-y-2 md:hidden">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </td>

      {/* Số tiền */}
      <td className="hidden px-3 py-4 md:table-cell">
        <Skeleton className="h-4 w-24 max-w-full" />
      </td>

      {/* Phương thức */}
      <td className="hidden px-3 py-4 md:table-cell">
        <Skeleton className="h-4 w-20 max-w-full" />
      </td>

      {/* Trạng thái */}
      <td className="hidden px-3 py-4 md:table-cell">
        <Skeleton className="h-6 w-24 max-w-full rounded-full" />
      </td>

      {/* Ngày tạo */}
      <td className="hidden px-3 py-4 md:table-cell">
        <Skeleton className="h-4 w-28 max-w-full" />
      </td>

      {/* Thao tác */}
      <td className="px-4 py-4 text-right align-middle sm:px-5">
        <div className="flex justify-end">
          <Skeleton className="h-8 w-24 max-w-full rounded-lg" />
        </div>
      </td>
    </tr>
  );
}

// ===================== MAIN COMPONENT =====================

export default function PaymentTable({
  payments,
  isLoading,
  onViewDetail,
}: PaymentTableProps) {
  // ===================== LOADING =====================

  if (isLoading) {
    return (
      <div
        className="overflow-x-auto overscroll-x-contain"
        role="status"
        aria-busy="true"
      >
        <span className="sr-only">Đang tải danh sách giao dịch</span>

        <table className="w-full table-fixed border-collapse text-left">
          <thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-900">
            <tr>
              {HEADERS.map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  className={
                    index === 0
                      ? "px-4 py-3.5 sm:px-5 md:w-[25%]"
                      : index === HEADERS.length - 1
                        ? "w-24 px-4 py-3.5 text-right sm:w-28 sm:px-5"
                        : "hidden px-3 py-3.5 md:table-cell"
                  }
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: 5 }, (_, index) => (
              <SkeletonRow key={index} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ===================== EMPTY =====================

  if (payments.length === 0) {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-slate-500"
      >
        <Inbox size={30} strokeWidth={1.5} className="text-slate-400" />
        Không tìm thấy giao dịch nào.
      </div>
    );
  }

  // ===================== TABLE =====================

  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <table className="w-full table-fixed border-collapse text-left">
        <thead className="border-b border-slate-100 bg-slate-50/70 text-xs text-slate-900">
          <tr>
            {HEADERS.map((label, index) => (
              <th
                key={label}
                scope="col"
                className={
                  index === 0
                    ? "px-4 py-3.5 sm:px-5 md:w-[25%]"
                    : index === HEADERS.length - 1
                      ? "w-24 px-4 py-3.5 text-right sm:w-28 sm:px-5"
                      : "hidden px-3 py-3.5 md:table-cell"
                }
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100 text-[13px]">
          {payments.map((payment) => {
            const amount = formatPaymentAmount(
              payment.amount,
              payment.currency,
            );

            const method = payment.method
              ? PAYMENT_METHODS[payment.method]
              : "Chưa chọn";

            const createdAt = formatPaymentDate(payment.createdAt);

            return (
              <tr
                key={payment.id}
                onClick={() => onViewDetail(payment.id)}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onViewDetail(payment.id);
                  }
                }}
                tabIndex={0}
                aria-label={`Xem chi tiết giao dịch ${payment.id}`}
                className={`
                  cursor-pointer
                  transition-colors
                  hover:bg-orange-50/60
                  focus-visible:bg-orange-50
                  ${FOCUS_RING}
                `}
              >
                {/* GIAO DỊCH */}

                <td className="px-4 py-4 sm:px-5">
                  <div className="min-w-0 space-y-1">
                    {/* Payment ID */}
                    <IdDisplay value={payment.id} />

                    {/* Order ID */}
                    <IdDisplay value={payment.orderId} label="Đơn hàng" muted />

                    {/* MOBILE INFORMATION */}
                    <div className="mt-2 space-y-1 md:hidden">
                      <p className="font-medium text-[#0F172A]">
                        {amount}{" "}
                        <span className="font-normal text-slate-500">
                          · {method}
                        </span>
                      </p>

                      <p className="text-xs text-slate-500">{createdAt}</p>

                      <PaymentStatusBadge status={payment.status} />
                    </div>
                  </div>
                </td>

                {/* SỐ TIỀN */}

                <td className="hidden break-words px-3 py-4 font-medium md:table-cell">
                  {amount}
                </td>

                {/* PHƯƠNG THỨC */}

                <td className="hidden px-3 py-4 text-slate-600 md:table-cell">
                  {method}
                </td>

                {/* TRẠNG THÁI */}

                <td className="hidden px-3 py-4 md:table-cell">
                  <PaymentStatusBadge status={payment.status} />
                </td>

                {/* NGÀY TẠO */}

                <td className="hidden px-3 py-4 text-slate-600 md:table-cell">
                  {createdAt}
                </td>

                {/* THAO TÁC */}

                <td className="px-4 py-4 text-right align-middle sm:px-5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Xem chi tiết giao dịch ${payment.id}`}
                    className="border-slate-200 text-slate-700 hover:border-orange-200 hover:bg-orange-50 hover:text-[#FF5E14]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onViewDetail(payment.id);
                    }}
                  >
                    Chi tiết
                    <ChevronRight data-icon="inline-end" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
