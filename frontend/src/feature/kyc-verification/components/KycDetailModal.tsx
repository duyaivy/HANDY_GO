"use client";

import React, { useState } from "react";
import {
  X,
  Copy,
  Check,
  Star,
  Briefcase,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  History,
  ScanText,
  Cpu,
} from "lucide-react";
import { KYC_STATUS_CONFIG, KycRecord } from "../types/type";
import { useKycDetailQuery } from "../hooks/use-kyc";

interface KycDetailModalProps {
  isOpen: boolean;
  record: KycRecord | null;
  onClose: () => void;
  onApprove: (id: string, note: string) => void;
  onReject: (id: string, reason: string) => void;
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

const formatMatchStatus = (value: unknown): string => {
  if (value === "review-ready") return "Sẵn sàng xét duyệt";
  if (value === "pending") return "Đang chờ xử lý";
  if (value === "processing") return "Đang phân tích";
  if (value === "completed") return "Đã phân tích";
  if (value === "match") return "Trùng khớp";
  if (value === "not_match") return "Không trùng khớp";
  return "Chưa có dữ liệu";
};

const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  return JSON.stringify(value);
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

export const KycDetailModal: React.FC<KycDetailModalProps> = ({
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
  const [previewImage, setPreviewImage] = useState<{
    url: string | null;
    title: string;
  } | null>(null);

  const {
    data: detailRecord,
    isPending: isDetailPending,
    isError: isDetailError,
    isFetching: isDetailFetching,
    refetch: refetchDetail,
  } = useKycDetailQuery(isOpen ? record?.id : undefined);

  if (!isOpen || !record) return null;

  // Chỉ sử dụng dữ liệu từ API chi tiết để xét duyệt.
  // record chỉ dùng làm dữ liệu dự phòng trong lúc tải.
  const kyc = detailRecord ?? record;
  // Các trường mở rộng lấy nguyên từ response chi tiết BE; không suy diễn dữ liệu.
  const detail = kyc as KycRecord & Record<string, unknown>;
  const ocr = isAiObject(detail.rawOcrData) ? detail.rawOcrData : null;
  const aiResult = isAiObject(detail.aiResult) ? detail.aiResult : null;
  const aiOcr = isAiObject(aiResult?.ocr) ? aiResult.ocr : null;
  const face = isAiObject(aiResult?.faceVerification)
    ? aiResult.faceVerification
    : null;
  const jobs = Array.isArray(detail.jobs) ? detail.jobs : [];
  const histories = Array.isArray(detail.reviewHistories)
    ? detail.reviewHistories
    : [];
  const profile = isAiObject(detail.workerProfile)
    ? detail.workerProfile
    : null;
  const workerUser = isAiObject(profile?.user) ? profile.user : null;
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

  const handleApproveConfirm = () => {
    if (!canReview) return;
    onApprove(kyc.id, approveNote.trim());
    setIsApproveOpen(false);
    setApproveNote("");
  };

  const handleRejectConfirm = () => {
    if (!canReview) return;
    if (!rejectReason.trim()) {
      setRejectError("Vui lòng nhập lý do từ chối hồ sơ này");
      return;
    }
    onReject(kyc.id, rejectReason.trim());
    setIsRejectOpen(false);
    setRejectReason("");
    setRejectError("");
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150 font-['Inter',sans-serif] text-[#0F172A]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Container: Max 760px, calc(100vw - 32px), Max 92dvh */}
        <div className="flex max-h-[92dvh] w-[calc(100vw-32px)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
          {/* ========================================================================= */}
          {/* 1. HEADER: Tiêu đề 20px, nút X ở góc phải, đường phân cách mảnh */}
          {/* ========================================================================= */}
          <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 bg-white shrink-0">
            <h2 className="text-[19px] sm:text-[20px] font-bold text-[#0F172A] tracking-tight leading-tight">
              Chi tiết hồ sơ xác minh KYC
            </h2>
            <button
              type="button"
              onClick={onClose}
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
              <div className="space-y-4 animate-pulse" role="status">
                <div className="h-16 rounded-xl bg-slate-100" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-36 rounded-xl bg-slate-100" />
                  ))}
                </div>
                <div className="h-40 rounded-xl bg-slate-100" />
                <p className="text-center text-sm text-slate-500">
                  Đang tải chi tiết hồ sơ...
                </p>
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
                    {kyc.workerProfile.user.avatarUrl ? (
                      <img
                        src={kyc.workerProfile.user.avatarUrl}
                        alt={kyc.workerProfile.user.fullName}
                        className="w-16 h-16 sm:w-18 sm:h-18 rounded-full object-cover border border-slate-200 shrink-0 shadow-2xs"
                      />
                    ) : (
                      <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-slate-200 text-slate-700 font-bold text-xl flex items-center justify-center shrink-0">
                        {kyc.workerProfile.user.fullName.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h3 className="text-[18px] sm:text-[19px] font-bold text-[#0F172A] leading-tight">
                        {kyc.workerProfile.user.fullName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-[12px] mt-2">
                        <div className="flex items-center gap-1 font-semibold text-slate-800">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          <span>{kyc.workerProfile.averageRating}</span>
                          <span className="font-normal text-slate-500">
                            ({kyc.workerProfile.ratingCount} đánh giá)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                          <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            {kyc.workerProfile.completedOrderCount} đơn hoàn
                            thành
                          </span>
                        </div>
                      </div>
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
                  </div>
                </div>

                {/* B. ẢNH GIẤY TỜ VÀ ẢNH SELFIE: 3 ô ngang hàng */}
                <div>
                  <h4 className="text-[14px] sm:text-[15px] font-semibold text-[#0F172A] mb-3">
                    Ảnh giấy tờ và ảnh selfie
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    {(
                      [
                        ["CCCD mặt trước", kyc.documentFrontRef],
                        ["CCCD mặt sau", kyc.documentBackRef],
                        ["Ảnh selfie", kyc.selfieRef],
                      ] as const
                    ).map(([label, url]) => {
                      const title = `${label} - ${kyc.workerProfile.user.fullName}`;
                      const openPreview = () =>
                        url && setPreviewImage({ url, title });
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

                {/* C. 2 CỘT: Thông tin hồ sơ (Trái) & Kết quả phân tích AI (Phải) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  {/* CỘT TRÁI: Thông tin hồ sơ */}
                  <div>
                    <h4 className="text-[14px] sm:text-[15px] font-semibold text-[#0F172A] mb-2.5">
                      Thông tin hồ sơ
                    </h4>
                    <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden text-[12px] divide-y divide-slate-100">
                      <div className="flex items-center justify-between px-3.5 py-2.5">
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
                            className="shrink-0 p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            title="Sao chép UUID đầy đủ"
                          >
                            {isCopied ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-slate-500">Loại giấy tờ</span>
                        <span className="font-medium text-slate-800">
                          {kyc.idDocumentType || "-"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-slate-500">Số giấy tờ</span>
                        <span className="font-medium font-mono text-slate-800">
                          {kyc.idNumberMasked || "-"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-slate-500">Ngày nộp</span>
                        <span className="text-slate-800">
                          {formatDateTime(kyc.submittedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-slate-500">Ngày xét duyệt</span>
                        <span className="text-slate-400">
                          {formatDateTime(kyc.reviewedAt)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between px-3.5 py-2.5">
                        <span className="text-slate-500">Ghi chú</span>
                        <span className="text-slate-400">
                          {kyc.reviewNote || "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CỘT PHẢI: Kết quả phân tích AI - nhãn tiếng Việt */}
                  <div>
                    <h4 className="text-[14px] sm:text-[15px] font-semibold text-[#0F172A] mb-2.5">
                      Kết quả phân tích AI
                    </h4>
                    {(() => {
                      const similarity = kyc.aiSimilarityScore;
                      const faceVerification = getAiField(
                        kyc.aiResult,
                        "faceVerification",
                      );
                      const faceMatch = getAiField(faceVerification, "isMatch");
                      const faceStatus = getAiField(faceVerification, "status");
                      const documentType = kyc.idDocumentType;
                      const hasAiData =
                        similarity !== null ||
                        kyc.aiResult !== null ||
                        kyc.rawOcrData !== null;

                      if (!hasAiData) {
                        return (
                          <div className="rounded-xl bg-[#F0F7FF] border border-blue-100/70 p-4">
                            <p className="text-[12px] text-slate-500">
                              Chưa có kết quả phân tích AI
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="rounded-xl bg-[#F0F7FF] border border-blue-100/70 p-3.5 space-y-3 text-[12px]">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-600">
                              Độ tương đồng khuôn mặt
                            </span>
                            <span className="font-bold text-slate-900">
                              {formatSimilarity(similarity)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-600">
                              Kết quả đối chiếu khuôn mặt
                            </span>
                            <span className="font-medium text-slate-800 text-right">
                              {formatDocumentMatch(faceMatch)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-600">Loại giấy tờ</span>
                            <span className="font-medium text-slate-800 text-right">
                              {formatDocumentType(documentType)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-600">
                              Trạng thái đối chiếu khuôn mặt
                            </span>
                            <span className="font-medium text-slate-800 text-right">
                              {formatMatchStatus(faceStatus)}
                            </span>
                          </div>
                          <p className="border-t border-blue-100 pt-2.5 text-[11px] text-slate-500 leading-relaxed">
                            Kết quả AI chỉ mang tính hỗ trợ. Admin cần kiểm tra
                            hồ sơ trước khi đưa ra quyết định.
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* D. THÔNG TIN OCR - đúng rawOcrData từ BE */}
                <section className="space-y-2.5">
                  <h4 className="flex items-center gap-2 text-[14px] sm:text-[15px] font-semibold text-[#0F172A]">
                    <ScanText className="h-4 w-4 text-[#FF5E14]" /> Thông tin
                    OCR từ giấy tờ
                  </h4>
                  {ocr ? (
                    <InfoRows
                      rows={[
                        ["Họ tên OCR", ocr.fullName],
                        ["Số giấy tờ OCR", ocr.idNumber],
                        ["Giới tính", ocr.gender],
                        ["Ngày sinh", ocr.dateOfBirth],
                        ["Quốc tịch", ocr.nationality],
                        ["Ngày hết hạn", ocr.dateOfExpiry],
                        ["Quê quán", ocr.placeOfOrigin],
                        ["Nơi thường trú", ocr.placeOfResidence],
                      ]}
                    />
                  ) : (
                    <p className="text-[12px] text-slate-400">
                      Chưa có dữ liệu OCR
                    </p>
                  )}
                </section>

                {/* E. CHI TIẾT AI - tách riêng trạng thái duyệt hồ sơ và kết quả AI */}
                <section className="space-y-2.5">
                  <h4 className="flex items-center gap-2 text-[14px] sm:text-[15px] font-semibold text-[#0F172A]">
                    <Cpu className="h-4 w-4 text-[#FF5E14]" /> Chi tiết xác minh
                    khuôn mặt
                  </h4>
                  {face ? (
                    <InfoRows
                      rows={[
                        ["Trạng thái AI", face.status],
                        ["Có trùng khớp", face.isMatch],
                        ["Thông báo từ AI", face.message],
                        ["Confidence", face.confidence],
                        ["Similarity", face.similarity],
                        ["Needs review", face.needsReview],
                        ["Quality adjusted", face.qualityAdjusted],
                      ]}
                    />
                  ) : (
                    <p className="text-[12px] text-slate-400">
                      Chưa có dữ liệu đối chiếu khuôn mặt
                    </p>
                  )}
                </section>

                {/* F. LỊCH SỬ & DỮ LIỆU BỔ SUNG - thu gọn để giữ bố cục */}
                <section className="space-y-2.5">
                  <h4 className="flex items-center gap-2 text-[14px] sm:text-[15px] font-semibold text-[#0F172A]">
                    <History className="h-4 w-4 text-[#FF5E14]" /> Lịch sử và
                    thông tin bổ sung
                  </h4>
                  <CollapsibleSection
                    title={`Lịch sử xử lý AI (${jobs.length})`}
                  >
                    {jobs.length ? (
                      jobs.map((item, index) => {
                        const job = isAiObject(item) ? item : {};
                        return (
                          <div
                            key={displayValue(job.id ?? index)}
                            className="space-y-2 rounded-lg border border-slate-100 p-2"
                          >
                            <InfoRows
                              rows={[
                                ["Mã job", job.id],
                                ["Trạng thái", job.status],
                                ["Số lần thử", job.retryCount],
                                ["Số lần thử tối đa", job.maxRetries],
                                ["Lý do thất bại", job.failureReason],
                                [
                                  "Bắt đầu",
                                  formatDateTime(
                                    typeof job.startedAt === "string"
                                      ? job.startedAt
                                      : null,
                                  ),
                                ],
                                [
                                  "Hoàn thành",
                                  formatDateTime(
                                    typeof job.completedAt === "string"
                                      ? job.completedAt
                                      : null,
                                  ),
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
                              ]}
                            />
                            <details className="text-[12px]">
                              <summary className="cursor-pointer text-slate-600">
                                Dữ liệu AI của job
                              </summary>
                              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-[11px]">
                                {JSON.stringify(job.aiResult ?? null, null, 2)}
                              </pre>
                            </details>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[12px] text-slate-400">
                        Chưa có lịch sử xử lý AI
                      </p>
                    )}
                  </CollapsibleSection>
                  <CollapsibleSection
                    title={`Lịch sử xét duyệt (${histories.length})`}
                  >
                    {histories.length ? (
                      histories.map((item, index) => {
                        const history = isAiObject(item) ? item : {};
                        return (
                          <div
                            key={displayValue(history.id ?? index)}
                            className="space-y-2 rounded-lg border border-slate-100 p-2"
                          >
                            <InfoRows
                              rows={[
                                ["Hành động", history.action],
                                ["Từ trạng thái", history.fromStatus],
                                ["Đến trạng thái", history.toStatus],
                                [
                                  "Người thực hiện (ID)",
                                  history.performedByUserId,
                                ],
                                ["Ghi chú", history.note],
                                [
                                  "Thời gian",
                                  formatDateTime(
                                    typeof history.createdAt === "string"
                                      ? history.createdAt
                                      : null,
                                  ),
                                ],
                              ]}
                            />
                            <details className="text-[12px]">
                              <summary className="cursor-pointer text-slate-600">
                                Metadata
                              </summary>
                              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-[11px]">
                                {JSON.stringify(
                                  history.metadata ?? null,
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[12px] text-slate-400">
                        Chưa có lịch sử xét duyệt
                      </p>
                    )}
                  </CollapsibleSection>
                  <CollapsibleSection title="Thông tin kỹ thuật và dữ liệu bổ sung">
                    <InfoRows
                      rows={[
                        ["Worker Profile ID", detail.workerProfileId],
                        ["Phiên bản", detail.version],
                        ["Idempotency Key", detail.idempotencyKey],
                        ["Active Job ID", detail.activeJobId],
                        ["Người duyệt (ID)", detail.reviewedByUserId],
                        [
                          "Reviewer",
                          detail.reviewer === null
                            ? null
                            : JSON.stringify(detail.reviewer),
                        ],
                        ["Tạo hồ sơ", formatDateTime(kyc.createdAt)],
                        ["Cập nhật hồ sơ", formatDateTime(kyc.updatedAt)],
                        ["Trạng thái thợ", profile?.status],
                        ["Tổng số đơn", profile?.orderCountTotal],
                        [
                          "Thợ được xác minh",
                          formatDateTime(
                            typeof profile?.verifiedAt === "string"
                              ? profile.verifiedAt
                              : null,
                          ),
                        ],
                        [
                          "Thợ được duyệt",
                          formatDateTime(
                            typeof profile?.approvedAt === "string"
                              ? profile.approvedAt
                              : null,
                          ),
                        ],
                        [
                          "Ngày tạo profile",
                          formatDateTime(
                            typeof profile?.createdAt === "string"
                              ? profile.createdAt
                              : null,
                          ),
                        ],
                        [
                          "Cập nhật profile",
                          formatDateTime(
                            typeof profile?.updatedAt === "string"
                              ? profile.updatedAt
                              : null,
                          ),
                        ],
                        ["User ID", profile?.userId],
                        ["Trạng thái tài khoản", workerUser?.status],
                        [
                          "Ngày tạo tài khoản",
                          formatDateTime(
                            typeof workerUser?.createdAt === "string"
                              ? workerUser.createdAt
                              : null,
                          ),
                        ],
                        [
                          "Cập nhật tài khoản",
                          formatDateTime(
                            typeof workerUser?.updatedAt === "string"
                              ? workerUser.updatedAt
                              : null,
                          ),
                        ],
                      ]}
                    />
                    <details className="text-[12px]">
                      <summary className="cursor-pointer text-slate-600">
                        OCR trong aiResult (dữ liệu gốc)
                      </summary>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-3 text-[11px]">
                        {JSON.stringify(aiOcr, null, 2)}
                      </pre>
                    </details>
                  </CollapsibleSection>
                </section>
              </>
            )}
          </div>

          {/* ========================================================================= */}
          {/* 3. FOOTER CỐ ĐỊNH: Đóng bên trái, Từ chối và Phê duyệt bên phải */}
          {/* ========================================================================= */}
          <div className="px-6 py-3.5 border-t border-slate-100 bg-white flex items-center justify-between shrink-0">
            {/* <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded-lg border border-slate-200 text-[13px] font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Đóng
            </button> */}

            {!detailReady || isDetailFetching ? (
              <div className="text-[12px] text-slate-500 italic">
                {isDetailError
                  ? "Không thể xác minh trạng thái hồ sơ"
                  : "Đang kiểm tra hồ sơ..."}
              </div>
            ) : canReview ? (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsRejectOpen(true)}
                  className="px-5 py-2 rounded-lg border border-rose-200 text-rose-600 bg-rose-50/50 hover:bg-rose-100 text-[13px] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <X className="w-4 h-4" />
                  <span>Từ chối</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsApproveOpen(true)}
                  className="px-6 py-2 rounded-lg bg-[#FF5E14] hover:bg-[#E04F0E] text-white text-[13px] font-medium shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Phê duyệt</span>
                </button>
              </div>
            ) : (
              <div className="text-[12px] text-slate-500 italic">
                {kyc.status === "draft"
                  ? "Hồ sơ chưa được nộp"
                  : kyc.status === "submitted"
                    ? "Hồ sơ đang chờ hệ thống xử lý"
                    : kyc.status === "approved"
                      ? "Hồ sơ đã được phê duyệt"
                      : "Hồ sơ đã bị từ chối"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DIALOG XÁC NHẬN PHÊ DUYỆT */}
      {isApproveOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-[18px] font-semibold text-[#0F172A]">
                Xác nhận phê duyệt hồ sơ
              </h3>
              <p className="text-[14px] text-[#64748B] mt-1 leading-relaxed">
                Bạn có chắc chắn muốn phê duyệt hồ sơ xác minh KYC của thợ{" "}
                <strong className="text-[#0F172A]">
                  {kyc.workerProfile.user.fullName}
                </strong>{" "}
                (mã hồ sơ {kyc.id}) không?
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
                onChange={(e) => setApproveNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Nhập ghi chú cho hồ sơ..."
                className="w-full rounded-xl border border-slate-200 p-3 text-[13px] text-[#0F172A] placeholder:text-slate-400 focus:outline-none focus:border-[#FF5E14] focus:ring-1 focus:ring-[#FF5E14] resize-none"
              />
              <p className="text-right text-[11px] text-slate-400">
                {approveNote.length}/500
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsApproveOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-[14px] font-medium text-[#0F172A] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleApproveConfirm}
                className="px-5 py-2 rounded-xl bg-[#FF5E14] hover:bg-[#E04F0E] text-white text-[14px] font-medium transition-colors cursor-pointer shadow-xs"
              >
                Xác nhận phê duyệt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIALOG NHẬP LÝ DO TỪ CHỐI */}
      {isRejectOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-[18px] font-semibold text-[#0F172A]">
                Từ chối hồ sơ xác minh
              </h3>
              <p className="text-[14px] text-[#64748B] mt-1 leading-relaxed">
                Vui lòng nhập lý do từ chối hồ sơ của thợ{" "}
                <strong className="text-[#0F172A]">
                  {kyc.workerProfile.user.fullName}
                </strong>
                . Lý do này là bắt buộc.
              </p>
            </div>

            <div>
              <textarea
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectError) setRejectError("");
                }}
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

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsRejectOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-[14px] font-medium text-[#0F172A] hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[14px] font-medium transition-colors cursor-pointer shadow-xs"
              >
                Xác nhận từ chối
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
            className="relative max-w-4xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden p-2 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between px-3 py-2 text-white border-b border-slate-800">
              <span className="text-[14px] font-medium">
                {previewImage.title}
              </span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
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

export default KycDetailModal;
