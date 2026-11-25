"use client";

import { useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  CreditCard,
  ReceiptText,
  RefreshCw,
  X,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import { Skeleton } from "@/components/ui/skeleton";

import { usePaymentDetailQuery } from "../hooks/use-payments";

import {
  formatPaymentAmount,
  formatPaymentDate,
  getPaymentErrorMessage,
  PAYMENT_METHODS,
} from "../payment-utils";

import type { PaymentRecord } from "../types";
import PaymentStatusBadge from "./payment-status-badge";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

// ===================== COPY FIELD =====================

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);

      setCopied(true);

      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (error) {
      console.error("Không thể sao chép:", error);
    }
  };

  return (
    <button
      type="button"
      title={copied ? "Đã sao chép" : "Sao chép mã"}
      aria-label={copied ? "Đã sao chép" : "Sao chép mã"}
      onClick={() => void handleCopy()}
      className={`
        inline-flex h-8 w-8 shrink-0
        items-center justify-center
        rounded-lg border border-slate-200
        bg-white text-slate-500
        transition-colors
        hover:border-orange-200
        hover:bg-orange-50
        hover:text-[#FF5E14]
        ${FOCUS_RING}
      `}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

// ===================== ID FIELD =====================

function IdField({ value }: { value?: string | null }) {
  if (!value) {
    return <span className="text-[13px] text-slate-400">Chưa cập nhật</span>;
  }

  return (
    <div className="flex min-w-0 items-center justify-end gap-2">
      <span
        title={value}
        className="min-w-0 truncate font-mono text-[12px] font-medium text-slate-700"
      >
        {value.slice(0, 8)}…
      </span>

      <CopyField value={value} />
    </div>
  );
}

// ===================== DETAIL ROW =====================

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 py-3">
      <dt className="min-w-0 flex-1 text-[13px] leading-5 text-[#64748B]">
        {label}
      </dt>

      <dd className="min-w-0 flex-1 text-right text-[13px] font-medium leading-5 text-[#0F172A]">
        {children}
      </dd>
    </div>
  );
}

// ===================== SECTION =====================

function DetailSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{
    size?: number;
    className?: string;
  }>;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <Icon size={17} className="shrink-0 text-[#FF5E14]" />

        <h3 className="text-[14px] font-semibold text-[#0F172A]">{title}</h3>
      </div>

      <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
        {children}
      </dl>
    </section>
  );
}

// ===================== PAYMENT DETAILS =====================

function PaymentDetails({ payment }: { payment: PaymentRecord }) {
  const method = payment.method
    ? PAYMENT_METHODS[payment.method]
    : "Chưa chọn phương thức";

  return (
    <div className="space-y-6">
      {/* ===================== AMOUNT ===================== */}

      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <p className="text-[12px] text-[#64748B]">Số tiền giao dịch</p>

        <p className="mt-1 text-[24px] font-semibold tracking-tight text-[#0F172A] sm:text-[28px]">
          {formatPaymentAmount(payment.amount, payment.currency)}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PaymentStatusBadge status={payment.status} />

          <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 sm:text-[12px]">
            {method}
          </span>
        </div>
      </section>

      {/* ===================== PAYMENT INFORMATION ===================== */}

      <DetailSection title="Thông tin giao dịch" icon={ReceiptText}>
        <DetailRow label="Mã giao dịch">
          <IdField value={payment.id} />
        </DetailRow>

        <DetailRow label="Mã đơn hàng">
          <IdField value={payment.orderId} />
        </DetailRow>

        <DetailRow label="Phương thức">{method}</DetailRow>
      </DetailSection>

      {/* ===================== RELATED USERS ===================== */}

      <DetailSection title="Các bên liên quan" icon={CreditCard}>
        <DetailRow label="Mã khách hàng">
          <IdField value={payment.customerUserId} />
        </DetailRow>

        <DetailRow label="Mã thợ">
          <IdField value={payment.workerUserId} />
        </DetailRow>
      </DetailSection>

      {/* ===================== FINANCIAL DETAILS ===================== */}

      <DetailSection title="Chi tiết phân chia thanh toán" icon={CreditCard}>
        <DetailRow label="Tổng tiền giao dịch">
          {formatPaymentAmount(payment.amount, payment.currency)}
        </DetailRow>

        <DetailRow label="Phí nền tảng">
          {formatPaymentAmount(payment.platformFee, payment.currency)}
        </DetailRow>

        <DetailRow label="Thu nhập của thợ">
          <span className="font-semibold text-[#0F172A]">
            {formatPaymentAmount(payment.workerEarning, payment.currency)}
          </span>
        </DetailRow>
      </DetailSection>

      {/* ===================== TIMELINE ===================== */}

      <DetailSection title="Thời gian giao dịch" icon={ReceiptText}>
        <DetailRow label="Ngày tạo">
          {formatPaymentDate(payment.createdAt)}
        </DetailRow>

        <DetailRow label="Cập nhật lần cuối">
          {formatPaymentDate(payment.updatedAt)}
        </DetailRow>

        <DetailRow label="Hoàn thành đơn hàng">
          {formatPaymentDate(payment.orderCompletedAt)}
        </DetailRow>

        <DetailRow label="Thời điểm thanh toán">
          {formatPaymentDate(payment.paidAt)}
        </DetailRow>
      </DetailSection>
    </div>
  );
}

// ===================== LOADING =====================

function PaymentDetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Đang tải chi tiết giao dịch</span>

      {/* AMOUNT */}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-8 w-44" />

        <div className="flex gap-2">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>

      {/* SECTIONS */}

      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="space-y-3">
          <Skeleton className="h-5 w-44" />

          <div className="space-y-4 rounded-xl border border-slate-200 p-4">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-32" />
            </div>

            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
            </div>

            <div className="flex justify-between gap-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ===================== MODAL CONTENT =====================

function PaymentDetailDialog({
  paymentId,
  open,
  onClose,
}: {
  paymentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const detailQuery = usePaymentDetailQuery(paymentId);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="
          flex h-[100dvh] max-h-[100dvh]
          w-full max-w-full flex-col gap-0
          overflow-hidden rounded-none
          border-0 bg-white p-0
          font-['Inter',sans-serif]
          text-[#0F172A]
          shadow-[0_24px_60px_-12px_rgba(15,23,42,0.28)]
          sm:h-auto
          sm:max-h-[calc(100dvh-2rem)]
          sm:max-w-[680px]
          sm:rounded-2xl sm:border
        "
      >
        {/* ===================== HEADER ===================== */}

        <div
          className="
            flex shrink-0 items-start justify-between
            gap-4 border-b border-slate-100
            px-4 pb-4
            pt-[max(1rem,env(safe-area-inset-top))]
            sm:px-7 sm:pb-5 sm:pt-6
          "
        >
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[17px] font-semibold tracking-tight text-[#0F172A] sm:text-[19px]">
              Chi tiết giao dịch
            </DialogTitle>

            <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B] sm:text-[13px]">
              Thông tin thanh toán, phân chia số tiền và các bên liên quan.
            </DialogDescription>
          </div>

          <button
            type="button"
            aria-label="Đóng chi tiết giao dịch"
            onClick={onClose}
            className={`
              -mr-1 -mt-1
              inline-flex h-10 w-10 shrink-0
              items-center justify-center
              rounded-lg text-slate-400
              transition-colors
              hover:bg-slate-100
              hover:text-slate-900
              sm:h-9 sm:w-9
              ${FOCUS_RING}
            `}
          >
            <X size={20} />
          </button>
        </div>

        {/* ===================== BODY ===================== */}

        <div
          className="
            min-h-0 min-w-0 flex-1
            overflow-x-hidden overflow-y-auto
            overscroll-contain
            px-4 py-5
            [scrollbar-width:thin]
            [scrollbar-color:#CBD5E1_transparent]
            sm:px-7 sm:py-6
          "
        >
          {detailQuery.isPending ? (
            <PaymentDetailSkeleton />
          ) : detailQuery.isError ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-rose-100 bg-rose-50 p-6 text-center">
              <AlertCircle size={28} className="text-rose-500" />

              <p className="mt-3 text-[13px] leading-6 text-rose-700">
                {getPaymentErrorMessage(
                  detailQuery.error,
                  "Không thể tải chi tiết giao dịch.",
                )}
              </p>

              <button
                type="button"
                onClick={() => void detailQuery.refetch()}
                disabled={detailQuery.isFetching}
                className={`
                  mt-4 inline-flex h-9 items-center
                  justify-center gap-2 rounded-lg
                  border border-rose-200 bg-white
                  px-4 text-[12px] font-medium
                  text-rose-700 transition-colors
                  hover:bg-rose-100
                  disabled:cursor-not-allowed
                  disabled:opacity-50
                  ${FOCUS_RING}
                `}
              >
                <RefreshCw size={14} />
                Thử lại
              </button>
            </div>
          ) : detailQuery.data ? (
            <PaymentDetails payment={detailQuery.data} />
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-500">
              Không tìm thấy thông tin giao dịch.
            </div>
          )}
        </div>

        {/* ===================== FOOTER ===================== */}

        <div
          className="
            flex shrink-0 justify-end
            border-t border-slate-100
            bg-slate-50/50
            px-4 py-3
            pb-[max(0.75rem,env(safe-area-inset-bottom))]
            sm:px-7
          "
        >
          <button
            type="button"
            onClick={onClose}
            className={`
              inline-flex h-10 w-full
              items-center justify-center
              rounded-lg border border-slate-200
              bg-white px-5 text-[13px]
              font-medium text-slate-700
              transition-colors
              hover:bg-slate-50
              sm:w-auto
              ${FOCUS_RING}
            `}
          >
            Đóng
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===================== MAIN COMPONENT =====================

export default function PaymentDetailModal({
  paymentId,
  onClose,
}: {
  paymentId: string | null;
  onClose: () => void;
}) {
  // Giữ ID đã chọn khi đóng modal để nội dung
  // không biến mất trước animation đóng.
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null);

  const handleClose = () => {
    if (paymentId) {
      setLastPaymentId(paymentId);
    }

    onClose();
  };

  const displayPaymentId = paymentId ?? lastPaymentId;

  if (!displayPaymentId) {
    return null;
  }

  return (
    <PaymentDetailDialog
      paymentId={displayPaymentId}
      open={Boolean(paymentId)}
      onClose={handleClose}
    />
  );
}
