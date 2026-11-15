"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Check,
  FileImage,
  Loader2,
  MapPin,
  UserRound,
  XCircle,
  X,
  BriefcaseBusiness,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useReviewWorkerApplication,
  useWorkerApplicationDetail,
} from "../hooks/use-worker-applications";
import type {
  ReviewWorkerApplicationBody,
  WorkerApplicationStatus,
} from "../types/type";

export type WorkerApplicationDetailProps = {
  id: string | null;
  onClose: () => void;
};

type ReviewMode = "approve" | "reject" | null;

const statusLabels: Record<WorkerApplicationStatus, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
};
const statusStyles: Record<WorkerApplicationStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200/80 bg-slate-50/40 px-3.5 py-3 text-[14px]">
      <span className="text-[13px] text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-left font-medium text-slate-800">
        {value || "—"}
      </span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details
      open
      className="group rounded-xl border border-slate-200/80 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[15px] font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-3.5">
        {children}
      </div>
    </details>
  );
}

function DetailContent({ id, onClose }: { id: string; onClose: () => void }) {
  const [reviewMode, setReviewMode] = useState<ReviewMode>(null);
  const [reason, setReason] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const {
    data: application,
    isLoading,
    isError,
    isFetching,
    error,
    refetch,
  } = useWorkerApplicationDetail(id);
  const reviewMutation = useReviewWorkerApplication();
  const isPending = reviewMutation.isPending;
  const canReview = application?.status === "pending" && !isFetching;

  const closeReview = () => {
    if (isPending) return;
    setReviewMode(null);
    setReason("");
    setReviewError("");
  };

  async function handleReview() {
    if (!application || !reviewMode || isPending || !canReview) return;
    const trimmedReason = reason.trim();
    if (reviewMode === "reject" && !trimmedReason) {
      setReviewError("Vui lòng nhập lý do từ chối.");
      return;
    }
    const expectedVersion = application.version;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      setReviewError(
        "Không lấy được phiên bản hồ sơ. Vui lòng tải lại hồ sơ trước khi xét duyệt.",
      );
      return;
    }
    const body: ReviewWorkerApplicationBody =
      reviewMode === "approve"
        ? {
            decision: "approved",
            expectedVersion,
            ...(trimmedReason ? { reason: trimmedReason } : {}),
          }
        : { decision: "rejected", reason: trimmedReason, expectedVersion };
    try {
      setReviewError("");
      await reviewMutation.mutateAsync({ id, body });
      toast.success(
        reviewMode === "approve"
          ? "Phê duyệt hồ sơ thành công!"
          : "Từ chối hồ sơ thành công!",
      );
      setReviewMode(null);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Không thể xét duyệt hồ sơ.";
      setReviewError(message);
      toast.error("Xét duyệt hồ sơ thất bại", { description: message });
    }
  }

  const workerName = application?.worker.fullName || "Thợ";
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !isPending && !preview) onClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex max-h-[92dvh] w-[calc(100vw-32px)] max-w-[760px] flex-col gap-0 overflow-hidden rounded-2xl border border-slate-100 p-0 shadow-2xl sm:max-w-[760px]"
        >
          <DialogHeader className="flex shrink-0 flex-row items-center justify-between border-b border-slate-100 px-5 py-4 text-left sm:px-6">
            <DialogTitle className="text-[19px] font-bold tracking-tight text-slate-900">
              Chi tiết đăng ký làm việc
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              aria-label="Đóng"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            >
              <X className="size-5" />
            </button>
            <DialogDescription className="sr-only">
              Thông tin đăng ký dịch vụ và xét duyệt hồ sơ thợ.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-6">
            {isLoading ? (
              <div
                className="space-y-4"
                role="status"
                aria-label="Đang tải hồ sơ"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-16 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </div>
                {[1, 2, 3, 4].map((item) => (
                  <Skeleton key={item} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : isError ? (
              <div
                className="flex flex-col items-center gap-3 py-12 text-center"
                role="alert"
              >
                <AlertCircle className="size-8 text-rose-500" />
                <p className="text-sm text-rose-600">
                  {error instanceof Error
                    ? error.message
                    : "Không thể tải hồ sơ."}
                </p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  Thử lại
                </button>
              </div>
            ) : application ? (
              <>
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-600">
                      {application.worker.avatarUrl &&
                      !failedImages[application.worker.avatarUrl] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={application.worker.avatarUrl}
                          alt={workerName}
                          className="size-full object-cover"
                          onError={() =>
                            setFailedImages((prev) => ({
                              ...prev,
                              [application.worker.avatarUrl!]: true,
                            }))
                          }
                        />
                      ) : (
                        <UserRound className="size-7" />
                      )}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-[18px] font-bold text-slate-900">
                        {workerName}
                      </h3>
                      <div className="flex items-center gap-1.5 text-[13px] text-slate-500">
                        <span className="font-mono" title={application.id}>
                          Mã: {application.id.slice(0, 8)}…
                          {application.id.slice(-4)}
                        </span>
                        <button
                          type="button"
                          aria-label="Sao chép mã hồ sơ"
                          onClick={() => {
                            void navigator.clipboard
                              ?.writeText(application.id)
                              .then(() => {
                                setCopied(true);
                              });
                          }}
                          className="rounded p-1 hover:bg-slate-100"
                        >
                          {copied ? (
                            <Check className="size-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-[210px] space-y-2 rounded-xl border border-orange-100 bg-orange-50/70 p-3 text-[14px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Trạng thái</span>
                      <span
                        className={`rounded-md px-2.5 py-1 font-semibold ${statusStyles[application.status]}`}
                      >
                        {statusLabels[application.status]}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Ngày đăng ký</span>
                      <span className="font-medium text-slate-700">
                        {formatDate(application.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-slate-500">Cập nhật</span>
                      <span className="font-medium text-slate-700">
                        {formatDate(application.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h4 className="text-[15px] font-semibold text-slate-900">
                    Thông tin đăng ký
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <InfoRow
                      label="Mã hồ sơ thợ"
                      value={
                        <span className="break-all font-mono text-[12px]">
                          {application.workerProfileId}
                        </span>
                      }
                    />
                    <InfoRow
                      label="Trạng thái tài khoản"
                      value={
                        application.worker.status === "active"
                          ? "Đang hoạt động"
                          : application.worker.status
                      }
                    />
                    <InfoRow
                      label="Phiên bản hồ sơ"
                      value={application.version}
                    />
                  </div>
                </div>

                <Section
                  title={`Dịch vụ đăng ký (${application.services.length})`}
                >
                  {application.services.length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {application.services.map((service, index) => (
                        <div
                          key={`${service.serviceId}-${index}`}
                          className="rounded-xl border border-slate-200 bg-slate-50/40 p-3.5"
                        >
                          <div className="flex items-center gap-2">
                            <BriefcaseBusiness className="size-4 text-[#FF5E14]" />
                            <h5 className="text-[15px] font-semibold text-slate-900">
                              {service.title}
                            </h5>
                          </div>
                          <p className="mt-2 text-[14px] leading-relaxed text-slate-600">
                            {service.description || "Chưa có mô tả."}
                          </p>
                          <p className="mt-2 text-[13px] text-slate-500">
                            Kinh nghiệm:{" "}
                            <span className="font-medium text-slate-800">
                              {service.experienceYears} năm
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-slate-500">
                      Chưa có dịch vụ.
                    </p>
                  )}
                </Section>

                <Section title="Khu vực làm việc">
                  {application.serviceArea ? (
                    <div className="space-y-2.5">
                      <div className="flex items-start gap-2 text-[14px] text-slate-700">
                        <MapPin className="mt-0.5 size-4 shrink-0 text-[#FF5E14]" />
                        <span>{application.serviceArea.address}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <InfoRow
                          label="Bán kính phục vụ"
                          value={`${application.serviceArea.radiusKm} km`}
                        />
                        <InfoRow
                          label="Tọa độ"
                          value={`${application.serviceArea.latitude}, ${application.serviceArea.longitude}`}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px] text-slate-500">
                      Chưa có thông tin khu vực.
                    </p>
                  )}
                </Section>

                <div className="space-y-3">
                  <h4 className="text-[15px] font-semibold text-slate-900">
                    Minh chứng
                  </h4>
                  {!application.evidenceFiles?.length ? (
                    <p className="text-[13px] text-slate-500">
                      Chưa có minh chứng.
                    </p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {application.evidenceFiles.map((file, index) => {
                        const key = `${file.url}-${index}`;
                        const kind = file.fileType?.toLowerCase();
                        return kind === "image" ? (
                          <button
                            key={key}
                            type="button"
                            onClick={() =>
                              setPreview({ url: file.url, name: file.name })
                            }
                            className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition-colors hover:border-orange-300"
                          >
                            <div className="flex aspect-[4/3] items-center justify-center bg-slate-100">
                              {failedImages[file.url] ? (
                                <span className="text-[13px] text-slate-500">
                                  Không thể tải ảnh
                                </span>
                              ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={file.url}
                                  alt={file.name}
                                  className="size-full object-contain"
                                  onError={() =>
                                    setFailedImages((prev) => ({
                                      ...prev,
                                      [file.url]: true,
                                    }))
                                  }
                                />
                              )}
                            </div>
                            <span className="block truncate px-3 py-2 text-[14px] text-slate-600">
                              {file.name}
                            </span>
                          </button>
                        ) : kind === "video" ? (
                          <div
                            key={key}
                            className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                          >
                            <video
                              src={file.url}
                              controls
                              preload="metadata"
                              className="aspect-video w-full bg-black"
                            />
                            <p className="truncate px-3 py-2 text-[14px] text-slate-600">
                              {file.name}
                            </p>
                          </div>
                        ) : (
                          <a
                            key={key}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-[14px] text-[#FF5E14] hover:bg-orange-50"
                          >
                            <FileImage className="size-4 shrink-0" />
                            <span className="break-all">{file.name}</span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                </div>

                {application.status !== "pending" && (
                  <Section title="Kết quả xét duyệt">
                    <div className="flex items-center gap-2 text-[14px] font-medium">
                      {application.status === "approved" ? (
                        <CheckCircle2 className="size-4 text-emerald-600" />
                      ) : (
                        <XCircle className="size-4 text-rose-600" />
                      )}
                      <span
                        className={
                          application.status === "approved"
                            ? "text-emerald-700"
                            : "text-rose-700"
                        }
                      >
                        {statusLabels[application.status]}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <InfoRow
                        label="Ngày xét duyệt"
                        value={formatDate(application.reviewedAt)}
                      />
                      <InfoRow
                        label="Người xét duyệt"
                        value={application.reviewer?.fullName || "—"}
                      />
                      {application.status === "rejected" && (
                        <InfoRow
                          label="Lý do từ chối"
                          value={application.rejectionReason || "—"}
                        />
                      )}
                    </div>
                  </Section>
                )}

                {application.status === "pending" && reviewMode && (
                  <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-sm font-semibold text-slate-900">
                      {reviewMode === "approve"
                        ? "Xác nhận phê duyệt"
                        : "Xác nhận từ chối"}
                    </h4>
                    {reviewMode === "approve" && (
                      <p className="text-sm text-slate-600">
                        Bạn có chắc chắn muốn phê duyệt hồ sơ này?
                      </p>
                    )}
                    <div className="space-y-2">
                      <label
                        htmlFor="review-reason"
                        className="block text-sm text-slate-800"
                      >
                        {reviewMode === "reject"
                          ? "Lý do từ chối *"
                          : "Lý do phê duyệt (không bắt buộc)"}
                      </label>
                      <textarea
                        id="review-reason"
                        rows={4}
                        value={reason}
                        maxLength={1000}
                        disabled={isPending}
                        onChange={(event) => {
                          setReason(event.target.value);
                          setReviewError("");
                        }}
                        placeholder={
                          reviewMode === "reject"
                            ? "Nhập lý do từ chối..."
                            : "Nhập ghi chú phê duyệt (nếu có)..."
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-[#FF5E14]"
                      />
                    </div>
                    {reviewError && (
                      <p role="alert" className="text-sm text-rose-600">
                        {reviewError}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={closeReview}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Quay lại
                      </button>
                      <button
                        type="button"
                        disabled={
                          isPending ||
                          !canReview ||
                          (reviewMode === "reject" && !reason.trim())
                        }
                        onClick={() => void handleReview()}
                        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${reviewMode === "reject" ? "bg-rose-600 hover:bg-rose-700" : "bg-[#FF5E14] hover:bg-[#E6530F]"}`}
                      >
                        {isPending && (
                          <Loader2 className="size-4 animate-spin" />
                        )}
                        {isPending
                          ? "Đang xử lý..."
                          : reviewMode === "approve"
                            ? "Xác nhận duyệt"
                            : "Xác nhận từ chối"}
                      </button>
                    </div>
                  </section>
                )}
              </>
            ) : (
              <p className="py-10 text-center text-sm text-slate-500">
                Không tìm thấy hồ sơ.
              </p>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 sm:px-6">
            {canReview && !reviewMode ? (
              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setReason("");
                    setReviewError("");
                    setReviewMode("reject");
                  }}
                  className="inline-flex h-9 min-w-[96px] items-center justify-center rounded-lg border border-slate-200 px-3.5 text-[14px] font-medium text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                >
                  Từ chối
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReason("");
                    setReviewError("");
                    setReviewMode("approve");
                  }}
                  className="inline-flex h-9 min-w-[108px] items-center justify-center rounded-lg bg-[#FF5E14] px-3.5 text-[14px] font-medium text-white hover:bg-[#E6530F]"
                >
                  Phê duyệt
                </button>
              </div>
            ) : reviewMode ? null : application && !isLoading && !isError ? (
              <p className="text-center text-[13px] italic text-slate-500">
                {isFetching
                  ? "Đang kiểm tra hồ sơ..."
                  : application.status === "approved"
                    ? "Hồ sơ đã được phê duyệt"
                    : application.status === "rejected"
                      ? "Hồ sơ đã bị từ chối"
                      : "Không thể xét duyệt hồ sơ lúc này"}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="max-h-[95dvh] w-[calc(100vw-32px)] max-w-4xl overflow-hidden rounded-2xl bg-slate-900 p-3 sm:max-w-4xl"
        >
          <DialogHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-700 pb-2 text-left">
            <DialogTitle className="min-w-0 truncate text-[14px] font-medium text-white">
              {preview?.name || "Minh chứng"}
            </DialogTitle>
            <button
              type="button"
              aria-label="Đóng ảnh"
              onClick={() => setPreview(null)}
              className="rounded-lg p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <X className="size-5" />
            </button>
            <DialogDescription className="sr-only">
              Xem hình ảnh minh chứng.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.url}
              alt={preview.name}
              className="max-h-[80dvh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function WorkerApplicationDetail({
  id,
  onClose,
}: WorkerApplicationDetailProps) {
  if (!id) return null;
  return <DetailContent key={id} id={id} onClose={onClose} />;
}
