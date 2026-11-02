"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  History,
  ScanText,
  ScanFace,
} from "lucide-react";
import { KYC_STATUS_CONFIG, KycRecord } from "../types/type";
import { useKycDetailQuery } from "../hooks/use-kyc";
import { Skeleton } from "@/components/ui/skeleton";

export interface KycDetailModalProps {
  isOpen: boolean;
  record: KycRecord | null;
  onClose: () => void;
  onApprove: (id: string, note: string) => void | Promise<void>;
  onReject: (id: string, reason: string) => void | Promise<void>;
}

interface VerificationImageProps {
  url: string | null;
  title: string;
}

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "-";

const VerificationImage: React.FC<VerificationImageProps> = ({
  url,
  title,
}) => {
  const [failed, setFailed] = useState(false);
  if (!url)
    return (
      <div className="h-full w-full flex items-center justify-center text-[12px] text-slate-400">
        Chưa có ảnh
      </div>
    );
  if (failed)
    return (
      <div className="h-full w-full flex items-center justify-center text-[12px] text-slate-400">
        Không thể tải ảnh
      </div>
    );
  return (
    <img
      src={url}
      alt={title}
      onError={() => setFailed(true)}
      className="h-full w-full object-contain"
    />
  );
};

type AiObject = Record<string, unknown>;

const isAiObject = (value: unknown): value is AiObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getAiField = (value: unknown, key: string): unknown =>
  isAiObject(value) ? (value[key] ?? null) : null;

const formatSimilarity = (value: unknown): string => {
  const score = typeof value === "string" ? Number(value) : value;
  if (typeof score !== "number" || !Number.isFinite(score))
    return "Chưa có dữ liệu";
  return score >= 0 && score <= 1
    ? `${(score * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`
    : String(score);
};

const formatDocumentMatch = (value: unknown): string => {
  if (value === true) return "Trùng khớp";
  if (value === false) return "Không trùng khớp";
  return "Chưa có dữ liệu";
};

const formatDocumentType = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) return "Chưa có dữ liệu";
  const labels: Record<string, string> = {
    CCCD: "Căn cước công dân",
    CMND: "Chứng minh nhân dân",
    PASSPORT: "Hộ chiếu",
  };
  return labels[value.toUpperCase()] ?? value;
};

const getDocumentImageLabels = (value: string | null) => {
  const documentType = value?.trim().toUpperCase();

  if (documentType === "CCCD") {
    return ["CCCD mặt trước", "CCCD mặt sau"] as const;
  }
  if (documentType === "CMND") {
    return ["CMND mặt trước", "CMND mặt sau"] as const;
  }
  if (documentType === "PASSPORT") {
    return ["Hộ chiếu - trang thông tin", "Hộ chiếu - trang bổ sung"] as const;
  }

  return ["Giấy tờ - mặt trước", "Giấy tờ - mặt sau"] as const;
};

const formatMatchStatus = (value: unknown): string => {
  if (value === "review-ready") return "Sẵn sàng xét duyệt";
  if (value === "pending") return "Đang chờ xử lý";
  if (value === "processing") return "Đang phân tích";
  if (value === "completed") return "Đã phân tích";
  if (value === "match") return "Trùng khớp";
  if (value === "not_match") return "Không trùng khớp";

  return "Chưa có dữ liệu";
};
const formatKycStatus = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) {
    return "Chưa có dữ liệu";
  }

  const statusLabels: Record<string, string> = {
    draft: "Bản nháp",
    submitted: "Chờ xử lý",
    reviewing: "Chờ xét duyệt",
    approved: "Đã duyệt",
    rejected: "Đã từ chối",
  };

  return statusLabels[value.toLowerCase()] ?? value;
};

const formatYesNo = (value: unknown): string =>
  value === true ? "Có" : value === false ? "Không" : "Chưa có dữ liệu";

const formatJobStatus = (value: unknown): string => {
  if (value === "completed") return "Hoàn thành";
  if (value === "failed") return "Thất bại";
  if (value === "processing") return "Đang xử lý";
  if (value === "pending") return "Đang chờ";
  return displayValue(value);
};

const getFocusableElements = (container: HTMLElement | null) =>
  Array.from(
    container?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  ).filter((element) => element.getClientRects().length > 0);

const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  return "Dữ liệu chi tiết";
};

const InfoRow = ({ label, value }: { label: string; value: unknown }) => (
  <div className="flex items-start justify-between gap-3 px-3.5 py-2.5 text-[12px]">
    <span className="shrink-0 text-slate-500">{label}</span>
    <span className="min-w-0 break-words text-right font-medium text-slate-800">
      {displayValue(value)}
    </span>
  </div>
);

const InfoRows = ({ rows }: { rows: [string, unknown][] }) => (
  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
    {rows.map(([label, value]) => (
      <InfoRow key={label} label={label} value={value} />
    ))}
  </div>
);

const CollapsibleSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <details className="group rounded-xl border border-slate-200/80 bg-white">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[14px] font-semibold text-[#0F172A] [&::-webkit-details-marker]:hidden">
      {title}
      <ChevronDown className="h-4 w-4 text-slate-500 transition-transform group-open:rotate-180" />
    </summary>
    <div className="space-y-3 border-t border-slate-100 p-3">{children}</div>
  </details>
);

const KycDetailModalContent: React.FC<KycDetailModalProps> = ({
  isOpen,
  record,
  onClose,
  onApprove,
  onReject,
}) => {
  const [isCopied, setIsCopied] = useState(false);

  // Dialog states
  const [isApproveOpen, setIsApproveOpen] = useState(false);
  const [approveNote, setApproveNote] = useState("");
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [previewImage, setPreviewImage] = useState<{
    url: string | null;
    title: string;
  } | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const approveDialogRef = useRef<HTMLDivElement>(null);
  const rejectDialogRef = useRef<HTMLDivElement>(null);
  const previewDialogRef = useRef<HTMLDivElement>(null);
  const approveTriggerRef = useRef<HTMLButtonElement>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const {
    data: detailRecord,
    isPending: isDetailPending,
    isError: isDetailError,
    isFetching: isDetailFetching,
    refetch: refetchDetail,
  } = useKycDetailQuery(isOpen ? record?.id : undefined);

  // Focus của modal chính: lưu phần tử đã mở modal và trả lại khi đóng.
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    returnFocusRef.current = previousFocus;
    modalRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  // Chỉ quản lý focus của cửa sổ đang mở, không làm ảnh hưởng các cửa sổ khác.
  useEffect(() => {
    if (!isApproveOpen) return;
    approveDialogRef.current
      ?.querySelector<HTMLElement>("[data-autofocus]")
      ?.focus();
    return () => {
      if (approveTriggerRef.current?.isConnected)
        approveTriggerRef.current.focus();
      approveTriggerRef.current = null;
    };
  }, [isApproveOpen]);

  useEffect(() => {
    if (!isRejectOpen) return;
    rejectDialogRef.current
      ?.querySelector<HTMLElement>("[data-autofocus]")
      ?.focus();
    return () => {
      if (rejectTriggerRef.current?.isConnected)
        rejectTriggerRef.current.focus();
      rejectTriggerRef.current = null;
    };
  }, [isRejectOpen]);

  useEffect(() => {
    if (!previewImage) return;
    previewDialogRef.current
      ?.querySelector<HTMLElement>("[data-autofocus]")
      ?.focus();
    return () => {
      if (previewTriggerRef.current?.isConnected)
        previewTriggerRef.current.focus();
      previewTriggerRef.current = null;
    };
  }, [previewImage]);

  useEffect(() => {
    if (!isOpen) return;

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      const activeDialog = previewImage
        ? previewDialogRef.current
        : isRejectOpen
          ? rejectDialogRef.current
          : isApproveOpen
            ? approveDialogRef.current
            : modalRef.current;

      if (event.key === "Escape") {
        event.preventDefault();
        if (isSubmitting) return;
        if (previewImage) {
          setPreviewImage(null);
        } else if (isRejectOpen) {
          setIsRejectOpen(false);
          setRejectReason("");
          setRejectError("");
          setSubmitError("");
        } else if (isApproveOpen) {
          setIsApproveOpen(false);
          setApproveNote("");
          setSubmitError("");
        } else {
          onClose();
        }
        return;
      }

      if (event.key !== "Tab" || !activeDialog) return;

      const focusableElements = getFocusableElements(activeDialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        activeDialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      } else if (!activeDialog.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [
    isOpen,
    isApproveOpen,
    isRejectOpen,
    isSubmitting,
    previewImage,
    onClose,
  ]);

  if (!isOpen || !record) return null;

  // Chỉ sử dụng dữ liệu từ API chi tiết để xét duyệt.
  // record chỉ dùng làm dữ liệu dự phòng trong lúc tải.
  const kyc = detailRecord ?? record;
  const workerName =
    kyc.workerProfile?.user?.fullName ??
    record.workerProfile?.user?.fullName ??
    "Thợ";
  const workerAvatarUrl =
    kyc.workerProfile?.user?.avatarUrl ?? record.workerProfile?.user?.avatarUrl;
  // Các trường mở rộng lấy nguyên từ response chi tiết BE; không suy diễn dữ liệu.
  const detail = kyc as KycRecord & Record<string, unknown>;
  const ocr = isAiObject(detail.rawOcrData) ? detail.rawOcrData : null;
  const aiResult = isAiObject(detail.aiResult) ? detail.aiResult : null;
  const face = isAiObject(aiResult?.faceVerification)
    ? aiResult.faceVerification
    : null;
  const documentImageLabels = getDocumentImageLabels(kyc.idDocumentType);
  const jobs = Array.isArray(detail.jobs) ? detail.jobs : [];
  const histories = Array.isArray(detail.reviewHistories)
    ? detail.reviewHistories
    : [];
  const detailReady = !!detailRecord && !isDetailError;

  const canReview =
    detailReady && !isDetailFetching && kyc.status === "reviewing";
  const statusConfig = KYC_STATUS_CONFIG[kyc.status];
  const displayCode = kyc.id;
  const shortDisplayCode = `${kyc.id.slice(0, 8)}…${kyc.id.slice(-4)}`;

  const handleCopyCode = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(displayCode);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleApproveConfirm = async () => {
    if (!canReview || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      await onApprove(kyc.id, approveNote.trim());
      setIsApproveOpen(false);
      setApproveNote("");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Phê duyệt thất bại. Vui lòng thử lại.",
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!canReview || submittingRef.current) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setRejectError("Vui lòng nhập lý do từ chối hồ sơ này");
      return;
    }
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      await onReject(kyc.id, reason);
      setIsRejectOpen(false);
      setRejectReason("");
      setRejectError("");
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Từ chối thất bại. Vui lòng thử lại.",
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const cancelApprove = () => {
    if (isSubmitting) return;
    setIsApproveOpen(false);
    setApproveNote("");
    setSubmitError("");
  };

  const cancelReject = () => {
    if (isSubmitting) return;
    setIsRejectOpen(false);
    setRejectReason("");
    setRejectError("");
    setSubmitError("");
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 font-['Inter',sans-serif] text-[#0F172A]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kyc-detail-title"
        tabIndex={-1}
        ref={modalRef}
      >
        {/* Modal Container: Max 760px, calc(100vw - 32px), Max 92dvh */}
        <div className="flex max-h-[92dvh] w-[calc(100vw-32px)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
          {/* ========================================================================= */}
          {/* 1. HEADER: Tiêu đề 20px, nút X ở góc phải, đường phân cách mảnh */}
          {/* ========================================================================= */}
          <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-white shrink-0">
            <h2
              id="kyc-detail-title"
              className="text-[19px] sm:text-[20px] font-bold text-[#0F172A] tracking-tight leading-tight"
            >
              Chi tiết hồ sơ xác minh KYC
            </h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              data-autofocus
              className="p-1.5 rounded-lg text-slate-400 hover:text-[#0F172A] hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Đóng modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* ========================================================================= */}
          {/* 2. BODY CUỘN ĐỘC LẬP: overflow-y-auto */}
          {/* ========================================================================= */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {isDetailPending ? (
              <div
                className="space-y-4"
                role="status"
                aria-label="Đang tải chi tiết hồ sơ"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-44" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((item) => (
                    <Skeleton key={item} className="h-32 rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : isDetailError ? (
              <div className="py-12 text-center space-y-3" role="alert">
                <p className="text-sm text-rose-600">
                  Không thể tải chi tiết hồ sơ KYC.
                </p>
                <button
                  type="button"
                  onClick={() => void refetchDetail()}
                  className="rounded-lg bg-[#FF5E14] px-4 py-2 text-sm text-white hover:bg-[#E04F0E]"
                >
                  Thử lại
                </button>
              </div>
            ) : (
              <>
                {/* A. THÔNG TIN THỢ */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    {workerAvatarUrl ? (
                      <img
                        src={workerAvatarUrl}
                        alt={workerName}
                        className="w-16 h-16 sm:w-18 sm:h-18 rounded-full object-cover border border-slate-200 shrink-0 shadow-2xs"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-slate-200 text-slate-700 font-bold text-xl flex items-center justify-center shrink-0">
                        {workerName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h3 className="text-[18px] sm:text-[19px] font-bold text-[#0F172A] leading-tight">
                        {workerName}
                      </h3>
                    </div>
                  </div>

                  {/* Hộp màu cam nhạt (Trạng thái, Ngày nộp, Cập nhật) */}
                  <div className="bg-[#FFF7ED] rounded-xl p-3 min-w-[210px] space-y-1.5 text-[12px] border border-orange-100/60 shrink-0">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Trạng thái</span>
                      <span
                        className={`${statusConfig.badgeBg} ${statusConfig.badgeText} font-semibold px-2.5 py-0.5 rounded-md text-[11px]`}
                      >
                        {statusConfig.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Ngày nộp</span>
                      <span className="text-slate-700 font-medium">
                        {formatDateTime(kyc.submittedAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Cập nhật</span>
                      <span className="text-slate-700 font-medium">
                        {formatDateTime(kyc.updatedAt)}
                      </span>
                    </div>
                    {(kyc.status === "approved" || kyc.status === "rejected") &&
                      kyc.reviewedAt && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Ngày xét duyệt</span>
                          <span className="text-slate-700 font-medium">
                            {formatDateTime(kyc.reviewedAt)}
                          </span>
                        </div>
                      )}
                  </div>
                </div>

                <div className="space-y-5">
                  {/* B. ẢNH GIẤY TỜ VÀ ẢNH SELFIE: 3 ô ngang hàng */}
                  <div>
                    <h4 className="text-[14px] sm:text-[15px] font-semibold text-[#0F172A] mb-3">
                      Ảnh giấy tờ và ảnh selfie
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                      {(
                        [
                          [documentImageLabels[0], kyc.documentFrontRef],
                          [documentImageLabels[1], kyc.documentBackRef],
                          ["Ảnh selfie", kyc.selfieRef],
                        ] as const
                      ).map(([label, url]) => {
                        const title = `${label} - ${workerName}`;
                        const openPreview = (
                          event: React.MouseEvent<HTMLButtonElement>,
                        ) => {
                          if (!url) return;
                          previewTriggerRef.current = event.currentTarget;
                          setPreviewImage({ url, title });
                        };
                        return (
                          <div
                            key={label}
                            className="rounded-xl border border-slate-200/80 p-2.5 bg-white flex flex-col justify-between shadow-2xs"
                          >
                            <span className="text-[12px] font-medium text-slate-600 mb-2 block">
                              {label}
                            </span>
                            <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-50 flex items-center justify-center border border-slate-100">
                              {url ? (
                                <button
                                  type="button"
                                  onClick={openPreview}
                                  aria-label={`Xem ảnh lớn ${label}`}
                                  className="h-full w-full cursor-zoom-in"
                                >
                                  <VerificationImage
                                    key={url}
                                    url={url}
                                    title={title}
                                  />
                                </button>
                              ) : (
                                <VerificationImage
                                  key={label}
                                  url={null}
                                  title={title}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Thông tin giấy tờ và kết quả AI nằm ngang hàng */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-stretch">
                    <section className="min-w-0 flex flex-col gap-2.5">
                      <h4 className="flex items-center gap-2 text-[14px] sm:text-[15px] font-semibold text-[#0F172A]">
                        <ScanText className="h-4 w-4 text-[#FF5E14]" /> Thông
                        tin giấy tờ
                      </h4>
                      <div className="flex-1 overflow-hidden rounded-xl border border-slate-200/80 bg-white divide-y divide-slate-100">
                        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[12px]">
                          <span className="text-slate-500">Mã hồ sơ</span>
                          <div className="flex min-w-0 items-center gap-1.5 font-medium text-slate-800">
                            <span
                              className="truncate font-mono"
                              title={displayCode}
                            >
                              {shortDisplayCode}
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyCode}
                              aria-label="Sao chép mã hồ sơ"
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              {isCopied ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                        <InfoRow
                          label="Loại giấy tờ"
                          value={formatDocumentType(kyc.idDocumentType)}
                        />
                        <InfoRow
                          label="Số giấy tờ"
                          value={kyc.idNumberMasked}
                        />
                        <InfoRow label="Họ tên OCR" value={ocr?.fullName} />
                        <InfoRow label="Ngày sinh" value={ocr?.dateOfBirth} />
                        <InfoRow label="Giới tính" value={ocr?.gender} />
                        <InfoRow
                          label="Ngày hết hạn"
                          value={ocr?.dateOfExpiry}
                        />
                      </div>
                    </section>
                    <section className="min-w-0 flex flex-col gap-2.5">
                      <h4 className="flex items-center gap-2 text-[14px] sm:text-[15px] font-semibold text-[#0F172A]">
                        <ScanFace className="h-4 w-4 text-[#FF5E14]" /> Kết quả
                        xác minh khuôn mặt
                      </h4>
                      <div className="flex-1 rounded-xl border border-slate-200/80 bg-white p-3.5 space-y-3">
                        {(() => {
                          const match = face?.isMatch;
                          const score =
                            kyc.aiSimilarityScore ?? face?.similarity;
                          const numericScore =
                            typeof score === "string" ? Number(score) : score;
                          const progress =
                            typeof numericScore === "number" &&
                            Number.isFinite(numericScore)
                              ? Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    numericScore <= 1 && numericScore >= 0
                                      ? numericScore * 100
                                      : numericScore,
                                  ),
                                )
                              : null;
                          return (
                            <>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-[12px] font-medium text-slate-700">
                                  Kết quả đối chiếu
                                </span>
                                <span
                                  className={`rounded-md px-2 py-1 text-[11px] font-semibold ${match === true ? "bg-emerald-50 text-emerald-700" : match === false ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}
                                >
                                  {formatDocumentMatch(match)}
                                </span>
                              </div>
                              <div>
                                <div className="text-[27px] font-bold leading-tight text-slate-900">
                                  {formatSimilarity(score)}
                                </div>
                                <p className="mt-1 text-[12px] text-slate-500">
                                  Độ tương đồng khuôn mặt
                                </p>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-[#FF5E14]"
                                  style={{ width: `${progress ?? 0}%` }}
                                />
                              </div>
                              {typeof face?.message === "string" &&
                                face.message.trim() && (
                                  <div className="rounded-lg bg-orange-50 p-2.5 text-[12px] text-slate-700 break-words">
                                    {face.message}
                                  </div>
                                )}
                              <div className="border-t border-slate-100 pt-2 space-y-2.5">
                                <div className="text-[12px] font-semibold text-slate-800">
                                  Chi tiết xác minh
                                </div>
                                {(
                                  [
                                    [
                                      "Trạng thái AI",
                                      formatMatchStatus(face?.status),
                                    ],
                                    [
                                      "Khuôn mặt trùng khớp",
                                      formatYesNo(match),
                                    ],
                                    [
                                      "Độ tin cậy",
                                      formatSimilarity(face?.confidence),
                                    ],
                                    [
                                      "AI yêu cầu kiểm tra thêm",
                                      formatYesNo(face?.needsReview),
                                    ],
                                  ] as [string, string][]
                                ).map(([label, value]) => (
                                  <div
                                    key={label}
                                    className="flex items-start justify-between gap-3 text-[12px]"
                                  >
                                    <span className="text-slate-500">
                                      {label}
                                    </span>
                                    <span className="text-right font-medium text-slate-800">
                                      {value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <p className="border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">
                                AI chỉ hỗ trợ đánh giá. Admin cần kiểm tra ảnh
                                và thông tin trước khi xét duyệt.
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    </section>
                  </div>

                  <CollapsibleSection title="Thông tin OCR bổ sung">
                    {ocr ? (
                      <InfoRows
                        rows={[
                          ["Số giấy tờ OCR", ocr.idNumber],
                          ["Quốc tịch", ocr.nationality],
                          ["Quê quán", ocr.placeOfOrigin],
                          ["Nơi thường trú", ocr.placeOfResidence],
                        ]}
                      />
                    ) : (
                      <p className="text-[12px] text-slate-400">
                        Chưa có dữ liệu OCR
                      </p>
                    )}
                  </CollapsibleSection>

                  {/* Timeline có thể thu gọn, đồng bộ với các mục bên dưới */}
                  <CollapsibleSection
                    title={`Lịch sử xét duyệt (${histories.length})`}
                  >
                    <div className="rounded-xl border border-slate-200/80 bg-white p-4 sm:p-5">
                      {histories.length ? (
                        <ol className="space-y-0">
                          {[...histories]
                            .sort((a, b) => {
                              const getTime = (item: unknown) => {
                                const value = getAiField(item, "createdAt");
                                const time =
                                  typeof value === "string"
                                    ? Date.parse(value)
                                    : NaN;
                                return Number.isFinite(time) ? time : 0;
                              };
                              return getTime(b) - getTime(a);
                            })
                            .map((item, index, all) => {
                              const history = isAiObject(item) ? item : {};
                              const action =
                                typeof history.action === "string"
                                  ? history.action.toLowerCase()
                                  : "";
                              const toStatus =
                                typeof history.toStatus === "string"
                                  ? history.toStatus.toLowerCase()
                                  : "";
                              const approved =
                                action.includes("approv") ||
                                toStatus === "approved";
                              const rejected =
                                action.includes("reject") ||
                                toStatus === "rejected";
                              const submitted =
                                action.includes("submit") ||
                                toStatus === "submitted";
                              const title = approved
                                ? "Hồ sơ được phê duyệt"
                                : rejected
                                  ? "Hồ sơ bị từ chối"
                                  : submitted
                                    ? "Hồ sơ được gửi lên"
                                    : toStatus === "reviewing"
                                      ? "Hồ sơ chuyển sang chờ xét duyệt"
                                      : "Cập nhật trạng thái hồ sơ";
                              const iconStyle = approved
                                ? "bg-emerald-100 text-emerald-700"
                                : rejected
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-orange-100 text-[#FF5E14]";
                              return (
                                <li
                                  key={displayValue(history.id ?? index)}
                                  className="relative flex gap-3.5"
                                >
                                  <div className="flex w-8 shrink-0 flex-col items-center">
                                    <div
                                      className={`z-10 flex h-8 w-8 items-center justify-center rounded-full ${iconStyle}`}
                                    >
                                      {approved ? (
                                        <Check className="h-4 w-4" />
                                      ) : rejected ? (
                                        <X className="h-4 w-4" />
                                      ) : (
                                        <History className="h-4 w-4" />
                                      )}
                                    </div>
                                    {index < all.length - 1 && (
                                      <div className="min-h-6 w-px flex-1 bg-slate-200" />
                                    )}
                                  </div>
                                  <div
                                    className={`min-w-0 flex-1 ${index < all.length - 1 ? "pb-5" : "pb-0"}`}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-[13px] font-semibold text-slate-900">
                                        {title}
                                      </p>
                                      {(approved || rejected) && (
                                        <span
                                          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${approved ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}
                                        >
                                          {approved ? "Đã duyệt" : "Đã từ chối"}
                                        </span>
                                      )}
                                    </div>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                      {formatDateTime(
                                        typeof history.createdAt === "string"
                                          ? history.createdAt
                                          : null,
                                      )}
                                    </p>
                                    {history.fromStatus != null &&
                                      history.toStatus != null && (
                                        <p className="mt-2 text-[12px] text-slate-600">
                                          {formatKycStatus(history.fromStatus)}
                                          {" → "}
                                          {formatKycStatus(history.toStatus)}
                                        </p>
                                      )}
                                    {((typeof history.note === "string" &&
                                      history.note.trim()) ||
                                      history.performedByUserId != null) && (
                                      <div className="mt-2 space-y-1.5 rounded-lg bg-slate-50 px-3 py-2.5 text-[12px] text-slate-700">
                                        {history.performedByUserId != null && (
                                          <p className="break-all text-slate-500">
                                            Người thực hiện (ID):{" "}
                                            {displayValue(
                                              history.performedByUserId,
                                            )}
                                          </p>
                                        )}
                                        {typeof history.note === "string" &&
                                          history.note.trim() && (
                                            <p className="break-words">
                                              <span className="font-medium">
                                                Ghi chú:
                                              </span>{" "}
                                              {history.note}
                                            </p>
                                          )}
                                      </div>
                                    )}
                                  </div>
                                </li>
                              );
                            })}
                        </ol>
                      ) : (
                        <div className="flex items-center gap-2 py-2 text-[12px] text-slate-500">
                          <History className="h-4 w-4 shrink-0" /> Chưa có lịch
                          sử xét duyệt
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>

                  <section className="space-y-2.5">
                    <h4 className="text-[14px] sm:text-[15px] font-semibold text-[#0F172A]">
                      Ghi chú xét duyệt
                    </h4>
                    <div className="rounded-xl border border-slate-200/80 bg-white p-3 text-[12px] text-slate-700 break-words">
                      {kyc.reviewNote || "Chưa có ghi chú xét duyệt"}
                    </div>
                  </section>

                  <CollapsibleSection
                    title={`Lịch sử xử lý AI (${jobs.length})`}
                  >
                    {jobs.length ? (
                      <div className="space-y-3">
                        {jobs.map((item, index) => {
                          const job = isAiObject(item) ? item : {};
                          const result = isAiObject(job.aiResult)
                            ? job.aiResult
                            : null;
                          const jobFace = isAiObject(result?.faceVerification)
                            ? result.faceVerification
                            : null;
                          const jobOcr = isAiObject(result?.ocr)
                            ? result.ocr
                            : null;
                          const status = formatJobStatus(job.status);
                          const match = jobFace
                            ? formatDocumentMatch(jobFace.isMatch)
                            : "Chưa có dữ liệu";
                          const retry =
                            job.retryCount == null
                              ? "-"
                              : String(job.retryCount);
                          const maxRetry =
                            job.maxRetries == null
                              ? "-"
                              : String(job.maxRetries);

                          return (
                            <div
                              key={displayValue(job.id ?? index)}
                              className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                            >
                              <div className="space-y-3 p-3.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[13px] font-semibold text-slate-900">
                                    Lần xử lý #{jobs.length - index}
                                  </span>
                                  <span
                                    className={`rounded-md px-2 py-1 text-[11px] font-semibold ${job.status === "completed" ? "bg-emerald-50 text-emerald-700" : job.status === "failed" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
                                  >
                                    {status}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <p className="text-[11px] text-slate-500">
                                      Bắt đầu
                                    </p>
                                    <p className="text-[12px] font-medium text-slate-800">
                                      {formatDateTime(
                                        typeof job.startedAt === "string"
                                          ? job.startedAt
                                          : null,
                                      )}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[11px] text-slate-500">
                                      Hoàn thành
                                    </p>
                                    <p className="text-[12px] font-medium text-slate-800">
                                      {formatDateTime(
                                        typeof job.completedAt === "string"
                                          ? job.completedAt
                                          : null,
                                      )}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[11px] text-slate-500">
                                      Số lần thử lại / tối đa
                                    </p>
                                    <p className="text-[12px] font-medium text-slate-800">
                                      {retry} / {maxRetry}
                                    </p>
                                  </div>
                                  <div className="space-y-1">
                                    <p className="text-[11px] text-slate-500">
                                      Đối chiếu khuôn mặt
                                    </p>
                                    <p className="text-[12px] font-medium text-slate-800">
                                      {match}
                                    </p>
                                  </div>
                                </div>
                                {typeof job.failureReason === "string" &&
                                  job.failureReason.trim() && (
                                    <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700 break-words">
                                      <span className="font-semibold">
                                        Lý do thất bại:{" "}
                                      </span>
                                      {job.failureReason}
                                    </p>
                                  )}
                              </div>
                              <details className="group border-t border-slate-100">
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-[12px] font-medium text-[#FF5E14] hover:bg-orange-50/40 [&::-webkit-details-marker]:hidden">
                                  Xem chi tiết lần xử lý
                                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="border-t border-slate-100 bg-slate-50/60 p-3">
                                  <InfoRows
                                    rows={(
                                      [
                                        ["Mã xử lý", job.id],
                                        ["Trạng thái xử lý", status],
                                        [
                                          "Trạng thái khuôn mặt",
                                          jobFace
                                            ? formatMatchStatus(jobFace.status)
                                            : "Chưa có dữ liệu",
                                        ],
                                        ["Kết quả đối chiếu", match],
                                        [
                                          "Độ tương đồng",
                                          jobFace
                                            ? formatSimilarity(
                                                jobFace.similarity,
                                              )
                                            : "Chưa có dữ liệu",
                                        ],
                                        [
                                          "Độ tin cậy",
                                          jobFace
                                            ? formatSimilarity(
                                                jobFace.confidence,
                                              )
                                            : "Chưa có dữ liệu",
                                        ],
                                        ["Thông báo AI", jobFace?.message],
                                        [
                                          "AI yêu cầu xem xét thêm",
                                          jobFace
                                            ? formatYesNo(jobFace.needsReview)
                                            : "Chưa có dữ liệu",
                                        ],
                                        [
                                          "Có điều chỉnh chất lượng",
                                          jobFace
                                            ? formatYesNo(
                                                jobFace.qualityAdjusted,
                                              )
                                            : "Chưa có dữ liệu",
                                        ],
                                        [
                                          "Tạo lúc",
                                          formatDateTime(
                                            typeof job.createdAt === "string"
                                              ? job.createdAt
                                              : null,
                                          ),
                                        ],
                                        [
                                          "Cập nhật lúc",
                                          formatDateTime(
                                            typeof job.updatedAt === "string"
                                              ? job.updatedAt
                                              : null,
                                          ),
                                        ],
                                        ["Lý do thất bại", job.failureReason],
                                      ] satisfies [string, unknown][]
                                    ).filter(
                                      ([, value]) =>
                                        value !== undefined &&
                                        value !== null &&
                                        value !== "-",
                                    )}
                                  />
                                  {jobOcr && (
                                    <div className="mt-3 space-y-2">
                                      <p className="text-[12px] font-semibold text-slate-800">
                                        Thông tin OCR của lần xử lý
                                      </p>
                                      <InfoRows
                                        rows={(
                                          [
                                            ["Họ tên", jobOcr.fullName],
                                            ["Số giấy tờ", jobOcr.idNumber],
                                            ["Ngày sinh", jobOcr.dateOfBirth],
                                            ["Giới tính", jobOcr.gender],
                                            [
                                              "Ngày hết hạn",
                                              jobOcr.dateOfExpiry,
                                            ],
                                            ["Quốc tịch", jobOcr.nationality],
                                            ["Quê quán", jobOcr.placeOfOrigin],
                                            [
                                              "Nơi thường trú",
                                              jobOcr.placeOfResidence,
                                            ],
                                          ] satisfies [string, unknown][]
                                        ).filter(
                                          ([, value]) =>
                                            value !== undefined &&
                                            value !== null &&
                                            value !== "",
                                        )}
                                      />
                                    </div>
                                  )}
                                </div>
                              </details>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[12px] text-slate-400">
                        Chưa có lịch sử xử lý AI
                      </p>
                    )}
                  </CollapsibleSection>
                </div>
              </>
            )}
          </div>

          {/* FOOTER: Hai nút xét duyệt nhỏ gọn, căn phải */}
          <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
            {!detailReady || isDetailFetching ? (
              <p className="text-center text-[12px] italic text-slate-500">
                {isDetailError
                  ? "Không thể xác minh trạng thái hồ sơ"
                  : "Đang kiểm tra hồ sơ..."}
              </p>
            ) : canReview ? (
              <div className="flex w-full items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitError("");
                    rejectTriggerRef.current =
                      document.activeElement instanceof HTMLButtonElement
                        ? document.activeElement
                        : null;
                    setIsRejectOpen(true);
                  }}
                  className="inline-flex h-9 min-w-[96px] cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                  {/* <X className="h-4 w-4 shrink-0" /> */}
                  <span>Từ chối</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitError("");
                    approveTriggerRef.current =
                      document.activeElement instanceof HTMLButtonElement
                        ? document.activeElement
                        : null;
                    setIsApproveOpen(true);
                  }}
                  className="inline-flex h-9 min-w-[108px] cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#FF5E14] px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-[#E6530F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                >
                  {/* <Check className="h-4 w-4 shrink-0" /> */}
                  <span>Phê duyệt</span>
                </button>
              </div>
            ) : (
              <p className="text-center text-[12px] italic text-slate-500">
                {kyc.status === "draft"
                  ? "Hồ sơ chưa được nộp"
                  : kyc.status === "submitted"
                    ? "Hồ sơ đang chờ hệ thống xử lý"
                    : kyc.status === "approved"
                      ? "Hồ sơ đã được phê duyệt"
                      : "Hồ sơ đã bị từ chối"}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* DIALOG XÁC NHẬN PHÊ DUYỆT */}
      {isApproveOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            ref={approveDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="kyc-approve-title"
            aria-describedby="kyc-approve-description"
            tabIndex={-1}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3
                id="kyc-approve-title"
                className="text-[18px] font-semibold text-[#0F172A]"
              >
                Xác nhận phê duyệt hồ sơ
              </h3>
              <p
                id="kyc-approve-description"
                className="text-[14px] text-[#64748B] mt-1 leading-relaxed"
              >
                Bạn có chắc chắn muốn phê duyệt hồ sơ xác minh KYC của thợ{" "}
                <strong className="text-[#0F172A]">{workerName}</strong> (mã hồ
                sơ {kyc.id}) không?
              </p>
            </div>
            <div className="space-y-2">
              <label
                htmlFor="kyc-approve-note"
                className="block text-[13px] font-medium text-[#0F172A]"
              >
                Ghi chú phê duyệt (không bắt buộc)
              </label>
              <textarea
                id="kyc-approve-note"
                value={approveNote}
                disabled={isSubmitting}
                data-autofocus
                onChange={(e) => setApproveNote(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Nhập ghi chú cho hồ sơ..."
                className="w-full rounded-xl border border-slate-200 p-3 text-[13px] text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14] resize-none"
              />
              <p className="text-right text-[11px] text-slate-400">
                {approveNote.length}/1000
              </p>
            </div>
            {submitError && (
              <p role="alert" className="text-[12px] text-rose-600">
                {submitError}
              </p>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={cancelApprove}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-[14px] font-medium text-[#0F172A] hover:bg-slate-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleApproveConfirm()}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-[#FF5E14] hover:bg-[#E04F0E] text-white text-[14px] font-medium transition-colors cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Đang phê duyệt..." : "Xác nhận phê duyệt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG NHẬP LÝ DO TỪ CHỐI */}
      {isRejectOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            ref={rejectDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="kyc-reject-title"
            aria-describedby="kyc-reject-description"
            tabIndex={-1}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4"
          >
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3
                id="kyc-reject-title"
                className="text-[18px] font-semibold text-[#0F172A]"
              >
                Từ chối hồ sơ xác minh
              </h3>
              <p
                id="kyc-reject-description"
                className="text-[14px] text-[#64748B] mt-1 leading-relaxed"
              >
                Vui lòng nhập lý do từ chối hồ sơ của thợ{" "}
                <strong className="text-[#0F172A]">{workerName}</strong>. Lý do
                này là bắt buộc.
              </p>
            </div>

            <div>
              <label
                htmlFor="kyc-reject-reason"
                className="mb-2 block text-[13px] font-medium text-[#0F172A]"
              >
                Lý do từ chối
              </label>
              <textarea
                id="kyc-reject-reason"
                value={rejectReason}
                disabled={isSubmitting}
                data-autofocus
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectError) setRejectError("");
                }}
                maxLength={1000}
                rows={3}
                placeholder="Nhập lý do từ chối cụ thể..."
                className="w-full p-3 rounded-xl border border-slate-200 text-[13px] text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
              {rejectError && (
                <p className="text-[12px] text-rose-600 mt-1 font-medium">
                  {rejectError}
                </p>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  "Ảnh CCCD bị mờ, lóa sáng",
                  "Ảnh khuôn mặt không khớp với CCCD",
                  "Thông tin giấy tờ không trùng khớp",
                ].map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setRejectReason(item);
                      if (rejectError) setRejectError("");
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-100 text-[#64748B] hover:bg-slate-200 hover:text-[#0F172A] transition-colors cursor-pointer"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>

            {submitError && (
              <p role="alert" className="text-[12px] text-rose-600">
                {submitError}
              </p>
            )}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={cancelReject}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl border border-slate-200 text-[14px] font-medium text-[#0F172A] hover:bg-slate-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleRejectConfirm()}
                disabled={isSubmitting}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[14px] font-medium transition-colors cursor-pointer shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Đang từ chối..." : "Xác nhận từ chối"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX XEM ẢNH LỚN */}
      {previewImage && previewImage.url && (
        <div
          className="fixed inset-0 z-70 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div
            ref={previewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="kyc-image-preview-title"
            tabIndex={-1}
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden p-2 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between px-3 py-2 text-white border-b border-slate-800">
              <span
                id="kyc-image-preview-title"
                className="text-[14px] font-medium"
              >
                {previewImage.title}
              </span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                data-autofocus
                aria-label="Đóng ảnh xem trước"
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center max-h-[75vh] overflow-hidden">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[72vh] max-w-full object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Remount theo ID để không giữ ghi chú, lỗi hoặc trạng thái của hồ sơ trước.
export const KycDetailModal: React.FC<KycDetailModalProps> = (props) => {
  if (!props.isOpen || !props.record) return null;
  return <KycDetailModalContent key={props.record.id} {...props} />;
};

export default KycDetailModal;
