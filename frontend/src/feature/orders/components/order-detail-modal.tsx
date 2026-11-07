"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileImage,
  X,
} from "lucide-react";

import {
  PAYMENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/order-utils";

import OrderOverviewTab from "./order-overview-tab";
import OrderHistoryTab from "./order-history-tab";
import OrderEvidenceTab from "./order-evidence-tab";
import OrderDisputeTab from "./order-dispute-tab";

import type {
  DisputeAction,
  Order,
  OrderDetail,
  OrderEvidence,
  OrderStatusHistoryItem,
} from "../types";

type Tab = "overview" | "history" | "evidence" | "dispute";

interface OrderDetailModalProps {
  order: Order | null;
  detail: OrderDetail | null;
  history: OrderStatusHistoryItem[];
  evidences: OrderEvidence[];
  isLoading: boolean;
  error: string | null;
  isSubmitting: boolean;
  onRetry: () => void;
  onClose: () => void;
  onCancelOrder: (orderId: string, reason: string) => Promise<void>;
  onResolveDispute: (
    orderId: string,
    action: DisputeAction,
    resolutionNote: string,
  ) => Promise<void>;
}

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Tổng quan" },
  { value: "history", label: "Lịch sử" },
  { value: "evidence", label: "Bằng chứng" },
  { value: "dispute", label: "Tranh chấp" },
];

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5E14]";

export default function OrderDetailModal({
  order,
  detail,
  history,
  evidences,
  isLoading,
  error,
  isSubmitting,
  onRetry,
  onClose,
  onCancelOrder,
  onResolveDispute,
}: OrderDetailModalProps) {
  const [tab, setTab] = useState<Tab>(
    order?.status === "disputed" ? "dispute" : "overview",
  );

  const [isCancelling, setIsCancelling] = useState(false);
  const [action, setAction] = useState<DisputeAction>("resume_previous_state");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState("");
  const [actionError, setActionError] = useState("");
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const evidenceCount = evidences.length;

  useEffect(() => {
    if (!order) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [order]);

  useEffect(() => {
    if (!order) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (previewIndex !== null) {
        setPreviewIndex(null);
        return;
      }

      if (confirming) {
        if (!isSubmitting) setConfirming(false);
        return;
      }

      if (!isSubmitting) onClose();
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [order, onClose, previewIndex, confirming, isSubmitting]);

  if (!order) return null;

  const currentStatus = detail?.status ?? order.status;
  const paymentState = detail?.paymentState ?? order.paymentState;
  const disputeReason = detail?.disputeReason ?? order.disputeReason;
  const previousStatus = detail?.disputePreviousStatus ?? order.previousStatus;
  const resolutionNote = detail?.disputeResolutionNote ?? order.resolutionNote;

  const canCancel =
    currentStatus === "created" || currentStatus === "confirmed";

  const isDisputed = currentStatus === "disputed";

  const canSubmit =
    note.trim().length >= 5 &&
    !isSubmitting &&
    (isCancelling ||
      action !== "resume_previous_state" ||
      Boolean(previousStatus));

  const showFooter =
    isCancelling || canCancel || (tab === "dispute" && isDisputed);

  const resetAction = () => {
    setIsCancelling(false);
    setConfirming(false);
    setNote("");
    setAction("resume_previous_state");
    setActionError("");
  };

  const closeModal = () => {
    if (isSubmitting) return;

    resetAction();
    setSuccess("");
    setPreviewIndex(null);
    onClose();
  };

  const handleTabChange = (value: Tab) => {
    setTab(value);
    resetAction();
  };

  const handleConfirm = async () => {
    if (!canSubmit || !confirming) return;

    setActionError("");

    try {
      if (isCancelling) {
        await onCancelOrder(order.id, note.trim());
        setSuccess("Đơn hàng đã được hủy.");
      } else {
        await onResolveDispute(order.id, action, note.trim());
        setSuccess("Tranh chấp đã được giải quyết.");
      }

      setConfirming(false);
      setIsCancelling(false);
      setNote("");
    } catch (submitError) {
      setConfirming(false);
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "Không thể cập nhật đơn hàng. Vui lòng thử lại.",
      );
    }
  };

  // Chữ 16px trên mobile để iOS Safari không tự zoom trang khi focus vào ô nhập.
  const inputClass =
    "w-full min-w-0 rounded-xl border border-slate-200 bg-white " +
    "px-3.5 py-3 text-[16px] text-slate-900 sm:text-[13px] " +
    "placeholder:text-slate-400 outline-none " +
    "transition-[border-color,box-shadow] duration-150 " +
    "focus:border-[#FF5E14] focus:ring-4 focus:ring-orange-50";

  const actionForm = (
    <>
      <label
        htmlFor="order-action-note"
        className="mt-5 block text-[13px] font-medium text-slate-900"
      >
        {isCancelling ? "Lý do hủy đơn hàng" : "Lý do đưa ra quyết định"}{" "}
        <span className="text-rose-500">*</span>
      </label>

      {!isCancelling && (
        <p className="mt-1 text-[12px] leading-5 text-slate-500">
          Giải thích ngắn gọn căn cứ đưa ra quyết định sau khi xem xét tranh
          chấp và bằng chứng.
        </p>
      )}

      <textarea
        id="order-action-note"
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setActionError("");
        }}
        rows={3}
        placeholder={
          isCancelling
            ? "Nhập lý do hủy đơn hàng..."
            : "Nhập lý do lựa chọn phương án giải quyết tranh chấp này..."
        }
        className={`${inputClass} mt-2 resize-y`}
      />

      {note.trim().length > 0 && note.trim().length < 5 && (
        <p className="mt-1.5 text-xs text-rose-600">
          Nội dung cần có ít nhất 5 ký tự.
        </p>
      )}

      {actionError && (
        <p role="alert" className="mt-2 break-words text-[13px] text-rose-600">
          {actionError}
        </p>
      )}
    </>
  );

  // Render qua portal ra <body> để không bị ảnh hưởng bởi transform / overflow /
  // z-index của layout cha (nguyên nhân hay gặp khiến modal fixed bị tràn hoặc lệch).
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden overscroll-contain bg-slate-950/40 p-0 font-['Inter',sans-serif] text-slate-900 antialiased backdrop-blur-[3px] sm:p-4 lg:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeModal();
        }
      }}
    >
      {/* MAIN MODAL */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
        className="
          flex h-full min-h-0 w-full min-w-0 max-w-full flex-col
          overflow-hidden bg-white
          shadow-[0_24px_60px_-12px_rgba(15,23,42,0.28)]
          sm:h-auto sm:max-h-full sm:max-w-[720px]
          sm:rounded-2xl
        "
      >
        {/* HEADER */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:gap-4 sm:border-b-0 sm:px-7 sm:pb-4 sm:pt-6">
          <div className="min-w-0 flex-1">
            <h2
              id="order-detail-title"
              className="break-all font-mono text-[16px] font-semibold tracking-tight text-slate-900 sm:text-[19px]"
            >
              {order.orderCode}
            </h2>

            <p className="mt-1 line-clamp-2 break-words text-[12px] text-slate-500 sm:text-[13px]">
              {order.service}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span
                className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:text-[12px] ${
                  STATUS_COLORS[currentStatus]
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70"
                />

                {STATUS_LABELS[currentStatus]}
              </span>

              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 sm:text-[12px]">
                {PAYMENT_LABELS[paymentState]}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={closeModal}
            disabled={isSubmitting}
            aria-label="Đóng"
            className={`-mr-1 -mt-1 inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9 ${FOCUS_RING}`}
          >
            <X size={20} />
          </button>
        </div>

        {/* TABS: chia đều chiều ngang trên mobile, cuộn ngang nếu vẫn không đủ chỗ */}
        {!isCancelling && (
          <div
            role="tablist"
            aria-label="Thông tin đơn hàng"
            className="
              flex w-full shrink-0 gap-0 overflow-x-auto
              overscroll-x-contain border-b border-slate-100
              px-1 [scrollbar-width:none]
              [&::-webkit-scrollbar]:hidden
              sm:gap-1 sm:px-5
            "
          >
            {TABS.map((item) => {
              const active = tab === item.value;

              return (
                <button
                  key={item.value}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => handleTabChange(item.value)}
                  className={`relative flex-1 shrink-0 cursor-pointer whitespace-nowrap px-2.5 py-3 text-[12px] font-medium transition-colors sm:flex-none sm:px-3 sm:text-[13px] ${FOCUS_RING} ${
                    active
                      ? "text-slate-900"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    {item.label}

                    {item.value === "evidence" && evidenceCount > 0 && (
                      <span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-600">
                        {evidenceCount}
                      </span>
                    )}

                    {item.value === "dispute" && isDisputed && (
                      <span
                        aria-label="Đang tranh chấp"
                        className="h-1.5 w-1.5 rounded-full bg-[#FF5E14]"
                      />
                    )}
                  </span>

                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-2.5 -bottom-px h-0.5 rounded-full transition-opacity sm:inset-x-3 ${
                      active ? "bg-[#FF5E14] opacity-100" : "opacity-0"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* BODY - CHỈ MỘT VÙNG CUỘN */}
        <div
          className="
            min-h-0 min-w-0 flex-1
            overflow-x-hidden overflow-y-auto
            overscroll-contain
            [scrollbar-width:thin]
            [scrollbar-color:#CBD5E1_transparent]
          "
        >
          <div
            className={`min-w-0 px-4 pt-5 sm:px-7 sm:pt-6 ${
              showFooter
                ? "pb-5 sm:pb-6"
                : "pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6"
            }`}
          >
            {isLoading && (
              <p
                role="status"
                className="mb-5 flex items-center gap-2 text-[12px] text-slate-500 sm:text-[13px]"
              >
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-slate-400" />
                Đang tải chi tiết, lịch sử và bằng chứng...
              </p>
            )}

            {error && (
              <div
                role="alert"
                className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50/70 px-3.5 py-3 text-[13px] text-rose-700 sm:px-4"
              >
                <span className="min-w-0 flex-1 break-words">{error}</span>

                <button
                  type="button"
                  onClick={onRetry}
                  className={`shrink-0 cursor-pointer rounded-md font-semibold underline underline-offset-2 ${FOCUS_RING}`}
                >
                  Thử lại
                </button>
              </div>
            )}

            {!isCancelling ? (
              <div role="tabpanel" className="min-w-0">
                {tab === "overview" && (
                  <OrderOverviewTab
                    order={order}
                    detail={detail}
                    paymentState={paymentState}
                  />
                )}

                {tab === "history" && <OrderHistoryTab history={history} />}

                {tab === "evidence" && (
                  <OrderEvidenceTab
                    evidences={evidences}
                    onPreview={setPreviewIndex}
                  />
                )}

                {tab === "dispute" && (
                  <OrderDisputeTab
                    disputeReason={disputeReason}
                    previousStatus={previousStatus}
                    resolutionNote={resolutionNote}
                    isDisputed={isDisputed}
                    action={action}
                    onActionChange={setAction}
                    onResetConfirmation={() => {
                      setConfirming(false);
                      setActionError("");
                    }}
                    actionForm={actionForm}
                  />
                )}
              </div>
            ) : (
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={resetAction}
                  className={`inline-flex cursor-pointer items-center gap-1 rounded-md text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-900 ${FOCUS_RING}`}
                >
                  <ChevronLeft size={15} />
                  Quay lại chi tiết
                </button>

                <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50/60 p-3.5 sm:p-4">
                  <div className="flex items-center gap-2 text-[13px] font-semibold text-rose-900">
                    <Ban size={16} className="shrink-0" />
                    Hủy đơn hàng
                  </div>

                  <p className="mt-1.5 text-[13px] leading-6 text-rose-800/90">
                    Đơn hàng sẽ chuyển sang trạng thái Đã hủy sau khi xác nhận.
                  </p>
                </div>

                {actionForm}
              </div>
            )}

            {success && (
              <div
                role="status"
                className="mt-6 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3.5 py-3 text-[13px] text-emerald-800 sm:px-4"
              >
                <CheckCircle2 size={17} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">{success}</span>
              </div>
            )}
          </div>
        </div>

        {/* FOOTER */}
        {showFooter && (
          <div
            className="
              flex shrink-0 items-center justify-end
              border-t border-slate-100 bg-slate-50/50
              px-4 py-3
              pb-[max(0.75rem,env(safe-area-inset-bottom))]
              sm:px-7 sm:py-3
            "
          >
            {isCancelling ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!canSubmit}
                className={`inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-rose-600 px-5 text-[13px] font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:h-10 sm:w-auto ${FOCUS_RING}`}
              >
                Xác nhận hủy đơn
              </button>
            ) : canCancel ? (
              <button
                type="button"
                onClick={() => {
                  setIsCancelling(true);
                  setConfirming(false);
                  setNote("");
                  setSuccess("");
                  setActionError("");
                }}
                className={`inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white px-5 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50 sm:h-10 sm:w-auto ${FOCUS_RING}`}
              >
                <Ban size={15} />
                Hủy đơn hàng
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={!canSubmit}
                className={`inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-[#FF5E14] px-5 text-[13px] font-medium text-white transition-colors hover:bg-[#E65310] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 sm:h-10 sm:w-auto ${FOCUS_RING}`}
              >
                Xác nhận giải quyết
              </button>
            )}
          </div>
        )}
      </div>

      {/* HỘP THOẠI XÁC NHẬN */}
      {confirming && (
        <div
          role="presentation"
          className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-slate-950/50 p-3 backdrop-blur-[2px] sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSubmitting) {
              setConfirming(false);
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="order-confirm-title"
            aria-describedby="order-confirm-description"
            className="max-h-full w-full max-w-[420px] overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <AlertTriangle size={20} />
              </div>

              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={isSubmitting}
                aria-label="Đóng xác nhận"
                className={`-mr-2 -mt-2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 ${FOCUS_RING}`}
              >
                <X size={19} />
              </button>
            </div>

            <h3
              id="order-confirm-title"
              className="mt-4 text-[16px] font-semibold text-slate-900"
            >
              {isCancelling
                ? "Xác nhận hủy đơn hàng"
                : "Xác nhận giải quyết tranh chấp"}
            </h3>

            <p
              id="order-confirm-description"
              className="mt-2 text-[13px] leading-6 text-slate-500"
            >
              {isCancelling
                ? "Bạn có chắc chắn muốn hủy đơn hàng này không? Hành động sẽ cập nhật trạng thái đơn hàng."
                : "Bạn có chắc chắn muốn giải quyết tranh chấp này không? Hành động sẽ cập nhật trạng thái đơn hàng."}
            </p>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={!canSubmit}
                className={`inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#FF5E14] px-5 text-[13px] font-medium text-white transition-colors hover:bg-[#E65310] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:w-auto ${FOCUS_RING}`}
              >
                {isSubmitting ? "Đang xử lý..." : "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX */}
      {previewIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Xem bằng chứng ${previewIndex + 1}`}
          className="fixed inset-0 z-[110] flex items-center justify-center overflow-hidden bg-slate-950/90 p-3 backdrop-blur-sm sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPreviewIndex(null);
            }
          }}
        >
          <div className="relative flex max-h-full w-full max-w-4xl flex-col items-center gap-3 sm:gap-4">
            <div className="flex w-full items-center justify-between gap-3 text-[12px] font-medium text-white/90 sm:text-[13px]">
              <span className="tabular-nums">
                Bằng chứng {previewIndex + 1} / {evidenceCount}
              </span>

              <button
                type="button"
                onClick={() => setPreviewIndex(null)}
                aria-label="Đóng xem ảnh"
                className="cursor-pointer rounded-full p-2 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex min-h-0 w-full items-center justify-center overflow-hidden rounded-xl">
              {evidences[previewIndex]?.mediaType === "video" ? (
                <video
                  src={evidences[previewIndex].mediaUrl}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[70dvh] max-w-full rounded-xl"
                />
              ) : evidences[previewIndex]?.mediaUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={evidences[previewIndex].mediaUrl}
                  alt={`Bằng chứng ${previewIndex + 1}`}
                  className="max-h-[70dvh] max-w-full rounded-xl object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 p-6 text-center text-slate-200 sm:p-8">
                  <FileImage size={40} strokeWidth={1.5} />

                  <p className="text-sm font-medium">
                    Không có bằng chứng để xem trước
                  </p>

                  <p className="text-xs text-slate-400">
                    Thông tin bằng chứng hiện không có URL hợp lệ.
                  </p>
                </div>
              )}
            </div>

            {evidenceCount > 1 && (
              <div className="flex items-center gap-4 text-white">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewIndex(
                      (previewIndex - 1 + evidenceCount) % evidenceCount,
                    )
                  }
                  aria-label="Bằng chứng trước"
                  className="cursor-pointer rounded-full border border-white/25 p-2.5 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <ChevronLeft size={18} />
                </button>

                <span className="text-xs tabular-nums text-white/80">
                  {previewIndex + 1} / {evidenceCount}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    setPreviewIndex((previewIndex + 1) % evidenceCount)
                  }
                  aria-label="Bằng chứng tiếp theo"
                  className="cursor-pointer rounded-full border border-white/25 p-2.5 transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
