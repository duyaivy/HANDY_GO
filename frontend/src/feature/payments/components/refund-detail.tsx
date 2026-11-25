"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

import { formatPaymentAmount, formatPaymentDate } from "../payment-utils";
import { REFUND_STATUSES } from "../refund-utils";
import type { Refund } from "../types/refund";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

// ===================== COPY BUTTON =====================

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

// ===================== DETAIL ROW =====================

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-[13px] text-[#64748B]">{label}</dt>

      <dd className="min-w-0 text-right text-[13px] font-medium text-[#0F172A]">
        {children}
      </dd>
    </div>
  );
}

// ===================== REFUND DETAILS =====================

function RefundDetails({ refund }: { refund: Refund }) {
  const status = REFUND_STATUSES[refund.status];

  return (
    <div className="space-y-6">
      {/* SỐ TIỀN HOÀN */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5">
        <p className="text-[12px] text-[#64748B]">Số tiền yêu cầu hoàn</p>

        <p className="mt-1 text-[24px] font-semibold tracking-tight text-[#0F172A] sm:text-[28px]">
          {formatPaymentAmount(refund.amount, "VND")}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`
              inline-flex items-center gap-1.5
              rounded-full px-2.5 py-1
              text-[11px] font-medium
              sm:text-[12px]
              ${status.color}
            `}
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-current opacity-70"
            />

            {status.label}
          </span>

          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 sm:text-[12px]">
            Ví Point
          </span>
        </div>
      </section>

      {/* LÝ DO YÊU CẦU */}
      <section>
        <h3 className="text-[14px] font-semibold text-[#0F172A]">
          Lý do yêu cầu
        </h3>

        <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-700">
            {refund.reason || "Không có lý do được cung cấp."}
          </p>
        </div>
      </section>

      {/* THÔNG TIN YÊU CẦU */}
      <section>
        <h3 className="text-[14px] font-semibold text-[#0F172A]">
          Thông tin yêu cầu
        </h3>

        <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
          <DetailRow label="Mã yêu cầu">
            <div className="flex min-w-0 items-center justify-end gap-2">
              <span
                title={refund.id}
                className="min-w-0 truncate font-mono text-[12px] text-slate-700"
              >
                {refund.id.slice(0, 8)}…
              </span>

              <CopyField value={refund.id} />
            </div>
          </DetailRow>

          <DetailRow label="Mã giao dịch">
            <div className="flex min-w-0 items-center justify-end gap-2">
              <span
                title={refund.paymentId}
                className="min-w-0 truncate font-mono text-[12px] text-slate-700"
              >
                {refund.paymentId.slice(0, 8)}…
              </span>

              <CopyField value={refund.paymentId} />
            </div>
          </DetailRow>

          <DetailRow label="Ngày tạo">
            {formatPaymentDate(refund.createdAt)}
          </DetailRow>

          <DetailRow label="Hình thức hoàn">Ví Point</DetailRow>
        </dl>
      </section>

      {/* GHI CHÚ QUYẾT ĐỊNH */}
      {refund.decisionNote && (
        <section>
          <h3 className="text-[14px] font-semibold text-[#0F172A]">
            Ghi chú quyết định
          </h3>

          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-700">
              {refund.decisionNote}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

// ===================== MAIN MODAL =====================

// Component này chỉ được mount khi có dữ liệu refund.
// Khi đóng, component vẫn giữ dữ liệu ban đầu
// trong suốt animation đóng của Dialog.
function RefundDetailDialog({
  refund,
  open,
  onClose,
}: {
  refund: Refund;
  open: boolean;
  onClose: () => void;
}) {
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
        {/* HEADER */}
        <div
          className="
            flex shrink-0 items-start
            justify-between gap-4
            border-b border-slate-100
            px-4 pb-4
            pt-[max(1rem,env(safe-area-inset-top))]
            sm:px-7 sm:pb-5 sm:pt-6
          "
        >
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-[17px] font-semibold tracking-tight text-[#0F172A] sm:text-[19px]">
              Chi tiết yêu cầu hoàn tiền
            </DialogTitle>

            <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B] sm:text-[13px]">
              Thông tin giao dịch và yêu cầu hoàn tiền.
            </DialogDescription>
          </div>

          <button
            type="button"
            aria-label="Đóng chi tiết"
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

        {/* CONTENT */}
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
          <RefundDetails refund={refund} />
        </div>

        {/* FOOTER */}
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
              rounded-lg border
              border-slate-200 bg-white
              px-5 text-[13px] font-medium
              text-slate-700 transition-colors
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

// ===================== EXPORT =====================

export default function RefundDetail({
  refund,
  onClose,
}: {
  refund: Refund | null;
  onClose: () => void;
}) {
  // Giữ dữ liệu trong state để tránh mất nội dung
  // khi refund chuyển từ object sang null.
  const [lastRefund, setLastRefund] = useState<Refund | null>(null);

  const handleClose = () => {
    if (refund) {
      setLastRefund(refund);
    }

    onClose();
  };

  const displayRefund = refund ?? lastRefund;

  if (!displayRefund) {
    return null;
  }

  return (
    <RefundDetailDialog
      refund={displayRefund}
      open={Boolean(refund)}
      onClose={handleClose}
    />
  );
}
