"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  FileImage,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  MapPin,
  X,
} from "lucide-react";
import type {
  DisputeAction,
  Order,
  OrderDetail,
  OrderEvidence,
  OrderStatusHistoryItem,
} from "../types";
import {
  formatCurrency,
  PAYMENT_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/order-utils";

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

const DISPUTE_OPTIONS: {
  value: DisputeAction;
  title: string;
  description: string;
}[] = [
  {
    value: "resume_previous_state",
    title: "Khôi phục trạng thái trước tranh chấp",
    description:
      "Đưa đơn hàng trở về trạng thái trước khi phát sinh tranh chấp.",
  },
  {
    value: "cancel",
    title: "Hủy đơn hàng",
    description: "Kết thúc đơn hàng bằng quyết định hủy.",
  },
  {
    value: "complete",
    title: "Hoàn thành đơn hàng",
    description: "Đánh dấu đơn hàng đã hoàn thành sau khi xem xét.",
  },
];

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

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
  const evidenceUrls = evidences.map((evidence) => evidence.mediaUrl);

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
      if (event.key === "Escape") {
        if (previewIndex !== null) setPreviewIndex(null);
        else onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [order, onClose, previewIndex]);

  if (!order) return null;

  const currentStatus = detail?.status ?? order.status;
  const paymentState = detail?.paymentState ?? order.paymentState;
  const disputeReason = detail?.disputeReason ?? order.disputeReason;
  const previousStatus = detail?.disputePreviousStatus ?? order.previousStatus;
  const resolutionNote = detail?.disputeResolutionNote ?? order.resolutionNote;
  const canCancel =
    currentStatus === "created" || currentStatus === "confirmed";

  const isDisputed = currentStatus === "disputed";
  const evidenceCount = evidences.length;

  const resetAction = () => {
    setIsCancelling(false);
    setConfirming(false);
    setNote("");
    setAction("resume_previous_state");
    setActionError("");
  };

  const closeModal = () => {
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
    if (note.trim().length < 5) return;

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
      setActionError(
        submitError instanceof Error
          ? submitError.message
          : "Không thể cập nhật đơn hàng. Vui lòng thử lại.",
      );
    }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13px] text-[#0F172A] placeholder:text-slate-400 outline-none transition-colors focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14]";

  const infoItem = (label: string, value: React.ReactNode) => (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-2xs">
      <p className="mb-1.5 text-[12px] text-[#64748B]">{label}</p>
      <div className="text-[13px] font-semibold text-[#0F172A]">{value}</div>
    </div>
  );

  const actionForm = (
    <>
      <label className="mt-4 block text-[13px] font-semibold text-[#0F172A]">
        Lý do / Ghi chú xử lý <span className="text-red-500">*</span>
      </label>

      <textarea
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setConfirming(false);
          setActionError("");
        }}
        rows={3}
        placeholder="Nhập lý do xử lý đơn hàng..."
        className={`${inputClass} mt-2 resize-none`}
      />
      {note.trim().length > 0 && note.trim().length < 5 && (
        <p className="mt-1 text-xs text-red-600">
          Nội dung cần có ít nhất 5 ký tự.
        </p>
      )}
      {actionError && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {actionError}
        </p>
      )}

      {confirming ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <p className="font-semibold text-red-800">Xác nhận quyết định này?</p>
          <p className="mt-1 text-xs text-red-600">
            Thao tác sẽ gửi yêu cầu cập nhật đơn hàng lên hệ thống.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={isSubmitting}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-slate-50"
            >
              Quay lại
            </button>

            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isSubmitting}
              className="rounded-xl bg-rose-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
            >
              {isSubmitting ? "Đang xử lý..." : "Xác nhận quyết định"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={
              note.trim().length < 5 ||
              isSubmitting ||
              (!isCancelling &&
                action === "resume_previous_state" &&
                !previousStatus)
            }
            onClick={() => setConfirming(true)}
            className="rounded-xl bg-[#FF5E14] px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#E6530F] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCancelling ? "Xác nhận hủy đơn" : "Xác nhận giải quyết"}
          </button>
        </div>
      )}
    </>
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-3 backdrop-blur-xs sm:p-4 font-['Inter',sans-serif] text-[#0F172A]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          closeModal();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-detail-title"
        className="flex max-h-[92dvh] w-[calc(100vw-24px)] max-w-[760px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 bg-white px-5 py-4.5 sm:px-6">
          <div>
            <p className="text-[12px] font-medium text-[#64748B]">
              Chi tiết đơn hàng
            </p>

            <h2
              id="order-detail-title"
              className="mt-1 text-[19px] font-bold tracking-tight text-[#0F172A] sm:text-[20px]"
            >
              {order.orderCode}
            </h2>

            <p className="mt-1 text-[13px] text-[#64748B]">{order.service}</p>
          </div>

          <button
            type="button"
            onClick={closeModal}
            aria-label="Đóng"
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#0F172A]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${
                STATUS_COLORS[currentStatus]
              }`}
            >
              {STATUS_LABELS[currentStatus]}
            </span>

            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-medium text-slate-600">
              {PAYMENT_LABELS[paymentState]}
            </span>
          </div>

          {isLoading && (
            <p className="mt-4 text-sm text-slate-500">
              Đang tải chi tiết, lịch sử và bằng chứng...
            </p>
          )}
          {error && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={onRetry}
                className="font-semibold underline underline-offset-2"
              >
                Thử lại
              </button>
            </div>
          )}

          {!isCancelling ? (
            <>
              <div className="mt-5 flex gap-1 overflow-x-auto border-b border-slate-100">
                {TABS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleTabChange(item.value)}
                    className={`shrink-0 border-b-2 px-4 py-3 text-[13px] font-semibold transition-colors ${
                      tab === item.value
                        ? "border-[#FF5E14] text-[#FF5E14]"
                        : "border-transparent text-[#64748B] hover:text-[#0F172A]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="pt-5">
                {tab === "overview" && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {infoItem("UUID khách hàng", order.customer)}
                      {infoItem("UUID thợ", order.worker)}
                      {infoItem(
                        "Giá trị đơn hàng",
                        <span className="text-orange-600">
                          {formatCurrency(
                            detail ? Number(detail.agreedPrice) : order.price,
                          )}
                        </span>,
                      )}
                      {infoItem("Thanh toán", PAYMENT_LABELS[paymentState])}
                      {infoItem("Ngày tạo", formatDateTime(order.createdAt))}
                      {infoItem(
                        "Địa chỉ thực hiện",
                        <span className="flex items-center gap-2">
                          <MapPin
                            size={15}
                            className="shrink-0 text-slate-400"
                          />
                          {order.address}
                        </span>,
                      )}
                      {infoItem("UUID đơn hàng", order.id)}
                    </div>

                    {infoItem("Nội dung công việc", order.service)}
                  </div>
                )}

                {tab === "history" && (
                  <div>
                    <h3 className="mb-5 text-[14px] font-semibold text-[#0F172A]">
                      Lịch sử trạng thái
                    </h3>

                    {history.length === 0 ? (
                      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
                        Chưa có lịch sử trạng thái.
                      </p>
                    ) : (
                      <div className="space-y-0">
                        {history.map((item, index) => (
                          <div key={item.id} className="flex gap-4">
                            <div className="flex flex-col items-center">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-[#FF5E14]">
                                <Clock3 size={15} />
                              </div>

                              {index < history.length - 1 && (
                                <div className="min-h-10 w-px flex-1 bg-slate-200" />
                              )}
                            </div>

                            <div className="pb-6">
                              <p className="text-[13px] font-semibold text-[#0F172A]">
                                {item.fromStatus
                                  ? `${STATUS_LABELS[item.fromStatus]} → ${STATUS_LABELS[item.toStatus]}`
                                  : `Đơn hàng được tạo: ${STATUS_LABELS[item.toStatus]}`}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {item.reason || "Không có ghi chú"}
                              </p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatDateTime(item.createdAt)}
                                {item.changedByUserId
                                  ? ` · Người thực hiện: ${item.changedByUserId}`
                                  : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === "evidence" && (
                  <div>
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-[14px] font-semibold text-[#0F172A]">
                        Bằng chứng công việc
                      </h3>

                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                        {evidenceCount} tệp
                      </span>
                    </div>

                    {evidenceCount > 0 ? (
                      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                        {evidences.map((evidence, index) => (
                          <div
                            key={evidence.id}
                            className="flex flex-col rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs"
                          >
                            {/* <span className="mb-2 block text-[12px] font-medium text-slate-600">
                              Bằng chứng {index + 1} · {evidence.mediaType}
                            </span> */}
                            <button
                              type="button"
                              onClick={() => setPreviewIndex(index)}
                              aria-label={`Xem lớn bằng chứng ${index + 1}`}
                              className="group relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 focus-visible:outline-2 focus-visible:outline-[#FF5E14]"
                            >
                              {evidence.mediaType === "video" ? (
                                <video
                                  src={evidence.mediaUrl}
                                  className="h-full w-full object-cover"
                                  muted
                                  preload="metadata"
                                />
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={evidence.mediaUrl}
                                  alt={`Bằng chứng ${index + 1}`}
                                  className="h-full w-full object-cover"
                                />
                              )}
                              <span className="absolute bottom-2 right-2 rounded-lg bg-slate-900/70 p-1.5 text-white opacity-80 transition-opacity group-hover:opacity-100">
                                <ZoomIn size={16} />
                              </span>
                            </button>
                            <p className="mt-2 text-xs text-slate-500">
                              {evidence.description ||
                                formatDateTime(evidence.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 shadow-2xs">
                        <div className="flex aspect-[4/3] max-h-52 w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-100 bg-slate-50 text-[12px] text-slate-400">
                          <FileImage size={25} strokeWidth={1.5} />
                          Chưa có bằng chứng
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {tab === "dispute" && (
                  <div className="space-y-4">
                    {disputeReason ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                        <div className="flex items-center gap-2 font-semibold text-red-800">
                          <AlertTriangle size={18} />
                          Nội dung tranh chấp
                        </div>

                        <p className="mt-3 text-sm leading-6 text-red-800">
                          {disputeReason}
                        </p>

                        {previousStatus && (
                          <p className="mt-3 text-xs text-red-600">
                            Trạng thái trước tranh chấp:{" "}
                            {STATUS_LABELS[previousStatus]}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border border-slate-200/80 bg-white p-4 text-[13px] text-[#64748B]">
                        Đơn hàng không có tranh chấp đang chờ xử lý.
                      </div>
                    )}

                    {isDisputed && (
                      <div>
                        <h3 className="mb-4 text-[14px] font-semibold text-[#0F172A]">
                          Giải quyết tranh chấp
                        </h3>

                        <div className="space-y-2">
                          {DISPUTE_OPTIONS.map((option) => (
                            <label
                              key={option.value}
                              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                                action === option.value
                                  ? "border-[#FF5E14] bg-[#FFF7ED]"
                                  : "border-slate-200 bg-white hover:bg-slate-50/70"
                              }`}
                            >
                              <input
                                type="radio"
                                name="dispute-action"
                                value={option.value}
                                checked={action === option.value}
                                onChange={() => {
                                  setAction(option.value);
                                  setConfirming(false);
                                }}
                                className="mt-1 accent-[#FF5E14]"
                              />

                              <div>
                                <p className="text-[13px] font-semibold text-[#0F172A]">
                                  {option.title}
                                </p>
                                <p className="mt-1 text-xs leading-5 text-slate-500">
                                  {option.description}
                                </p>
                              </div>
                            </label>
                          ))}
                        </div>

                        {actionForm}
                      </div>
                    )}

                    {resolutionNote && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="flex items-center gap-2 text-sm font-semibold text-green-800">
                          <CheckCircle2 size={17} />
                          Ghi chú xử lý của Admin
                        </p>
                        <p className="mt-2 text-sm text-green-700">
                          {resolutionNote}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-6">
              <button
                type="button"
                onClick={resetAction}
                className="text-[13px] font-medium text-[#64748B] hover:text-[#FF5E14]"
              >
                ← Quay lại chi tiết
              </button>

              <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-red-800">
                  <Ban size={18} />
                  Hủy đơn hàng
                </div>

                <p className="mt-2 text-sm text-red-700">
                  Đơn hàng sẽ chuyển sang trạng thái Đã hủy sau khi xác nhận.
                </p>
              </div>

              {actionForm}
            </div>
          )}

          {success && (
            <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[13px] text-emerald-700">
              <CheckCircle2 size={18} />
              {success}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-3 sm:px-6">
          <div>
            {canCancel && !isCancelling && (
              <button
                type="button"
                onClick={() => {
                  setIsCancelling(true);
                  setConfirming(false);
                  setNote("");
                  setSuccess("");
                }}
                className="flex h-9 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3.5 text-[13px] font-medium text-rose-600 transition-colors hover:bg-rose-50"
              >
                <Ban size={16} />
                Hủy đơn hàng
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={closeModal}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-medium text-[#0F172A] transition-colors hover:bg-slate-50"
          >
            Đóng
          </button>
        </div>
      </div>
      {previewIndex !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Xem bằng chứng ${previewIndex + 1}`}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreviewIndex(null);
          }}
        >
          <div className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col items-center gap-4">
            <div className="flex w-full items-center justify-between text-sm font-medium text-white">
              <span>
                Bằng chứng {previewIndex + 1} / {evidenceCount}
              </span>
              <button
                type="button"
                onClick={() => setPreviewIndex(null)}
                aria-label="Đóng xem ảnh"
                className="rounded-lg p-2 hover:bg-white/15"
              >
                <X size={22} />
              </button>
            </div>
            <div className="flex min-h-56 w-full items-center justify-center overflow-hidden rounded-xl bg-white/10">
              {evidences[previewIndex]?.mediaType === "video" ? (
                <video
                  src={evidences[previewIndex].mediaUrl}
                  controls
                  autoPlay
                  className="max-h-[70dvh] max-w-full"
                />
              ) : evidenceUrls[previewIndex] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={evidenceUrls[previewIndex]}
                  alt={`Bằng chứng ${previewIndex + 1}`}
                  className="max-h-[70dvh] max-w-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 p-8 text-center text-slate-200">
                  <FileImage size={42} strokeWidth={1.5} />
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
                  className="rounded-lg border border-white/30 p-2 hover:bg-white/15"
                >
                  <ChevronLeft size={20} />
                </button>
                <span className="text-xs">
                  {previewIndex + 1} / {evidenceCount}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setPreviewIndex((previewIndex + 1) % evidenceCount)
                  }
                  aria-label="Bằng chứng tiếp theo"
                  className="rounded-lg border border-white/30 p-2 hover:bg-white/15"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
