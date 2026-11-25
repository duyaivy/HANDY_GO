"use client";

import { useState } from "react";
import { Star, Trophy, UserRound } from "lucide-react";
import type { TopWorker } from "../types/dashboard";

const integer = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

function WorkerAvatar({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-500">
      {url && !failed ? (
        // URL ảnh do backend cung cấp; fallback về icon nếu tải lỗi.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <UserRound className="size-5" aria-hidden="true" />
      )}
    </div>
  );
}

export function DashboardTopWorkers({
  data,
  onViewAll,
}: {
  data: TopWorker[];
  onViewAll?: () => void;
}) {
  const workers = data.slice(0, 5);
  return (
    <section className="min-w-0 rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-[0_3px_16px_rgba(15,23,42,0.035)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-[#FF5E14]">
            <Trophy className="size-5" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="text-base font-bold tracking-tight text-slate-950">
              Top thợ hoạt động tốt
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Xếp hạng theo số đơn hoàn thành
            </p>
          </div>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="shrink-0 text-xs font-semibold text-[#F36B21] hover:underline"
          >
            Xem tất cả →
          </button>
        )}
      </div>
      <div className="mt-5 grid grid-cols-[32px_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-slate-100 pb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:grid-cols-[42px_minmax(0,1fr)_100px_70px]">
        <span>#</span>
        <span>Thợ dịch vụ</span>
        <span className="text-right">Đơn xong</span>
        <span className="text-right">Đánh giá</span>
      </div>
      <div className="divide-y divide-slate-100">
        {workers.map((worker, index) => (
          <div
            key={worker.workerUserId}
            className="grid grid-cols-[32px_minmax(0,1fr)_auto_auto] items-center gap-2 py-3 sm:grid-cols-[42px_minmax(0,1fr)_100px_70px]"
          >
            <span
              className={`flex size-7 items-center justify-center rounded-lg text-xs font-bold ${index === 0 ? "bg-orange-100 text-[#E65310]" : "bg-slate-100 text-slate-600"}`}
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 items-center gap-2.5">
              <WorkerAvatar
                key={worker.avatarUrl ?? "no-avatar"}
                url={worker.avatarUrl}
              />
              <p
                className="truncate text-xs font-semibold text-slate-900 sm:text-sm"
                title={worker.fullName}
              >
                {worker.fullName || "Chưa cập nhật tên"}
              </p>
            </div>
            <span className="text-right text-xs font-semibold text-slate-800 sm:text-sm">
              {integer(worker.completedOrderCount)}
            </span>
            <span className="flex items-center justify-end gap-1 whitespace-nowrap text-xs font-semibold text-slate-800 sm:text-sm">
              {worker.averageRating === null ? (
                <span className="text-[11px] font-normal text-slate-400">
                  —
                </span>
              ) : (
                <>
                  <Star className="size-3.5 fill-[#FF8A34] text-[#FF8A34]" />
                  {worker.averageRating.toFixed(1)}
                </>
              )}
            </span>
          </div>
        ))}
        {!workers.length && (
          <p className="py-12 text-center text-sm text-slate-400">
            Chưa có dữ liệu thợ trong khoảng thời gian này.
          </p>
        )}
      </div>
    </section>
  );
}
