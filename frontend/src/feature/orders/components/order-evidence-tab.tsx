import { FileImage, ImageIcon, Info, Play, Video, ZoomIn } from "lucide-react";

import type { OrderEvidence } from "../types";

interface Props {
  evidences: OrderEvidence[];
  onPreview: (index: number) => void;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function OrderEvidenceTab({ evidences, onPreview }: Props) {
  const evidenceCount = evidences.length;

  if (evidenceCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-10 text-center sm:px-6 sm:py-14">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
          <FileImage size={24} strokeWidth={1.5} className="text-slate-400" />
        </div>

        <div>
          <p className="text-[13px] font-medium text-slate-700">
            Chưa có bằng chứng
          </p>

          <p className="mt-1 text-[12px] text-slate-400">
            Hình ảnh và video bằng chứng sẽ hiển thị tại đây.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-slate-900">
            Bằng chứng đơn hàng
          </h3>

          <p className="mt-1 text-[12px] text-slate-500">
            Hình ảnh và video ghi nhận quá trình thực hiện
          </p>
        </div>

        <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium tabular-nums text-slate-600">
          {evidenceCount} bằng chứng
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 min-[480px]:grid-cols-2 sm:pt-5">
        {evidences.map((evidence, index) => {
          const isVideo = evidence.mediaType === "video";
          const title = `Bằng chứng ${String(index + 1).padStart(2, "0")}`;

          return (
            <figure
              key={evidence.id}
              className="group min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white transition-[border-color,box-shadow] duration-200 hover:border-orange-200 hover:shadow-sm"
            >
              <button
                type="button"
                onClick={() => onPreview(index)}
                aria-label={`Xem chi tiết ${title}`}
                className="relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-500"
              >
                {isVideo ? (
                  <video
                    src={evidence.mediaUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={evidence.mediaUrl}
                    alt={evidence.description || title}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                  />
                )}

                <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-md bg-slate-950/65 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-sm sm:left-3 sm:top-3">
                  {isVideo ? (
                    <>
                      <Video size={12} />
                      Video
                    </>
                  ) : (
                    <>
                      <ImageIcon size={12} />
                      Hình ảnh
                    </>
                  )}
                </span>

                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 transition-colors duration-200 group-hover:bg-slate-950/20">
                  {isVideo ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm transition-transform duration-200 group-hover:scale-110">
                      <Play size={20} fill="currentColor" className="ml-0.5" />
                    </span>
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-900 opacity-0 shadow-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
                      <ZoomIn size={19} />
                    </span>
                  )}
                </span>
              </button>

              <figcaption className="min-w-0 space-y-1.5 px-3 py-3 sm:px-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[13px] font-semibold text-slate-900">
                    {title}
                  </h4>

                  {isVideo ? (
                    <Video size={15} className="shrink-0 text-slate-400" />
                  ) : (
                    <ImageIcon size={15} className="shrink-0 text-slate-400" />
                  )}
                </div>

                <p
                  title={evidence.description || undefined}
                  className="truncate text-[12px] text-slate-600"
                >
                  {evidence.description?.trim() || "Không có mô tả"}
                </p>

                <p className="text-[11px] tabular-nums text-slate-400">
                  {formatDateTime(evidence.createdAt)}
                </p>
              </figcaption>
            </figure>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2 text-[12px] text-slate-400">
        <Info size={14} className="mt-0.5 shrink-0" />
        <p>Nhấn vào hình ảnh hoặc video để xem chi tiết.</p>
      </div>
    </div>
  );
}
